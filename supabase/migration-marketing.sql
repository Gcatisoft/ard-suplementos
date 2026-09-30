-- ============================================================
-- ARD Suplementos — Módulo de Marketing
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

-- ---------- Sponsors ----------
create table if not exists public.sponsors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null default 'otro',  -- persona/gimnasio/club/influencer/asociacion/empresa/otro
  description text not null default '',
  contact     text not null default '',
  email       text not null default '',
  phone       text not null default '',
  status      text not null default 'activo',  -- activo/inactivo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sponsors_status_idx on public.sponsors (status);

drop trigger if exists trg_sponsors_updated_at on public.sponsors;
create trigger trg_sponsors_updated_at
  before update on public.sponsors
  for each row execute function public.set_updated_at();

-- ---------- Campaigns ----------
create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  sponsor_id  uuid not null references public.sponsors(id),
  name        text not null,
  slug        text unique,  -- para links personalizados: /juan-oct
  start_date  date,
  end_date    date,
  status      text not null default 'activa',  -- programada/activa/vencida/desactivada
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists campaigns_sponsor_id_idx on public.campaigns (sponsor_id);
create index if not exists campaigns_slug_idx      on public.campaigns (slug);
create index if not exists campaigns_status_idx    on public.campaigns (status);

drop trigger if exists trg_campaigns_updated_at on public.campaigns;
create trigger trg_campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------- Coupons ----------
create table if not exists public.coupons (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id),
  sponsor_id      uuid not null references public.sponsors(id),
  code            text not null unique,
  discount_type   text not null default 'porcentaje',  -- porcentaje / monto_fijo
  discount_value  numeric(10,2) not null default 0,
  start_date      date,
  end_date        date,
  status          text not null default 'activo',  -- programado/activo/vencido/desactivado
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists coupons_code_idx        on public.coupons (code);
create index if not exists coupons_campaign_id_idx on public.coupons (campaign_id);
create index if not exists coupons_sponsor_id_idx  on public.coupons (sponsor_id);
create index if not exists coupons_status_idx      on public.coupons (status);

drop trigger if exists trg_coupons_updated_at on public.coupons;
create trigger trg_coupons_updated_at
  before update on public.coupons
  for each row execute function public.set_updated_at();

-- ---------- Columnas de marketing en orders ----------
-- Guardan snapshot histórico al momento de la compra.
-- NUNCA se recalculan a posteriori: si el cupón cambia en noviembre,
-- las órdenes de octubre mantienen los valores originales.
alter table public.orders add column if not exists coupon_id       uuid references public.coupons(id);
alter table public.orders add column if not exists campaign_id     uuid references public.campaigns(id);
alter table public.orders add column if not exists sponsor_id      uuid references public.sponsors(id);
alter table public.orders add column if not exists coupon_code     text;
alter table public.orders add column if not exists discount_type   text;
alter table public.orders add column if not exists discount_pct    numeric(10,2);
alter table public.orders add column if not exists discount_amount numeric(12,2);
alter table public.orders add column if not exists subtotal        numeric(12,2);

create index if not exists orders_coupon_id_idx   on public.orders (coupon_id);
create index if not exists orders_campaign_id_idx on public.orders (campaign_id);
create index if not exists orders_sponsor_id_idx  on public.orders (sponsor_id);

-- ---------- RLS (las mismas reglas que el resto del proyecto) ----------
-- El backend usa SERVICE ROLE KEY y bypassea RLS, así que estas políticas
-- son solo protección adicional si alguien consultara con la anon key.
alter table public.sponsors  enable row level security;
alter table public.campaigns enable row level security;
alter table public.coupons   enable row level security;

drop policy if exists "Bloquear acceso publico a sponsors"  on public.sponsors;
drop policy if exists "Bloquear acceso publico a campaigns" on public.campaigns;
drop policy if exists "Bloquear acceso publico a coupons"   on public.coupons;

create policy "Bloquear acceso publico a sponsors"  on public.sponsors  for select using (false);
create policy "Bloquear acceso publico a campaigns" on public.campaigns for select using (false);
create policy "Bloquear acceso publico a coupons"   on public.coupons   for select using (false);
