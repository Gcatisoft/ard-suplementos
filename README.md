# ARD Suplementos — Sitio + Panel de administración (con Supabase)

Landing page de ARD Suplementos + panel de administración con login para cargar, editar y eliminar
productos. Los productos y las imágenes se guardan en **Supabase** (Postgres + Storage), así que
funciona en cualquier hosting (Vercel, Railway, Render, un VPS, etc.) sin depender de un disco local.

## ¿Qué incluye?

- **Sitio público** (`public/index.html`): landing original + sección **"Productos"** que carga en
  vivo desde la API, con filtro por categoría y botón "Consultar" a WhatsApp con mensaje prellenado.
- **Panel de administración** (`public/admin/`):
  - `login.html` — acceso con usuario y contraseña.
  - `dashboard.html` — buscador, filtros, estadísticas y alta/edición/eliminación de productos
    (incluida la carga de imagen).
- **Backend** (`server.js`): Node.js + Express, conectado a Supabase:
  - Autenticación por sesión (cookie httpOnly) contra la tabla `admin_users` (contraseña con bcrypt).
  - API pública de solo lectura (`/api/products`) para el sitio.
  - API protegida (`/api/admin/products`) para el panel.
  - Subida de imágenes directo a **Supabase Storage** (bucket `productos`).
- **`supabase/schema.sql`**: script SQL con las tablas, políticas de seguridad (RLS) y el bucket de
  imágenes, listo para pegar en el SQL Editor de Supabase.
- **`scripts/create-admin.js`**: script para crear (o resetear la contraseña de) el usuario del panel.

## 1) Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) → **New project**.
2. Cuando termine de crearse, andá a **SQL Editor → New query**, pegá todo el contenido de
   `supabase/schema.sql` de este proyecto y ejecutalo (`RUN`). Esto crea:
   - la tabla `products` (con trigger para `updated_at`),
   - la tabla `admin_users`,
   - las políticas de RLS,
   - el bucket público de Storage `productos` para las imágenes.
3. Andá a **Project Settings → API** y copiá:
   - **Project URL** → va en `SUPABASE_URL`
   - **service_role key** (no la `anon`/`public`) → va en `SUPABASE_SERVICE_ROLE_KEY`

## 2) Configurar el proyecto localmente

```bash
cd ard-admin
npm install
cp .env.example .env
```

Editá `.env` y completá `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` con los datos del paso anterior.
De paso, definí `ADMIN_USER`, `ADMIN_PASSWORD` y `SESSION_SECRET` con valores propios.

## 3) Crear el usuario administrador

La tabla `admin_users` arranca vacía (por seguridad, la contraseña nunca se guarda en el SQL).
Para crear el primer usuario del panel corré:

```bash
npm run create-admin
```

Esto toma `ADMIN_USER` / `ADMIN_PASSWORD` de tu `.env`, encripta la contraseña con bcrypt y la guarda
en Supabase. También podés pasarlos directo por consola:

```bash
node scripts/create-admin.js miusuario micontraseña123
```

Correr este comando de nuevo con el mismo usuario **actualiza su contraseña** (sirve para resetearla
si te la olvidás).

## 4) Levantar el servidor

```bash
npm start
```

- Sitio público: `http://localhost:3000/`
- Panel de administración: `http://localhost:3000/admin/login.html`

## Cómo se cargan los productos en la página principal

1. Entrás a `/admin/login.html` con el usuario que creaste.
2. En el dashboard hacés clic en **"+ Nuevo producto"**: nombre, marca, categoría, precio, stock,
   descripción y (opcional) imagen. La imagen se sube directo a Supabase Storage.
3. Al guardar, el producto aparece al instante en `index.html`, en la sección **"Nuestros productos"**,
   siempre que esté marcado como **"Publicado en el sitio"**.
4. Las categorías no son una lista fija: salen solas de lo que escribas en cada producto, y con eso se
   arman los filtros tanto en el sitio público como en el panel.

## Estructura de carpetas

```
ard-admin/
├── server.js                # Backend Express conectado a Supabase
├── package.json
├── .env.example
├── supabase/
│   └── schema.sql            # Tablas + RLS + bucket de Storage (correr una sola vez en Supabase)
├── scripts/
│   └── create-admin.js       # Crear / resetear el usuario del panel
└── public/
    ├── index.html             # Landing pública (con la sección "Productos" dinámica)
    └── admin/
        ├── login.html
        ├── dashboard.html
        ├── admin.css
        └── admin.js
```

## Desplegar en producción (para vender el proyecto a un cliente)

Como ya no depende de un disco local (ni SQLite ni JSON), se puede desplegar en cualquier plataforma
que corra Node.js: **Vercel** (como función serverless o con `vercel dev` / adaptador Express),
**Railway**, **Render**, un VPS con PM2 + Nginx, etc.

Para cada cliente nuevo:

1. Le creás un proyecto de Supabase propio (plan gratuito alcanza para empezar).
2. Corrés `supabase/schema.sql` en ese proyecto.
3. Configurás las variables de entorno (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`,
   etc.) en la plataforma de hosting que elijas.
4. Corrés `npm run create-admin` una vez (localmente, apuntando a las variables de ese cliente) para
   darle sus credenciales de acceso al panel.
5. Le pasás la URL del sitio y la del panel (`/admin/login.html`).

Así cada cliente queda con su propia base de datos aislada, sin tocar código.

## Seguridad implementada

- Contraseña de administrador encriptada con bcrypt (nunca se guarda en texto plano).
- La `service_role key` de Supabase vive solo en el backend (variable de entorno), nunca se expone al
  navegador.
- Row Level Security (RLS) habilitado en `products` y `admin_users` como capa extra: solo permite
  lectura pública de productos con `active = true`, y bloquea cualquier lectura pública de
  `admin_users`.
- Sesión de administrador con cookie `httpOnly`.
- Todas las rutas de escritura (crear/editar/eliminar producto, cambiar contraseña) devuelven `401`
  sin sesión de administrador activa.
- Validación de tipo y tamaño de archivo en la subida de imágenes (JPG/PNG/WEBP/GIF, máx. 5MB).

## Variable para el botón de WhatsApp

El número que usa el botón "Consultar" de cada producto está en `public/index.html`, dentro del
`<script>` final, en la constante `WHATSAPP_NUMBER`. Actualizalo con el número real de cada cliente.
