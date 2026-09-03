const {
  audit,
  cleanText,
  createPinDigest,
  defaultTables,
  getConfig,
  publicUser,
  readRequestBody,
  requireConfig,
  sendError,
  supabaseRequest,
} = require("./_tpv");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Método no permitido." });
    }

    const config = requireConfig(getConfig());
    if (!config.bootstrapSecret) {
      return res.status(503).json({ ok: false, error: "Falta configurar TPV_BOOTSTRAP_SECRET en Vercel." });
    }

    const body = await readRequestBody(req);
    const receivedSecret = String(req.headers["x-tpv-bootstrap-secret"] || body.bootstrapSecret || "");
    if (receivedSecret !== config.bootstrapSecret) {
      return res.status(401).json({ ok: false, error: "Código de configuración no válido." });
    }

    const existingUsers = await supabaseRequest(config, "staff_users?select=id&limit=1", { method: "GET" });
    if (Array.isArray(existingUsers) && existingUsers.length) {
      return res.status(409).json({ ok: false, error: "Ya existe un usuario de TPV. Usa el panel de gestión para crear más." });
    }

    const username = cleanText(body.username, 40).toLowerCase();
    const displayName = cleanText(body.displayName, 80);
    if (!/^[a-z0-9._-]{3,40}$/.test(username) || displayName.length < 2) {
      return res.status(400).json({ ok: false, error: "Indica un usuario y nombre válidos." });
    }

    const users = await supabaseRequest(config, "staff_users", {
      method: "POST",
      body: JSON.stringify({
        username,
        display_name: displayName,
        role: "admin",
        pin_digest: createPinDigest(body.pin),
      }),
    });
    const user = Array.isArray(users) ? users[0] : null;

    const existingTables = await supabaseRequest(config, "restaurant_tables?select=id&limit=1", { method: "GET" });
    if (!Array.isArray(existingTables) || !existingTables.length) {
      await supabaseRequest(config, "restaurant_tables", {
        method: "POST",
        body: JSON.stringify(defaultTables()),
        headers: { Prefer: "return=minimal" },
      });
    }

    await audit(config, user?.id, "staff_users", user?.id, "bootstrap_admin", { username });
    return res.status(201).json({ ok: true, user: publicUser(user), seededTables: true });
  } catch (error) {
    return sendError(res, error, "No se pudo preparar el TPV central.");
  }
};
