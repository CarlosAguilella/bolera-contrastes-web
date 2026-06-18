# Redsys en Vercel

Esta integración prepara el pago en servidor, redirige al cliente a Redsys y solo confirma el pedido cuando Redsys envía la notificación firmada.

## Variables necesarias

Configúralas en Vercel → Project → Settings → Environment Variables:

```txt
REDSYS_ENV=test
DELIVERY_PAYMENT_MODE=auto
REDSYS_PRODUCTION_READY=false
REDSYS_PUBLIC_BASE_URL=https://bolera-contrastes-web.vercel.app
REDSYS_MERCHANT_CODE=TU_CODIGO_DE_COMERCIO
REDSYS_TERMINAL=1
REDSYS_SECRET_KEY=TU_CLAVE_SHA256_DEL_TERMINAL
REDSYS_MERCHANT_NAME=Bolera Contrastes
```

Opcionales:

```txt
REDSYS_CONFIRMATION_WEBHOOK_URL=https://tu-webhook-de-confirmacion
REDSYS_NOTIFICATION_EMAIL=caguilellat14@gmail.com
EMAIL_PROVIDER=gmail
GMAIL_USER=tu-gmail@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
GMAIL_FROM=Bolera Contrastes <tu-gmail@gmail.com>
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM=Bolera Contrastes <pedidos@tudominio.com>
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_KITCHEN_TO=34600000000
WHATSAPP_GRAPH_VERSION=v23.0
DELIVERY_ORDERS_ENABLED=true
DELIVERY_MINIMUM_CENTS=0
DELIVERY_ALLOWED_ZONES=Onda
KITCHEN_PIN=CAMBIA_ESTE_PIN
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
KITCHEN_ORDERS_TABLE=kitchen_orders
```

- `REDSYS_ENV`: usa `test` para los datos de pruebas de Sabadell/Redsys y `prod` cuando el banco active el TPV real.
- `DELIVERY_PAYMENT_MODE`: usa `auto` por seguridad, `redsys` para forzar TPV real o `demo` para flujo visual sin banco.
- `REDSYS_PRODUCTION_READY`: debe estar en `true` para enviar clientes a Redsys producción. Si `REDSYS_ENV=prod` y no está en `true`, el sistema muestra pedido pendiente/no cobrado para evitar errores públicos como `SIS0042`.
- `REDSYS_CONFIRMATION_WEBHOOK_URL`: URL que recibirá los pedidos pagados y verificados para avisar al bar o conectarlo con otra herramienta.
- `REDSYS_NOTIFICATION_EMAIL`: correo que recibirá el aviso cuando Redsys confirme un pago.
- `EMAIL_PROVIDER`: usa `gmail` para enviar pedidos desde Gmail. También admite `resend` o `auto`.
- `GMAIL_USER`: cuenta Gmail que enviará los avisos.
- `GMAIL_APP_PASSWORD`: contraseña de aplicación de Gmail, no la contraseña normal de la cuenta.
- `GMAIL_FROM`: remitente visible en el correo. Debe usar la misma cuenta Gmail o un alias autorizado.
- `RESEND_API_KEY`: clave API de Resend para enviar emails desde servidor.
- `RESEND_FROM`: remitente verificado en Resend. Para producción conviene usar un dominio propio verificado.
- `WHATSAPP_ACCESS_TOKEN`: token permanente de WhatsApp Business Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID`: ID del número emisor en Meta.
- `WHATSAPP_KITCHEN_TO`: teléfono de cocina o barra en formato internacional sin `+`.
- `WHATSAPP_GRAPH_VERSION`: versión de Graph API. Si Meta cambia versión, se actualiza aquí sin tocar código.
- WhatsApp Cloud API puede requerir conversación abierta o plantilla aprobada por Meta para mensajes iniciados por la empresa.
- El webhook debe deduplicar por `orderId`, porque Redsys puede reintentar una notificación si no recibe respuesta correcta.
- Sin webhook, Gmail/Resend ni WhatsApp Cloud API, el pago se verifica en Vercel, pero el bar no recibe un aviso automático.
- `DELIVERY_ORDERS_ENABLED`: si está en `false`, el backend bloquea nuevos pedidos online.
- `DELIVERY_MINIMUM_CENTS`: mínimo de subtotal para entrega a domicilio. `0` significa sin mínimo.
- `DELIVERY_ALLOWED_ZONES`: lista separada por comas. Si se configura, la dirección de domicilio debe contener alguna zona.
- `KITCHEN_PIN`: PIN interno obligatorio para entrar al panel `/cocina`.
- `SUPABASE_URL`: URL del proyecto Supabase que guardará los pedidos para cocina.
- `SUPABASE_SERVICE_ROLE_KEY`: clave server-side de Supabase. Solo debe estar en Vercel, nunca en frontend.
- `KITCHEN_ORDERS_TABLE`: tabla de pedidos de cocina. Por defecto `kitchen_orders`.

## Seguridad aplicada

- El navegador nunca ve la clave secreta de Redsys.
- Se usa la integración clásica de Redsys para clave SHA256: `HMAC_SHA256_V1`, 3DES sobre número de pedido y HMAC SHA-256.
- El importe se recalcula en `/api/redsys-create-order`; no se acepta el total enviado por el cliente.
- El backend carga productos y precios desde `data.js`; la carta visible y el cálculo de pago comparten la misma fuente de precios.
- El servidor valida contacto, método de entrega, dirección cuando hay domicilio, método de pago, cantidades, subtotal, gastos de entrega y total final.
- La confirmación real se hace en `/api/redsys-notification`, verificando `Ds_Signature`.
- La pantalla `/redsys-ok` no confirma por sí sola el pedido; solo informa al cliente tras volver de Redsys.
- El email solo se manda después de verificar firma y respuesta autorizada de Redsys.
- El WhatsApp automático a cocina solo se manda después de verificar firma y respuesta autorizada de Redsys.
- El envío usa `Idempotency-Key` con el número de pedido para reducir duplicados si Redsys reintenta la notificación.
- Si un webhook de confirmación falla, la API devuelve error para que Redsys pueda reintentar la notificación.
- El panel `/cocina` pide PIN y llama a `/api/kitchen-orders`; la clave de Supabase queda solo en servidor.

## Respaldo manual de cocina

La página `/redsys-ok` muestra un botón de WhatsApp con el pedido guardado en el navegador antes de redirigir a Redsys. Es un respaldo operativo; la confirmación fiable sigue siendo la notificación servidor-servidor de Redsys.

## Gmail para avisos de pedidos

Para recibir pedidos en Gmail tras un pago confirmado:

1. Activa la verificación en dos pasos en la cuenta Gmail.
2. En Google Account → Seguridad → Contraseñas de aplicaciones, crea una contraseña para `Mail`.
3. En Vercel añade `EMAIL_PROVIDER=gmail`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_FROM` y `REDSYS_NOTIFICATION_EMAIL`.
4. Haz redeploy del proyecto.

