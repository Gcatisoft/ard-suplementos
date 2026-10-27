-- ============================================================
-- ARD Suplementos — Estado logístico del envío y número de seguimiento
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================
-- Requiere migration-andreani.sql. Se gestiona desde el panel →
-- Envíos → Pedidos con envío.

-- 'pendiente' | 'preparado' | 'despachado' | 'entregado'
-- (aparte de orders.status, que es el estado del pedido/pago)
alter table public.orders add column if not exists shipping_status text not null default 'pendiente';
alter table public.orders add column if not exists tracking_number text;

create index if not exists orders_shipping_status_idx on public.orders (shipping_status) where shipping_method is not null;
