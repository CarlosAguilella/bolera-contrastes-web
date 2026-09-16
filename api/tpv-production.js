const { audit, cleanText, getConfig, readRequestBody, requireConfig, requireRoles, sendError, supabaseRequest } = require("./_tpv");

function number(value, label, options = {}) {
  const parsed = Number(value);
  const min = options.min ?? 0;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw Object.assign(new Error(`El ${label} no es válido.`), { statusCode: 400 });
  return parsed;
}

function cents(value, label) { return Math.round(number(value, label)); }

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
    const session = requireRoles(req);
    if (req.method === "GET") return res.status(200).json({ ok: true, ...(await productionData(config)) });
    requireRoles(req, ["admin", "manager"]);
    const body = await readRequestBody(req);

    if (req.method === "POST" && body.action === "ingredient_create") {
      const name = cleanText(body.name, 160);
      const baseUnit = ["g", "ml", "unidad"].includes(body.baseUnit) ? body.baseUnit : "unidad";
      if (!name) return res.status(400).json({ ok: false, error: "Indica el nombre de la materia prima." });
      const rows = await supabaseRequest(config, "ingredients", { method: "POST", body: JSON.stringify({ name, base_unit: baseUnit, pack_quantity: number(body.packQuantity, "cantidad del envase", { min: 0.001 }), pack_price_cents: cents(body.packPriceCents, "precio de compra"), purchase_vat_percent: number(body.purchaseVatPercent, "IVA de compra", { min: 0, max: 100 }), stock_quantity: number(body.stockQuantity, "stock", { min: 0 }), minimum_stock_quantity: number(body.minimumStockQuantity, "stock mínimo", { min: 0 }), supplier: cleanText(body.supplier, 120) || null }) });
      const ingredient = Array.isArray(rows) ? rows[0] : rows;
      await audit(config, session.sub, "ingredients", ingredient.id, "create", { name });
      return res.status(201).json({ ok: true, ingredient });
    }

    if (req.method === "PATCH" && body.action === "ingredient_update") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Materia prima no válida." });
      const rows = await supabaseRequest(config, `ingredients?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ pack_quantity: number(body.packQuantity, "cantidad del envase", { min: 0.001 }), pack_price_cents: cents(body.packPriceCents, "precio de compra"), purchase_vat_percent: number(body.purchaseVatPercent, "IVA de compra", { min: 0, max: 100 }), stock_quantity: number(body.stockQuantity, "stock", { min: 0 }), minimum_stock_quantity: number(body.minimumStockQuantity, "stock mínimo", { min: 0 }), supplier: cleanText(body.supplier, 120) || null }) });
      return res.status(200).json({ ok: true, ingredient: Array.isArray(rows) ? rows[0] : rows });
    }

    if (req.method === "PATCH" && body.action === "settings_update") {
      const rows = await supabaseRequest(config, "costing_settings?id=eq.true", { method: "PATCH", body: JSON.stringify({ sales_vat_percent: number(body.salesVatPercent, "IVA de venta", { min: 0, max: 100 }), target_margin_percent: number(body.targetMarginPercent, "margen objetivo", { min: 0, max: 99.99 }), overhead_per_serving_cents: cents(body.overheadPerServingCents, "gasto indirecto"), labour_per_serving_cents: cents(body.labourPerServingCents, "mano de obra") }) });
      return res.status(200).json({ ok: true, settings: Array.isArray(rows) ? rows[0] : rows });
    }

    if (req.method === "PATCH" && body.action === "recipe_configure") {
      const productId = cleanText(body.productId, 80);
      if (!productId) return res.status(400).json({ ok: false, error: "Selecciona un producto de venta." });
      const recipe = await recipeForProduct(config, productId);
      const changes = { yield_quantity: number(body.yieldQuantity, "rendimiento", { min: 0.001 }), direct_cost_cents: cents(body.directCostCents, "coste directo") };
      const rows = recipe
        ? await supabaseRequest(config, `product_recipes?id=eq.${encodeURIComponent(recipe.id)}`, { method: "PATCH", body: JSON.stringify(changes) })
        : await supabaseRequest(config, "product_recipes", { method: "POST", body: JSON.stringify({ product_id: productId, ...changes }) });
      return res.status(200).json({ ok: true, recipe: Array.isArray(rows) ? rows[0] : rows });
    }

    if (req.method === "POST" && body.action === "recipe_line_add") {
      const productId = cleanText(body.productId, 80);
      const ingredientId = cleanText(body.ingredientId, 80);
      if (!productId || !ingredientId) return res.status(400).json({ ok: false, error: "Selecciona producto e ingrediente." });
      let recipe = await recipeForProduct(config, productId);
      if (!recipe) {
        const rows = await supabaseRequest(config, "product_recipes", { method: "POST", body: JSON.stringify({ product_id: productId }) });
        recipe = Array.isArray(rows) ? rows[0] : rows;
      }
      const existing = await supabaseRequest(config, `recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipe.id)}&ingredient_id=eq.${encodeURIComponent(ingredientId)}&select=id&limit=1`, { method: "GET" });
      const changes = { quantity: number(body.quantity, "cantidad de receta", { min: 0.001 }), waste_percent: number(body.wastePercent, "merma", { min: 0, max: 100 }) };
      const rows = Array.isArray(existing) && existing[0]
        ? await supabaseRequest(config, `recipe_ingredients?id=eq.${encodeURIComponent(existing[0].id)}`, { method: "PATCH", body: JSON.stringify(changes) })
        : await supabaseRequest(config, "recipe_ingredients", { method: "POST", body: JSON.stringify({ recipe_id: recipe.id, ingredient_id: ingredientId, ...changes }) });
      return res.status(200).json({ ok: true, line: Array.isArray(rows) ? rows[0] : rows });
    }

    if (req.method === "DELETE" && body.action === "recipe_line_delete") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Línea de receta no válida." });
      await supabaseRequest(config, `recipe_ingredients?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar producción y escandallo.");
  }
};
