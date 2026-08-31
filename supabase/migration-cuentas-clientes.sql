  -- ============================================================
  -- ARD Suplementos — Migración: cuentas de clientes (login del sitio)
  -- Ejecutar en: Supabase → SQL Editor → New query
  -- ============================================================
  -- Permite que los compradores se registren con email y contraseña para
  -- ver el historial de sus compras. El registro/login es obligatorio para
  -- finalizar una compra. La columna google_sub queda preparada para sumar
  -- "Entrar con Google" más adelante sin volver a migrar.

  create extension if not exists "pgcrypto";

  -- Reutilizamos la función de updated_at que ya define schema.sql; la
  -- recreamos por si esta base todavía no la tenía.
  create or replace function public.set_updated_at()
  returns trigger as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$ language plpgsql;

  create table if not exists public.customer_accounts (
    id             uuid primary key default gen_random_uuid(),
    email          text not null unique,
    password_hash  text,                       -- null si algún día entra solo por Google
    google_sub     text unique,                -- id estable de Google (futuro)
    name           text not null default '',
    phone          text,
    email_verified boolean not null default false,
    verify_token   text,
    customer_id    uuid references public.customers(id) on delete set null,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
  );

  create index if not exists customer_accounts_email_lower_idx on public.customer_accounts (lower(email));
  create index if not exists customer_accounts_phone_idx on public.customer_accounts (phone);

  drop trigger if exists trg_customer_accounts_updated_at on public.customer_accounts;
  create trigger trg_customer_accounts_updated_at
    before update on public.customer_accounts
    for each row execute function public.set_updated_at();

  -- Cada pedido queda vinculado a la cuenta que lo hizo (si estaba logueada).
  alter table public.orders add column if not exists account_id uuid
    references public.customer_accounts(id) on delete set null;
  create index if not exists orders_account_id_idx on public.orders (account_id);

  -- El backend usa la SERVICE ROLE KEY (bypassea RLS). Igual bloqueamos el
  -- acceso con la anon key: nadie puede leer las cuentas desde el navegador.
  alter table public.customer_accounts enable row level security;
  drop policy if exists "Sin acceso publico a customer_accounts" on public.customer_accounts;
  create policy "Sin acceso publico a customer_accounts"
    on public.customer_accounts for select using (false);
