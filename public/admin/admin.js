(function () {
  let productos = [];
  let pedidos = [];
  let editandoId = null;

  // -------- Paginación de productos --------
  // Antes se traían TODOS los productos de una sola vez (con sus imágenes)
  // cada vez que se abría el panel. Ahora se piden de a páginas al servidor,
  // y la búsqueda/filtros también se resuelven ahí — así el navegador nunca
  // tiene en memoria más que la página actual.
  const PRODUCTOS_POR_PAGINA = 20;
  let paginaActual = 1;
  let totalPaginasProductos = 1;
  let totalProductosCount = 0;
  let buscadorDebounceTimer = null;

  // Escapa HTML antes de insertar cualquier dato en el DOM vía innerHTML.
  // Es crítico para nombre/comentario de reseñas, nombre/teléfono/notas de
  // pedidos y clientes: todo eso puede originarse en un formulario público
  // sin login (o en un POST directo a la API), así que se trata como
  // no confiable aunque venga "de la base". Sin esto, alguien podría mandar
  // un pedido con nombre `<img src=x onerror=fetch('/api/admin/change-password',...)>`
  // y ejecutar JS con la sesión del admin apenas abre el panel.
  function escaparHTML(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  const tablaBody = document.getElementById('tabla-body');
  const emptyState = document.getElementById('empty-state');
  const buscador = document.getElementById('buscador');
  const filtroCategoria = document.getElementById('filtro-categoria');
  const filtroEstado = document.getElementById('filtro-estado');
  const categoriasLista = document.getElementById('categorias-lista');
  const usernameLabel = document.getElementById('username-label');

  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const formError = document.getElementById('form-error');
  const productoForm = document.getElementById('producto-form');

  const imagenesGrid = document.getElementById('imagenes-grid');
  const imagenesInput = document.getElementById('imagenes');
  const imagenAgregarBtn = document.getElementById('imagen-agregar-btn');
  let imagenesExistentes = []; // URLs que ya estaban guardadas (se pueden quitar)
  let imagenesNuevas = []; // File[] recién seleccionados (todavía no subidos)

  // -------- Pedidos / Estadísticas --------
  const pedidosTablaBody = document.getElementById('pedidos-tabla-body');
  const pedidosEmptyState = document.getElementById('pedidos-empty-state');
  const filtroPedidoEstado = document.getElementById('filtro-pedido-estado');
  const refrescarPedidosBtn = document.getElementById('refrescar-pedidos-btn');
  const topProductosBody = document.getElementById('top-productos-body');
  const topProductosEmpty = document.getElementById('top-productos-empty');

  // -------- Clientes --------
  const clienteTablaBody = document.getElementById('cliente-tabla-body');
  const clienteEmptyState = document.getElementById('cliente-empty-state');
  const clienteBuscador = document.getElementById('cliente-buscador');
  const clienteFiltroEstado = document.getElementById('cliente-filtro-estado');
  const clienteUmbralDias = document.getElementById('cliente-umbral-dias');
  const clienteNuevoBtn = document.getElementById('cliente-nuevo-btn');
  const clienteBadge = document.getElementById('clientes-badge');

  const modalOverlayCliente = document.getElementById('modal-overlay-cliente');
  const modalClienteTitle = document.getElementById('modal-cliente-title');
  const formClienteError = document.getElementById('form-cliente-error');
  const clienteForm = document.getElementById('cliente-form');

  const modalOverlayVenta = document.getElementById('modal-overlay-venta');
  const formVentaError = document.getElementById('form-venta-error');
  const ventaForm = document.getElementById('venta-form');

  const modalOverlayHistorial = document.getElementById('modal-overlay-historial');
  const modalHistorialTitle = document.getElementById('modal-historial-title');
  const historialTablaBody = document.getElementById('historial-tabla-body');
  const historialEmptyState = document.getElementById('historial-empty-state');
  const historialAgregarVentaBtn = document.getElementById('historial-agregar-venta-btn');

  let clientes = [];
  let editandoClienteId = null;
  let historialClienteId = null; // cliente cuyo historial está abierto en el modal

  // -------- Reseñas --------
  const resenasTablaBody = document.getElementById('resenas-tabla-body');
  const resenasEmptyState = document.getElementById('resenas-empty-state');
  const filtroResenaEstado = document.getElementById('filtro-resena-estado');
  const refrescarResenasBtn = document.getElementById('refrescar-resenas-btn');
  const resenasBadge = document.getElementById('resenas-badge');
  let resenas = [];

  // -------- Novedades --------
  const novedadesGrid = document.getElementById('novedades-grid');
  const novedadesEmptyState = document.getElementById('novedades-empty-state');
  const filtroNovedadEstado = document.getElementById('filtro-novedad-estado');
  const nuevaNovedadBtn = document.getElementById('nueva-novedad-btn');
  const modalOverlayNovedad = document.getElementById('modal-overlay-novedad');
  const modalNovedadTitle = document.getElementById('modal-novedad-title');
  const formNovedadError = document.getElementById('form-novedad-error');
  const novedadForm = document.getElementById('novedad-form');
  const novedadImagenGrid = document.getElementById('novedad-imagen-grid');
  const novedadImagenInput = document.getElementById('novedad-imagen');
  const novedadImagenAgregarBtn = document.getElementById('novedad-imagen-agregar-btn');
  let novedades = [];
  let editandoNovedadId = null;
  let novedadImagenExistente = ''; // URL que ya estaba guardada (puede quitarse)
  let novedadImagenNueva = null; // File recién seleccionado (todavía no subido)
  let novedadQuitarImagen = false;
  let novedadVideoExistente = '';
  let novedadVideoNueva = null;
  let novedadQuitarVideo = false;
  const novedadTipoImagenRadio = document.getElementById('novedad-tipo-imagen');
  const novedadTipoVideoRadio = document.getElementById('novedad-tipo-video');
  const novedadBloqueImagen = document.getElementById('novedad-bloque-imagen');
  const novedadBloqueVideo = document.getElementById('novedad-bloque-video');
  const novedadVideoGrid = document.getElementById('novedad-video-grid');
  const novedadVideoInput = document.getElementById('novedad-video');
  const novedadVideoAgregarBtn = document.getElementById('novedad-video-agregar-btn');

  // -------- Hero (carrusel del home) --------
  const heroSlidesGrid = document.getElementById('hero-slides-grid');
  const heroSlidesEmptyState = document.getElementById('hero-slides-empty-state');
  const nuevaHeroBtn = document.getElementById('nueva-hero-btn');
  const modalOverlayHero = document.getElementById('modal-overlay-hero');
  const modalHeroTitle = document.getElementById('modal-hero-title');
  const formHeroError = document.getElementById('form-hero-error');
  const heroForm = document.getElementById('hero-form');
  const heroImagenGrid = document.getElementById('hero-imagen-grid');
  const heroImagenInput = document.getElementById('hero-imagen');
  let heroSlides = [];
  let editandoHeroId = null;
  let heroImagenNueva = null;

  function formatearPrecio(valor) {
    try {
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor);
    } catch (e) {
      return '$' + valor;
    }
  }

  function formatearFecha(iso) {
    try {
      return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch (e) {
      return iso;
    }
  }

  function iconoEditar() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  }
  function iconoBorrar() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
  }
  function iconoEditarTamano() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  }

  // ==========================================================
  // -------- Editor de tamaño de imagen (antes de subir) --------
  // Deja al admin definir manualmente el ancho y alto (en px) de
  // cualquier imagen recién seleccionada, agrandándola o achicándola
  // a gusto, antes de que se suba al servidor.
  // ==========================================================
  const resizeModalOverlay = document.getElementById('resize-modal-overlay');
  const resizePreviewImg = document.getElementById('resize-preview-img');
  const resizeAnchoInput = document.getElementById('resize-ancho');
  const resizeAltoInput = document.getElementById('resize-alto');
  const resizeProporcionCheck = document.getElementById('resize-proporcion');
  const resizeCancelarBtn = document.getElementById('resize-cancelar-btn');
  const resizeAplicarBtn = document.getElementById('resize-aplicar-btn');
  const resizeModalClose = document.getElementById('resize-modal-close');

  let resizeArchivoActual = null; // File que se está editando
  let resizeImgObj = null; // Image() cargada para dibujar en el canvas
  let resizeRatioOriginal = 1;
  let resizeCallback = null; // función a la que se le entrega el File final ya redimensionado

  function abrirEditorTamano(file, onAplicar) {
    if (!resizeModalOverlay) { onAplicar(file); return; } // por si el HTML no tiene el modal cargado

    resizeArchivoActual = file;
    resizeCallback = onAplicar;

    const src = URL.createObjectURL(file);
    resizePreviewImg.src = src;

    const img = new Image();
    img.onload = () => {
      resizeImgObj = img;
      resizeRatioOriginal = img.naturalWidth / img.naturalHeight || 1;
      resizeAnchoInput.value = img.naturalWidth;
      resizeAltoInput.value = img.naturalHeight;
      resizeProporcionCheck.checked = true;
    };
    img.src = src;

    resizeModalOverlay.classList.add('visible');
  }

  function cerrarEditorTamano() {
    if (resizeModalOverlay) resizeModalOverlay.classList.remove('visible');
    resizeArchivoActual = null;
    resizeImgObj = null;
    resizeCallback = null;
  }

  if (resizeAnchoInput) {
    resizeAnchoInput.addEventListener('input', () => {
      if (!resizeProporcionCheck.checked) return;
      const ancho = Number(resizeAnchoInput.value) || 0;
      if (ancho > 0) resizeAltoInput.value = Math.round(ancho / resizeRatioOriginal);
    });
  }
  if (resizeAltoInput) {
    resizeAltoInput.addEventListener('input', () => {
      if (!resizeProporcionCheck.checked) return;
      const alto = Number(resizeAltoInput.value) || 0;
      if (alto > 0) resizeAnchoInput.value = Math.round(alto * resizeRatioOriginal);
    });
  }

  document.querySelectorAll('#resize-modal-overlay [data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!resizeImgObj) return;
      const preset = btn.getAttribute('data-preset');
      if (preset === 'original') {
        resizeAnchoInput.value = resizeImgObj.naturalWidth;
        resizeAltoInput.value = resizeImgObj.naturalHeight;
      } else if (preset === 'cuadrado') {
        const lado = Math.max(resizeImgObj.naturalWidth, resizeImgObj.naturalHeight);
        resizeAnchoInput.value = lado;
        resizeAltoInput.value = lado;
      }
    });
  });

  if (resizeAplicarBtn) {
    resizeAplicarBtn.addEventListener('click', () => {
      if (!resizeImgObj || !resizeCallback) { cerrarEditorTamano(); return; }
      let ancho = Math.round(Number(resizeAnchoInput.value));
      let alto = Math.round(Number(resizeAltoInput.value));
      if (!ancho || ancho < 20) ancho = resizeImgObj.naturalWidth;
      if (!alto || alto < 20) alto = resizeImgObj.naturalHeight;
      ancho = Math.min(ancho, 4000);
      alto = Math.min(alto, 4000);

      // Dibuja la imagen en un canvas con el tamaño exacto elegido: si el
      // recuadro es más chico que la imagen original, la achica; si es más
      // grande, la agranda. Así el admin decide el tamaño final, sin que
      // el servidor lo recalcule por su cuenta.
      const canvas = document.createElement('canvas');
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(resizeImgObj, 0, 0, ancho, alto);

      const nombreBase = (resizeArchivoActual.name || 'imagen').replace(/\.[^.]+$/, '');
      canvas.toBlob((blob) => {
        if (!blob) { cerrarEditorTamano(); return; }
        const archivoFinal = new File([blob], nombreBase + '.png', { type: 'image/png' });
        const callback = resizeCallback;
        cerrarEditorTamano();
        callback(archivoFinal);
      }, 'image/png');
    });
  }

  if (resizeCancelarBtn) resizeCancelarBtn.addEventListener('click', cerrarEditorTamano);
  if (resizeModalClose) resizeModalClose.addEventListener('click', cerrarEditorTamano);
  if (resizeModalOverlay) {
    resizeModalOverlay.addEventListener('click', (e) => {
      if (e.target === resizeModalOverlay) cerrarEditorTamano();
    });
  }

  // -------- Sesión --------
  async function verificarSesion() {
    try {
      const res = await fetch('/api/admin/session');
      const data = await res.json();
      if (!data.isAdmin) {
        window.location.href = 'login.html';
        return;
      }
      usernameLabel.textContent = data.username ? ('Hola, ' + data.username) : '';
      cargarProductos();
      cargarCategorias();
      renderStats();
      actualizarBadgeResenas();
    } catch (e) {
      window.location.href = 'login.html';
    }
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });

  // ====================================================
  // -------- Tabs --------
  // ====================================================
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = {
    productos: document.getElementById('tab-productos'),
    pedidos: document.getElementById('tab-pedidos'),
    clientes: document.getElementById('tab-clientes'),
    resenas: document.getElementById('tab-resenas'),
    novedades: document.getElementById('tab-novedades'),
    hero: document.getElementById('tab-hero'),
    stats: document.getElementById('tab-stats'),
  };

  let pedidosCargados = false;
  let statsCargadas = false;
  let resenasCargadas = false;
  let novedadesCargadas = false;
  let heroCargado = false;
  let clientesCargados = false;

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
      Object.entries(tabPanels).forEach(([key, panel]) => {
        panel.classList.toggle('active', key === tab);
      });

      if (tab === 'pedidos' && !pedidosCargados) {
        pedidosCargados = true;
        cargarPedidos();
      }
      if (tab === 'stats' && !statsCargadas) {
        statsCargadas = true;
        cargarStats();
      }
      if (tab === 'resenas' && !resenasCargadas) {
        resenasCargadas = true;
        cargarResenas();
      }
      if (tab === 'novedades' && !novedadesCargadas) {
        novedadesCargadas = true;
        cargarNovedades();
      }
      if (tab === 'hero' && !heroCargado) {
        heroCargado = true;
        cargarHeroSlides();
      }
      if (tab === 'clientes' && !clientesCargados) {
        clientesCargados = true;
        cargarClientes();
      }
      // Si ya se cargaron antes, igual refrescamos al volver a la pestaña
      // para no mostrar datos viejos si pasó tiempo:
      if (tab === 'pedidos' && pedidosCargados) cargarPedidos();
      if (tab === 'stats' && statsCargadas) cargarStats();
      if (tab === 'resenas' && resenasCargadas) cargarResenas();
      if (tab === 'novedades' && novedadesCargadas) cargarNovedades();
      if (tab === 'hero' && heroCargado) cargarHeroSlides();
      if (tab === 'clientes' && clientesCargados) cargarClientes();
    });
  });

  // ====================================================
  // -------- PRODUCTOS --------
  // ====================================================
  async function cargarProductos() {
    try {
      const params = new URLSearchParams();
      params.set('page', paginaActual);
      params.set('limit', PRODUCTOS_POR_PAGINA);
      if (buscador.value.trim()) params.set('q', buscador.value.trim());
      if (filtroCategoria.value) params.set('category', filtroCategoria.value);
      if (filtroEstado.value) params.set('estado', filtroEstado.value);

      const res = await fetch('/api/admin/products?' + params.toString());
      if (res.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      const respuesta = await res.json();
      productos = respuesta.productos || [];
      totalPaginasProductos = respuesta.totalPages || 1;
      totalProductosCount = respuesta.total || 0;
      // Si al filtrar quedamos parados en una página que ya no existe
      // (por ejemplo, se borró el único producto de la última página),
      // volvemos a la página anterior disponible.
      if (paginaActual > totalPaginasProductos) {
        paginaActual = totalPaginasProductos;
        return cargarProductos();
      }
      renderTabla();
      renderPaginacion();
    } catch (e) {
      tablaBody.innerHTML = '<tr><td colspan="8">Error al cargar los productos.</td></tr>';
    }
  }

  async function cargarCategorias() {
    try {
      const res = await fetch('/api/admin/products/categorias');
      if (!res.ok) return;
      const categorias = await res.json();
      const valorActual = filtroCategoria.value;
      filtroCategoria.innerHTML =
        '<option value="">Todas las categorías</option>' +
        categorias.map((c) => '<option value="' + escaparHTML(c) + '">' + escaparHTML(c) + '</option>').join('');
      filtroCategoria.value = categorias.includes(valorActual) ? valorActual : '';
      categoriasLista.innerHTML = categorias.map((c) => '<option value="' + escaparHTML(c) + '">').join('');
    } catch (e) {
      // silencioso: el selector de categorías no es crítico para operar
    }
  }

  async function renderStats() {
    try {
      const res = await fetch('/api/admin/products/stats');
      if (!res.ok) return;
      const stats = await res.json();
      document.getElementById('stat-total').textContent = stats.total;
      document.getElementById('stat-activos').textContent = stats.activos;
      document.getElementById('stat-sinstock').textContent = stats.sinStock;
      document.getElementById('stat-destacados').textContent = stats.destacados;
    } catch (e) {
      // silencioso: las estadísticas no son críticas para operar
    }
  }

  function renderPaginacion() {
    let cont = document.getElementById('productos-paginacion');
    if (!cont) return;
    if (totalProductosCount === 0) {
      cont.innerHTML = '';
      return;
    }
    const desde = (paginaActual - 1) * PRODUCTOS_POR_PAGINA + 1;
    const hasta = Math.min(paginaActual * PRODUCTOS_POR_PAGINA, totalProductosCount);
    cont.innerHTML =
      '<span class="paginacion-info">' + desde + '–' + hasta + ' de ' + totalProductosCount + '</span>' +
      '<div class="paginacion-botones">' +
      '<button type="button" class="btn btn-ghost btn-sm" id="pagina-anterior-btn"' + (paginaActual <= 1 ? ' disabled' : '') + '>← Anterior</button>' +
      '<span class="paginacion-actual">Página ' + paginaActual + ' de ' + totalPaginasProductos + '</span>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="pagina-siguiente-btn"' + (paginaActual >= totalPaginasProductos ? ' disabled' : '') + '>Siguiente →</button>' +
      '</div>';

    const btnAnt = document.getElementById('pagina-anterior-btn');
    const btnSig = document.getElementById('pagina-siguiente-btn');
    if (btnAnt) btnAnt.addEventListener('click', () => { if (paginaActual > 1) { paginaActual--; cargarProductos(); } });
    if (btnSig) btnSig.addEventListener('click', () => { if (paginaActual < totalPaginasProductos) { paginaActual++; cargarProductos(); } });
  }

  function renderTabla() {
    const lista = productos;
    if (!lista.length) {
      tablaBody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    tablaBody.innerHTML = lista
      .map((p) => {
        const imagenHtml = p.image
          ? '<img class="thumb" src="' + p.image + '" alt="">'
          : '<div class="thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M21 15l-5-5L5 21"/></svg></div>';

        const chips = [];
        chips.push(p.active ? '<span class="chip">Publicado</span>' : '<span class="chip inactivo">Oculto</span>');
        if (p.featured) chips.push('<span class="chip destacado">Destacado</span>');
        if (Number(p.stock) <= 0) chips.push('<span class="chip sin-stock">Sin stock</span>');

        const precioEfectivoHtml = formatearPrecio(p.price) + (p.oldPrice ? ' <span style="text-decoration:line-through;color:#9aa8bb;font-size:12px;">' + formatearPrecio(p.oldPrice) + '</span>' : '');
        const lineasPrecio = ['<div>' + precioEfectivoHtml + ' <span style="font-size:11px;color:#9aa8bb;">efvo/transf</span></div>'];

        let planes = Array.isArray(p.paymentPlans) ? p.paymentPlans : [];
        if (!planes.length && (p.creditPrice || (p.installments > 1))) {
          planes = [];
          if (p.creditPrice) planes.push({ cuotas: 1, precio: p.creditPrice });
          if (p.installments > 1) planes.push({ cuotas: p.installments, precio: p.cardPrice || p.price });
        }
        planes
          .slice()
          .sort((a, b) => (Number(a.cuotas) || 0) - (Number(b.cuotas) || 0))
          .forEach((pl) => {
            const etiqueta = Number(pl.cuotas) === 1 ? '1 pago tarjeta' : (pl.cuotas + ' cuotas');
            lineasPrecio.push('<div style="font-size:12px;color:#6b7686;">' + formatearPrecio(pl.precio) + ' <span style="color:#9aa8bb;font-size:11px;">' + etiqueta + '</span></div>');
          });
        const precioHtml = lineasPrecio.join('');

        return (
          '<tr>' +
          '<td>' + imagenHtml + '</td>' +
          '<td><strong>' + escaparHTML(p.name) + '</strong></td>' +
          '<td>' + escaparHTML(p.brand || '—') + '</td>' +
          '<td>' + escaparHTML(p.category) + '</td>' +
          '<td>' + precioHtml + '</td>' +
          '<td>' + p.stock + '</td>' +
          '<td>' + chips.join(' ') + '</td>' +
          '<td>' +
            '<div class="row-actions">' +
              '<button type="button" class="icon-btn" data-editar="' + p.id + '" title="Editar">' + iconoEditar() + '</button>' +
              '<button type="button" class="icon-btn danger" data-borrar="' + p.id + '" title="Eliminar">' + iconoBorrar() + '</button>' +
            '</div>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    tablaBody.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalEdicion(btn.getAttribute('data-editar')));
    });
    tablaBody.querySelectorAll('[data-borrar]').forEach((btn) => {
      btn.addEventListener('click', () => borrarProducto(btn.getAttribute('data-borrar')));
    });
  }

  // Buscar con debounce (esperamos que la persona termine de tipear antes de
  // pedirle al servidor, para no mandar un request por cada letra).
  buscador.addEventListener('input', () => {
    clearTimeout(buscadorDebounceTimer);
    buscadorDebounceTimer = setTimeout(() => { paginaActual = 1; cargarProductos(); }, 350);
  });
  filtroCategoria.addEventListener('change', () => { paginaActual = 1; cargarProductos(); });
  filtroEstado.addEventListener('change', () => { paginaActual = 1; cargarProductos(); });

  // -------- Galería de imágenes (existentes + nuevas) --------
  function renderImagenesGrid() {
    if (!imagenesGrid) return; // el HTML no tiene la nueva galería cargada
    const totalPrevias = imagenesExistentes.length;
    let html = '';

    imagenesExistentes.forEach((url, i) => {
      const esPrincipal = i === 0;
      html +=
        '<div class="imagen-tile">' +
          '<img src="' + url + '" alt="">' +
          (esPrincipal ? '<span class="imagen-principal-tag">Principal</span>' : '') +
          '<button type="button" class="imagen-quitar" data-quitar-existente="' + i + '" title="Quitar imagen">✕</button>' +
        '</div>';
    });

    imagenesNuevas.forEach((file, i) => {
      const esPrincipal = totalPrevias === 0 && i === 0;
      const src = URL.createObjectURL(file);
      html +=
        '<div class="imagen-tile">' +
          '<img src="' + src + '" alt="">' +
          '<button type="button" class="imagen-editar-tamano" data-editar-tamano-nueva="' + i + '" title="Ajustar tamaño">' + iconoEditarTamano() + '</button>' +
          (esPrincipal ? '<span class="imagen-principal-tag">Principal</span>' : '') +
          '<button type="button" class="imagen-quitar" data-quitar-nueva="' + i + '" title="Quitar imagen">✕</button>' +
        '</div>';
    });

    html +=
      '<button type="button" class="imagen-agregar-tile" id="imagen-agregar-btn">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>' +
        '</svg>' +
        'Agregar' +
      '</button>';

    imagenesGrid.innerHTML = html;

    const btnAgregar = imagenesGrid.querySelector('#imagen-agregar-btn');
    if (btnAgregar && imagenesInput) btnAgregar.addEventListener('click', () => imagenesInput.click());
    imagenesGrid.querySelectorAll('[data-quitar-existente]').forEach((btn) => {
      btn.addEventListener('click', () => {
        imagenesExistentes.splice(Number(btn.getAttribute('data-quitar-existente')), 1);
        renderImagenesGrid();
      });
    });
    imagenesGrid.querySelectorAll('[data-quitar-nueva]').forEach((btn) => {
      btn.addEventListener('click', () => {
        imagenesNuevas.splice(Number(btn.getAttribute('data-quitar-nueva')), 1);
        renderImagenesGrid();
      });
    });
    imagenesGrid.querySelectorAll('[data-editar-tamano-nueva]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-editar-tamano-nueva'));
        abrirEditorTamano(imagenesNuevas[idx], (archivoFinal) => {
          imagenesNuevas[idx] = archivoFinal;
          renderImagenesGrid();
        });
      });
    });
  }

  if (imagenesInput) {
    imagenesInput.addEventListener('change', () => {
      const LIMITE = 8;
      const disponibles = LIMITE - imagenesExistentes.length - imagenesNuevas.length;
      if (disponibles <= 0) {
        alert('Ya llegaste al máximo de ' + LIMITE + ' imágenes por producto.');
        imagenesInput.value = '';
        return;
      }
      const nuevos = Array.from(imagenesInput.files).slice(0, disponibles);
      imagenesNuevas.push(...nuevos);
      imagenesInput.value = ''; // permite volver a elegir el mismo archivo si lo saca y lo agrega de nuevo
      renderImagenesGrid();
    });
  }

  // -------- Planes de pago con tarjeta (cuotas + precio total, con recargo) --------
  function agregarFilaPlan(cuotas, precio) {
    const cont = document.getElementById('planes-pago-filas');
    const vacio = cont.querySelector('.planes-pago-vacio');
    if (vacio) vacio.remove();

    const fila = document.createElement('div');
    fila.className = 'plan-fila';
    fila.innerHTML =
      '<input type="number" class="plan-cuotas" min="1" max="60" step="1" placeholder="Ej: 3" value="' + (cuotas != null ? cuotas : '') + '">' +
      '<input type="number" class="plan-precio" min="0" step="1" placeholder="Precio total" value="' + (precio != null ? precio : '') + '">' +
      '<button type="button" class="plan-quitar" aria-label="Quitar plan">&times;</button>';
    fila.querySelector('.plan-quitar').addEventListener('click', () => {
      fila.remove();
      if (!cont.querySelector('.plan-fila')) renderPlanesVacio();
    });
    cont.appendChild(fila);
  }

  function renderPlanesVacio() {
    const cont = document.getElementById('planes-pago-filas');
    if (!cont.querySelector('.planes-pago-vacio')) {
      cont.innerHTML = '<div class="planes-pago-vacio">Sin planes: el producto se vende solo en efectivo / transferencia.</div>';
    }
  }

  function cargarPlanesEnForm(p) {
    const cont = document.getElementById('planes-pago-filas');
    cont.innerHTML = '';
    let planes = Array.isArray(p && p.paymentPlans) ? p.paymentPlans.slice() : [];
    // Compatibilidad: si todavía no tiene planes cargados, los armamos con los
    // precios sueltos viejos para no perder lo que ya estaba.
    if (!planes.length && p) {
      if (p.creditPrice) planes.push({ cuotas: 1, precio: p.creditPrice });
      if (p.installments && p.installments > 1) planes.push({ cuotas: p.installments, precio: p.cardPrice || p.price });
    }
    planes
      .slice()
      .sort((a, b) => (Number(a.cuotas) || 0) - (Number(b.cuotas) || 0))
      .forEach((pl) => agregarFilaPlan(pl.cuotas, pl.precio));
    if (!planes.length) renderPlanesVacio();
  }

  function leerPlanesDelForm() {
    const filas = [...document.querySelectorAll('#planes-pago-filas .plan-fila')];
    const vistas = new Set();
    const planes = [];
    filas.forEach((f) => {
      const cuotas = Math.round(Number(f.querySelector('.plan-cuotas').value) || 0);
      const precio = Math.round(Number(f.querySelector('.plan-precio').value) || 0);
      if (cuotas >= 1 && cuotas <= 60 && precio > 0 && !vistas.has(cuotas)) {
        vistas.add(cuotas);
        planes.push({ cuotas, precio });
      }
    });
    planes.sort((a, b) => a.cuotas - b.cuotas);
    return planes;
  }

  document.getElementById('plan-agregar-btn').addEventListener('click', () => agregarFilaPlan());

  // -------- Modal: abrir / cerrar --------
  function limpiarFormulario() {
    editandoId = null;
    productoForm.reset();
    document.getElementById('producto-id').value = '';
    document.getElementById('activo').checked = true;
    document.getElementById('destacado').checked = false;
    cargarPlanesEnForm(null);
    imagenesExistentes = [];
    imagenesNuevas = [];
    renderImagenesGrid();
    formError.classList.remove('visible');
  }

  function abrirModalNuevo() {
    limpiarFormulario();
    modalTitle.textContent = 'Nuevo producto';
    modalOverlay.classList.add('visible');
  }

  function abrirModalEdicion(id) {
    const p = productos.find((x) => x.id === id);
    if (!p) return;
    limpiarFormulario();
    editandoId = id;
    modalTitle.textContent = 'Editar producto';
    document.getElementById('producto-id').value = p.id;
    document.getElementById('nombre').value = p.name;
    document.getElementById('marca').value = p.brand || '';
    document.getElementById('categoria').value = p.category;
    document.getElementById('precio').value = p.price;
    document.getElementById('precio-anterior').value = p.oldPrice || '';
    document.getElementById('stock').value = p.stock;
    document.getElementById('sabores').value = p.flavors || '';
    cargarPlanesEnForm(p);
    document.getElementById('descripcion').value = p.description || '';
    document.getElementById('destacado').checked = !!p.featured;
    document.getElementById('activo').checked = !!p.active;

    imagenesExistentes = Array.isArray(p.images) && p.images.length ? p.images.slice() : (p.image ? [p.image] : []);
    imagenesNuevas = [];
    renderImagenesGrid();

    modalOverlay.classList.add('visible');
  }

  function cerrarModal() {
    modalOverlay.classList.remove('visible');
  }

  document.getElementById('nuevo-btn').addEventListener('click', abrirModalNuevo);
  document.getElementById('modal-close').addEventListener('click', cerrarModal);
  document.getElementById('cancelar-btn').addEventListener('click', cerrarModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) cerrarModal();
  });


  // -------- Guardar (crear / editar) --------
  productoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.remove('visible');

    const guardarBtn = document.getElementById('guardar-btn');
    guardarBtn.disabled = true;
    guardarBtn.textContent = 'Guardando…';

    const formData = new FormData();
    formData.append('name', document.getElementById('nombre').value.trim());
    formData.append('brand', document.getElementById('marca').value.trim());
    formData.append('category', document.getElementById('categoria').value.trim());
    formData.append('price', document.getElementById('precio').value);
    formData.append('oldPrice', document.getElementById('precio-anterior').value);
    formData.append('stock', document.getElementById('stock').value || '0');
    formData.append('flavors', document.getElementById('sabores').value.trim());
    formData.append('paymentPlans', JSON.stringify(leerPlanesDelForm()));
    formData.append('description', document.getElementById('descripcion').value.trim());
    formData.append('featured', document.getElementById('destacado').checked);
    formData.append('active', document.getElementById('activo').checked);

    formData.append('imagenesExistentes', JSON.stringify(imagenesExistentes));
    imagenesNuevas.forEach((file) => formData.append('imagenes', file));

    try {
      const url = editandoId ? '/api/admin/products/' + editandoId : '/api/admin/products';
      const method = editandoId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, body: formData });
      const data = await res.json();

      if (!res.ok) {
        formError.textContent = data.error || 'No se pudo guardar el producto';
        formError.classList.add('visible');
        guardarBtn.disabled = false;
        guardarBtn.textContent = 'Guardar producto';
        return;
      }

      cerrarModal();
      await cargarProductos();
      cargarCategorias();
      renderStats();
    } catch (err) {
      formError.textContent = 'Error de conexión con el servidor';
      formError.classList.add('visible');
    } finally {
      guardarBtn.disabled = false;
      guardarBtn.textContent = 'Guardar producto';
    }
  });

  // -------- Borrar --------
  async function borrarProducto(id) {
    const p = productos.find((x) => x.id === id);
    if (!p) return;
    const confirmado = window.confirm('¿Seguro que querés eliminar "' + p.name + '"? Esta acción no se puede deshacer.');
    if (!confirmado) return;

    try {
      const res = await fetch('/api/admin/products/' + id, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo eliminar el producto');
        return;
      }
      await cargarProductos();
      renderStats();
    } catch (err) {
      alert('Error de conexión con el servidor');
    }
  }

  // ====================================================
  // -------- PEDIDOS / VENTAS --------
  // ====================================================
  async function cargarPedidos() {
    try {
      const estado = filtroPedidoEstado.value;
      const url = '/api/admin/orders' + (estado ? '?status=' + encodeURIComponent(estado) : '');
      const res = await fetch(url);
      if (res.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      pedidos = await res.json();
      renderPedidos();
    } catch (e) {
      pedidosTablaBody.innerHTML = '<tr><td colspan="8">Error al cargar los pedidos.</td></tr>';
    }
  }

  function renderPedidos() {
    if (!pedidos.length) {
      pedidosTablaBody.innerHTML = '';
      pedidosEmptyState.style.display = 'block';
      return;
    }
    pedidosEmptyState.style.display = 'none';

    pedidosTablaBody.innerHTML = pedidos
      .map((p) => {
        const itemsResumen = p.items.length + (p.items.length === 1 ? ' producto' : ' productos');
        const itemsDetalle = p.items
          .map((it) => '<li>' + escaparHTML(it.qty) + 'x ' + escaparHTML(it.name) + (it.flavor ? ' (Sabor: ' + escaparHTML(it.flavor) + ')' : '') + ' — ' + formatearPrecio(it.price) + '</li>')
          .join('');

        const badgePago = p.sentVia === 'mercadopago'
          ? ' <span class="pago-mp-badge" title="Pago online por Mercado Pago' + (p.mpStatus ? ' — estado MP: ' + escaparHTML(p.mpStatus) : '') + '">MP</span>'
          : '';

        const badgeCuenta = p.accountId
          ? ' <span class="pago-mp-badge" style="background:#1a7a44;" title="Compra hecha desde una cuenta registrada del sitio">CUENTA</span>'
          : '';

        let modoTxt = '';
        if (p.priceMode === 'efectivo') modoTxt = 'Efectivo / transf.';
        else if (p.priceMode === 'tarjeta' || p.chosenInstallments) modoTxt = Number(p.chosenInstallments) === 1 ? '1 pago tarjeta' : ((p.chosenInstallments || '?') + ' cuotas');
        const badgeModo = modoTxt
          ? ' <span class="pago-mp-badge" style="background:#6b4fa1;" title="Forma de pago elegida por el cliente">' + escaparHTML(modoTxt) + '</span>'
          : '';

        return (
          '<tr>' +
          '<td>#' + String(p.orderNumber).padStart(4, '0') + badgePago + badgeCuenta + badgeModo + '</td>' +
          '<td><strong>' + escaparHTML(p.customerName) + '</strong></td>' +
          '<td>' + escaparHTML(p.customerPhone) + '</td>' +
          '<td>' +
            '<button type="button" class="pedido-items-toggle" data-toggle-items="' + p.id + '">' + itemsResumen + '</button>' +
            '<div class="pedido-items-detalle" id="items-detalle-' + p.id + '"><ul>' + itemsDetalle + '</ul></div>' +
          '</td>' +
          '<td>' + formatearPrecio(p.total) + '</td>' +
          '<td><span class="estado-badge ' + p.status + '">' + p.status + '</span></td>' +
          '<td>' + formatearFecha(p.createdAt) + '</td>' +
          '<td>' +
            '<div class="pedido-actions">' +
              '<select data-cambiar-estado="' + p.id + '">' +
                '<option value="pendiente"' + (p.status === 'pendiente' ? ' selected' : '') + '>Pendiente</option>' +
                '<option value="confirmado"' + (p.status === 'confirmado' ? ' selected' : '') + '>Confirmado</option>' +
                '<option value="cancelado"' + (p.status === 'cancelado' ? ' selected' : '') + '>Cancelado</option>' +
              '</select>' +
              '<button type="button" class="icon-btn danger" data-borrar-pedido="' + p.id + '" title="Eliminar">' + iconoBorrar() + '</button>' +
            '</div>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    pedidosTablaBody.querySelectorAll('[data-toggle-items]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-toggle-items');
        document.getElementById('items-detalle-' + id).classList.toggle('visible');
      });
    });
    pedidosTablaBody.querySelectorAll('[data-cambiar-estado]').forEach((select) => {
      select.addEventListener('change', () => cambiarEstadoPedido(select.getAttribute('data-cambiar-estado'), select.value));
    });
    pedidosTablaBody.querySelectorAll('[data-borrar-pedido]').forEach((btn) => {
      btn.addEventListener('click', () => borrarPedido(btn.getAttribute('data-borrar-pedido')));
    });
  }

  async function cambiarEstadoPedido(id, status) {
    try {
      const res = await fetch('/api/admin/orders/' + id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo actualizar el estado');
        await cargarPedidos();
        return;
      }
      await cargarPedidos();
      // Si estaban viendo estadísticas, las próximas veces que entren se van
      // a recalcular; forzamos que se vuelvan a pedir la próxima vez que se abra la pestaña.
      statsCargadas = false;
    } catch (e) {
      alert('Error de conexión con el servidor');
    }
  }

  async function borrarPedido(id) {
    const confirmado = window.confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.');
    if (!confirmado) return;
    try {
      const res = await fetch('/api/admin/orders/' + id, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo eliminar el pedido');
        return;
      }
      await cargarPedidos();
      statsCargadas = false;
    } catch (e) {
      alert('Error de conexión con el servidor');
    }
  }

  filtroPedidoEstado.addEventListener('change', cargarPedidos);
  refrescarPedidosBtn.addEventListener('click', cargarPedidos);

  // ====================================================
  // -------- CLIENTES --------
  // ====================================================
  function iconoWhatsapp() {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.78 14.03c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.11.11-1.79-.11-.41-.13-.94-.3-1.62-.6-2.85-1.23-4.71-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.09 1-2.38.24-.27.53-.34.7-.34h.5c.16 0 .38-.02.58.46.24.58.8 2 .87 2.15.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.16-.29.36-.42.48-.14.13-.28.28-.12.55.16.27.71 1.2 1.53 1.95 1.05.96 1.94 1.27 2.21 1.41.27.14.43.12.59-.06.16-.19.68-.8.86-1.07.18-.27.36-.22.6-.13.24.09 1.53.73 1.79.86.27.13.44.19.5.3.07.11.07.63-.17 1.31z"/></svg>';
  }
  function iconoOjo() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  function iconoMasVenta() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
  }

  function normalizarTelefonoDisplay(tel) {
    return String(tel || '').replace(/\D/g, '');
  }

  function linkWhatsapp(cliente) {
    const tel = normalizarTelefonoDisplay(cliente.phone);
    const dias = cliente.diasSinComprar;
    let mensaje;
    if (dias === null || dias === undefined) {
      mensaje = 'Hola ' + cliente.name + '! ¿Cómo andás? Te quería contar las novedades que tenemos 😊';
    } else {
      mensaje = 'Hola ' + cliente.name + '! ¿Cómo andás? Hace un tiempo que no te veo por acá, ¿necesitás reponer algo? Te cuento las novedades que tenemos 😊';
    }
    return 'https://wa.me/' + tel + '?text=' + encodeURIComponent(mensaje);
  }

  async function cargarClientes() {
    try {
      const res = await fetch('/api/admin/customers');
      if (res.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      clientes = await res.json();
      renderClientesStats();
      renderClientes();
    } catch (e) {
      clienteTablaBody.innerHTML = '<tr><td colspan="8">Error al cargar los clientes.</td></tr>';
    }
  }

  function estadoCliente(cliente, umbral) {
    if (cliente.diasSinComprar === null || cliente.diasSinComprar === undefined) return 'nunca';
    if (cliente.diasSinComprar >= umbral) return 'atender';
    return 'al-dia';
  }

  function clientesFiltrados() {
    const term = clienteBuscador.value.trim().toLowerCase();
    const estadoFiltro = clienteFiltroEstado.value;
    const umbral = Number(clienteUmbralDias.value) || 30;
    return clientes.filter((c) => {
      if (term && !(c.name.toLowerCase().includes(term) || c.phone.includes(term))) return false;
      if (estadoFiltro && estadoCliente(c, umbral) !== estadoFiltro) return false;
      return true;
    });
  }

  function renderClientesStats() {
    const umbral = Number(clienteUmbralDias.value) || 30;
    const total = clientes.length;
    const alDia = clientes.filter((c) => estadoCliente(c, umbral) === 'al-dia').length;
    const atender = clientes.filter((c) => estadoCliente(c, umbral) === 'atender').length;
    const ingresos = clientes.reduce((acc, c) => acc + (c.totalGastado || 0), 0);

    document.getElementById('cliente-stat-total').textContent = total;
    document.getElementById('cliente-stat-al-dia').textContent = alDia;
    document.getElementById('cliente-stat-atender').textContent = atender;
    document.getElementById('cliente-stat-ingresos').textContent = formatearPrecio(ingresos);

    if (atender > 0) {
      clienteBadge.style.display = 'inline-flex';
      clienteBadge.textContent = atender;
    } else {
      clienteBadge.style.display = 'none';
    }
  }

  function renderClientes() {
    const lista = clientesFiltrados();
    const umbral = Number(clienteUmbralDias.value) || 30;

    if (!lista.length) {
      clienteTablaBody.innerHTML = '';
      clienteEmptyState.style.display = 'block';
      return;
    }
    clienteEmptyState.style.display = 'none';

    clienteTablaBody.innerHTML = lista
      .map((c) => {
        const estado = estadoCliente(c, umbral);
        const chipHtml =
          estado === 'atender'
            ? '<span class="chip sin-stock">Contactar</span>'
            : estado === 'al-dia'
            ? '<span class="chip">Al día</span>'
            : '<span class="chip inactivo">Nunca compró</span>';

        const ultimaCompraTxt = c.ultimaCompra
          ? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(c.ultimaCompra + 'T00:00:00'))
          : '—';
        const diasTxt = c.diasSinComprar === null || c.diasSinComprar === undefined ? '—' : c.diasSinComprar + ' días';

        return (
          '<tr>' +
          '<td><strong>' + escaparHTML(c.name) + '</strong></td>' +
          '<td>' + escaparHTML(c.phone) + '</td>' +
          '<td>' + ultimaCompraTxt + '</td>' +
          '<td>' + diasTxt + '</td>' +
          '<td>' + c.cantidadCompras + '</td>' +
          '<td>' + formatearPrecio(c.totalGastado) + '</td>' +
          '<td>' + chipHtml + '</td>' +
          '<td>' +
            '<div class="row-actions">' +
              '<a class="icon-btn" href="' + linkWhatsapp(c) + '" target="_blank" rel="noopener" title="Escribir por WhatsApp" data-marcar-contactado="' + c.id + '">' + iconoWhatsapp() + '</a>' +
              '<button type="button" class="icon-btn" data-ver-historial="' + c.id + '" title="Historial de compras">' + iconoOjo() + '</button>' +
              '<button type="button" class="icon-btn" data-editar-cliente="' + c.id + '" title="Editar">' + iconoEditar() + '</button>' +
              '<button type="button" class="icon-btn danger" data-borrar-cliente="' + c.id + '" title="Eliminar">' + iconoBorrar() + '</button>' +
            '</div>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    clienteTablaBody.querySelectorAll('[data-marcar-contactado]').forEach((a) => {
      a.addEventListener('click', () => {
        // No bloqueamos la apertura de WhatsApp; solo dejamos registrado que lo contactaste.
        fetch('/api/admin/customers/' + a.getAttribute('data-marcar-contactado') + '/contactado', { method: 'POST' }).catch(() => {});
      });
    });
    clienteTablaBody.querySelectorAll('[data-ver-historial]').forEach((btn) => {
      btn.addEventListener('click', () => abrirHistorial(btn.getAttribute('data-ver-historial')));
    });
    clienteTablaBody.querySelectorAll('[data-editar-cliente]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalEdicionCliente(btn.getAttribute('data-editar-cliente')));
    });
    clienteTablaBody.querySelectorAll('[data-borrar-cliente]').forEach((btn) => {
      btn.addEventListener('click', () => borrarCliente(btn.getAttribute('data-borrar-cliente')));
    });
  }

  clienteBuscador.addEventListener('input', renderClientes);
  clienteFiltroEstado.addEventListener('change', renderClientes);
  clienteUmbralDias.addEventListener('change', () => {
    renderClientesStats();
    renderClientes();
  });

  // -------- Modal cliente (nuevo / editar) --------
  function limpiarFormularioCliente() {
    clienteForm.reset();
    document.getElementById('cliente-id').value = '';
    formClienteError.classList.remove('visible');
    formClienteError.textContent = '';
    editandoClienteId = null;
  }

  function abrirModalNuevoCliente() {
    limpiarFormularioCliente();
    modalClienteTitle.textContent = 'Nuevo cliente';
    modalOverlayCliente.classList.add('visible');
  }

  function abrirModalEdicionCliente(id) {
    const c = clientes.find((x) => x.id === id);
    if (!c) return;
    limpiarFormularioCliente();
    editandoClienteId = id;
    modalClienteTitle.textContent = 'Editar cliente';
    document.getElementById('cliente-id').value = id;
    document.getElementById('cliente-nombre').value = c.name;
    document.getElementById('cliente-telefono').value = c.phone;
    document.getElementById('cliente-notas').value = c.notes || '';
    modalOverlayCliente.classList.add('visible');
  }

  function cerrarModalCliente() {
    modalOverlayCliente.classList.remove('visible');
    limpiarFormularioCliente();
  }

  clienteNuevoBtn.addEventListener('click', abrirModalNuevoCliente);
  document.getElementById('modal-cliente-close').addEventListener('click', cerrarModalCliente);
  document.getElementById('cancelar-cliente-btn').addEventListener('click', cerrarModalCliente);

  clienteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formClienteError.classList.remove('visible');

    const payload = {
      name: document.getElementById('cliente-nombre').value.trim(),
      phone: document.getElementById('cliente-telefono').value.trim(),
      notes: document.getElementById('cliente-notas').value.trim(),
    };

    try {
      const url = editandoClienteId ? '/api/admin/customers/' + editandoClienteId : '/api/admin/customers';
      const method = editandoClienteId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        formClienteError.textContent = data.error || 'No se pudo guardar el cliente';
        formClienteError.classList.add('visible');
        return;
      }
      cerrarModalCliente();
      await cargarClientes();
    } catch (e) {
      formClienteError.textContent = 'Error de conexión con el servidor';
      formClienteError.classList.add('visible');
    }
  });

  async function borrarCliente(id) {
    const confirmado = window.confirm('¿Eliminar este cliente y todo su historial de compras? Esta acción no se puede deshacer.');
    if (!confirmado) return;
    try {
      const res = await fetch('/api/admin/customers/' + id, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo eliminar el cliente');
        return;
      }
      await cargarClientes();
    } catch (e) {
      alert('Error de conexión con el servidor');
    }
  }

  // -------- Modal venta (registrar una compra a mano) --------
  function abrirModalVenta(clienteId) {
    ventaForm.reset();
    formVentaError.classList.remove('visible');
    document.getElementById('venta-cliente-id').value = clienteId;
    document.getElementById('venta-fecha').value = new Date().toISOString().slice(0, 10);
    modalOverlayVenta.classList.add('visible');
  }

  function cerrarModalVenta() {
    modalOverlayVenta.classList.remove('visible');
  }

  document.getElementById('modal-venta-close').addEventListener('click', cerrarModalVenta);
  document.getElementById('cancelar-venta-btn').addEventListener('click', cerrarModalVenta);

  ventaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formVentaError.classList.remove('visible');

    const clienteId = document.getElementById('venta-cliente-id').value;
    const payload = {
      amount: document.getElementById('venta-monto').value,
      purchaseDate: document.getElementById('venta-fecha').value,
      items: document.getElementById('venta-productos').value.trim(),
      note: document.getElementById('venta-nota').value.trim(),
    };

    try {
      const res = await fetch('/api/admin/customers/' + clienteId + '/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        formVentaError.textContent = data.error || 'No se pudo registrar la venta';
        formVentaError.classList.add('visible');
        return;
      }
      cerrarModalVenta();
      await cargarClientes();
      if (modalOverlayHistorial.classList.contains('visible') && historialClienteId === clienteId) {
        await abrirHistorial(clienteId);
      }
    } catch (e) {
      formVentaError.textContent = 'Error de conexión con el servidor';
      formVentaError.classList.add('visible');
    }
  });

  // -------- Modal historial de compras --------
  async function abrirHistorial(clienteId) {
    historialClienteId = clienteId;
    try {
      const res = await fetch('/api/admin/customers/' + clienteId);
      if (!res.ok) {
        alert('No se pudo cargar el historial de este cliente');
        return;
      }
      const data = await res.json();
      modalHistorialTitle.textContent = 'Historial de compras · ' + data.name;
      renderHistorial(data.compras || []);
      modalOverlayHistorial.classList.add('visible');
    } catch (e) {
      alert('Error de conexión con el servidor');
    }
  }

  function renderHistorial(compras) {
    if (!compras.length) {
      historialTablaBody.innerHTML = '';
      historialEmptyState.style.display = 'block';
      return;
    }
    historialEmptyState.style.display = 'none';

    historialTablaBody.innerHTML = compras
      .map((v) => {
        const fecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v.purchaseDate + 'T00:00:00'));
        const origen = v.source === 'web' ? 'Pedido web' : 'Manual';
        return (
          '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td>' + escaparHTML(v.items || '—') + '</td>' +
          '<td>' + formatearPrecio(v.amount) + '</td>' +
          '<td>' + origen + '</td>' +
          '<td>' + escaparHTML(v.note || '—') + '</td>' +
          '<td><button type="button" class="icon-btn danger" data-borrar-venta="' + v.id + '" title="Eliminar">' + iconoBorrar() + '</button></td>' +
          '</tr>'
        );
      })
      .join('');

    historialTablaBody.querySelectorAll('[data-borrar-venta]').forEach((btn) => {
      btn.addEventListener('click', () => borrarVenta(btn.getAttribute('data-borrar-venta')));
    });
  }

  async function borrarVenta(ventaId) {
    const confirmado = window.confirm('¿Eliminar esta venta del historial?');
    if (!confirmado) return;
    try {
      const res = await fetch('/api/admin/customers/' + historialClienteId + '/purchases/' + ventaId, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo eliminar la venta');
        return;
      }
      await abrirHistorial(historialClienteId);
      await cargarClientes();
    } catch (e) {
      alert('Error de conexión con el servidor');
    }
  }

  document.getElementById('modal-historial-close').addEventListener('click', () => {
    modalOverlayHistorial.classList.remove('visible');
    historialClienteId = null;
  });
  historialAgregarVentaBtn.addEventListener('click', () => abrirModalVenta(historialClienteId));

  // ====================================================
  // -------- RESEÑAS --------
  // ====================================================
  async function cargarResenas() {
    try {
      const estado = filtroResenaEstado.value; // '' | 'pendiente' | 'publicada'
      const url = '/api/admin/reviews' + (estado ? '?status=' + encodeURIComponent(estado) : '');
      const res = await fetch(url);
      if (res.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      resenas = await res.json();
      renderResenas();
      actualizarBadgeResenas();
    } catch (e) {
      resenasTablaBody.innerHTML = '<tr><td colspan="6">Error al cargar las reseñas.</td></tr>';
    }
  }

  // Consulta liviana para mostrar el número de reseñas pendientes en la
  // pestaña, sin necesidad de tener la tabla de reseñas abierta.
  async function actualizarBadgeResenas() {
    try {
      const res = await fetch('/api/admin/reviews?status=pendiente');
      if (!res.ok) return;
      const pendientes = await res.json();
      const cantidad = Array.isArray(pendientes) ? pendientes.length : 0;
      if (cantidad > 0) {
        resenasBadge.textContent = cantidad > 99 ? '99+' : cantidad;
        resenasBadge.style.display = 'inline-flex';
      } else {
        resenasBadge.style.display = 'none';
      }
    } catch (e) {
      // Si falla, simplemente no mostramos el badge; no bloqueamos el resto del panel.
    }
  }

  function estrellasHtml(calificacion) {
    const n = Math.max(0, Math.min(5, Number(calificacion) || 0));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function renderResenas() {
    if (!resenas.length) {
      resenasTablaBody.innerHTML = '';
      resenasEmptyState.style.display = 'block';
      return;
    }
    resenasEmptyState.style.display = 'none';

    resenasTablaBody.innerHTML = resenas
      .map((r) => {
        const comentarioLargo = (r.comentario || '').length > 80;
        const comentarioCortoTxt = comentarioLargo ? r.comentario.slice(0, 80) + '…' : (r.comentario || '');
        const comentarioHtml = comentarioLargo
          ? '<span class="resena-comentario-corto">' + escaparHTML(comentarioCortoTxt) + '</span>' +
            '<button type="button" class="resena-comentario-toggle" data-toggle-comentario="' + r.id + '">Ver más</button>' +
            '<div class="resena-comentario-completo" id="comentario-' + r.id + '">' + escaparHTML(r.comentario) + '</div>'
          : '<span class="resena-comentario-corto">' + escaparHTML(comentarioCortoTxt) + '</span>';

        const publicada = !!r.aprobada;

        return (
          '<tr>' +
          '<td><strong>' + escaparHTML(r.nombre || 'Anónimo') + '</strong></td>' +
          '<td><span class="resena-stars">' + estrellasHtml(r.calificacion) + '</span></td>' +
          '<td>' + comentarioHtml + '</td>' +
          '<td><span class="estado-badge ' + (publicada ? 'confirmado' : 'pendiente') + '">' + (publicada ? 'Publicada' : 'Pendiente') + '</span></td>' +
          '<td>' + formatearFecha(r.fecha) + '</td>' +
          '<td>' +
            '<div class="pedido-actions">' +
              '<select data-cambiar-estado-resena="' + r.id + '">' +
                '<option value="pendiente"' + (!publicada ? ' selected' : '') + '>Pendiente</option>' +
                '<option value="publicada"' + (publicada ? ' selected' : '') + '>Publicada</option>' +
              '</select>' +
              '<button type="button" class="icon-btn danger" data-borrar-resena="' + r.id + '" title="Eliminar">' + iconoBorrar() + '</button>' +
            '</div>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    resenasTablaBody.querySelectorAll('[data-toggle-comentario]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-toggle-comentario');
        document.getElementById('comentario-' + id).classList.toggle('visible');
      });
    });
    resenasTablaBody.querySelectorAll('[data-cambiar-estado-resena]').forEach((select) => {
      select.addEventListener('change', () => cambiarEstadoResena(select.getAttribute('data-cambiar-estado-resena'), select.value));
    });
    resenasTablaBody.querySelectorAll('[data-borrar-resena]').forEach((btn) => {
      btn.addEventListener('click', () => borrarResena(btn.getAttribute('data-borrar-resena')));
    });
  }

  async function cambiarEstadoResena(id, valor) {
    try {
      const res = await fetch('/api/admin/reviews/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aprobada: valor === 'publicada' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo actualizar la reseña');
      }
      await cargarResenas();
    } catch (e) {
      alert('Error de conexión con el servidor');
    }
  }

  async function borrarResena(id) {
    const confirmado = window.confirm('¿Eliminar esta reseña? Esta acción no se puede deshacer.');
    if (!confirmado) return;
    try {
      const res = await fetch('/api/admin/reviews/' + id, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo eliminar la reseña');
        return;
      }
      await cargarResenas();
    } catch (e) {
      alert('Error de conexión con el servidor');
    }
  }

  filtroResenaEstado.addEventListener('change', cargarResenas);
  refrescarResenasBtn.addEventListener('click', cargarResenas);

  // ====================================================
  // -------- NOVEDADES --------
  // ====================================================
  async function cargarNovedades() {
    try {
      const res = await fetch('/api/admin/news');
      if (res.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      novedades = await res.json();
      renderNovedades();
    } catch (e) {
      novedadesGrid.innerHTML = '<div class="empty-state">Error al cargar las novedades.</div>';
    }
  }

  function iconoImagenPlaceholder() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  }

  function renderNovedades() {
    const filtro = filtroNovedadEstado.value; // '' | 'activo' | 'inactivo'
    const lista = novedades.filter((n) => {
      if (filtro === 'activo') return !!n.active;
      if (filtro === 'inactivo') return !n.active;
      return true;
    });

    if (!lista.length) {
      novedadesGrid.innerHTML = '';
      novedadesEmptyState.style.display = 'block';
      return;
    }
    novedadesEmptyState.style.display = 'none';

    novedadesGrid.innerHTML = lista
      .map((n) => {
        const mediaHtml = n.video
          ? '<video src="' + n.video + '" muted playsinline preload="metadata"></video>'
          : (n.image ? '<img src="' + n.image + '" alt="">' : iconoImagenPlaceholder());
        return (
          '<article class="novedad-card">' +
            '<div class="novedad-card-img">' + mediaHtml + '</div>' +
            '<div class="novedad-card-body">' +
              (n.tag ? '<span class="novedad-tag">' + n.tag + '</span>' : '') +
              '<div class="novedad-card-titulo">' + n.title + '</div>' +
              (n.price ? '<div class="novedad-card-precio">' + formatearPrecio(n.price) + (n.oldPrice && n.oldPrice > n.price ? ' <span class="novedad-card-precio-anterior">' + formatearPrecio(n.oldPrice) + '</span>' : '') + '</div>' : '') +
              (n.content ? '<div class="novedad-card-contenido">' + n.content + '</div>' : '') +
              '<div class="novedad-card-footer">' +
                '<div>' +
                  '<span class="estado-badge ' + (n.active ? 'confirmado' : 'pendiente') + '">' + (n.active ? 'Publicada' : 'Oculta') + '</span> ' +
                  '<span class="novedad-card-fecha">' + formatearFecha(n.createdAt) + '</span>' +
                '</div>' +
                '<div class="novedad-card-actions">' +
                  '<button type="button" class="icon-btn" data-editar-novedad="' + n.id + '" title="Editar">' + iconoEditar() + '</button>' +
                  '<button type="button" class="icon-btn danger" data-borrar-novedad="' + n.id + '" title="Eliminar">' + iconoBorrar() + '</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</article>'
        );
      })
      .join('');

    novedadesGrid.querySelectorAll('[data-editar-novedad]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalEdicionNovedad(btn.getAttribute('data-editar-novedad')));
    });
    novedadesGrid.querySelectorAll('[data-borrar-novedad]').forEach((btn) => {
      btn.addEventListener('click', () => borrarNovedad(btn.getAttribute('data-borrar-novedad')));
    });
  }

  filtroNovedadEstado.addEventListener('change', renderNovedades);

  // -------- Selector Imagen / Video --------
  function actualizarBloqueMediaVisible() {
    const esVideo = novedadTipoVideoRadio.checked;
    novedadBloqueImagen.style.display = esVideo ? 'none' : '';
    novedadBloqueVideo.style.display = esVideo ? '' : 'none';
  }
  novedadTipoImagenRadio.addEventListener('change', actualizarBloqueMediaVisible);
  novedadTipoVideoRadio.addEventListener('change', actualizarBloqueMediaVisible);

  // -------- Imagen (una sola por novedad) --------
  function renderNovedadImagenGrid() {
    let html = '';

    if (novedadImagenNueva) {
      const src = URL.createObjectURL(novedadImagenNueva);
      html += '<div class="imagen-tile"><img src="' + src + '" alt=""><button type="button" class="imagen-quitar" id="novedad-imagen-quitar" title="Quitar imagen">✕</button></div>';
    } else if (novedadImagenExistente && !novedadQuitarImagen) {
      html += '<div class="imagen-tile"><img src="' + novedadImagenExistente + '" alt=""><button type="button" class="imagen-quitar" id="novedad-imagen-quitar" title="Quitar imagen">✕</button></div>';
    } else {
      html +=
        '<button type="button" class="imagen-agregar-tile" id="novedad-imagen-agregar-btn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' +
          'Agregar' +
        '</button>';
    }

    novedadImagenGrid.innerHTML = html;

    const btnAgregar = novedadImagenGrid.querySelector('#novedad-imagen-agregar-btn');
    if (btnAgregar) btnAgregar.addEventListener('click', () => novedadImagenInput.click());

    const btnQuitar = novedadImagenGrid.querySelector('#novedad-imagen-quitar');
    if (btnQuitar) {
      btnQuitar.addEventListener('click', () => {
        novedadImagenNueva = null;
        novedadQuitarImagen = true;
        novedadImagenInput.value = '';
        renderNovedadImagenGrid();
      });
    }
  }

  novedadImagenInput.addEventListener('change', () => {
    const file = novedadImagenInput.files[0];
    if (!file) return;
    novedadImagenNueva = file;
    novedadQuitarImagen = false;
    renderNovedadImagenGrid();
  });

  // -------- Video (uno solo por novedad) --------
  function renderNovedadVideoGrid() {
    let html = '';

    if (novedadVideoNueva) {
      const src = URL.createObjectURL(novedadVideoNueva);
      html += '<div class="imagen-tile"><video src="' + src + '" muted></video><button type="button" class="imagen-quitar" id="novedad-video-quitar" title="Quitar video">✕</button></div>';
    } else if (novedadVideoExistente && !novedadQuitarVideo) {
      html += '<div class="imagen-tile"><video src="' + novedadVideoExistente + '" muted></video><button type="button" class="imagen-quitar" id="novedad-video-quitar" title="Quitar video">✕</button></div>';
    } else {
      html +=
        '<button type="button" class="imagen-agregar-tile" id="novedad-video-agregar-btn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>' +
          'Agregar video' +
        '</button>';
    }

    novedadVideoGrid.innerHTML = html;

    const btnAgregar = novedadVideoGrid.querySelector('#novedad-video-agregar-btn');
    if (btnAgregar) btnAgregar.addEventListener('click', () => novedadVideoInput.click());

    const btnQuitar = novedadVideoGrid.querySelector('#novedad-video-quitar');
    if (btnQuitar) {
      btnQuitar.addEventListener('click', () => {
        novedadVideoNueva = null;
        novedadQuitarVideo = true;
        novedadVideoInput.value = '';
        renderNovedadVideoGrid();
      });
    }
  }

  novedadVideoInput.addEventListener('change', () => {
    const file = novedadVideoInput.files[0];
    if (!file) return;
    const limiteMB = 20;
    if (file.size > limiteMB * 1024 * 1024) {
      alert('El video pesa ' + (file.size / 1024 / 1024).toFixed(1) + 'MB. El máximo permitido es ' + limiteMB + 'MB — comprimilo antes de subirlo.');
      novedadVideoInput.value = '';
      return;
    }
    novedadVideoNueva = file;
    novedadQuitarVideo = false;
    renderNovedadVideoGrid();
  });

  function limpiarFormularioNovedad() {
    editandoNovedadId = null;
    novedadForm.reset();
    document.getElementById('novedad-id').value = '';
    document.getElementById('novedad-activo').checked = true;
    novedadImagenExistente = '';
    novedadImagenNueva = null;
    novedadQuitarImagen = false;
    novedadVideoExistente = '';
    novedadVideoNueva = null;
    novedadQuitarVideo = false;
    novedadTipoImagenRadio.checked = true;
    actualizarBloqueMediaVisible();
    renderNovedadImagenGrid();
    renderNovedadVideoGrid();
    formNovedadError.classList.remove('visible');
  }

  function abrirModalNuevaNovedad() {
    limpiarFormularioNovedad();
    modalNovedadTitle.textContent = 'Nueva novedad';
    modalOverlayNovedad.classList.add('visible');
  }

  function abrirModalEdicionNovedad(id) {
    const n = novedades.find((x) => x.id === id);
    if (!n) return;
    limpiarFormularioNovedad();
    editandoNovedadId = id;
    modalNovedadTitle.textContent = 'Editar novedad';
    document.getElementById('novedad-id').value = n.id;
    document.getElementById('novedad-titulo').value = n.title;
    document.getElementById('novedad-tag').value = n.tag || '';
    document.getElementById('novedad-contenido').value = n.content || '';
    document.getElementById('novedad-precio').value = n.price !== null && n.price !== undefined ? n.price : '';
    document.getElementById('novedad-precio-anterior').value = n.oldPrice !== null && n.oldPrice !== undefined ? n.oldPrice : '';
    document.getElementById('novedad-activo').checked = !!n.active;
    novedadImagenExistente = n.image || '';
    novedadVideoExistente = n.video || '';
    if (n.video) {
      novedadTipoVideoRadio.checked = true;
    } else {
      novedadTipoImagenRadio.checked = true;
    }
    actualizarBloqueMediaVisible();
    renderNovedadImagenGrid();
    renderNovedadVideoGrid();
    modalOverlayNovedad.classList.add('visible');
  }

  function cerrarModalNovedad() {
    modalOverlayNovedad.classList.remove('visible');
  }

  nuevaNovedadBtn.addEventListener('click', abrirModalNuevaNovedad);
  document.getElementById('modal-novedad-close').addEventListener('click', cerrarModalNovedad);
  document.getElementById('cancelar-novedad-btn').addEventListener('click', cerrarModalNovedad);
  modalOverlayNovedad.addEventListener('click', (e) => {
    if (e.target === modalOverlayNovedad) cerrarModalNovedad();
  });

  novedadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formNovedadError.classList.remove('visible');

    const guardarBtn = document.getElementById('guardar-novedad-btn');
    guardarBtn.disabled = true;
    guardarBtn.textContent = 'Guardando…';

    const formData = new FormData();
    formData.append('title', document.getElementById('novedad-titulo').value.trim());
    formData.append('tag', document.getElementById('novedad-tag').value);
    formData.append('content', document.getElementById('novedad-contenido').value.trim());
    formData.append('price', document.getElementById('novedad-precio').value);
    formData.append('oldPrice', document.getElementById('novedad-precio-anterior').value);
    formData.append('active', document.getElementById('novedad-activo').checked);

    // Es imagen O video, nunca los dos: si se está mostrando el bloque de
    // video, mandamos el video (si hay); si no, la imagen (si hay).
    if (novedadTipoVideoRadio.checked) {
      if (novedadVideoNueva) formData.append('video', novedadVideoNueva);
      if (novedadQuitarVideo) formData.append('quitarVideo', 'true');
      if (novedadImagenExistente) formData.append('quitarImagen', 'true');
    } else {
      if (novedadImagenNueva) formData.append('imagen', novedadImagenNueva);
      if (novedadQuitarImagen) formData.append('quitarImagen', 'true');
      if (novedadVideoExistente) formData.append('quitarVideo', 'true');
    }

    try {
      const url = editandoNovedadId ? '/api/admin/news/' + editandoNovedadId : '/api/admin/news';
      const method = editandoNovedadId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, body: formData });
      const data = await res.json();

      if (!res.ok) {
        formNovedadError.textContent = data.error || 'No se pudo guardar la novedad';
        formNovedadError.classList.add('visible');
        guardarBtn.disabled = false;
        guardarBtn.textContent = 'Guardar novedad';
        return;
      }

      cerrarModalNovedad();
      await cargarNovedades();
    } catch (e) {
      formNovedadError.textContent = 'Error de conexión con el servidor';
      formNovedadError.classList.add('visible');
    } finally {
      guardarBtn.disabled = false;
      guardarBtn.textContent = 'Guardar novedad';
    }
  });

  async function borrarNovedad(id) {
    const confirmado = window.confirm('¿Eliminar esta novedad? Se borra de la base de datos junto con su imagen y esta acción no se puede deshacer.');
    if (!confirmado) return;
    try {
      const res = await fetch('/api/admin/news/' + id, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo eliminar la novedad');
        return;
      }
      await cargarNovedades();
    } catch (e) {
      alert('Error de conexión con el servidor');
    }
  }

  // ====================================================
  // -------- HERO (carrusel del home) --------
  // ====================================================
  async function cargarHeroSlides() {
    try {
      const res = await fetch('/api/admin/hero');
      if (res.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      heroSlides = await res.json();
      renderHeroSlides();
    } catch (e) {
      heroSlidesGrid.innerHTML = '<div class="empty-state">Error al cargar las imágenes del hero.</div>';
    }
  }

  function renderHeroSlides() {
    if (!heroSlides.length) {
      heroSlidesGrid.innerHTML = '';
      heroSlidesEmptyState.style.display = 'block';
      return;
    }
    heroSlidesEmptyState.style.display = 'none';

    heroSlidesGrid.innerHTML = heroSlides
      .map((s, i) => {
        return (
          '<article class="hero-slide-card">' +
            '<div class="hero-slide-card-img"><img src="' + s.image + '" alt=""></div>' +
            '<div class="hero-slide-card-body">' +
              (s.link ? '<div class="hero-slide-card-link">→ ' + s.link + '</div>' : '<div class="hero-slide-card-link">Sin link (solo decorativa)</div>') +
              '<div class="hero-slide-card-footer">' +
                '<div>' +
                  '<span class="estado-badge ' + (s.active ? 'confirmado' : 'pendiente') + '">' + (s.active ? 'Visible' : 'Oculta') + '</span>' +
                '</div>' +
                '<div class="hero-slide-orden">' +
                  '<button type="button" data-mover-hero="' + s.id + '" data-direccion="up" ' + (i === 0 ? 'disabled' : '') + ' title="Subir">↑</button>' +
                  '<button type="button" data-mover-hero="' + s.id + '" data-direccion="down" ' + (i === heroSlides.length - 1 ? 'disabled' : '') + ' title="Bajar">↓</button>' +
                '</div>' +
              '</div>' +
              '<div class="hero-slide-card-actions">' +
                '<button type="button" class="icon-btn" data-editar-hero="' + s.id + '" title="Editar">' + iconoEditar() + '</button>' +
                '<button type="button" class="icon-btn danger" data-borrar-hero="' + s.id + '" title="Eliminar">' + iconoBorrar() + '</button>' +
              '</div>' +
            '</div>' +
          '</article>'
        );
      })
      .join('');

    heroSlidesGrid.querySelectorAll('[data-mover-hero]').forEach((btn) => {
      btn.addEventListener('click', () => moverHeroSlide(btn.getAttribute('data-mover-hero'), btn.getAttribute('data-direccion')));
    });
    heroSlidesGrid.querySelectorAll('[data-editar-hero]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalEdicionHero(btn.getAttribute('data-editar-hero')));
    });
    heroSlidesGrid.querySelectorAll('[data-borrar-hero]').forEach((btn) => {
      btn.addEventListener('click', () => borrarHeroSlide(btn.getAttribute('data-borrar-hero')));
    });
  }

  async function moverHeroSlide(id, direccion) {
    try {
      const res = await fetch('/api/admin/hero/' + id + '/mover', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: direccion }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo reordenar');
        return;
      }
      await cargarHeroSlides();
    } catch (e) {
      alert('Error de conexión con el servidor');
    }
  }

  // -------- Imagen (una sola por slide) --------
  function renderHeroImagenGrid() {
    let html = '';
    const existente = editandoHeroId ? (heroSlides.find((s) => s.id === editandoHeroId) || {}).image : '';

    if (heroImagenNueva) {
      const src = URL.createObjectURL(heroImagenNueva);
      html += '<div class="imagen-tile"><img src="' + src + '" alt="">' +
        '<button type="button" class="imagen-editar-tamano" id="hero-editar-tamano" title="Ajustar tamaño">' + iconoEditarTamano() + '</button>' +
        '<button type="button" class="imagen-quitar" id="hero-imagen-quitar" title="Cambiar imagen">✕</button></div>';
    } else if (existente) {
      html += '<div class="imagen-tile"><img src="' + existente + '" alt=""></div>';
    } else {
      html +=
        '<button type="button" class="imagen-agregar-tile" id="hero-imagen-agregar-btn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' +
          'Agregar' +
        '</button>';
    }

    heroImagenGrid.innerHTML = html;

    const btnAgregar = heroImagenGrid.querySelector('#hero-imagen-agregar-btn');
    if (btnAgregar) btnAgregar.addEventListener('click', () => heroImagenInput.click());

    const btnQuitar = heroImagenGrid.querySelector('#hero-imagen-quitar');
    if (btnQuitar) {
      btnQuitar.addEventListener('click', () => {
        heroImagenNueva = null;
        heroImagenInput.value = '';
        renderHeroImagenGrid();
      });
    }

    const btnEditarTamano = heroImagenGrid.querySelector('#hero-editar-tamano');
    if (btnEditarTamano) {
      btnEditarTamano.addEventListener('click', () => {
        abrirEditorTamano(heroImagenNueva, (archivoFinal) => {
          heroImagenNueva = archivoFinal;
          renderHeroImagenGrid();
        });
      });
    }
  }

  heroImagenInput.addEventListener('change', () => {
    const file = heroImagenInput.files[0];
    if (!file) return;
    heroImagenNueva = file;
    renderHeroImagenGrid();
  });

  function limpiarFormularioHero() {
    editandoHeroId = null;
    heroForm.reset();
    document.getElementById('hero-id').value = '';
    document.getElementById('hero-activo').checked = true;
    heroImagenNueva = null;
    renderHeroImagenGrid();
    formHeroError.classList.remove('visible');
  }

  function abrirModalNuevaHero() {
    limpiarFormularioHero();
    modalHeroTitle.textContent = 'Nueva imagen del hero';
    modalOverlayHero.classList.add('visible');
  }

  function abrirModalEdicionHero(id) {
    const s = heroSlides.find((x) => x.id === id);
    if (!s) return;
    limpiarFormularioHero();
    editandoHeroId = id;
    modalHeroTitle.textContent = 'Editar imagen del hero';
    document.getElementById('hero-id').value = s.id;
    document.getElementById('hero-link').value = s.link || '';
    document.getElementById('hero-activo').checked = !!s.active;
    renderHeroImagenGrid();
    modalOverlayHero.classList.add('visible');
  }

  function cerrarModalHero() {
    modalOverlayHero.classList.remove('visible');
  }

  nuevaHeroBtn.addEventListener('click', abrirModalNuevaHero);
  document.getElementById('modal-hero-close').addEventListener('click', cerrarModalHero);
  document.getElementById('cancelar-hero-btn').addEventListener('click', cerrarModalHero);
  modalOverlayHero.addEventListener('click', (e) => {
    if (e.target === modalOverlayHero) cerrarModalHero();
  });

  heroForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formHeroError.classList.remove('visible');

    if (!editandoHeroId && !heroImagenNueva) {
      formHeroError.textContent = 'Elegí una imagen';
      formHeroError.classList.add('visible');
      return;
    }

    const guardarBtn = document.getElementById('guardar-hero-btn');
    guardarBtn.disabled = true;
    guardarBtn.textContent = 'Guardando…';

    const formData = new FormData();
    formData.append('link', document.getElementById('hero-link').value.trim());
    formData.append('active', document.getElementById('hero-activo').checked);
    if (heroImagenNueva) formData.append('imagen', heroImagenNueva);

    try {
      const url = editandoHeroId ? '/api/admin/hero/' + editandoHeroId : '/api/admin/hero';
      const method = editandoHeroId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, body: formData });
      const data = await res.json();

      if (!res.ok) {
        formHeroError.textContent = data.error || 'No se pudo guardar la imagen';
        formHeroError.classList.add('visible');
        guardarBtn.disabled = false;
        guardarBtn.textContent = 'Guardar imagen';
        return;
      }

      cerrarModalHero();
      await cargarHeroSlides();
    } catch (e) {
      formHeroError.textContent = 'Error de conexión con el servidor';
      formHeroError.classList.add('visible');
    } finally {
      guardarBtn.disabled = false;
      guardarBtn.textContent = 'Guardar imagen';
    }
  });

  async function borrarHeroSlide(id) {
    const confirmado = window.confirm('¿Eliminar esta imagen del hero? Se borra de la base de datos junto con el archivo, y esta acción no se puede deshacer.');
    if (!confirmado) return;
    try {
      const res = await fetch('/api/admin/hero/' + id, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo eliminar la imagen');
        return;
      }
      await cargarHeroSlides();
    } catch (e) {
      alert('Error de conexión con el servidor');
    }
  }

  // ====================================================
  // -------- ESTADÍSTICAS --------
  // ====================================================
  async function cargarStats() {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      const data = await res.json();
      renderStatsGenerales(data);
      renderTopProductos(data.topProductos || []);
    } catch (e) {
      topProductosBody.innerHTML = '<tr><td colspan="3">Error al cargar las estadísticas.</td></tr>';
    }
  }

  function renderStatsGenerales(data) {
    document.getElementById('stat2-ventas').textContent = data.ventasTotales;
    document.getElementById('stat2-ingresos').textContent = formatearPrecio(data.ingresosTotales);
    document.getElementById('stat2-pendientes').textContent = data.pedidosPendientes;
    document.getElementById('stat2-mes').textContent = data.pedidosEsteMes;
    document.getElementById('stat2-ingresos-mes').textContent = formatearPrecio(data.ingresosEsteMes);
  }

  function renderTopProductos(lista) {
    if (!lista.length) {
      topProductosBody.innerHTML = '';
      topProductosEmpty.style.display = 'block';
      return;
    }
    topProductosEmpty.style.display = 'none';

    topProductosBody.innerHTML = lista
      .map(
        (p) =>
          '<tr>' +
          '<td><strong>' + p.name + '</strong></td>' +
          '<td>' + p.unidadesPedidas + '</td>' +
          '<td>' + formatearPrecio(p.ingresos) + '</td>' +
          '</tr>'
      )
      .join('');
  }

  verificarSesion();
})();
