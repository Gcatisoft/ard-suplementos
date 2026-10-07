-- ============================================================
-- ARD Suplementos — Envíos: zonas de Catamarca Capital, puntos de
-- retiro, envío gratis y FAQ de envíos (todo editable desde el panel)
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================
-- Por ahora solo Catamarca Capital tiene cotización por zona. El interior
-- de Catamarca y el resto del país siguen con la tarifa plana de siempre
-- (envio_nacional en app_settings) — este archivo solo deja preparados los
-- textos informativos de esas dos secciones para cuando se desarrolle su
-- cotización.

-- ---------- Zonas de envío (Catamarca Capital) ----------
create table if not exists public.shipping_zones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      numeric(12,2) not null default 0,
  active     boolean not null default true,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shipping_zones_position_idx on public.shipping_zones (position);

drop trigger if exists trg_shipping_zones_updated_at on public.shipping_zones;
create trigger trg_shipping_zones_updated_at
  before update on public.shipping_zones
  for each row execute function public.set_updated_at();

-- ---------- Puntos de retiro (sin costo, independientes de las zonas) ----------
create table if not exists public.pickup_points (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text not null default '',
  description text not null default '',
  schedule    text not null default '',
  active      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pickup_points_position_idx on public.pickup_points (position);

drop trigger if exists trg_pickup_points_updated_at on public.pickup_points;
create trigger trg_pickup_points_updated_at
  before update on public.pickup_points
  for each row execute function public.set_updated_at();

-- ---------- Preguntas frecuentes de envíos ----------
create table if not exists public.shipping_faqs (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  answer     text not null default '',
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shipping_faqs_position_idx on public.shipping_faqs (position);

drop trigger if exists trg_shipping_faqs_updated_at on public.shipping_faqs;
create trigger trg_shipping_faqs_updated_at
  before update on public.shipping_faqs
  for each row execute function public.set_updated_at();

-- ---------- Row Level Security ----------
-- El backend usa la SERVICE ROLE KEY (bypassea RLS). Estas políticas son
-- una capa extra, igual que en el resto de las tablas del proyecto.
alter table public.shipping_zones enable row level security;
alter table public.pickup_points  enable row level security;
alter table public.shipping_faqs  enable row level security;

drop policy if exists "Zonas de envio activas son publicas" on public.shipping_zones;
create policy "Zonas de envio activas son publicas"
  on public.shipping_zones for select using (active = true);

drop policy if exists "Puntos de retiro activos son publicos" on public.pickup_points;
create policy "Puntos de retiro activos son publicos"
  on public.pickup_points for select using (active = true);

drop policy if exists "FAQs de envio son publicas" on public.shipping_faqs;
create policy "FAQs de envio son publicas"
  on public.shipping_faqs for select using (true);

-- ---------- Datos iniciales de ejemplo ----------
-- Solo se insertan si la tabla está vacía, para que correr este script de
-- nuevo no duplique filas. El admin puede editarlos o borrarlos después.
insert into public.shipping_zones (name, price, position)
select v.name, v.price, v.position
from (values
  ('Centro', 1000, 0),
  ('Sur', 1500, 1),
  ('Norte', 2000, 2),
  ('Valle Chico', 2000, 3)
) as v(name, price, position)
where not exists (select 1 from public.shipping_zones);

insert into public.pickup_points (name, address, description, schedule, position)
select v.name, v.address, v.description, v.schedule, v.position
from (values
  ('Retiro en ARD — Centro', 'Sarmiento 722, Catamarca Capital', 'Local central de ARD Suplementos.', 'Lunes a sábado de 9 a 20 hs.', 0),
  ('Retiro en ARD — Zona Norte', 'Stand de ARD en Athletic', 'Stand dentro del gimnasio Athletic.', 'Según el horario del gimnasio.', 1)
) as v(name, address, description, schedule, position)
where not exists (select 1 from public.pickup_points);

insert into public.shipping_faqs (question, answer, position)
select v.question, v.answer, v.position
from (values
  ('¿Cuándo llega mi pedido?', 'Los pedidos realizados de lunes a sábado hasta las 18:00 hs se entregan durante el mismo día. Los pedidos realizados después de las 18:00 hs salen al siguiente día.', 0),
  ('¿Hacen envíos el mismo día?', 'Sí, en Catamarca Capital, siempre que el pedido se haga antes de las 18:00 hs.', 1),
  ('¿Qué pasa si compro después de las 18 hs?', 'Tu pedido sale al día siguiente.', 2),
  ('¿Puedo retirar mi pedido por el local?', 'Sí, podés elegir un punto de retiro sin costo al finalizar tu compra.', 3),
  ('¿Dónde puedo retirar mi pedido?', 'En nuestro local de Sarmiento 722 (Centro) o en el stand de Athletic (Zona Norte).', 4),
  ('¿Hacen envíos al interior?', 'Sí. Por ahora coordinamos el envío por WhatsApp; estamos preparando la cotización automática.', 5),
  ('¿Cuánto demora un envío al interior?', 'Entre 2 y 4 días hábiles, dependiendo de la localidad y el transporte.', 6)
) as v(question, answer, position)
where not exists (select 1 from public.shipping_faqs);

-- ---------- Configuración general de envíos (app_settings) ----------
insert into public.app_settings (key, value) values
  ('envio_gratis_monto_capital', '120000'),
  ('envio_tiempos_titulo', '🚚 Tiempos de entrega'),
  ('envio_tiempos_texto', 'Los pedidos realizados de lunes a sábado hasta las 18:00 hs se entregan durante el mismo día. Los pedidos realizados después de las 18:00 hs salen al siguiente día.'),
  ('envio_interior_titulo', '📦 Envíos al interior de Catamarca'),
  ('envio_interior_texto', 'Tiempo estimado: 2 a 4 días hábiles, dependiendo de la localidad y el transporte.'),
  ('envio_nacional_titulo', '🇦🇷 Envíos a todo el país'),
  ('envio_nacional_texto', 'Tiempo estimado: 2 a 4 días hábiles, dependiendo de la localidad y empresa de transporte.')
on conflict (key) do nothing;
