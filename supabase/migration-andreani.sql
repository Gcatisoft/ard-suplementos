-- ============================================================
-- ARD Suplementos — Envíos con Andreani (interior de Catamarca y todo el país)
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================
-- Requiere migration-settings.sql y migration-shipping-capital.sql.
--
-- La cotización real sale de la API de Andreani (credenciales en el .env,
-- ver README). Si la API no está configurada o no responde, el checkout usa
-- la tabla de tarifas manuales por región y peso (panel → Envíos). Una
-- tarifa en 0 se muestra como "A coordinar".

-- ---------- Peso y medidas por producto (para armar el bulto) ----------
-- Si un producto no los tiene cargados se usan los valores por defecto de
-- app_settings (andreani_peso_default_kg / andreani_volumen_default_cm3).
alter table public.products add column if not exists weight_kg numeric(8,3);
alter table public.products add column if not exists length_cm numeric(8,2);
alter table public.products add column if not exists width_cm  numeric(8,2);
alter table public.products add column if not exists height_cm numeric(8,2);

-- ---------- Envío elegido en cada pedido ----------
-- shipping_cost va aparte de `total` (que sigue siendo solo productos, como
-- en las estadísticas); Mercado Pago cobra total + shipping_cost.
alter table public.orders add column if not exists shipping_method text;   -- 'domicilio' | 'retiro' | 'andreani_domicilio' | 'andreani_sucursal'
alter table public.orders add column if not exists shipping_cost   numeric(12,2);
alter table public.orders add column if not exists shipping_data   jsonb;  -- destino, sucursal, fuente de la cotización, etc.

-- ---------- Configuración de Andreani (app_settings) ----------
insert into public.app_settings (key, value) values
  ('andreani_peso_default_kg',              '1'),
  ('andreani_volumen_default_cm3',          '3000'),
  ('andreani_recargo_pct',                  '0'),
  -- JSON: { "<region>": { "domicilio": [hasta1kg, hasta3kg, hasta5kg, hasta10kg, porKgExtra], "sucursal": [...] } }
  ('andreani_tarifas_manuales',             '{}')
on conflict (key) do nothing;

-- Los textos de interior / resto del país ya no dicen "coordinamos por
-- WhatsApp": ahora se cotiza con Andreani. Solo se actualizan si siguen con
-- el texto original (no pisa lo que el admin haya editado).
update public.shipping_faqs
set answer = 'Sí, enviamos con Andreani a toda la provincia de Catamarca y a todo el país. Ingresá tu código postal en el checkout o en la página de Envíos y te mostramos el costo a domicilio y a sucursal.'
where question = '¿Hacen envíos al interior?'
  and answer = 'Sí. Por ahora coordinamos el envío por WhatsApp; estamos preparando la cotización automática.';
