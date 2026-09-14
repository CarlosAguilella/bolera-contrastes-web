create table if not exists public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.staff_users(id) on delete cascade,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists staff_shifts_one_open_idx on public.staff_shifts(staff_user_id) where ended_at is null;
create index if not exists staff_shifts_staff_started_idx on public.staff_shifts(staff_user_id, started_at desc);

drop trigger if exists staff_shifts_updated_at on public.staff_shifts;
create trigger staff_shifts_updated_at before update on public.staff_shifts for each row execute function public.set_updated_at();

alter table public.staff_shifts enable row level security;
grant select, insert, update, delete on public.staff_shifts to service_role;
