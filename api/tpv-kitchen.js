const { getConfig, readRequestBody, requireConfig, requireRoles, sendError, supabaseRequest } = require("./_tpv");

async function recordKitchenServiceEvent(config, session, order, status) {
  const posOrderId = order?.raw_payload?.posOrderId;
  const type = { preparing: "kitchen_preparing", ready: "kitchen_ready", completed: "served" }[status];
  if (!posOrderId || !type) return;
  const summary = { preparing: "Cocina empieza la preparación", ready: "Cocina marca la comanda lista", completed: "Comanda entregada" }[status];
  try {
    await supabaseRequest(config, "table_service_events", {
      method: "POST",
      body: JSON.stringify({ pos_order_id: posOrderId, event_type: type, summary, items: (order.items || []).map((item) => ({ name: item.name, variant: item.variant, quantity: item.qty })), actor_id: session.sub }),
      headers: { Prefer: "return=minimal" },
    });
  } catch (error) {}
}

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());
    const session = requireRoles(req);
    if (req.method === "GET") {
      const orders = await supabaseRequest(config, "kitchen_orders?status=in.(pending_confirmation,pending,paid,preparing,ready)&select=*&order=created_at.asc", { method: "GET" });
      return res.status(200).json({ ok: true, orders: Array.isArray(orders) ? orders : [] });
    }
    if (req.method === "PATCH") {
      requireRoles(req, ["admin", "manager", "kitchen"]);
      const body = await readRequestBody(req);
      const status = String(body.status || "").trim();
      if (!["pending_confirmation", "pending", "preparing", "ready", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ ok: false, error: "El estado de cocina no es válido." });
      }
      const rows = await supabaseRequest(config, `kitchen_orders?order_id=eq.${encodeURIComponent(String(body.orderId || "").trim())}`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(status === "ready" ? { ready_at: new Date().toISOString() } : {}) }),
      });
      const order = Array.isArray(rows) ? rows[0] : rows;
      if (!order) return res.status(404).json({ ok: false, error: "Comanda de cocina no encontrada." });
      await recordKitchenServiceEvent(config, session, order, status);
      return res.status(200).json({ ok: true, order });
    }
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar cocina.");
  }
};
