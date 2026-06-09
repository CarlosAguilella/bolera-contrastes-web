const crypto = require("crypto");

const SIGNATURE_VERSION = "HMAC_SHA256_V1";
const CURRENCY_EUR = "978";
const TRANSACTION_AUTHORIZATION = "0";

const REDSYS_URLS = {
  test: "https://sis-t.redsys.es:25443/sis/realizarPago",
  prod: "https://sis.redsys.es/sis/realizarPago",
};

const MENU_ITEMS = {
  p1: { id: "p1", name: "Croquetas de la abuela", priceCents: 750 },
  p2: { id: "p2", name: "Patatas bravas", priceCents: 650 },
  p3: { id: "p3", name: "Tabla ibérica", priceCents: 1450 },
  p4: { id: "p4", name: "Calamares a la andaluza", priceCents: 950 },
  p5: { id: "p5", name: "Ensaladilla rusa", priceCents: 700 },
  p6: { id: "p6", name: "Hummus con verduras", priceCents: 650 },
  b1: { id: "b1", name: "Tosta de salmón", priceCents: 850 },
  b2: { id: "b2", name: "Bocadillo de calamares", priceCents: 750 },
  b3: { id: "b3", name: "Bikini trufado", priceCents: 650 },
  b4: { id: "b4", name: "Tosta vegana", priceCents: 700 },
  h1: { id: "h1", name: "Smash Contrastes", priceCents: 1250 },
  h2: { id: "h2", name: "Crispy Chicken", priceCents: 1150 },
  h3: { id: "h3", name: "Veggie Beet", priceCents: 1100 },
  t1: { id: "t1", name: "Paella valenciana", priceCents: 1500 },
  t2: { id: "t2", name: "Fideuà de marisco", priceCents: 1600 },
  t3: { id: "t3", name: "Tacos al pastor", priceCents: 950 },
  t4: { id: "t4", name: "Pizza margherita", priceCents: 1000 },
  e1: { id: "e1", name: "César de pollo", priceCents: 1050 },
  e2: { id: "e2", name: "Burrata y tomate", priceCents: 1100 },
  d1: { id: "d1", name: "Tostada con tomate", priceCents: 350 },
  d2: { id: "d2", name: "Bowl de açaí", priceCents: 750 },
  d3: { id: "d3", name: "Huevos benedict", priceCents: 900 },
  c1: { id: "c1", name: "Café solo", priceCents: 150 },
  c2: { id: "c2", name: "Flat white", priceCents: 280 },
  c3: { id: "c3", name: "Matcha latte", priceCents: 400 },
  cv1: { id: "cv1", name: "Caña de tirador", priceCents: 220 },
  cv2: { id: "cv2", name: "IPA local 'Onda'", priceCents: 450 },
  cv3: { id: "cv3", name: "Gin tonic premium", priceCents: 850 },
  cv4: { id: "cv4", name: "Spritz Aperol", priceCents: 700 },
  po1: { id: "po1", name: "Coulant de chocolate", priceCents: 550 },
  po2: { id: "po2", name: "Tarta de queso", priceCents: 480 },
};

function cleanText(value, maxLength = 160) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getBaseUrl(req) {
  const configured = cleanText(process.env.REDSYS_PUBLIC_BASE_URL || "", 240);
  if (configured) return configured.replace(/\/+$/, "");
  const host = cleanText(req.headers.host || "", 160);
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function getRedsysPaymentUrl() {
  const environment = String(process.env.REDSYS_ENV || "test").toLowerCase() === "prod" ? "prod" : "test";
  return REDSYS_URLS[environment];
}

function getRedsysConfig() {
  const config = {
    merchantCode: cleanText(process.env.REDSYS_MERCHANT_CODE || "", 9),
    terminal: cleanText(process.env.REDSYS_TERMINAL || "1", 3),
    secretKey: String(process.env.REDSYS_SECRET_KEY || "").trim(),
    merchantName: cleanText(process.env.REDSYS_MERCHANT_NAME || "Bolera Contrastes", 25),
    payMethods: cleanText(process.env.REDSYS_PAY_METHODS || "", 16).toUpperCase(),
    confirmationWebhookUrl: cleanText(process.env.REDSYS_CONFIRMATION_WEBHOOK_URL || "", 500),
    notificationEmail: cleanText(process.env.REDSYS_NOTIFICATION_EMAIL || "caguilellat14@gmail.com", 200),
    resendApiKey: String(process.env.RESEND_API_KEY || "").trim(),
    emailFrom: cleanText(process.env.RESEND_FROM || "Bolera Contrastes <onboarding@resend.dev>", 200),
  };

  const missing = [];
  if (!config.merchantCode) missing.push("REDSYS_MERCHANT_CODE");
  if (!config.terminal) missing.push("REDSYS_TERMINAL");
  if (!config.secretKey) missing.push("REDSYS_SECRET_KEY");

  return { config, missing };
}

function base64Encode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return buffer.toString("base64");
}

