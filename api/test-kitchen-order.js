const { requireKitchenAccess, saveKitchenOrder } = require("./_kitchen");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  }

  try {
    requireKitchenAccess(req);
    const orderId = `TEST${String(Date.now()).slice(-8)}`;
    const order = {
      order_id: orderId,
      status: "paid",
      source: "test",
      payment_status: "paid",
      amount_cents: 650,
      subtotal_cents: 650,
      delivery_fee_cents: 0,
      customer_name: "Prueba cocina",
      customer_phone: "600000000",
      customer_email: "",
      delivery_method: "pickup",
      delivery_detail: "Pedido de prueba",
      notes: "Pedido de prueba. No preparar.",
      items: [
        {
          id: "p2",
          name: "Patatas bravas",
          qty: 1,
          unitPriceCents: 650,
          subtotalCents: 650,
        },
      ],
      raw_payload: { test: true, createdAt: new Date().toISOString() },
      paid_at: new Date().toISOString(),
    };
    const storage = await saveKitchenOrder(order);
    return res.status(200).json({ ok: true, orderId, storage });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 500 ? "No se pudo crear el pedido de prueba." : error.message,
      details: error.details,
    });
  }
};
