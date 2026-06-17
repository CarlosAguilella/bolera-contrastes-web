const {
  listKitchenOrders,
  requireKitchenAccess,
  updateKitchenOrder,
} = require("./_kitchen");
const { readRequestBody } = require("./_redsys");

module.exports = async function handler(req, res) {
  try {
    const config = requireKitchenAccess(req);

    if (req.method === "GET") {
      const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
      const result = await listKitchenOrders(config, url.searchParams.get("limit") || 40);
      return res.status(200).json({ ok: true, ...result });
    }

    if (req.method === "PATCH" || req.method === "POST") {
      const body = await readRequestBody(req);
      const orderId = String(body.orderId || "").trim();
      const status = String(body.status || "").trim();
      if (!orderId) {
        return res.status(400).json({ ok: false, error: "Falta el número de pedido." });
      }

      const order = await updateKitchenOrder(config, orderId, status);
      return res.status(200).json({ ok: true, order });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 500 ? "No se pudo cargar el panel de cocina." : error.message,
    });
  }
};
