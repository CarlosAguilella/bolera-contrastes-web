const crypto = require("crypto");

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const STAFF_ROLES = new Set(["admin", "manager", "waiter", "kitchen"]);

function cleanText(value, maxLength = 160) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getConfig() {
  return {
    supabaseUrl: cleanText(process.env.SUPABASE_URL || "", 500).replace(/\/+$/, ""),
    supabaseServiceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    sessionSecret: String(process.env.TPV_SESSION_SECRET || "").trim(),
    bootstrapSecret: String(process.env.TPV_BOOTSTRAP_SECRET || "").trim(),
  };
}

function requireConfig(config = getConfig()) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw Object.assign(new Error("El TPV aún no está conectado a la base de datos."), { statusCode: 503 });
  }
  if (!config.sessionSecret) {
    throw Object.assign(new Error("Falta configurar TPV_SESSION_SECRET en Vercel."), { statusCode: 503 });
  }
  return config;
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw Object.assign(new Error("El cuerpo de la petición no es válido."), { statusCode: 400 });
  }
}

async function supabaseRequest(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (error) {
    body = { message: text };
  }

  if (!response.ok) {
    const requestError = new Error(body?.message || body?.hint || "No se pudo acceder a la base de datos del TPV.");
    requestError.statusCode = response.status;
    requestError.details = body;
    throw requestError;
  }

  return body;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(first, second) {
  const firstBuffer = Buffer.from(String(first || ""));
  const secondBuffer = Buffer.from(String(second || ""));
  return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function createPinDigest(pin) {
  const cleanPin = cleanText(pin, 32);
  if (!/^\d{4,10}$/.test(cleanPin)) {
    throw Object.assign(new Error("El PIN debe contener entre 4 y 10 números."), { statusCode: 400 });
  }
  const salt = crypto.randomBytes(16);
  const digest = crypto.scryptSync(cleanPin, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

function verifyPin(pin, storedDigest) {
  const [algorithm, salt, expected] = String(storedDigest || "").split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(cleanText(pin, 32), Buffer.from(salt, "base64url"), 64).toString("base64url");
  return safeEqual(actual, expected);
}

function signSession(payload, secret) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function createSession(user, config = requireConfig()) {
  const now = Date.now();
  return signSession(
    {
      sub: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      iat: now,
      exp: now + SESSION_DURATION_MS,
    },
    config.sessionSecret
  );
}

function parseSession(req, config = requireConfig()) {
  const authorization = String(req.headers?.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const [encodedPayload, receivedSignature] = token.split(".");
  if (!encodedPayload || !receivedSignature) {
    throw Object.assign(new Error("Inicia sesión con tu usuario y PIN."), { statusCode: 401 });
  }
  const expectedSignature = crypto.createHmac("sha256", config.sessionSecret).update(encodedPayload).digest("base64url");
  if (!safeEqual(receivedSignature, expectedSignature)) {
    throw Object.assign(new Error("La sesión no es válida."), { statusCode: 401 });
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch (error) {
    throw Object.assign(new Error("La sesión no es válida."), { statusCode: 401 });
  }
  if (!payload?.sub || !STAFF_ROLES.has(payload.role) || Number(payload.exp) <= Date.now()) {
    throw Object.assign(new Error("Tu sesión ha caducado. Vuelve a iniciar sesión."), { statusCode: 401 });
  }
  return payload;
}

function requireRoles(req, roles) {
  const session = parseSession(req);
  if (roles && !roles.includes(session.role)) {
    throw Object.assign(new Error("No tienes permisos para realizar esta acción."), { statusCode: 403 });
  }
  return session;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.displayName,
    role: user.role,
  };
}

async function audit(config, actorId, entityType, entityId, action, metadata = {}) {
  try {
    await supabaseRequest(config, "audit_log", {
      method: "POST",
      body: JSON.stringify({
        actor_id: actorId || null,
        entity_type: cleanText(entityType, 80),
        entity_id: cleanText(entityId, 160),
        action: cleanText(action, 80),
        metadata,
      }),
      headers: { Prefer: "return=minimal" },
    });
  } catch (error) {}
}

function sendError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({
    ok: false,
    error: statusCode >= 500 ? fallbackMessage || "No se pudo completar la operación." : error.message,
  });
}

function defaultTables() {
  return [
    [1, 12, 8], [2, 26, 8], [3, 40, 8], [4, 54, 8], [5, 68, 8],
    [6, 22, 24], [7, 40, 24], [8, 58, 24], [9, 22, 41], [10, 38, 41],
    [11, 54, 41], [12, 70, 41], [13, 22, 58], [14, 38, 58], [15, 54, 58],
    [16, 70, 58], [17, 34, 75], [18, 50, 75], [19, 66, 75], [20, 76, 89],
    [21, 90, 16, "barra"], [22, 92, 25, "pared"], [23, 92, 36, "pared"],
    [24, 92, 47, "pared"], [25, 92, 58, "pared"], [26, 92, 69, "pared"], [27, 92, 80, "pared"],
  ].map(([table_number, position_x, position_y, zone]) => ({
    table_number,
    position_x,
    position_y,
    zone: zone || "sala",
  }));
}

module.exports = {
  audit,
  cleanText,
  createPinDigest,
  createSession,
  defaultTables,
  getConfig,
  publicUser,
  readRequestBody,
  requireConfig,
  requireRoles,
  sendError,
  supabaseRequest,
  verifyPin,
};
