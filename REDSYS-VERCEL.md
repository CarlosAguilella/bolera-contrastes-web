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
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM=Bolera Contrastes <pedidos@tudominio.com>
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_KITCHEN_TO=34600000000
WHATSAPP_GRAPH_VERSION=v23.0
```

- `REDSYS_ENV`: usa `test` para los datos de pruebas de Sabadell/Redsys y `prod` cuando el banco active el TPV real.
- `DELIVERY_PAYMENT_MODE`: usa `auto` por seguridad, `redsys` para forzar TPV real o `demo` para flujo visual sin banco.
- `REDSYS_PRODUCTION_READY`: debe estar en `true` para enviar clientes a Redsys producción. Si `REDSYS_ENV=prod` y no está en `true`, el sistema muestra pedido pendiente/no cobrado para evitar errores públicos como `SIS0042`.
- `REDSYS_CONFIRMATION_WEBHOOK_URL`: URL que recibirá los pedidos pagados y verificados para avisar al bar o conectarlo con otra herramienta.
- `REDSYS_NOTIFICATION_EMAIL`: correo que recibirá el aviso cuando Redsys confirme un pago.
- `RESEND_API_KEY`: clave API de Resend para enviar emails desde servidor.
- `RESEND_FROM`: remitente verificado en Resend. Para producción conviene usar un dominio propio verificado.
- `WHATSAPP_ACCESS_TOKEN`: token permanente de WhatsApp Business Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID`: ID del número emisor en Meta.
- `WHATSAPP_KITCHEN_TO`: teléfono de cocina o barra en formato internacional sin `+`.
- `WHATSAPP_GRAPH_VERSION`: versión de Graph API. Si Meta cambia versión, se actualiza aquí sin tocar código.
- WhatsApp Cloud API puede requerir conversación abierta o plantilla aprobada por Meta para mensajes iniciados por la empresa.
- El webhook debe deduplicar por `orderId`, porque Redsys puede reintentar una notificación si no recibe respuesta correcta.
- Sin webhook, `RESEND_API_KEY` ni WhatsApp Cloud API, el pago se verifica en Vercel, pero el bar no recibe un aviso automático.

## Seguridad aplicada

- El navegador nunca ve la clave secreta de Redsys.
- Se usa la integración clásica de Redsys para clave SHA256: `HMAC_SHA256_V1`, 3DES sobre número de pedido y HMAC SHA-256.
- El importe se recalcula en `/api/redsys-create-order`; no se acepta el total enviado por el cliente.
- El servidor valida contacto, método de entrega, dirección cuando hay domicilio, método de pago, cantidades, subtotal, gastos de entrega y total final.
- La confirmación real se hace en `/api/redsys-notification`, verificando `Ds_Signature`.
- La pantalla `/redsys-ok` no confirma por sí sola el pedido; solo informa al cliente tras volver de Redsys.
- El email solo se manda después de verificar firma y respuesta autorizada de Redsys.
- El WhatsApp automático a cocina solo se manda después de verificar firma y respuesta autorizada de Redsys.
- El envío usa `Idempotency-Key` con el número de pedido para reducir duplicados si Redsys reintenta la notificación.
- Si un webhook de confirmación falla, la API devuelve error para que Redsys pueda reintentar la notificación.

## Respaldo manual de cocina

La página `/redsys-ok` muestra un botón de WhatsApp con el pedido guardado en el navegador antes de redirigir a Redsys. Es un respaldo operativo; la confirmación fiable sigue siendo la notificación servidor-servidor de Redsys.

## Flujo

1. El cliente añade productos y completa contacto, entrega y pago.
2. `/api/redsys-create-order` valida el pedido, recalcula subtotal, gastos y total, y firma la operación.
3. El cliente paga en Redsys en la misma pestaña, sin popups.
4. Redsys llama a `/api/redsys-notification`.
5. Si la firma y el código de respuesta son correctos, se avisa al local por webhook, email o WhatsApp si están configurados.

## Documentación oficial

- Pago por redirección: `https://pagosonline.redsys.es/desarrolladores-inicio/documentacion-operativa/autorizacion/`
- Firma HMAC SHA-512: `https://pagosonline.redsys.es/desarrolladores-inicio/documentacion-operativa/firmar-una-operacion/`
