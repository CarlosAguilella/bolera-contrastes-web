const {
  audit,
  cleanText,
  createPinDigest,
  getConfig,
  publicUser,
  readRequestBody,
  requireConfig,
  requireRoles,
  sendError,
  supabaseRequest,
} = require("./_tpv");

const ROLES = new Set(["admin", "manager", "waiter", "kitchen"]);

function staffInput(body) {
  const username = cleanText(body.username, 40).toLowerCase();
  const displayName = cleanText(body.displayName, 80);
  const role = cleanText(body.role, 20).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || displayName.length < 2 || !ROLES.has(role)) {
    throw Object.assign(new Error("Los datos del usuario no son válidos."), { statusCode: 400 });
  }
  return { username, display_name: displayName, role };
}

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());
    const session = requireRoles(req, ["admin", "manager"]);

    if (req.method === "GET") {
      const users = await supabaseRequest(config, "staff_users?select=id,username,display_name,role,active,last_login_at,created_at&order=display_name.asc", { method: "GET" });
      return res.status(200).json({
        ok: true,
        users: (users || []).map((user) => ({ ...publicUser(user), active: user.active, lastLoginAt: user.last_login_at, createdAt: user.created_at })),
      });
    }

    const body = await readRequestBody(req);
    if (req.method === "POST") {
      const input = staffInput(body);
      if (session.role !== "admin" && input.role !== "waiter" && input.role !== "kitchen") {
        return res.status(403).json({ ok: false, error: "Solo administración puede crear gestores o administradores." });
      }
      const users = await supabaseRequest(config, "staff_users", {
        method: "POST",
        body: JSON.stringify({ ...input, pin_digest: createPinDigest(body.pin) }),
      });
      const user = Array.isArray(users) ? users[0] : users;
      await audit(config, session.sub, "staff_users", user.id, "create", { username: user.username, role: user.role });
      return res.status(201).json({ ok: true, user: publicUser(user) });
    }

    if (req.method === "PATCH") {
      if (session.role !== "admin") return res.status(403).json({ ok: false, error: "Solo administración puede modificar personal." });
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Falta identificar el usuario." });
      const update = {};
      if (body.pin !== undefined && body.pin !== "") update.pin_digest = createPinDigest(body.pin);
      if (typeof body.active === "boolean") update.active = body.active;
      if (!Object.keys(update).length) return res.status(400).json({ ok: false, error: "No hay cambios que guardar." });
      const users = await supabaseRequest(config, `staff_users?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(update) });
      const user = Array.isArray(users) ? users[0] : users;
      if (!user) return res.status(404).json({ ok: false, error: "Usuario no encontrado." });
      await audit(config, session.sub, "staff_users", id, "update", { active: update.active, pinChanged: Boolean(update.pin_digest) });
      return res.status(200).json({ ok: true, user: publicUser(user) });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el personal.");
  }
};
