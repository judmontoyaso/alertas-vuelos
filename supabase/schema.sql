-- Ejecutar una vez en el SQL Editor de Supabase.
-- Ademas hay que exponer el esquema: Project Settings -> Data API -> Exposed schemas -> vuelo.
create schema if not exists vuelo;

create table if not exists vuelo.flight_alerts (
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin ~ '^[A-Z]{3}$'),
  destination text not null check (destination ~ '^[A-Z]{3}$'),
  outbound_date date not null,
  return_date date,
  currency text not null default 'COP',
  target_price numeric not null check (target_price > 0),
  email text,
  telegram_chat_id text,
  active boolean not null default true,
  last_price numeric,
  last_price_level text,
  last_checked_at timestamptz,
  last_notified_price numeric,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  check (email is not null or telegram_chat_id is not null)
);

-- Sin politicas y sin permisos para anon/authenticated: solo el servidor (clave secreta) entra.
alter table vuelo.flight_alerts enable row level security;
grant usage on schema vuelo to service_role;
grant all on all tables in schema vuelo to service_role;
