-- Bolera Contrastes · base central para TPV, sala, cocina y gestión.
-- Ejecutar en Supabase Dashboard > SQL Editor como propietario del proyecto.
-- Las aplicaciones web no acceden directamente: Vercel usa la clave service_role
-- exclusivamente desde /api. Nunca copies esa clave en JavaScript del navegador.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9._-]{3,40}$'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  role text not null check (role in ('admin', 'manager', 'waiter', 'kitchen')),
  pin_digest text not null,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  table_number integer not null check (table_number between 1 and 999),
  zone text not null default 'sala' check (zone in ('sala', 'pared', 'terraza', 'barra')),
  position_x numeric(5,2) not null default 50 check (position_x between 0 and 100),
  position_y numeric(5,2) not null default 50 check (position_y between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (table_number)
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  variant text,
  description text,
  price_cents integer not null check (price_cents >= 0),
  cost_cents integer check (cost_cents >= 0),
  sends_to_kitchen boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pos_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  table_id uuid references public.restaurant_tables(id) on delete set null,
  table_number integer,
  source text not null default 'room' check (source in ('room', 'bar', 'delivery', 'qr', 'takeaway')),
  status text not null default 'open' check (status in ('open', 'sent', 'paid', 'cancelled', 'refunded')),
  payment_method text check (payment_method in ('cash', 'card', 'online', 'other')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  notes text,
  opened_by uuid references public.staff_users(id) on delete set null,
  closed_by uuid references public.staff_users(id) on delete set null,
  opened_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pos_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pos_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  variant text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  sends_to_kitchen boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Compatible con el endpoint de delivery/cocina ya presente en la web.
create table if not exists public.kitchen_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  status text not null default 'created',
  source text not null default 'tpv',
  payment_status text,
  amount_cents integer not null default 0,
  subtotal_cents integer not null default 0,
  delivery_fee_cents integer not null default 0,
  customer_name text,
  customer_phone text,
  customer_email text,
  delivery_method text,
  delivery_detail text,
  notes text,
  items jsonb not null default '[]'::jsonb,
  raw_payload jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists kitchen_orders_order_id_key on public.kitchen_orders(order_id);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  kitchen_order_id text references public.kitchen_orders(order_id) on delete cascade,
  pos_order_id uuid references public.pos_orders(id) on delete cascade,
  destination text not null default 'kitchen',
  status text not null default 'queued' check (status in ('queued', 'printing', 'printed', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  printed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (kitchen_order_id is not null or pos_order_id is not null)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.staff_users(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.kitchen_orders add column if not exists id uuid default gen_random_uuid();
alter table public.kitchen_orders add column if not exists updated_at timestamptz default timezone('utc', now());
alter table public.kitchen_orders add column if not exists created_at timestamptz default timezone('utc', now());
create index if not exists pos_orders_table_status_idx on public.pos_orders(table_id, status);
create index if not exists pos_orders_created_at_idx on public.pos_orders(created_at desc);
create index if not exists pos_order_items_order_id_idx on public.pos_order_items(order_id);
create index if not exists kitchen_orders_status_created_idx on public.kitchen_orders(status, created_at desc);
create index if not exists print_jobs_status_created_idx on public.print_jobs(status, created_at);
create index if not exists audit_log_entity_idx on public.audit_log(entity_type, entity_id, created_at desc);

drop trigger if exists staff_users_updated_at on public.staff_users;
create trigger staff_users_updated_at before update on public.staff_users for each row execute function public.set_updated_at();
drop trigger if exists restaurant_tables_updated_at on public.restaurant_tables;
create trigger restaurant_tables_updated_at before update on public.restaurant_tables for each row execute function public.set_updated_at();
drop trigger if exists product_categories_updated_at on public.product_categories;
create trigger product_categories_updated_at before update on public.product_categories for each row execute function public.set_updated_at();
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists pos_orders_updated_at on public.pos_orders;
create trigger pos_orders_updated_at before update on public.pos_orders for each row execute function public.set_updated_at();
drop trigger if exists pos_order_items_updated_at on public.pos_order_items;
create trigger pos_order_items_updated_at before update on public.pos_order_items for each row execute function public.set_updated_at();
drop trigger if exists kitchen_orders_updated_at on public.kitchen_orders;
create trigger kitchen_orders_updated_at before update on public.kitchen_orders for each row execute function public.set_updated_at();
drop trigger if exists print_jobs_updated_at on public.print_jobs;
create trigger print_jobs_updated_at before update on public.print_jobs for each row execute function public.set_updated_at();

-- Sin políticas públicas: la clave service_role se usa solo en funciones de Vercel.
alter table public.staff_users enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.pos_orders enable row level security;
alter table public.pos_order_items enable row level security;
alter table public.kitchen_orders enable row level security;
alter table public.print_jobs enable row level security;
alter table public.audit_log enable row level security;

do $$
begin
  alter publication supabase_realtime add table public.restaurant_tables;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.pos_orders;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.kitchen_orders;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.print_jobs;
exception when duplicate_object then null;
end $$;
