create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open', 'closed')),
  opening_float_cents integer not null default 0 check (opening_float_cents >= 0),
  expected_cash_cents integer,
  counted_cash_cents integer check (counted_cash_cents >= 0),
  difference_cents integer,
  cash_sales_cents integer not null default 0 check (cash_sales_cents >= 0),
  card_sales_cents integer not null default 0 check (card_sales_cents >= 0),
  total_sales_cents integer not null default 0 check (total_sales_cents >= 0),
  opening_notes text,
  closing_notes text,
  opened_by uuid references public.staff_users(id) on delete set null,
  closed_by uuid references public.staff_users(id) on delete set null,
  opened_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists cash_sessions_one_open_idx on public.cash_sessions(status) where status = 'open';

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id) on delete cascade,
  movement_type text not null check (movement_type in ('in', 'out')),
  amount_cents integer not null check (amount_cents > 0),
  reason text not null check (char_length(reason) between 1 and 240),
  created_by uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists cash_movements_session_idx on public.cash_movements(cash_session_id, created_at desc);

drop trigger if exists cash_sessions_updated_at on public.cash_sessions;
create trigger cash_sessions_updated_at before update on public.cash_sessions for each row execute function public.set_updated_at();

alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
grant select, insert, update, delete on public.cash_sessions, public.cash_movements to service_role;

