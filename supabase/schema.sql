-- Ejecutar una vez en el SQL Editor de Supabase.
-- Ademas hay que exponer el esquema: Project Settings -> Data API -> Exposed schemas -> vuelo.
create schema if not exists vuelo;

create table if not exists vuelo.flight_alerts (
  id uuid primary key default gen_random_uuid(),
  -- dates = rangos de fechas de ida y regreso; deal = cualquier fecha, la mas barata
  mode text not null default 'dates' check (mode in ('dates', 'deal')),
  -- Uno o varios codigos IATA separados por coma (una ciudad con varios aeropuertos)
  origin text not null check (origin ~ '^[A-Z]{3}(,[A-Z]{3})*$'),
  origin_label text not null,
  destination text not null check (destination ~ '^[A-Z]{3}(,[A-Z]{3})*$'),
  destination_label text not null,
  round_trip boolean not null default true,
  out_from date,
  out_to date,
  ret_from date,
  ret_to date,
  month smallint not null default 0,        -- deal: 0 = cualquiera de los proximos seis meses
  trip_length smallint not null default 2,  -- deal: 1 fin de semana, 2 una semana, 3 dos semanas
  currency text not null default 'COP',
  target_price numeric check (target_price > 0), -- null = automatico segun el rango habitual
  typical_low numeric,
  typical_high numeric,
  insights_at timestamptz,
  email text,
  telegram_chat_id text,
  active boolean not null default true,
  last_price numeric,
  best_outbound date,
  best_return date,
  best_airline text,
  grid jsonb not null default '{}',
  options jsonb not null default '[]',      -- opciones mas baratas de la ultima revision
  last_checked_at timestamptz,
  last_error text,
  last_notified_price numeric,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  check (email is not null or telegram_chat_id is not null),
  check (mode = 'deal' or (out_from is not null and out_to is not null))
);

-- Para bases creadas antes de que existiera la columna.
alter table vuelo.flight_alerts add column if not exists options jsonb not null default '[]';

create table if not exists vuelo.price_history (
  id bigint generated always as identity primary key,
  alert_id uuid not null references vuelo.flight_alerts (id) on delete cascade,
  checked_at timestamptz not null default now(),
  price numeric not null,
  outbound_date date,
  return_date date
);
create index if not exists price_history_alert_idx
  on vuelo.price_history (alert_id, checked_at desc);

-- Sin politicas y sin permisos para anon/authenticated: solo el servidor (clave secreta) entra.
alter table vuelo.flight_alerts enable row level security;
alter table vuelo.price_history enable row level security;
grant usage on schema vuelo to service_role;
grant all on all tables in schema vuelo to service_role;
grant usage on all sequences in schema vuelo to service_role;
