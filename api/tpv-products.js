const { audit, cleanText, getConfig, readRequestBody, requireConfig, requireRoles, sendError, supabaseRequest } = require("./_tpv");
const { listProducts, seedCatalog } = require("./_tpv-catalog");

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());
    if (req.method === "GET") {
      requireRoles(req);
      return res.status(200).json({ ok: true, products: await listProducts(config) });
    }

    const session = requireRoles(req, ["admin", "manager"]);
    const body = await readRequestBody(req);
    if (req.method === "POST" && body.action === "seed") {
      const count = await seedCatalog(config);
      await audit(config, session.sub, "products", "catalog", "seed", { count });
      return res.status(200).json({ ok: true, count, products: await listProducts(config) });
    }

    if (req.method === "PATCH") {
      const id = cleanText(body.id, 80);
      const priceCents = Math.round(Number(body.priceCents));
      const costCents = body.costCents === null || body.costCents === "" ? null : Math.round(Number(body.costCents));
      if (!id || !Number.isInteger(priceCents) || priceCents < 0 || (costCents !== null && (!Number.isInteger(costCents) || costCents < 0))) {
        return res.status(400).json({ ok: false, error: "Los datos del artículo no son válidos." });
      }
      const rows = await supabaseRequest(config, `products?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ price_cents: priceCents, cost_cents: costCents }),
      });
      const product = Array.isArray(rows) ? rows[0] : rows;
      if (!product) return res.status(404).json({ ok: false, error: "Artículo no encontrado." });
      await audit(config, session.sub, "products", id, "update_price", { priceCents, costCents });
      return res.status(200).json({ ok: true, product });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el catálogo.");
  }
};
