-- ============================================================
-- ARD Suplementos — Configuración general del sitio
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

create table if not exists public.app_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Descuento efectivo/transferencia vs. tarjeta (porcentaje, ej: 20 = 20% OFF)
insert into public.app_settings (key, value)
values ('efectivo_descuento_pct', '20')
on conflict (key) do nothing;
