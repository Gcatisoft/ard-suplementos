(function () {
  let productos = [];
  let pedidos = [];
  let editandoId = null;
  let imagenRemovida = false;

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

  const imagePreview = document.getElementById('image-preview');
  const imagePreviewPlaceholder = document.getElementById('image-preview-placeholder');
  const imagenInput = document.getElementById('imagen');

  // -------- Pedidos / Estadísticas --------
  const pedidosTablaBody = document.getElementById('pedidos-tabla-body');
  const pedidosEmptyState = document.getElementById('pedidos-empty-state');
  const filtroPedidoEstado = document.getElementById('filtro-pedido-estado');
  const refrescarPedidosBtn = document.getElementById('refrescar-pedidos-btn');
  const topProductosBody = document.getElementById('top-productos-body');
  const topProductosEmpty = document.getElementById('top-productos-empty');

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
    stats: document.getElementById('tab-stats'),
  };

  let pedidosCargados = false;
  let statsCargadas = false;

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
      // Si ya se cargaron antes, igual refrescamos al volver a la pestaña
      // para no mostrar datos viejos si pasó tiempo:
      if (tab === 'pedidos' && pedidosCargados) cargarPedidos();
      if (tab === 'stats' && statsCargadas) cargarStats();
    });
  });

  // ====================================================
  // -------- PRODUCTOS --------
  // ====================================================
  async function cargarProductos() {
    try {
      const res = await fetch('/api/admin/products');
      if (res.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      productos = await res.json();
      actualizarSelectorCategorias();
      renderTabla();
      renderStats();
    } catch (e) {
      tablaBody.innerHTML = '<tr><td colspan="8">Error al cargar los productos.</td></tr>';
    }
  }

  function actualizarSelectorCategorias() {
    const categorias = [...new Set(productos.map((p) => p.category).filter(Boolean))].sort();
    const valorActual = filtroCategoria.value;
    filtroCategoria.innerHTML =
      '<option value="">Todas las categorías</option>' +
      categorias.map((c) => '<option value="' + c + '">' + c + '</option>').join('');
    filtroCategoria.value = categorias.includes(valorActual) ? valorActual : '';

    categoriasLista.innerHTML = categorias.map((c) => '<option value="' + c + '">').join('');
  }

  function productosFiltrados() {
    const term = buscador.value.trim().toLowerCase();
    const cat = filtroCategoria.value;
    const estado = filtroEstado.value;
    return productos.filter((p) => {
      if (term && !(p.name.toLowerCase().includes(term) || (p.brand || '').toLowerCase().includes(term))) return false;
      if (cat && p.category !== cat) return false;
      if (estado === 'activo' && !p.active) return false;
      if (estado === 'inactivo' && p.active) return false;
      return true;
    });
  }

  function renderStats() {
    document.getElementById('stat-total').textContent = productos.length;
    document.getElementById('stat-activos').textContent = productos.filter((p) => p.active).length;
    document.getElementById('stat-sinstock').textContent = productos.filter((p) => Number(p.stock) <= 0).length;
    document.getElementById('stat-destacados').textContent = productos.filter((p) => p.featured).length;
  }

  function renderTabla() {
    const lista = productosFiltrados();
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
        const precioHtml = p.cardPrice
          ? '<div>' + precioEfectivoHtml + '</div><div style="font-size:12px;color:#6b7686;">' + formatearPrecio(p.cardPrice) + ' tarjeta</div>'
          : precioEfectivoHtml;

        return (
          '<tr>' +
          '<td>' + imagenHtml + '</td>' +
          '<td><strong>' + p.name + '</strong></td>' +
          '<td>' + (p.brand || '—') + '</td>' +
          '<td>' + p.category + '</td>' +
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

  buscador.addEventListener('input', renderTabla);
  filtroCategoria.addEventListener('change', renderTabla);
  filtroEstado.addEventListener('change', renderTabla);

  // -------- Modal: abrir / cerrar --------
  function limpiarFormulario() {
    editandoId = null;
    imagenRemovida = false;
    productoForm.reset();
    document.getElementById('producto-id').value = '';
    document.getElementById('activo').checked = true;
    document.getElementById('destacado').checked = false;
    imagePreview.style.display = 'none';
    imagePreviewPlaceholder.style.display = 'flex';
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
    document.getElementById('precio-tarjeta').value = p.cardPrice || '';
    document.getElementById('precio-anterior').value = p.oldPrice || '';
    document.getElementById('stock').value = p.stock;
    document.getElementById('descripcion').value = p.description || '';
    document.getElementById('destacado').checked = !!p.featured;
    document.getElementById('activo').checked = !!p.active;

    if (p.image) {
      imagePreview.src = p.image;
      imagePreview.style.display = 'block';
      imagePreviewPlaceholder.style.display = 'none';
    }
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

  imagenInput.addEventListener('change', () => {
    const file = imagenInput.files[0];
    if (!file) return;
    imagenRemovida = false;
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      imagePreview.style.display = 'block';
      imagePreviewPlaceholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
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
    formData.append('cardPrice', document.getElementById('precio-tarjeta').value);
    formData.append('oldPrice', document.getElementById('precio-anterior').value);
    formData.append('stock', document.getElementById('stock').value || '0');
    formData.append('description', document.getElementById('descripcion').value.trim());
    formData.append('featured', document.getElementById('destacado').checked);
    formData.append('active', document.getElementById('activo').checked);

    const archivo = imagenInput.files[0];
    if (archivo) formData.append('image', archivo);

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
          .map((it) => '<li>' + it.qty + 'x ' + it.name + ' — ' + formatearPrecio(it.price) + '</li>')
          .join('');

        return (
          '<tr>' +
          '<td>#' + String(p.orderNumber).padStart(4, '0') + '</td>' +
          '<td><strong>' + p.customerName + '</strong></td>' +
          '<td>' + p.customerPhone + '</td>' +
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
