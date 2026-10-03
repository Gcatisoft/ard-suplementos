-- ============================================================
-- ARD Suplementos — Tarifas de envío
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

-- Requiere que ya exista la tabla app_settings (migration-settings.sql)
insert into public.app_settings (key, value)
values
  ('envio_local',    '0'),
  ('envio_nacional', '0')
on conflict (key) do nothing;
