alter table public.supplier_invoices add column if not exists source_file_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplier-invoices', 'supplier-invoices', false, 6291456, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 6291456, allowed_mime_types = excluded.allowed_mime_types;
