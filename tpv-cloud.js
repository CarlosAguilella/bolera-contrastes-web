(function () {
  const SESSION_KEY = "bc-tpv-session-v1";

  function getSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "");
      return saved?.token && saved?.user ? saved : null;
    } catch (error) {
      return null;
    }
  }

  function saveSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent("bc-tpv-session", { detail: session }));
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent("bc-tpv-session", { detail: null }));
  }

  async function request(path, options = {}) {
    const session = getSession();
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (options.body) headers["Content-Type"] = "application/json";
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    const response = await fetch(`/api/${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      const error = new Error(body.error || "No se pudo conectar con el TPV central.");
      error.status = response.status;
      if (response.status === 401) logout();
      throw error;
    }
    return body;
  }

  async function login(username, pin) {
    const result = await request("tpv-auth", { method: "POST", body: JSON.stringify({ username, pin }) });
    const session = { token: result.token, user: result.user };
    saveSession(session);
    return session;
  }

  async function loadTables() {
    const result = await request("tpv-tables");
    return result.tables || [];
  }

  function saveRemoteTables(data, tables) {
    if (!data || !Array.isArray(tables)) return data;
    data.tableLayout = tables.map((table) => ({
      id: String(table.table_number),
      name: `Mesa ${table.table_number}`,
      x: Number(table.position_x),
      y: Number(table.position_y),
      area: table.zone === "pared" ? "wall" : table.zone === "barra" ? "label" : "sala",
    }));
    data.cloudTableIds = Object.fromEntries(tables.map((table) => [String(table.table_number), table.id]));
    return data;
  }

  function tableId(data, tableNumber) {
    return data?.cloudTableIds?.[String(tableNumber)] || "";
  }

  async function createTable(input) {
    const result = await request("tpv-tables", { method: "POST", body: JSON.stringify(input) });
    return result.table;
  }

  async function updateTable(id, input) {
    const result = await request("tpv-tables", { method: "PATCH", body: JSON.stringify({ id, ...input }) });
    return result.table;
  }

  async function deleteTable(id) {
    return request("tpv-tables", { method: "DELETE", body: JSON.stringify({ id }) });
  }

  async function loadProducts() {
    const result = await request("tpv-products");
    return result.products || [];
  }

  async function seedProducts() {
    const result = await request("tpv-products", { method: "POST", body: JSON.stringify({ action: "seed" }) });
    return result.products || [];
  }

  async function updateProduct(id, priceCents, costCents) {
    const result = await request("tpv-products", { method: "PATCH", body: JSON.stringify({ id, priceCents, costCents }) });
    return result.product;
  }

  function saveRemoteProducts(data, products) {
    if (!data || !Array.isArray(products)) return data;
    data.prices = data.prices || {};
    data.costs = data.costs || {};
    data.cloudProductIds = {};
    products.forEach((product) => {
      data.cloudProductIds[product.external_id] = product.id;
      data.prices[product.external_id] = Number(product.price_cents);
      if (product.cost_cents === null || product.cost_cents === undefined) delete data.costs[product.external_id];
      else data.costs[product.external_id] = Number(product.cost_cents);
    });
    return data;
  }

  async function loadOrders() {
    const result = await request("tpv-orders");
    return result.orders || [];
  }

  async function loadSales() {
    const result = await request("tpv-orders?scope=sales");
    return result.orders || [];
  }

  async function openOrder(tableNumber) {
    const result = await request("tpv-orders", { method: "POST", body: JSON.stringify({ tableNumber }) });
    return result.order;
  }

  async function saveOrder(orderId, lines) {
    const result = await request("tpv-orders", { method: "PATCH", body: JSON.stringify({ orderId, action: "save", lines }) });
    return result.order;
  }

  async function sendOrderToKitchen(orderId, lines) {
    const result = await request("tpv-orders", { method: "PATCH", body: JSON.stringify({ orderId, action: "send_kitchen", lines }) });
    return result;
  }

  async function payOrder(orderId, method, lines) {
    const result = await request("tpv-orders", { method: "PATCH", body: JSON.stringify({ orderId, action: "pay", method, lines }) });
    return result.order;
  }

  async function loadKitchenOrders() {
    const result = await request("tpv-kitchen");
    return result.orders || [];
  }

  async function updateKitchenOrder(orderId, status) {
    const result = await request("tpv-kitchen", { method: "PATCH", body: JSON.stringify({ orderId, status }) });
    return result.order;
  }

  window.BC_TPV_CLOUD = {
    createTable,
    deleteTable,
    getSession,
    loadTables,
    login,
    loadKitchenOrders,
    loadOrders,
    loadProducts,
    loadSales,
    logout,
    request,
    payOrder,
    saveOrder,
    saveRemoteProducts,
    saveRemoteTables,
    tableId,
    openOrder,
    seedProducts,
    sendOrderToKitchen,
    updateKitchenOrder,
    updateProduct,
    updateTable,
  };
})();
