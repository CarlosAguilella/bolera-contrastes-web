create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{3,12}$'),
  name text not null check (char_length(name) between 2 and 160),
  group_code text not null check (group_code in ('1', '2', '3', '4', '5', '6', '7', '8', '9')),
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'expense', 'income')),
  active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (left(code, 1) = group_code)
);

create table if not exists public.accounting_entries (
  id uuid primary key default gen_random_uuid(),
  entry_number bigint generated always as identity unique,
  entry_date date not null default current_date,
  reference text,
  description text not null check (char_length(description) between 2 and 500),
  source_type text not null default 'manual' check (source_type in ('manual', 'supplier_invoice', 'pos_sale', 'cash_close')),
  source_id uuid,
  status text not null default 'posted' check (status in ('draft', 'posted', 'void')),
  created_by uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.accounting_entry_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.accounting_entries(id) on delete cascade,
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  description text,
  debit_cents integer not null default 0 check (debit_cents >= 0),
  credit_cents integer not null default 0 check (credit_cents >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  check ((debit_cents > 0 and credit_cents = 0) or (credit_cents > 0 and debit_cents = 0))
);

alter table public.supplier_invoices add column if not exists accounting_entry_id uuid references public.accounting_entries(id) on delete set null;

create index if not exists accounting_accounts_group_code_idx on public.accounting_accounts(group_code, code);
create index if not exists accounting_entries_date_idx on public.accounting_entries(entry_date desc, entry_number desc);
create index if not exists accounting_entries_source_idx on public.accounting_entries(source_type, source_id);
create index if not exists accounting_entry_lines_entry_idx on public.accounting_entry_lines(entry_id);
create index if not exists accounting_entry_lines_account_idx on public.accounting_entry_lines(account_id);
create unique index if not exists accounting_supplier_invoice_entry_idx on public.accounting_entries(source_type, source_id) where source_type = 'supplier_invoice' and source_id is not null;

drop trigger if exists accounting_accounts_updated_at on public.accounting_accounts;
create trigger accounting_accounts_updated_at before update on public.accounting_accounts for each row execute function public.set_updated_at();
drop trigger if exists accounting_entries_updated_at on public.accounting_entries;
create trigger accounting_entries_updated_at before update on public.accounting_entries for each row execute function public.set_updated_at();

insert into public.accounting_accounts (code, name, group_code, account_type, is_system) values
  ('100', 'Capital social', '1', 'equity', true),
  ('112', 'Reserva legal', '1', 'equity', true),
  ('129', 'Resultado del ejercicio', '1', 'equity', true),
  ('170', 'Deudas a largo plazo con entidades de crédito', '1', 'liability', true),
  ('206', 'Aplicaciones informáticas', '2', 'asset', true),
  ('213', 'Maquinaria', '2', 'asset', true),
  ('216', 'Mobiliario', '2', 'asset', true),
  ('217', 'Equipos para procesos de información', '2', 'asset', true),
  ('300', 'Mercaderías', '3', 'asset', true),
  ('310', 'Materias primas', '3', 'asset', true),
  ('400', 'Proveedores', '4', 'liability', true),
  ('410', 'Acreedores por prestaciones de servicios', '4', 'liability', true),
  ('430', 'Clientes', '4', 'asset', true),
  ('472', 'Hacienda Pública, IVA soportado', '4', 'asset', true),
  ('4750', 'Hacienda Pública, acreedora por IVA', '4', 'liability', true),
  ('477', 'Hacienda Pública, IVA repercutido', '4', 'liability', true),
  ('570', 'Caja, euros', '5', 'asset', true),
  ('572', 'Bancos e instituciones de crédito c/c vista, euros', '5', 'asset', true),
  ('600', 'Compras de mercaderías', '6', 'expense', true),
  ('602', 'Compras de otros aprovisionamientos', '6', 'expense', true),
  ('607', 'Trabajos realizados por otras empresas', '6', 'expense', true),
  ('621', 'Arrendamientos y cánones', '6', 'expense', true),
  ('622', 'Reparaciones y conservación', '6', 'expense', true),
  ('623', 'Servicios profesionales independientes', '6', 'expense', true),
  ('624', 'Transportes', '6', 'expense', true),
  ('625', 'Primas de seguros', '6', 'expense', true),
  ('626', 'Servicios bancarios y similares', '6', 'expense', true),
  ('627', 'Publicidad, propaganda y relaciones públicas', '6', 'expense', true),
  ('628', 'Suministros', '6', 'expense', true),
  ('629', 'Otros servicios', '6', 'expense', true),
  ('640', 'Sueldos y salarios', '6', 'expense', true),
  ('642', 'Seguridad Social a cargo de la empresa', '6', 'expense', true),
  ('700', 'Ventas de mercaderías', '7', 'income', true),
  ('705', 'Prestaciones de servicios', '7', 'income', true),
  ('708', 'Devoluciones de ventas y operaciones similares', '7', 'expense', true),
  ('759', 'Ingresos por servicios diversos', '7', 'income', true)
on conflict (code) do nothing;

alter table public.accounting_accounts enable row level security;
alter table public.accounting_entries enable row level security;
alter table public.accounting_entry_lines enable row level security;
grant select, insert, update, delete on public.accounting_accounts, public.accounting_entries, public.accounting_entry_lines to service_role;
