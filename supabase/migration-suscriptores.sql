-- ============================================================
-- ARD Suplementos — Migración: suscriptores del popup del home
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================
-- Guarda los datos que deja la gente en el popup de
-- "¡Suscribite y te regalo $4000...!" del index.html.

create extension if not exists "pgcrypto";

create table if not exists public.subscribers (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  name         text not null default '',
  birthday     text,                       -- formato DD/MM (opcional)
  verified     boolean not null default false,
  verify_token text,
  created_at   timestamptz not null default now()
);

create index if not exists subscribers_created_at_idx on public.subscribers (created_at desc);

-- El backend usa la SERVICE ROLE KEY (bypassea RLS). Igual dejamos RLS
-- activo y sin políticas públicas: nadie puede leer la lista con la anon key.
alter table public.subscribers enable row level security;

drop policy if exists "Bloquear acceso publico a subscribers" on public.subscribers;
create policy "Bloquear acceso publico a subscribers"
  on public.subscribers
  for select
  using (false);
