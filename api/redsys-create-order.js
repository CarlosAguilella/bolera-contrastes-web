const {
  buildRedsysPayment,
  cleanText,
  generateOrderId,
  readRequestBody,
  validateAndPriceCart,
} = require("./_redsys");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  }

  try {
    const body = await readRequestBody(req);
    const { lines, totalCents } = validateAndPriceCart(body.cart);
    const customer = {
      name: cleanText(body.customer?.name, 60),
      phone: cleanText(body.customer?.phone, 30),
    };

    if (customer.name.length < 2 || customer.phone.replace(/\D/g, "").length < 6) {
      return res.status(400).json({ ok: false, error: "Indica nombre y teléfono para preparar el pedido." });
    }

    const order = {
      orderId: generateOrderId(),
      totalCents,
      lines,
      customer,
      pickupTime: cleanText(body.pickupTime || "Lo antes posible", 40),
      notes: cleanText(body.notes || "", 240),
      createdAt: new Date().toISOString(),
    };

    const payment = buildRedsysPayment(order, req);

    return res.status(200).json({
      ok: true,
      orderId: order.orderId,
      totalCents: order.totalCents,
      paymentUrl: payment.paymentUrl,
      fields: payment.fields,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 500 ? "No se ha podido preparar el pago seguro." : error.message,
    });
  }
};
