-- Permite que las funciones de Vercel accedan a las tablas mediante la clave Secret.
-- No concede acceso al navegador: las tablas siguen protegidas por RLS.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
grant select, insert, update, delete on tables to service_role;

alter default privileges for role postgres in schema public
grant usage, select on sequences to service_role;
