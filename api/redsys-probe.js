const crypto = require("crypto");

const REDSYS_URLS = {
  test: "https://sis-t.redsys.es:25443/sis/realizarPago",
  prod: "https://sis.redsys.es/sis/realizarPago",
};

function base64(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return buffer.toString("base64");
}

function base64Url(value) {
  return base64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Loose(value) {
  const normalised = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), "="), "base64");
}

function aesKeyFromText(secretKey) {
  return Buffer.from(String(secretKey).trim().slice(0, 16).padEnd(16, "0"), "utf8");
}

function aesKeyFromDecoded(secretKey) {
  const decoded = decodeBase64Loose(secretKey);
  if (decoded.length >= 16) return decoded.subarray(0, 16);
  return Buffer.concat([decoded, Buffer.alloc(16 - decoded.length, 0)]);
}

function signV2({ merchantParameters, order, secretKey, decodedKey }) {
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv("aes-128-cbc", decodedKey ? aesKeyFromDecoded(secretKey) : aesKeyFromText(secretKey), iv);
  const operationKey = Buffer.concat([cipher.update(String(order), "utf8"), cipher.final()]).toString("base64");
  return base64Url(crypto.createHmac("sha512", operationKey).update(merchantParameters, "utf8").digest());
}

function signV1({ merchantParameters, order, secretKey, signatureEncoding }) {
  const key = decodeBase64Loose(secretKey);
  const orderBuffer = Buffer.from(String(order), "utf8");
  const padLength = (8 - (orderBuffer.length % 8)) % 8;
  const paddedOrder = padLength ? Buffer.concat([orderBuffer, Buffer.alloc(padLength, 0)]) : orderBuffer;
  const cipher = crypto.createCipheriv("des-ede3-cbc", key, Buffer.alloc(8, 0));
  cipher.setAutoPadding(false);
  const derived = Buffer.concat([cipher.update(paddedOrder), cipher.final()]);
  const digest = crypto.createHmac("sha256", derived).update(merchantParameters, "utf8").digest();
  return signatureEncoding === "base64url" ? base64Url(digest) : base64(digest);
}

function buildParams({ order, merchantCode, terminal, baseUrl, caseMode }) {
  const uppercase = {
    DS_MERCHANT_AMOUNT: "650",
    DS_MERCHANT_ORDER: order,
    DS_MERCHANT_MERCHANTCODE: merchantCode,
    DS_MERCHANT_CURRENCY: "978",
    DS_MERCHANT_TRANSACTIONTYPE: "0",
    DS_MERCHANT_TERMINAL: terminal,
    DS_MERCHANT_MERCHANTURL: `${baseUrl}/api/redsys-notification`,
    DS_MERCHANT_URLOK: `${baseUrl}/redsys-ok`,
    DS_MERCHANT_URLKO: `${baseUrl}/redsys-ko`,
  };
  if (caseMode === "title") {
    return {
      Ds_Merchant_Amount: uppercase.DS_MERCHANT_AMOUNT,
      Ds_Merchant_Order: uppercase.DS_MERCHANT_ORDER,
      Ds_Merchant_MerchantCode: uppercase.DS_MERCHANT_MERCHANTCODE,
      Ds_Merchant_Currency: uppercase.DS_MERCHANT_CURRENCY,
      Ds_Merchant_TransactionType: uppercase.DS_MERCHANT_TRANSACTIONTYPE,
      Ds_Merchant_Terminal: uppercase.DS_MERCHANT_TERMINAL,
      Ds_Merchant_MerchantURL: uppercase.DS_MERCHANT_MERCHANTURL,
      Ds_Merchant_UrlOK: uppercase.DS_MERCHANT_URLOK,
      Ds_Merchant_UrlKO: uppercase.DS_MERCHANT_URLKO,
    };
  }
  return uppercase;
}

function encodeParams(params, encoding) {
  return encoding === "base64url" ? base64Url(JSON.stringify(params)) : base64(JSON.stringify(params));
}

function looksMasked(value) {
  return /^[*.•·]+$/.test(String(value || "").trim());
}

