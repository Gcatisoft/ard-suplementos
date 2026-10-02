(function () {
  'use strict';

  var vrCart = [];
  var vrMetodo = 'efectivo';
  var vrClienteId = null;
  var vrBuscarTimer = null;
  var vrClienteTimer = null;

  function fmt(n) {
    return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  // ---------- Buscar producto ----------
  function buscarProducto() {
    var q = (document.getElementById('vr-buscar').value || '').trim();
    if (!q) return;

    var resultados = document.getElementById('vr-resultados');
    resultados.innerHTML = '<div style="padding:10px;color:#6b7686;font-size:13px;">Buscando…</div>';
    resultados.style.display = 'block';

    // Intentar por código de barras primero (solo dígitos)
    if (/^\d{6,}$/.test(q)) {
      fetch('/api/admin/products/barcode/' + encodeURIComponent(q), { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (prod) {
          if (prod && prod.id) {
            resultados.style.display = 'none';
            resultados.innerHTML = '';
            agregarAlCarrito(prod);
            document.getElementById('vr-buscar').value = '';
          } else {
            buscarPorNombre(q);
          }
        })
        .catch(function () { buscarPorNombre(q); });
    } else {
      buscarPorNombre(q);
    }
  }

  function buscarPorNombre(q) {
    fetch('/api/admin/products?q=' + encodeURIComponent(q) + '&limit=8', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var lista = data.productos || data || [];
        renderResultados(lista);
      })
      .catch(function () {
        document.getElementById('vr-resultados').innerHTML = '<div style="padding:10px;color:#c0392b;font-size:13px;">Error al buscar</div>';
      });
  }

  function renderResultados(lista) {
    var el = document.getElementById('vr-resultados');
    if (!lista || !lista.length) {
      el.innerHTML = '<div style="padding:10px;color:#6b7686;font-size:13px;">Sin resultados</div>';
      el.style.display = 'block';
      return;
    }
    var html = '';
    lista.forEach(function (p) {
      html += '<div class="vr-result-item" data-id="' + p.id + '">' +
        '<div>' +
          '<div class="vr-result-name">' + p.name + (p.brand ? ' <span style="color:#9aa5b4;font-weight:400;">· ' + p.brand + '</span>' : '') + '</div>' +
          '<div class="vr-result-stock">Stock: ' + (p.stock || 0) + '</div>' +
        '</div>' +
        '<div class="vr-result-price">' + fmt(p.price) + '</div>' +
      '</div>';
    });
    el.innerHTML = html;
    el.style.display = 'block';

    el.querySelectorAll('.vr-result-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var id = item.getAttribute('data-id');
        var prod = lista.find(function (p) { return p.id === id; });
        if (prod) {
          agregarAlCarrito(prod);
          el.style.display = 'none';
          el.innerHTML = '';
          document.getElementById('vr-buscar').value = '';
        }
      });
    });
  }

  // ---------- Carrito ----------
  function agregarAlCarrito(prod) {
    var ex = vrCart.find(function (it) { return it.id === prod.id; });
    if (ex) {
      ex.qty += 1;
    } else {
      vrCart.push({ id: prod.id, name: prod.name, price: Number(prod.price), qty: 1, stock: prod.stock || 999 });
    }
    renderCarrito();
  }

  function cambiarCantidad(id, delta) {
    var it = vrCart.find(function (x) { return x.id === id; });
    if (!it) return;
    it.qty = Math.max(1, Math.min(it.qty + delta, it.stock));
    renderCarrito();
  }

  function quitarDelCarrito(id) {
    vrCart = vrCart.filter(function (x) { return x.id !== id; });
    renderCarrito();
  }

  function renderCarrito() {
    var tbody = document.getElementById('vr-cart-tbody');
    var table = document.getElementById('vr-cart-table');
    var empty = document.getElementById('vr-empty-msg');
    var count = document.getElementById('vr-items-count');

    count.textContent = vrCart.length ? '(' + vrCart.length + ' producto' + (vrCart.length > 1 ? 's' : '') + ')' : '';

    if (!vrCart.length) {
      table.style.display = 'none';
      empty.style.display = '';
      actualizarTotales();
      return;
    }

    table.style.display = '';
    empty.style.display = 'none';

    tbody.innerHTML = vrCart.map(function (it) {
      return '<tr>' +
        '<td>' + it.name + '</td>' +
        '<td>' +
          '<div class="vr-qty-ctrl">' +
            '<button class="vr-qty-btn" data-id="' + it.id + '" data-delta="-1">−</button>' +
            '<span class="vr-qty-val">' + it.qty + '</span>' +
            '<button class="vr-qty-btn" data-id="' + it.id + '" data-delta="1">+</button>' +
          '</div>' +
        '</td>' +
        '<td style="text-align:right;">' + fmt(it.price * it.qty) + '</td>' +
        '<td><button class="vr-remove-btn" data-remove="' + it.id + '">×</button></td>' +
      '</tr>';
    }).join('');

    tbody.querySelectorAll('.vr-qty-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cambiarCantidad(btn.getAttribute('data-id'), parseInt(btn.getAttribute('data-delta')));
      });
    });
    tbody.querySelectorAll('.vr-remove-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        quitarDelCarrito(btn.getAttribute('data-remove'));
      });
    });

    actualizarTotales();
  }

  // ---------- Totales ----------
  function actualizarTotales() {
    var subtotal = vrCart.reduce(function (s, it) { return s + it.price * it.qty; }, 0);
    var descEl = document.getElementById('vr-descuento');
    var tipoEl = document.getElementById('vr-descuento-tipo');
    var desc = parseFloat(descEl ? descEl.value : 0) || 0;
    var tipo = tipoEl ? tipoEl.value : 'porcentaje';

    var descMonto = 0;
    if (desc > 0) {
      descMonto = tipo === 'porcentaje'
        ? Math.round(subtotal * desc / 100 * 100) / 100
        : Math.min(desc, subtotal);
    }

    var total = Math.max(0, subtotal - descMonto);

    document.getElementById('vr-subtotal').textContent = fmt(subtotal);
    document.getElementById('vr-total').textContent = fmt(total);

    var dRow = document.getElementById('vr-descuento-row');
    if (descMonto > 0) {
      document.getElementById('vr-descuento-monto').textContent = '-' + fmt(descMonto);
      dRow.style.display = '';
    } else {
      dRow.style.display = 'none';
    }

    var btn = document.getElementById('vr-confirmar-btn');
    btn.disabled = vrCart.length === 0;
  }

  // ---------- Medio de pago ----------
  document.querySelectorAll('.vr-metodo-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      vrMetodo = btn.getAttribute('data-metodo');
      document.querySelectorAll('.vr-metodo-btn').forEach(function (b) {
        b.classList.toggle('activo', b === btn);
      });
    });
  });

  // ---------- Descuento listener ----------
  var descInput = document.getElementById('vr-descuento');
  var descTipo = document.getElementById('vr-descuento-tipo');
  if (descInput) descInput.addEventListener('input', actualizarTotales);
  if (descTipo) descTipo.addEventListener('change', actualizarTotales);

  // ---------- Buscar cliente ----------
  var clienteBuscar = document.getElementById('vr-cliente-buscar');
  if (clienteBuscar) {
    clienteBuscar.addEventListener('input', function () {
      clearTimeout(vrClienteTimer);
      var q = clienteBuscar.value.trim();
      if (q.length < 2) {
        ocultarSuggCliente();
        return;
      }
      vrClienteTimer = setTimeout(function () { buscarCliente(q); }, 300);
    });
  }

  function buscarCliente(q) {
    fetch('/api/admin/customers', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var lista = Array.isArray(data) ? data : [];
        var qLow = q.toLowerCase();
        lista = lista.filter(function (c) {
          return (c.name && c.name.toLowerCase().includes(qLow)) ||
                 (c.phone && c.phone.includes(q));
        }).slice(0, 6);
        renderSuggCliente(lista);
      })
      .catch(function () { ocultarSuggCliente(); });
  }

  function renderSuggCliente(lista) {
    var sugg = document.getElementById('vr-cliente-sugg');
    if (!lista || !lista.length) { ocultarSuggCliente(); return; }
    sugg.innerHTML = lista.map(function (c) {
      return '<div class="vr-cliente-item" data-id="' + c.id + '" data-name="' + (c.name || '') + '" data-phone="' + (c.phone || '') + '">' +
        (c.name || 'Sin nombre') + (c.phone ? ' · ' + c.phone : '') +
      '</div>';
    }).join('');
    sugg.style.display = 'block';
    sugg.querySelectorAll('.vr-cliente-item').forEach(function (item) {
      item.addEventListener('click', function () {
        vrClienteId = item.getAttribute('data-id');
        var nombre = item.getAttribute('data-name');
        var tel = item.getAttribute('data-phone');
        document.getElementById('vr-cliente-buscar').value = nombre + (tel ? ' · ' + tel : '');
        var sel = document.getElementById('vr-cliente-seleccionado');
        sel.textContent = 'Cliente asignado: ' + nombre;
        sel.style.display = '';
        ocultarSuggCliente();
      });
    });
  }

  function ocultarSuggCliente() {
    var sugg = document.getElementById('vr-cliente-sugg');
    if (sugg) { sugg.style.display = 'none'; sugg.innerHTML = ''; }
  }

  // ---------- Confirmar venta ----------
  var confirmarBtn = document.getElementById('vr-confirmar-btn');
  if (confirmarBtn) {
    confirmarBtn.addEventListener('click', confirmarVenta);
  }

  function confirmarVenta() {
    if (!vrCart.length) return;

    var descVal = parseFloat((document.getElementById('vr-descuento') || {}).value) || 0;
    var descTipoVal = ((document.getElementById('vr-descuento-tipo') || {}).value) || 'porcentaje';
    var notas = ((document.getElementById('vr-notas') || {}).value || '').trim();

    var payload = {
      items: vrCart.map(function (it) { return { productId: it.id, qty: it.qty }; }),
      discount: descVal,
      discountType: descTipoVal,
      paymentMethod: vrMetodo,
      customerId: vrClienteId || null,
      notes: notas,
    };

    var btn = document.getElementById('vr-confirmar-btn');
    btn.disabled = true;
    btn.textContent = 'Procesando…';

    fetch('/api/admin/ventas/rapida', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          var msg = document.getElementById('vr-success-msg');
          var num = document.getElementById('vr-success-num');
          num.textContent = '— ' + (data.order && data.order.orderNumber ? data.order.orderNumber : '') + ' · Total: ' + fmt(data.order ? data.order.total : 0);
          msg.style.display = '';
          msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setTimeout(function () {
            msg.style.display = 'none';
            resetVR();
          }, 4000);
        } else {
          alert('Error: ' + (data.error || 'No se pudo registrar la venta'));
          btn.disabled = false;
          btn.textContent = 'Confirmar venta';
        }
      })
      .catch(function (err) {
        console.error(err);
        alert('Error de red al registrar la venta');
        btn.disabled = false;
        btn.textContent = 'Confirmar venta';
      });
  }

  // ---------- Reset ----------
  function resetVR() {
    vrCart = [];
    vrClienteId = null;
    vrMetodo = 'efectivo';

    renderCarrito();

    var inputs = ['vr-buscar', 'vr-descuento', 'vr-notas', 'vr-cliente-buscar', 'vr-cliente-id'];
    inputs.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    var descTipoEl = document.getElementById('vr-descuento-tipo');
    if (descTipoEl) descTipoEl.value = 'porcentaje';

    var sel = document.getElementById('vr-cliente-seleccionado');
    if (sel) { sel.textContent = ''; sel.style.display = 'none'; }

    var res = document.getElementById('vr-resultados');
    if (res) { res.style.display = 'none'; res.innerHTML = ''; }

    document.querySelectorAll('.vr-metodo-btn').forEach(function (b) {
      b.classList.toggle('activo', b.getAttribute('data-metodo') === 'efectivo');
    });

    var btn = document.getElementById('vr-confirmar-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Confirmar venta'; }

    var buscarEl = document.getElementById('vr-buscar');
    if (buscarEl) buscarEl.focus();
  }

  // ---------- Activar tab: foco en scanner ----------
  var tabPanel = document.getElementById('tab-ventas');
  if (tabPanel) {
    var observer = new MutationObserver(function () {
      if (tabPanel.classList.contains('active')) {
        var buscarEl = document.getElementById('vr-buscar');
        if (buscarEl) setTimeout(function () { buscarEl.focus(); }, 50);
      }
    });
    observer.observe(tabPanel, { attributes: true, attributeFilter: ['class'] });
  }

  // ---------- Buscar con Enter ----------
  var vrBuscarInput = document.getElementById('vr-buscar');
  if (vrBuscarInput) {
    vrBuscarInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        buscarProducto();
      }
    });
    vrBuscarInput.addEventListener('input', function () {
      clearTimeout(vrBuscarTimer);
      var q = vrBuscarInput.value.trim();
      // Auto-buscar cuando parece un código de barras (solo dígitos, >6 chars)
      if (/^\d{7,}$/.test(q)) {
        vrBuscarTimer = setTimeout(buscarProducto, 200);
      }
    });
  }

  var vrBuscarBtn = document.getElementById('vr-buscar-btn');
  if (vrBuscarBtn) {
    vrBuscarBtn.addEventListener('click', buscarProducto);
  }

  // Cerrar resultados al hacer clic afuera
  document.addEventListener('click', function (e) {
    var res = document.getElementById('vr-resultados');
    var input = document.getElementById('vr-buscar');
    var btn = document.getElementById('vr-buscar-btn');
    if (res && !res.contains(e.target) && e.target !== input && e.target !== btn) {
      res.style.display = 'none';
    }
    var sugg = document.getElementById('vr-cliente-sugg');
    var cInput = document.getElementById('vr-cliente-buscar');
    if (sugg && !sugg.contains(e.target) && e.target !== cInput) {
      ocultarSuggCliente();
    }
  });
})();
