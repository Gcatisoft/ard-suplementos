-- ============================================================
-- ARD Suplementos — Migración: precio "1 pago con crédito"
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================
-- Agrega un precio separado para la venta en 1 pago con tarjeta de
-- crédito, distinto del precio en efectivo/transferencia. Sirve para
-- contemplar el costo del posnet sin tocar el precio de lista ni la
-- base de cálculo de las cuotas (card_price).

alter table public.products add column if not exists credit_price numeric(12,2);

-- Nota: card_price ya existía y se sigue usando como base para las
-- cuotas sin interés. credit_price es solo para el pago en 1 cuota.
