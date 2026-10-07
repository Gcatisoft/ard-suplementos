/**
 * ARD Suplementos — Módulo de Envíos (panel admin)
 * Zonas de Catamarca Capital · Puntos de retiro · Envío gratis ·
 * Tiempos de entrega · Interior / Resto del país · Preguntas frecuentes
 */
(function () {
  'use strict';

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function fmt(n) {
    try {
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);
    } catch (e) { return '$' + (n || 0); }
  }

  async function api(path, opts) {
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Error de servidor');
    return data;
  }

  function mostrarGuardado(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = '';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 2000);
  }

  // ==================================================
  // Zonas de envío (Catamarca Capital)
  // ==================================================
  let zonas = [];
  let editandoZonaId = null;

  async function cargarZonas() {
    const body = document.getElementById('zonas-tabla-body');
    const empty = document.getElementById('zonas-empty-state');
    try {
      zonas = await api('/api/admin/shipping/zones');
      renderZonas();
    } catch (e) {
      console.error('Error al cargar las zonas de envío:', e);
      body.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = 'No se pudieron cargar las zonas.';
    }
  }

  function renderZonas() {
    const body = document.getElementById('zonas-tabla-body');
    const empty = document.getElementById('zonas-empty-state');
    if (!zonas.length) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    body.innerHTML = zonas.map((z, i) => (
      '<tr>' +
        '<td>' + esc(z.name) + '</td>' +
        '<td>' + fmt(z.price) + '</td>' +
        '<td><span class="estado-badge ' + (z.active ? 'confirmado' : 'pendiente') + '">' + (z.active ? 'Activa' : 'Oculta') + '</span></td>' +
        '<td><div class="row-actions">' +
          '<button type="button" class="icon-btn" data-mover-zona="' + z.id + '" data-direccion="up" ' + (i === 0 ? 'disabled' : '') + ' title="Subir">↑</button>' +
          '<button type="button" class="icon-btn" data-mover-zona="' + z.id + '" data-direccion="down" ' + (i === zonas.length - 1 ? 'disabled' : '') + ' title="Bajar">↓</button>' +
        '</div></td>' +
        '<td><div class="row-actions">' +
          '<button type="button" class="icon-btn" data-editar-zona="' + z.id + '" title="Editar">✎</button>' +
          '<button type="button" class="icon-btn danger" data-borrar-zona="' + z.id + '" title="Eliminar">🗑</button>' +
        '</div></td>' +
      '</tr>'
    )).join('');

    body.querySelectorAll('[data-mover-zona]').forEach((btn) => {
      btn.addEventListener('click', () => moverZona(btn.getAttribute('data-mover-zona'), btn.getAttribute('data-direccion')));
    });
    body.querySelectorAll('[data-editar-zona]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalZona(btn.getAttribute('data-editar-zona')));
    });
    body.querySelectorAll('[data-borrar-zona]').forEach((btn) => {
      btn.addEventListener('click', () => borrarZona(btn.getAttribute('data-borrar-zona')));
    });
  }

  async function moverZona(id, direccion) {
    try {
      await api('/api/admin/shipping/zones/' + id + '/mover', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction: direccion }),
      });
      await cargarZonas();
    } catch (e) { alert(e.message || 'No se pudo reordenar'); }
  }

  async function borrarZona(id) {
    const z = zonas.find((x) => x.id === id);
    if (!z || !confirm('¿Eliminar la zona "' + z.name + '"?')) return;
    try {
      await api('/api/admin/shipping/zones/' + id, { method: 'DELETE' });
      await cargarZonas();
    } catch (e) { alert(e.message || 'No se pudo eliminar'); }
  }

  function abrirModalZona(id) {
    editandoZonaId = id || null;
    const z = id ? zonas.find((x) => x.id === id) : null;
    document.getElementById('modal-zona-title').textContent = z ? 'Editar zona' : 'Nueva zona';
    document.getElementById('zona-nombre').value = z ? z.name : '';
    document.getElementById('zona-precio').value = z ? z.price : '';
    document.getElementById('zona-activa').checked = z ? !!z.active : true;
    document.getElementById('form-zona-error').classList.remove('visible');
    document.getElementById('modal-overlay-zona').classList.add('visible');
  }

  function cerrarModalZona() {
    document.getElementById('modal-overlay-zona').classList.remove('visible');
  }

  async function guardarZona(e) {
    e.preventDefault();
    const errorEl = document.getElementById('form-zona-error');
    errorEl.classList.remove('visible');
    const nombre = document.getElementById('zona-nombre').value.trim();
    const precio = document.getElementById('zona-precio').value;
    const activa = document.getElementById('zona-activa').checked;
    if (!nombre || precio === '') {
      errorEl.textContent = 'Completá el nombre y el precio.';
      errorEl.classList.add('visible');
      return;
    }
    try {
      const payload = { name: nombre, price: precio, active: activa };
      if (editandoZonaId) {
        await api('/api/admin/shipping/zones/' + editandoZonaId, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      } else {
        await api('/api/admin/shipping/zones', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      }
      cerrarModalZona();
      await cargarZonas();
    } catch (e) {
      errorEl.textContent = e.message || 'No se pudo guardar la zona.';
      errorEl.classList.add('visible');
    }
  }

  // ==================================================
  // Puntos de retiro
  // ==================================================
  let puntos = [];
  let editandoPuntoId = null;

  async function cargarPuntos() {
    const body = document.getElementById('puntos-tabla-body');
    const empty = document.getElementById('puntos-empty-state');
    try {
      puntos = await api('/api/admin/shipping/pickup-points');
      renderPuntos();
    } catch (e) {
      console.error('Error al cargar los puntos de retiro:', e);
      body.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = 'No se pudieron cargar los puntos de retiro.';
    }
  }

  function renderPuntos() {
    const body = document.getElementById('puntos-tabla-body');
    const empty = document.getElementById('puntos-empty-state');
    if (!puntos.length) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    body.innerHTML = puntos.map((p, i) => (
      '<tr>' +
        '<td>' + esc(p.name) + '</td>' +
        '<td>' + esc(p.address) + '</td>' +
        '<td>' + esc(p.schedule) + '</td>' +
        '<td><span class="estado-badge ' + (p.active ? 'confirmado' : 'pendiente') + '">' + (p.active ? 'Activo' : 'Oculto') + '</span></td>' +
        '<td><div class="row-actions">' +
          '<button type="button" class="icon-btn" data-mover-punto="' + p.id + '" data-direccion="up" ' + (i === 0 ? 'disabled' : '') + ' title="Subir">↑</button>' +
          '<button type="button" class="icon-btn" data-mover-punto="' + p.id + '" data-direccion="down" ' + (i === puntos.length - 1 ? 'disabled' : '') + ' title="Bajar">↓</button>' +
        '</div></td>' +
        '<td><div class="row-actions">' +
          '<button type="button" class="icon-btn" data-editar-punto="' + p.id + '" title="Editar">✎</button>' +
          '<button type="button" class="icon-btn danger" data-borrar-punto="' + p.id + '" title="Eliminar">🗑</button>' +
        '</div></td>' +
      '</tr>'
    )).join('');

    body.querySelectorAll('[data-mover-punto]').forEach((btn) => {
      btn.addEventListener('click', () => moverPunto(btn.getAttribute('data-mover-punto'), btn.getAttribute('data-direccion')));
    });
    body.querySelectorAll('[data-editar-punto]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalPunto(btn.getAttribute('data-editar-punto')));
    });
    body.querySelectorAll('[data-borrar-punto]').forEach((btn) => {
      btn.addEventListener('click', () => borrarPunto(btn.getAttribute('data-borrar-punto')));
    });
  }

  async function moverPunto(id, direccion) {
    try {
      await api('/api/admin/shipping/pickup-points/' + id + '/mover', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction: direccion }),
      });
      await cargarPuntos();
    } catch (e) { alert(e.message || 'No se pudo reordenar'); }
  }

  async function borrarPunto(id) {
    const p = puntos.find((x) => x.id === id);
    if (!p || !confirm('¿Eliminar el punto de retiro "' + p.name + '"?')) return;
    try {
      await api('/api/admin/shipping/pickup-points/' + id, { method: 'DELETE' });
      await cargarPuntos();
    } catch (e) { alert(e.message || 'No se pudo eliminar'); }
  }

  function abrirModalPunto(id) {
    editandoPuntoId = id || null;
    const p = id ? puntos.find((x) => x.id === id) : null;
    document.getElementById('modal-punto-title').textContent = p ? 'Editar punto de retiro' : 'Nuevo punto de retiro';
    document.getElementById('punto-nombre').value = p ? p.name : '';
    document.getElementById('punto-direccion').value = p ? p.address : '';
    document.getElementById('punto-descripcion').value = p ? p.description : '';
    document.getElementById('punto-horario').value = p ? p.schedule : '';
    document.getElementById('punto-activo').checked = p ? !!p.active : true;
    document.getElementById('form-punto-error').classList.remove('visible');
    document.getElementById('modal-overlay-punto').classList.add('visible');
  }

  function cerrarModalPunto() {
    document.getElementById('modal-overlay-punto').classList.remove('visible');
  }

  async function guardarPunto(e) {
    e.preventDefault();
    const errorEl = document.getElementById('form-punto-error');
    errorEl.classList.remove('visible');
    const nombre = document.getElementById('punto-nombre').value.trim();
    if (!nombre) {
      errorEl.textContent = 'Completá el nombre del punto de retiro.';
      errorEl.classList.add('visible');
      return;
    }
    const payload = {
      name: nombre,
      address: document.getElementById('punto-direccion').value.trim(),
      description: document.getElementById('punto-descripcion').value.trim(),
      schedule: document.getElementById('punto-horario').value.trim(),
      active: document.getElementById('punto-activo').checked,
    };
    try {
      if (editandoPuntoId) {
        await api('/api/admin/shipping/pickup-points/' + editandoPuntoId, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      } else {
        await api('/api/admin/shipping/pickup-points', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      }
      cerrarModalPunto();
      await cargarPuntos();
    } catch (e) {
      errorEl.textContent = e.message || 'No se pudo guardar el punto de retiro.';
      errorEl.classList.add('visible');
    }
  }

  // ==================================================
  // Preguntas frecuentes de envíos
  // ==================================================
  let faqs = [];
  let editandoFaqId = null;

  async function cargarFaqs() {
    const body = document.getElementById('faqs-tabla-body');
    const empty = document.getElementById('faqs-empty-state');
    try {
      faqs = await api('/api/admin/shipping/faqs');
      renderFaqs();
    } catch (e) {
      console.error('Error al cargar las preguntas frecuentes:', e);
      body.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = 'No se pudieron cargar las preguntas frecuentes.';
    }
  }

  function truncar(str, n) {
    str = String(str || '');
    return str.length > n ? str.slice(0, n) + '…' : str;
  }

  function renderFaqs() {
    const body = document.getElementById('faqs-tabla-body');
    const empty = document.getElementById('faqs-empty-state');
    if (!faqs.length) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    body.innerHTML = faqs.map((f, i) => (
      '<tr>' +
        '<td>' + esc(f.question) + '</td>' +
        '<td>' + esc(truncar(f.answer, 80)) + '</td>' +
        '<td><div class="row-actions">' +
          '<button type="button" class="icon-btn" data-mover-faq="' + f.id + '" data-direccion="up" ' + (i === 0 ? 'disabled' : '') + ' title="Subir">↑</button>' +
          '<button type="button" class="icon-btn" data-mover-faq="' + f.id + '" data-direccion="down" ' + (i === faqs.length - 1 ? 'disabled' : '') + ' title="Bajar">↓</button>' +
        '</div></td>' +
        '<td><div class="row-actions">' +
          '<button type="button" class="icon-btn" data-editar-faq="' + f.id + '" title="Editar">✎</button>' +
          '<button type="button" class="icon-btn danger" data-borrar-faq="' + f.id + '" title="Eliminar">🗑</button>' +
        '</div></td>' +
      '</tr>'
    )).join('');

    body.querySelectorAll('[data-mover-faq]').forEach((btn) => {
      btn.addEventListener('click', () => moverFaq(btn.getAttribute('data-mover-faq'), btn.getAttribute('data-direccion')));
    });
    body.querySelectorAll('[data-editar-faq]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalFaq(btn.getAttribute('data-editar-faq')));
    });
    body.querySelectorAll('[data-borrar-faq]').forEach((btn) => {
      btn.addEventListener('click', () => borrarFaq(btn.getAttribute('data-borrar-faq')));
    });
  }

  async function moverFaq(id, direccion) {
    try {
      await api('/api/admin/shipping/faqs/' + id + '/mover', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction: direccion }),
      });
      await cargarFaqs();
    } catch (e) { alert(e.message || 'No se pudo reordenar'); }
  }

  async function borrarFaq(id) {
    if (!confirm('¿Eliminar esta pregunta frecuente?')) return;
    try {
      await api('/api/admin/shipping/faqs/' + id, { method: 'DELETE' });
      await cargarFaqs();
    } catch (e) { alert(e.message || 'No se pudo eliminar'); }
  }

  function abrirModalFaq(id) {
    editandoFaqId = id || null;
    const f = id ? faqs.find((x) => x.id === id) : null;
    document.getElementById('modal-faq-title').textContent = f ? 'Editar pregunta' : 'Nueva pregunta';
    document.getElementById('faq-pregunta').value = f ? f.question : '';
    document.getElementById('faq-respuesta').value = f ? f.answer : '';
    document.getElementById('form-faq-error').classList.remove('visible');
    document.getElementById('modal-overlay-faq').classList.add('visible');
  }

  function cerrarModalFaq() {
    document.getElementById('modal-overlay-faq').classList.remove('visible');
  }

  async function guardarFaq(e) {
    e.preventDefault();
    const errorEl = document.getElementById('form-faq-error');
    errorEl.classList.remove('visible');
    const pregunta = document.getElementById('faq-pregunta').value.trim();
    if (!pregunta) {
      errorEl.textContent = 'Completá la pregunta.';
      errorEl.classList.add('visible');
      return;
    }
    const payload = { question: pregunta, answer: document.getElementById('faq-respuesta').value.trim() };
    try {
      if (editandoFaqId) {
        await api('/api/admin/shipping/faqs/' + editandoFaqId, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      } else {
        await api('/api/admin/shipping/faqs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      }
      cerrarModalFaq();
      await cargarFaqs();
    } catch (e) {
      errorEl.textContent = e.message || 'No se pudo guardar la pregunta.';
      errorEl.classList.add('visible');
    }
  }

  // ==================================================
  // Configuración (app_settings): envío gratis, tiempos, interior, nacional
  // ==================================================
  async function cargarSettingsEnvio() {
    try {
      const filas = await api('/api/admin/settings');
      const porKey = {};
      filas.forEach((r) => { porKey[r.key] = r.value; });

      const setVal = (id, key, def) => {
        const el = document.getElementById(id);
        if (el) el.value = porKey[key] !== undefined ? porKey[key] : def;
      };
      setVal('cfg-envio-gratis-monto', 'envio_gratis_monto_capital', '120000');
      setVal('cfg-envio-tiempos-titulo', 'envio_tiempos_titulo', '🚚 Tiempos de entrega');
      setVal('cfg-envio-tiempos-texto', 'envio_tiempos_texto', '');
      setVal('cfg-envio-interior-titulo', 'envio_interior_titulo', '📦 Envíos al interior de Catamarca');
      setVal('cfg-envio-interior-texto', 'envio_interior_texto', '');
      setVal('cfg-envio-nacional-titulo', 'envio_nacional_titulo', '🇦🇷 Envíos a todo el país');
      setVal('cfg-envio-nacional-texto', 'envio_nacional_texto', '');
    } catch (e) {
      console.error('Error al cargar la configuración de envíos:', e);
    }
  }

  async function guardarSetting(key, value) {
    return api('/api/admin/settings/' + key, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: String(value) }),
    });
  }

  function wireGuardarBtn(btnId, statusId, pares) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Promise.all(pares.map(([id, key]) => guardarSetting(key, document.getElementById(id).value)));
        mostrarGuardado(statusId);
      } catch (e) {
        alert(e.message || 'No se pudo guardar');
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ==================================================
  // Inicialización
  // ==================================================
  function wireModales() {
    document.getElementById('nueva-zona-btn').addEventListener('click', () => abrirModalZona(null));
    document.getElementById('zona-form').addEventListener('submit', guardarZona);
    document.getElementById('modal-zona-close').addEventListener('click', cerrarModalZona);
    document.getElementById('cancelar-zona-btn').addEventListener('click', cerrarModalZona);
    document.getElementById('modal-overlay-zona').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay-zona') cerrarModalZona();
    });

    document.getElementById('nuevo-punto-btn').addEventListener('click', () => abrirModalPunto(null));
    document.getElementById('punto-form').addEventListener('submit', guardarPunto);
    document.getElementById('modal-punto-close').addEventListener('click', cerrarModalPunto);
    document.getElementById('cancelar-punto-btn').addEventListener('click', cerrarModalPunto);
    document.getElementById('modal-overlay-punto').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay-punto') cerrarModalPunto();
    });

    document.getElementById('nueva-faq-btn').addEventListener('click', () => abrirModalFaq(null));
    document.getElementById('faq-form').addEventListener('submit', guardarFaq);
    document.getElementById('modal-faq-close').addEventListener('click', cerrarModalFaq);
    document.getElementById('cancelar-faq-btn').addEventListener('click', cerrarModalFaq);
    document.getElementById('modal-overlay-faq').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay-faq') cerrarModalFaq();
    });

    wireGuardarBtn('cfg-envio-gratis-guardar-btn', 'cfg-envio-gratis-status', [
      ['cfg-envio-gratis-monto', 'envio_gratis_monto_capital'],
    ]);
    wireGuardarBtn('cfg-envio-tiempos-guardar-btn', 'cfg-envio-tiempos-status', [
      ['cfg-envio-tiempos-titulo', 'envio_tiempos_titulo'],
      ['cfg-envio-tiempos-texto', 'envio_tiempos_texto'],
    ]);
    wireGuardarBtn('cfg-envio-interior-guardar-btn', 'cfg-envio-interior-status', [
      ['cfg-envio-interior-titulo', 'envio_interior_titulo'],
      ['cfg-envio-interior-texto', 'envio_interior_texto'],
    ]);
    wireGuardarBtn('cfg-envio-nacional-guardar-btn', 'cfg-envio-nacional-status', [
      ['cfg-envio-nacional-titulo', 'envio_nacional_titulo'],
      ['cfg-envio-nacional-texto', 'envio_nacional_texto'],
    ]);
  }

  function onEnviosTabOpen() {
    cargarZonas();
    cargarPuntos();
    cargarFaqs();
    cargarSettingsEnvio();
  }

  // El tab principal "Envíos" vive en admin.js (tabPanels); acá solo
  // observamos cuándo se activa para cargar los datos, igual que marketing.js.
  function initObserver() {
    const panel = document.getElementById('tab-envios');
    if (!panel) return;
    if (panel.classList.contains('active')) { onEnviosTabOpen(); return; }
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'class' && panel.classList.contains('active')) {
          onEnviosTabOpen();
        }
      });
    });
    observer.observe(panel, { attributes: true });
  }

  function init() {
    wireModales();
    initObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