async function tryVariant(variant, config, paymentUrl) {
  const params = buildParams({
    order: variant.order,
    merchantCode: config.merchantCode,
    terminal: variant.terminal || config.terminal,
    baseUrl: config.baseUrl,
    caseMode: variant.caseMode,
  });
  const merchantParameters = encodeParams(params, variant.paramsEncoding);
  const signature = variant.version === "HMAC_SHA512_V2"
    ? signV2({ merchantParameters, order: variant.order, secretKey: config.secretKey, decodedKey: variant.decodedKey })
    : signV1({ merchantParameters, order: variant.order, secretKey: config.secretKey, signatureEncoding: variant.signatureEncoding });

  const body = new URLSearchParams({
    Ds_SignatureVersion: variant.version,
    Ds_MerchantParameters: merchantParameters,
    Ds_Signature: signature,
  });

  const response = await fetch(paymentUrl,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const html = await response.text();
  return {
    name: variant.name,
    order: variant.order,
    httpStatus: response.status,
    sis0042: html.includes("SIS0042"),
    hasAmount: html.includes("6,50") || html.includes("6.50"),
    hasOrder: html.includes(variant.order),
    title: (html.match(/<title>(.*?)<\/title>/i)?.[1] || "").slice(0, 120),
  };
}

module.exports = async function handler(req, res) {
  if (req.query?.confirm !== "probe") {
    return res.status(404).json({ ok: false });
  }

  const environment = String(process.env.REDSYS_ENV || "test").toLowerCase() === "prod" ? "prod" : "test";
  const config = {
    merchantCode: String(process.env.REDSYS_MERCHANT_CODE || "").trim(),
    terminal: String(process.env.REDSYS_TERMINAL || "1").trim(),
    secretKey: String(process.env.REDSYS_SECRET_KEY || "").trim(),
    baseUrl: String(process.env.REDSYS_PUBLIC_BASE_URL || `https://${req.headers.host}`).replace(/\/+$/, ""),
    paymentUrl: REDSYS_URLS[environment],
  };

  const baseOrder = String(Date.now()).slice(-7);
  const variants = [
    { name: "v2-uppercase-url-aes-text-terminal-1", version: "HMAC_SHA512_V2", order: `1${baseOrder}001`, paramsEncoding: "base64url", caseMode: "upper", terminal: "1" },
    { name: "v2-uppercase-url-aes-text-terminal-001", version: "HMAC_SHA512_V2", order: `2${baseOrder}002`, paramsEncoding: "base64url", caseMode: "upper", terminal: "001" },
    { name: "v2-uppercase-url-aes-decoded-terminal-1", version: "HMAC_SHA512_V2", order: `3${baseOrder}003`, paramsEncoding: "base64url", caseMode: "upper", terminal: "1", decodedKey: true },
    { name: "v2-title-url-aes-text-terminal-1", version: "HMAC_SHA512_V2", order: `4${baseOrder}004`, paramsEncoding: "base64url", caseMode: "title", terminal: "1" },
    { name: "v1-title-b64-sig-b64-terminal-1", version: "HMAC_SHA256_V1", order: `5${baseOrder}005`, paramsEncoding: "base64", caseMode: "title", terminal: "1", signatureEncoding: "base64" },
    { name: "v1-upper-b64-sig-b64-terminal-1", version: "HMAC_SHA256_V1", order: `6${baseOrder}006`, paramsEncoding: "base64", caseMode: "upper", terminal: "1", signatureEncoding: "base64" },
    { name: "v1-title-b64-sig-url-terminal-1", version: "HMAC_SHA256_V1", order: `7${baseOrder}007`, paramsEncoding: "base64", caseMode: "title", terminal: "1", signatureEncoding: "base64url" },
  ];

  const results = [];
  for (const [targetEnvironment, paymentUrl] of Object.entries(REDSYS_URLS)) {
    for (const variant of variants) {
      try {
        results.push({ targetEnvironment, ...(await tryVariant(variant, config, paymentUrl)) });
      } catch (error) {
        results.push({ targetEnvironment, name: variant.name, error: String(error.message || error) });
      }
    }
  }

  return res.status(200).json({
    ok: true,
    environment,
    merchantCodeLength: config.merchantCode.length,
    terminal: config.terminal,
    secretLength: config.secretKey.length,
    secretLooksMasked: looksMasked(config.secretKey),
    paymentUrl: config.paymentUrl,
    results,
  });
};
