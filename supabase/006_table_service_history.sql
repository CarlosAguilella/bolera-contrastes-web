create table if not exists public.table_service_events (
  id uuid primary key default gen_random_uuid(),
  pos_order_id uuid not null references public.pos_orders(id) on delete cascade,
  event_type text not null check (event_type in ('opened', 'items_added', 'sent_to_kitchen', 'kitchen_preparing', 'kitchen_ready', 'served', 'paid')),
  summary text not null,
  items jsonb not null default '[]'::jsonb,
  actor_id uuid references public.staff_users(id) on delete set null,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists table_service_events_order_time_idx on public.table_service_events(pos_order_id, occurred_at asc);
create index if not exists table_service_events_occurred_idx on public.table_service_events(occurred_at desc);

alter table public.table_service_events enable row level security;
grant select, insert, update, delete on public.table_service_events to service_role;
