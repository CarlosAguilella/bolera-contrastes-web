create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  invoice_number text,
  invoice_date date not null default current_date,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  vat_cents integer not null default 0 check (vat_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  classification_status text not null default 'manual' check (classification_status in ('pending_ai', 'extracted', 'verified', 'manual', 'error')),
  source_file_name text,
  source_text text,
  ai_extraction jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.supplier_invoices(id) on delete cascade,
  product_code text,
  product_name text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text,
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  line_total_cents integer not null default 0 check (line_total_cents >= 0),
  vat_percent numeric(5,2) not null default 10 check (vat_percent >= 0 and vat_percent <= 100),
  ingredient_id uuid references public.ingredients(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists supplier_invoices_date_idx on public.supplier_invoices(invoice_date desc);
create index if not exists supplier_invoice_lines_invoice_idx on public.supplier_invoice_lines(invoice_id);

drop trigger if exists supplier_invoices_updated_at on public.supplier_invoices;
create trigger supplier_invoices_updated_at before update on public.supplier_invoices for each row execute function public.set_updated_at();

alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_lines enable row level security;
grant select, insert, update, delete on public.supplier_invoices, public.supplier_invoice_lines to service_role;
