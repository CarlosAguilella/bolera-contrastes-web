alter table public.pos_order_items add column if not exists modifiers jsonb not null default '[]'::jsonb;
alter table public.pos_orders add column if not exists payment_method_detail text;
alter table public.kitchen_orders add column if not exists ready_at timestamptz;

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  method_type text not null check (method_type in ('card', 'cash', 'other')),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
insert into public.payment_methods (name, method_type) values ('Tarjeta principal', 'card') on conflict (name) do nothing;

create table if not exists public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id) on delete cascade,
  expected_cash_cents integer not null check (expected_cash_cents >= 0),
  counted_cash_cents integer not null check (counted_cash_cents >= 0),
  difference_cents integer not null,
  notes text,
  counted_by uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists cash_counts_session_idx on public.cash_counts(cash_session_id, created_at desc);

drop trigger if exists payment_methods_updated_at on public.payment_methods;
create trigger payment_methods_updated_at before update on public.payment_methods for each row execute function public.set_updated_at();

alter table public.payment_methods enable row level security;
alter table public.cash_counts enable row level security;
grant select, insert, update, delete on public.payment_methods, public.cash_counts to service_role;
