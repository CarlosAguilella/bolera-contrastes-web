const {
  audit,
  cleanText,
  getConfig,
  readRequestBody,
  requireConfig,
  requireRoles,
  sendError,
  supabaseRequest,
} = require("./_tpv");

const ORDER_STATUSES = new Set(["open", "sent"]);

function ensureLines(lines, allowEmpty = false) {
  if (!Array.isArray(lines) || (!allowEmpty && !lines.length) || lines.length > 120) {
    throw Object.assign(new Error("La comanda no contiene líneas válidas."), { statusCode: 400 });
  }
  const quantities = new Map();
  lines.forEach((line) => {
    const externalId = cleanText(line.productId, 80);
    const quantity = Number.parseInt(line.qty, 10);
    if (!/^bolera-\d+$/.test(externalId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw Object.assign(new Error("Una línea de la comanda no es válida."), { statusCode: 400 });
    }
    quantities.set(externalId, (quantities.get(externalId) || 0) + quantity);
  });
  return [...quantities.entries()].map(([productId, qty]) => ({ productId, qty }));
}

async function findTable(config, tableNumber) {
  const number = Number.parseInt(String(tableNumber || ""), 10);
  if (!Number.isInteger(number) || number < 1 || number > 999) {
    throw Object.assign(new Error("La mesa no es válida."), { statusCode: 400 });
  }
  const tables = await supabaseRequest(config, `restaurant_tables?table_number=eq.${number}&active=is.true&select=*&limit=1`, { method: "GET" });
  if (!Array.isArray(tables) || !tables[0]) throw Object.assign(new Error("La mesa ya no está disponible."), { statusCode: 404 });
  return tables[0];
}

async function getProductsForLines(config, lines) {
  const ids = lines.map((line) => line.productId);
  const products = await supabaseRequest(
    config,
    `products?external_id=in.(${ids.map(encodeURIComponent).join(",")})&active=is.true&select=id,external_id,name,variant,price_cents,sends_to_kitchen`,
    { method: "GET" }
  );
  const byExternalId = new Map((products || []).map((product) => [product.external_id, product]));
  if (byExternalId.size !== ids.length) throw Object.assign(new Error("Uno de los artículos ya no está disponible."), { statusCode: 409 });
  return lines.map((line) => ({ ...line, product: byExternalId.get(line.productId) }));
}

async function replaceOrderLines(config, orderId, lines, allowEmpty = false) {
  const validLines = ensureLines(lines, allowEmpty);
  const prepared = validLines.length ? await getProductsForLines(config, validLines) : [];
  await supabaseRequest(config, `pos_order_items?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  const items = prepared.map(({ qty, product }) => ({
    order_id: orderId,
    product_id: product.id,
    product_name: product.name,
    variant: product.variant,
    unit_price_cents: product.price_cents,
    quantity: qty,
    line_total_cents: product.price_cents * qty,
    sends_to_kitchen: product.sends_to_kitchen,
  }));
  if (items.length) await supabaseRequest(config, "pos_order_items", { method: "POST", body: JSON.stringify(items), headers: { Prefer: "return=minimal" } });
  return { items, totalCents: items.reduce((sum, item) => sum + item.line_total_cents, 0) };
}

async function getOrder(config, orderId) {
  const orders = await supabaseRequest(
    config,
    `pos_orders?id=eq.${encodeURIComponent(orderId)}&select=*,pos_order_items(*)&limit=1`,
    { method: "GET" }
  );
  if (!Array.isArray(orders) || !orders[0]) throw Object.assign(new Error("Comanda no encontrada."), { statusCode: 404 });
  return orders[0];
}

function kitchenItems(items) {
  return items.filter((item) => item.sends_to_kitchen).map((item) => ({
    productId: item.product_id,
    name: item.product_name,
    variant: item.variant,
    qty: item.quantity,
    unitPriceCents: item.unit_price_cents,
  }));
}

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());
    const session = requireRoles(req);

    if (req.method === "GET") {
      const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
      const scope = url.searchParams.get("scope");
      const orders = await supabaseRequest(
        config,
        scope === "sales"
          ? "pos_orders?status=eq.paid&select=*,pos_order_items(*)&order=closed_at.desc&limit=100"
          : "pos_orders?status=in.(open,sent)&select=*,pos_order_items(*)&order=opened_at.asc",
        { method: "GET" }
      );
      return res.status(200).json({ ok: true, orders: Array.isArray(orders) ? orders : [] });
    }

    const body = await readRequestBody(req);
    if (req.method === "POST") {
      const table = await findTable(config, body.tableNumber);
      const current = await supabaseRequest(
        config,
        `pos_orders?table_id=eq.${encodeURIComponent(table.id)}&status=in.(open,sent)&select=*,pos_order_items(*)&limit=1`,
        { method: "GET" }
      );
      if (Array.isArray(current) && current[0]) return res.status(200).json({ ok: true, order: current[0], existing: true });
      const orders = await supabaseRequest(config, "pos_orders", {
        method: "POST",
        body: JSON.stringify({ table_id: table.id, table_number: table.table_number, source: "room", opened_by: session.sub }),
      });
      const order = Array.isArray(orders) ? orders[0] : orders;
      await audit(config, session.sub, "pos_orders", order.id, "open", { tableNumber: table.table_number });
      return res.status(201).json({ ok: true, order: { ...order, pos_order_items: [] } });
    }

    const orderId = cleanText(body.orderId, 80);
    if (!orderId) return res.status(400).json({ ok: false, error: "Falta identificar la comanda." });
    const currentOrder = await getOrder(config, orderId);
    if (!ORDER_STATUSES.has(currentOrder.status)) return res.status(409).json({ ok: false, error: "La comanda ya está cerrada." });

    if (req.method === "PATCH" && body.action === "save") {
      const detail = await replaceOrderLines(config, orderId, body.lines, true);
      const orders = await supabaseRequest(config, `pos_orders?id=eq.${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        body: JSON.stringify({ subtotal_cents: detail.totalCents, total_cents: detail.totalCents }),
      });
      return res.status(200).json({ ok: true, order: Array.isArray(orders) ? orders[0] : orders });
    }

    if (req.method === "PATCH" && body.action === "send_kitchen") {
      const detail = await replaceOrderLines(config, orderId, body.lines);
      const items = kitchenItems(detail.items);
      if (!items.length) return res.status(400).json({ ok: false, error: "No hay productos de cocina para enviar." });
      const dispatchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const kitchenOrders = items.map((item) => ({
        order_id: `TPV-${orderId}-${dispatchId}-${item.productId}`,
        status: "pending",
        source: "tpv",
        payment_status: "unpaid",
        amount_cents: item.unitPriceCents * item.qty,
        subtotal_cents: item.unitPriceCents * item.qty,
        delivery_method: "room",
        delivery_detail: `Mesa ${currentOrder.table_number}`,
        items: [item],
        raw_payload: { posOrderId: orderId, tableNumber: currentOrder.table_number, dispatchId },
      }));
      await supabaseRequest(config, "kitchen_orders", {
        method: "POST",
        body: JSON.stringify(kitchenOrders),
        headers: { Prefer: "return=minimal" },
      });
      const orders = await supabaseRequest(config, `pos_orders?id=eq.${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "sent", subtotal_cents: detail.totalCents, total_cents: detail.totalCents }),
      });
      await audit(config, session.sub, "pos_orders", orderId, "send_kitchen", { tableNumber: currentOrder.table_number, lines: items.length });
      return res.status(200).json({ ok: true, order: Array.isArray(orders) ? orders[0] : orders, kitchenOrderIds: kitchenOrders.map((order) => order.order_id) });
    }

    if (req.method === "PATCH" && body.action === "pay") {
      const method = cleanText(body.method, 20);
      if (!["cash", "card", "other"].includes(method)) return res.status(400).json({ ok: false, error: "La forma de pago no es válida." });
      const detail = await replaceOrderLines(config, orderId, body.lines);
      const orders = await supabaseRequest(config, `pos_orders?id=eq.${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "paid",
          payment_status: "paid",
          payment_method: method,
          subtotal_cents: detail.totalCents,
          total_cents: detail.totalCents,
          closed_by: session.sub,
          closed_at: new Date().toISOString(),
        }),
      });
      await audit(config, session.sub, "pos_orders", orderId, "pay", { method, totalCents: detail.totalCents });
      return res.status(200).json({ ok: true, order: Array.isArray(orders) ? orders[0] : orders });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudo guardar la comanda.");
  }
};