function base64UrlEncode(value) {
  return base64Encode(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToString(value) {
  const normalised = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function createMerchantParameters(params) {
  return base64UrlEncode(JSON.stringify(params));
}

function decodeMerchantParameters(merchantParameters) {
  return JSON.parse(base64UrlDecodeToString(merchantParameters));
}

function decodeRedsysKey(secretKey) {
  try {
    return Buffer.from(String(secretKey).replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch (error) {
    return Buffer.from(String(secretKey), "utf8");
  }
}

function diversifyOperationKey(orderId, secretKey) {
  const key = decodeRedsysKey(secretKey);
  const orderBuffer = Buffer.from(String(orderId), "utf8");
  const padLength = (8 - (orderBuffer.length % 8)) % 8;
  const paddedOrder = padLength ? Buffer.concat([orderBuffer, Buffer.alloc(padLength, 0)]) : orderBuffer;
  const iv = Buffer.alloc(8, 0);
  const cipher = crypto.createCipheriv("des-ede3-cbc", key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(paddedOrder), cipher.final()]);
}

function signMerchantParameters(merchantParameters, orderId, secretKey) {
  const operationKey = diversifyOperationKey(orderId, secretKey);
  return base64UrlEncode(crypto.createHmac("sha256", operationKey).update(merchantParameters, "utf8").digest());
}

function normalizeSignature(signature) {
  return String(signature || "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/g, "");
}

function verifySignature(receivedSignature, merchantParameters, orderId, secretKey) {
  const expectedSignature = signMerchantParameters(merchantParameters, orderId, secretKey);
  const received = Buffer.from(normalizeSignature(receivedSignature), "utf8");
  const expected = Buffer.from(normalizeSignature(expectedSignature), "utf8");
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

function getParam(params, ...keys) {
  const entries = Object.entries(params || {});
  for (const key of keys) {
    const exact = params?.[key];
    if (exact !== undefined && exact !== null) return exact;
    const found = entries.find(([entryKey]) => entryKey.toLowerCase() === key.toLowerCase());
    if (found) return found[1];
  }
  return "";
}

function generateOrderId() {
  const timePart = String(Date.now()).slice(-7);
  const randomPart = String(crypto.randomInt(0, 10000)).padStart(4, "0");
  return `${crypto.randomInt(1, 10)}${timePart}${randomPart}`;
}

function validateAndPriceCart(rawCart) {
  if (!Array.isArray(rawCart) || rawCart.length === 0) {
    throw Object.assign(new Error("El carrito está vacío."), { statusCode: 400 });
  }

  const quantities = new Map();
  rawCart.forEach((line) => {
    const id = cleanText(line?.id, 16);
    const qty = Number(line?.qty);
    if (!MENU_ITEMS[id] || !Number.isInteger(qty) || qty < 1 || qty > 20) {
      throw Object.assign(new Error("El pedido contiene artículos no válidos."), { statusCode: 400 });
    }
    quantities.set(id, (quantities.get(id) || 0) + qty);
  });

  if (Array.from(quantities.values()).some((qty) => qty > 20)) {
    throw Object.assign(new Error("El pedido contiene demasiadas unidades de un artículo."), { statusCode: 400 });
  }

  if (quantities.size > 25) {
    throw Object.assign(new Error("El pedido tiene demasiados artículos."), { statusCode: 400 });
  }

  const lines = Array.from(quantities.entries()).map(([id, qty]) => {
    const item = MENU_ITEMS[id];
    return {
      id,
      name: item.name,
      qty,
      unitPriceCents: item.priceCents,
      subtotalCents: item.priceCents * qty,
    };
  });
  const totalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);

  if (totalCents < 100) {
    throw Object.assign(new Error("El importe mínimo del pedido es 1 €."), { statusCode: 400 });
  }
  if (totalCents > 50000) {
    throw Object.assign(new Error("El importe máximo por pedido online es 500 €."), { statusCode: 400 });
  }

  return { lines, totalCents };
}

function buildMerchantData(order) {
  const compact = {
    v: 1,
    orderId: order.orderId,
    totalCents: order.totalCents,
    customer: order.customer,
    pickupTime: order.pickupTime,
    notes: order.notes,
    items: order.lines.map((line) => [line.id, line.qty]),
  };
  const encoded = base64UrlEncode(JSON.stringify(compact));
  if (encoded.length > 1024) {
    throw Object.assign(new Error("El pedido es demasiado largo para enviarlo a Redsys."), { statusCode: 400 });
  }
  return encoded;
}

function decodeMerchantData(value) {
  if (!value) return null;
  try {
    return JSON.parse(base64UrlDecodeToString(value));
  } catch (error) {
    return null;
  }
}

function buildRedsysPayment(order, req) {
  const { config, missing } = getRedsysConfig();
  if (missing.length) {
    const error = new Error(`Faltan variables de Redsys en Vercel: ${missing.join(", ")}.`);
    error.statusCode = 503;
    throw error;
  }

  const baseUrl = getBaseUrl(req);
  const productDescription = order.lines
    .slice(0, 4)
    .map((line) => `${line.qty}x ${line.name}`)
    .join(", ")
    .slice(0, 125);

  const params = {
    DS_MERCHANT_AMOUNT: String(order.totalCents),
    DS_MERCHANT_CURRENCY: CURRENCY_EUR,
    DS_MERCHANT_ORDER: order.orderId,
    DS_MERCHANT_MERCHANTCODE: config.merchantCode,
    DS_MERCHANT_TERMINAL: config.terminal,
    DS_MERCHANT_TRANSACTIONTYPE: TRANSACTION_AUTHORIZATION,
    DS_MERCHANT_MERCHANTURL: `${baseUrl}/api/redsys-notification`,
    DS_MERCHANT_URLOK: `${baseUrl}/redsys-ok`,
    DS_MERCHANT_URLKO: `${baseUrl}/redsys-ko`,
    DS_MERCHANT_PRODUCTDESCRIPTION: productDescription || "Pedido online Bolera Contrastes",
    DS_MERCHANT_TITULAR: cleanText(order.customer.name, 60),
    DS_MERCHANT_MERCHANTDATA: buildMerchantData(order),
  };

  if (config.merchantName) params.DS_MERCHANT_MERCHANTNAME = config.merchantName;
  if (config.payMethods) params.DS_MERCHANT_PAYMETHODS = config.payMethods;

  const merchantParameters = createMerchantParameters(params);
  const signature = signMerchantParameters(merchantParameters, order.orderId, config.secretKey);

  return {
    paymentUrl: getRedsysPaymentUrl(),
    fields: {
      Ds_SignatureVersion: SIGNATURE_VERSION,
      Ds_MerchantParameters: merchantParameters,
      Ds_Signature: signature,
    },
  };
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") {
    return parseBodyString(req.body, req.headers["content-type"] || "");
  }
  if (Buffer.isBuffer(req.body)) {
    return parseBodyString(req.body.toString("utf8"), req.headers["content-type"] || "");
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return parseBodyString(raw, req.headers["content-type"] || "");
}

function parseBodyString(raw, contentType) {
  if (!raw) return {};
  if (String(contentType).includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function isAuthorisedResponse(params) {
  const response = String(getParam(params, "Ds_Response", "DS_RESPONSE")).padStart(4, "0");
  const responseCode = Number.parseInt(response, 10);
  return Number.isFinite(responseCode) && responseCode >= 0 && responseCode <= 99;
}

function buildWebhookPayload(params, merchantData, authorised) {
  return {
    source: "redsys",
    authorised,
    orderId: getParam(params, "Ds_Order", "DS_ORDER", "Ds_Merchant_Order", "DS_MERCHANT_ORDER"),
    response: getParam(params, "Ds_Response", "DS_RESPONSE"),
    amountCents: Number.parseInt(getParam(params, "Ds_Amount", "DS_AMOUNT") || "0", 10),
    currency: getParam(params, "Ds_Currency", "DS_CURRENCY"),
    authorisationCode: getParam(params, "Ds_AuthorisationCode", "DS_AUTHORISATIONCODE"),
    cardCountry: getParam(params, "Ds_Card_Country", "DS_CARD_COUNTRY"),
    merchantData,
    receivedAt: new Date().toISOString(),
  };
}

function formatEuros(cents) {
  const value = Number(cents || 0) / 100;
  return `${value.toFixed(2).replace(".", ",")} €`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getOrderLinesFromMerchantData(merchantData) {
  if (!Array.isArray(merchantData?.items)) return [];
  return merchantData.items
    .map(([id, qty]) => {
      const item = MENU_ITEMS[id];
      if (!item) return null;
      return {
        id,
        name: item.name,
        qty: Number(qty || 0),
        subtotalCents: item.priceCents * Number(qty || 0),
      };
    })
    .filter(Boolean);
}

function buildPaidOrderEmail(payload) {
  const merchantData = payload.merchantData || {};
  const customer = merchantData.customer || {};
  const lines = getOrderLinesFromMerchantData(merchantData);
  const amount = formatEuros(payload.amountCents || merchantData.totalCents);
  const itemText = lines.length
    ? lines.map((line) => `- ${line.qty} x ${line.name} — ${formatEuros(line.subtotalCents)}`).join("\n")
    : "- Sin detalle de artículos";
  const safeRows = [
    ["Pedido", payload.orderId],
    ["Importe", amount],
    ["Cliente", customer.name],
    ["Teléfono", customer.phone],
    ["Recogida", merchantData.pickupTime],
    ["Autorización", payload.authorisationCode],
    ["Respuesta Redsys", payload.response],
  ];

  const text = [
    "Nuevo pedido pagado en Bolera Contrastes.",
    "",
    `Pedido: ${payload.orderId || "—"}`,
    `Importe: ${amount}`,
    `Cliente: ${customer.name || "—"}`,
    `Teléfono: ${customer.phone || "—"}`,
    `Recogida: ${merchantData.pickupTime || "—"}`,
    "",
    "Productos:",
    itemText,
    "",
    `Notas: ${merchantData.notes || "—"}`,
    `Autorización Redsys: ${payload.authorisationCode || "—"}`,
    `Fecha: ${payload.receivedAt || new Date().toISOString()}`,
  ].join("\n");

  const htmlRows = safeRows
    .map(([label, value]) => (
      `<tr><td style="padding:8px 12px;color:#6b6259;border-bottom:1px solid #eee;">${escapeHtml(label)}</td>` +
      `<td style="padding:8px 12px;border-bottom:1px solid #eee;"><strong>${escapeHtml(value || "—")}</strong></td></tr>`
    ))
    .join("");
  const htmlItems = lines.length
    ? lines.map((line) => `<li>${escapeHtml(line.qty)} x ${escapeHtml(line.name)} — ${escapeHtml(formatEuros(line.subtotalCents))}</li>`).join("")
    : "<li>Sin detalle de artículos</li>";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1B1814;max-width:680px;">
      <h1 style="margin:0 0 12px;">Pedido pagado</h1>
      <p style="margin:0 0 18px;">Redsys ha confirmado un pago correcto para recogida en Bolera Contrastes.</p>
      <table style="border-collapse:collapse;width:100%;background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden;">${htmlRows}</table>
      <h2 style="font-size:18px;margin:22px 0 8px;">Productos</h2>
      <ul>${htmlItems}</ul>
      <h2 style="font-size:18px;margin:22px 0 8px;">Notas</h2>
      <p>${escapeHtml(merchantData.notes || "—")}</p>
    </div>
  `;

  return {
    subject: `Pedido pagado #${payload.orderId || "—"} — ${amount}`,
    text,
    html,
  };
}

async function sendPaidOrderEmail(config, payload) {
  if (!config.resendApiKey) return { sent: false, reason: "missing RESEND_API_KEY" };
  if (!config.notificationEmail) return { sent: false, reason: "missing REDSYS_NOTIFICATION_EMAIL" };

  const email = buildPaidOrderEmail(payload);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `bolera-redsys-${payload.orderId || "sin-pedido"}`,
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: config.notificationEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    const error = new Error("Pago verificado, pero no se pudo enviar el email de aviso.");
    error.statusCode = 502;
    error.details = details.slice(0, 500);
    throw error;
  }

  return { sent: true };
}

module.exports = {
  SIGNATURE_VERSION,
  buildRedsysPayment,
  cleanText,
  decodeMerchantData,
  decodeMerchantParameters,
  generateOrderId,
  getParam,
  getRedsysConfig,
  isAuthorisedResponse,
  readRequestBody,
  validateAndPriceCart,
  verifySignature,
  buildWebhookPayload,
  sendPaidOrderEmail,
};
