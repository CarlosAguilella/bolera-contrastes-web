const { requireKitchenAccess } = require("./_kitchen");
const { getRedsysConfig, sendPaidOrderEmail } = require("./_redsys");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  }

  try {
    requireKitchenAccess(req);
    const { config } = getRedsysConfig();
    const result = await sendPaidOrderEmail(config, {
      source: "test",
      authorised: true,
      orderId: `TEST${String(Date.now()).slice(-8)}`,
      response: "0000",
      amountCents: 650,
      authorisationCode: "TEST",
      receivedAt: new Date().toISOString(),
      merchantData: {
        totalCents: 650,
        subtotalCents: 650,
        deliveryFeeCents: 0,
        customer: {
          name: "Prueba cocina",
          phone: "600000000",
          email: "",
        },
        delivery: {
          method: "pickup",
          pickupTime: "Prueba",
        },
        notes: "Email de prueba desde Vercel. No preparar.",
        items: [["p2", 1]],
      },
    });

    return res.status(200).json({ ok: true, email: result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 500 ? "No se pudo enviar el email de prueba." : error.message,
      details: error.details,
    });
  }
};
