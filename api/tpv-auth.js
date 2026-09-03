const {
  cleanText,
  createSession,
  getConfig,
  publicUser,
  readRequestBody,
  requireConfig,
  requireRoles,
  sendError,
  supabaseRequest,
  verifyPin,
} = require("./_tpv");

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());

    if (req.method === "GET") {
      const session = requireRoles(req);
      return res.status(200).json({ ok: true, user: publicUser(session) });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok: false, error: "Método no permitido." });
    }

    const body = await readRequestBody(req);
    const username = cleanText(body.username, 40).toLowerCase();
    const pin = cleanText(body.pin, 32);
    if (!/^[a-z0-9._-]{3,40}$/.test(username) || !/^\d{4,10}$/.test(pin)) {
      return res.status(400).json({ ok: false, error: "Indica un usuario y un PIN válidos." });
    }

    const users = await supabaseRequest(
      config,
      `staff_users?username=eq.${encodeURIComponent(username)}&active=is.true&select=id,username,display_name,role,pin_digest`,
      { method: "GET" }
    );
    const user = Array.isArray(users) ? users[0] : null;
    if (!user || !verifyPin(pin, user.pin_digest)) {
      return res.status(401).json({ ok: false, error: "Usuario o PIN incorrectos." });
    }

    await supabaseRequest(config, `staff_users?id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ last_login_at: new Date().toISOString() }),
      headers: { Prefer: "return=minimal" },
    });

    return res.status(200).json({ ok: true, token: createSession(user, config), user: publicUser(user) });
  } catch (error) {
    return sendError(res, error, "No se pudo iniciar sesión en el TPV.");
  }
};
