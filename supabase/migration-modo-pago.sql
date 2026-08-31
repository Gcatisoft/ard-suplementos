-- ============================================================
-- ARD Suplementos — Migración: forma de pago elegida en el pedido
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================
-- Guarda con qué precio se cerró el pedido, según lo que eligió el
-- cliente en el checkout:
--   'efectivo' -> precio efectivo / transferencia  (products.price)
--   'credito'  -> 1 pago con tarjeta de crédito    (products.credit_price)
--   'cuotas'   -> en cuotas con tarjeta            (products.card_price)
-- Así Mercado Pago cobra el monto correcto y el panel puede diferenciar
-- las ventas por posnet.

alter table public.orders add column if not exists price_mode text;            -- 'efectivo' | 'credito' | 'cuotas'
alter table public.orders add column if not exists chosen_installments integer; -- cantidad de cuotas cuando price_mode = 'cuotas'
