# Redsys en Vercel

Esta integración prepara el pago en servidor, redirige al cliente a Redsys y solo confirma el pedido cuando Redsys envía la notificación firmada.

## Variables necesarias

Configúralas en Vercel → Project → Settings → Environment Variables:

```txt
REDSYS_ENV=test
REDSYS_PUBLIC_BASE_URL=https://bolera-contrastes-web.vercel.app
REDSYS_MERCHANT_CODE=TU_FUC
REDSYS_TERMINAL=1
REDSYS_SECRET_KEY=TU_CLAVE_DE_FIRMA_DEL_TERMINAL
REDSYS_MERCHANT_NAME=Bolera Contrastes
```

Opcionales:

```txt
REDSYS_PAY_METHODS=z
REDSYS_CONFIRMATION_WEBHOOK_URL=https://tu-webhook-de-confirmacion
REDSYS_NOTIFICATION_EMAIL=caguilellat14@gmail.com
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM=Bolera Contrastes <pedidos@tudominio.com>
```

- `REDSYS_ENV`: usa `test` para pruebas y `prod` cuando el banco active el TPV real.
- `REDSYS_PAY_METHODS=z`: fuerza Bizum si tu banco lo tiene contratado en Redsys; déjalo vacío para mostrar los métodos contratados.
- `REDSYS_CONFIRMATION_WEBHOOK_URL`: URL que recibirá los pedidos pagados y verificados para avisar al bar o conectarlo con otra herramienta.
- `REDSYS_NOTIFICATION_EMAIL`: correo que recibirá el aviso cuando Redsys confirme un pago.
- `RESEND_API_KEY`: clave API de Resend para enviar emails desde servidor.
- `RESEND_FROM`: remitente verificado en Resend. Para producción conviene usar un dominio propio verificado.
- El webhook debe deduplicar por `orderId`, porque Redsys puede reintentar una notificación si no recibe respuesta correcta.
- Sin webhook ni `RESEND_API_KEY`, el pago se verifica en Vercel, pero el bar no recibe un aviso automático.

## Seguridad aplicada

- El navegador nunca ve la clave secreta de Redsys.
- Se usa la integración oficial actual de Redsys: `HMAC_SHA512_V2` con firma AES/HMAC SHA-512.
- El importe se recalcula en `/api/redsys-create-order`; no se acepta el total enviado por el cliente.
- La confirmación real se hace en `/api/redsys-notification`, verificando `Ds_Signature`.
- La pantalla `/redsys-ok` no confirma por sí sola el pedido; solo informa al cliente tras volver de Redsys.
- El email solo se manda después de verificar firma y respuesta autorizada de Redsys.
- El envío usa `Idempotency-Key` con el número de pedido para reducir duplicados si Redsys reintenta la notificación.
- Si un webhook de confirmación falla, la API devuelve error para que Redsys pueda reintentar la notificación.

## Flujo

1. El cliente añade productos y pulsa `Pagar pedido con Redsys`.
2. `/api/redsys-create-order` valida carrito, calcula total y firma la operación.
3. El cliente paga en Redsys.
4. Redsys llama a `/api/redsys-notification`.
5. Si la firma y el código de respuesta son correctos, se envía el pedido al webhook de confirmación.

## Documentación oficial

- Pago por redirección: `https://pagosonline.redsys.es/desarrolladores-inicio/documentacion-operativa/autorizacion/`
- Firma HMAC SHA-512: `https://pagosonline.redsys.es/desarrolladores-inicio/documentacion-operativa/firmar-una-operacion/`
