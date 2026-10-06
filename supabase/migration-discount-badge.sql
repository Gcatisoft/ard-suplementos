-- ============================================================
-- ARD Suplementos — Insignia de descuento manual
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================
-- Permite activar/desactivar a mano la insignia "X% OFF" sobre la foto del
-- producto, independiente de si hay o no un precio anterior configurado, y
-- elegir qué porcentaje mostrar (no se calcula solo a partir de precio vs.
-- precio anterior, porque a veces el descuento real es un monto fijo en
-- pesos que no da un porcentaje redondo).

alter table public.products
  add column if not exists discount_badge_active boolean not null default false;

alter table public.products
  add column if not exists discount_badge_percent numeric;
