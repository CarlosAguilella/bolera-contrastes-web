const {
  SIGNATURE_VERSION,
  buildWebhookPayload,
  decodeMerchantData,
  decodeMerchantParameters,
  getParam,
  getRedsysConfig,
  isAuthorisedResponse,
  readRequestBody,
  verifySignature,
} = require("./_redsys");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  }

  const { config, missing } = getRedsysConfig();
  if (missing.length) {
    return res.status(503).json({ ok: false, error: `Faltan variables de Redsys: ${missing.join(", ")}.` });
  }

  try {
    const body = await readRequestBody(req);
    const signatureVersion = body.Ds_SignatureVersion || body.DS_SIGNATUREVERSION;
    const merchantParameters = body.Ds_MerchantParameters || body.DS_MERCHANTPARAMETERS;
    const receivedSignature = body.Ds_Signature || body.DS_SIGNATURE;

    if (signatureVersion && signatureVersion !== SIGNATURE_VERSION) {
      return res.status(400).json({ ok: false, error: "Versión de firma Redsys no válida." });
    }

    if (!merchantParameters || !receivedSignature) {
      return res.status(400).json({ ok: false, error: "Notificación Redsys incompleta." });
    }

    const params = decodeMerchantParameters(merchantParameters);
    const orderId = getParam(params, "Ds_Order", "DS_ORDER", "Ds_Merchant_Order", "DS_MERCHANT_ORDER");
    if (!orderId) {
      return res.status(400).json({ ok: false, error: "Notificación Redsys sin número de pedido." });
    }

    const signatureOk = verifySignature(receivedSignature, merchantParameters, orderId, config.secretKey);

    if (!signatureOk) {
      return res.status(401).json({ ok: false, error: "Firma Redsys no válida." });
    }

    const merchantData = decodeMerchantData(getParam(params, "Ds_MerchantData", "DS_MERCHANTDATA"));
    const authorised = isAuthorisedResponse(params);
    const payload = buildWebhookPayload(params, merchantData, authorised);

    if (authorised && config.confirmationWebhookUrl) {
      const webhookResponse = await fetch(config.confirmationWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!webhookResponse.ok) {
        return res.status(502).json({ ok: false, error: "Pago verificado, pero falló la confirmación al local." });
      }
    }

    return res.status(200).json({
      ok: true,
      authorised,
      orderId,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo verificar la notificación Redsys." });
  }
};
