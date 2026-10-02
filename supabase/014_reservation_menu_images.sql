-- Imagen opcional para cada menú mostrado en la reserva online.
-- Ejecutar después de 013_reservations.sql.

alter table public.reservation_menu_options
  add column if not exists image_url text;
