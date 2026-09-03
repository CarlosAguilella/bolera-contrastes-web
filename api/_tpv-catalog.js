const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { cleanText, supabaseRequest } = require("./_tpv");

let cachedCatalog = null;

function getCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const source = fs.readFileSync(path.join(__dirname, "..", "tpv-products.js"), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "tpv-products.js", timeout: 1000 });
  cachedCatalog = (sandbox.window.BC_TPV_MENU || []).map((item, index) => ({
    external_id: cleanText(item.id, 80),
    name: cleanText(item.name, 160),
    variant: cleanText(item.desc === item.category ? "" : item.desc, 120) || null,
    category: cleanText(item.category, 100),
    price_cents: Math.round(Number(item.price || 0) * 100),
    sort_order: index,
  }));
  return cachedCatalog;
}

function sendsToKitchen(category) {
  const barCategories = new Set([
    "refrescos y cervezas", "café e infusiones", "bebida alcohólica", "vino blanco",
    "vino tinto rioja", "vino tinto ribera del duero", "cavas y champagne", "bollería",
    "postres", "fiesta", "otros"
  ]);
  return !barCategories.has(String(category || "").toLocaleLowerCase("es"));
}

async function seedCatalog(config) {
  const existing = await supabaseRequest(config, "products?select=id&limit=1", { method: "GET" });
  if (Array.isArray(existing) && existing.length) return 0;
  const catalog = getCatalog();
  const categories = [...new Set(catalog.map((item) => item.category))].map((name, index) => ({ name, sort_order: index }));
  await supabaseRequest(config, "product_categories?on_conflict=name", {
    method: "POST",
    body: JSON.stringify(categories),
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
  });
  const savedCategories = await supabaseRequest(config, "product_categories?select=id,name", { method: "GET" });
  const categoryIds = Object.fromEntries((savedCategories || []).map((category) => [category.name, category.id]));
  const products = catalog.map((item) => ({
    external_id: item.external_id,
    category_id: categoryIds[item.category],
    name: item.name,
    variant: item.variant,
    description: item.variant || item.category,
    price_cents: item.price_cents,
    sends_to_kitchen: sendsToKitchen(item.category),
    active: true,
    sort_order: item.sort_order,
  }));
  await supabaseRequest(config, "products?on_conflict=external_id", {
    method: "POST",
    body: JSON.stringify(products),
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
  });
  return products.length;
}

async function listProducts(config) {
  const products = await supabaseRequest(
    config,
    "products?active=is.true&select=id,external_id,name,variant,description,price_cents,cost_cents,sends_to_kitchen,sort_order,product_categories(name)&order=sort_order.asc",
    { method: "GET" }
  );
  return Array.isArray(products) ? products : [];
}

module.exports = { getCatalog, listProducts, seedCatalog, sendsToKitchen };
