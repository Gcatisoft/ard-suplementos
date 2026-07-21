require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'ard-suplementos-secret-cambiar';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'productos';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '\n❌ Faltan variables de entorno de Supabase.\n' +
      '   Configurá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en tu archivo .env\n' +
      '   (mirá .env.example para el detalle).\n'
  );
  process.exit(1);
}

// Cliente con la Service Role Key: SOLO se usa en el backend, nunca en el navegador.
// Esta key bypassea RLS, por eso todo el control de acceso (login, requireAuth)
// tiene que vivir acá, en el servidor.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------- Multer en memoria (subimos el buffer directo a Supabase Storage) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagen no permitido'));
  },
});

async function subirImagen(file) {
  const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filename, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filename);
  return { url: data.publicUrl, path: filename };
}

async function borrarImagenPorUrl(url) {
  if (!url) return;
  try {
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return; // no es una imagen guardada en nuestro bucket (ej: URL externa)
    const filename = url.slice(idx + marker.length);
    if (filename) await supabase.storage.from(STORAGE_BUCKET).remove([filename]);
  } catch (err) {
    console.error('No se pudo borrar la imagen anterior de Storage:', err.message);
  }
}

// ---------- Mapeo de filas de la base (snake_case) al formato que usa el frontend (camelCase) ----------
function mapProducto(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand || '',
    category: row.category,
    price: Number(row.price),
    oldPrice: row.old_price !== null && row.old_price !== undefined ? Number(row.old_price) : null,
    cardPrice: row.card_price !== null && row.card_price !== undefined ? Number(row.card_price) : null,
    stock: row.stock,
    description: row.description || '',
    image: row.image || '',
    images: Array.isArray(row.images) ? row.images : (row.image ? [row.image] : []),
    featured: row.featured,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- App ----------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

// ---------- Auth ----------
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('id, username, password_hash')
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;
    if (!admin) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const ok = bcrypt.compareSync(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    req.session.isAdmin = true;
    req.session.username = admin.username;
    res.json({ ok: true, username: admin.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin), username: req.session?.username || null });
});

app.post('/api/admin/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Completá ambos campos' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('id, password_hash')
      .eq('username', req.session.username)
      .maybeSingle();
    if (error) throw error;
    if (!admin) return res.status(404).json({ error: 'Usuario no encontrado' });

    const ok = bcrypt.compareSync(currentPassword, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'La contraseña actual no es correcta' });

    const newHash = bcrypt.hashSync(newPassword, 10);
    const { error: updateError } = await supabase
      .from('admin_users')
      .update({ password_hash: newHash })
      .eq('id', admin.id);
    if (updateError) throw updateError;

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
});

