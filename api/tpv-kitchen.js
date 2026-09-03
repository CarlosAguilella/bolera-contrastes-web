const { getConfig, readRequestBody, requireConfig, requireRoles, sendError, supabaseRequest } = require("./_tpv");

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());
    requireRoles(req);
    if (req.method === "GET") {
      const orders = await supabaseRequest(config, "kitchen_orders?status=in.(pending,preparing,ready)&select=*&order=created_at.asc", { method: "GET" });
      return res.status(200).json({ ok: true, orders: Array.isArray(orders) ? orders : [] });
    }
    if (req.method === "PATCH") {
      requireRoles(req, ["admin", "manager", "kitchen"]);
      const body = await readRequestBody(req);
      const status = String(body.status || "").trim();
      if (!["pending", "preparing", "ready", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ ok: false, error: "El estado de cocina no es válido." });
      }
      const rows = await supabaseRequest(config, `kitchen_orders?order_id=eq.${encodeURIComponent(String(body.orderId || "").trim())}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const order = Array.isArray(rows) ? rows[0] : rows;
      if (!order) return res.status(404).json({ ok: false, error: "Comanda de cocina no encontrada." });
      return res.status(200).json({ ok: true, order });
    }
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar cocina.");
  }
};
