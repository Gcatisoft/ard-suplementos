-- ============================================================
-- ARD Suplementos — Marketing: vincular cupones con clientes
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

-- Permite personalizar un cupón para un cliente específico.
-- El campo es opcional (null = cupón general, cualquiera puede usarlo).
alter table public.coupons
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists coupons_customer_id_idx on public.coupons (customer_id);
