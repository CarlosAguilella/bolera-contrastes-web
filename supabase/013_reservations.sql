-- Bolera Contrastes · reservas online y disponibilidad de sala.
-- Ejecutar después de 012_accounting_workbench.sql en Supabase > SQL Editor.

create table if not exists public.reservation_slots (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  service_time time not null,
  capacity_people integer not null check (capacity_people between 1 and 200),
  reserved_people integer not null default 0 check (reserved_people >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (service_date, service_time),
  check (reserved_people <= capacity_people)
);

create table if not exists public.reservation_menu_options (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  price_cents integer check (price_cents is null or price_cents >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('R-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  slot_id uuid not null references public.reservation_slots(id) on delete restrict,
  service_date date not null,
  service_time time not null,
  party_size integer not null check (party_size between 1 and 80),
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  customer_phone text not null check (char_length(customer_phone) between 6 and 40),
  customer_email text,
  menu_option_id uuid references public.reservation_menu_options(id) on delete set null,
  menu_name text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'no_show')),
  source text not null default 'web' check (source in ('web', 'phone', 'walk_in', 'management')),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists reservation_slots_date_idx on public.reservation_slots(service_date, service_time);
create index if not exists reservations_service_idx on public.reservations(service_date, service_time, status);

drop trigger if exists reservation_slots_updated_at on public.reservation_slots;
create trigger reservation_slots_updated_at before update on public.reservation_slots for each row execute function public.set_updated_at();
drop trigger if exists reservation_menu_options_updated_at on public.reservation_menu_options;
create trigger reservation_menu_options_updated_at before update on public.reservation_menu_options for each row execute function public.set_updated_at();
drop trigger if exists reservations_updated_at on public.reservations;
create trigger reservations_updated_at before update on public.reservations for each row execute function public.set_updated_at();

create or replace function public.create_web_reservation(
  p_slot_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_party_size integer,
  p_menu_option_id uuid default null,
  p_notes text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_slot public.reservation_slots%rowtype;
  selected_menu public.reservation_menu_options%rowtype;
  created_reservation public.reservations%rowtype;
begin
  if p_customer_name is null or char_length(trim(p_customer_name)) < 2 then
    raise exception 'Indica el nombre de la persona que reserva.';
  end if;
  if p_customer_phone is null or char_length(regexp_replace(p_customer_phone, '\D', '', 'g')) < 6 then
    raise exception 'Indica un teléfono de contacto válido.';
  end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > 80 then
    raise exception 'El número de comensales no es válido.';
  end if;

  select * into selected_slot
  from public.reservation_slots
  where id = p_slot_id and enabled = true and service_date >= current_date
  for update;

  if not found then
    raise exception 'Este turno ya no está disponible. Elige otro horario.';
  end if;
  if selected_slot.reserved_people + p_party_size > selected_slot.capacity_people then
    raise exception 'No quedan plazas suficientes para ese horario.';
  end if;

  if p_menu_option_id is not null then
    select * into selected_menu from public.reservation_menu_options where id = p_menu_option_id and active = true;
    if not found then
      raise exception 'El menú elegido ya no está disponible.';
    end if;
  end if;

  update public.reservation_slots
  set reserved_people = reserved_people + p_party_size
  where id = selected_slot.id;

  insert into public.reservations (
    slot_id, service_date, service_time, party_size, customer_name, customer_phone,
    customer_email, menu_option_id, menu_name, notes
  ) values (
    selected_slot.id, selected_slot.service_date, selected_slot.service_time, p_party_size,
    trim(p_customer_name), trim(p_customer_phone), nullif(trim(coalesce(p_customer_email, '')), ''),
    selected_menu.id, selected_menu.name, nullif(trim(coalesce(p_notes, '')), '')
  ) returning * into created_reservation;

  return created_reservation;
end;
$$;

create or replace function public.admin_set_reservation_status(p_reservation_id uuid, p_status text)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reservation public.reservations%rowtype;
  updated_reservation public.reservations%rowtype;
  old_consumes_capacity boolean;
  new_consumes_capacity boolean;
begin
  if p_status not in ('pending', 'confirmed', 'cancelled', 'no_show') then
    raise exception 'El estado de reserva no es válido.';
  end if;
  select * into current_reservation from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'Reserva no encontrada.';
  end if;
  perform 1 from public.reservation_slots where id = current_reservation.slot_id for update;
  old_consumes_capacity := current_reservation.status in ('pending', 'confirmed');
  new_consumes_capacity := p_status in ('pending', 'confirmed');
  if old_consumes_capacity and not new_consumes_capacity then
    update public.reservation_slots set reserved_people = greatest(0, reserved_people - current_reservation.party_size) where id = current_reservation.slot_id;
  elsif not old_consumes_capacity and new_consumes_capacity then
    update public.reservation_slots
    set reserved_people = reserved_people + current_reservation.party_size
    where id = current_reservation.slot_id and reserved_people + current_reservation.party_size <= capacity_people;
    if not found then raise exception 'Ya no hay plazas para reactivar esta reserva.'; end if;
  end if;
  update public.reservations
  set status = p_status,
      confirmed_at = case when p_status = 'confirmed' then timezone('utc', now()) else confirmed_at end,
      cancelled_at = case when p_status in ('cancelled', 'no_show') then timezone('utc', now()) else cancelled_at end
  where id = current_reservation.id
  returning * into updated_reservation;
  return updated_reservation;
end;
$$;

alter table public.reservation_slots enable row level security;
alter table public.reservation_menu_options enable row level security;
alter table public.reservations enable row level security;
grant select, insert, update, delete on public.reservation_slots, public.reservation_menu_options, public.reservations to service_role;
revoke all on function public.create_web_reservation(uuid, text, text, text, integer, uuid, text) from public;
revoke all on function public.admin_set_reservation_status(uuid, text) from public;
grant execute on function public.create_web_reservation(uuid, text, text, text, integer, uuid, text) to service_role;
grant execute on function public.admin_set_reservation_status(uuid, text) to service_role;
