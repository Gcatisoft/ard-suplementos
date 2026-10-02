-- ============================================================
-- ARD Suplementos — Código de barras, costo y medio de pago
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

-- Código de barras por producto (opcional, único cuando está cargado)
alter table public.products
  add column if not exists barcode text;

create unique index if not exists products_barcode_idx
  on public.products (barcode)
  where barcode is not null and barcode <> '';

-- Precio de costo (para calcular margen de ganancia en el panel)
alter table public.products
  add column if not exists cost_price numeric;

-- Medio de pago en ventas locales (efectivo, débito, etc.)
alter table public.orders
  add column if not exists payment_method text;

-- Función para decrementar stock de forma atómica (evita race conditions)
create or replace function public.decrement_stock(p_id uuid, p_qty integer)
returns void language sql security definer as $$
  update public.products
  set stock = greatest(0, stock - p_qty)
  where id = p_id;
$$;
