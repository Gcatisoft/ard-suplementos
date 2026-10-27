/**
 * ARD Suplementos — Módulo de Envíos (panel admin)
 * Resumen · Pedidos con envío (estado y seguimiento) · Zonas de Catamarca
 * Capital · Puntos de retiro · Envío gratis · Tiempos de entrega ·
 * Interior / Resto del país · Andreani · Preguntas frecuentes
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
      ANDREANI_CAMPOS.forEach(([id, key, def]) => setVal(id, key, def));
      envioGratisMonto = Number(porKey.envio_gratis_monto_capital) || 0;
      try { andreaniTarifas = JSON.parse(porKey.andreani_tarifas_manuales || '{}') || {}; } catch (e) { andreaniTarifas = {}; }
      renderTablasTarifas();
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
  // Andreani: estado de la API (.env), bulto, recargo y tarifas manuales
  // ==================================================
  const ANDREANI_CAMPOS = [
    ['cfg-andreani-peso', 'andreani_peso_default_kg', '1'],
    ['cfg-andreani-volumen', 'andreani_volumen_default_cm3', '3000'],
    ['cfg-andreani-recargo', 'andreani_recargo_pct', '0'],
  ];

  // Tabla de tarifas manuales: regiones × tramos de peso, una por servicio.
  let andreaniRegiones = [];
  let andreaniTramos = [];
  let andreaniTarifas = {};

  function renderTablasTarifas() {
    const cont = document.getElementById('andreani-tarifas-tablas');
    if (!cont || !andreaniRegiones.length) return;
    const cols = andreaniTramos.map((t) => 'Hasta ' + t + ' kg').concat('$ por kg extra (+' + andreaniTramos[andreaniTramos.length - 1] + ' kg)');
    cont.innerHTML = [['domicilio', '🏠 A domicilio'], ['sucursal', '🏢 A sucursal Andreani']].map(([serv, titulo]) =>
      '<div class="cfg-subtitulo" style="margin-top:6px;">' + titulo + '</div>' +
      '<div class="tarifas-scroll"><table class="tarifas-tabla">' +
        '<thead><tr><th>Región</th>' + cols.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead>' +
        '<tbody>' + andreaniRegiones.map((r) => {
          const fila = (andreaniTarifas[r.id] && andreaniTarifas[r.id][serv]) || [];
          return '<tr><td class="region">' + esc(r.nombre) + '<small>' + esc(r.provincias.join(', ')) + '</small></td>' +
            cols.map((_, i) => '<td><input type="number" min="0" step="100" placeholder="—" data-region="' + r.id +
              '" data-servicio="' + serv + '" data-col="' + i + '" value="' + (Number(fila[i]) > 0 ? Number(fila[i]) : '') + '"></td>').join('') +
          '</tr>';
        }).join('') + '</tbody>' +
      '</table></div>'
    ).join('');
  }

  function leerTablasTarifas() {
    const tabla = {};
    document.querySelectorAll('#andreani-tarifas-tablas input[data-region]').forEach((inp) => {
      const r = inp.dataset.region;
      const s = inp.dataset.servicio;
      tabla[r] = tabla[r] || {};
      tabla[r][s] = tabla[r][s] || [];
      tabla[r][s][Number(inp.dataset.col)] = Math.max(0, Number(inp.value) || 0);
    });
    return tabla;
  }

  async function cargarEstadoAndreani() {
    const el = document.getElementById('andreani-estado');
    if (!el) return;
    try {
      const e = await api('/api/admin/shipping/andreani/estado');
      andreaniEstado = e;
      andreaniRegiones = e.regiones || [];
      andreaniTramos = e.tramosKg || [];
      renderTablasTarifas();
      const ok = (v) => (v ? '✅' : '❌');
      el.innerHTML = e.apiConfigurada
        ? '<strong style="color:#1a7a44;">Cotización en vivo activa</strong> (' + esc(e.apiUrl) + ') · ' +
          ok(e.contratoDomicilio) + ' contrato a domicilio · ' + ok(e.contratoSucursal) + ' contrato a sucursal · ' +
          ok(e.credenciales) + ' usuario/contraseña' + (e.sucursalOrigen ? ' · origen ' + esc(e.sucursalOrigen) : '')
        : '<strong style="color:#b7791f;">Sin contrato con Andreani</strong> — el checkout usa la tabla de tarifas manuales de abajo. ' +
          'Cuando tengas contrato, ' +
          'cargá <code>ANDREANI_CLIENTE</code> y <code>ANDREANI_CONTRATO_DOMICILIO</code> / <code>ANDREANI_CONTRATO_SUCURSAL</code> ' +
          'en el <code>.env</code> (ver README) y reiniciá el servidor.';
    } catch (err) {
      el.textContent = 'No se pudo leer el estado de Andreani.';
    }
  }

  async function probarAndreani() {
    const btn = document.getElementById('andreani-probar-btn');
    const out = document.getElementById('andreani-probar-resultado');
    const cp = document.getElementById('andreani-probar-cp').value.trim();
    const provincia = document.getElementById('andreani-probar-provincia').value.trim();
    const kilos = document.getElementById('andreani-probar-kilos').value;
    btn.disabled = true;
    out.textContent = 'Cotizando…';
    try {
      const r = await api('/api/admin/shipping/andreani/probar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cp, provincia, kilos }),
      });
      const linea = (nombre, c) => nombre + ': <strong>' + (c.precio != null ? fmt(c.precio) : 'A coordinar') + '</strong>' +
        (c.fuente ? ' <em>(' + (c.fuente === 'andreani' ? 'API Andreani' : 'tarifa manual') + ')</em>' : '') +
        (c.error ? ' <span style="color:#c0392b;">— error de la API: ' + esc(c.error) + '</span>' : '');
      out.innerHTML =
        'Bulto de prueba: ' + r.bulto.kilos + ' kg · ' + r.bulto.volumen + ' cm³' +
        (r.region ? ' · región <strong>' + esc(r.region) + '</strong>' : ' · <span style="color:#c0392b;">provincia sin región (revisá el nombre)</span>') + '<br>' +
        linea('A domicilio', r.domicilio) + '<br>' +
        linea('A sucursal', r.sucursal) + '<br>' +
        (r.errorSucursales
          ? '<span style="color:#c0392b;">Sucursales: ' + esc(r.errorSucursales) + '</span>'
          : 'Sucursales encontradas para ese destino: ' + r.sucursales);
    } catch (e) {
      out.innerHTML = '<span style="color:#c0392b;">' + esc(e.message) + '</span>';
    } finally {
      btn.disabled = false;
    }
  }

  // ==================================================
  // Sub-pestañas, resumen y pedidos con envío
  // ==================================================
  const METODOS_ENVIO = {
    andreani_domicilio: ['Andreani · domicilio', 'andreani'],
    andreani_sucursal: ['Andreani · sucursal', 'andreani'],
    domicilio: ['Capital · domicilio', 'domicilio'],
    retiro: ['Retiro en punto ARD', 'retiro'],
  };
  const ESTADOS_ENVIO_TXT = {
    pendiente: 'Pendiente', preparado: 'Preparado', despachado: 'Despachado', entregado: 'Entregado',
  };

  function badgeMetodo(m) {
    const [txt, cls] = METODOS_ENVIO[m] || ['—', ''];
    return '<span class="env-metodo ' + cls + '">' + esc(txt) + '</span>';
  }

  function numeroPedido(p) {
    return '#' + String(p.orderNumber || '').padStart(4, '0');
  }

  function fechaCorta(iso) {
    try {
      return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  // Destino legible del pedido: { principal, sub }.
  function destinoPedido(p) {
    const d = p.shippingData || {};
    if (p.shippingMethod === 'retiro') return { principal: d.punto || 'Punto ARD', sub: d.direccion || '' };
    if (p.shippingMethod === 'domicilio') return { principal: 'Zona ' + (d.zona || '—'), sub: d.direccion || '' };
    const principal = [d.localidad, d.provincia].filter(Boolean).join(', ') + (d.cp ? ' (CP ' + d.cp + ')' : '');
    const sub = p.shippingMethod === 'andreani_sucursal'
      ? 'Sucursal: ' + ((d.sucursal && d.sucursal.nombre) || 'a elegir') + (d.sucursal && d.sucursal.direccion ? ' — ' + d.sucursal.direccion : '')
      : (d.direccion || '');
    return { principal: principal || '—', sub };
  }

  function costoEnvioTxt(p) {
    const d = p.shippingData || {};
    if (p.shippingCost > 0) return fmt(p.shippingCost);
    if (p.shippingMethod === 'retiro' || d.gratis) return 'Gratis';
    return 'A coordinar';
  }

  function irASubtab(tab) {
    document.querySelectorAll('[data-envtab]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-envtab') === tab));
    document.querySelectorAll('.env-panel').forEach((p) => p.classList.toggle('active', p.id === 'env-' + tab));
    if (tab === 'pedidos') cargarPedidosEnvio();
    if (tab === 'resumen') cargarResumenEnvios();
  }

  function mostrarAvisoMigracion(mostrar) {
    const el = document.getElementById('env-migracion-aviso');
    if (el) el.style.display = mostrar ? '' : 'none';
  }

  // ---------- Resumen ----------
  let andreaniEstado = null;
  let envioGratisMonto = 0;

  async function cargarResumenEnvios() {
    try {
      const r = await api('/api/admin/shipping/resumen');
      mostrarAvisoMigracion(!!r.migracionPendiente || r.estadoEnvioDisponible === false);
      const st = r.stats || { porMetodo: {} };
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('env-stat-preparar', st.aPreparar || 0);
      set('env-stat-camino', st.enCamino || 0);
      set('env-stat-entregados', st.entregados || 0);
      set('env-stat-mes', st.mes || 0);
      set('env-stat-cobrado', fmt(st.cobrado || 0));

      const badge = document.getElementById('env-badge-preparar');
      if (badge) {
        badge.textContent = st.aPreparar || '';
        badge.style.display = st.aPreparar ? '' : 'none';
      }

      const prep = document.getElementById('env-resumen-preparar');
      const lista = r.aPreparar || [];
      prep.innerHTML = lista.length
        ? '<ul class="env-lista">' + lista.map((p) => {
            const dest = destinoPedido(p);
            return '<li><span><strong>' + numeroPedido(p) + '</strong> · ' + esc(p.customerName) +
              '<span class="sub">' + esc(dest.principal) + '</span></span>' +
              '<span style="text-align:right;">' + badgeMetodo(p.shippingMethod) +
              '<span class="sub"><button type="button" class="btn btn-ghost btn-sm" data-gestionar-envio="' + p.id + '" style="width:auto;margin-top:4px;">Gestionar</button></span></span></li>';
          }).join('') + '</ul>'
        : '<div class="env-vacio">🎉 No hay envíos pendientes de preparar.</div>';
      prep.querySelectorAll('[data-gestionar-envio]').forEach((btn) => {
        const p = lista.find((x) => x.id === btn.getAttribute('data-gestionar-envio'));
        btn.addEventListener('click', () => abrirModalEnvio(p));
      });

      const metodos = st.porMetodo || {};
      const totalMet = Object.values(metodos).reduce((a, b) => a + b, 0);
      document.getElementById('env-resumen-metodos').innerHTML = totalMet
        ? '<ul class="env-lista">' + Object.keys(METODOS_ENVIO).map((m) => {
            const n = metodos[m] || 0;
            const pct = Math.round((n / totalMet) * 100);
            return '<li style="display:block;"><div style="display:flex;justify-content:space-between;">' + badgeMetodo(m) +
              '<span><strong>' + n + '</strong> <span style="color:#6b7686;">(' + pct + '%)</span></span></div>' +
              '<div class="env-barra"><span style="width:' + pct + '%"></span></div></li>';
          }).join('') + '</ul>'
        : '<div class="env-vacio">Todavía no hay pedidos con envío.</div>';

      const destinos = r.destinos || [];
      document.getElementById('env-resumen-destinos').innerHTML = destinos.length
        ? '<ul class="env-lista">' + destinos.map((d) =>
            '<li><span>' + esc(d.localidad) + '<span class="sub">' + esc(d.provincia) + '</span></span>' +
            '<span style="text-align:right;"><strong>' + d.envios + '</strong> ' + (d.envios === 1 ? 'envío' : 'envíos') +
            '<span class="sub">' + fmt(d.costo) + '</span></span></li>'
          ).join('') + '</ul>'
        : '<div class="env-vacio">Todavía no hay envíos con Andreani.</div>';
    } catch (e) {
      console.error('Error al cargar el resumen de envíos:', e);
    }
  }

  // Checklist de configuración (usa lo que ya cargaron las otras secciones).
  function renderChecklistConfig() {
    const ul = document.getElementById('env-resumen-config');
    if (!ul) return;
    const regionesCargadas = andreaniRegiones.filter((r) => {
      const t = andreaniTarifas[r.id] || {};
      return [].concat(t.domicilio || [], t.sucursal || []).some((n) => Number(n) > 0);
    }).length;
    const zonasActivas = zonas.filter((z) => z.active).length;
    const puntosActivos = puntos.filter((p) => p.active).length;
    const item = (ok, titulo, detalle, tab) => '<li><span>' + (ok === true ? '✅' : ok === false ? '❌' : '⚠️') + ' ' + esc(titulo) +
      '<span class="sub">' + detalle + '</span></span><button type="button" data-ir-envtab="' + tab + '">Configurar →</button></li>';
    const andreaniOk = andreaniEstado && andreaniEstado.apiConfigurada;
    ul.innerHTML = [
      andreaniOk
        ? item(true, 'Andreani', 'Cotización en vivo con tu contrato.', 'andreani')
        : item(regionesCargadas === andreaniRegiones.length && regionesCargadas > 0 ? true : regionesCargadas ? null : false,
            'Andreani (tarifas manuales)', regionesCargadas + ' de ' + andreaniRegiones.length + ' regiones con precio. Las vacías se muestran "A coordinar".', 'andreani'),
      item(zonasActivas > 0 ? true : false, 'Zonas de Catamarca Capital', zonasActivas + ' zona' + (zonasActivas === 1 ? '' : 's') + ' activa' + (zonasActivas === 1 ? '' : 's') + '.', 'capital'),
      item(envioGratisMonto > 0 ? true : null, 'Envío gratis en Capital', envioGratisMonto > 0 ? 'Desde ' + fmt(envioGratisMonto) + '.' : 'Sin monto configurado.', 'capital'),
      item(puntosActivos > 0 ? true : null, 'Puntos de retiro', puntosActivos + ' activo' + (puntosActivos === 1 ? '' : 's') + '.', 'retiro'),
      item(faqs.length > 0 ? true : null, 'Preguntas frecuentes', faqs.length + ' pregunta' + (faqs.length === 1 ? '' : 's') + ' en la página de envíos.', 'textos'),
    ].join('');
  }

  // ---------- Pedidos con envío (filtros + paginación) ----------
  let pedidosEnvio = [];
  let paginaEnvios = 1;
  let busquedaTimer = null;

  async function cargarPedidosEnvio() {
    const body = document.getElementById('env-pedidos-body');
    const empty = document.getElementById('env-pedidos-empty');
    const params = new URLSearchParams({
      q: document.getElementById('env-filtro-q').value.trim(),
      metodo: document.getElementById('env-filtro-metodo').value,
      estadoEnvio: document.getElementById('env-filtro-estado').value,
      pedido: document.getElementById('env-filtro-pedido').value,
      page: String(paginaEnvios),
    });
    body.innerHTML = '<tr><td colspan="7" style="color:#6b7686;">Cargando…</td></tr>';
    try {
      const r = await api('/api/admin/shipping/pedidos?' + params.toString());
      mostrarAvisoMigracion(!!r.migracionPendiente);
      pedidosEnvio = r.items || [];
      if (paginaEnvios > r.totalPages && r.total > 0) { paginaEnvios = r.totalPages; return cargarPedidosEnvio(); }
      empty.style.display = pedidosEnvio.length ? 'none' : 'block';
      body.innerHTML = pedidosEnvio.map((p) => {
        const dest = destinoPedido(p);
        const est = p.shippingStatus || 'pendiente';
        return '<tr>' +
          '<td><strong>' + numeroPedido(p) + '</strong><span class="sub">' + esc(fechaCorta(p.createdAt)) + '</span>' +
            '<span class="sub"><span class="estado-badge ' + esc(p.status) + '">' + esc(p.status) + '</span></span></td>' +
          '<td>' + esc(p.customerName) + '<span class="sub">' + esc(p.customerPhone) + '</span></td>' +
          '<td>' + badgeMetodo(p.shippingMethod) + '</td>' +
          '<td>' + esc(dest.principal) + (dest.sub ? '<span class="sub">' + esc(dest.sub) + '</span>' : '') + '</td>' +
          '<td>' + esc(costoEnvioTxt(p)) + '</td>' +
          '<td><span class="estado-badge ' + est + '">' + esc(ESTADOS_ENVIO_TXT[est] || est) + '</span>' +
            (p.trackingNumber ? '<span class="sub">N.º ' + esc(p.trackingNumber) + '</span>' : '') + '</td>' +
          '<td><button type="button" class="btn btn-ghost btn-sm" data-gestionar-envio="' + p.id + '" style="width:auto;">Gestionar</button></td>' +
        '</tr>';
      }).join('');
      body.querySelectorAll('[data-gestionar-envio]').forEach((btn) => {
        btn.addEventListener('click', () => abrirModalEnvio(pedidosEnvio.find((x) => x.id === btn.getAttribute('data-gestionar-envio'))));
      });
      renderPaginacionEnvios(r);
    } catch (e) {
      body.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = e.message || 'No se pudieron cargar los envíos.';
    }
  }

  function renderPaginacionEnvios(r) {
    const cont = document.getElementById('env-pedidos-paginacion');
    if (!r.total) { cont.innerHTML = ''; return; }
    const desde = (r.page - 1) * r.porPagina + 1;
    const hasta = Math.min(r.page * r.porPagina, r.total);
    cont.innerHTML =
      '<span class="paginacion-info">' + desde + '–' + hasta + ' de ' + r.total + '</span>' +
      '<div class="paginacion-botones">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-env-pagina="-1"' + (r.page <= 1 ? ' disabled' : '') + '>← Anterior</button>' +
      '<span class="paginacion-actual">Página ' + r.page + ' de ' + r.totalPages + '</span>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-env-pagina="1"' + (r.page >= r.totalPages ? ' disabled' : '') + '>Siguiente →</button>' +
      '</div>';
    cont.querySelectorAll('[data-env-pagina]').forEach((btn) => {
      btn.addEventListener('click', () => { paginaEnvios += Number(btn.getAttribute('data-env-pagina')); cargarPedidosEnvio(); });
    });
  }

  // ---------- Modal: estado del envío + seguimiento + aviso por WhatsApp ----------
  let envioEditando = null;

  function linkWhatsappCliente(p, estado, tracking) {
    let tel = String(p.customerPhone || '').replace(/\D/g, '').replace(/^0/, '');
    if (!tel.startsWith('54')) tel = '549' + tel;
    const frases = {
      pendiente: 'ya recibimos tu pedido y lo estamos preparando',
      preparado: 'ya está preparado y listo para salir',
      despachado: p.shippingMethod === 'retiro' ? 'ya está listo para retirar' : 'ya fue despachado y está en camino',
      entregado: 'figura como entregado. ¡Gracias por tu compra!',
    };
    const lineas = ['Hola ' + (p.customerName || '') + '! Tu pedido ' + numeroPedido(p) + ' de ARD Suplementos ' + frases[estado] + '.'];
    if (tracking) lineas.push('Número de seguimiento Andreani: ' + tracking);
    return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(lineas.join('\n'));
  }

  function actualizarLinkWhatsapp() {
    if (!envioEditando) return;
    document.getElementById('envio-whatsapp-btn').href = linkWhatsappCliente(
      envioEditando,
      document.getElementById('envio-estado').value,
      document.getElementById('envio-tracking').value.trim()
    );
  }

  function abrirModalEnvio(p) {
    if (!p) return;
    envioEditando = p;
    const dest = destinoPedido(p);
    document.getElementById('modal-envio-title').textContent = 'Envío del pedido ' + numeroPedido(p);
    document.getElementById('modal-envio-detalle').innerHTML =
      '<div><strong>' + esc(p.customerName) + '</strong> · ' + esc(p.customerPhone) + '</div>' +
      '<div>' + badgeMetodo(p.shippingMethod) + ' ' + esc(dest.principal) + '</div>' +
      (dest.sub ? '<div>' + esc(dest.sub) + '</div>' : '') +
      '<div>Envío: <strong>' + esc(costoEnvioTxt(p)) + '</strong> · Productos: ' + fmt(p.total) + '</div>' +
      '<div style="margin-top:4px;">' + (p.items || []).map((it) => esc(it.qty + 'x ' + it.name + (it.flavor ? ' (' + it.flavor + ')' : ''))).join('<br>') + '</div>';
    document.getElementById('envio-estado').value = p.shippingStatus || 'pendiente';
    document.getElementById('envio-tracking').value = p.trackingNumber || '';
    // El seguimiento solo tiene sentido para Andreani.
    document.getElementById('envio-tracking').closest('.form-group').style.display =
      String(p.shippingMethod).startsWith('andreani') ? '' : 'none';
    document.getElementById('form-envio-error').classList.remove('visible');
    actualizarLinkWhatsapp();
    document.getElementById('modal-overlay-envio').classList.add('visible');
  }

  function cerrarModalEnvio() {
    document.getElementById('modal-overlay-envio').classList.remove('visible');
    envioEditando = null;
  }

  async function guardarEnvio(e) {
    e.preventDefault();
    if (!envioEditando) return;
    const errorEl = document.getElementById('form-envio-error');
    errorEl.classList.remove('visible');
    try {
      await api('/api/admin/shipping/pedidos/' + envioEditando.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingStatus: document.getElementById('envio-estado').value,
          trackingNumber: document.getElementById('envio-tracking').value.trim(),
        }),
      });
      cerrarModalEnvio();
      cargarResumenEnvios();
      if (document.getElementById('env-pedidos').classList.contains('active')) cargarPedidosEnvio();
    } catch (err) {
      errorEl.textContent = err.message || 'No se pudo guardar el envío.';
      errorEl.classList.add('visible');
    }
  }

  function wireDashboardEnvios() {
    document.querySelectorAll('[data-envtab]').forEach((btn) => {
      btn.addEventListener('click', () => irASubtab(btn.getAttribute('data-envtab')));
    });
    // Botones "Ver todos" / "Configurar →" del resumen (se renderizan dinámicamente).
    document.getElementById('tab-envios').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ir-envtab]');
      if (b) irASubtab(b.getAttribute('data-ir-envtab'));
    });

    document.getElementById('env-filtro-q').addEventListener('input', () => {
      clearTimeout(busquedaTimer);
      busquedaTimer = setTimeout(() => { paginaEnvios = 1; cargarPedidosEnvio(); }, 300);
    });
    ['env-filtro-metodo', 'env-filtro-estado', 'env-filtro-pedido'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => { paginaEnvios = 1; cargarPedidosEnvio(); });
    });

    document.getElementById('envio-form').addEventListener('submit', guardarEnvio);
    document.getElementById('envio-estado').addEventListener('change', actualizarLinkWhatsapp);
    document.getElementById('envio-tracking').addEventListener('input', actualizarLinkWhatsapp);
    document.getElementById('modal-envio-close').addEventListener('click', cerrarModalEnvio);
    document.getElementById('cancelar-envio-btn').addEventListener('click', cerrarModalEnvio);
    document.getElementById('modal-overlay-envio').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay-envio') cerrarModalEnvio();
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
    // Bulto/recargo y tabla de tarifas se guardan juntos desde cualquiera de
    // las dos tarjetas de Andreani.
    document.querySelectorAll('[data-andreani-guardar]').forEach((btnAndreani) => {
      btnAndreani.addEventListener('click', async () => {
        btnAndreani.disabled = true;
        try {
          andreaniTarifas = leerTablasTarifas();
          await Promise.all(
            ANDREANI_CAMPOS.map(([id, key]) => guardarSetting(key, document.getElementById(id).value))
              .concat(guardarSetting('andreani_tarifas_manuales', JSON.stringify(andreaniTarifas)))
          );
          const ok = btnAndreani.parentElement.querySelector('[data-andreani-status]');
          if (ok) {
            ok.style.display = '';
            clearTimeout(ok._t);
            ok._t = setTimeout(() => { ok.style.display = 'none'; }, 2000);
          }
          renderChecklistConfig();
        } catch (e) {
          alert(e.message || 'No se pudo guardar');
        } finally {
          btnAndreani.disabled = false;
        }
      });
    });
    document.getElementById('andreani-probar-btn').addEventListener('click', probarAndreani);
  }

  function onEnviosTabOpen() {
    Promise.all([cargarZonas(), cargarPuntos(), cargarFaqs(), cargarSettingsEnvio(), cargarEstadoAndreani()])
      .then(renderChecklistConfig);
    cargarResumenEnvios();
    if (document.getElementById('env-pedidos').classList.contains('active')) cargarPedidosEnvio();
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
    wireDashboardEnvios();
    initObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
