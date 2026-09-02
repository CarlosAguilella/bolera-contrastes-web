(function () {
  const STORAGE_KEY = "bc-tpv-mvp-v2";
  const fallbackProducts = [
    { id: "p2", categoryId: "picar", category: "Para picar", name: "Patatas bravas", description: "Patata gajo y alioli", priceCents: 650, image: "" },
    { id: "p1", categoryId: "picar", category: "Para picar", name: "Croquetas", description: "Jamón ibérico", priceCents: 750, image: "" },
    { id: "c1", categoryId: "cafe", category: "Cafés", name: "Café solo", description: "Café de especialidad", priceCents: 150, image: "" },
    { id: "cv1", categoryId: "cervezas", category: "Cervezas", name: "Caña", description: "Tirador", priceCents: 220, image: "" },
  ];
  const categoryLabels = Object.fromEntries((window.BC_CATEGORIES || []).map((item) => [item.id, item.label]));
  const products = (window.BC_MENU || fallbackProducts).map((item) => ({
    id: item.id,
    categoryId: item.categoryId || item.cat || "otros",
    category: item.category || categoryLabels[item.cat] || "Otros",
    name: item.name,
    description: item.description || item.desc || "",
    priceCents: Number.isFinite(item.priceCents) ? item.priceCents : Math.round(Number(item.price || 0) * 100),
    image: item.image || item.img || "",
  }));
  const tablePositions = [
    ["1", 12, 8], ["2", 26, 8], ["3", 40, 8], ["4", 54, 8], ["5", 68, 8],
    ["6", 22, 24], ["7", 40, 24], ["8", 58, 24],
    ["9", 22, 41], ["10", 38, 41], ["11", 54, 41], ["12", 70, 41],
    ["13", 22, 58], ["14", 38, 58], ["15", 54, 58], ["16", 70, 58],
    ["17", 34, 75], ["18", 50, 75], ["19", 66, 75], ["20", 76, 89],
    ["21", 90, 16, "label"], ["22", 92, 25, "wall"], ["23", 92, 36, "wall"],
    ["24", 92, 47, "wall"], ["25", 92, 58, "wall"], ["26", 92, 69, "wall"], ["27", 92, 80, "wall"],
  ];
  const tables = tablePositions.map(([id, x, y, area]) => ({ id, name: `Mesa ${id}`, x, y, area: area || "sala" }));

  function initialData() {
    const now = Date.now();
    return {
      tables: {
        "2": { openedAt: new Date(now - 36 * 60000).toISOString(), lines: [{ productId: "c1", qty: 2 }, { productId: "p2", qty: 1 }], sentAt: new Date(now - 22 * 60000).toISOString() },
        "7": { openedAt: new Date(now - 19 * 60000).toISOString(), lines: [{ productId: "cv1", qty: 3 }, { productId: "p1", qty: 1 }], sentAt: new Date(now - 12 * 60000).toISOString() },
        "14": { openedAt: new Date(now - 8 * 60000).toISOString(), lines: [{ productId: "c2", qty: 2 }], sentAt: null },
      },
      kitchenOrders: [
        { id: "K-1002", tableId: "2", status: "preparing", createdAt: new Date(now - 22 * 60000).toISOString(), lines: [{ productId: "p2", qty: 1 }] },
        { id: "K-1001", tableId: "7", status: "ready", createdAt: new Date(now - 12 * 60000).toISOString(), lines: [{ productId: "p1", qty: 1 }] },
      ],
      sales: [
        { id: "V-1001", tableId: "4", totalCents: 1250, method: "card", paidAt: new Date(now - 55 * 60000).toISOString(), lines: [{ productId: "cv1", qty: 2 }, { productId: "p2", qty: 1 }] },
        { id: "V-1000", tableId: "11", totalCents: 840, method: "cash", paidAt: new Date(now - 110 * 60000).toISOString(), lines: [{ productId: "c1", qty: 2 }, { productId: "cv1", qty: 1 }, { productId: "c2", qty: 1 }] },
      ],
      costs: {},
      sequence: 1003,
    };
  }

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "");
      if (saved && saved.tables && saved.kitchenOrders && saved.sales) {
        if (!saved.costs) saved.costs = {};
        return saved;
      }
    } catch (error) {}
    return initialData();
  }

  function saveData(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (error) {}
  }

  function getProduct(id, data) {
    const product = products.find((item) => item.id === id);
    if (!product) return null;
    const override = data?.prices?.[id];
    return override ? { ...product, priceCents: Number(override) } : product;
  }

  function isKitchenProduct(product) {
    return product && !["cafe", "cervezas", "cocteles"].includes(product.categoryId);
  }

  function formatEuros(cents) {
    return `${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")} €`;
  }

  window.BC_TPV = { STORAGE_KEY, products, tables, initialData, loadData, saveData, getProduct, isKitchenProduct, formatEuros };
})();
