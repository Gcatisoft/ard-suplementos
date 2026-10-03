-- ============================================================
-- ARD Suplementos — Recargo tarjeta 3 cuotas
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

-- Requiere que ya exista la tabla app_settings (migration-settings.sql)
insert into public.app_settings (key, value)
values
  ('tarjeta_recargo_3', '25')   -- % recargo sobre efectivo para 3 cuotas (precio de lista)
on conflict (key) do nothing;
