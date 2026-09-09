const crypto = require("crypto");
const { audit, cleanText, getConfig, readRequestBody, requireConfig, requireRoles, sendError, supabaseRequest } = require("./_tpv");
const { listCategories, listProducts, seedCatalog, sendsToKitchen } = require("./_tpv-catalog");

async function categoryId(config, name) {
  const categoryName = cleanText(name, 100);
  if (!categoryName) throw new Error("Indica una familia para el artículo.");
  const existing = await supabaseRequest(config, `product_categories?name=eq.${encodeURIComponent(categoryName)}&select=id,name&limit=1`, { method: "GET" });
  if (Array.isArray(existing) && existing[0]?.id) return existing[0];
  const categories = await listCategories(config);
  const sortOrder = categories.reduce((maximum, category) => Math.max(maximum, Number(category.sort_order || 0)), -1) + 1;
  const created = await supabaseRequest(config, "product_categories", {
    method: "POST",
    body: JSON.stringify({ name: categoryName, sort_order: sortOrder }),
    headers: { Prefer: "return=representation" },
  });
  const category = Array.isArray(created) ? created[0] : created;
  if (!category?.id) throw new Error("No se pudo guardar la familia.");
  return { id: category.id, name: categoryName };
}

function cents(value, label, allowEmpty = false) {
  if (allowEmpty && (value === null || value === "" || value === undefined)) return null;
  const amount = Math.round(Number(value));
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`El ${label} no es válido.`);
  return amount;
}

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());
    if (req.method === "GET") {
      requireRoles(req);
      if (req.query?.scope === "categories") return res.status(200).json({ ok: true, categories: await listCategories(config) });
      const includeInactive = String(req.query?.includeInactive || "") === "true";
      return res.status(200).json({ ok: true, products: await listProducts(config, includeInactive) });
    }

    const session = requireRoles(req, ["admin", "manager"]);
    const body = await readRequestBody(req);
    if (req.method === "PATCH" && body.action === "reorder_categories") {
      const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds.map((id) => cleanText(id, 80)).filter(Boolean) : [];
      const uniqueIds = [...new Set(categoryIds)];
      const categories = await listCategories(config);
      const validIds = new Set(categories.map((category) => category.id));
      if (!uniqueIds.length || uniqueIds.length !== categories.length || uniqueIds.some((id) => !validIds.has(id))) {
        return res.status(400).json({ ok: false, error: "El orden de familias no es válido." });
      }
      await Promise.all(uniqueIds.map((id, index) => supabaseRequest(config, `product_categories?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ sort_order: index }),
      })));
      const updatedCategories = await listCategories(config);
      await audit(config, session.sub, "product_categories", "catalog", "reorder", { categoryIds: uniqueIds });
      return res.status(200).json({ ok: true, categories: updatedCategories });
    }
    if (req.method === "POST" && body.action === "seed") {
      const count = await seedCatalog(config);
      await audit(config, session.sub, "products", "catalog", "seed", { count });
      return res.status(200).json({ ok: true, count, products: await listProducts(config) });
    }

    if (req.method === "POST" && body.action === "create") {
      const name = cleanText(body.name, 160);
      const variant = cleanText(body.variant, 120) || null;
      const description = cleanText(body.description, 500) || variant || null;
      if (!name) return res.status(400).json({ ok: false, error: "Indica el nombre del artículo." });
      const category = await categoryId(config, body.category);
      const priceCents = cents(body.priceCents, "precio de venta");
      const costCents = cents(body.costCents, "coste de compra", true);
      const kitchen = typeof body.sendsToKitchen === "boolean" ? body.sendsToKitchen : sendsToKitchen(category.name);
      const products = await supabaseRequest(config, "products", {
        method: "POST",
        body: JSON.stringify({
          external_id: `custom-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
          category_id: category.id,
          name,
          variant,
          description,
          price_cents: priceCents,
          cost_cents: costCents,
          sends_to_kitchen: kitchen,
          active: true,
          sort_order: 9999,
        }),
        headers: { Prefer: "return=representation" },
      });
      const product = Array.isArray(products) ? products[0] : products;
      await audit(config, session.sub, "products", product?.id || name, "create", { name, category: category.name });
      return res.status(201).json({ ok: true, product });
    }

    if (req.method === "PATCH") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Artículo no válido." });
      const changes = {};
      if (Object.prototype.hasOwnProperty.call(body, "name")) {
        const name = cleanText(body.name, 160);
        if (!name) return res.status(400).json({ ok: false, error: "Indica el nombre del artículo." });
        changes.name = name;
      }
      if (Object.prototype.hasOwnProperty.call(body, "variant")) changes.variant = cleanText(body.variant, 120) || null;
      if (Object.prototype.hasOwnProperty.call(body, "description")) changes.description = cleanText(body.description, 500) || null;
      if (Object.prototype.hasOwnProperty.call(body, "priceCents")) changes.price_cents = cents(body.priceCents, "precio de venta");
      if (Object.prototype.hasOwnProperty.call(body, "costCents")) changes.cost_cents = cents(body.costCents, "coste de compra", true);
      if (typeof body.sendsToKitchen === "boolean") changes.sends_to_kitchen = body.sendsToKitchen;
      if (Object.prototype.hasOwnProperty.call(body, "category")) changes.category_id = (await categoryId(config, body.category)).id;
      if (!Object.keys(changes).length) return res.status(400).json({ ok: false, error: "No hay cambios para guardar." });
      const rows = await supabaseRequest(config, `products?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      const product = Array.isArray(rows) ? rows[0] : rows;
      if (!product) return res.status(404).json({ ok: false, error: "Artículo no encontrado." });
      await audit(config, session.sub, "products", id, "update", changes);
      return res.status(200).json({ ok: true, product });
    }

    if (req.method === "DELETE") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Artículo no válido." });
      const rows = await supabaseRequest(config, `products?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      const product = Array.isArray(rows) ? rows[0] : rows;
      if (!product) return res.status(404).json({ ok: false, error: "Artículo no encontrado." });
      await audit(config, session.sub, "products", id, "archive", {});
      return res.status(200).json({ ok: true, product });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el catálogo.");
  }
};