// ---------- Productos: API pública (para el index) ----------
app.get('/api/products', async (req, res) => {
  try {
    const { category, featured, q } = req.query;
    let query = supabase.from('products').select('*').eq('active', true);

    if (category) query = query.ilike('category', category);
    if (featured === 'true') query = query.eq('featured', true);
    if (q) query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%`);

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    res.json((data || []).map(mapProducto));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los productos' });
  }
});

app.get('/api/products/categories', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('category').eq('active', true);
    if (error) throw error;
    const categorias = [...new Set((data || []).map((r) => r.category))];
    res.json(categorias);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las categorías' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .eq('active', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(mapProducto(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el producto' });
  }
});

// ---------- Productos: API de administración (protegida) ----------
app.get('/api/admin/products', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(mapProducto));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los productos' });
  }
});

app.get('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(mapProducto(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el producto' });
  }
});

app.post('/api/admin/products', requireAuth, upload.array('imagenes', 8), async (req, res) => {
  try {
    const { name, brand, category, price, oldPrice, cardPrice, stock, description, featured, active, imageUrl } = req.body;
    if (!name || !category || price === undefined || price === '') {
      return res.status(400).json({ error: 'Nombre, categoría y precio son obligatorios' });
    }

    let images = [];
    if (req.files && req.files.length) {
      const subidas = await Promise.all(req.files.map(subirImagen));
      images = subidas.map((s) => s.url);
    } else if (imageUrl) {
      images = [imageUrl];
    }

    const nuevo = {
      name: String(name).trim(),
      brand: brand ? String(brand).trim() : '',
      category: String(category).trim(),
      price: Number(price) || 0,
      old_price: oldPrice ? Number(oldPrice) : null,
      card_price: cardPrice ? Number(cardPrice) : null,
      stock: stock !== undefined && stock !== '' ? Number(stock) : 0,
      description: description ? String(description).trim() : '',
      image: images[0] || '',
      images,
      featured: featured === 'true' || featured === true,
      active: active === undefined ? true : active === 'true' || active === true,
    };

    const { data, error } = await supabase.from('products').insert(nuevo).select().single();
    if (error) throw error;

    res.status(201).json(mapProducto(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el producto' });
  }
});

app.put('/api/admin/products/:id', requireAuth, upload.array('imagenes', 8), async (req, res) => {
  try {
    const { data: existing, error: findError } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

    const { name, brand, category, price, oldPrice, cardPrice, stock, description, featured, active, imagenesExistentes } =
      req.body;

    const cambios = {};
    if (name !== undefined) cambios.name = String(name).trim();
    if (brand !== undefined) cambios.brand = String(brand).trim();
    if (category !== undefined) cambios.category = String(category).trim();
    if (price !== undefined && price !== '') cambios.price = Number(price);
    if (oldPrice !== undefined) cambios.old_price = oldPrice === '' ? null : Number(oldPrice);
    if (cardPrice !== undefined) cambios.card_price = cardPrice === '' ? null : Number(cardPrice);
    if (stock !== undefined && stock !== '') cambios.stock = Number(stock);
    if (description !== undefined) cambios.description = String(description).trim();
    if (featured !== undefined) cambios.featured = featured === 'true' || featured === true;
    if (active !== undefined) cambios.active = active === 'true' || active === true;

    // -------- Galería de imágenes --------
    // El frontend manda en `imagenesExistentes` (JSON) las URLs que el admin
    // decidió conservar (pudo haber sacado alguna), y en los archivos subidos
    // (`req.files`) las imágenes nuevas que agregó. Acá las combinamos y
    // borramos del storage las que ya no quedaron en ningún lado.
    if (imagenesExistentes !== undefined) {
      let conservadas = [];
      try {
        conservadas = JSON.parse(imagenesExistentes);
        if (!Array.isArray(conservadas)) conservadas = [];
      } catch (e) {
        conservadas = [];
      }

      let nuevasUrls = [];
      if (req.files && req.files.length) {
        const subidas = await Promise.all(req.files.map(subirImagen));
        nuevasUrls = subidas.map((s) => s.url);
      }

      const imagenesFinales = [...conservadas, ...nuevasUrls];
      const imagenesPrevias = Array.isArray(existing.images) ? existing.images : (existing.image ? [existing.image] : []);
      const eliminadas = imagenesPrevias.filter((url) => !imagenesFinales.includes(url));
      await Promise.all(eliminadas.map(borrarImagenPorUrl));

      cambios.images = imagenesFinales;
      cambios.image = imagenesFinales[0] || '';
    }

    const { data, error } = await supabase
      .from('products')
      .update(cambios)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;

    res.json(mapProducto(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
});

app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    const { data: existing, error: findError } = await supabase
      .from('products')
      .select('image')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) throw error;

    await borrarImagenPorUrl(existing.image);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
});
// ============================================================
// PEGAR ESTE BLOQUE EN server.js, ANTES de: app.get('/admin', ...)
// ============================================================

// ---------- Mapeo de pedidos (snake_case -> camelCase) ----------
function mapOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerId: row.customer_id,
    items: row.items || [],
    total: Number(row.total),
    status: row.status,
    notes: row.notes || '',
    sentVia: row.sent_via,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- Pedidos: API pública ----------
// El storefront pega acá justo antes (o al mismo tiempo) de abrir el link de WhatsApp,
// así queda registrado en el panel aunque el cliente no confirme nada más.
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerPhone, customerId, items, notes } = req.body || {};

    if (!customerName || !customerPhone || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Faltan datos del pedido (nombre, teléfono o items)' });
    }

    const total = items.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);

    const nuevo = {
      customer_name: String(customerName).trim(),
      customer_phone: String(customerPhone).trim(),
      customer_id: customerId || null,
      items,
      total,
      notes: notes ? String(notes).trim() : '',
      status: 'pendiente',
      sent_via: 'whatsapp',
    };

    const { data, error } = await supabase.from('orders').insert(nuevo).select().single();
    if (error) throw error;

    res.status(201).json(mapOrder(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar el pedido' });
  }
});

// ---------- Pedidos: API de administración (protegida) ----------
app.get('/api/admin/orders', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json((data || []).map(mapOrder));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los pedidos' });
  }
});

app.patch('/api/admin/orders/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['pendiente', 'confirmado', 'cancelado'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pedido no encontrado' });

    res.json(mapOrder(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el estado del pedido' });
  }
});

app.delete('/api/admin/orders/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el pedido' });
  }
});

// ---------- Estadísticas (protegida) ----------
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const [{ data: resumen, error: errResumen }, { data: topProductos, error: errTop }] = await Promise.all([
      supabase.from('stats_resumen').select('*').maybeSingle(),
      supabase.from('stats_productos_top').select('*'),
    ]);
    if (errResumen) throw errResumen;
    if (errTop) throw errTop;

    res.json({
      ventasTotales: Number(resumen?.ventas_totales || 0),
      ingresosTotales: Number(resumen?.ingresos_totales || 0),
      pedidosPendientes: Number(resumen?.pedidos_pendientes || 0),
      pedidosEsteMes: Number(resumen?.pedidos_este_mes || 0),
      ingresosEsteMes: Number(resumen?.ingresos_este_mes || 0),
      topProductos: (topProductos || []).map((r) => ({
        productId: r.product_id,
        name: r.name,
        unidadesPedidas: Number(r.unidades_pedidas),
        ingresos: Number(r.ingresos),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las estadísticas' });
  }
});

// Ruta directa al panel admin
app.get('/admin', (req, res) => {
  res.redirect('/admin/login.html');
});

app.listen(PORT, () => {
  console.log(`\nARD Suplementos corriendo en http://localhost:${PORT}`);
  console.log(`Panel de administración: http://localhost:${PORT}/admin/login.html`);
  console.log(`Conectado a Supabase: ${SUPABASE_URL}`);
});
