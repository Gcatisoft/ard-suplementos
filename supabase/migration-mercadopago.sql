-- ============================================================
-- ARD Suplementos — columnas nuevas para Mercado Pago
-- Ejecutar en: Supabase → SQL Editor → New query
-- (Es seguro correrlo aunque las columnas ya existan: usa IF NOT EXISTS)
-- ============================================================

alter table public.orders add column if not exists mp_preference_id text;
alter table public.orders add column if not exists mp_payment_id text;
alter table public.orders add column if not exists mp_status text;

create index if not exists orders_mp_payment_id_idx on public.orders (mp_payment_id);

-- ============================================================
-- Numeración de pedidos (order_number)
-- La columna es de tipo TEXT y nada la autocompletaba, así que quedaba en
-- NULL (y en el panel / links de pago se veía "#null"). Le ponemos una
-- secuencia como valor por defecto y rellenamos los pedidos viejos.
-- Es seguro correr este bloque más de una vez.
-- ============================================================
create sequence if not exists public.orders_number_seq;

-- Rellena los pedidos sin número, en orden de creación.
with a_numerar as (
  select id, row_number() over (order by created_at) as rn
  from public.orders
  where order_number is null or order_number = ''
)
update public.orders o
set order_number = nextval('public.orders_number_seq')::text
from a_numerar
where o.id = a_numerar.id;

-- Deja la secuencia por encima del mayor número ya usado (solo mira los
-- order_number que son puramente numéricos) y la usa como default.
select setval(
  'public.orders_number_seq',
  coalesce((select max(order_number::bigint) from public.orders where order_number ~ '^[0-9]+$'), 1),
  exists(select 1 from public.orders where order_number ~ '^[0-9]+$')
);
alter table public.orders alter column order_number set default nextval('public.orders_number_seq')::text;
