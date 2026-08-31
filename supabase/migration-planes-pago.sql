-- ============================================================
-- ARD Suplementos — Migración: planes de pago con tarjeta
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================
-- Cada producto puede tener varios "planes" de pago con tarjeta, y cada
-- plan tiene su PROPIO precio total (con el recargo ya incluido). Ej:
--   [{ "cuotas": 1, "precio": 12000 },
--    { "cuotas": 3, "precio": 13500 },
--    { "cuotas": 6, "precio": 15000 }]
-- El precio de efectivo / transferencia sigue siendo products.price y
-- nunca se mezcla con estos.

alter table public.products
  add column if not exists payment_plans jsonb not null default '[]'::jsonb;

-- Backfill: armamos los planes con lo que ya estaba cargado en las
-- columnas viejas (credit_price = 1 pago, card_price + installments = cuotas).
-- Solo toca productos que todavía no tengan planes cargados.
update public.products p
set payment_plans = (
  select coalesce(jsonb_agg(plan order by (plan->>'cuotas')::int), '[]'::jsonb)
  from (
    select jsonb_build_object('cuotas', 1, 'precio', p.credit_price) as plan
    where p.credit_price is not null and p.credit_price > 0
    union all
    select jsonb_build_object('cuotas', p.installments, 'precio', coalesce(p.card_price, p.price))
    where p.installments is not null and p.installments > 1
      and coalesce(p.card_price, p.price) > 0
  ) planes
)
where (p.payment_plans is null or p.payment_plans = '[]'::jsonb)
  and (
    (p.credit_price is not null and p.credit_price > 0)
    or (p.installments is not null and p.installments > 1)
  );
