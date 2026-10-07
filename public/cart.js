/**
 * ARD Suplementos — Carrito de compras
 * ------------------------------------
 * Guarda el carrito en localStorage, muestra un botón flotante + panel
 * lateral, y al finalizar el pedido:
 *   1) lo registra en el backend (POST /api/orders) para que aparezca
 *      en "Pedidos y ventas" y en las Estadísticas del panel admin.
 *   2) abre WhatsApp con un mensaje prellenado con el detalle del pedido.
 *
 * Uso en cada página:
 *   <script src="/cart.js" data-whatsapp="5493834000000" defer></script>
 *
 * Y en cada tarjeta de producto, en vez de (o adem\u00e1s de) el link directo
 * a WhatsApp, llamar:
 *   window.ARDCart.add({ id: p.id, name: p.name, brand: p.brand, price: p.price, image: p.image, flavor: 'Chocolate' })
 *
 * El campo "flavor" es opcional. Si el producto tiene sabores, cada sabor
 * queda como una línea separada del carrito (mismo producto, distinto sabor
 * = distinta línea, cada una con su propia cantidad).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ard_cart_v1';
  var currentScript = document.currentScript;
  var WHATSAPP_NUMBER = (currentScript && currentScript.getAttribute('data-whatsapp')) || '5493834000000';

  // ---------- Estado ----------
  function cargar() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items : [];
    } catch (e) {
      return [];
    }
  }

  function guardar(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {}
  }

  var items = cargar();
  var listeners = [];

  // Cuenta del cliente logueada (o null). El registro/login es obligatorio
  // para finalizar la compra.
  var cuenta = null;
  function refrescarCuenta() {
    return fetch('/api/account/me', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { account: null }; })
      .then(function (d) { cuenta = (d && d.account) || null; return cuenta; })
      .catch(function () { cuenta = null; return null; });
  }
  function urlLoginConRetorno() {
    return '/cuenta.html?redirect=' + encodeURIComponent(location.pathname + location.search);
  }

  // Cotización del carrito: total en efectivo + un plan por cada cantidad
  // de cuotas con tarjeta (cada uno con su recargo).
  var quoteActual = null;
  // Cupón aplicado actualmente (null si ninguno).
  var cuponActual = null; // { code, discountType, discountValue, discountAmount, campaignId, sponsorId, products[] }
  // ---------- Envío / entrega ----------
  // "domicilio" (zona de Catamarca Capital, con precio por zona),
  // "retiro" (punto de retiro, siempre gratis) o
  // "nacional" (interior de Catamarca / resto del país, tarifa plana de siempre).
  var tipoEntrega = 'domicilio';
  var zonasCapital = [];       // [{id, name, price}] — admin → pestaña "Envíos"
  var puntosRetiro = [];       // [{id, name, address, description, schedule}]
  var zonaSeleccionadaId = null;
  var puntoSeleccionadoId = null;
  var envioTarifas = { nacional: 0 }; // tarifa plana de interior/resto del país (sin cambios)
  // Monto a partir del cual el envío a domicilio en Catamarca Capital es
  // gratis. Configurable desde el panel; 120000 es solo el valor por
  // defecto hasta que responda /api/config.
  var ENVIO_GRATIS_MONTO_CAPITAL = 120000;

  function zonaActual() {
    return zonasCapital.filter(function (z) { return z.id === zonaSeleccionadaId; })[0] || null;
  }
  function puntoActual() {
    return puntosRetiro.filter(function (p) { return p.id === puntoSeleccionadoId; })[0] || null;
  }
  function envioEsGratisPorMonto() {
    return tipoEntrega === 'domicilio' && getTotal() >= ENVIO_GRATIS_MONTO_CAPITAL;
  }
  function getEnvio() {
    if (tipoEntrega === 'retiro') return 0;
    if (tipoEntrega === 'domicilio') {
      if (envioEsGratisPorMonto()) return 0;
      var z = zonaActual();
      return z ? Number(z.price) : 0;
    }
    return envioTarifas.nacional || 0; // nacional
  }
  // Texto para el resumen, la revisión final y el mensaje de WhatsApp.
  function labelEntrega() {
    if (tipoEntrega === 'retiro') {
      var p = puntoActual();
      return p ? ('Retiro en ' + p.name) : 'Retiro en punto ARD';
    }
    if (tipoEntrega === 'domicilio') {
      var z = zonaActual();
      return 'Envío a domicilio' + (z ? ' — Zona ' + z.name : '') + ' (Catamarca Capital)';
    }
    return 'Envío al interior de Catamarca / resto del país';
  }
  function labelCuotas(n) {
    if (!n || n < 1) return 'Efectivo o transferencia';
    if (n === 1) return '1 pago con tarjeta';
    return n + ' cuotas con tarjeta';
  }

  // Cada línea del carrito se identifica por producto + sabor (si tiene).
  // Así, dos sabores distintos del mismo producto quedan como líneas
  // separadas en vez de mezclarse en una sola.
  function keyOf(it) {
    return it.id + (it.flavor ? '::' + it.flavor : '');
  }

  function notificar() {
    guardar(items);
    listeners.forEach(function (fn) { try { fn(items); } catch (e) {} });
    render();
  }

  function buscar(key) {
    return items.find(function (it) { return keyOf(it) === key; });
  }

  function add(producto, qty) {
    qty = Math.max(1, Number(qty) || 1);
    var flavor = producto.flavor ? String(producto.flavor).trim() : '';
    var key = producto.id + (flavor ? '::' + flavor : '');
    var existente = buscar(key);
    if (existente) {
      existente.qty += qty;
    } else {
      items.push({
        id: producto.id,
        name: producto.name,
        brand: producto.brand || '',
        flavor: flavor,
        price: Number(producto.price) || 0,
        image: producto.image || '',
        qty: qty
      });
    }
    notificar();
    abrirPanel();
    mostrarToast((producto.name || 'Producto') + ' agregado al carrito');
  }

  function setQty(key, qty) {
    var it = buscar(key);
    if (!it) return;
    qty = Math.floor(Number(qty) || 0);
    if (qty <= 0) { remove(key); return; }
    it.qty = qty;
    notificar();
  }

  function remove(key) {
    items = items.filter(function (it) { return keyOf(it) !== key; });
    notificar();
  }

  function clear() {
    items = [];
    notificar();
  }

  function getItems() { return items.slice(); }

  function getTotal() {
    return items.reduce(function (acc, it) { return acc + (it.price * it.qty); }, 0);
  }

  function getCount() {
    return items.reduce(function (acc, it) { return acc + it.qty; }, 0);
  }

  // ---------- Utilidades ----------
  function formatearPrecio(valor) {
    try {
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor);
    } catch (e) {
      return '$' + valor;
    }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // ---------- Estilos ----------
  var css = ''
    + '.ard-cart-fab{position:fixed;right:20px;bottom:92px;width:58px;height:58px;border-radius:50%;'
    + 'background:#ff5a1f;color:#fff;border:none;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer;'
    + 'display:flex;align-items:center;justify-content:center;z-index:50;transition:transform .15s ease;}'
    + '.ard-cart-fab:hover{transform:scale(1.06);}'
    + '.ard-cart-fab svg{width:26px;height:26px;}'
    + '.ard-cart-badge{position:absolute;top:-4px;right:-4px;background:#0d1b2a;color:#fff;font-size:12px;'
    + 'font-weight:700;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 5px;}'
    + '.ard-cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;opacity:0;pointer-events:none;transition:opacity .2s ease;}'
    + '.ard-cart-overlay.open{opacity:1;pointer-events:auto;}'
    + '.ard-cart-panel{position:fixed;top:0;right:0;bottom:0;width:min(400px,100vw);background:#fff;z-index:10000;'
    + 'display:flex;flex-direction:column;transform:translateX(100%);transition:transform .25s ease;box-shadow:-8px 0 24px rgba(0,0,0,.2);font-family:inherit;}'
    + '.ard-cart-panel.open{transform:translateX(0);}'
    + '.ard-cart-header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #eee;}'
    + '.ard-cart-header h2{margin:0;font-size:18px;color:#0d1b2a;}'
    + '.ard-cart-close{background:none;border:none;cursor:pointer;font-size:22px;line-height:1;color:#5c7091;padding:4px;}'
    + '.ard-cart-body{flex:1;overflow-y:auto;padding:12px 20px;}'
    + '.ard-cart-empty{color:#5c7091;text-align:center;padding:40px 10px;font-size:14px;}'
    + '.ard-cart-item{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #f1f1f1;}'
    + '.ard-cart-item-img{width:56px;height:56px;border-radius:8px;background:#f4f6f8;flex:0 0 auto;overflow:hidden;'
    + 'display:flex;align-items:center;justify-content:center;}'
    + '.ard-cart-item-img img{width:100%;height:100%;object-fit:cover;}'
    + '.ard-cart-item-info{flex:1;min-width:0;}'
    + '.ard-cart-item-name{font-size:14px;font-weight:600;color:#0d1b2a;margin:0 0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.ard-cart-item-brand{font-size:12px;color:#5c7091;margin:0 0 6px;}'
    + '.ard-cart-item-flavor{font-size:12px;color:#e8892a;font-weight:600;margin:0 0 6px;}'
    + '.ard-cart-item-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}'
    + '.ard-cart-qty{display:flex;align-items:center;border:1px solid #ddd;border-radius:8px;overflow:hidden;}'
    + '.ard-cart-qty button{width:26px;height:26px;border:none;background:#f4f6f8;cursor:pointer;font-size:15px;color:#0d1b2a;}'
    + '.ard-cart-qty span{min-width:26px;text-align:center;font-size:13px;font-weight:600;}'
    + '.ard-cart-item-price{font-size:13px;font-weight:700;color:#0d1b2a;white-space:nowrap;}'
    + '.ard-cart-item-remove{background:none;border:none;color:#c0392b;cursor:pointer;font-size:12px;text-decoration:underline;padding:0;margin-top:4px;}'
    + '.ard-cart-footer{border-top:1px solid #eee;padding:16px 20px;}'
    + '.ard-cart-total{display:flex;justify-content:space-between;align-items:center;font-size:16px;font-weight:700;color:#0d1b2a;margin-bottom:12px;}'
    + '.ard-cart-checkout{width:100%;background:#ff5a1f;color:#fff;border:none;border-radius:10px;padding:13px;'
    + 'font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;}'
    + '.ard-cart-checkout:hover{background:#e04d16;}'
    + '.ard-cart-checkout:disabled{opacity:.6;cursor:default;}'
    + '.ard-cart-checkout svg{width:18px;height:18px;stroke:#fff;}'
    + '.ard-cart-clear{width:100%;background:none;border:none;color:#5c7091;font-size:12px;text-align:center;'
    + 'margin-top:8px;cursor:pointer;text-decoration:underline;}'
    + '.ard-envio-gratis-wrap{margin-bottom:14px;}'
    + '.ard-envio-gratis-msg{font-size:12.5px;font-weight:700;color:#0d1b2a;margin-bottom:6px;}'
    + '.ard-envio-gratis-wrap.completo .ard-envio-gratis-msg{color:#219653;}'
    + '.ard-envio-gratis-track{height:8px;background:#eef1f5;border-radius:6px;overflow:hidden;margin-bottom:5px;}'
    + '.ard-envio-gratis-fill{height:100%;width:0;background:linear-gradient(90deg,#ff5a1f,#ff8a3d);border-radius:6px;'
    + 'transition:width .3s ease;}'
    + '.ard-envio-gratis-wrap.completo .ard-envio-gratis-fill{background:#25D366;}'
    + '.ard-envio-gratis-sub{font-size:11px;color:#9aa8bb;}'
    + '.ard-cart-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;'
    + 'display:flex;align-items:flex-start;justify-content:center;padding:16px;'
    + 'overflow-y:auto;-webkit-overflow-scrolling:touch;'
    + 'opacity:0;pointer-events:none;transition:opacity .2s ease;}'
    + '.ard-cart-modal-overlay.open{opacity:1;pointer-events:auto;}'
    + '.ard-cart-modal{background:#fff;border-radius:14px;padding:24px;max-width:380px;width:100%;'
    + 'box-shadow:0 20px 50px rgba(0,0,0,.3);margin:auto;}'
    + '.ard-cart-modal h3{margin:0 0 6px;color:#0d1b2a;font-size:18px;}'
    + '.ard-cart-modal p{margin:0 0 16px;color:#5c7091;font-size:13px;}'
    + '.ard-cart-field{margin-bottom:12px;}'
    + '.ard-cart-field label{display:block;font-size:12px;font-weight:600;color:#0d1b2a;margin-bottom:4px;}'
    + '.ard-cart-field input,.ard-cart-field textarea{width:100%;box-sizing:border-box;padding:10px 12px;'
    + 'border:1px solid #ddd;border-radius:8px;font-size:14px;font-family:inherit;}'
    + '.ard-cart-field textarea{resize:vertical;min-height:60px;}'
    + '.ard-cart-modos{display:flex;flex-direction:column;gap:8px;margin:4px 0 14px;}'
    + '.ard-cart-modos-titulo{font-size:12px;font-weight:700;color:#0d1b2a;margin-bottom:2px;}'
    + '.ard-cart-modo{display:flex;align-items:flex-start;gap:10px;border:1px solid #ddd;border-radius:10px;'
    + 'padding:10px 12px;cursor:pointer;transition:border-color .15s ease,background .15s ease;}'
    + '.ard-cart-modo:hover{border-color:#009ee3;}'
    + '.ard-cart-modo.sel{border-color:#009ee3;background:#f0f9fe;}'
    + '.ard-cart-modo input{margin-top:2px;}'
    + '.ard-cart-modo-txt{flex:1;min-width:0;}'
    + '.ard-cart-modo-nombre{font-size:13px;font-weight:600;color:#0d1b2a;}'
    + '.ard-cart-modo-detalle{font-size:11.5px;color:#5c7091;margin-top:1px;}'
    + '.ard-cart-modo-precio{font-size:14px;font-weight:800;color:#0d1b2a;white-space:nowrap;}'
    + '.ard-cart-modal-actions{display:flex;flex-direction:column;gap:10px;margin-top:16px;}'
    + '.ard-cart-modal-actions button{border-radius:8px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;border:none;'
    + 'display:flex;align-items:center;justify-content:center;gap:8px;}'
    + '.ard-cart-modal-actions button svg{width:17px;height:17px;}'
    + '.ard-cart-pay-mp{background:#009ee3;color:#fff;}'
    + '.ard-cart-modal-confirm{background:#25D366;color:#fff;}'
    + '.ard-cart-pay-mp:disabled,.ard-cart-modal-confirm:disabled{opacity:.6;cursor:default;}'
    + '.ard-cart-modal-cancel{background:none;color:#5c7091;font-weight:600;padding:4px;text-decoration:underline;}'
    + '.ard-cart-error{color:#c0392b;font-size:12px;margin-top:-4px;margin-bottom:10px;display:none;}'
    + '.ard-cart-error.visible{display:block;}'
    + '.ard-cart-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%) translateY(20px);'
    + 'background:#0d1b2a;color:#fff;padding:10px 18px;border-radius:30px;font-size:13px;z-index:10002;'
    + 'opacity:0;pointer-events:none;transition:all .25s ease;white-space:nowrap;}'
    + '.ard-cart-toast.visible{opacity:1;transform:translateX(-50%) translateY(0);}'
    + '.ard-add-to-cart{margin-top:8px;display:flex;align-items:center;justify-content:center;gap:7px;width:100%;'
    + 'font-family:inherit;font-weight:600;font-size:12.5px;letter-spacing:.02em;text-transform:uppercase;'
    + 'background:#ff5a1f;color:#fff;border:none;border-radius:8px;padding:9px 14px;cursor:pointer;transition:background .16s ease;}'
    + '.ard-add-to-cart:hover{background:#e04d16;}'
    + '.ard-add-to-cart svg{width:14px;height:14px;stroke:#fff;flex:0 0 auto;}'
    + '.ard-add-to-cart:disabled{opacity:.5;cursor:not-allowed;}'
    + '.ard-cupon-row{display:flex;gap:8px;}'
    + '.ard-cupon-row input{flex:1;}'
    + '.ard-cupon-btn{background:#0d1b2a;color:#fff;border:none;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;}'
    + '.ard-cupon-btn:disabled{opacity:.5;cursor:default;}'
    + '.ard-cupon-info{font-size:12px;margin-top:6px;min-height:1em;}'
    + '.ard-cupon-info.ok{color:#219653;}'
    + '.ard-cupon-info.err{color:#c0392b;}'
    + '.ard-descuento-box{background:#f0f9f0;border:1px solid #b7ebc0;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px;}'
    + '.ard-descuento-row{display:flex;justify-content:space-between;color:#5c7091;margin-bottom:4px;}'
    + '.ard-descuento-total{display:flex;justify-content:space-between;font-weight:700;color:#0d1b2a;font-size:14px;margin-top:4px;}'
    + '@media (max-width:480px){.ard-cart-panel{width:100vw;}}'
    + '.ard-envio-resumen{background:#f4f6f8;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px;}'
    + '.ard-envio-row{display:flex;justify-content:space-between;color:#5c7091;margin-bottom:3px;}'
    + '.ard-envio-grand{display:flex;justify-content:space-between;font-weight:700;color:#0d1b2a;font-size:14px;margin-top:6px;border-top:1px solid #dde3ec;padding-top:6px;}'
    + '.ard-entrega-detalle{margin:2px 0 14px;}'
    // ---- Checkout en 3 pasos ----
    + '.ard-checkout-modal{position:relative;max-width:480px;padding-top:40px;}'
    + '.ard-checkout-modal .ard-cart-close{position:absolute;top:12px;right:14px;z-index:1;}'
    + '.ard-checkout-progress{display:flex;align-items:flex-start;margin:-16px -24px 18px;padding:0 16px 14px;'
    + 'background:#f8f9fb;border-bottom:1px solid #eef1f5;}'
    + '.ard-checkout-step{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0;}'
    + '.ard-checkout-step.clickable{cursor:pointer;}'
    + '.ard-checkout-step-num{width:24px;height:24px;border-radius:50%;background:#dde3ec;color:#5c7091;font-size:12px;'
    + 'font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}'
    + '.ard-checkout-step.activo .ard-checkout-step-num{background:#ff5a1f;color:#fff;}'
    + '.ard-checkout-step.hecho .ard-checkout-step-num{background:#25D366;color:#fff;}'
    + '.ard-checkout-step-label{font-size:10px;font-weight:600;color:#9aa8bb;text-align:center;line-height:1.2;max-width:76px;}'
    + '.ard-checkout-step.activo .ard-checkout-step-label{color:#0d1b2a;}'
    + '.ard-checkout-step-sep{flex:0 1 32px;height:2px;background:#dde3ec;margin:11px -2px 0;}'
    + '.ard-checkout-step-sep.hecho{background:#25D366;}'
    + '.ard-checkout-paso h3{margin:0 0 14px;}'
    + '.ard-checkout-subtotal-row{display:flex;justify-content:space-between;font-weight:700;color:#0d1b2a;'
    + 'font-size:15px;padding:10px 0 2px;border-top:1px solid #eee;margin-top:4px;}'
    + '.ard-checkout-resumen-toggle{width:100%;background:#f4f6f8;border:1px solid #eee;border-radius:8px;'
    + 'padding:10px 12px;font-size:12.5px;font-weight:600;color:#0d1b2a;text-align:left;cursor:pointer;'
    + 'margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;}'
    + '.ard-checkout-resumen-colapsable{margin:0 0 14px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;'
    + 'padding:8px 12px 10px;background:#fbfbfc;}'
    + '.ard-checkout-resumen-item{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#5c7091;padding:3px 0;}'
    + '.ard-revision-section{margin-bottom:14px;}'
    + '.ard-revision-titulo{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#9aa8bb;margin-bottom:6px;}'
    + '.ard-revision-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:#0d1b2a;padding:4px 0;}'
    + '.ard-revision-total{display:flex;justify-content:space-between;font-size:17px;font-weight:800;color:#0d1b2a;'
    + 'padding-top:10px;border-top:2px solid #0d1b2a;margin-top:6px;}'
    + '@media (max-width:480px){.ard-checkout-step-label{display:none;}'
    + '.ard-checkout-step.activo .ard-checkout-step-label{display:block;}}'
    // ---- Checkout en PC: modal más ancho + 2 columnas en "Entrega y pago" ----
    + '@media (min-width:860px){'
    + '.ard-checkout-modal{max-width:880px;}'
    + '.ard-checkout-progress{padding:0 28px 14px;}'
    + '.ard-checkout-paso2-layout{display:flex;align-items:flex-start;gap:36px;}'
    + '.ard-checkout-paso2-form-col{order:1;flex:1 1 auto;min-width:0;}'
    + '.ard-checkout-paso2-resumen-col{order:2;flex:0 0 300px;}'
    + '.ard-checkout-modal #ard-checkout-resumen-toggle{display:none;}'
    + '.ard-checkout-modal #ard-checkout-resumen-colapsable{display:block!important;border-radius:10px;'
    + 'padding:16px;position:sticky;top:0;}'
    + '.ard-checkout-modal .ard-cart-item-img{width:68px;height:68px;}'
    + '.ard-checkout-modal .ard-cart-modo{padding:13px 16px;}'
    + '.ard-checkout-modal .ard-cart-modo-nombre{font-size:14px;}'
    + '.ard-checkout-modal .ard-cart-modo-detalle{font-size:12.5px;}'
    + '.ard-checkout-modal .ard-revision-row,.ard-checkout-modal .ard-checkout-resumen-item{font-size:14px;}'
    + '}';

  var styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  // ---------- Íconos ----------
  var ICON_CART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
  var ICON_WHATSAPP = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.4 1.26 4.83L2 22l5.42-1.42a9.85 9.85 0 0 0 4.62 1.17h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.13-2.9-7C17.17 3.03 14.7 2 12.04 2zm0 18.13a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.11.81.83-3.03-.2-.31a8.2 8.2 0 0 1-1.26-4.37c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.26 8.21z"/></svg>';
  var ICON_CARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';

  // ---------- DOM ----------
  var fab = document.createElement('button');
  fab.className = 'ard-cart-fab';
  fab.setAttribute('aria-label', 'Ver carrito');
  fab.innerHTML = ICON_CART + '<span class="ard-cart-badge" id="ard-cart-badge">0</span>';
  fab.addEventListener('click', function () { togglePanel(); });

  var overlay = document.createElement('div');
  overlay.className = 'ard-cart-overlay';
  overlay.addEventListener('click', cerrarPanel);

  var panel = document.createElement('aside');
  panel.className = 'ard-cart-panel';
  panel.innerHTML =
    '<div class="ard-cart-header">' +
      '<h2>Tu carrito</h2>' +
      '<button class="ard-cart-close" aria-label="Cerrar">&times;</button>' +
    '</div>' +
    '<div class="ard-cart-body" id="ard-cart-body"></div>' +
    '<div class="ard-cart-footer">' +
      '<div id="ard-envio-gratis-barra" class="ard-envio-gratis-wrap" style="display:none;">' +
        '<div class="ard-envio-gratis-msg" id="ard-envio-gratis-msg"></div>' +
        '<div class="ard-envio-gratis-track"><div class="ard-envio-gratis-fill" id="ard-envio-gratis-fill" style="width:0%"></div></div>' +
        '<div class="ard-envio-gratis-sub" id="ard-envio-gratis-sub">Envío gratis en Catamarca Capital desde ' + formatearPrecio(ENVIO_GRATIS_MONTO_CAPITAL) + '</div>' +
      '</div>' +
      '<div class="ard-cart-total"><span>Total</span><span id="ard-cart-total">$0</span></div>' +
      '<button class="ard-cart-checkout" id="ard-cart-checkout">' + ICON_CART + ' Finalizar compra</button>' +
      '<button class="ard-cart-clear" id="ard-cart-clear">Vaciar carrito</button>' +
    '</div>';
  panel.querySelector('.ard-cart-close').addEventListener('click', cerrarPanel);
  panel.querySelector('#ard-cart-checkout').addEventListener('click', abrirModalCheckout);
  panel.querySelector('#ard-cart-clear').addEventListener('click', function () {
    if (items.length && confirm('¿Vaciar el carrito?')) clear();
  });

  var modalOverlay = document.createElement('div');
  modalOverlay.className = 'ard-cart-modal-overlay';
  modalOverlay.innerHTML =
    '<div class="ard-cart-modal ard-checkout-modal">' +
      '<button type="button" class="ard-cart-close" id="ard-cart-modal-cancel" aria-label="Cerrar">&times;</button>' +
      '<div id="ard-cart-login-gate" style="display:none;">' +
        '<h3>Necesitás una cuenta</h3>' +
        '<p>Para finalizar la compra tenés que iniciar sesión o crear una cuenta. Así podés seguir tus pedidos y tus compras quedan protegidas.</p>' +
        '<div class="ard-cart-modal-actions">' +
          '<a class="ard-cart-pay-mp" id="ard-cart-ir-login" href="#" style="text-align:center;text-decoration:none;">Iniciar sesión / Crear cuenta</a>' +
          '<button class="ard-cart-modal-cancel" id="ard-cart-login-cancel" type="button">Ahora no</button>' +
        '</div>' +
      '</div>' +
      '<div id="ard-checkout-wizard">' +
        '<div class="ard-checkout-progress" id="ard-checkout-progress">' +
          '<div class="ard-checkout-step" data-step="1"><span class="ard-checkout-step-num">1</span><span class="ard-checkout-step-label">Carrito</span></div>' +
          '<div class="ard-checkout-step-sep" data-sep="1"></div>' +
          '<div class="ard-checkout-step" data-step="2"><span class="ard-checkout-step-num">2</span><span class="ard-checkout-step-label">Entrega y pago</span></div>' +
          '<div class="ard-checkout-step-sep" data-sep="2"></div>' +
          '<div class="ard-checkout-step" data-step="3"><span class="ard-checkout-step-num">3</span><span class="ard-checkout-step-label">Revisión</span></div>' +
        '</div>' +

        '<div id="ard-checkout-paso-1" class="ard-checkout-paso">' +
          '<h3>Tu carrito</h3>' +
          '<div id="ard-checkout-items"></div>' +
          '<div class="ard-cart-field">' +
            '<label for="ard-cart-cupon">Cupón de descuento (opcional)</label>' +
            '<div class="ard-cupon-row">' +
              '<input type="text" id="ard-cart-cupon" placeholder="Ej: JUAN10" autocomplete="off">' +
              '<button type="button" id="ard-cart-cupon-btn" class="ard-cupon-btn">Aplicar</button>' +
            '</div>' +
            '<div id="ard-cart-cupon-info" class="ard-cupon-info"></div>' +
          '</div>' +
          '<div id="ard-cart-descuento-box" class="ard-descuento-box" style="display:none;"></div>' +
          '<div class="ard-checkout-subtotal-row"><span>Subtotal</span><span id="ard-checkout-subtotal">$0</span></div>' +
          '<div class="ard-cart-modal-actions">' +
            '<button class="ard-cart-pay-mp" id="ard-checkout-paso1-continuar" type="button">Continuar</button>' +
          '</div>' +
        '</div>' +

        '<div id="ard-checkout-paso-2" class="ard-checkout-paso" style="display:none;">' +
          '<h3>Entrega y pago</h3>' +
          '<div class="ard-checkout-paso2-layout">' +
            '<div class="ard-checkout-paso2-resumen-col">' +
              '<button type="button" id="ard-checkout-resumen-toggle" class="ard-checkout-resumen-toggle">' +
                '<span id="ard-checkout-resumen-toggle-txt">Ver resumen del pedido</span><span id="ard-checkout-resumen-toggle-icono">▾</span>' +
              '</button>' +
              '<div id="ard-checkout-resumen-colapsable" class="ard-checkout-resumen-colapsable" style="display:none;"></div>' +
            '</div>' +
            '<div class="ard-checkout-paso2-form-col">' +
              '<p id="ard-cart-como">Completá tus datos y elegí cómo querés pagar.</p>' +
              '<div class="ard-cart-field">' +
                '<label for="ard-cart-nombre">Nombre</label>' +
                '<input type="text" id="ard-cart-nombre" autocomplete="name" placeholder="Tu nombre">' +
              '</div>' +
              '<div class="ard-cart-field">' +
                '<label for="ard-cart-telefono">Teléfono</label>' +
                '<input type="tel" id="ard-cart-telefono" autocomplete="tel" placeholder="Ej: 3834 123456">' +
              '</div>' +
              '<div class="ard-cart-field">' +
                '<label for="ard-cart-notas">Notas (opcional)</label>' +
                '<textarea id="ard-cart-notas" placeholder="Alguna aclaración sobre tu pedido…"></textarea>' +
              '</div>' +
              '<div class="ard-cart-field">' +
                '<div class="ard-cart-modos-titulo" style="margin-bottom:6px;">¿Cómo querés recibir tu pedido?</div>' +
                '<div id="ard-entrega-lista"></div>' +
              '</div>' +
              '<div id="ard-entrega-detalle-domicilio" class="ard-entrega-detalle">' +
                '<div class="ard-cart-field">' +
                  '<label for="ard-cart-zona">Tu zona en Catamarca Capital</label>' +
                  '<select id="ard-cart-zona"></select>' +
                '</div>' +
                '<div class="ard-cart-field">' +
                  '<label for="ard-cart-direccion">Dirección completa</label>' +
                  '<input type="text" id="ard-cart-direccion" placeholder="Calle, número, barrio…">' +
                '</div>' +
                '<div id="ard-entrega-tiempos" class="ard-envio-resumen" style="display:none;"></div>' +
              '</div>' +
              '<div id="ard-entrega-detalle-retiro" class="ard-entrega-detalle" style="display:none;"></div>' +
              '<div id="ard-cart-modos" class="ard-cart-modos">' +
                '<div class="ard-cart-modos-titulo">¿Cómo vas a pagar?</div>' +
                '<div id="ard-cart-modos-lista"></div>' +
              '</div>' +
              '<div id="ard-envio-resumen" class="ard-envio-resumen" style="display:none;"></div>' +
              '<div class="ard-cart-error" id="ard-cart-error"></div>' +
              '<div class="ard-cart-modal-actions">' +
                '<button class="ard-cart-pay-mp" id="ard-checkout-paso2-continuar" type="button">Continuar con la revisión</button>' +
                '<button class="ard-cart-modal-cancel" id="ard-checkout-paso2-volver" type="button">← Volver al carrito</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div id="ard-checkout-paso-3" class="ard-checkout-paso" style="display:none;">' +
          '<h3>Revisá tu pedido</h3>' +
          '<div id="ard-checkout-revision"></div>' +
          '<div class="ard-cart-modal-actions">' +
            '<button class="ard-cart-pay-mp" id="ard-cart-confirmar" type="button">Continuar</button>' +
            '<button class="ard-cart-modal-cancel" id="ard-checkout-paso3-volver" type="button">← Volver y editar</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) cerrarModalCheckout();
  });
  modalOverlay.querySelector('#ard-cart-login-cancel').addEventListener('click', cerrarModalCheckout);
  modalOverlay.querySelector('#ard-cart-ir-login').addEventListener('click', function (e) {
    e.preventDefault();
    location.href = urlLoginConRetorno();
  });
  modalOverlay.querySelector('#ard-cart-modal-cancel').addEventListener('click', cerrarModalCheckout);
  modalOverlay.querySelector('#ard-cart-confirmar').addEventListener('click', function () { confirmarPedido(); });
  modalOverlay.querySelector('#ard-cart-cupon-btn').addEventListener('click', function () { aplicarCupon(); });
  modalOverlay.querySelector('#ard-cart-cupon').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); aplicarCupon(); }
  });

  // ---------- Checkout: navegación entre pasos ----------
  var checkoutPaso = 1;

  function actualizarProgresoUI() {
    for (var i = 1; i <= 3; i++) {
      var stepEl = modalOverlay.querySelector('.ard-checkout-step[data-step="' + i + '"]');
      if (stepEl) {
        stepEl.classList.toggle('activo', i === checkoutPaso);
        stepEl.classList.toggle('hecho', i < checkoutPaso);
        stepEl.classList.toggle('clickable', i < checkoutPaso);
      }
    }
    var sep1 = modalOverlay.querySelector('[data-sep="1"]');
    var sep2 = modalOverlay.querySelector('[data-sep="2"]');
    if (sep1) sep1.classList.toggle('hecho', checkoutPaso > 1);
    if (sep2) sep2.classList.toggle('hecho', checkoutPaso > 2);
  }

  function irAPaso(n) {
    checkoutPaso = n;
    for (var i = 1; i <= 3; i++) {
      var el = document.getElementById('ard-checkout-paso-' + i);
      if (el) el.style.display = i === n ? '' : 'none';
    }
    actualizarProgresoUI();
    if (n === 2) renderResumenColapsable();
    if (n === 3) renderRevisionFinal();
    var modalEl = modalOverlay.querySelector('.ard-checkout-modal');
    if (modalEl) modalEl.scrollTop = 0;
  }

  modalOverlay.querySelectorAll('.ard-checkout-step').forEach(function (el) {
    el.addEventListener('click', function () {
      var n = Number(el.getAttribute('data-step'));
      if (n < checkoutPaso) irAPaso(n);
    });
  });

  modalOverlay.querySelector('#ard-checkout-paso1-continuar').addEventListener('click', function () {
    irAPaso(2);
  });
  modalOverlay.querySelector('#ard-checkout-paso2-volver').addEventListener('click', function () {
    irAPaso(1);
  });
  modalOverlay.querySelector('#ard-checkout-paso3-volver').addEventListener('click', function () {
    irAPaso(2);
  });
  modalOverlay.querySelector('#ard-checkout-paso2-continuar').addEventListener('click', function () {
    var nombreInput = document.getElementById('ard-cart-nombre');
    var telInput = document.getElementById('ard-cart-telefono');
    var errorEl = document.getElementById('ard-cart-error');
    var nombre = (nombreInput.value || '').trim();
    var telefono = (telInput.value || '').trim();
    if (!nombre || !telefono) {
      errorEl.textContent = 'Completá tu nombre y teléfono para continuar.';
      errorEl.classList.add('visible');
      return;
    }
    if (tipoEntrega === 'domicilio') {
      var direccionInput = document.getElementById('ard-cart-direccion');
      if (!direccionInput || !direccionInput.value.trim()) {
        errorEl.textContent = 'Completá tu dirección para el envío a domicilio.';
        errorEl.classList.add('visible');
        return;
      }
    }
    errorEl.classList.remove('visible');
    irAPaso(3);
  });
  modalOverlay.querySelector('#ard-checkout-resumen-toggle').addEventListener('click', function () {
    var el = document.getElementById('ard-checkout-resumen-colapsable');
    var icono = document.getElementById('ard-checkout-resumen-toggle-icono');
    var abierto = el.style.display !== 'none';
    el.style.display = abierto ? 'none' : '';
    if (icono) icono.textContent = abierto ? '▾' : '▴';
  });

  // Cantidad +/- y quitar producto, desde el paso 1 del checkout (mismas
  // acciones que el panel lateral, pero dentro del modal).
  modalOverlay.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var itemEl = e.target.closest('.ard-cart-item');
    if (!itemEl || !modalOverlay.contains(itemEl)) return;
    var key = itemEl.getAttribute('data-key');
    var it = buscar(key);
    if (!it) return;
    if (btn.dataset.action === 'inc') setQty(key, it.qty + 1);
    else if (btn.dataset.action === 'dec') setQty(key, it.qty - 1);
    else if (btn.dataset.action === 'remove') remove(key);

    if (!items.length) { cerrarModalCheckout(); return; }
    renderCheckoutItems();
    cargarModosPago();
  });

  var toast = document.createElement('div');
  toast.className = 'ard-cart-toast';

  function montarDOM() {
    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    document.body.appendChild(modalOverlay);
    document.body.appendChild(toast);
    document.body.appendChild(fab);
  }

  // ---------- Panel ----------
  function abrirPanel() {
    overlay.classList.add('open');
    panel.classList.add('open');
  }
  function cerrarPanel() {
    overlay.classList.remove('open');
    panel.classList.remove('open');
  }
  function togglePanel() {
    if (panel.classList.contains('open')) cerrarPanel(); else abrirPanel();
  }

  function mostrarToast(msg) {
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(mostrarToast._t);
    mostrarToast._t = setTimeout(function () { toast.classList.remove('visible'); }, 2200);
  }

  function render() {
    var badge = document.getElementById('ard-cart-badge');
    var count = getCount();
    if (badge) {
      badge.textContent = String(count);
      badge.style.display = count > 0 ? 'flex' : 'none';
    }

    var body = document.getElementById('ard-cart-body');
    var totalEl = document.getElementById('ard-cart-total');
    var checkoutBtn = document.getElementById('ard-cart-checkout');
    if (!body) return;

    if (!items.length) {
      body.innerHTML = '<div class="ard-cart-empty">Todavía no agregaste productos.<br>Elegí algo del catálogo para empezar.</div>';
    } else {
      body.innerHTML = items.map(function (it) {
        var img = it.image
          ? '<img src="' + it.image + '" alt="">'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="#9aa8bb" stroke-width="1.5" width="24" height="24"><rect x="5" y="3" width="14" height="18" rx="2"/></svg>';
        return (
          '<div class="ard-cart-item" data-key="' + escapeHtml(keyOf(it)) + '">' +
            '<div class="ard-cart-item-img">' + img + '</div>' +
            '<div class="ard-cart-item-info">' +
              '<p class="ard-cart-item-name">' + escapeHtml(it.name) + '</p>' +
              (it.brand ? '<p class="ard-cart-item-brand">' + escapeHtml(it.brand) + '</p>' : '') +
              (it.flavor ? '<p class="ard-cart-item-flavor">Sabor: ' + escapeHtml(it.flavor) + '</p>' : '') +
              '<div class="ard-cart-item-row">' +
                '<div class="ard-cart-qty">' +
                  '<button data-action="dec">−</button>' +
                  '<span>' + it.qty + '</span>' +
                  '<button data-action="inc">+</button>' +
                '</div>' +
                '<span class="ard-cart-item-price">' + formatearPrecio(it.price * it.qty) + '</span>' +
              '</div>' +
              '<button class="ard-cart-item-remove" data-action="remove">Quitar</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }

    if (totalEl) totalEl.textContent = formatearPrecio(getTotal());
    if (checkoutBtn) checkoutBtn.disabled = items.length === 0;
    renderEnvioGratisBarra();
  }

  // Barra de progreso hacia el envío gratis (Catamarca Capital), en el
  // carrito, antes del total. Se recalcula solo con el subtotal de productos.
  function renderEnvioGratisBarra() {
    var wrap = document.getElementById('ard-envio-gratis-barra');
    var msg = document.getElementById('ard-envio-gratis-msg');
    var fill = document.getElementById('ard-envio-gratis-fill');
    if (!wrap || !msg || !fill) return;

    if (!items.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';

    var total = getTotal();
    var completo = total >= ENVIO_GRATIS_MONTO_CAPITAL;
    var pct = Math.max(0, Math.min(100, Math.round((total / ENVIO_GRATIS_MONTO_CAPITAL) * 100)));
    fill.style.width = pct + '%';
    wrap.classList.toggle('completo', completo);

    if (completo) {
      msg.innerHTML = '🎉 ¡Tenés envío gratis!';
    } else {
      var falta = ENVIO_GRATIS_MONTO_CAPITAL - total;
      msg.innerHTML = 'Agregá ' + formatearPrecio(falta) + ' más y obtené envío gratis 🚚';
    }
  }

  // Actualiza el pie "Envío gratis desde $X" cuando cambia el monto
  // configurado (al cargar /api/config).
  function actualizarSubEnvioGratis() {
    var sub = document.getElementById('ard-envio-gratis-sub');
    if (sub) sub.textContent = 'Envío gratis en Catamarca Capital desde ' + formatearPrecio(ENVIO_GRATIS_MONTO_CAPITAL);
  }

  panel.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var itemEl = e.target.closest('.ard-cart-item');
    if (!itemEl) return;
    var key = itemEl.getAttribute('data-key');
    var it = buscar(key);
    if (!it) return;
    if (btn.dataset.action === 'inc') setQty(key, it.qty + 1);
    else if (btn.dataset.action === 'dec') setQty(key, it.qty - 1);
    else if (btn.dataset.action === 'remove') remove(key);
  });

  // ---------- Envío / entrega ----------
  // Construye las opciones "¿Cómo querés recibir tu pedido?": domicilio
  // (Catamarca Capital, por zona) + un punto de retiro por cada activo +
  // interior/resto del país (tarifa plana de siempre).
  function renderOpcionesEntrega() {
    var lista = document.getElementById('ard-entrega-lista');
    if (!lista) return;

    var html =
      '<label class="ard-cart-modo" data-entrega="domicilio">' +
        '<input type="radio" name="ard-tipo-entrega" value="domicilio">' +
        '<span class="ard-cart-modo-txt">' +
          '<span class="ard-cart-modo-nombre">🚚 Envío a domicilio</span>' +
          '<span class="ard-cart-modo-detalle">Catamarca Capital — elegís tu zona</span>' +
        '</span>' +
        '<span class="ard-cart-modo-precio" id="ard-entrega-precio-domicilio">…</span>' +
      '</label>';

    puntosRetiro.forEach(function (p) {
      html +=
        '<label class="ard-cart-modo" data-entrega="retiro:' + p.id + '">' +
          '<input type="radio" name="ard-tipo-entrega" value="retiro:' + p.id + '">' +
          '<span class="ard-cart-modo-txt">' +
            '<span class="ard-cart-modo-nombre">🏪 Retirar en ' + escapeHtml(p.name) + '</span>' +
            '<span class="ard-cart-modo-detalle">' + escapeHtml(p.address || 'Sin costo') + '</span>' +
          '</span>' +
          '<span class="ard-cart-modo-precio">Gratis</span>' +
        '</label>';
    });

    html +=
      '<label class="ard-cart-modo" data-entrega="nacional">' +
        '<input type="radio" name="ard-tipo-entrega" value="nacional">' +
        '<span class="ard-cart-modo-txt">' +
          '<span class="ard-cart-modo-nombre">📦 Envío al interior / resto del país</span>' +
          '<span class="ard-cart-modo-detalle">Coordinamos por WhatsApp</span>' +
        '</span>' +
        '<span class="ard-cart-modo-precio" id="ard-entrega-precio-nacional">…</span>' +
      '</label>';

    lista.innerHTML = html;

    lista.querySelectorAll('input[name="ard-tipo-entrega"]').forEach(function (r) {
      r.addEventListener('change', function () {
        lista.querySelectorAll('.ard-cart-modo').forEach(function (el) {
          el.classList.toggle('sel', el.getAttribute('data-entrega') === r.value);
        });
        aplicarTipoEntrega(r.value);
      });
    });

    var def = lista.querySelector('input[value="domicilio"]');
    if (def) { def.checked = true; def.dispatchEvent(new Event('change')); }
  }

  function aplicarTipoEntrega(valor) {
    if (valor === 'nacional') {
      tipoEntrega = 'nacional';
    } else if (valor.indexOf('retiro:') === 0) {
      tipoEntrega = 'retiro';
      puntoSeleccionadoId = valor.slice('retiro:'.length);
    } else {
      tipoEntrega = 'domicilio';
    }
    var elDomicilio = document.getElementById('ard-entrega-detalle-domicilio');
    var elRetiro = document.getElementById('ard-entrega-detalle-retiro');
    if (elDomicilio) elDomicilio.style.display = tipoEntrega === 'domicilio' ? '' : 'none';
    if (elRetiro) elRetiro.style.display = tipoEntrega === 'retiro' ? '' : 'none';
    if (tipoEntrega === 'retiro') renderDetallePunto();
    actualizarPreciosEntregaUI();
    actualizarResumenEnvio();
    actualizarBotonConfirmar();
  }

  function renderZonaSelect() {
    var sel = document.getElementById('ard-cart-zona');
    if (!sel) return;
    if (!zonasCapital.length) {
      sel.innerHTML = '<option value="">No hay zonas configuradas</option>';
      zonaSeleccionadaId = null;
      return;
    }
    sel.innerHTML = zonasCapital.map(function (z) {
      return '<option value="' + z.id + '">' + escapeHtml(z.name) + ' — ' + formatearPrecio(z.price) + '</option>';
    }).join('');
    zonaSeleccionadaId = zonasCapital[0].id;
    sel.value = zonaSeleccionadaId;
  }

  function renderDetallePunto() {
    var cont = document.getElementById('ard-entrega-detalle-retiro');
    if (!cont) return;
    var p = puntoActual();
    if (!p) { cont.innerHTML = ''; return; }
    cont.innerHTML =
      '<div class="ard-envio-resumen" style="display:block;">' +
        (p.address ? '<div class="ard-envio-row"><span>📍 Dirección</span><span>' + escapeHtml(p.address) + '</span></div>' : '') +
        (p.description ? '<div class="ard-envio-row"><span>ℹ️ Info</span><span>' + escapeHtml(p.description) + '</span></div>' : '') +
        (p.schedule ? '<div class="ard-envio-row"><span>🕐 Horario</span><span>' + escapeHtml(p.schedule) + '</span></div>' : '') +
      '</div>';
  }

  function actualizarPreciosEntregaUI() {
    var elDomicilio = document.getElementById('ard-entrega-precio-domicilio');
    var elNacional  = document.getElementById('ard-entrega-precio-nacional');
    if (elDomicilio) {
      if (envioEsGratisPorMonto()) {
        elDomicilio.textContent = 'GRATIS 🎉';
      } else {
        var z = zonaActual();
        elDomicilio.textContent = z ? formatearPrecio(z.price) : (zonasCapital.length ? formatearPrecio(zonasCapital[0].price) : '—');
      }
    }
    if (elNacional) elNacional.textContent = envioTarifas.nacional > 0 ? formatearPrecio(envioTarifas.nacional) : 'A coordinar';
    actualizarResumenEnvio();
  }

  function actualizarResumenEnvio() {
    var resumen = document.getElementById('ard-envio-resumen');
    if (!resumen || !quoteActual) return;
    var cuotas   = cuotasSeleccionadas();
    var subtotal = totalDeCuotas(cuotas);
    var envio    = getEnvio();
    var gratis   = envioEsGratisPorMonto();
    var zonaLbl  = labelEntrega();
    var envioLbl = gratis ? 'GRATIS 🎉' : (envio > 0 ? formatearPrecio(envio) : (tipoEntrega === 'retiro' ? 'Gratis' : '<em>A coordinar</em>'));

    resumen.style.display = '';
    resumen.innerHTML =
      '<div class="ard-envio-row"><span>Subtotal productos</span><span>' + formatearPrecio(subtotal) + '</span></div>' +
      '<div class="ard-envio-row"><span>' + zonaLbl + '</span><span>' + envioLbl + '</span></div>' +
      '<div class="ard-envio-grand"><span>Total estimado</span><span>' +
        (envio > 0 ? formatearPrecio(subtotal + envio) : formatearPrecio(subtotal) + (gratis || tipoEntrega === 'retiro' ? '' : ' + envío')) + '</span></div>';
  }

  // ---------- Checkout: paso 1 (carrito) ----------
  // Misma lista que el panel lateral, pero con sus propios +/-/quitar para
  // poder ajustar el pedido sin salir del checkout.
  function renderCheckoutItems() {
    var cont = document.getElementById('ard-checkout-items');
    if (!cont) return;
    cont.innerHTML = items.map(function (it) {
      var img = it.image
        ? '<img src="' + it.image + '" alt="">'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="#9aa8bb" stroke-width="1.5" width="24" height="24"><rect x="5" y="3" width="14" height="18" rx="2"/></svg>';
      return (
        '<div class="ard-cart-item" data-key="' + escapeHtml(keyOf(it)) + '">' +
          '<div class="ard-cart-item-img">' + img + '</div>' +
          '<div class="ard-cart-item-info">' +
            '<p class="ard-cart-item-name">' + escapeHtml(it.name) + '</p>' +
            (it.brand ? '<p class="ard-cart-item-brand">' + escapeHtml(it.brand) + '</p>' : '') +
            (it.flavor ? '<p class="ard-cart-item-flavor">Sabor: ' + escapeHtml(it.flavor) + '</p>' : '') +
            '<div class="ard-cart-item-row">' +
              '<div class="ard-cart-qty">' +
                '<button type="button" data-action="dec">−</button>' +
                '<span>' + it.qty + '</span>' +
                '<button type="button" data-action="inc">+</button>' +
              '</div>' +
              '<span class="ard-cart-item-price">' + formatearPrecio(it.price * it.qty) + '</span>' +
            '</div>' +
            '<button type="button" class="ard-cart-item-remove" data-action="remove">Quitar</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var subtotalEl = document.getElementById('ard-checkout-subtotal');
    if (subtotalEl) subtotalEl.textContent = formatearPrecio(getTotal());
    if (cuponActual) {
      cuponActual.discountAmount = calcularDescuentoCupon();
      mostrarDescuentoBox();
    }
  }

  // ---------- Checkout: paso 2 (resumen colapsable) ----------
  function renderResumenColapsable() {
    var el = document.getElementById('ard-checkout-resumen-colapsable');
    var toggleTxt = document.getElementById('ard-checkout-resumen-toggle-txt');
    if (!el) return;
    var descuento = cuponActual ? calcularDescuentoCupon() : 0;
    el.innerHTML = items.map(function (it) {
      return '<div class="ard-checkout-resumen-item"><span>' + it.qty + 'x ' + escapeHtml(it.name) +
        (it.flavor ? ' (' + escapeHtml(it.flavor) + ')' : '') + '</span><span>' + formatearPrecio(it.price * it.qty) + '</span></div>';
    }).join('') +
      '<div class="ard-checkout-resumen-item" style="font-weight:700;border-top:1px solid #e5e9ef;margin-top:6px;padding-top:6px;">' +
        '<span>Subtotal</span><span>' + formatearPrecio(getTotal()) + '</span></div>' +
      (descuento > 0
        ? '<div class="ard-checkout-resumen-item" style="color:#219653;"><span>Descuento (' + cuponActual.code + ')</span><span>− ' + formatearPrecio(descuento) + '</span></div>'
        : '');
    if (toggleTxt) {
      var n = getCount();
      toggleTxt.textContent = 'Ver resumen del pedido (' + n + (n === 1 ? ' producto' : ' productos') + ')';
    }
  }

  // ---------- Checkout: paso 3 (revisión final) ----------
  function renderRevisionFinal() {
    var cont = document.getElementById('ard-checkout-revision');
    if (!cont) return;
    var cuotas = cuotasSeleccionadas();
    var modo = modoSeleccionado();
    var formaPagoLbl = modo === 'transferencia' ? 'Transferencia bancaria'
      : modo === 'efectivo' ? 'Efectivo'
      : labelCuotas(cuotas);
    var zonaLbl = labelEntrega();
    var envio = getEnvio();
    var gratis = envioEsGratisPorMonto();
    var subtotalBase = getTotal();
    var descuento = cuponActual ? calcularDescuentoCupon() : 0;
    var subtotalConMedio = totalDeCuotas(cuotas);
    var totalFinal = envio > 0 ? subtotalConMedio + envio : subtotalConMedio;

    var filasProductos = items.map(function (it) {
      return '<div class="ard-revision-row"><span>' + it.qty + 'x ' + escapeHtml(it.name) +
        (it.flavor ? ' <span style="color:#9aa8bb;">(' + escapeHtml(it.flavor) + ')</span>' : '') +
        '</span><span>' + formatearPrecio(it.price * it.qty) + '</span></div>';
    }).join('');

    cont.innerHTML =
      '<div class="ard-revision-section">' +
        '<div class="ard-revision-titulo">Productos</div>' +
        filasProductos +
      '</div>' +
      '<div class="ard-revision-section">' +
        '<div class="ard-revision-row"><span>Subtotal</span><span>' + formatearPrecio(subtotalBase) + '</span></div>' +
        (descuento > 0 ? '<div class="ard-revision-row" style="color:#219653;"><span>Descuento (' + cuponActual.code + ')</span><span>− ' + formatearPrecio(descuento) + '</span></div>' : '') +
        '<div class="ard-revision-row"><span>Envío</span><span>' + (gratis || tipoEntrega === 'retiro' ? (gratis ? 'GRATIS 🎉' : 'Gratis') : (envio > 0 ? formatearPrecio(envio) : 'A coordinar')) + '</span></div>' +
      '</div>' +
      '<div class="ard-revision-section">' +
        '<div class="ard-revision-titulo">Entrega y pago</div>' +
        '<div class="ard-revision-row"><span>Método de entrega</span><span>' + zonaLbl + '</span></div>' +
        (tipoEntrega === 'domicilio' && document.getElementById('ard-cart-direccion') && document.getElementById('ard-cart-direccion').value.trim()
          ? '<div class="ard-revision-row"><span>Dirección</span><span>' + escapeHtml(document.getElementById('ard-cart-direccion').value.trim()) + '</span></div>' : '') +
        '<div class="ard-revision-row"><span>Forma de pago</span><span>' + formaPagoLbl + '</span></div>' +
      '</div>' +
      '<div class="ard-revision-total"><span>Total' + (envio > 0 || gratis || tipoEntrega === 'retiro' ? '' : ' (+ envío a coordinar)') + '</span><span>' + formatearPrecio(totalFinal) + '</span></div>';

    actualizarBotonConfirmar();
  }

  // ---------- Checkout ----------
  function abrirModalCheckout() {
    if (!items.length) return;
    cerrarPanel();
    document.getElementById('ard-cart-error').classList.remove('visible');
    restaurarBotonesModal();
    resetCupon();
    modalOverlay.classList.add('open');

    var gate = document.getElementById('ard-cart-login-gate');
    var wizard = document.getElementById('ard-checkout-wizard');
    // No se requiere cuenta — cualquier persona puede comprar
    gate.style.display = 'none';
    wizard.style.display = '';
    irAPaso(1);
    renderCheckoutItems();

    // Restablecer tipo de entrega al abrir
    tipoEntrega = 'domicilio';
    var direccionInput = document.getElementById('ard-cart-direccion');
    if (direccionInput) direccionInput.value = '';

    // Zonas, puntos de retiro y tarifas/textos configurados desde el panel.
    Promise.all([
      fetch('/api/shipping/zones').then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch('/api/shipping/pickup-points').then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch('/api/config').then(function (r) { return r.json(); }).catch(function () { return {}; }),
    ]).then(function (res) {
      zonasCapital = Array.isArray(res[0]) ? res[0] : [];
      puntosRetiro = Array.isArray(res[1]) ? res[1] : [];
      var cfg = res[2] || {};
      envioTarifas.nacional = Math.max(0, Number(cfg.envioNacional) || 0);
      ENVIO_GRATIS_MONTO_CAPITAL = Math.max(0, Number(cfg.envioGratisMontoCapital) || ENVIO_GRATIS_MONTO_CAPITAL);
      actualizarSubEnvioGratis();
      renderEnvioGratisBarra();

      renderZonaSelect();
      renderOpcionesEntrega();

      var tiemposEl = document.getElementById('ard-entrega-tiempos');
      if (tiemposEl && cfg.envioTiemposTexto) {
        tiemposEl.style.display = '';
        tiemposEl.innerHTML =
          '<div class="ard-envio-row" style="color:#0d1b2a;font-weight:600;">' + escapeHtml(cfg.envioTiemposTitulo || 'Tiempos de entrega') + '</div>' +
          '<div class="ard-envio-row"><span>' + escapeHtml(cfg.envioTiemposTexto) + '</span></div>';
      }
    });

    cargarModosPago();

    // Intentamos pre-llenar con datos de cuenta si está logueado (no bloquea)
    refrescarCuenta().then(function (c) {
      if (!c) return;
      var nombreInput = document.getElementById('ard-cart-nombre');
      var telInput = document.getElementById('ard-cart-telefono');
      if (nombreInput && !nombreInput.value) nombreInput.value = c.name || '';
      if (telInput && !telInput.value) telInput.value = c.phone || '';
      var como = document.getElementById('ard-cart-como');
      if (como) como.textContent = 'Comprás como ' + c.email + '.';
    });
  }

  // Lee el cookie de atribución de campaña (seteado por las landing pages /:slug).
  function leerCookieCampana() {
    try {
      var cookies = document.cookie.split(';');
      for (var i = 0; i < cookies.length; i++) {
        var c = cookies[i].trim();
        var prefix = 'ard_campaign=';
        if (c.indexOf(prefix) === 0) {
          return JSON.parse(decodeURIComponent(c.slice(prefix.length)));
        }
      }
    } catch (e) {}
    return null;
  }

  function resetCupon() {
    cuponActual = null;
    var infoEl = document.getElementById('ard-cart-cupon-info');
    var boxEl  = document.getElementById('ard-cart-descuento-box');
    var inp    = document.getElementById('ard-cart-cupon');
    if (infoEl) { infoEl.textContent = ''; infoEl.className = 'ard-cupon-info'; }
    if (boxEl)  { boxEl.style.display = 'none'; boxEl.innerHTML = ''; }
    if (inp)    { inp.value = ''; inp.readOnly = false; }
    var btn = document.getElementById('ard-cart-cupon-btn');
    if (btn) { btn.textContent = 'Aplicar'; btn.disabled = false; }
  }

  // Calcula el descuento total del cupón sobre los items actuales del carrito.
  // Si el cupón tiene reglas por producto, aplica solo esos; si no, descuento global.
  function calcularDescuentoCupon() {
    if (!cuponActual) return 0;
    if (cuponActual.products && cuponActual.products.length) {
      return items.reduce(function (sum, it) {
        var rule = cuponActual.products.find(function (p) { return p.productId === it.id; });
        if (!rule) return sum;
        var lineTotal = it.price * it.qty;
        var disc = rule.discountType === 'porcentaje'
          ? Math.round(lineTotal * rule.discountValue / 100)
          : Math.min(rule.discountValue, lineTotal);
        return sum + disc;
      }, 0);
    }
    // Descuento global
    var subtotal = getTotal();
    return cuponActual.discountType === 'porcentaje'
      ? Math.round(subtotal * cuponActual.discountValue / 100)
      : Math.min(cuponActual.discountValue, subtotal);
  }

  function mostrarDescuentoBox() {
    var boxEl = document.getElementById('ard-cart-descuento-box');
    if (!boxEl || !cuponActual) return;
    var subtotal = getTotal();
    var descTotal = calcularDescuentoCupon();

    var lineas = '';
    if (cuponActual.products && cuponActual.products.length) {
      // Mostrar detalle por producto
      items.forEach(function (it) {
        var rule = cuponActual.products.find(function (p) { return p.productId === it.id; });
        if (!rule) return;
        var lineTotal = it.price * it.qty;
        var disc = rule.discountType === 'porcentaje'
          ? Math.round(lineTotal * rule.discountValue / 100)
          : Math.min(rule.discountValue, lineTotal);
        lineas += '<div class="ard-descuento-row" style="font-size:11px;color:#6b8099;">' +
          '<span>' + (it.name || 'Producto') + '</span>' +
          '<span style="color:#219653;">− ' + formatearPrecio(disc) + '</span></div>';
      });
    }

    boxEl.style.display = '';
    boxEl.innerHTML =
      '<div class="ard-descuento-row"><span>Subtotal</span><span>' + formatearPrecio(subtotal) + '</span></div>' +
      lineas +
      '<div class="ard-descuento-row"><span><strong>Descuento total (' + cuponActual.code + ')</strong></span>' +
        '<span style="color:#219653;">− ' + formatearPrecio(descTotal) + '</span></div>' +
      '<div class="ard-descuento-total"><span>Total</span><span>' + formatearPrecio(Math.max(0, subtotal - descTotal)) + '</span></div>';
  }

  function aplicarCupon() {
    var inp = document.getElementById('ard-cart-cupon');
    var infoEl = document.getElementById('ard-cart-cupon-info');
    var btn = document.getElementById('ard-cart-cupon-btn');
    if (!inp) return;

    var code = inp.value.trim().toUpperCase();
    if (!code) { infoEl.textContent = 'Ingresá el código del cupón.'; infoEl.className = 'ard-cupon-info err'; return; }

    // Si ya hay un cupón aplicado con ese mismo código, quitar
    if (cuponActual && cuponActual.code === code) {
      resetCupon();
      cargarModosPago();
      return;
    }

    btn.disabled = true;
    btn.textContent = '…';
    infoEl.textContent = '';
    infoEl.className = 'ard-cupon-info';

    fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, subtotal: getTotal() })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.ok) {
          infoEl.textContent = (res.data && res.data.error) ? res.data.error : 'Cupón inválido o vencido.';
          infoEl.className = 'ard-cupon-info err';
          btn.disabled = false;
          btn.textContent = 'Aplicar';
          return;
        }
        var d = res.data;
        cuponActual = {
          code: code,
          discountType: d.discountType,
          discountValue: d.discountValue,
          campaignId: d.campaignId || null,
          sponsorId: d.sponsorId || null,
          products: d.products || [],
        };
        // Calcular con la función centralizada (ya tiene items en contexto)
        cuponActual.discountAmount = calcularDescuentoCupon();

        infoEl.textContent = '¡Cupón aplicado! Ahorrás ' + formatearPrecio(cuponActual.discountAmount) + '.';
        infoEl.className = 'ard-cupon-info ok';
        inp.readOnly = true;
        btn.textContent = 'Quitar';
        btn.disabled = false;

        mostrarDescuentoBox();
        cargarModosPago();
      })
      .catch(function () {
        infoEl.textContent = 'No se pudo validar el cupón. Intentá de nuevo.';
        infoEl.className = 'ard-cupon-info err';
        btn.disabled = false;
        btn.textContent = 'Aplicar';
      });
  }

  // Consulta al backend cuánto sale el carrito en efectivo y en cada plan
  // de cuotas. El precio real siempre lo define el servidor.
  function cargarModosPago() {
    var lista = document.getElementById('ard-cart-modos-lista');
    lista.innerHTML = '<div style="font-size:12px;color:#5c7091;">Calculando precios…</div>';
    quoteActual = null;
    actualizarBotonConfirmar();

    var discountAmount = cuponActual ? calcularDescuentoCupon() : 0;
    fetch('/api/orders/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(function (it) { return { productId: it.id, qty: it.qty }; }),
        discountAmount: discountAmount
      })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (q) {
        quoteActual = (q && q.efectivo) ? q : { efectivo: { total: getTotal() }, planes: [] };
        renderModosPago();
        actualizarResumenEnvio();
      })
      .catch(function () {
        quoteActual = { efectivo: { total: getTotal() }, planes: [] };
        renderModosPago();
        actualizarResumenEnvio();
      });
  }

  function renderModosPago() {
    var lista = document.getElementById('ard-cart-modos-lista');
    var descPct = (quoteActual.lista && quoteActual.lista.descPct) || 20;
    var efectivoTotal = quoteActual.efectivo.total;
    var html = '';

    // Opciones de efectivo y transferencia (ambas van por WhatsApp)
    [
      { value: 'efectivo',       label: '💵 Efectivo',
        detail: 'Coordinamos el retiro por WhatsApp · ' + descPct + '% OFF vs. tarjeta' },
      { value: 'transferencia',  label: '🏦 Transferencia',
        detail: 'Te enviamos los datos bancarios por WhatsApp · ' + descPct + '% OFF vs. tarjeta' },
    ].forEach(function (m) {
      html +=
        '<label class="ard-cart-modo" data-value="' + m.value + '">' +
          '<input type="radio" name="ard-cart-modo" value="' + m.value + '">' +
          '<span class="ard-cart-modo-txt">' +
            '<span class="ard-cart-modo-nombre">' + m.label + '</span>' +
            '<span class="ard-cart-modo-detalle">' + m.detail + '</span>' +
          '</span>' +
          '<span class="ard-cart-modo-precio">' + formatearPrecio(efectivoTotal) + '</span>' +
        '</label>';
    });

    // Opciones de tarjeta (van por Mercado Pago)
    (quoteActual.planes || []).forEach(function (op) {
      var detalle = op.cuotas === 1
        ? '1 pago · Precio de lista · Mercado Pago'
        : op.cuotas + ' cuotas de ' + formatearPrecio(op.cuotaValor) + ' · Mercado Pago';
      html +=
        '<label class="ard-cart-modo" data-value="' + op.cuotas + '">' +
          '<input type="radio" name="ard-cart-modo" value="' + op.cuotas + '">' +
          '<span class="ard-cart-modo-txt">' +
            '<span class="ard-cart-modo-nombre">' + labelCuotas(op.cuotas) + '</span>' +
            '<span class="ard-cart-modo-detalle">' + detalle + '</span>' +
          '</span>' +
          '<span class="ard-cart-modo-precio">' + formatearPrecio(op.total) + '</span>' +
        '</label>';
    });

    lista.innerHTML = html;
    lista.querySelectorAll('input[name="ard-cart-modo"]').forEach(function (r) {
      r.addEventListener('change', function () {
        lista.querySelectorAll('.ard-cart-modo').forEach(function (el) {
          el.classList.toggle('sel', el.getAttribute('data-value') === r.value);
        });
        actualizarBotonConfirmar();
      });
    });

    // Por defecto: efectivo
    var rp = lista.querySelector('input[value="efectivo"]');
    if (rp) { rp.checked = true; rp.dispatchEvent(new Event('change')); }
    actualizarBotonConfirmar();
  }

  // Devuelve el valor del radio seleccionado ('efectivo', 'transferencia', o el N de cuotas).
  function modoSeleccionado() {
    var r = modalOverlay.querySelector('input[name="ard-cart-modo"]:checked');
    return r ? r.value : 'efectivo';
  }

  // Devuelve la cantidad de cuotas (0 = efectivo/transferencia, N = tarjeta).
  function cuotasSeleccionadas() {
    var v = modoSeleccionado();
    if (v === 'efectivo' || v === 'transferencia') return 0;
    return Number(v) || 0;
  }

  function actualizarBotonConfirmar() {
    var btn = document.getElementById('ard-cart-confirmar');
    if (!btn) return;
    if (!quoteActual) { btn.disabled = true; btn.textContent = 'Calculando…'; return; }
    btn.disabled = false;
    var modo = modoSeleccionado();
    if (modo === 'efectivo' || modo === 'transferencia') {
      btn.className = 'ard-cart-modal-confirm';
      btn.innerHTML = ICON_WHATSAPP + ' Confirmar pedido por WhatsApp';
    } else {
      btn.className = 'ard-cart-pay-mp';
      btn.innerHTML = ICON_CARD + ' Pagar con Mercado Pago';
    }
    actualizarResumenEnvio();
  }

  function cerrarModalCheckout() {
    modalOverlay.classList.remove('open');
  }

  function totalDeCuotas(cuotas) {
    var discount = cuponActual ? calcularDescuentoCupon() : 0;
    if (!quoteActual) return Math.max(0, getTotal() - discount);
    if (cuotas < 1) return Math.max(0, quoteActual.efectivo.total - discount);
    var plan = (quoteActual.planes || []).filter(function (p) { return p.cuotas === cuotas; })[0];
    return plan ? Math.max(0, plan.total - discount) : Math.max(0, getTotal() - discount);
  }

  function construirMensajeWhatsapp(pedido, nombre, cuotas) {
    var modo = modoSeleccionado();
    var formaPago = modo === 'transferencia' ? 'Transferencia bancaria'
      : modo === 'efectivo' ? 'Efectivo'
      : labelCuotas(cuotas || 0);
    var lineas = [];
    lineas.push('Hola! Soy ' + nombre + ', quiero hacer este pedido:');
    lineas.push('');
    items.forEach(function (it) {
      lineas.push('• ' + it.qty + 'x ' + it.name + (it.brand ? ' (' + it.brand + ')' : '') + (it.flavor ? ' - Sabor: ' + it.flavor : ''));
    });
    lineas.push('');
    if (cuponActual) {
      var descMsg = calcularDescuentoCupon();
      lineas.push('Subtotal: ' + formatearPrecio(getTotal()));
      lineas.push('Descuento (cupón ' + cuponActual.code + '): − ' + formatearPrecio(descMsg));
    }
    lineas.push('Forma de pago: ' + formaPago);
    var envio    = getEnvio();
    var subtotal = totalDeCuotas(cuotas || 0);
    lineas.push('Entrega: ' + labelEntrega());
    if (tipoEntrega === 'domicilio') {
      var direccionInput = document.getElementById('ard-cart-direccion');
      if (direccionInput && direccionInput.value.trim()) lineas.push('Dirección: ' + direccionInput.value.trim());
    }
    if (envioEsGratisPorMonto()) {
      lineas.push('Envío: GRATIS 🎉 (supera los ' + formatearPrecio(ENVIO_GRATIS_MONTO_CAPITAL) + ' en Catamarca Capital)');
      lineas.push('Total: ' + formatearPrecio(subtotal));
    } else if (tipoEntrega === 'retiro') {
      lineas.push('Envío: Gratis (retiro en punto ARD)');
      lineas.push('Total: ' + formatearPrecio(subtotal));
    } else if (envio > 0) {
      lineas.push('Envío: ' + formatearPrecio(envio));
      lineas.push('Total (con envío): ' + formatearPrecio(subtotal + envio));
    } else {
      lineas.push('Total productos: ' + formatearPrecio(subtotal));
      lineas.push('Envío: a coordinar');
    }
    if (pedido && pedido.orderNumber) {
      lineas.push('Pedido N.º: ' + pedido.orderNumber);
    }
    return lineas.join('\n');
  }

  function confirmarPedido() {
    var nombreInput = document.getElementById('ard-cart-nombre');
    var telInput = document.getElementById('ard-cart-telefono');
    var notasInput = document.getElementById('ard-cart-notas');
    var errorEl = document.getElementById('ard-cart-error');
    var btn = document.getElementById('ard-cart-confirmar');

    var nombre = (nombreInput.value || '').trim();
    var telefono = (telInput.value || '').trim();
    var notasBase = (notasInput.value || '').trim();
    var zonaLbl = labelEntrega();
    var envioMonto = getEnvio();
    var envioMontoTxt = envioEsGratisPorMonto() ? 'GRATIS' : (tipoEntrega === 'retiro' ? 'Gratis' : (envioMonto > 0 ? formatearPrecio(envioMonto) : 'A coordinar'));
    var notaEnvio = 'Entrega: ' + zonaLbl + ' — ' + envioMontoTxt;
    var direccionInput = document.getElementById('ard-cart-direccion');
    if (tipoEntrega === 'domicilio' && direccionInput && direccionInput.value.trim()) {
      notaEnvio += ' | Dirección: ' + direccionInput.value.trim();
    }
    var notas = notasBase ? notasBase + ' | ' + notaEnvio : notaEnvio;
    var cuotas = cuotasSeleccionadas();
    var canal = cuotas < 1 ? 'whatsapp' : 'mercadopago';

    if (!nombre || !telefono) {
      errorEl.textContent = 'Completá tu nombre y teléfono para continuar.';
      errorEl.classList.add('visible');
      return;
    }
    errorEl.classList.remove('visible');

    // Atribución de campaña: primero el cupón (si tiene campaignId),
    // luego el cookie de landing page.
    var cookieCamp = leerCookieCampana();
    var campanaId = (cuponActual && cuponActual.campaignId)
      ? cuponActual.campaignId
      : (cookieCamp && cookieCamp.id ? cookieCamp.id : null);

    var payload = {
      customerName: nombre,
      customerPhone: telefono,
      items: items.map(function (it) {
        return { productId: it.id, name: it.name, brand: it.brand, flavor: it.flavor || '', price: it.price, qty: it.qty };
      }),
      notes: notas,
      channel: canal,
      installments: cuotas,
      paymentMethod: modoSeleccionado(),
      couponCode: cuponActual ? cuponActual.code : null,
      campaignId: campanaId
    };

    btn.disabled = true;
    var textoOriginal = btn.innerHTML;
    btn.textContent = 'Un momento…';

    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('No se pudo registrar el pedido');
        return res.json();
      })
      .then(function (pedido) {
        if (canal === 'mercadopago') {
          irAMercadoPago(pedido, nombre);
        } else {
          finalizarCheckoutWhatsapp(pedido, nombre, cuotas);
        }
      })
      .catch(function (err) {
        if (canal === 'mercadopago') {
          mostrarToast('No se pudo iniciar el pago. Probá coordinar por WhatsApp.');
          btn.disabled = false;
          btn.innerHTML = textoOriginal;
        } else {
          // Si falla el registro (sin conexión, backend caído, etc.) igual
          // dejamos que la venta se concrete por WhatsApp para no perderla.
          mostrarToast('No se pudo registrar el pedido, pero lo enviamos igual por WhatsApp');
          finalizarCheckoutWhatsapp(null, nombre, cuotas);
        }
      });
  }

  // Pide el link de pago (preferencia de Mercado Pago) para el pedido ya
  // creado, y redirige al comprador ahí. El carrito recién se vacía cuando
  // ya sabemos que el link se generó bien.
  function irAMercadoPago(pedido, nombre) {
    if (!pedido || !pedido.id) {
      mostrarToast('No se pudo iniciar el pago. Probá coordinar por WhatsApp.');
      restaurarBotonesModal();
      return;
    }
    fetch('/api/orders/' + pedido.id + '/pagar', { method: 'POST' })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (!r.ok || !r.data.initPoint) throw new Error(r.data.error || 'No se pudo iniciar el pago');
        clear();
        window.location.href = r.data.initPoint;
      })
      .catch(function (err) {
        mostrarToast(err.message || 'No se pudo iniciar el pago con Mercado Pago');
        restaurarBotonesModal();
      });
  }

  function restaurarBotonesModal() {
    var btn = document.getElementById('ard-cart-confirmar');
    if (!btn) return;
    btn.disabled = false;
    actualizarBotonConfirmar();
  }

  function finalizarCheckoutWhatsapp(pedido, nombre, cuotas) {
    var mensaje = encodeURIComponent(construirMensajeWhatsapp(pedido, nombre, cuotas));
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + mensaje, '_blank', 'noopener');
    clear();
    cerrarModalCheckout();
    cerrarPanel();
    restaurarBotonesModal();
  }

  // ---------- Init ----------
  function init() {
    montarDOM();
    render();
    refrescarCuenta();
    // Monto de envío gratis (Catamarca Capital) para que la barra del
    // carrito ya muestre el valor correcto desde el primer render.
    fetch('/api/config').then(function (r) { return r.json(); }).then(function (cfg) {
      ENVIO_GRATIS_MONTO_CAPITAL = Math.max(0, Number(cfg.envioGratisMontoCapital) || ENVIO_GRATIS_MONTO_CAPITAL);
      actualizarSubEnvioGratis();
      renderEnvioGratisBarra();
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ARDCart = {
    add: add,
    remove: remove,
    setQty: setQty,
    clear: clear,
    getItems: getItems,
    getTotal: getTotal,
    getCount: getCount,
    open: abrirPanel,
    close: cerrarPanel,
    onChange: function (fn) { listeners.push(fn); }
  };
})();
