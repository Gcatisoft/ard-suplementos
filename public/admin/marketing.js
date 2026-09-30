/**
 * ARD Suplementos — Módulo de Marketing
 * Sponsors · Campañas · Cupones · Estadísticas
 */
(function () {
  'use strict';

  // ---------- Utilidades ----------
  function fmt(n) {
    try {
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);
    } catch (e) { return '$' + (n || 0); }
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function fmtFecha(str) {
    if (!str) return '—';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function badgeEstado(status) {
    return '<span class="mk-estado-badge ' + esc(status) + '">' + esc(status) + '</span>';
  }

  function badgeTipo(type) {
    return '<span class="mk-tipo-badge">' + esc(type) + '</span>';
  }

  async function api(path, opts) {
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Error de servidor');
    return data;
  }

  function showErr(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? '' : 'none';
  }

  function clearErr(id) { showErr(id, ''); }

  // ---------- Estado local ----------
  var sponsors = [];
  var campaigns = [];
  var coupons = [];

  // ---------- Sub-tabs de Marketing ----------
  function initMarketingTabs() {
    var btns = document.querySelectorAll('[data-mktab]');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var tab = btn.getAttribute('data-mktab');
        document.querySelectorAll('.mk-panel').forEach(function (p) { p.classList.remove('active'); });
        var panel = document.getElementById('mk-' + tab);
        if (panel) panel.classList.add('active');

        if (tab === 'resumen')   cargarResumen();
        if (tab === 'sponsors')  cargarSponsors();
        if (tab === 'campanas')  cargarCampanas();
        if (tab === 'cupones')   cargarCupones();
      });
    });
  }

  // Se llama cuando el tab principal "marketing" se activa
  function onMarketingTabOpen() {
    cargarResumen();
    cargarSponsorsEnSelects();
  }

  // ---------- RESUMEN ----------
  async function cargarResumen() {
    var desde    = (document.getElementById('mk-filtro-desde') || {}).value || '';
    var hasta    = (document.getElementById('mk-filtro-hasta') || {}).value || '';
    var sponsorId= (document.getElementById('mk-filtro-sponsor') || {}).value || '';
    var tipoSp   = (document.getElementById('mk-filtro-tipo-sponsor') || {}).value || '';

    var qs = new URLSearchParams();
    if (desde)     qs.set('dateFrom', desde);
    if (hasta)     qs.set('dateTo', hasta);
    if (sponsorId) qs.set('sponsorId', sponsorId);
    if (tipoSp)    qs.set('sponsorType', tipoSp);

    try {
      var data = await api('/api/admin/marketing/stats?' + qs.toString());

      document.getElementById('mk-stat-ventas').textContent     = fmt(data.totalVentas);
      document.getElementById('mk-stat-descuentos').textContent = fmt(data.totalDescuentos);
      document.getElementById('mk-stat-usos').textContent       = data.totalUsos;
      document.getElementById('mk-stat-activas').textContent    = data.campanasActivas;

      var tbody = document.getElementById('mk-tabla-sponsors-body');
      var empty = document.getElementById('mk-tabla-sponsors-empty');
      if (!data.tabla || !data.tabla.length) {
        tbody.innerHTML = '';
        empty.style.display = '';
        return;
      }
      empty.style.display = 'none';
      tbody.innerHTML = data.tabla.map(function (r) {
        return '<tr>' +
          '<td>' + esc(r.sponsorName) + '</td>' +
          '<td>' + badgeTipo(r.sponsorType) + '</td>' +
          '<td>' + r.usos + '</td>' +
          '<td>' + fmt(r.ventas) + '</td>' +
          '<td>' + fmt(r.descuentos) + '</td>' +
          '</tr>';
      }).join('');
    } catch (e) {
      console.error(e);
    }
  }

  document.getElementById('mk-filtrar-btn') && document.getElementById('mk-filtrar-btn').addEventListener('click', cargarResumen);

  // ---------- Cargar sponsors en los <select> de toda la página ----------
  async function cargarSponsorsEnSelects() {
    try {
      sponsors = await api('/api/admin/sponsors');
      var selIds = ['mk-filtro-sponsor', 'mk-camp-filtro-sponsor', 'mk-cup-filtro-sponsor', 'campana-sponsor'];
      selIds.forEach(function (id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        var current = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        sponsors.forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name + ' (' + s.type + ')';
          sel.appendChild(opt);
        });
        if (current) sel.value = current;
      });
    } catch (e) { console.error(e); }
  }

  // ---------- SPONSORS ----------
  async function cargarSponsors() {
    try {
      sponsors = await api('/api/admin/sponsors');
      renderSponsors();
    } catch (e) { console.error(e); }
  }

  function renderSponsors() {
    var tbody = document.getElementById('mk-sponsors-body');
    var empty = document.getElementById('mk-sponsors-empty');
    var buscar  = ((document.getElementById('mk-sponsor-buscar') || {}).value || '').toLowerCase();
    var filtTipo= (document.getElementById('mk-sponsor-filtro-tipo') || {}).value || '';
    var filtEst = (document.getElementById('mk-sponsor-filtro-estado') || {}).value || '';

    var lista = sponsors.filter(function (s) {
      if (buscar   && !s.name.toLowerCase().includes(buscar))   return false;
      if (filtTipo && s.type !== filtTipo)                       return false;
      if (filtEst  && s.status !== filtEst)                      return false;
      return true;
    });

    if (!lista.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    tbody.innerHTML = lista.map(function (s) {
      return '<tr>' +
        '<td><strong>' + esc(s.name) + '</strong></td>' +
        '<td>' + badgeTipo(s.type) + '</td>' +
        '<td>' + esc(s.contact || s.phone || '—') + '</td>' +
        '<td>' + badgeEstado(s.status) + '</td>' +
        '<td class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" data-action="sponsor-ver" data-id="' + esc(s.id) + '">Ver</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="sponsor-edit" data-id="' + esc(s.id) + '">Editar</button>' +
          '<button class="btn btn-danger btn-sm" data-action="sponsor-del" data-id="' + esc(s.id) + '">Eliminar</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  document.getElementById('mk-sponsor-buscar')       && document.getElementById('mk-sponsor-buscar').addEventListener('input', renderSponsors);
  document.getElementById('mk-sponsor-filtro-tipo')  && document.getElementById('mk-sponsor-filtro-tipo').addEventListener('change', renderSponsors);
  document.getElementById('mk-sponsor-filtro-estado')&& document.getElementById('mk-sponsor-filtro-estado').addEventListener('change', renderSponsors);

  document.getElementById('mk-sponsors-body') && document.getElementById('mk-sponsors-body').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var sp = sponsors.find(function (s) { return s.id === id; });

    if (btn.getAttribute('data-action') === 'sponsor-ver') {
      abrirSponsorDetalle(id);
    } else if (btn.getAttribute('data-action') === 'sponsor-edit') {
      if (!sp) return;
      document.getElementById('sponsor-id').value           = sp.id;
      document.getElementById('sponsor-nombre').value       = sp.name;
      document.getElementById('sponsor-tipo').value         = sp.type;
      document.getElementById('sponsor-estado').value       = sp.status;
      document.getElementById('sponsor-descripcion').value  = sp.description || '';
      document.getElementById('sponsor-contacto').value     = sp.contact || '';
      document.getElementById('sponsor-email').value        = sp.email || '';
      document.getElementById('sponsor-telefono').value     = sp.phone || '';
      document.getElementById('modal-sponsor-title').textContent = 'Editar sponsor';
      clearErr('form-sponsor-error');
      document.getElementById('modal-overlay-sponsor').classList.add('open');
    } else if (btn.getAttribute('data-action') === 'sponsor-del') {
      if (!confirm('¿Eliminar el sponsor "' + (sp ? sp.name : '') + '"?\nSe eliminarán también sus campañas y cupones.')) return;
      try {
        await api('/api/admin/sponsors/' + id, { method: 'DELETE' });
        await cargarSponsors();
        cargarSponsorsEnSelects();
      } catch (err) { alert(err.message); }
    }
  });

  // Modal nuevo sponsor
  document.getElementById('mk-sponsor-nuevo-btn') && document.getElementById('mk-sponsor-nuevo-btn').addEventListener('click', function () {
    document.getElementById('sponsor-id').value          = '';
    document.getElementById('sponsor-nombre').value      = '';
    document.getElementById('sponsor-tipo').value        = 'persona';
    document.getElementById('sponsor-estado').value      = 'activo';
    document.getElementById('sponsor-descripcion').value = '';
    document.getElementById('sponsor-contacto').value    = '';
    document.getElementById('sponsor-email').value       = '';
    document.getElementById('sponsor-telefono').value    = '';
    document.getElementById('modal-sponsor-title').textContent = 'Nuevo sponsor';
    clearErr('form-sponsor-error');
    document.getElementById('modal-overlay-sponsor').classList.add('open');
  });

  document.getElementById('modal-sponsor-close') && document.getElementById('modal-sponsor-close').addEventListener('click', function () {
    document.getElementById('modal-overlay-sponsor').classList.remove('open');
  });
  document.getElementById('cancelar-sponsor-btn') && document.getElementById('cancelar-sponsor-btn').addEventListener('click', function () {
    document.getElementById('modal-overlay-sponsor').classList.remove('open');
  });

  document.getElementById('sponsor-form') && document.getElementById('sponsor-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    clearErr('form-sponsor-error');
    var id = document.getElementById('sponsor-id').value;
    var body = {
      name:        document.getElementById('sponsor-nombre').value.trim(),
      type:        document.getElementById('sponsor-tipo').value,
      status:      document.getElementById('sponsor-estado').value,
      description: document.getElementById('sponsor-descripcion').value.trim(),
      contact:     document.getElementById('sponsor-contacto').value.trim(),
      email:       document.getElementById('sponsor-email').value.trim(),
      phone:       document.getElementById('sponsor-telefono').value.trim(),
    };
    try {
      if (id) {
        await api('/api/admin/sponsors/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await api('/api/admin/sponsors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      document.getElementById('modal-overlay-sponsor').classList.remove('open');
      await cargarSponsors();
      cargarSponsorsEnSelects();
    } catch (err) { showErr('form-sponsor-error', err.message); }
  });

  // ---------- Detalle Sponsor ----------
  async function abrirSponsorDetalle(sponsorId) {
    var sp = sponsors.find(function (s) { return s.id === sponsorId; });
    document.getElementById('modal-sponsor-detalle-title').textContent = sp ? sp.name : 'Detalle sponsor';
    document.getElementById('sponsor-detalle-cards').innerHTML = '<div style="font-size:13px;color:#5c6b82;">Cargando…</div>';
    document.getElementById('sponsor-detalle-campanas-body').innerHTML = '';
    document.getElementById('sponsor-detalle-productos-body').innerHTML = '';
    document.getElementById('modal-overlay-sponsor-detalle').classList.add('open');
    try {
      var data = await api('/api/admin/sponsors/' + sponsorId + '/stats');
      document.getElementById('sponsor-detalle-cards').innerHTML =
        '<div class="stat-card-2"><div class="num">' + data.totalUsos + '</div><div class="label">Usos totales</div></div>' +
        '<div class="stat-card-2"><div class="num">' + fmt(data.totalVentas) + '</div><div class="label">Ventas totales</div></div>' +
        '<div class="stat-card-2"><div class="num">' + fmt(data.totalDescuentos) + '</div><div class="label">Descuentos</div></div>';

      document.getElementById('sponsor-detalle-campanas-body').innerHTML = (data.campanas || []).map(function (c) {
        return '<tr><td>' + esc(c.campaignName) + '</td><td>' + c.usos + '</td><td>' + fmt(c.ventas) + '</td><td>' + fmt(c.descuentos) + '</td></tr>';
      }).join('') || '<tr><td colspan="4" style="color:#6b7686;text-align:center;">Sin ventas registradas</td></tr>';

      document.getElementById('sponsor-detalle-productos-body').innerHTML = (data.productos || []).slice(0, 20).map(function (p) {
        return '<tr><td>' + esc(p.name) + '</td><td>' + p.units + '</td></tr>';
      }).join('') || '<tr><td colspan="2" style="color:#6b7686;text-align:center;">Sin productos registrados</td></tr>';
    } catch (e) {
      document.getElementById('sponsor-detalle-cards').innerHTML = '<div style="color:#a12c2c;">Error al cargar</div>';
    }
  }

  document.getElementById('modal-sponsor-detalle-close') && document.getElementById('modal-sponsor-detalle-close').addEventListener('click', function () {
    document.getElementById('modal-overlay-sponsor-detalle').classList.remove('open');
  });
  document.getElementById('cerrar-sponsor-detalle-btn') && document.getElementById('cerrar-sponsor-detalle-btn').addEventListener('click', function () {
    document.getElementById('modal-overlay-sponsor-detalle').classList.remove('open');
  });

  // ---------- CAMPAÑAS ----------
  async function cargarCampanas() {
    try {
      var sponsorId = (document.getElementById('mk-camp-filtro-sponsor') || {}).value || '';
      var qs = sponsorId ? '?sponsorId=' + encodeURIComponent(sponsorId) : '';
      campaigns = await api('/api/admin/campaigns' + qs);
      renderCampanas();
    } catch (e) { console.error(e); }
  }

  function renderCampanas() {
    var tbody = document.getElementById('mk-campanas-body');
    var empty = document.getElementById('mk-campanas-empty');
    var filtEst = (document.getElementById('mk-camp-filtro-estado') || {}).value || '';

    var lista = campaigns.filter(function (c) {
      if (filtEst && c.status !== filtEst) return false;
      return true;
    });

    if (!lista.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    tbody.innerHTML = lista.map(function (c) {
      var link = c.slug ? '<span class="mk-code">' + esc(c.slug) + '</span>' : '—';
      var periodo = (c.startDate ? fmtFecha(c.startDate) : '—') + ' → ' + (c.endDate ? fmtFecha(c.endDate) : '—');
      return '<tr>' +
        '<td>' + esc(c.sponsorName) + '</td>' +
        '<td><strong>' + esc(c.name) + '</strong></td>' +
        '<td>' + link + '</td>' +
        '<td style="font-size:12px;">' + esc(periodo) + '</td>' +
        '<td>' + badgeEstado(c.status) + '</td>' +
        '<td class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" data-action="camp-ver" data-id="' + esc(c.id) + '">Ver</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="camp-edit" data-id="' + esc(c.id) + '">Editar</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="camp-renovar" data-id="' + esc(c.id) + '">Renovar</button>' +
          '<button class="btn btn-danger btn-sm" data-action="camp-del" data-id="' + esc(c.id) + '">Eliminar</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  document.getElementById('mk-camp-filtro-sponsor') && document.getElementById('mk-camp-filtro-sponsor').addEventListener('change', cargarCampanas);
  document.getElementById('mk-camp-filtro-estado')  && document.getElementById('mk-camp-filtro-estado').addEventListener('change', renderCampanas);

  document.getElementById('mk-campanas-body') && document.getElementById('mk-campanas-body').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var camp = campaigns.find(function (c) { return c.id === id; });
    var action = btn.getAttribute('data-action');

    if (action === 'camp-ver') {
      abrirCampanaDetalle(id, camp);
    } else if (action === 'camp-edit') {
      if (!camp) return;
      document.getElementById('campana-id').value      = camp.id;
      document.getElementById('campana-sponsor').value = camp.sponsorId;
      document.getElementById('campana-nombre').value  = camp.name;
      document.getElementById('campana-slug').value    = camp.slug || '';
      document.getElementById('campana-inicio').value  = camp.startDate || '';
      document.getElementById('campana-fin').value     = camp.endDate || '';
      document.getElementById('campana-estado').value  = camp.status;
      document.getElementById('modal-campana-title').textContent = 'Editar campaña';
      clearErr('form-campana-error');
      document.getElementById('modal-overlay-campana').classList.add('open');
    } else if (action === 'camp-renovar') {
      if (!camp) return;
      document.getElementById('renovar-campaign-id').value = camp.id;
      document.getElementById('renovar-desc').textContent = 'Campaña original: ' + camp.name + (camp.slug ? ' · /' + camp.slug : '');
      document.getElementById('renovar-nombre').value   = '';
      document.getElementById('renovar-slug').value     = '';
      document.getElementById('renovar-inicio').value   = '';
      document.getElementById('renovar-fin').value      = '';
      document.getElementById('renovar-cup-code').value = '';
      document.getElementById('renovar-cup-valor').value= '';
      clearErr('form-renovar-error');
      document.getElementById('modal-overlay-renovar').classList.add('open');
    } else if (action === 'camp-del') {
      if (!confirm('¿Eliminar la campaña "' + (camp ? camp.name : '') + '"?')) return;
      try {
        await api('/api/admin/campaigns/' + id, { method: 'DELETE' });
        await cargarCampanas();
      } catch (err) { alert(err.message); }
    }
  });

  // Modal nueva campaña
  document.getElementById('mk-camp-nuevo-btn') && document.getElementById('mk-camp-nuevo-btn').addEventListener('click', function () {
    document.getElementById('campana-id').value     = '';
    document.getElementById('campana-sponsor').value= '';
    document.getElementById('campana-nombre').value = '';
    document.getElementById('campana-slug').value   = '';
    document.getElementById('campana-inicio').value = '';
    document.getElementById('campana-fin').value    = '';
    document.getElementById('campana-estado').value = 'activa';
    document.getElementById('modal-campana-title').textContent = 'Nueva campaña';
    clearErr('form-campana-error');
    document.getElementById('modal-overlay-campana').classList.add('open');
  });

  document.getElementById('modal-campana-close') && document.getElementById('modal-campana-close').addEventListener('click', function () {
    document.getElementById('modal-overlay-campana').classList.remove('open');
  });
  document.getElementById('cancelar-campana-btn') && document.getElementById('cancelar-campana-btn').addEventListener('click', function () {
    document.getElementById('modal-overlay-campana').classList.remove('open');
  });

  document.getElementById('campana-form') && document.getElementById('campana-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    clearErr('form-campana-error');
    var id = document.getElementById('campana-id').value;
    var body = {
      sponsorId:  document.getElementById('campana-sponsor').value,
      name:       document.getElementById('campana-nombre').value.trim(),
      slug:       document.getElementById('campana-slug').value.trim(),
      startDate:  document.getElementById('campana-inicio').value,
      endDate:    document.getElementById('campana-fin').value,
      status:     document.getElementById('campana-estado').value,
    };
    try {
      if (id) {
        await api('/api/admin/campaigns/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await api('/api/admin/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      document.getElementById('modal-overlay-campana').classList.remove('open');
      await cargarCampanas();
      cargarSponsorsEnSelects();
    } catch (err) { showErr('form-campana-error', err.message); }
  });

  // Modal renovar campaña
  document.getElementById('modal-renovar-close') && document.getElementById('modal-renovar-close').addEventListener('click', function () {
    document.getElementById('modal-overlay-renovar').classList.remove('open');
  });
  document.getElementById('cancelar-renovar-btn') && document.getElementById('cancelar-renovar-btn').addEventListener('click', function () {
    document.getElementById('modal-overlay-renovar').classList.remove('open');
  });

  document.getElementById('renovar-form') && document.getElementById('renovar-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    clearErr('form-renovar-error');
    var id = document.getElementById('renovar-campaign-id').value;
    var body = {
      name:          document.getElementById('renovar-nombre').value.trim(),
      slug:          document.getElementById('renovar-slug').value.trim(),
      startDate:     document.getElementById('renovar-inicio').value,
      endDate:       document.getElementById('renovar-fin').value,
      couponCode:    document.getElementById('renovar-cup-code').value.trim(),
      discountType:  document.getElementById('renovar-cup-tipo').value,
      discountValue: document.getElementById('renovar-cup-valor').value,
    };
    try {
      await api('/api/admin/campaigns/' + id + '/renovar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      document.getElementById('modal-overlay-renovar').classList.remove('open');
      await cargarCampanas();
      await cargarCupones();
    } catch (err) { showErr('form-renovar-error', err.message); }
  });

  // Detalle campaña
  async function abrirCampanaDetalle(campId, camp) {
    document.getElementById('modal-campana-detalle-title').textContent = camp ? camp.name : 'Detalle campaña';
    document.getElementById('campana-detalle-cards').innerHTML = '<div style="font-size:13px;color:#5c6b82;">Cargando…</div>';
    document.getElementById('campana-detalle-productos-body').innerHTML = '';
    document.getElementById('modal-overlay-campana-detalle').classList.add('open');
    try {
      var data = await api('/api/admin/campaigns/' + campId + '/stats');
      document.getElementById('campana-detalle-cards').innerHTML =
        '<div class="stat-card-2"><div class="num">' + data.totalUsos + '</div><div class="label">Usos</div></div>' +
        '<div class="stat-card-2"><div class="num">' + fmt(data.totalVentas) + '</div><div class="label">Ventas</div></div>' +
        '<div class="stat-card-2"><div class="num">' + fmt(data.totalDescuentos) + '</div><div class="label">Descuentos</div></div>' +
        '<div class="stat-card-2"><div class="num">' + fmt(data.ticketPromedio) + '</div><div class="label">Ticket promedio</div></div>';

      document.getElementById('campana-detalle-productos-body').innerHTML = (data.productos || []).slice(0, 20).map(function (p) {
        return '<tr><td>' + esc(p.name) + '</td><td>' + p.units + '</td></tr>';
      }).join('') || '<tr><td colspan="2" style="color:#6b7686;text-align:center;">Sin ventas registradas</td></tr>';
    } catch (ex) {
      document.getElementById('campana-detalle-cards').innerHTML = '<div style="color:#a12c2c;">Error al cargar</div>';
    }
  }

  document.getElementById('modal-campana-detalle-close') && document.getElementById('modal-campana-detalle-close').addEventListener('click', function () {
    document.getElementById('modal-overlay-campana-detalle').classList.remove('open');
  });
  document.getElementById('cerrar-campana-detalle-btn') && document.getElementById('cerrar-campana-detalle-btn').addEventListener('click', function () {
    document.getElementById('modal-overlay-campana-detalle').classList.remove('open');
  });

  // ---------- CUPONES ----------
  async function cargarCupones() {
    try {
      var sponsorId = (document.getElementById('mk-cup-filtro-sponsor') || {}).value || '';
      var qs = sponsorId ? '?sponsorId=' + encodeURIComponent(sponsorId) : '';
      coupons = await api('/api/admin/coupons' + qs);
      renderCupones();
    } catch (e) { console.error(e); }
  }

  function renderCupones() {
    var tbody = document.getElementById('mk-cupones-body');
    var empty = document.getElementById('mk-cupones-empty');
    var filtEst = (document.getElementById('mk-cup-filtro-estado') || {}).value || '';

    var lista = coupons.filter(function (c) {
      if (filtEst && c.status !== filtEst) return false;
      return true;
    });

    if (!lista.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    tbody.innerHTML = lista.map(function (c) {
      var descText = c.discountType === 'porcentaje'
        ? c.discountValue + '%'
        : fmt(c.discountValue);
      var vigencia = (c.startDate ? fmtFecha(c.startDate) : '—') + ' → ' + (c.endDate ? fmtFecha(c.endDate) : 'Sin venc.');
      return '<tr>' +
        '<td><span class="mk-code">' + esc(c.code) + '</span></td>' +
        '<td>' + esc(c.sponsorName) + '</td>' +
        '<td>' + esc(c.campaignName) + '</td>' +
        '<td><strong>' + esc(descText) + '</strong></td>' +
        '<td style="font-size:12px;">' + esc(vigencia) + '</td>' +
        '<td>' + badgeEstado(c.status) + '</td>' +
        '<td class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" data-action="cup-edit" data-id="' + esc(c.id) + '">Editar</button>' +
          '<button class="btn btn-danger btn-sm" data-action="cup-del" data-id="' + esc(c.id) + '">Eliminar</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  document.getElementById('mk-cup-filtro-sponsor') && document.getElementById('mk-cup-filtro-sponsor').addEventListener('change', cargarCupones);
  document.getElementById('mk-cup-filtro-estado')  && document.getElementById('mk-cup-filtro-estado').addEventListener('change', renderCupones);

  document.getElementById('mk-cupones-body') && document.getElementById('mk-cupones-body').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var cup = coupons.find(function (c) { return c.id === id; });

    if (btn.getAttribute('data-action') === 'cup-edit') {
      if (!cup) return;
      // Cargar campañas en el select del modal
      await cargarCampanasEnSelectCupon();
      document.getElementById('cupon-id').value        = cup.id;
      document.getElementById('cupon-campana').value   = cup.campaignId;
      document.getElementById('cupon-codigo').value    = cup.code;
      document.getElementById('cupon-tipo').value      = cup.discountType;
      document.getElementById('cupon-valor').value     = cup.discountValue;
      document.getElementById('cupon-inicio').value    = cup.startDate || '';
      document.getElementById('cupon-fin').value       = cup.endDate || '';
      document.getElementById('cupon-estado').value    = cup.status;
      document.getElementById('modal-cupon-title').textContent = 'Editar cupón';
      clearErr('form-cupon-error');
      document.getElementById('modal-overlay-cupon').classList.add('open');
    } else if (btn.getAttribute('data-action') === 'cup-del') {
      if (!confirm('¿Eliminar el cupón "' + (cup ? cup.code : '') + '"?')) return;
      try {
        await api('/api/admin/coupons/' + id, { method: 'DELETE' });
        await cargarCupones();
      } catch (err) { alert(err.message); }
    }
  });

  async function cargarCampanasEnSelectCupon() {
    var sel = document.getElementById('cupon-campana');
    if (!sel) return;
    try {
      var camps = await api('/api/admin/campaigns');
      while (sel.options.length > 1) sel.remove(1);
      camps.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.sponsorName + ' · ' + c.name;
        sel.appendChild(opt);
      });
    } catch (e) { console.error(e); }
  }

  document.getElementById('mk-cup-nuevo-btn') && document.getElementById('mk-cup-nuevo-btn').addEventListener('click', async function () {
    await cargarCampanasEnSelectCupon();
    document.getElementById('cupon-id').value      = '';
    document.getElementById('cupon-campana').value = '';
    document.getElementById('cupon-codigo').value  = '';
    document.getElementById('cupon-tipo').value    = 'porcentaje';
    document.getElementById('cupon-valor').value   = '';
    document.getElementById('cupon-inicio').value  = '';
    document.getElementById('cupon-fin').value     = '';
    document.getElementById('cupon-estado').value  = 'activo';
    document.getElementById('modal-cupon-title').textContent = 'Nuevo cupón';
    clearErr('form-cupon-error');
    document.getElementById('modal-overlay-cupon').classList.add('open');
  });

  document.getElementById('modal-cupon-close') && document.getElementById('modal-cupon-close').addEventListener('click', function () {
    document.getElementById('modal-overlay-cupon').classList.remove('open');
  });
  document.getElementById('cancelar-cupon-btn') && document.getElementById('cancelar-cupon-btn').addEventListener('click', function () {
    document.getElementById('modal-overlay-cupon').classList.remove('open');
  });

  document.getElementById('cupon-form') && document.getElementById('cupon-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    clearErr('form-cupon-error');
    var id = document.getElementById('cupon-id').value;
    var body = {
      campaignId:    document.getElementById('cupon-campana').value,
      code:          document.getElementById('cupon-codigo').value.trim().toUpperCase(),
      discountType:  document.getElementById('cupon-tipo').value,
      discountValue: document.getElementById('cupon-valor').value,
      startDate:     document.getElementById('cupon-inicio').value,
      endDate:       document.getElementById('cupon-fin').value,
      status:        document.getElementById('cupon-estado').value,
    };
    try {
      if (id) {
        await api('/api/admin/coupons/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await api('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      document.getElementById('modal-overlay-cupon').classList.remove('open');
      await cargarCupones();
    } catch (err) { showErr('form-cupon-error', err.message); }
  });

  // ---------- Enganche con el sistema de tabs principal ----------
  // admin.js gestiona los tabs. Cuando el usuario hace clic en "Marketing",
  // necesitamos inicializar el módulo. Usamos un MutationObserver para
  // detectar cuando el panel de marketing se vuelve visible.
  function initObserver() {
    var panel = document.getElementById('tab-marketing');
    if (!panel) return;

    // Si ya está activo al cargar (poco probable), inicializar ahora.
    if (panel.classList.contains('active')) {
      onMarketingTabOpen();
      return;
    }

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (panel.classList.contains('active')) {
            onMarketingTabOpen();
          }
        }
      });
    });
    observer.observe(panel, { attributes: true });
  }

  // Inicializar sub-tabs de Marketing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initMarketingTabs();
      initObserver();
    });
  } else {
    initMarketingTabs();
    initObserver();
  }
})();
