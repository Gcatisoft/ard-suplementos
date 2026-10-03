-- ============================================================
-- ARD Suplementos — Recargos con tarjeta por cuotas
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

-- Requiere que ya exista la tabla app_settings (migration-settings.sql)
insert into public.app_settings (key, value)
values
  ('tarjeta_recargo_1', '7.69'),   -- % recargo sobre efectivo para 1 pago con tarjeta
  ('tarjeta_recargo_2', '20.28')   -- % recargo sobre efectivo para 2 cuotas
on conflict (key) do nothing;
