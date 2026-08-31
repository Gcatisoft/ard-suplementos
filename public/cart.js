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
    + '.ard-cart-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;'
    + 'display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;pointer-events:none;transition:opacity .2s ease;}'
    + '.ard-cart-modal-overlay.open{opacity:1;pointer-events:auto;}'
    + '.ard-cart-modal{background:#fff;border-radius:14px;padding:24px;max-width:380px;width:100%;'
    + 'box-shadow:0 20px 50px rgba(0,0,0,.3);}'
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
    + '@media (max-width:480px){.ard-cart-panel{width:100vw;}}';

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
    '<div class="ard-cart-modal">' +
      '<div id="ard-cart-login-gate" style="display:none;">' +
        '<h3>Necesitás una cuenta</h3>' +
        '<p>Para finalizar la compra tenés que iniciar sesión o crear una cuenta. Así podés seguir tus pedidos y tus compras quedan protegidas.</p>' +
        '<div class="ard-cart-modal-actions">' +
          '<a class="ard-cart-pay-mp" id="ard-cart-ir-login" href="#" style="text-align:center;text-decoration:none;">Iniciar sesión / Crear cuenta</a>' +
          '<button class="ard-cart-modal-cancel" id="ard-cart-login-cancel" type="button">Ahora no</button>' +
        '</div>' +
      '</div>' +
      '<div id="ard-cart-checkout-form">' +
        '<h3>Datos para el pedido</h3>' +
        '<p id="ard-cart-como">Elegí cómo querés pagar.</p>' +
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
        '<div class="ard-cart-modos" id="ard-cart-modos">' +
          '<div class="ard-cart-modos-titulo">¿Cómo vas a pagar?</div>' +
          '<div id="ard-cart-modos-lista"></div>' +
        '</div>' +
        '<div class="ard-cart-error" id="ard-cart-error"></div>' +
        '<div class="ard-cart-modal-actions">' +
          '<button class="ard-cart-pay-mp" id="ard-cart-confirmar" type="button">Continuar</button>' +
          '<button class="ard-cart-modal-cancel" id="ard-cart-modal-cancel" type="button">Cancelar</button>' +
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

  // ---------- Checkout ----------
  function abrirModalCheckout() {
    if (!items.length) return;
    cerrarPanel();
    document.getElementById('ard-cart-error').classList.remove('visible');
    restaurarBotonesModal();
    modalOverlay.classList.add('open');

    var gate = document.getElementById('ard-cart-login-gate');
    var form = document.getElementById('ard-cart-checkout-form');

    // Mientras consultamos la sesión, mostramos el form deshabilitado.
    refrescarCuenta().then(function (c) {
      if (!c) {
        gate.style.display = '';
        form.style.display = 'none';
        return;
      }
      gate.style.display = 'none';
      form.style.display = '';

      // Prellenamos con los datos de la cuenta.
      var nombreInput = document.getElementById('ard-cart-nombre');
      var telInput = document.getElementById('ard-cart-telefono');
      if (nombreInput && !nombreInput.value) nombreInput.value = c.name || '';
      if (telInput && !telInput.value) telInput.value = c.phone || '';
      var como = document.getElementById('ard-cart-como');
      if (como) como.textContent = 'Comprás como ' + c.email + '.';

      cargarModosPago();

      setTimeout(function () {
        var focusEl = (telInput && !telInput.value) ? telInput : nombreInput;
        if (focusEl) focusEl.focus();
      }, 50);
    });
  }

  // Consulta al backend cuánto sale el carrito en efectivo y en cada plan
  // de cuotas. El precio real siempre lo define el servidor.
  function cargarModosPago() {
    var lista = document.getElementById('ard-cart-modos-lista');
    lista.innerHTML = '<div style="font-size:12px;color:#5c7091;">Calculando precios…</div>';
    quoteActual = null;
    actualizarBotonConfirmar();

    fetch('/api/orders/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(function (it) { return { productId: it.id, qty: it.qty }; })
      })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (q) {
        quoteActual = (q && q.efectivo) ? q : { efectivo: { total: getTotal() }, planes: [] };
        renderModosPago();
      })
      .catch(function () {
        quoteActual = { efectivo: { total: getTotal() }, planes: [] };
        renderModosPago();
      });
  }

  function renderModosPago() {
    var lista = document.getElementById('ard-cart-modos-lista');
    var opciones = [{ cuotas: 0, total: quoteActual.efectivo.total }].concat(quoteActual.planes || []);
    var html = '';

    opciones.forEach(function (op) {
      var detalle;
      if (op.cuotas < 1) detalle = 'Se coordina por WhatsApp';
      else if (op.cuotas === 1) detalle = 'Pago online con Mercado Pago';
      else detalle = op.cuotas + ' cuotas de ' + formatearPrecio(op.cuotaValor) + ' · Mercado Pago';

      html +=
        '<label class="ard-cart-modo" data-cuotas="' + op.cuotas + '">' +
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
          el.classList.toggle('sel', el.getAttribute('data-cuotas') === r.value);
        });
        actualizarBotonConfirmar();
      });
    });

    // Por defecto queda seleccionado efectivo / transferencia.
    var rp = lista.querySelector('input[value="0"]');
    if (rp) { rp.checked = true; rp.dispatchEvent(new Event('change')); }
    actualizarBotonConfirmar();
  }

  // Devuelve la cantidad de cuotas elegida (0 = efectivo / transferencia).
  function cuotasSeleccionadas() {
    var r = modalOverlay.querySelector('input[name="ard-cart-modo"]:checked');
    return r ? (Number(r.value) || 0) : 0;
  }

  function actualizarBotonConfirmar() {
    var btn = document.getElementById('ard-cart-confirmar');
    if (!btn) return;
    if (!quoteActual) { btn.disabled = true; btn.textContent = 'Calculando…'; return; }
    btn.disabled = false;
    if (cuotasSeleccionadas() < 1) {
      btn.className = 'ard-cart-modal-confirm';
      btn.innerHTML = ICON_WHATSAPP + ' Coordinar por WhatsApp';
    } else {
      btn.className = 'ard-cart-pay-mp';
      btn.innerHTML = ICON_CARD + ' Pagar con Mercado Pago';
    }
  }

  function cerrarModalCheckout() {
    modalOverlay.classList.remove('open');
  }

  function totalDeCuotas(cuotas) {
    if (!quoteActual) return getTotal();
    if (cuotas < 1) return quoteActual.efectivo.total;
    var plan = (quoteActual.planes || []).filter(function (p) { return p.cuotas === cuotas; })[0];
    return plan ? plan.total : getTotal();
  }

  function construirMensajeWhatsapp(pedido, nombre, cuotas) {
    var lineas = [];
    lineas.push('Hola! Soy ' + nombre + ', quiero hacer este pedido:');
    lineas.push('');
    items.forEach(function (it) {
      lineas.push('• ' + it.qty + 'x ' + it.name + (it.brand ? ' (' + it.brand + ')' : '') + (it.flavor ? ' - Sabor: ' + it.flavor : ''));
    });
    lineas.push('');
    lineas.push('Forma de pago: ' + labelCuotas(cuotas || 0));
    lineas.push('Total: ' + formatearPrecio(totalDeCuotas(cuotas || 0)));
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
    var notas = (notasInput.value || '').trim();
    var cuotas = cuotasSeleccionadas();
    var canal = cuotas < 1 ? 'whatsapp' : 'mercadopago';

    if (!nombre || !telefono) {
      errorEl.textContent = 'Completá tu nombre y teléfono para continuar.';
      errorEl.classList.add('visible');
      return;
    }
    errorEl.classList.remove('visible');

    var payload = {
      customerName: nombre,
      customerPhone: telefono,
      items: items.map(function (it) {
        return { productId: it.id, name: it.name, brand: it.brand, flavor: it.flavor || '', price: it.price, qty: it.qty };
      }),
      notes: notas,
      channel: canal,
      installments: cuotas
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
        if (res.status === 401) {
          // La sesión venció entre que abrió el modal y confirmó.
          location.href = urlLoginConRetorno();
          throw new Error('__redirect__');
        }
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
        if (err && err.message === '__redirect__') return;
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
