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

const EDITOR_ROLES = ["admin", "manager"];
const ZONES = new Set(["sala", "pared", "terraza", "barra"]);

function numericPosition(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? Math.round(number * 100) / 100 : fallback;
}

function tableInput(body, existing = {}) {
  const tableNumber = Number.parseInt(String(body.tableNumber ?? body.table_number ?? existing.table_number ?? ""), 10);
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 999) {
    throw Object.assign(new Error("El número de mesa debe estar entre 1 y 999."), { statusCode: 400 });
  }
  const zone = cleanText(body.zone ?? body.area ?? existing.zone ?? "sala", 20).toLowerCase();
  if (!ZONES.has(zone)) {
    throw Object.assign(new Error("La zona de mesa no es válida."), { statusCode: 400 });
  }
  return {
    table_number: tableNumber,
    zone,
    position_x: numericPosition(body.positionX ?? body.position_x ?? body.x, existing.position_x ?? 50),
    position_y: numericPosition(body.positionY ?? body.position_y ?? body.y, existing.position_y ?? 50),
  };
}

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());

    if (req.method === "GET") {
      requireRoles(req);
      const tables = await supabaseRequest(config, "restaurant_tables?active=is.true&select=*&order=table_number.asc", { method: "GET" });
      return res.status(200).json({ ok: true, tables: Array.isArray(tables) ? tables : [] });
    }

    const session = requireRoles(req, EDITOR_ROLES);
    const body = await readRequestBody(req);

    if (req.method === "POST") {
      const tables = await supabaseRequest(config, "restaurant_tables", {
        method: "POST",
        body: JSON.stringify(tableInput(body)),
      });
      const table = Array.isArray(tables) ? tables[0] : tables;
      await audit(config, session.sub, "restaurant_tables", table?.id, "create", { tableNumber: table?.table_number });
      return res.status(201).json({ ok: true, table });
    }

    const tableId = cleanText(body.id, 80);
    if (!tableId) {
      return res.status(400).json({ ok: false, error: "Falta identificar la mesa." });
    }

    if (req.method === "PATCH") {
      const current = await supabaseRequest(config, `restaurant_tables?id=eq.${encodeURIComponent(tableId)}&select=*&limit=1`, { method: "GET" });
      if (!Array.isArray(current) || !current[0]) {
        return res.status(404).json({ ok: false, error: "Mesa no encontrada." });
      }
      const tables = await supabaseRequest(config, `restaurant_tables?id=eq.${encodeURIComponent(tableId)}`, {
        method: "PATCH",
        body: JSON.stringify(tableInput(body, current[0])),
      });
      const table = Array.isArray(tables) ? tables[0] : tables;
      await audit(config, session.sub, "restaurant_tables", tableId, "update", { tableNumber: table?.table_number });
      return res.status(200).json({ ok: true, table });
    }

    if (req.method === "DELETE") {
      const openOrders = await supabaseRequest(
        config,
        `pos_orders?table_id=eq.${encodeURIComponent(tableId)}&status=in.(open,sent)&select=id&limit=1`,
        { method: "GET" }
      );
      if (Array.isArray(openOrders) && openOrders.length) {
        return res.status(409).json({ ok: false, error: "No puedes quitar una mesa con una comanda activa." });
      }
      const tables = await supabaseRequest(config, `restaurant_tables?id=eq.${encodeURIComponent(tableId)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      const table = Array.isArray(tables) ? tables[0] : tables;
      if (!table) return res.status(404).json({ ok: false, error: "Mesa no encontrada." });
      await audit(config, session.sub, "restaurant_tables", tableId, "deactivate", { tableNumber: table.table_number });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudieron actualizar las mesas.");
  }
};
