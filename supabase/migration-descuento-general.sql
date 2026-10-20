-- ============================================================
-- ARD Suplementos — Descuento general + personalizado por producto
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================
-- Hasta ahora la insignia de descuento era todo o nada por producto
-- (discount_badge_active). Esto agrega un modo por producto:
--   'general' -> hereda el descuento general del sitio (app_settings)
--   'custom'  -> usa el discount_badge_percent propio de este producto
--   'none'    -> nunca muestra insignia, aunque haya un general activo
-- Por defecto todos los productos quedan en 'general', así el descuento
-- general que configures se aplica automáticamente a todo el catálogo.

alter table public.products
  add column if not exists discount_badge_mode text not null default 'general';

-- Migra los productos que ya tenían una insignia manual activada: pasan a
-- 'custom' y conservan su porcentaje propio, para no cambiarles nada.
update public.products
set discount_badge_mode = 'custom'
where discount_badge_active = true;

-- Configuración del descuento general (apagado por defecto: se activa
-- desde el panel, en Configuración → "Descuento general (insignia)").
insert into public.app_settings (key, value) values
  ('descuento_general_activo', 'false'),
  ('descuento_general_pct', '5')
on conflict (key) do nothing;
