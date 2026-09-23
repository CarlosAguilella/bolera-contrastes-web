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

  async function loadProducts(includeInactive = false) {
    const result = await request(`tpv-products${includeInactive ? "?includeInactive=true" : ""}`);
    return result.products || [];
  }

  async function loadCategories() {
    const result = await request("tpv-products?scope=categories");
    return result.categories || [];
  }

  async function seedProducts() {
    const result = await request("tpv-products", { method: "POST", body: JSON.stringify({ action: "seed" }) });
    return result.products || [];
  }

  async function createProduct(input) {
    const result = await request("tpv-products", { method: "POST", body: JSON.stringify({ action: "create", ...input }) });
    return result.product;
  }

  async function updateProduct(id, input) {
    const result = await request("tpv-products", { method: "PATCH", body: JSON.stringify({ id, ...input }) });
    return result.product;
  }

  async function archiveProduct(id) {
    return request("tpv-products", { method: "DELETE", body: JSON.stringify({ id }) });
  }

  async function reorderCategories(categoryIds) {
    const result = await request("tpv-products", { method: "PATCH", body: JSON.stringify({ action: "reorder_categories", categoryIds }) });
    return result.categories || [];
  }

  async function loadCashSession(history = false) {
    const result = await request(`tpv-orders?scope=${history ? "cash_history" : "cash"}`);
    return history ? result.sessions || [] : result.session || null;
  }

  async function openCashSession(openingFloatCents, notes) {
    const result = await request("tpv-orders", { method: "POST", body: JSON.stringify({ action: "cash_open", openingFloatCents, notes }) });
    return result.session;
  }

  async function addCashMovement(movementType, amountCents, reason) {
    const result = await request("tpv-orders", { method: "POST", body: JSON.stringify({ action: "cash_movement", movementType, amountCents, reason }) });
    return result.session;
  }

  async function closeCashSession(countedCashCents, notes) {
    const result = await request("tpv-orders", { method: "PATCH", body: JSON.stringify({ action: "cash_close", countedCashCents, notes }) });
    return result.session;
  }

  async function addCashCount(countedCashCents, notes) {
    const result = await request("tpv-orders", { method: "POST", body: JSON.stringify({ action: "cash_count", countedCashCents, notes }) });
    return result.session;
  }

  async function loadPaymentMethods() {
    const result = await request("tpv-orders?scope=payment_methods");
    return result.methods || [];
  }

  async function createPaymentMethod(name) {
    const result = await request("tpv-orders", { method: "POST", body: JSON.stringify({ action: "payment_method_create", name }) });
    return result.method;
  }

  async function loadShift(history = false) {
    const result = await request(`tpv-orders?scope=${history ? "shift_history" : "shift"}`);
    return history ? result.shifts || [] : result.shift || null;
  }

  async function startShift() {
    const result = await request("tpv-orders", { method: "POST", body: JSON.stringify({ action: "shift_start" }) });
    return result.shift;
  }

  async function endShift() {
    const result = await request("tpv-orders", { method: "PATCH", body: JSON.stringify({ action: "shift_end" }) });
    return result.shift;
  }

  function saveRemoteProducts(data, products) {
    if (!data || !Array.isArray(products)) return data;
    data.prices = data.prices || {};
    data.costs = data.costs || {};
    data.cloudProductIds = {};
    data.remoteProducts = products.map((product) => ({ ...product }));
    products.forEach((product) => {
      data.cloudProductIds[product.external_id] = product.id;
      data.prices[product.external_id] = Number(product.price_cents);
      if (product.cost_cents === null || product.cost_cents === undefined) delete data.costs[product.external_id];
      else data.costs[product.external_id] = Number(product.cost_cents);
    });
    return data;
  }

  function saveRemoteCategories(data, categories) {
    if (!data || !Array.isArray(categories)) return data;
    data.remoteCategories = categories.map((category) => ({ ...category }));
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

  async function loadTableHistory() {
    const result = await request("tpv-orders?scope=table_history");
    return result.events || [];
  }

  async function loadProduction() {
    return request("tpv-products?scope=production");
  }

  async function createIngredient(input) {
    const result = await request("tpv-products", { method: "POST", body: JSON.stringify({ action: "ingredient_create", ...input }) });
    return result.ingredient;
  }

  async function updateIngredient(input) {
    const result = await request("tpv-products", { method: "PATCH", body: JSON.stringify({ action: "ingredient_update", ...input }) });
    return result.ingredient;
  }

  async function updateCostingSettings(input) {
    const result = await request("tpv-products", { method: "PATCH", body: JSON.stringify({ action: "settings_update", ...input }) });
    return result.settings;
  }

  async function configureRecipe(input) {
    const result = await request("tpv-products", { method: "PATCH", body: JSON.stringify({ action: "recipe_configure", ...input }) });
    return result.recipe;
  }

  async function addRecipeLine(input) {
    const result = await request("tpv-products", { method: "POST", body: JSON.stringify({ action: "recipe_line_add", ...input }) });
    return result.line;
  }

  async function deleteRecipeLine(id) {
    return request("tpv-products", { method: "DELETE", body: JSON.stringify({ action: "recipe_line_delete", id }) });
  }

  async function loadAccounting() {
    const result = await request("tpv-products?scope=accounting");
    return result.invoices || [];
  }

  async function createSupplierInvoice(input) {
    const result = await request("tpv-products", { method: "POST", body: JSON.stringify({ action: "invoice_create", ...input }) });
    return result.invoice;
  }

  function fileContentBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",").pop());
      reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
      reader.readAsDataURL(file);
    });
  }

  function productImagePayload(file) {
    if (!file?.size) return Promise.reject(new Error("Selecciona una foto para el artículo."));
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) return Promise.reject(new Error("Usa una foto JPG, PNG o WEBP."));
    if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error("La foto original no puede superar 20 MB."));
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        const maximumSide = 1400;
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const scale = Math.min(1, maximumSide / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob(async (blob) => {
          if (!blob) { reject(new Error("No se pudo preparar la foto.")); return; }
          try {
            const contentBase64 = await fileContentBase64(blob);
            const stem = String(file.name || "producto").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_") || "producto";
            resolve({ fileName: `${stem}.jpg`, mimeType: "image/jpeg", contentBase64 });
          } catch (error) { reject(error); }
        }, "image/jpeg", 0.84);
      };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("No se pudo abrir la foto.")); };
      image.src = objectUrl;
    });
  }

  async function uploadSupplierInvoiceFile(file) {
    const contentBase64 = await fileContentBase64(file);
    const result = await request("tpv-products", { method: "POST", body: JSON.stringify({ action: "invoice_file_upload", fileName: file.name, mimeType: file.type, contentBase64 }) });
    return result;
  }

  async function uploadProductImage(file) {
    const payload = await productImagePayload(file);
    const result = await request("tpv-products", { method: "POST", body: JSON.stringify({ action: "product_image_upload", ...payload }) });
    return result.url;
  }

  async function getSupplierInvoiceFileUrl(invoiceId) {
    const result = await request(`tpv-products?scope=invoice_file&invoiceId=${encodeURIComponent(invoiceId)}`);
    return result.url;
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

  async function payOrder(orderId, method, lines, paymentMethodId) {
    const result = await request("tpv-orders", { method: "PATCH", body: JSON.stringify({ orderId, action: "pay", method, lines, paymentMethodId }) });
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

  async function loadStaff() {
    const result = await request("tpv-staff");
    return result.users || [];
  }

  async function createStaff(input) {
    const result = await request("tpv-staff", { method: "POST", body: JSON.stringify(input) });
    return result.user;
  }

  window.BC_TPV_CLOUD = {
    archiveProduct,
    addCashMovement,
    addCashCount,
    closeCashSession,
    createProduct,
    createStaff,
    createIngredient,
    createSupplierInvoice,
    createTable,
    deleteTable,
    getSession,
    loadTables,
    login,
    loadCashSession,
    loadPaymentMethods,
    loadShift,
    loadCategories,
    loadKitchenOrders,
    loadOrders,
    loadProducts,
    loadSales,
    loadStaff,
    loadTableHistory,
    loadProduction,
    loadAccounting,
    uploadSupplierInvoiceFile,
    uploadProductImage,
    getSupplierInvoiceFileUrl,
    logout,
    request,
    reorderCategories,
    payOrder,
    saveOrder,
    saveRemoteProducts,
    saveRemoteCategories,
    saveRemoteTables,
    tableId,
    openOrder,
    openCashSession,
    createPaymentMethod,
    startShift,
    seedProducts,
    sendOrderToKitchen,
    updateKitchenOrder,
    updateProduct,
    updateIngredient,
    updateTable,
    updateCostingSettings,
    configureRecipe,
    addRecipeLine,
    deleteRecipeLine,
    endShift,
  };
})();
