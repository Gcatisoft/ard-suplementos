require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'productos';

// ---------- Mercado Pago (Checkout Pro) ----------
// Solo hace falta el Access Token. Si no está cargado, el botón de "Pagar
// online" del carrito devuelve un error controlado y el sitio sigue andando
// normal con el checkout por WhatsApp.
const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const MP_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET || '';
// URL pública del sitio (para armar los links de retorno y el webhook que MP
// nos pega cuando cambia el estado de un pago). En producción, seteala en el
// .env; en local se deduce del request (y el webhook se omite porque MP no
// puede llegar a localhost).
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

// Sin fallback: si falta alguna de estas, el server no arranca. Un
// SESSION_SECRET hardcodeado en el código sería público (queda en el
// repo) y cualquiera podría firmar cookies de sesión válidas con él.
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SESSION_SECRET) {
  console.error(
    '\n❌ Faltan variables de entorno obligatorias.\n' +
      '   Configurá SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SESSION_SECRET en tu archivo .env\n' +
      '   (mirá .env.example para el detalle. SESSION_SECRET: cualquier string largo y random,\n' +
      '   por ejemplo generado con `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`).\n'
  );
  process.exit(1);
}

// Cliente con la Service Role Key: SOLO se usa en el backend, nunca en el navegador.
// Esta key bypassea RLS, por eso todo el control de acceso (login, requireAuth)
// tiene que vivir acá, en el servidor.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------- Helpers de Mercado Pago ----------
// Llamadas directas a la API REST de MP (sin SDK): una dependencia menos que
// mantener/compilar en el deploy y alcanza de sobra para Checkout Pro.
async function mpApi(ruta, opciones = {}) {
  const res = await fetch('https://api.mercadopago.com' + ruta, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opciones.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Error de Mercado Pago');
    err.mpBody = data;
    throw err;
  }
  return data;
}

function urlBase(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  return `${req.protocol}://${req.get('host')}`;
}

// Traduce el estado de un pago de MP al estado interno del pedido.
function estadoPedidoDesdeMP(mpStatus) {
  if (mpStatus === 'approved') return 'confirmado';
  if (mpStatus === 'rejected' || mpStatus === 'cancelled' || mpStatus === 'charged_back') return 'cancelado';
  return 'pendiente'; // pending, in_process, authorized, etc.
}

