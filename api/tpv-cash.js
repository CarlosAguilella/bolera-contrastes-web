const {
  audit,
  cleanText,
  getConfig,
  readRequestBody,
  requireConfig,
  requireRoles,
  sendError,
  supabaseRequest,
} = require("./_tpv");

const MANAGER_ROLES = ["admin", "manager"];

function cents(value, label, required = true) {
  if (!required && (value === null || value === "" || value === undefined)) return null;
  const amount = Math.round(Number(value));
  if (!Number.isInteger(amount) || amount < 0) throw Object.assign(new Error(`El ${label} no es válido.`), { statusCode: 400 });
  return amount;
}

async function openSession(config) {
  const rows = await supabaseRequest(config, "cash_sessions?status=eq.open&select=*&limit=1", { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function salesSince(config, openedAt) {
  const rows = await supabaseRequest(
    config,
    `pos_orders?status=eq.paid&closed_at=gte.${encodeURIComponent(openedAt)}&select=total_cents,payment_method`,
    { method: "GET" }
  );
  return (rows || []).reduce((total, order) => {
    const centsValue = Number(order.total_cents || 0);
    total.totalSalesCents += centsValue;
    if (order.payment_method === "cash") total.cashSalesCents += centsValue;
    else if (order.payment_method === "card") total.cardSalesCents += centsValue;
    return total;
  }, { totalSalesCents: 0, cashSalesCents: 0, cardSalesCents: 0 });
}

async function summary(config, session) {
  if (!session) return null;
  const [sales, movements] = await Promise.all([
    salesSince(config, session.opened_at),
    supabaseRequest(config, `cash_movements?cash_session_id=eq.${encodeURIComponent(session.id)}&select=*&order=created_at.desc`, { method: "GET" }),
  ]);
  const movementCents = (movements || []).reduce((sum, movement) => sum + (movement.movement_type === "in" ? 1 : -1) * Number(movement.amount_cents || 0), 0);
  const expectedCashCents = Number(session.opening_float_cents || 0) + sales.cashSalesCents + movementCents;
  return { ...session, summary: { ...sales, movementCents, expectedCashCents, movements: Array.isArray(movements) ? movements : [] } };
}

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());
    const session = requireRoles(req);

    if (req.method === "GET") {
      const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
      if (url.searchParams.get("scope") === "history") {
        requireRoles(req, MANAGER_ROLES);
        const sessions = await supabaseRequest(config, "cash_sessions?status=eq.closed&select=*&order=closed_at.desc&limit=30", { method: "GET" });
        return res.status(200).json({ ok: true, sessions: Array.isArray(sessions) ? sessions : [] });
      }
      return res.status(200).json({ ok: true, session: await summary(config, await openSession(config)) });
    }

    const manager = requireRoles(req, MANAGER_ROLES);
    const body = await readRequestBody(req);

    if (req.method === "POST" && body.action === "open") {
      const active = await openSession(config);
      if (active) return res.status(409).json({ ok: false, error: "Ya hay una caja abierta." });
      const openingFloatCents = cents(body.openingFloatCents, "fondo inicial");
      const sessions = await supabaseRequest(config, "cash_sessions", {
        method: "POST",
        body: JSON.stringify({ opening_float_cents: openingFloatCents, opening_notes: cleanText(body.notes, 500) || null, opened_by: manager.sub }),
      });
      const cashSession = Array.isArray(sessions) ? sessions[0] : sessions;
      await audit(config, manager.sub, "cash_sessions", cashSession.id, "open", { openingFloatCents });
      return res.status(201).json({ ok: true, session: await summary(config, cashSession) });
    }

    const active = await openSession(config);
    if (!active) return res.status(409).json({ ok: false, error: "No hay una caja abierta." });

    if (req.method === "POST" && body.action === "movement") {
      const movementType = body.movementType === "out" ? "out" : body.movementType === "in" ? "in" : "";
      const amountCents = cents(body.amountCents, "importe");
      const reason = cleanText(body.reason, 240);
      if (!movementType || !reason) return res.status(400).json({ ok: false, error: "Indica el tipo y el motivo del movimiento." });
      const movements = await supabaseRequest(config, "cash_movements", {
        method: "POST",
        body: JSON.stringify({ cash_session_id: active.id, movement_type: movementType, amount_cents: amountCents, reason, created_by: manager.sub }),
      });
      const movement = Array.isArray(movements) ? movements[0] : movements;
      await audit(config, manager.sub, "cash_sessions", active.id, "movement", { movementType, amountCents, reason });
      return res.status(201).json({ ok: true, movement, session: await summary(config, active) });
    }

    if (req.method === "PATCH" && body.action === "close") {
      const countedCashCents = cents(body.countedCashCents, "efectivo contado");
      const current = await summary(config, active);
      const expectedCashCents = current.summary.expectedCashCents;
      const differenceCents = countedCashCents - expectedCashCents;
      const sessions = await supabaseRequest(config, `cash_sessions?id=eq.${encodeURIComponent(active.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "closed",
          expected_cash_cents: expectedCashCents,
          counted_cash_cents: countedCashCents,
          difference_cents: differenceCents,
          cash_sales_cents: current.summary.cashSalesCents,
          card_sales_cents: current.summary.cardSalesCents,
          total_sales_cents: current.summary.totalSalesCents,
          closing_notes: cleanText(body.notes, 500) || null,
          closed_by: manager.sub,
          closed_at: new Date().toISOString(),
        }),
      });
      const cashSession = Array.isArray(sessions) ? sessions[0] : sessions;
      await audit(config, manager.sub, "cash_sessions", active.id, "close", { expectedCashCents, countedCashCents, differenceCents });
      return res.status(200).json({ ok: true, session: cashSession });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar la caja.");
  }
};
