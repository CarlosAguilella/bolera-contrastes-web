const {
  buildOrderPayment,
  cleanText,
  ensureOrdersEnabled,
  generateOrderId,
  readRequestBody,
  validateCustomer,
  validateDelivery,
  validatePaymentMethod,
  validateAndPriceCart,
} = require("./_redsys");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  }

  try {
    ensureOrdersEnabled();
    const body = await readRequestBody(req);
    const customer = validateCustomer(body.customer);
    const delivery = validateDelivery(body.delivery || {
      method: "pickup",
      pickupTime: body.pickupTime || "Lo antes posible",
    });
    const paymentMethod = validatePaymentMethod(body.paymentMethod);
    const { lines, subtotalCents, deliveryFeeCents, totalCents } = validateAndPriceCart(body.cart, delivery.method);

    const order = {
      orderId: generateOrderId(),
      subtotalCents,
      deliveryFeeCents,
      totalCents,
      lines,
      customer,
      delivery,
      paymentMethod,
      notes: cleanText(body.notes || "", 240),
      createdAt: new Date().toISOString(),
    };

    const payment = buildOrderPayment(order, req);

    return res.status(200).json({
      ok: true,
      orderId: order.orderId,
      provider: payment.provider,
      status: payment.status || "created",
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.totalCents,
      paymentUrl: payment.paymentUrl,
      fields: payment.fields,
      redirectUrl: payment.redirectUrl,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 500 ? "No se ha podido preparar el pago seguro." : error.message,
    });
  }
};
