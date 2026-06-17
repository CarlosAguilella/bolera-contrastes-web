const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const tls = require("tls");
const vm = require("vm");

const SIGNATURE_VERSION = "HMAC_SHA256_V1";
const CURRENCY_EUR = "978";
const TRANSACTION_AUTHORIZATION = "0";
const DELIVERY_FEE_CENTS = 250;
const DELIVERY_METHODS = new Set(["pickup", "delivery"]);
const PAYMENT_METHODS = new Set(["redsys"]);
const DEFAULT_DELIVERY_MINIMUM_CENTS = 0;

const REDSYS_URLS = {
  test: "https://sis-t.redsys.es:25443/sis/realizarPago",
  prod: "https://sis.redsys.es/sis/realizarPago",
};

function loadMenuItems() {
  const dataPath = path.join(__dirname, "..", "data.js");
  const source = fs.readFileSync(dataPath, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "data.js", timeout: 1000 });

  if (!Array.isArray(sandbox.window.BC_MENU)) {
    throw new Error("No se pudo cargar la carta desde data.js.");
  }

  return Object.fromEntries(
    sandbox.window.BC_MENU.map((item) => [
      item.id,
      {
        id: item.id,
        name: cleanText(item.name, 80),
        priceCents: Math.round(Number(item.price || 0) * 100),
      },
    ])
  );
}

const MENU_ITEMS = loadMenuItems();

function cleanText(value, maxLength = 160) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getOrderRules() {
  return {
    ordersEnabled: String(process.env.DELIVERY_ORDERS_ENABLED || "true").toLowerCase() !== "false",
    deliveryMinimumCents: parsePositiveInteger(process.env.DELIVERY_MINIMUM_CENTS, DEFAULT_DELIVERY_MINIMUM_CENTS),
    allowedDeliveryZones: String(process.env.DELIVERY_ALLOWED_ZONES || "")
      .split(",")
      .map((zone) => cleanText(zone, 80).toLowerCase())
      .filter(Boolean),
  };
}

function ensureOrdersEnabled() {
  const rules = getOrderRules();
  if (!rules.ordersEnabled) {
    throw Object.assign(new Error("Los pedidos online no están disponibles en este momento."), { statusCode: 503 });
  }
}

function isValidEmail(value) {
  const email = cleanText(value, 200);
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateCustomer(rawCustomer) {
  const customer = {
    name: cleanText(rawCustomer?.name, 80),
    phone: cleanText(rawCustomer?.phone, 30),
    email: cleanText(rawCustomer?.email, 200),
  };

  if (customer.name.length < 2 || customer.phone.replace(/\D/g, "").length < 6) {
    throw Object.assign(new Error("Indica nombre y teléfono para preparar el pedido."), { statusCode: 400 });
  }

  if (!isValidEmail(customer.email)) {
    throw Object.assign(new Error("El email no tiene un formato válido."), { statusCode: 400 });
  }

  return customer;
}

function validateDelivery(rawDelivery) {
  const rules = getOrderRules();
  const method = cleanText(rawDelivery?.method || "pickup", 20);
  if (!DELIVERY_METHODS.has(method)) {
    throw Object.assign(new Error("El método de entrega no es válido."), { statusCode: 400 });
  }

  const delivery = {
    method,
    address: cleanText(rawDelivery?.address || "", 240),
    pickupTime: cleanText(rawDelivery?.pickupTime || "Lo antes posible", 40),
  };

  if (delivery.method === "delivery" && delivery.address.length < 8) {
    throw Object.assign(new Error("Indica una dirección completa para entrega a domicilio."), { statusCode: 400 });
  }

  if (
    delivery.method === "delivery" &&
    rules.allowedDeliveryZones.length &&
    !rules.allowedDeliveryZones.some((zone) => delivery.address.toLowerCase().includes(zone))
  ) {
    throw Object.assign(new Error("La dirección no está dentro de la zona de reparto configurada."), { statusCode: 400 });
  }

  if (delivery.method === "pickup") {
    delivery.address = "";
  }

  return delivery;
}

function validatePaymentMethod(value) {
  const paymentMethod = cleanText(value || "redsys", 20);
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    throw Object.assign(new Error("El método de pago no es válido."), { statusCode: 400 });
  }
  return paymentMethod;
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
    confirmationWebhookUrl: cleanText(process.env.REDSYS_CONFIRMATION_WEBHOOK_URL || "", 500),
    notificationEmail: cleanText(process.env.REDSYS_NOTIFICATION_EMAIL || "caguilellat14@gmail.com", 200),
    emailProvider: cleanText(process.env.EMAIL_PROVIDER || "auto", 20).toLowerCase(),
    resendApiKey: String(process.env.RESEND_API_KEY || "").trim(),
    emailFrom: cleanText(process.env.RESEND_FROM || "Bolera Contrastes <onboarding@resend.dev>", 200),
    gmailUser: cleanText(process.env.GMAIL_USER || "", 200),
    gmailAppPassword: String(process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "").trim(),
    gmailFrom: cleanText(process.env.GMAIL_FROM || "", 200),
    whatsappAccessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim(),
    whatsappPhoneNumberId: cleanText(process.env.WHATSAPP_PHONE_NUMBER_ID || "", 80),
    whatsappKitchenTo: cleanText(process.env.WHATSAPP_KITCHEN_TO || "", 30).replace(/\D/g, ""),
    whatsappGraphVersion: cleanText(process.env.WHATSAPP_GRAPH_VERSION || "v23.0", 20),
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
  return base64Encode(JSON.stringify(params));
}