// Valida la firma del webhook (header x-signature) cuando hay un secreto
// configurado. Sin secreto, no se valida (para poder probar rápido), pero
// conviene setear MERCADOPAGO_WEBHOOK_SECRET en producción.
function firmaWebhookValida(req) {
  if (!MP_WEBHOOK_SECRET) return true;
  const firma = req.get('x-signature') || '';
  const requestId = req.get('x-request-id') || '';
  const partes = {};
  firma.split(',').forEach((p) => {
    const [k, v] = p.split('=').map((s) => (s || '').trim());
    if (k && v) partes[k] = v;
  });
  if (!partes.ts || !partes.v1) return false;
  const dataId = String(req.query['data.id'] || req.body?.data?.id || '').toLowerCase();
  const manifest = `id:${dataId};request-id:${requestId};ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(partes.v1));
  } catch (e) {
    return false;
  }
}

// ---------- Multer en memoria (subimos el buffer directo a Supabase Storage) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagen no permitido'));
  },
});

// Middleware para convertir errores de multer (archivo muy pesado o formato
// no permitido) en un JSON prolijo, en vez de que Express devuelva una
// página de error HTML que el panel no puede interpretar (y que se termina
// viendo como "Error de conexión con el servidor" aunque el problema real
// sea, por ejemplo, que la foto pesa más de 5MB).
function manejarErrorImagen(err, req, res, next) {
  if (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'La imagen supera el máximo permitido (5MB). Achicá el archivo e intentá de nuevo.' });
    }
    return res.status(400).json({ error: err.message || 'No se pudo procesar la imagen' });
  }
  next();
}

// Multer aparte para Novedades, que además de imagen puede llevar un video.
// Límite más alto porque un video pesa más, aunque sea corto.
const VIDEO_MAX_MB = 20;
const uploadNovedad = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const esImagen = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    const esVideo = /^video\/(mp4|webm|quicktime)$/.test(file.mimetype);
    if (esImagen || esVideo) cb(null, true);
    else cb(new Error('Formato no permitido (usá JPG, PNG, WEBP, MP4 o WEBM)'));
  },
});

// Redimensiona (máx. 1600px de lado más largo) y convierte a WebP para que
// las imágenes de producto ocupen bastante menos espacio en Storage y carguen
// más rápido en el sitio. Los GIF se suben tal cual (para no perder la
// animación si el producto tuviera una imagen animada).
async function optimizarImagen(file) {
  if (file.mimetype === 'image/gif') {
    // El mimetype que manda el navegador es solo una etiqueta, no una
    // garantía: alguien podría subir cualquier archivo (por ejemplo HTML/JS)
    // con el header Content-Type falseado a "image/gif" para que quede
    // guardado en Storage y luego intentar que otra víctima lo abra
    // directamente. Comprobamos la firma real del archivo (los primeros
    // bytes de todo GIF válido son "GIF87a" o "GIF89a") antes de aceptarlo.
    const firma = file.buffer.slice(0, 6).toString('ascii');
    if (firma !== 'GIF87a' && firma !== 'GIF89a') {
      throw new Error('El archivo no es un GIF válido');
    }
    return { buffer: file.buffer, contentType: file.mimetype, ext: '.gif' };
  }
  const buffer = await sharp(file.buffer)
    .rotate() // respeta la orientación EXIF de fotos sacadas con el celular
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return { buffer, contentType: 'image/webp', ext: '.webp' };
}

async function subirImagen(file) {
  const { buffer, contentType, ext } = await optimizarImagen(file);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filename, buffer, { contentType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filename);
  return { url: data.publicUrl, path: filename };
}

// Los videos NO se recomprimen en el servidor: transcodificar video pide
// bastante más tiempo y memoria de los que da una función serverless de
// Vercel, y podría hacer fallar (o tumbar) el despliegue igual que pasó con
// sharp. Por eso: se valida tamaño/formato y se sube tal cual. Si querés
// controlar bien el peso, comprimí el video antes de subirlo (con el editor
// del celular o alguna web gratuita) — subiendo clips cortos (10-15s) en MP4
// ya se mantiene liviano.
async function subirVideo(file) {
  const extPorMime = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
  const ext = extPorMime[file.mimetype] || '.mp4';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;

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
    creditPrice: row.credit_price !== null && row.credit_price !== undefined ? Number(row.credit_price) : null,
    stock: row.stock,
    description: row.description || '',
    image: row.image || '',
    images: Array.isArray(row.images) ? row.images : (row.image ? [row.image] : []),
    flavors: row.flavors || '',
    installments: row.installments !== null && row.installments !== undefined ? Number(row.installments) : null,
    featured: row.featured,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNoticia(row) {
  return {
    id: row.id,
    title: row.title,
    tag: row.tag || '',
    content: row.content || '',
    image: row.image || '',
    video: row.video || '',
    price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
    oldPrice: row.old_price !== null && row.old_price !== undefined ? Number(row.old_price) : null,
    active: row.active,
    createdAt: row.created_at,
  };
}

function mapCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    notes: row.notes || '',
    contactedAt: row.contacted_at || null,
    createdAt: row.created_at,
  };
}

function mapPurchase(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    amount: Number(row.amount),
    purchaseDate: row.purchase_date,
    note: row.note || '',
    items: row.items || '',
    source: row.source,
    createdAt: row.created_at,
  };
}

// Deja solo dígitos, para poder matchear el mismo cliente aunque escriban
// el teléfono con espacios, guiones, +54, etc.
function normalizarTelefono(tel) {
  return String(tel || '').replace(/\D/g, '');
}

// Busca un cliente por teléfono normalizado; si no existe, lo crea.
// Se usa tanto desde el checkout público (pedidos por WhatsApp) como
// desde el alta manual en el panel, para no duplicar clientes.
async function buscarOCrearCliente({ name, phone }) {
  const telNormalizado = normalizarTelefono(phone);
  if (!telNormalizado) return null;

  const { data: existente, error: errBuscar } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', telNormalizado)
    .maybeSingle();
  if (errBuscar) throw errBuscar;

  if (existente) return existente;

  const { data: nuevo, error: errCrear } = await supabase
    .from('customers')
    .insert({ name: String(name || 'Sin nombre').trim(), phone: telNormalizado })
    .select()
    .single();
  if (errCrear) throw errCrear;
  return nuevo;
}

function mapHeroSlide(row) {
  return {
    id: row.id,
    image: row.image,
    link: row.link || '',
    position: row.position,
    active: row.active,
    createdAt: row.created_at,
  };
}

// ---------- Store de sesiones persistente (Supabase) ----------
// Por defecto express-session guarda las sesiones en RAM (MemoryStore), lo que
// borra TODAS las sesiones activas (de los 4 usuarios, sin distinción) cada vez
// que el proceso de Node se reinicia (redeploy, crash, hosting que "duerme" la
// app por inactividad, etc.). Guardándolas en una tabla de Supabase, sobreviven
// a los reinicios y cada admin mantiene su sesión hasta el maxAge configurado.
class SupabaseSessionStore extends session.Store {
  constructor(client) {
    super();
    this.client = client;
  }

  async get(sid, cb) {
    try {
      const { data, error } = await this.client
        .from('sessions')
        .select('sess, expire')
        .eq('sid', sid)
        .maybeSingle();
      if (error) return cb(error);
      if (!data) return cb(null, null);
      if (new Date(data.expire).getTime() < Date.now()) {
        this.destroy(sid, () => {});
        return cb(null, null);
      }
      cb(null, data.sess);
    } catch (err) {
      cb(err);
    }
  }

  async set(sid, sess, cb) {
    try {
      const maxAge = sess.cookie?.maxAge || 1000 * 60 * 60 * 8;
      const expire = new Date(Date.now() + maxAge).toISOString();
      const { error } = await this.client
        .from('sessions')
        .upsert({ sid, sess, expire }, { onConflict: 'sid' });
      if (error) return cb(error);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  async destroy(sid, cb) {
    try {
      const { error } = await this.client.from('sessions').delete().eq('sid', sid);
      if (error) return cb(error);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  async touch(sid, sess, cb) {
    // Extiende el vencimiento sin reescribir todo el contenido de la sesión.
    try {
      const maxAge = sess.cookie?.maxAge || 1000 * 60 * 60 * 8;
      const expire = new Date(Date.now() + maxAge).toISOString();
      const { error } = await this.client.from('sessions').update({ expire }).eq('sid', sid);
      if (error) return cb(error);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

// ---------- App ----------
const app = express();

// Necesario para que Express detecte HTTPS correctamente detrás de un proxy
// (Vercel, Render, etc. terminan TLS antes de llegar a Node). Sin esto,
// `cookie.secure` de abajo nunca se activaría en producción y la cookie de
// sesión viajaría también por HTTP.
app.set('trust proxy', 1);

// Headers de seguridad básicos (CSP, X-Frame-Options, X-Content-Type-Options,
// etc.). CSP desactivado por ahora porque el sitio carga imágenes/scripts de
// orígenes variados (Supabase Storage, CDNs) y una política default bloquea
// eso; se puede afinar más adelante con las fuentes exactas que usa el sitio.
app.use(helmet({ contentSecurityPolicy: false }));

// Comprime (gzip) todas las respuestas de texto (HTML, CSS, JS, JSON), que
// suelen pesar 60-80% menos comprimidas: páginas más livianas y más rápidas.
app.use(compression());
// Límite de tamaño en el body JSON/form: sin esto, cualquiera puede mandar
// un POST de varios MB de texto (por ejemplo en "notes" o "comentario") y
// forzar al server a parsear payloads gigantes repetidamente (DoS barato).
// 1MB es de sobra para nombre/teléfono/notas/reseñas; las imágenes van aparte
// por multipart (multer), no por acá.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(
  session({
    store: new SupabaseSessionStore(supabase),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // Solo por HTTPS en producción (evita que la cookie de sesión viaje en
      // texto plano); en local (NODE_ENV distinto de 'production', sin TLS)
      // la dejamos sin 'secure' para poder seguir probando por http://localhost.
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  })
);
app.use(
  express.static(path.join(__dirname, 'public'), {
    // Los archivos con extensión (imágenes, CSS, JS, fuentes) se cachean en
    // el navegador por 1 día: en visitas repetidas no se vuelven a descargar,
    // así el sitio carga casi al instante. Los .html no se cachean, para que
    // los cambios que subís se vean apenas los publicás.
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

// ---------- Rate limiting ----------
// Login: máximo 10 intentos cada 15 min por IP. Frena fuerza bruta sobre las
// contraseñas de admin sin afectar el uso normal (nadie falla el login 10 veces).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Pedidos y reseñas: rutas públicas sin login, expuestas a spam/bots.
// Límite generoso (no son acciones que un cliente real repita muchas veces
// seguidas) pero corta scripts que las inunden.
const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas solicitudes. Probá de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------- Auth ----------
app.post('/api/admin/login', loginLimiter, async (req, res) => {
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
// Sanitiza el término de búsqueda antes de meterlo en un filtro PostgREST:
// `.or()` recibe un string crudo con sintaxis propia (comas separan
// condiciones, los paréntesis anidan). Si el texto del usuario llega tal
// cual, alguien podría escribir algo como `x,is-active.eq.false)`-like para
// inyectar condiciones extra en el filtro. Sacamos esos caracteres especiales
// y escapamos los comodines de ILIKE (%, _) para que el término se use
// siempre como texto literal a buscar, nunca como sintaxis de filtro.
function sanitizarBusqueda(q) {
  return String(q)
    .replace(/[,()]/g, '')
    .replace(/[%_]/g, '\\$&')
    .slice(0, 100)
    .trim();
}

app.get('/api/products', async (req, res) => {
  try {
    const { category, featured, q } = req.query;
    let query = supabase.from('products').select('*').eq('active', true);

    if (category) query = query.ilike('category', category);
    if (featured === 'true') query = query.eq('featured', true);
    if (q) {
      const term = sanitizarBusqueda(q);
      if (term) query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%`);
    }

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
// Paginado en el servidor: antes esto traía TODOS los productos (con todas
// sus imágenes) en cada carga del panel, aunque hubiera cientos. Ahora se
// pide de a páginas (20 por defecto) y los filtros de búsqueda/categoría/
// estado se aplican en la consulta a Supabase, no sobre el listado completo
// ya bajado al navegador.
app.get('/api/admin/products', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const desde = (page - 1) * limit;
    const hasta = desde + limit - 1;

    let query = supabase.from('products').select('*', { count: 'exact' });

    if (req.query.category) query = query.eq('category', req.query.category);
    if (req.query.estado === 'activo') query = query.eq('active', true);
    if (req.query.estado === 'inactivo') query = query.eq('active', false);
    if (req.query.q) {
      const term = sanitizarBusqueda(req.query.q);
      if (term) query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%`);
    }

    query = query.order('created_at', { ascending: false }).range(desde, hasta);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      productos: (data || []).map(mapProducto),
      total: count || 0,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los productos' });
  }
});

// Categorías existentes, para el selector de filtro — trae solo la columna
// `category` (no las imágenes ni el resto de cada producto) así arma la
// lista completa sin pesar como traer todos los productos enteros.
app.get('/api/admin/products/categorias', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('category');
    if (error) throw error;
    const categorias = [...new Set((data || []).map((r) => r.category).filter(Boolean))].sort();
    res.json(categorias);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las categorías' });
  }
});

// Estadísticas del panel de productos — consultas de solo conteo
// (`head: true`), no bajan filas, así que son livianas sin importar cuántos
// productos haya cargados.
app.get('/api/admin/products/stats', requireAuth, async (req, res) => {
  try {
    const base = () => supabase.from('products').select('*', { count: 'exact', head: true });
    const [total, activos, sinStock, destacados] = await Promise.all([
      base(),
      base().eq('active', true),
      base().lte('stock', 0),
      base().eq('featured', true),
    ]);
    if (total.error) throw total.error;
    if (activos.error) throw activos.error;
    if (sinStock.error) throw sinStock.error;
    if (destacados.error) throw destacados.error;
    res.json({
      total: total.count || 0,
      activos: activos.count || 0,
      sinStock: sinStock.count || 0,
      destacados: destacados.count || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las estadísticas' });
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

app.post('/api/admin/products', requireAuth, upload.array('imagenes', 8), manejarErrorImagen, async (req, res) => {
  try {
    const { name, brand, category, price, oldPrice, cardPrice, creditPrice, stock, description, featured, active, imageUrl, flavors, installments } = req.body;
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
      credit_price: creditPrice ? Number(creditPrice) : null,
      stock: stock !== undefined && stock !== '' ? Number(stock) : 0,
      description: description ? String(description).trim() : '',
      image: images[0] || '',
      images,
      flavors: flavors ? String(flavors).trim() : '',
      installments: installments ? Number(installments) : null,
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

app.put('/api/admin/products/:id', requireAuth, upload.array('imagenes', 8), manejarErrorImagen, async (req, res) => {
  try {
    const { data: existing, error: findError } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

    const { name, brand, category, price, oldPrice, cardPrice, creditPrice, stock, description, featured, active, imagenesExistentes, flavors, installments } =
      req.body;

    const cambios = {};
    if (name !== undefined) cambios.name = String(name).trim();
    if (brand !== undefined) cambios.brand = String(brand).trim();
    if (category !== undefined) cambios.category = String(category).trim();
    if (price !== undefined && price !== '') cambios.price = Number(price);
    if (oldPrice !== undefined) cambios.old_price = oldPrice === '' ? null : Number(oldPrice);
    if (cardPrice !== undefined) cambios.card_price = cardPrice === '' ? null : Number(cardPrice);
    if (creditPrice !== undefined) cambios.credit_price = creditPrice === '' ? null : Number(creditPrice);
    if (stock !== undefined && stock !== '') cambios.stock = Number(stock);
    if (description !== undefined) cambios.description = String(description).trim();
    if (flavors !== undefined) cambios.flavors = String(flavors).trim();
    if (installments !== undefined) cambios.installments = installments === '' ? null : Number(installments);
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
      .select('image, images')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) throw error;

    // Borra TODAS las imágenes de la galería (no solo la principal), para no
    // dejar archivos huérfanos ocupando espacio en Storage.
    const todasLasImagenes = Array.isArray(existing.images) && existing.images.length
      ? existing.images
      : (existing.image ? [existing.image] : []);
    await Promise.all(todasLasImagenes.map(borrarImagenPorUrl));

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
});
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
    mpStatus: row.mp_status || null,
    mpPaymentId: row.mp_payment_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Engancha un pedido web con el módulo de Clientes: busca (o crea) al cliente
// por teléfono y le suma esta compra al historial. Es idempotente: si ya se
// registró la compra de este pedido (misma order_id) no la duplica, así se
// puede llamar tanto al crear el pedido (WhatsApp) como al confirmarse el
// pago (Mercado Pago) sin miedo a contar la venta dos veces.
async function registrarCompraDePedido(order) {
  try {
    const { data: yaExiste } = await supabase
      .from('customer_purchases')
      .select('id')
      .eq('order_id', order.id)
      .maybeSingle();
    if (yaExiste) return;

    const cliente = await buscarOCrearCliente({ name: order.customer_name, phone: order.customer_phone });
    if (!cliente) return;

    const itemsTexto = (order.items || [])
      .map((it) => (Number(it.qty) || 1) + 'x ' + it.name + (it.flavor ? ' (' + it.flavor + ')' : ''))
      .join(', ');

    await supabase.from('customer_purchases').insert({
      customer_id: cliente.id,
      amount: Number(order.total) || 0,
      purchase_date: new Date().toISOString().slice(0, 10),
      note: 'Pedido web #' + order.order_number,
      items: itemsTexto,
      source: 'web',
      order_id: order.id,
    });
  } catch (err) {
    // No frenamos nada si esto falla; el pedido/pago ya quedó registrado.
    console.error('No se pudo vincular el pedido con el módulo de clientes:', err.message);
  }
}

// ---------- Pedidos: API pública ----------
// El storefront pega acá justo antes (o al mismo tiempo) de abrir el link de WhatsApp,
// así queda registrado en el panel aunque el cliente no confirme nada más.
app.post('/api/orders', publicWriteLimiter, async (req, res) => {
  try {
    const { customerName, customerPhone, customerId, items, notes, channel } = req.body || {};
    const canal = channel === 'mercadopago' ? 'mercadopago' : 'whatsapp';

    if (!customerName || !customerPhone || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Faltan datos del pedido (nombre, teléfono o items)' });
    }

    // No confiamos en el precio que manda el navegador (el carrito lo guarda
    // en localStorage y viaja tal cual en el POST): alguien podría editar el
    // payload y mandar precios en $0. Volvemos a buscar cada producto en la
    // base y recalculamos el total con el precio real y vigente.
    const ids = [...new Set(items.map((it) => it.productId).filter(Boolean))];
    const { data: productosDb, error: errProductos } = ids.length
      ? await supabase.from('products').select('id, name, price').in('id', ids)
      : { data: [], error: null };
    if (errProductos) throw errProductos;

    const precioPorId = new Map((productosDb || []).map((p) => [p.id, Number(p.price)]));

    const itemsValidados = items.map((it) => {
      const precioReal = precioPorId.has(it.productId) ? precioPorId.get(it.productId) : Number(it.price) || 0;
      return { ...it, price: precioReal };
    });

    const total = itemsValidados.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);

    const nuevo = {
      customer_name: String(customerName).trim(),
      customer_phone: String(customerPhone).trim(),
      customer_id: customerId || null,
      items: itemsValidados,
      total,
      notes: notes ? String(notes).trim() : '',
      status: 'pendiente',
      sent_via: canal,
    };

    const { data, error } = await supabase.from('orders').insert(nuevo).select().single();
    if (error) throw error;

    // Para pedidos por WhatsApp, la venta se registra en el historial del
    // cliente ya (el pedido "vale" apenas se manda). Para Mercado Pago, se
    // registra recién cuando el webhook confirma que el pago fue aprobado,
    // así un checkout abandonado no cuenta como venta.
    if (canal !== 'mercadopago') {
      await registrarCompraDePedido(data);
    }

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

// ============================================================
// ---------- Mercado Pago: pago online del pedido ----------
// ============================================================

// Crea una preferencia de Checkout Pro para un pedido ya registrado y
// devuelve el link de pago (`initPoint`). El carrito redirige al comprador ahí.
app.post('/api/orders/:id/pagar', publicWriteLimiter, async (req, res) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      return res.status(503).json({ error: 'Los pagos online no están disponibles en este momento' });
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (order.status === 'confirmado') {
      return res.status(409).json({ error: 'Este pedido ya fue pagado' });
    }

    const itemsMP = (order.items || [])
      .map((it) => ({
        title: String((it.name || 'Producto') + (it.flavor ? ' - ' + it.flavor : '')).slice(0, 250),
        quantity: Math.max(1, Number(it.qty) || 1),
        unit_price: Math.round((Number(it.price) || 0) * 100) / 100,
        currency_id: 'ARS',
      }))
      .filter((it) => it.unit_price > 0);

    if (!itemsMP.length) {
      return res.status(400).json({ error: 'El pedido no tiene productos con precio válido' });
    }

    const base = urlBase(req);
    const esLocal = /localhost|127\.0\.0\.1/.test(base);
    const ref = order.order_number ? `?pedido=${order.order_number}` : '';

    const preferencia = {
      items: itemsMP,
      external_reference: String(order.id),
      payer: { name: order.customer_name || '' },
      back_urls: {
        success: `${base}/pago-exitoso.html${ref}`,
        failure: `${base}/pago-fallido.html${ref}`,
        pending: `${base}/pago-pendiente.html${ref}`,
      },
      statement_descriptor: 'ARD SUPLEMENTOS',
      metadata: { order_id: order.id, order_number: order.order_number },
    };
    // MP rechaza notification_url y auto_return si apuntan a localhost, así que
    // en local no los mandamos (el estado del pedido se puede ajustar a mano
    // desde el panel mientras probás).
    if (!esLocal) {
      preferencia.auto_return = 'approved';
      preferencia.notification_url = `${base}/api/webhooks/mercadopago`;
    }

    const pref = await mpApi('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify(preferencia),
    });

    await supabase
      .from('orders')
      .update({ mp_preference_id: pref.id, sent_via: 'mercadopago' })
      .eq('id', order.id);

    res.json({ initPoint: pref.init_point, preferenceId: pref.id });
  } catch (err) {
    console.error('Error al crear la preferencia de Mercado Pago:', err.mpBody || err.message);
    res.status(502).json({ error: 'No se pudo iniciar el pago con Mercado Pago' });
  }
});

// Webhook de Mercado Pago: MP lo llama cuando cambia el estado de un pago.
// Respondemos 200 enseguida (si no, MP reintenta) y procesamos después.
app.post('/api/webhooks/mercadopago', async (req, res) => {
  res.sendStatus(200);
  try {
    if (!firmaWebhookValida(req)) {
      console.warn('Webhook de Mercado Pago con firma inválida — ignorado');
      return;
    }

    const tipo = req.query.type || req.query.topic || req.body?.type;
    const paymentId =
      req.query['data.id'] || req.body?.data?.id || (tipo === 'payment' ? req.query.id : null);
    if (tipo !== 'payment' || !paymentId) return;

    const pago = await mpApi('/v1/payments/' + paymentId);
    const orderId = pago.external_reference;
    if (!orderId) return;

    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return;

    const nuevoEstado = estadoPedidoDesdeMP(pago.status);
    const cambios = { mp_payment_id: String(pago.id), mp_status: pago.status };
    // Una notificación tardía (pending/rejected) no debe "despagar" un pedido
    // que ya quedó confirmado.
    if (!(order.status === 'confirmado' && nuevoEstado !== 'confirmado')) {
      cambios.status = nuevoEstado;
    }

    await supabase.from('orders').update(cambios).eq('id', orderId);

    // Pago aprobado: recién ahí sumamos la venta al historial del cliente.
    if (pago.status === 'approved') {
      await registrarCompraDePedido(order);
    }
  } catch (err) {
    console.error('Error procesando el webhook de Mercado Pago:', err.mpBody || err.message);
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

// ============================================================
// ---------- Reseñas: API pública (formulario del index) ----------
// ============================================================
app.get('/api/reviews', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('resenas')
      .select('id, nombre, calificacion, comentario, fecha')
      .eq('aprobada', true)
      .order('fecha', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las reseñas' });
  }
});

app.post('/api/reviews', publicWriteLimiter, async (req, res) => {
  try {
    const { nombre, calificacion, comentario } = req.body || {};

    if (!nombre || !comentario) {
      return res.status(400).json({ error: 'Faltan datos de la reseña (nombre o comentario)' });
    }

    const calificacionNum = Number(calificacion);
    if (!Number.isInteger(calificacionNum) || calificacionNum < 1 || calificacionNum > 5) {
      return res.status(400).json({ error: 'La calificación debe ser un número entero entre 1 y 5' });
    }

    const nueva = {
      nombre: String(nombre).trim().slice(0, 60),
      calificacion: calificacionNum,
      comentario: String(comentario).trim().slice(0, 500),
      // Queda pendiente hasta que se apruebe desde el panel de administración.
      aprobada: false,
    };

    const { data, error } = await supabase.from('resenas').insert(nueva).select().single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la reseña' });
  }
});

// ---------- Suscripción al newsletter (popup del home) ----------
app.post('/api/subscribe', publicWriteLimiter, async (req, res) => {
  try {
    const { email, name, birthday } = req.body || {};

    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(400).json({ error: 'Ingresá un email válido.' });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Ingresá tu nombre.' });
    }

    const birthdayNorm = String(birthday || '').trim();
    if (birthdayNorm && !/^\d{2}\/\d{2}$/.test(birthdayNorm)) {
      return res.status(400).json({ error: 'El cumpleaños tiene que tener el formato DD/MM.' });
    }

    const nuevo = {
      email: emailNorm,
      name: String(name).trim().slice(0, 80),
      birthday: birthdayNorm || null,
      verified: false,
      verify_token: crypto.randomBytes(24).toString('hex'),
    };

    const { error } = await supabase.from('subscribers').insert(nuevo);

    // 23505 = unique_violation: el email ya estaba suscripto. No lo tratamos
    // como error para no revelar quién está en la lista y para que el popup
    // muestre igual el mensaje de éxito.
    if (error && error.code !== '23505') throw error;

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No pudimos registrar tu suscripción. Probá de nuevo en un rato.' });
  }
});

// ---------- Reseñas: API de administración (protegida) ----------
app.get('/api/admin/reviews', requireAuth, async (req, res) => {
  try {
    const { status } = req.query; // '' | 'pendiente' | 'publicada'
    let query = supabase.from('resenas').select('*').order('fecha', { ascending: false });

    if (status === 'pendiente') query = query.eq('aprobada', false);
    if (status === 'publicada') query = query.eq('aprobada', true);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las reseñas' });
  }
});

app.patch('/api/admin/reviews/:id', requireAuth, async (req, res) => {
  try {
    const { aprobada } = req.body || {};
    if (typeof aprobada !== 'boolean') {
      return res.status(400).json({ error: 'Falta el campo "aprobada" (true o false)' });
    }

    const { data, error } = await supabase
      .from('resenas')
      .update({ aprobada })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Reseña no encontrada' });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la reseña' });
  }
});

app.delete('/api/admin/reviews/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('resenas').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la reseña' });
  }
});

// ---------- Noticias / Novedades: API pública ----------
// Solo devuelve las activas, para mostrar en index.html.
app.get('/api/news', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(mapNoticia));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las novedades' });
  }
});

// ---------- Noticias / Novedades: API de administración (protegida) ----------
app.get('/api/admin/news', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(mapNoticia));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las novedades' });
  }
});

const novedadUploadFields = uploadNovedad.fields([
  { name: 'imagen', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]);

// Middleware para convertir errores de multer (ej: archivo muy pesado) en un
// JSON prolijo en vez de que Express tire un error feo sin manejar.
function manejarErrorMulter(err, req, res, next) {
  if (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `El archivo supera el máximo permitido (${VIDEO_MAX_MB}MB para video, 5MB para imagen).` });
    }
    return res.status(400).json({ error: err.message || 'No se pudo procesar el archivo' });
  }
  next();
}

app.post('/api/admin/news', requireAuth, novedadUploadFields, manejarErrorMulter, async (req, res) => {
  try {
    const { title, tag, content, active, price, oldPrice } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'El título es obligatorio' });
    }

    let imageUrl = '';
    let videoUrl = '';
    // Es imagen O video, no los dos: si mandaron ambos por error, se prioriza el video.
    if (req.files?.video?.[0]) {
      const subida = await subirVideo(req.files.video[0]);
      videoUrl = subida.url;
    } else if (req.files?.imagen?.[0]) {
      const subida = await subirImagen(req.files.imagen[0]);
      imageUrl = subida.url;
    }

    const nueva = {
      title: String(title).trim(),
      tag: tag ? String(tag).trim() : '',
      content: content ? String(content).trim() : '',
      image: imageUrl,
      video: videoUrl,
      price: price ? Number(price) : null,
      old_price: oldPrice ? Number(oldPrice) : null,
      active: active === undefined ? true : active === 'true' || active === true,
    };

    const { data, error } = await supabase.from('news').insert(nueva).select().single();
    if (error) throw error;

    res.status(201).json(mapNoticia(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la novedad' });
  }
});

app.put('/api/admin/news/:id', requireAuth, novedadUploadFields, manejarErrorMulter, async (req, res) => {
  try {
    const { data: existing, error: findError } = await supabase
      .from('news')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: 'Novedad no encontrada' });

    const { title, tag, content, active, quitarImagen, quitarVideo, price, oldPrice } = req.body;

    const cambios = {};
    if (title !== undefined) cambios.title = String(title).trim();
    if (tag !== undefined) cambios.tag = String(tag).trim();
    if (content !== undefined) cambios.content = String(content).trim();
    if (active !== undefined) cambios.active = active === 'true' || active === true;
    if (price !== undefined) cambios.price = price === '' ? null : Number(price);
    if (oldPrice !== undefined) cambios.old_price = oldPrice === '' ? null : Number(oldPrice);

    const nuevoArchivoVideo = req.files?.video?.[0];
    const nuevoArchivoImagen = req.files?.imagen?.[0];

    if (nuevoArchivoVideo) {
      // Subieron un video nuevo: reemplaza a lo que hubiera antes (imagen o video).
      const subida = await subirVideo(nuevoArchivoVideo);
      cambios.video = subida.url;
      cambios.image = '';
      if (existing.video) await borrarImagenPorUrl(existing.video);
      if (existing.image) await borrarImagenPorUrl(existing.image);
    } else if (nuevoArchivoImagen) {
      const subida = await subirImagen(nuevoArchivoImagen);
      cambios.image = subida.url;
      cambios.video = '';
      if (existing.image) await borrarImagenPorUrl(existing.image);
      if (existing.video) await borrarImagenPorUrl(existing.video);
    } else {
      if (quitarImagen === 'true' && existing.image) {
        await borrarImagenPorUrl(existing.image);
        cambios.image = '';
      }
      if (quitarVideo === 'true' && existing.video) {
        await borrarImagenPorUrl(existing.video);
        cambios.video = '';
      }
    }

    const { data, error } = await supabase.from('news').update(cambios).eq('id', req.params.id).select().single();
    if (error) throw error;

    res.json(mapNoticia(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la novedad' });
  }
});

app.delete('/api/admin/news/:id', requireAuth, async (req, res) => {
  try {
    const { data: existing, error: findError } = await supabase
      .from('news')
      .select('image, video')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: 'Novedad no encontrada' });

    const { error } = await supabase.from('news').delete().eq('id', req.params.id);
    if (error) throw error;

    // Borrado de raíz: además de la fila, borramos la imagen y/o el video
    // del Storage para no dejar nada ocupando espacio.
    await Promise.all([borrarImagenPorUrl(existing.image), borrarImagenPorUrl(existing.video)]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la novedad' });
  }
});

// ---------- Hero (carrusel de imágenes de arriba del home) ----------
app.get('/api/hero', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('hero_slides')
      .select('*')
      .eq('active', true)
      .order('position', { ascending: true });
    if (error) throw error;
    res.json((data || []).map(mapHeroSlide));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las imágenes del hero' });
  }
});

app.get('/api/admin/hero', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('hero_slides').select('*').order('position', { ascending: true });
    if (error) throw error;
    res.json((data || []).map(mapHeroSlide));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las imágenes del hero' });
  }
});

app.post('/api/admin/hero', requireAuth, upload.single('imagen'), manejarErrorImagen, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'La imagen es obligatoria' });
    }
    const { link, active } = req.body;

    const { data: maxRow } = await supabase
      .from('hero_slides')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const siguientePosicion = maxRow ? maxRow.position + 1 : 0;

    const subida = await subirImagen(req.file);

    const nuevo = {
      image: subida.url,
      link: link ? String(link).trim() : '',
      position: siguientePosicion,
      active: active === undefined ? true : active === 'true' || active === true,
    };

    const { data, error } = await supabase.from('hero_slides').insert(nuevo).select().single();
    if (error) throw error;

    res.status(201).json(mapHeroSlide(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la imagen del hero' });
  }
});

app.put('/api/admin/hero/:id', requireAuth, upload.single('imagen'), manejarErrorImagen, async (req, res) => {
  try {
    const { data: existing, error: findError } = await supabase
      .from('hero_slides')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: 'Imagen no encontrada' });

    const { link, active } = req.body;
    const cambios = {};
    if (link !== undefined) cambios.link = String(link).trim();
    if (active !== undefined) cambios.active = active === 'true' || active === true;

    if (req.file) {
      const subida = await subirImagen(req.file);
      cambios.image = subida.url;
      if (existing.image) await borrarImagenPorUrl(existing.image);
    }

    const { data, error } = await supabase.from('hero_slides').update(cambios).eq('id', req.params.id).select().single();
    if (error) throw error;

    res.json(mapHeroSlide(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la imagen del hero' });
  }
});

// Sube o baja una imagen un lugar en el orden del carrusel, intercambiando
// su posición con la de la vecina inmediata.
app.put('/api/admin/hero/:id/mover', requireAuth, async (req, res) => {
  try {
    const { direction } = req.body; // 'up' | 'down'
    const { data: todas, error } = await supabase.from('hero_slides').select('id, position').order('position', { ascending: true });
    if (error) throw error;

    const idx = todas.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Imagen no encontrada' });

    const idxVecino = direction === 'up' ? idx - 1 : idx + 1;
    if (idxVecino < 0 || idxVecino >= todas.length) {
      return res.json({ ok: true }); // ya está en la punta, no hay nada para mover
    }

    const actual = todas[idx];
    const vecino = todas[idxVecino];

    await Promise.all([
      supabase.from('hero_slides').update({ position: vecino.position }).eq('id', actual.id),
      supabase.from('hero_slides').update({ position: actual.position }).eq('id', vecino.id),
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al reordenar' });
  }
});

app.delete('/api/admin/hero/:id', requireAuth, async (req, res) => {
  try {
    const { data: existing, error: findError } = await supabase
      .from('hero_slides')
      .select('image')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: 'Imagen no encontrada' });

    const { error } = await supabase.from('hero_slides').delete().eq('id', req.params.id);
    if (error) throw error;

    // Borrado de raíz: fila + imagen del Storage.
    await borrarImagenPorUrl(existing.image);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la imagen del hero' });
  }
});

// ============================================================
// ---------- Clientes: CRM liviano de seguimiento de ventas ----------
// ============================================================
// Todo protegido (requireAuth): esto es solo para el panel de administración.

// Lista de clientes con sus datos agregados (última compra, total gastado,
// días sin comprar). Se calcula acá en el servidor en vez de guardarlo en
// la base, para no duplicar datos: la base solo guarda clientes + compras,
// y el resumen se arma al vuelo con lo que ya está.
app.get('/api/admin/customers', requireAuth, async (req, res) => {
  try {
    const [{ data: customers, error: errCustomers }, { data: purchases, error: errPurchases }] = await Promise.all([
      // Solo los que tienen teléfono cargado: son los contactos de seguimiento
      // de ventas (manuales o de pedidos web). Los que entraron con Google y
      // nunca dejaron teléfono no forman parte de este listado.
      supabase.from('customers').select('*').not('phone', 'is', null),
      supabase.from('customer_purchases').select('customer_id, amount, purchase_date'),
    ]);
    if (errCustomers) throw errCustomers;
    if (errPurchases) throw errPurchases;

    const porCliente = new Map();
    (purchases || []).forEach((p) => {
      const acc = porCliente.get(p.customer_id) || { totalGastado: 0, cantidadCompras: 0, ultimaCompra: null };
      acc.totalGastado += Number(p.amount) || 0;
      acc.cantidadCompras += 1;
      if (!acc.ultimaCompra || p.purchase_date > acc.ultimaCompra) acc.ultimaCompra = p.purchase_date;
      porCliente.set(p.customer_id, acc);
    });

    const hoy = new Date();
    const resultado = (customers || []).map((c) => {
      const agg = porCliente.get(c.id) || { totalGastado: 0, cantidadCompras: 0, ultimaCompra: null };
      let diasSinComprar = null;
      if (agg.ultimaCompra) {
        const ms = hoy - new Date(agg.ultimaCompra + 'T00:00:00');
        diasSinComprar = Math.floor(ms / (1000 * 60 * 60 * 24));
      }
      return {
        ...mapCustomer(c),
        totalGastado: agg.totalGastado,
        cantidadCompras: agg.cantidadCompras,
        ultimaCompra: agg.ultimaCompra,
        diasSinComprar,
      };
    });

    resultado.sort((a, b) => {
      // Primero los que compraron alguna vez (por fecha más reciente), al final los que nunca compraron.
      if (a.ultimaCompra && b.ultimaCompra) return b.ultimaCompra.localeCompare(a.ultimaCompra);
      if (a.ultimaCompra) return -1;
      if (b.ultimaCompra) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los clientes' });
  }
});

app.get('/api/admin/customers/:id', requireAuth, async (req, res) => {
  try {
    const { data: cliente, error: errCliente } = await supabase
      .from('customers')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (errCliente) throw errCliente;
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const { data: compras, error: errCompras } = await supabase
      .from('customer_purchases')
      .select('*')
      .eq('customer_id', req.params.id)
      .order('purchase_date', { ascending: false });
    if (errCompras) throw errCompras;

    res.json({ ...mapCustomer(cliente), compras: (compras || []).map(mapPurchase) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el cliente' });
  }
});

app.post('/api/admin/customers', requireAuth, async (req, res) => {
  try {
    const { name, phone, notes } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }
    const telNormalizado = normalizarTelefono(phone);
    if (!telNormalizado) {
      return res.status(400).json({ error: 'El teléfono no es válido' });
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({ name: String(name).trim(), phone: telNormalizado, notes: notes ? String(notes).trim() : '' })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un cliente con ese teléfono' });
      throw error;
    }

    res.status(201).json(mapCustomer(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el cliente' });
  }
});

app.put('/api/admin/customers/:id', requireAuth, async (req, res) => {
  try {
    const { name, phone, notes, contactedAt } = req.body || {};
    const cambios = {};
    if (name !== undefined) cambios.name = String(name).trim();
    if (phone !== undefined) {
      const telNormalizado = normalizarTelefono(phone);
      if (!telNormalizado) return res.status(400).json({ error: 'El teléfono no es válido' });
      cambios.phone = telNormalizado;
    }
    if (notes !== undefined) cambios.notes = String(notes).trim();
    if (contactedAt !== undefined) cambios.contacted_at = contactedAt || null;

    const { data, error } = await supabase.from('customers').update(cambios).eq('id', req.params.id).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un cliente con ese teléfono' });
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Cliente no encontrado' });

    res.json(mapCustomer(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el cliente' });
  }
});

// Marca "lo contacté ahora" (para no perder de vista a quién ya le escribiste).
app.post('/api/admin/customers/:id/contactado', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .update({ contacted_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(mapCustomer(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al marcar el contacto' });
  }
});

app.delete('/api/admin/customers/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('customers').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el cliente' });
  }
});

// ---------- Compras de un cliente (carga manual de ventas) ----------
app.post('/api/admin/customers/:id/purchases', requireAuth, async (req, res) => {
  try {
    const { amount, purchaseDate, note, items } = req.body || {};
    if (amount === undefined || amount === '' || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'El monto es obligatorio' });
    }

    const nuevo = {
      customer_id: req.params.id,
      amount: Number(amount),
      purchase_date: purchaseDate || new Date().toISOString().slice(0, 10),
      note: note ? String(note).trim() : '',
      items: items ? String(items).trim() : '',
      source: 'manual',
    };

    const { data, error } = await supabase.from('customer_purchases').insert(nuevo).select().single();
    if (error) throw error;

    res.status(201).json(mapPurchase(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar la venta' });
  }
});

app.delete('/api/admin/customers/:customerId/purchases/:purchaseId', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('customer_purchases')
      .delete()
      .eq('id', req.params.purchaseId)
      .eq('customer_id', req.params.customerId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la venta' });
  }
});

// Ruta directa al panel admin
app.get('/admin', (req, res) => {
  res.redirect('/admin/login.html');
});

// Red de seguridad: cualquier error que se nos haya escapado sin capturar
// (en cualquier ruta) devuelve JSON en vez de la página de error HTML de
// Express, para que el panel siempre pueda mostrar un mensaje entendible en
// vez de "Error de conexión con el servidor".
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor' });
});

app.listen(PORT, () => {
  console.log(`\nARD Suplementos corriendo en http://localhost:${PORT}`);
  console.log(`Panel de administración: http://localhost:${PORT}/admin/login.html`);
  console.log(`Conectado a Supabase: ${SUPABASE_URL}`);
});
