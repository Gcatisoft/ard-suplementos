-- ============================================================
-- ARD Suplementos — Schema de Supabase
-- Ejecutar este archivo completo en: Supabase → SQL Editor → New query
-- ============================================================

-- Extensión necesaria para generar UUIDs
create extension if not exists "pgcrypto";

-- ---------- Tabla: productos ----------
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  brand        text default '',
  category     text not null,
  price        numeric(12,2) not null default 0,
  old_price    numeric(12,2),
  stock        integer not null default 0,
  description  text default '',
  image        text default '',
  featured     boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_active_idx on public.products (active);

-- ---------- Tabla: usuarios administradores ----------
create table if not exists public.admin_users (
  id             uuid primary key default gen_random_uuid(),
  username       text not null unique,
  password_hash  text not null,
  created_at     timestamptz not null default now()
);

-- ---------- Trigger para mantener updated_at al día ----------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------- Row Level Security ----------
-- El backend (server.js) usa la SERVICE ROLE KEY, que siempre bypassea RLS,
-- así que estas políticas son una capa extra de seguridad por si en el futuro
-- se consulta Supabase directamente desde el navegador con la clave "anon".
alter table public.products enable row level security;
alter table public.admin_users enable row level security;

-- Permitir lectura pública SOLO de productos activos (por si se usa la anon key)
drop policy if exists "Productos activos son publicos" on public.products;
create policy "Productos activos son publicos"
  on public.products
  for select
  using (active = true);

-- admin_users no debe ser accesible con la anon key bajo ninguna circunstancia
drop policy if exists "Bloquear acceso publico a admin_users" on public.admin_users;
create policy "Bloquear acceso publico a admin_users"
  on public.admin_users
  for select
  using (false);

-- ============================================================
-- STORAGE: bucket para las imágenes de producto
-- ============================================================
-- Creá el bucket manualmente desde el dashboard (Storage → New bucket):
--   nombre: productos
--   público: sí (Public bucket)
-- O ejecutá esto:
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

-- Política para que cualquiera pueda VER las imágenes (bucket público)
drop policy if exists "Lectura publica de imagenes de productos" on storage.objects;
create policy "Lectura publica de imagenes de productos"
  on storage.objects for select
  using (bucket_id = 'productos');

-- Nota: las escrituras (subir/borrar imágenes) las hace el backend con la
-- SERVICE ROLE KEY, que no necesita política — bypassea RLS de storage también.
