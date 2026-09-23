-- Fotografías reales de los artículos del TPV.
-- Ejecutar después de 010_operational_extensions.sql en Supabase > SQL Editor.

alter table public.products add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = 3145728,
    allowed_mime_types = excluded.allowed_mime_types;