function decodeMerchantParameters(merchantParameters) {
  return JSON.parse(base64UrlDecodeToString(merchantParameters));
}

function normalizeSecretKey(secretKey) {
  const decoded = Buffer.from(String(secretKey || "").trim(), "base64");
  if (decoded.length === 24) return decoded;

  const raw = Buffer.from(String(secretKey || ""), "utf8");
  if (raw.length >= 24) return raw.subarray(0, 24);
  return Buffer.concat([raw, Buffer.alloc(24 - raw.length, 0)]);
}

function zeroPadOrderId(orderId) {
  const order = Buffer.from(String(orderId), "utf8");
  const remainder = order.length % 8;
  if (remainder === 0) return order;
  return Buffer.concat([order, Buffer.alloc(8 - remainder, 0)]);
}

function diversifyOperationKey(orderId, secretKey) {
  const key = normalizeSecretKey(secretKey);
  const iv = Buffer.alloc(8, 0);
  const cipher = crypto.createCipheriv("des-ede3-cbc", key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(zeroPadOrderId(orderId)), cipher.final()]);
}

function signMerchantParameters(merchantParameters, orderId, secretKey) {
  const operationKey = diversifyOperationKey(orderId, secretKey);
  return base64Encode(crypto.createHmac("sha256", operationKey).update(merchantParameters, "utf8").digest());
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

function validateAndPriceCart(rawCart, deliveryMethod = "pickup") {
  const rules = getOrderRules();
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
  const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const deliveryFeeCents = deliveryMethod === "delivery" && subtotalCents > 0 ? DELIVERY_FEE_CENTS : 0;
  const totalCents = subtotalCents + deliveryFeeCents;

  if (deliveryMethod === "delivery" && subtotalCents < rules.deliveryMinimumCents) {
    throw Object.assign(
      new Error(`El pedido mínimo para entrega a domicilio es ${formatEuros(rules.deliveryMinimumCents)}.`),
      { statusCode: 400 }
    );
  }

  if (totalCents < 100) {
    throw Object.assign(new Error("El importe mínimo del pedido es 1 €."), { statusCode: 400 });
  }
  if (totalCents > 50000) {
    throw Object.assign(new Error("El importe máximo por pedido online es 500 €."), { statusCode: 400 });
  }

  return { lines, subtotalCents, deliveryFeeCents, totalCents };
}

function buildMerchantData(order) {
  const compact = {
    v: 2,
    o: order.orderId,
    tc: order.totalCents,
    sc: order.subtotalCents,
    df: order.deliveryFeeCents,
    c: {
      n: cleanText(order.customer.name, 60),
      p: cleanText(order.customer.phone, 24),
      e: cleanText(order.customer.email, 120),
    },
    d: {
      m: order.delivery.method,
      a: cleanText(order.delivery.address, 140),
      t: cleanText(order.delivery.pickupTime, 40),
    },
    pm: order.paymentMethod,
    n: cleanText(order.notes, 160),
    i: order.lines.map((line) => [line.id, line.qty]),
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
    const decoded = JSON.parse(base64UrlDecodeToString(value));
    if (decoded?.v === 2) {
      return {
        v: 2,
        orderId: decoded.o,
        totalCents: decoded.tc,
        subtotalCents: decoded.sc,
        deliveryFeeCents: decoded.df,
        customer: {
          name: decoded.c?.n || "",
          phone: decoded.c?.p || "",
          email: decoded.c?.e || "",
        },
        delivery: {
          method: decoded.d?.m || "pickup",
          address: decoded.d?.a || "",
          pickupTime: decoded.d?.t || "Lo antes posible",
        },
        paymentMethod: decoded.pm || "redsys",
        notes: decoded.n || "",
        items: decoded.i || [],
      };
    }
    return decoded;
  } catch (error) {
    return null;
  }
}

function buildDemoPayment(order, req) {
  const baseUrl = getBaseUrl(req);
  return {
    provider: "demo",
    status: "demo",
    redirectUrl: `${baseUrl}/pedido-pendiente?demo=1&order=${encodeURIComponent(order.orderId)}`,
    fields: null,
    paymentUrl: null,
  };
}

function getDeliveryPaymentMode(missing) {
  const mode = cleanText(process.env.DELIVERY_PAYMENT_MODE || "auto", 20).toLowerCase();
  const environment = String(process.env.REDSYS_ENV || "test").toLowerCase() === "prod" ? "prod" : "test";
  const productionReady = String(process.env.REDSYS_PRODUCTION_READY || "").toLowerCase() === "true";

  if (mode === "demo") return "demo";
  if (environment === "prod" && !productionReady) return "demo";
  if (mode === "auto" && missing.length) return "demo";
  if (mode === "redsys") return "redsys";
  if (mode === "auto") return "redsys";

  return "redsys";
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
  const merchantParameters = createMerchantParameters(params);
  const signature = signMerchantParameters(merchantParameters, order.orderId, config.secretKey);

  return {
    provider: "redsys",
    paymentUrl: getRedsysPaymentUrl(),
    fields: {
      Ds_SignatureVersion: SIGNATURE_VERSION,
      Ds_MerchantParameters: merchantParameters,
      Ds_Signature: signature,
    },
  };
}

function buildOrderPayment(order, req) {
  const { missing } = getRedsysConfig();
  const mode = getDeliveryPaymentMode(missing);
  if (mode === "demo") return buildDemoPayment(order, req);
  return buildRedsysPayment(order, req);
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

function describeDelivery(merchantData) {
  const delivery = merchantData?.delivery || {};
  if (delivery.method === "delivery") {
    return {
      label: "Entrega a domicilio",
      detail: delivery.address || "Dirección no indicada",
    };
  }
  return {
    label: "Recogida en local",
    detail: delivery.pickupTime || merchantData?.pickupTime || "Lo antes posible",
  };
}

function buildPaidOrderEmail(payload) {
  const merchantData = payload.merchantData || {};
  const customer = merchantData.customer || {};
  const lines = getOrderLinesFromMerchantData(merchantData);
  const delivery = describeDelivery(merchantData);
  const amount = formatEuros(payload.amountCents || merchantData.totalCents);
  const subtotal = formatEuros(merchantData.subtotalCents || payload.amountCents || 0);
  const deliveryFee = formatEuros(merchantData.deliveryFeeCents || 0);
  const itemText = lines.length
    ? lines.map((line) => `- ${line.qty} x ${line.name} — ${formatEuros(line.subtotalCents)}`).join("\n")
    : "- Sin detalle de artículos";
  const safeRows = [
    ["Pedido", payload.orderId],
    ["Importe", amount],
    ["Subtotal", subtotal],
    ["Gastos entrega", deliveryFee],
    ["Cliente", customer.name],
    ["Teléfono", customer.phone],
    ["Email", customer.email],
    ["Entrega", delivery.label],
    ["Detalle entrega", delivery.detail],
    ["Autorización", payload.authorisationCode],
    ["Respuesta Redsys", payload.response],
  ];

  const text = [
    "Nuevo pedido pagado en Bolera Contrastes.",
    "",
    `Pedido: ${payload.orderId || "—"}`,
    `Importe: ${amount}`,
    `Subtotal: ${subtotal}`,
    `Gastos entrega: ${deliveryFee}`,
    `Cliente: ${customer.name || "—"}`,
    `Teléfono: ${customer.phone || "—"}`,
    `Email: ${customer.email || "—"}`,
    `Entrega: ${delivery.label}`,
    `Detalle entrega: ${delivery.detail}`,
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
      <p style="margin:0 0 18px;">Redsys ha confirmado un pago correcto para un pedido online de Bolera Contrastes.</p>
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

function buildKitchenOrderMessage(payload) {
  const merchantData = payload.merchantData || {};
  const customer = merchantData.customer || {};
  const lines = getOrderLinesFromMerchantData(merchantData);
  const delivery = describeDelivery(merchantData);
  const amount = formatEuros(payload.amountCents || merchantData.totalCents);
  const subtotal = formatEuros(merchantData.subtotalCents || payload.amountCents || 0);
  const deliveryFee = formatEuros(merchantData.deliveryFeeCents || 0);
  const itemText = lines.length
    ? lines.map((line) => `• ${line.qty} x ${line.name} — ${formatEuros(line.subtotalCents)}`).join("\n")
    : "• Sin detalle de artículos";

  return [
    "🔔 Pedido pagado — Bolera Contrastes",
    "",
    `Pedido: #${payload.orderId || "—"}`,
    `Importe: ${amount}`,
    `Subtotal: ${subtotal}`,
    `Gastos entrega: ${deliveryFee}`,
    `Cliente: ${customer.name || "—"}`,
    `Teléfono: ${customer.phone || "—"}`,
    `Email: ${customer.email || "—"}`,
    `Entrega: ${delivery.label}`,
    `Detalle entrega: ${delivery.detail}`,
    "",
    "Productos:",
    itemText,
    "",
    `Notas: ${merchantData.notes || "—"}`,
    `Autorización Redsys: ${payload.authorisationCode || "—"}`,
  ].join("\n").slice(0, 3900);
}

async function sendKitchenWhatsApp(config, payload) {
  if (!config.whatsappAccessToken || !config.whatsappPhoneNumberId || !config.whatsappKitchenTo) {
    return { sent: false, reason: "missing WhatsApp Cloud API config" };
  }

  const response = await fetch(
    `https://graph.facebook.com/${config.whatsappGraphVersion}/${config.whatsappPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsappAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: config.whatsappKitchenTo,
        type: "text",
        text: {
          preview_url: false,
          body: buildKitchenOrderMessage(payload),
        },
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    const error = new Error("Pago verificado, pero no se pudo enviar el WhatsApp a cocina.");
    error.statusCode = 502;
    error.details = details.slice(0, 500);
    throw error;
  }

  return { sent: true };
}

function splitEmails(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((email) => cleanText(email, 200))
    .filter(Boolean);
}

function sanitizeHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function encodeMimeHeader(value) {
  const safeValue = sanitizeHeader(value);
  return /[^\x20-\x7E]/.test(safeValue)
    ? `=?UTF-8?B?${Buffer.from(safeValue, "utf8").toString("base64")}?=`
    : safeValue;
}

function createMimeMessage({ from, to, subject, text, html }) {
  const boundary = `bc_${crypto.randomBytes(12).toString("hex")}`;
  const fallbackHtml = `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif;">${escapeHtml(text || "")}</pre>`;
  return [
    `From: ${sanitizeHeader(from)}`,
    `To: ${to.map(sanitizeHeader).join(", ")}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${crypto.randomBytes(8).toString("hex")}@bolera-contrastes-web>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text || "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html || fallbackHtml,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function readSmtpResponse(socket) {
  return new Promise((resolve, reject) => {
    let data = "";
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };
    const onData = (chunk) => {
      data += chunk.toString("utf8");
      const lines = data.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: Number(last.slice(0, 3)), raw: data });
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error("Timeout enviando email por Gmail SMTP."));
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

async function sendSmtpCommand(socket, command, expectedCodes) {
  if (command) socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  if (!expectedCodes.includes(response.code)) {
    const error = new Error("Gmail SMTP rechazó el envío del email.");
    error.details = response.raw.slice(0, 500);
    throw error;
  }
  return response;
}

function connectGmailSmtp() {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: "smtp.gmail.com",
      port: 465,
      servername: "smtp.gmail.com",
    });
    const cleanup = () => {
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error("Timeout conectando con Gmail SMTP."));
    };
    socket.setTimeout(20000);
    socket.once("secureConnect", () => {
      cleanup();
      resolve(socket);
    });
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

async function sendEmailWithGmail(config, email) {
  if (!config.gmailUser || !config.gmailAppPassword) {
    return { sent: false, reason: "missing GMAIL_USER or GMAIL_APP_PASSWORD" };
  }

  const recipients = splitEmails(config.notificationEmail);
  if (!recipients.length) return { sent: false, reason: "missing REDSYS_NOTIFICATION_EMAIL" };

  const from = config.gmailFrom || `Bolera Contrastes <${config.gmailUser}>`;
  const message = createMimeMessage({
    from,
    to: recipients,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  const dotStuffedMessage = message.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  const socket = await connectGmailSmtp();

  try {
    await sendSmtpCommand(socket, null, [220]);
    await sendSmtpCommand(socket, "EHLO bolera-contrastes-web.vercel.app", [250]);
    await sendSmtpCommand(socket, "AUTH LOGIN", [334]);
    await sendSmtpCommand(socket, Buffer.from(config.gmailUser).toString("base64"), [334]);
    await sendSmtpCommand(socket, Buffer.from(config.gmailAppPassword).toString("base64"), [235]);
    await sendSmtpCommand(socket, `MAIL FROM:<${config.gmailUser}>`, [250]);
    for (const recipient of recipients) {
      await sendSmtpCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
    }
    await sendSmtpCommand(socket, "DATA", [354]);
    socket.write(`${dotStuffedMessage}\r\n.\r\n`);
    await sendSmtpCommand(socket, null, [250]);
    await sendSmtpCommand(socket, "QUIT", [221]);
  } finally {
    socket.end();
  }

  return { sent: true, provider: "gmail" };
}

async function sendEmailWithResend(config, email, orderId) {
  if (!config.resendApiKey) return { sent: false, reason: "missing RESEND_API_KEY" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `bolera-redsys-${orderId || "sin-pedido"}`,
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

async function sendPaidOrderEmail(config, payload) {
  if (!config.notificationEmail) return { sent: false, reason: "missing REDSYS_NOTIFICATION_EMAIL" };

  const email = buildPaidOrderEmail(payload);

  if (config.emailProvider === "gmail") return sendEmailWithGmail(config, email);
  if (config.emailProvider === "resend") return sendEmailWithResend(config, email, payload.orderId);
  if (config.gmailUser && config.gmailAppPassword) return sendEmailWithGmail(config, email);
  if (config.resendApiKey) return sendEmailWithResend(config, email, payload.orderId);

  return { sent: false, reason: "missing email provider config" };
}

module.exports = {
  DELIVERY_FEE_CENTS,
  SIGNATURE_VERSION,
  buildOrderPayment,
  buildRedsysPayment,
  cleanText,
  decodeMerchantData,
  decodeMerchantParameters,
  ensureOrdersEnabled,
  generateOrderId,
  getOrderRules,
  getParam,
  getRedsysConfig,
  isAuthorisedResponse,
  readRequestBody,
  validateCustomer,
  validateDelivery,
  validatePaymentMethod,
  validateAndPriceCart,
  verifySignature,
  buildWebhookPayload,
  sendKitchenWhatsApp,
  sendPaidOrderEmail,
};
