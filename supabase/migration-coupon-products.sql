-- ============================================================
-- ARD Suplementos — Descuentos por producto en cupones
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

-- Permite asignar un descuento diferente (%) por producto dentro de un cupón.
-- Si un cupón NO tiene filas en esta tabla → aplica el descuento global como antes.
-- Si tiene filas → solo los productos listados tienen descuento; el resto no.
create table if not exists public.coupon_products (
  id            uuid primary key default gen_random_uuid(),
  coupon_id     uuid not null references public.coupons(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  discount_type text not null default 'porcentaje'
    check (discount_type in ('porcentaje', 'monto_fijo')),
  discount_value numeric(10,2) not null default 0 check (discount_value >= 0),
  created_at    timestamptz default now(),
  unique(coupon_id, product_id)
);

create index if not exists coupon_products_coupon_id_idx on public.coupon_products (coupon_id);

-- Bloquear acceso público; el backend usa service role key y pasa por encima.
alter table public.coupon_products enable row level security;
create policy "admin_only_coupon_products" on public.coupon_products
  for all using (false) with check (false);
