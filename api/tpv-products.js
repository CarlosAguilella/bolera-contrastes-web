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

function decimal(value, label, minimum = 0, maximum = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw Object.assign(new Error(`El ${label} no es válido.`), { statusCode: 400 });
  return parsed;
}

async function productionData(config) {
  const [ingredients, recipes, recipeLines, settings] = await Promise.all([
    supabaseRequest(config, "ingredients?select=*&order=name.asc", { method: "GET" }),
    supabaseRequest(config, "product_recipes?select=*&order=created_at.asc", { method: "GET" }),
    supabaseRequest(config, "recipe_ingredients?select=*&order=created_at.asc", { method: "GET" }),
    supabaseRequest(config, "costing_settings?id=eq.true&select=*&limit=1", { method: "GET" }),
  ]);
  return { ingredients: Array.isArray(ingredients) ? ingredients : [], recipes: Array.isArray(recipes) ? recipes : [], recipeLines: Array.isArray(recipeLines) ? recipeLines : [], settings: Array.isArray(settings) ? settings[0] || null : null };
}

async function recipeForProduct(config, productId) {
  const rows = await supabaseRequest(config, `product_recipes?product_id=eq.${encodeURIComponent(productId)}&select=*&limit=1`, { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : null;
}

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());
    if (req.method === "GET") {
      requireRoles(req);
      if (req.query?.scope === "categories") return res.status(200).json({ ok: true, categories: await listCategories(config) });
      if (req.query?.scope === "production") {
        requireRoles(req, ["admin", "manager"]);
        return res.status(200).json({ ok: true, ...(await productionData(config)) });
      }
      const includeInactive = String(req.query?.includeInactive || "") === "true";
      return res.status(200).json({ ok: true, products: await listProducts(config, includeInactive) });
    }

    const session = requireRoles(req, ["admin", "manager"]);
    const body = await readRequestBody(req);
    if (req.method === "POST" && body.action === "ingredient_create") {
      const name = cleanText(body.name, 160);
      const baseUnit = ["g", "ml", "unidad"].includes(body.baseUnit) ? body.baseUnit : "unidad";
      if (!name) return res.status(400).json({ ok: false, error: "Indica el nombre de la materia prima." });
      const rows = await supabaseRequest(config, "ingredients", { method: "POST", body: JSON.stringify({ name, base_unit: baseUnit, pack_quantity: decimal(body.packQuantity, "cantidad del envase", 0.001), pack_price_cents: cents(body.packPriceCents, "precio de compra"), purchase_vat_percent: decimal(body.purchaseVatPercent, "IVA de compra", 0, 100), stock_quantity: decimal(body.stockQuantity, "stock"), minimum_stock_quantity: decimal(body.minimumStockQuantity, "stock mínimo"), supplier: cleanText(body.supplier, 120) || null }) });
      const ingredient = Array.isArray(rows) ? rows[0] : rows;
      await audit(config, session.sub, "ingredients", ingredient.id, "create", { name });
      return res.status(201).json({ ok: true, ingredient });
    }
    if (req.method === "PATCH" && body.action === "ingredient_update") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Materia prima no válida." });
      const rows = await supabaseRequest(config, `ingredients?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ pack_quantity: decimal(body.packQuantity, "cantidad del envase", 0.001), pack_price_cents: cents(body.packPriceCents, "precio de compra"), purchase_vat_percent: decimal(body.purchaseVatPercent, "IVA de compra", 0, 100), stock_quantity: decimal(body.stockQuantity, "stock"), minimum_stock_quantity: decimal(body.minimumStockQuantity, "stock mínimo"), supplier: cleanText(body.supplier, 120) || null }) });
      return res.status(200).json({ ok: true, ingredient: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "PATCH" && body.action === "settings_update") {
      const rows = await supabaseRequest(config, "costing_settings?id=eq.true", { method: "PATCH", body: JSON.stringify({ sales_vat_percent: decimal(body.salesVatPercent, "IVA de venta", 0, 100), target_margin_percent: decimal(body.targetMarginPercent, "margen objetivo", 0, 99.99), overhead_per_serving_cents: cents(body.overheadPerServingCents, "gasto indirecto"), labour_per_serving_cents: cents(body.labourPerServingCents, "mano de obra") }) });
      return res.status(200).json({ ok: true, settings: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "PATCH" && body.action === "recipe_configure") {
      const productId = cleanText(body.productId, 80);
      if (!productId) return res.status(400).json({ ok: false, error: "Selecciona un producto de venta." });
      const recipe = await recipeForProduct(config, productId);
      const changes = { yield_quantity: decimal(body.yieldQuantity, "rendimiento", 0.001), direct_cost_cents: cents(body.directCostCents, "coste directo") };
      const rows = recipe ? await supabaseRequest(config, `product_recipes?id=eq.${encodeURIComponent(recipe.id)}`, { method: "PATCH", body: JSON.stringify(changes) }) : await supabaseRequest(config, "product_recipes", { method: "POST", body: JSON.stringify({ product_id: productId, ...changes }) });
      return res.status(200).json({ ok: true, recipe: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "POST" && body.action === "recipe_line_add") {
      const productId = cleanText(body.productId, 80);
      const ingredientId = cleanText(body.ingredientId, 80);
      if (!productId || !ingredientId) return res.status(400).json({ ok: false, error: "Selecciona producto e ingrediente." });
      let recipe = await recipeForProduct(config, productId);
      if (!recipe) { const created = await supabaseRequest(config, "product_recipes", { method: "POST", body: JSON.stringify({ product_id: productId }) }); recipe = Array.isArray(created) ? created[0] : created; }
      const existing = await supabaseRequest(config, `recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipe.id)}&ingredient_id=eq.${encodeURIComponent(ingredientId)}&select=id&limit=1`, { method: "GET" });
      const changes = { quantity: decimal(body.quantity, "cantidad de receta", 0.001), waste_percent: decimal(body.wastePercent, "merma", 0, 100) };
      const rows = Array.isArray(existing) && existing[0] ? await supabaseRequest(config, `recipe_ingredients?id=eq.${encodeURIComponent(existing[0].id)}`, { method: "PATCH", body: JSON.stringify(changes) }) : await supabaseRequest(config, "recipe_ingredients", { method: "POST", body: JSON.stringify({ recipe_id: recipe.id, ingredient_id: ingredientId, ...changes }) });
      return res.status(200).json({ ok: true, line: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "DELETE" && body.action === "recipe_line_delete") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Línea de receta no válida." });
      await supabaseRequest(config, `recipe_ingredients?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return res.status(200).json({ ok: true });
    }
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
