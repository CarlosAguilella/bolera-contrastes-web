const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DEFAULT_KITCHEN_PIN = "";
let cachedMenuItems = null;

function cleanText(value, maxLength = 300) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getKitchenConfig() {
  return {
    pin: cleanText(process.env.KITCHEN_PIN || DEFAULT_KITCHEN_PIN, 60),
    supabaseUrl: cleanText(process.env.SUPABASE_URL || "", 500).replace(/\/+$/, ""),
    supabaseServiceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    table: cleanText(process.env.KITCHEN_ORDERS_TABLE || "kitchen_orders", 80),
  };
}

function isKitchenStorageConfigured(config = getKitchenConfig()) {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey && config.table);
}

function requireKitchenAccess(req) {
  const config = getKitchenConfig();
  const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
  const receivedPin = cleanText(
    req.headers["x-kitchen-pin"] || req.headers["x-admin-pin"] || url.searchParams.get("pin") || "",
    60
  );

  if (!config.pin || receivedPin !== config.pin) {
    const error = new Error("PIN de cocina no válido.");
    error.statusCode = 401;
    throw error;
  }

  return config;
}

function formatEuros(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")} €`;
}

function loadMenuItems() {
  if (cachedMenuItems) return cachedMenuItems;

  try {
    const dataPath = path.join(__dirname, "..", "data.js");
    const source = fs.readFileSync(dataPath, "utf8");
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: "data.js", timeout: 1000 });

    cachedMenuItems = Object.fromEntries(
      (sandbox.window.BC_MENU || []).map((item) => [
        item.id,
        {
          id: item.id,
          name: cleanText(item.name, 120),
          priceCents: Math.round(Number(item.price || 0) * 100),
        },
      ])
    );
  } catch (error) {
    cachedMenuItems = {};
  }

  return cachedMenuItems;
}

function normaliseLine(line) {
  const menuItems = loadMenuItems();
  const source = Array.isArray(line) ? { id: line[0], qty: line[1] } : line || {};
  const id = cleanText(source.id, 40);
  const qty = Number(source.qty || 0);
  const menuItem = menuItems[id] || {};
  const unitPriceCents = Number(source.unitPriceCents || source.unit_price_cents || menuItem.priceCents || 0);
  const subtotalCents = Number(source.subtotalCents || source.subtotal_cents || unitPriceCents * qty || 0);

  return {
    id,
    name: cleanText(source.name || menuItem.name || id || "Producto", 120),
    qty,
    unitPriceCents,
    subtotalCents,
  };
}

function getOrderLines(merchantData) {
  if (Array.isArray(merchantData?.lines)) return merchantData.lines.map(normaliseLine);
  if (!Array.isArray(merchantData?.items)) return [];
  return merchantData.items.map(normaliseLine).filter((line) => line.id && line.qty > 0);
}

function buildKitchenOrderFromPayment(payload, status = "paid") {
  const merchantData = payload.merchantData || {};
  const delivery = merchantData.delivery || {};
  const customer = merchantData.customer || {};

  return {
    order_id: cleanText(payload.orderId || merchantData.orderId, 40),
    status,
    source: cleanText(payload.source || "redsys", 40),
    payment_status: payload.authorised ? "paid" : status === "pending_payment" ? "pending" : "failed",
    amount_cents: Number(payload.amountCents || merchantData.totalCents || 0),
    subtotal_cents: Number(merchantData.subtotalCents || payload.amountCents || 0),
    delivery_fee_cents: Number(merchantData.deliveryFeeCents || 0),
    customer_name: cleanText(customer.name, 120),
    customer_phone: cleanText(customer.phone, 40),
    customer_email: cleanText(customer.email, 200),
    delivery_method: cleanText(delivery.method || "pickup", 40),
    delivery_detail: cleanText(delivery.method === "delivery" ? delivery.address : delivery.pickupTime || "Lo antes posible", 300),
    notes: cleanText(merchantData.notes, 500),
    items: getOrderLines(merchantData),
    raw_payload: payload,
    paid_at: payload.authorised ? new Date().toISOString() : null,
  };
}

function buildKitchenOrderFromCreatedOrder(order, payment) {
  return {
    order_id: cleanText(order.orderId, 40),
    status: payment?.provider === "demo" ? "pending_payment" : "created",
    source: cleanText(payment?.provider || "redsys", 40),
    payment_status: payment?.provider === "demo" ? "pending" : "created",
    amount_cents: Number(order.totalCents || 0),
    subtotal_cents: Number(order.subtotalCents || 0),
    delivery_fee_cents: Number(order.deliveryFeeCents || 0),
    customer_name: cleanText(order.customer?.name, 120),
    customer_phone: cleanText(order.customer?.phone, 40),
    customer_email: cleanText(order.customer?.email, 200),
    delivery_method: cleanText(order.delivery?.method || "pickup", 40),
    delivery_detail: cleanText(order.delivery?.method === "delivery" ? order.delivery?.address : order.delivery?.pickupTime || "Lo antes posible", 300),
    notes: cleanText(order.notes, 500),
    items: order.lines || [],
    raw_payload: { order, payment },
    paid_at: null,
  };
}

async function supabaseRequest(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (error) {
    body = { message: text };
  }
  if (!response.ok) {
    const error = new Error(body?.message || body?.hint || "No se pudo acceder al almacenamiento de cocina.");
    error.statusCode = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

async function saveKitchenOrder(order) {
  const config = getKitchenConfig();
  if (!isKitchenStorageConfigured(config)) {
    return { saved: false, reason: "missing Supabase kitchen storage config" };
  }

  const payload = {
    ...order,
    updated_at: new Date().toISOString(),
  };

  await supabaseRequest(config, `${config.table}?on_conflict=order_id`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return { saved: true };
}

async function listKitchenOrders(config, limit = 40) {
  if (!isKitchenStorageConfigured(config)) {
    return { storageConfigured: false, orders: [] };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const orders = await supabaseRequest(
    config,
    `${config.table}?select=*&order=created_at.desc&limit=${safeLimit}`,
    { method: "GET" }
  );
  return { storageConfigured: true, orders: Array.isArray(orders) ? orders : [] };
}

async function updateKitchenOrder(config, orderId, status) {
  if (!isKitchenStorageConfigured(config)) {
    const error = new Error("El almacenamiento de cocina no está configurado.");
    error.statusCode = 503;
    throw error;
  }

  const allowed = new Set(["paid", "accepted", "preparing", "ready", "completed", "cancelled", "refunded", "pending_payment"]);
  const nextStatus = cleanText(status, 40);
  if (!allowed.has(nextStatus)) {
    const error = new Error("Estado de pedido no válido.");
    error.statusCode = 400;
    throw error;
  }

  const orders = await supabaseRequest(
    config,
    `${config.table}?order_id=eq.${encodeURIComponent(orderId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  const order = Array.isArray(orders) ? orders[0] : orders;
  if (!order) {
    const error = new Error("Pedido no encontrado.");
    error.statusCode = 404;
    throw error;
  }

  return order;
}

module.exports = {
  buildKitchenOrderFromCreatedOrder,
  buildKitchenOrderFromPayment,
  formatEuros,
  getKitchenConfig,
  isKitchenStorageConfigured,
  listKitchenOrders,
  requireKitchenAccess,
  saveKitchenOrder,
  updateKitchenOrder,
};