El correo se envía desde servidor en `/api/redsys-notification`, solo cuando Redsys confirma el pago con firma válida. Las credenciales de Gmail no se cargan nunca en el navegador.

Para probar el envío sin hacer un pago real, después de configurar `KITCHEN_PIN`:

```bash
curl -X POST https://bolera-contrastes-web.vercel.app/api/test-order-email \
  -H "x-kitchen-pin: TU_PIN"
```

También puedes hacerlo desde `/cocina` con el botón `Probar email`.

## Panel de cocina

El panel interno está en:

```txt
https://bolera-contrastes-web.vercel.app/cocina
```

Para que el panel reciba pedidos en tiempo real razonable, crea una tabla en Supabase y añade las variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KITCHEN_ORDERS_TABLE` y `KITCHEN_PIN` en Vercel.

SQL recomendado:

```sql
create table if not exists public.kitchen_orders (
  order_id text primary key,
  status text not null default 'paid',
  source text,
  payment_status text,
  amount_cents integer not null default 0,
  subtotal_cents integer not null default 0,
  delivery_fee_cents integer not null default 0,
  customer_name text,
  customer_phone text,
  customer_email text,
  delivery_method text,
  delivery_detail text,
  notes text,
  items jsonb not null default '[]'::jsonb,
  raw_payload jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kitchen_orders_status_idx on public.kitchen_orders(status);
create index if not exists kitchen_orders_created_at_idx on public.kitchen_orders(created_at desc);
```

- Los pedidos pagados por Redsys entran como `paid` tras verificar la firma de Redsys.
- Los pedidos que caen a modo pendiente/no cobrado entran como `pending_payment` y el panel muestra `NO COCINAR todavía`.
- Cocina puede cambiar estados: aceptado, en cocina, listo, entregado o cancelado.
- Si Supabase no está configurado, el panel se abre pero avisa de que no hay almacenamiento; email/WhatsApp siguen siendo el respaldo operativo si están configurados.
- Desde `/cocina`, el botón `Probar pedido` crea un pedido ficticio en Supabase para comprobar que la pantalla funciona antes de aceptar pedidos reales.

Uso recomendado en cocina:

1. Abrir `/cocina` en una tablet u ordenador y entrar con `KITCHEN_PIN`.
2. Dejar activado el filtro `Activos`; los entregados/cancelados quedan en `Todos`.
3. Cuando entra un pedido nuevo, la pantalla avisa y suena si el navegador permite audio.
4. Flujo operativo: `Aceptar` → `Pasar a cocina` → `Marcar listo` → `Entregado`.
5. Si aparece `Pendiente / no cobrado`, no cocinar hasta que Redsys confirme o se confirme manualmente.

## Flujo

1. El cliente añade productos y completa contacto, entrega y pago.
2. `/api/redsys-create-order` valida el pedido, recalcula subtotal, gastos y total, y firma la operación.
3. El cliente paga en Redsys en la misma pestaña, sin popups.
4. Redsys llama a `/api/redsys-notification`.
5. Si la firma y el código de respuesta son correctos, se avisa al local por webhook, email o WhatsApp si están configurados.

## Documentación oficial

- Pago por redirección: `https://pagosonline.redsys.es/desarrolladores-inicio/documentacion-operativa/autorizacion/`
- Firma HMAC SHA-512: `https://pagosonline.redsys.es/desarrolladores-inicio/documentacion-operativa/firmar-una-operacion/`
