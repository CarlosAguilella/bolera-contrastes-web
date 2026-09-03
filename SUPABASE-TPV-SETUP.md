# Activar la base de datos del TPV

El TPV actual funciona en modo local. Este documento activa la base central para que las mesas, comandas y cocina se sincronicen entre dispositivos.

## 1. Crear el proyecto

1. Entra en `https://supabase.com/dashboard` y crea un proyecto llamado `bolera-contrastes-tpv` en región Europa.
2. En **SQL Editor**, abre una consulta nueva, pega todo `supabase/001_tpv_core.sql` y ejecuta **Run**.
3. Guarda el resultado o una captura si aparece un error. No borres las tablas existentes de `kitchen_orders`.

## 2. Configurar Vercel

En Vercel > proyecto > **Settings > Environment Variables**, añade para `Production` y `Preview`:

```text
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_clave_service_role
TPV_SESSION_SECRET=una_frase_aleatoria_larga_de_32_caracteres_o_mas
```

`SUPABASE_SERVICE_ROLE_KEY` y `TPV_SESSION_SECRET` son secretos: no se envían por WhatsApp, capturas, GitHub ni se ponen en archivos del navegador.

La variable `SUPABASE_URL` ya coincide con la que utiliza el panel de cocina existente. Cuando se active el resto del TPV, se añadirá un endpoint de Vercel que usa estas claves en el servidor.

## 3. Datos que necesitamos decidir

- Usuario administrador inicial: nombre visible y correo/usuario.
- PIN inicial de administración y PIN de cada camarero/cocina. Se configurarán desde el panel; no se guardan en texto plano.
- Si cada persona tendrá además correo/contraseña o solo PIN en los dispositivos del local.

## Resultado del esquema

- `restaurant_tables`: plano y números únicos de mesas.
- `staff_users`: personal, roles y PIN cifrado.
- `products` y `product_categories`: carta editable desde gestión.
- `pos_orders` y `pos_order_items`: comandas y ventas sincronizadas.
- `kitchen_orders` y `print_jobs`: cocina e impresión con reintentos.
- `audit_log`: registro de cambios importantes.
