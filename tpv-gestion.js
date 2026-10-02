(function () {
  const Core = window.BC_TPV;
  const Cloud = window.BC_TPV_CLOUD;
  const root = document.getElementById("tpv-gestion-root");
  if (!Core || !root) return;

  const state = { tab: "ventas", search: "", staff: [], cashSession: null, cashHistory: [], shiftHistory: [], tableHistory: [], accountingInvoices: [], accountingAccounts: [], accountingEntries: [], accountingReady: null, reservations: { slots: [], menus: [], reservations: [] }, selectedLoyaltyCustomerId: null, production: { ingredients: [], recipes: [], recipeLines: [], settings: null }, recipeProductId: "", editingId: null, creatingProduct: window.location.hash === "#nuevo-articulo", editingTableId: null, deletingTableId: null, loginOpen: false, loginUsername: "carlos", data: Core.loadData(), toast: null };
  let toastTimer = null;
  let draggedTable = null;

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function product(productId) { return Core.getProduct(productId, state.data); }
  function save() { Core.saveData(state.data); }
  function session() { return Cloud?.getSession?.() || null; }
  function isCloudConnected() { return Boolean(session()); }
  async function refreshCloudTables() {
    if (!isCloudConnected()) return;
    const tables = await Cloud.loadTables();
    Cloud.saveRemoteTables(state.data, tables);
    save();
  }
  async function refreshCloudProducts(includeInactive = true) {
    if (!isCloudConnected()) return;
    let products = await Cloud.loadProducts(includeInactive);
    if (!products.length && ["admin", "manager"].includes(session().user.role)) products = await Cloud.seedProducts();
    const categories = await Cloud.loadCategories();
    Cloud.saveRemoteProducts(state.data, products);
    Cloud.saveRemoteCategories(state.data, categories);
    save();
  }
  async function refreshCloudSales() {
    if (!isCloudConnected()) return;
    const sales = await Cloud.loadSales();
    const byDatabaseId = Object.fromEntries(Object.entries(state.data.cloudProductIds || {}).map(([externalId, id]) => [id, externalId]));
    state.data.sales = sales.map((sale) => ({
      id: `V-${sale.order_number}`,
      tableId: String(sale.table_number || "—"),
      totalCents: Number(sale.total_cents || 0),
      method: sale.payment_method,
      paidAt: sale.closed_at,
      lines: (sale.pos_order_items || []).map((item) => ({ productId: byDatabaseId[item.product_id], qty: Number(item.quantity || 0) })).filter((line) => line.productId && line.qty > 0),
    }));
    save();
  }
  async function refreshCloudStaff() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session().user.role)) return;
    state.staff = await Cloud.loadStaff();
  }
  async function refreshCloudCash() {
    if (!isCloudConnected()) return;
    try {
      state.cashSession = await Cloud.loadCashSession();
      if (["admin", "manager"].includes(session().user.role)) state.cashHistory = await Cloud.loadCashSession(true);
    } catch (error) {
      state.cashSession = null;
      state.cashHistory = [];
    }
  }
  async function refreshCloudShiftHistory() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session().user.role)) return;
    try { state.shiftHistory = await Cloud.loadShift(true); } catch (error) { state.shiftHistory = []; }
  }
  async function refreshCloudTableHistory() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session().user.role)) return;
    try { state.tableHistory = await Cloud.loadTableHistory(); } catch (error) { state.tableHistory = []; }
  }
  async function refreshCloudProduction() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session().user.role)) return;
    try { state.production = await Cloud.loadProduction(); } catch (error) { state.production = { ingredients: [], recipes: [], recipeLines: [], settings: null }; }
  }
  async function refreshCloudAccounting() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session().user.role)) return;
    try {
      const accounting = await Cloud.loadAccounting();
      state.accountingInvoices = Array.isArray(accounting.invoices) ? accounting.invoices : [];
      state.accountingAccounts = Array.isArray(accounting.accounts) ? accounting.accounts : [];
      state.accountingEntries = Array.isArray(accounting.entries) ? accounting.entries : [];
      state.accountingReady = accounting.ledgerEnabled !== false;
    } catch (error) {
      state.accountingInvoices = [];
      state.accountingAccounts = [];
      state.accountingEntries = [];
      state.accountingReady = false;
    }
  }
  async function refreshCloudReservations() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session().user.role)) return;
    const from = new Date(); from.setDate(from.getDate() - 1);
    const to = new Date(); to.setDate(to.getDate() + 90);
    const formatDate = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    try { state.reservations = await Cloud.loadReservations(formatDate(from), formatDate(to)); } catch (error) { state.reservations = { slots: [], menus: [], reservations: [] }; }
  }
  function flash(message) {
    state.toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = null; render(); }, 2600);
  }
  function salesTotal(sales) { return sales.reduce((total, sale) => total + Number(sale.totalCents || 0), 0); }
  function groupSales() {
    const counts = new Map();
    state.data.sales.forEach((sale) => (sale.lines || []).forEach((line) => counts.set(line.productId, (counts.get(line.productId) || 0) + line.qty)));
    return [...counts.entries()].map(([productId, qty]) => ({ product: product(productId), qty })).filter((item) => item.product).sort((first, second) => second.qty - first.qty).slice(0, 6);
  }
  function tableLayout() { return Core.getTables(state.data); }
  function validTableNumber(value) { return /^\d{1,3}$/.test(String(value || "").trim()); }
  function isTableOccupied(tableId) {
    return Boolean(state.data.tables[tableId]) || state.data.kitchenOrders.some((order) => order.tableId === tableId && !["delivered", "completed", "cancelled"].includes(order.status));
  }
  function moveTableReferences(previousId, nextId) {
    if (previousId === nextId) return;
    if (state.data.tables[previousId]) {
      state.data.tables[nextId] = state.data.tables[previousId];
      delete state.data.tables[previousId];
    }
    state.data.kitchenOrders.forEach((order) => { if (order.tableId === previousId) order.tableId = nextId; });
    state.data.sales.forEach((sale) => { if (sale.tableId === previousId) sale.tableId = nextId; });
  }
  function nav() {
    return `<aside class="tpv-management-sidebar"><a class="tpv-brand" href="tpv.html"><span class="tpv-brand__mark">C</span><span class="tpv-brand__type"><strong>Contrastes</strong><small>Gestión TPV</small></span></a><nav><a href="tpv.html">← Volver al TPV</a><button type="button" class="${state.tab === "ventas" ? "is-active" : ""}" data-tab="ventas">Ventas</button><button type="button" class="${state.tab === "historial" ? "is-active" : ""}" data-tab="historial">Historial de mesas</button><button type="button" class="${state.tab === "caja" ? "is-active" : ""}" data-tab="caja">Caja y cierres</button><button type="button" class="${state.tab === "articulos" ? "is-active" : ""}" data-tab="articulos">Artículos y precios</button><button type="button" class="${state.tab === "reservas" ? "is-active" : ""}" data-tab="reservas">Reservas online</button><button type="button" class="${state.tab === "fidelizacion" ? "is-active" : ""}" data-tab="fidelizacion">Fidelización · Duros</button><button type="button" class="${state.tab === "produccion" ? "is-active" : ""}" data-tab="produccion">Producción</button><button type="button" class="${state.tab === "escandallo" ? "is-active" : ""}" data-tab="escandallo">Escandallo</button><button type="button" class="${state.tab === "sala" ? "is-active" : ""}" data-tab="sala">Sala y mesas</button><button type="button" class="${state.tab === "personal" ? "is-active" : ""}" data-tab="personal">Personal y PIN</button><button type="button" class="${state.tab === "contabilidad" ? "is-active" : ""}" data-tab="contabilidad">Contabilidad</button></nav><p>Panel interno<br>Datos guardados en la base central.</p></aside>`;
  }
  function topbar() {
    const title = { ventas: "Ventas", historial: "Historial de mesas", caja: "Caja y cierres", articulos: "Artículos y precios", reservas: "Reservas online", fidelizacion: "Fidelización", produccion: "Producción", escandallo: "Escandallo", sala: "Sala y mesas", personal: "Personal y PIN", contabilidad: "Contabilidad" }[state.tab];
    const user = session()?.user;
    return `<header class="tpv-gestion-topbar"><div><span>Administración</span><h1>${title}</h1></div><div class="tpv-gestion-topbar__actions"><span class="tpv-live">${user ? `Base central · ${escapeHtml(user.displayName)}` : "Datos locales"}</span>${user ? `<button class="tpv-action is-secondary" type="button" data-logout>Salir</button>` : `<button class="tpv-action is-secondary" type="button" data-open-login>Acceder</button>`}<a class="tpv-action is-secondary" href="tpv.html">TPV camarero</a></div></header>`;
  }
  function renderBars(rows, type) {
    const max = Math.max(...rows.map((row) => row.value), 1);
    return `<div class="tpv-chart-bars">${rows.map((row) => `<div class="tpv-chart-bar"><span style="--bar:${Math.max(8, Math.round(row.value / max * 100))}%"></span><b>${escapeHtml(row.label)}</b><small>${type === "euros" ? Core.formatEuros(row.value) : `${row.value} uds.`}</small></div>`).join("")}</div>`;
  }
  function renderSales() {
    const sales = state.data.sales;
    const total = salesTotal(sales);
    const card = sales.filter((sale) => sale.method === "card").reduce((sum, sale) => sum + sale.totalCents, 0);
    const cash = sales.filter((sale) => sale.method === "cash").reduce((sum, sale) => sum + sale.totalCents, 0);
    const average = sales.length ? Math.round(total / sales.length) : 0;
    const products = groupSales();
    return `<section class="tpv-gestion-content"><div class="tpv-gestion-metrics"><article><span>Documentos</span><strong>${sales.length}</strong></article><article><span>Ventas</span><strong>${Core.formatEuros(total)}</strong></article><article><span>Ticket medio</span><strong>${Core.formatEuros(average)}</strong></article><article><span>Mesas abiertas</span><strong>${Object.keys(state.data.tables).length}</strong></article></div><div class="tpv-gestion-grid"><section class="tpv-gestion-card"><header><h2>Ventas por forma de pago</h2><span>Turno actual</span></header>${renderBars([{ label: "Tarjeta", value: card }, { label: "Efectivo", value: cash }], "euros")}</section><section class="tpv-gestion-card"><header><h2>Artículos más vendidos</h2><span>Según ventas registradas</span></header>${products.length ? renderBars(products.map((item) => ({ label: item.product.name, value: item.qty })), "units") : `<p class="tpv-gestion-empty">Aún no hay ventas con detalle.</p>`}</section></div><section class="tpv-gestion-card"><header><h2>Últimas ventas</h2><span>${sales.length} documentos registrados</span></header><div class="tpv-sales-table"><div class="tpv-sales-row is-heading"><span>Documento</span><span>Mesa</span><span>Forma de pago</span><span>Total</span></div>${sales.length ? sales.slice(0, 8).map((sale) => `<div class="tpv-sales-row"><b>${escapeHtml(sale.id)}</b><span>Mesa ${escapeHtml(sale.tableId)}</span><span>${sale.method === "card" ? "Tarjeta" : "Efectivo"}</span><strong>${Core.formatEuros(sale.totalCents)}</strong></div>`).join("") : `<p class="tpv-gestion-empty">Aún no hay ventas registradas.</p>`}</div></section></section>`;
  }
  function serviceDuration(order) {
    if (!order?.opened_at) return "—";
    const end = order.closed_at ? new Date(order.closed_at).getTime() : Date.now();
    const minutes = Math.max(0, Math.floor((end - new Date(order.opened_at).getTime()) / 60000));
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  }
  function eventLabel(event) {
    return ({ opened: "Mesa abierta", items_added: "Pedido añadido", sent_to_kitchen: "Enviado a cocina", kitchen_preparing: "En preparación", kitchen_ready: "Listo para servir", served: "Entregado", paid: "Mesa cerrada" })[event.event_type] || event.summary;
  }
  function renderTableHistory() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session()?.user?.role)) return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><p class="tpv-gestion-empty">Inicia sesión como administrador para consultar el historial de servicio.</p></section></section>`;
    const groups = new Map();
    state.tableHistory.forEach((event) => {
      const key = event.pos_order_id;
      if (!groups.has(key)) groups.set(key, { order: event.pos_orders || {}, events: [] });
      groups.get(key).events.push(event);
    });
    const services = [...groups.values()].sort((first, second) => new Date(second.events[0].occurred_at) - new Date(first.events[0].occurred_at));
    const active = services.filter((service) => !service.order.closed_at).length;
    return `<section class="tpv-gestion-content"><div class="tpv-gestion-metrics"><article><span>Servicios guardados</span><strong>${services.length}</strong></article><article><span>Mesas activas</span><strong>${active}</strong></article><article><span>Eventos registrados</span><strong>${state.tableHistory.length}</strong></article><article><span>Detalle</span><strong>Por pedido</strong></article></div><section class="tpv-gestion-card"><header><div><h2>Historial de servicio por mesa</h2><span>Hora de apertura, pedidos añadidos, cocina, entrega y cierre.</span></div></header><div class="tpv-service-history">${services.length ? services.map((service) => { const order = service.order; const events = service.events.slice().sort((first, second) => new Date(first.occurred_at) - new Date(second.occurred_at)); return `<article class="tpv-service-card"><header><div><span>Mesa</span><h3>${escapeHtml(order.table_number || "—")}</h3><small>Pedido #${escapeHtml(order.order_number || "—")} · abierto ${order.opened_at ? new Date(order.opened_at).toLocaleString("es-ES") : "—"}</small></div><div><strong>${serviceDuration(order)}</strong><em>${order.closed_at ? "Cerrada" : "En curso"}</em></div></header><ol>${events.map((event) => { const items = Array.isArray(event.items) ? event.items : []; return `<li><time>${new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.occurred_at))}</time><div><b>${escapeHtml(eventLabel(event))}</b><small>${escapeHtml(event.staff_users?.display_name || "Sistema")}${items.length ? ` · ${items.map((item) => `${item.quantity}× ${item.name}${item.variant ? ` (${item.variant})` : ""}`).join(", ")}` : ""}</small></div></li>`; }).join("")}</ol><footer>${order.closed_at ? `Cerrada ${new Date(order.closed_at).toLocaleString("es-ES")}` : "Servicio aún abierto"}${Number.isFinite(Number(order.total_cents)) ? `<strong>${Core.formatEuros(order.total_cents)}</strong>` : ""}</footer></article>`; }).join("") : `<p class="tpv-gestion-empty">Aún no hay servicios registrados. Se crearán al abrir una mesa desde el TPV.</p>`}</div></section><aside class="tpv-management-note"><h2>Lectura del servicio</h2><p>Por cada mesa se guarda cuándo se abrió, qué se añadió en cada momento y el paso por cocina.</p><p>Al cobrar se fija la duración total: por ejemplo, 1 h 10 min desde la apertura hasta el cierre.</p></aside></section>`;
  }
  function renderCashManagement() {
    const active = state.cashSession;
    const summary = active?.summary;
    const history = state.cashHistory;
    if (!isCloudConnected()) return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><p class="tpv-gestion-empty">Inicia sesión como administrador para consultar las cajas y cierres.</p></section></section>`;
    return `<section class="tpv-gestion-content"><div class="tpv-gestion-metrics"><article><span>Caja actual</span><strong>${active ? "Abierta" : "Cerrada"}</strong></article><article><span>Ventas del turno</span><strong>${Core.formatEuros(summary?.totalSalesCents || 0)}</strong></article><article><span>Efectivo esperado</span><strong>${Core.formatEuros(summary?.expectedCashCents || 0)}</strong></article><article><span>Tarjeta</span><strong>${Core.formatEuros(summary?.cardSalesCents || 0)}</strong></article></div><section class="tpv-gestion-card"><header><div><h2>Operativa de caja</h2><span>${active ? `Abierta el ${new Date(active.opened_at).toLocaleString("es-ES")}` : "No hay ningún turno abierto"}</span></div><a class="tpv-action" href="tpv.html">Ir a Caja</a></header>${active ? `<div class="tpv-cash-management"><p>Fondo inicial: <strong>${Core.formatEuros(active.opening_float_cents)}</strong></p><p>Ventas efectivo: <strong>${Core.formatEuros(summary.cashSalesCents)}</strong></p><p>Movimientos manuales: <strong>${summary.movementCents >= 0 ? "+" : ""}${Core.formatEuros(summary.movementCents)}</strong></p></div>` : `<p class="tpv-gestion-empty">Abre el turno desde la sección Caja del TPV.</p>`}</section><section class="tpv-gestion-card"><header><div><h2>Últimos cierres</h2><span>Se conservan para revisar el resultado del turno</span></div></header><div class="tpv-sales-table"><div class="tpv-cash-history-row is-heading"><span>Cerrado</span><span>Ventas</span><span>Esperado</span><span>Contado</span><span>Diferencia</span></div>${history.length ? history.map((cashSession) => `<div class="tpv-cash-history-row"><span>${new Date(cashSession.closed_at).toLocaleString("es-ES")}</span><strong>${Core.formatEuros(cashSession.total_sales_cents)}</strong><span>${Core.formatEuros(cashSession.expected_cash_cents)}</span><span>${Core.formatEuros(cashSession.counted_cash_cents)}</span><b class="${Number(cashSession.difference_cents) === 0 ? "" : "is-difference"}">${Core.formatEuros(cashSession.difference_cents)}</b></div>`).join("") : `<p class="tpv-gestion-empty">Aún no hay cierres registrados.</p>`}</div></section></section>`;
  }
  function renderArticles() {
    const query = state.search.trim().toLocaleLowerCase("es");
    const products = Core.getProducts(state.data, true).filter((item) => `${item.name} ${item.category}`.toLocaleLowerCase("es").includes(query));
    const canManage = ["admin", "manager"].includes(session()?.user?.role);
    const categories = (state.data.remoteCategories || []).filter((category) => category.active !== false);
    const photoCount = products.filter((item) => Boolean(item.image)).length;
    const categoryOrder = categories.length ? `<section class="tpv-gestion-card"><header><div><h2>Orden de familias en la carta</h2><span>Este orden aparece en los filtros del TPV de camareros</span></div></header><div class="tpv-category-order">${categories.map((category, index) => `<article><span>${index + 1}</span><b>${escapeHtml(category.name)}</b>${canManage ? `<div><button class="tpv-edit-button" type="button" data-move-category="${category.id}" data-direction="up" ${index === 0 ? "disabled" : ""}>↑</button><button class="tpv-edit-button" type="button" data-move-category="${category.id}" data-direction="down" ${index === categories.length - 1 ? "disabled" : ""}>↓</button></div>` : ""}</article>`).join("")}</div></section>` : "";
    const catalogRows = products.map((item) => {
      const pvp = item.priceCents;
      const cost = state.data.costs?.[item.id];
      const margin = Number.isFinite(Number(cost)) ? pvp - Number(cost) : null;
      const photo = item.image ? `<img class="tpv-article-photo" src="${escapeHtml(item.image)}" alt="">` : `<span class="tpv-article-photo-empty">Sin foto</span>`;
      return `<div class="tpv-articles-row ${item.active === false ? "is-inactive" : ""}"><div class="tpv-article-name">${photo}<div><b>${escapeHtml(item.name)}${item.active === false ? " · Desactivado" : ""}</b><small>${escapeHtml(item.description)}</small></div></div><span>${escapeHtml(item.category)}</span><strong>${Core.formatEuros(pvp)}</strong><span>${margin === null ? `<em>Pendiente</em>` : Core.formatEuros(cost)}</span><span>${margin === null ? "—" : Core.formatEuros(margin)}</span>${canManage ? `<button class="tpv-edit-button" type="button" data-edit-product="${item.id}">Editar</button>` : ""}</div>`;
    }).join("") || `<p class="tpv-gestion-empty">No se han encontrado artículos.</p>`;
    return `<section class="tpv-gestion-content">${categoryOrder}<section class="tpv-gestion-card"><header><div><h2>Catálogo del restaurante</h2><span>${products.length} artículos · ${photoCount} con foto · sincronizados en todos los TPV</span></div><div class="tpv-gestion-header-actions"><label class="tpv-search"><span>⌕</span><input type="search" value="${escapeHtml(state.search)}" placeholder="Buscar artículo" data-search-products></label>${canManage ? `<a class="tpv-action" href="tpv-articulo-nuevo">Nuevo artículo</a>` : ""}</div></header><div class="tpv-articles-table"><div class="tpv-articles-row is-heading"><span>Artículo</span><span>Familia</span><span>PVP</span><span>Coste compra</span><span>Margen</span><span></span></div>${catalogRows}</div></section><aside class="tpv-management-note"><h2>Fotos del catálogo</h2><p>Hay fotos provisionales de alimentos para identificar la carta. Entra en <strong>Editar</strong> y toma o selecciona la foto real de cada artículo cuando la tengáis.</p><p>Las fotos propias se guardan en la base central y sustituyen automáticamente a la provisional en todos los TPV conectados.</p></aside></section>`;
  }
  function renderLayoutMap(tables) {
    return `<section class="tpv-gestion-card tpv-layout-editor"><header><div><h2>Mapa de mesas</h2><span>Arrastra una mesa para cambiar su posición en el plano</span></div><span class="tpv-layout-editor__hint">Cambios guardados al soltar</span></header><div class="tpv-layout-map-scroll"><div class="tpv-layout-map" data-layout-map><div class="tpv-layout-map__bar">Barra</div><div class="tpv-layout-map__plants" aria-hidden="true">●<br>●<br>●<br>●</div>${tables.map((table) => `<button class="tpv-layout-table ${table.area === "wall" ? "is-wall" : ""}" type="button" style="--x:${table.x};--y:${table.y}" data-layout-table="${table.id}" aria-label="Mover mesa ${table.id}"><span></span><b>${table.id}</b></button>`).join("")}</div></div></section>`;
  }
  function renderTables() {
    const tables = tableLayout();
    return `<section class="tpv-gestion-content">${renderLayoutMap(tables)}<section class="tpv-gestion-card"><header><div><h2>Mesas configuradas</h2><span>${tables.length} mesas · los números son únicos</span></div><form class="tpv-table-add" data-table-add-form><label>Nueva mesa<input name="tableNumber" inputmode="numeric" maxlength="3" placeholder="Ej. 28" required></label><label>Zona<select name="area"><option value="sala">Sala</option><option value="wall">Pared</option></select></label><button class="tpv-action" type="submit">Añadir mesa</button></form></header><div class="tpv-table-settings"><div class="tpv-table-settings__head"><span>Número</span><span>Zona</span><span>Estado</span><span></span></div>${tables.map((table) => `<div class="tpv-table-settings__row"><strong>Mesa ${table.id}</strong><span class="tpv-zone">${table.area === "wall" ? "Pared" : "Sala"}</span><span class="tpv-table-state ${isTableOccupied(table.id) ? "is-open" : ""}">${isTableOccupied(table.id) ? "Comanda activa" : "Libre"}</span><div><button class="tpv-edit-button" type="button" data-edit-table="${table.id}">Editar</button><button class="tpv-delete-button" type="button" data-delete-table="${table.id}" ${isTableOccupied(table.id) ? "disabled title=\"Cierra la comanda antes de eliminarla\"" : ""}>Quitar</button></div></div>`).join("")}</div></section><aside class="tpv-management-note"><h2>Cómo funciona</h2><p>Al cambiar un número se mantiene su comanda, pedidos de cocina y ventas asociadas. No se permite repetir ningún número.</p><p>Por seguridad, una mesa con comanda o pedido de cocina activo no puede eliminarse.</p><p>Puedes arrastrar cada mesa en el mapa superior para colocarla en la zona real del local.</p></aside></section>`;
  }
  function roleLabel(role) { return ({ admin: "Administrador", manager: "Gestor", waiter: "Camarero/a", kitchen: "Cocina" })[role] || role; }
  function shiftDuration(shift) {
    const end = shift.ended_at ? new Date(shift.ended_at).getTime() : Date.now();
    const minutes = Math.max(0, Math.floor((end - new Date(shift.started_at).getTime()) / 60000));
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  }
  function shiftStartedAt(shift) {
    return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(shift.started_at));
  }
  function renderStaff() {
    const user = session()?.user;
    if (!user) return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><h2>Acceso requerido</h2><p class="tpv-gestion-empty">Inicia sesión como administrador para gestionar al personal.</p></section></section>`;
    const canManage = user.role === "admin";
    const shifts = state.shiftHistory.slice(0, 12);
    return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><header><div><h2>Accesos del equipo</h2><span>Los camareros entran solo seleccionando su nombre</span></div></header>${canManage ? `<form class="tpv-staff-form" data-staff-form><label>Nombre<input name="displayName" placeholder="Matías o Lucía" required></label><label>Usuario<input name="username" pattern="[a-z0-9._-]{3,40}" placeholder="matias" required></label><label>Rol<select name="role"><option value="waiter">Camarero/a</option><option value="kitchen">Cocina</option><option value="manager">Gestor</option><option value="admin">Administrador</option></select></label><label>PIN <small>solo gestión/cocina</small><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,10}" minlength="4" maxlength="10"></label><button class="tpv-action" type="submit">Crear acceso</button></form>` : `<p class="tpv-gestion-empty">Tu rol permite ver el personal, pero no crear ni cambiar PIN.</p>`}<div class="tpv-staff-list">${state.staff.length ? state.staff.map((staff) => `<article><div><b>${escapeHtml(staff.displayName)}</b><small>@${escapeHtml(staff.username)} · ${roleLabel(staff.role)}</small></div><span class="tpv-table-state ${staff.active ? "" : "is-open"}">${staff.active ? "Activo" : "Desactivado"}</span></article>`).join("") : `<p class="tpv-gestion-empty">Cargando personal…</p>`}</div><div class="tpv-shift-history"><h3>Últimas jornadas</h3><span>Entrada, salida y tiempo total por empleado.</span>${shifts.length ? shifts.map((shift) => `<article><div><b>${escapeHtml(shift.staff_users?.display_name || "Empleado")}</b><small>${roleLabel(shift.staff_users?.role || "")} · entrada ${shiftStartedAt(shift)}</small></div><div><strong>${shiftDuration(shift)}</strong><em>${shift.ended_at ? "Finalizada" : "En curso"}</em></div></article>`).join("") : `<p class="tpv-gestion-empty">Aún no hay jornadas registradas.</p>`}</div></section><aside class="tpv-management-note"><h2>Control de jornada</h2><p>Cada camarero y cocina pulsa <strong>He llegado</strong> al empezar y <strong>Finalizar jornada</strong> al salir desde su pantalla.</p><p>Las últimas jornadas quedan aquí para revisar el tiempo trabajado.</p></aside></section>`;
  }
  function loyaltyCustomers() { return Array.isArray(state.data.loyaltyCustomers) ? state.data.loyaltyCustomers : []; }
  function renderLoyalty() {
    const customers = loyaltyCustomers();
    const duros = customers.reduce((total, customer) => total + Number(customer.duros || 0), 0);
    return `<section class="tpv-gestion-content"><div class="tpv-gestion-metrics"><article><span>Clientes</span><strong>${customers.length}</strong></article><article><span>Duros emitidos</span><strong>${duros}</strong></article><article><span>Regla inicial</span><strong>1 € = 1 Duro</strong></article><article><span>Canje</span><strong>Por definir</strong></article></div><section class="tpv-gestion-card"><header><div><h2>Alta de cliente</h2><span>Base inicial para el programa de fidelización</span></div></header><form class="tpv-loyalty-form" data-loyalty-form><label>Nombre<input name="name" maxlength="80" placeholder="Nombre del cliente" required></label><label>Teléfono<input name="phone" inputmode="tel" maxlength="30" placeholder="Opcional"></label><label>Email<input name="email" type="email" maxlength="120" placeholder="Opcional"></label><button class="tpv-action" type="submit">Crear cliente</button></form><div class="tpv-loyalty-list">${customers.length ? customers.map((customer) => `<button type="button" data-loyalty-customer="${customer.id}"><div><b>${escapeHtml(customer.name)}</b><small>${escapeHtml(customer.phone || customer.email || "Sin contacto")}</small></div><strong>${Number(customer.duros || 0)} Duros</strong></button>`).join("") : `<p class="tpv-gestion-empty">Aún no hay clientes. Crea el primero para enseñar el programa.</p>`}</div></section><aside class="tpv-management-note"><h2>Cómo crecerá</h2><p>Al pulsar un cliente podrás revisar sus consumos, devoluciones y Duros. El portal de cliente se conectará a esta misma información central.</p></aside></section>`;
  }
  function loyaltyModal() {
    const customer = loyaltyCustomers().find((item) => item.id === state.selectedLoyaltyCustomerId);
    if (!customer) return "";
    const sales = state.data.sales.filter((sale) => sale.customerId === customer.id);
    return `<div class="tpv-modal-backdrop"><section class="tpv-modal"><button class="tpv-modal__close" type="button" data-close-loyalty aria-label="Cerrar">×</button><h2>${escapeHtml(customer.name)}</h2><p>${escapeHtml(customer.phone || customer.email || "Sin contacto")}</p><div class="tpv-gestion-metrics"><article><span>Duros</span><strong>${Number(customer.duros || 0)}</strong></article><article><span>Consumos</span><strong>${sales.length}</strong></article></div><h3>Historial de consumo</h3>${sales.length ? `<ul class="tpv-cash-movements">${sales.map((sale) => `<li><span>${new Date(sale.paidAt).toLocaleString("es-ES")}</span><b>${Core.formatEuros(sale.totalCents)}</b></li>`).join("")}</ul>` : `<p class="tpv-gestion-empty">Aún no hay consumos vinculados a este cliente.</p>`}<h3>Devoluciones</h3><p class="tpv-gestion-empty">No hay devoluciones registradas.</p></section></div>`;
  }
  function reservationDateLabel(value) { return new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" }); }
  function renderReservations() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session()?.user?.role)) return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><p class="tpv-gestion-empty">Inicia sesión como administrador para configurar y confirmar reservas online.</p></section></section>`;
    const data = state.reservations;
    const pending = data.reservations.filter((item) => item.status === "pending").length;
    const confirmed = data.reservations.filter((item) => item.status === "confirmed").length;
    const free = data.slots.filter((slot) => slot.enabled).reduce((sum, slot) => sum + Math.max(0, Number(slot.capacity_people) - Number(slot.reserved_people)), 0);
    const today = new Date().toISOString().slice(0, 10);
    return `<section class="tpv-gestion-content"><div class="tpv-gestion-metrics"><article><span>Solicitudes pendientes</span><strong>${pending}</strong></article><article><span>Reservas confirmadas</span><strong>${confirmed}</strong></article><article><span>Turnos publicados</span><strong>${data.slots.filter((slot) => slot.enabled).length}</strong></article><article><span>Plazas libres</span><strong>${free}</strong></article></div><section class="tpv-gestion-card"><header><div><h2>Disponibilidad para reservas</h2><span>Publica cada fecha y hora que quieras ofrecer en la web.</span></div></header><form class="tpv-reservation-slot-form" data-reservation-slot-form><label>Fecha<input name="serviceDate" type="date" min="${today}" required></label><label>Hora<input name="serviceTime" type="time" required></label><label>Aforo<input name="capacityPeople" type="number" min="1" max="200" value="20" required></label><button class="tpv-action" type="submit">Publicar turno</button></form><div class="tpv-reservation-slots">${data.slots.length ? data.slots.map((slot) => `<form data-reservation-slot-update><input type="hidden" name="id" value="${slot.id}"><span><b>${reservationDateLabel(slot.service_date)}</b><small>${String(slot.service_time).slice(0, 5)}</small></span><label>Aforo<input name="capacityPeople" type="number" min="${slot.reserved_people}" max="200" value="${slot.capacity_people}" required></label><strong>${slot.reserved_people}/${slot.capacity_people}<small> reservadas</small></strong><label class="tpv-check-label"><input name="enabled" type="checkbox" ${slot.enabled ? "checked" : ""}> Visible</label><button class="tpv-edit-button" type="submit">Guardar</button></form>`).join("") : `<p class="tpv-gestion-empty">Todavía no hay turnos publicados. Crea el primero para activar el calendario web.</p>`}</div></section><section class="tpv-gestion-card"><header><div><h2>Menús para grupos</h2><span>El cliente los verá como una preferencia al reservar; no se cobra todavía.</span></div></header><form class="tpv-reservation-menu-form" data-reservation-menu-form><label>Nombre<input name="name" maxlength="120" placeholder="Menú cena de grupo" required></label><label>Precio por persona (€)<input name="price" type="number" min="0" step="0.01" placeholder="Opcional"></label><label>Descripción<input name="description" maxlength="500" placeholder="Incluye bebida, entrantes…"></label><label>Orden<input name="sortOrder" type="number" min="0" value="0"></label><button class="tpv-action" type="submit">Añadir menú</button></form><div class="tpv-reservation-menus">${data.menus.length ? data.menus.map((menu) => `<form data-reservation-menu-update><input type="hidden" name="id" value="${menu.id}"><label>Nombre<input name="name" value="${escapeHtml(menu.name)}" required></label><label>Precio €<input name="price" type="number" min="0" step="0.01" value="${menu.price_cents === null ? "" : (Number(menu.price_cents) / 100).toFixed(2)}"></label><label>Descripción<input name="description" value="${escapeHtml(menu.description || "")}"></label><label>Orden<input name="sortOrder" type="number" min="0" value="${menu.sort_order || 0}"></label><label class="tpv-check-label"><input name="active" type="checkbox" ${menu.active ? "checked" : ""}> Visible</label><button class="tpv-edit-button" type="submit">Guardar</button></form>`).join("") : `<p class="tpv-gestion-empty">No hay menús creados. Puedes seguir aceptando reservas a la carta.</p>`}</div></section><section class="tpv-gestion-card"><header><div><h2>Solicitudes recibidas</h2><span>Confirma o cancela cada solicitud. Cancelar devuelve automáticamente las plazas al calendario.</span></div></header><div class="tpv-reservation-list">${data.reservations.length ? data.reservations.map((reservation) => `<article><div class="tpv-reservation-list__date"><b>${reservationDateLabel(reservation.service_date)}</b><strong>${String(reservation.service_time).slice(0, 5)}</strong></div><div><b>${escapeHtml(reservation.customer_name)} · ${reservation.party_size} pers.</b><small>${escapeHtml(reservation.customer_phone)}${reservation.customer_email ? ` · ${escapeHtml(reservation.customer_email)}` : ""}</small><small>${escapeHtml(reservation.menu_name || "A la carta")}${reservation.notes ? ` · ${escapeHtml(reservation.notes)}` : ""}</small></div><span class="tpv-reservation-status is-${reservation.status}">${reservation.status === "pending" ? "Pendiente" : reservation.status === "confirmed" ? "Confirmada" : reservation.status === "cancelled" ? "Cancelada" : "No presentada"}</span><div class="tpv-reservation-list__actions">${reservation.status === "pending" ? `<button type="button" class="tpv-edit-button" data-reservation-status="confirmed" data-reservation-id="${reservation.id}">Confirmar</button>` : ""}${["pending", "confirmed"].includes(reservation.status) ? `<button type="button" class="tpv-delete-button" data-reservation-status="cancelled" data-reservation-id="${reservation.id}">Cancelar</button>` : ""}</div></article>`).join("") : `<p class="tpv-gestion-empty">Aún no hay reservas recibidas para el periodo mostrado.</p>`}</div></section><aside class="tpv-management-note"><h2>Flujo de reserva</h2><p>Publica los turnos que queráis ofrecer; el calendario web solo enseñará las plazas disponibles.</p><p>La persona deja su solicitud, que aparece como pendiente. Al confirmarla o cancelarla, el aforo queda actualizado para todos.</p></aside></section>`;
  }
  function addReservationMenuImagePicker(form, menu) {
    if (form.querySelector('[name="image"]')) return;
    const orderField = form.querySelector('[name="sortOrder"]')?.closest("label");
    if (!orderField) return;
    const label = document.createElement("label");
    label.textContent = "Foto";
    const input = document.createElement("input");
    input.name = "image";
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    label.appendChild(input);
    form.insertBefore(label, orderField);
    if (menu?.image_url) {
      const image = document.createElement("img");
      image.className = "tpv-reservation-menu-photo";
      image.src = menu.image_url;
      image.alt = `Foto de ${menu.name}`;
      form.insertBefore(image, orderField);
    }
  }
  function decorateReservationMenuForms() {
    const createForm = root.querySelector("[data-reservation-menu-form]");
    if (createForm) addReservationMenuImagePicker(createForm);
    root.querySelectorAll("[data-reservation-menu-update]").forEach((form) => {
      const id = form.querySelector('[name="id"]')?.value;
      addReservationMenuImagePicker(form, state.reservations.menus.find((menu) => menu.id === id));
    });
  }
  function remoteProducts() { return (state.data.remoteProducts || []).filter((item) => item.active !== false); }
  function ingredientById(id) { return state.production.ingredients.find((item) => item.id === id); }
  function recipeForProduct(productId) { return state.production.recipes.find((recipe) => recipe.product_id === productId); }
  function recipeLines(recipeId) { return state.production.recipeLines.filter((line) => line.recipe_id === recipeId); }
  function ingredientUnitCost(ingredient) { return Number(ingredient.pack_price_cents || 0) / (1 + Number(ingredient.purchase_vat_percent || 0) / 100) / Number(ingredient.pack_quantity || 1); }
  function recipeCost(recipe) {
    if (!recipe) return null;
    const ingredientsCost = recipeLines(recipe.id).reduce((total, line) => {
      const ingredient = ingredientById(line.ingredient_id);
      return total + (ingredient ? ingredientUnitCost(ingredient) * Number(line.quantity) * (1 + Number(line.waste_percent || 0) / 100) : 0);
    }, 0);
    const settings = state.production.settings || {};
    return Math.round(ingredientsCost / Number(recipe.yield_quantity || 1) + Number(recipe.direct_cost_cents || 0) + Number(settings.overhead_per_serving_cents || 0) + Number(settings.labour_per_serving_cents || 0));
  }
  function productName(productId) { const item = remoteProducts().find((product) => product.id === productId); return item ? `${item.name}${item.variant ? ` · ${item.variant}` : ""}` : "Artículo"; }
  function forecastIngredients() {
    const demand = new Map();
    state.data.sales.forEach((sale) => (sale.lines || []).forEach((line) => {
      const productId = state.data.cloudProductIds?.[line.productId];
      const recipe = recipeForProduct(productId);
      if (!recipe) return;
      recipeLines(recipe.id).forEach((recipeLine) => {
        const used = Number(line.qty || 0) * Number(recipeLine.quantity) * (1 + Number(recipeLine.waste_percent || 0) / 100) / Number(recipe.yield_quantity || 1);
        demand.set(recipeLine.ingredient_id, (demand.get(recipeLine.ingredient_id) || 0) + used);
      });
    }));
    return state.production.ingredients.map((ingredient) => ({ ingredient, soldUsage: Number(demand.get(ingredient.id) || 0), forecastUsage: Number(demand.get(ingredient.id) || 0) * 1.5 })).filter((row) => row.soldUsage || Number(row.ingredient.minimum_stock_quantity || 0) > 0);
  }
  function formatQuantity(value, unit) { return `${Number(value || 0).toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${unit}`; }
  function renderProduction() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session()?.user?.role)) return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><p class="tpv-gestion-empty">Inicia sesión como administrador para calcular la producción.</p></section></section>`;
    const rows = forecastIngredients();
    return `<section class="tpv-gestion-content"><div class="tpv-gestion-metrics"><article><span>Ingredientes activos</span><strong>${state.production.ingredients.length}</strong></article><article><span>Recetas creadas</span><strong>${state.production.recipes.length}</strong></article><article><span>Base de previsión</span><strong>${state.data.sales.length} ventas</strong></article><article><span>Horizonte</span><strong>Próx. 3 días</strong></article></div><section class="tpv-gestion-card"><header><div><h2>Pedido sugerido de materias primas</h2><span>Consumo de ventas registradas × 1,5, descontando el stock disponible.</span></div></header><div class="tpv-production-table"><div class="tpv-production-row is-heading"><span>Materia prima</span><span>Consumido</span><span>Previsión</span><span>Stock</span><span>Comprar</span></div>${rows.length ? rows.map(({ ingredient, soldUsage, forecastUsage }) => { const target = Math.max(forecastUsage, Number(ingredient.minimum_stock_quantity || 0)); const toBuy = Math.max(0, target - Number(ingredient.stock_quantity || 0)); const packs = Math.ceil(toBuy / Number(ingredient.pack_quantity || 1)); return `<div class="tpv-production-row"><div><b>${escapeHtml(ingredient.name)}</b><small>${escapeHtml(ingredient.supplier || "Sin proveedor")}</small></div><span>${formatQuantity(soldUsage, ingredient.base_unit)}</span><span>${formatQuantity(forecastUsage, ingredient.base_unit)}</span><span>${formatQuantity(ingredient.stock_quantity, ingredient.base_unit)}</span><strong>${toBuy ? `${packs} env. · ${formatQuantity(toBuy, ingredient.base_unit)}` : "Correcto"}</strong></div>`; }).join("") : `<p class="tpv-gestion-empty">Crea ingredientes, recetas y algunas ventas para obtener una lista de compra real.</p>`}</div></section><aside class="tpv-management-note"><h2>Cómo se calcula</h2><p>Una receta transforma cada venta en gramos, mililitros o unidades de materia prima. La previsión se compara con el stock y el mínimo configurado.</p><p>Cuando tengáis más historial, podremos usar ventas reales por día de la semana y temporada.</p></aside></section>`;
  }
  function renderCosting() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session()?.user?.role)) return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><p class="tpv-gestion-empty">Inicia sesión como administrador para crear escandallos.</p></section></section>`;
    const products = remoteProducts();
    const selectedId = state.recipeProductId || products[0]?.id || "";
    const recipe = recipeForProduct(selectedId);
    const lines = recipe ? recipeLines(recipe.id) : [];
    const recipeCostCents = recipeCost(recipe);
    const selectedProduct = products.find((item) => item.id === selectedId);
    const settings = state.production.settings || { sales_vat_percent: 10, target_margin_percent: 70, overhead_per_serving_cents: 0, labour_per_serving_cents: 0 };
    const suggestedPrice = recipeCostCents === null ? null : Math.round(recipeCostCents / (1 - Number(settings.target_margin_percent) / 100) * (1 + Number(settings.sales_vat_percent) / 100));
    return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><header><div><h2>Reglas de precio y costes indirectos</h2><span>Incluye luz, mantenimiento, neveras, horno y mano de obra por cada ración.</span></div></header><form class="tpv-cost-settings" data-cost-settings-form><label>IVA venta (%)<input name="salesVatPercent" type="number" min="0" max="100" step="0.01" value="${settings.sales_vat_percent}"></label><label>Margen objetivo (%)<input name="targetMarginPercent" type="number" min="0" max="99.99" step="0.01" value="${settings.target_margin_percent}"></label><label>Gastos indirectos / ración (€)<input name="overheadPerServing" type="number" min="0" step="0.01" value="${(Number(settings.overhead_per_serving_cents || 0) / 100).toFixed(2)}"></label><label>Mano de obra / ración (€)<input name="labourPerServing" type="number" min="0" step="0.01" value="${(Number(settings.labour_per_serving_cents || 0) / 100).toFixed(2)}"></label><button class="tpv-action" type="submit">Guardar reglas</button></form></section><section class="tpv-gestion-card"><header><div><h2>Materias primas</h2><span>Alta de envases, precio de compra con IVA, stock y proveedor.</span></div></header><form class="tpv-ingredient-form" data-ingredient-create-form><label>Nombre<input name="name" required placeholder="Pan de bocadillo"></label><label>Unidad<select name="baseUnit"><option value="unidad">Unidad</option><option value="g">Gramos</option><option value="ml">Mililitros</option></select></label><label>Contenido envase<input name="packQuantity" type="number" min="0.001" step="0.001" required placeholder="1"></label><label>Compra envase (€)<input name="packPrice" type="number" min="0" step="0.01" required></label><label>IVA compra (%)<input name="purchaseVatPercent" type="number" min="0" max="100" step="0.01" value="10"></label><label>Stock actual<input name="stockQuantity" type="number" min="0" step="0.001" value="0"></label><label>Stock mínimo<input name="minimumStockQuantity" type="number" min="0" step="0.001" value="0"></label><label>Proveedor<input name="supplier" placeholder="Opcional"></label><button class="tpv-action" type="submit">Añadir materia prima</button></form><div class="tpv-ingredients-list">${state.production.ingredients.length ? state.production.ingredients.map((ingredient) => `<form data-ingredient-update-form><input type="hidden" name="id" value="${ingredient.id}"><b>${escapeHtml(ingredient.name)}</b><span>${ingredient.base_unit}</span><label>Envase<input name="packQuantity" type="number" min="0.001" step="0.001" value="${ingredient.pack_quantity}"></label><label>Compra €<input name="packPrice" type="number" min="0" step="0.01" value="${(Number(ingredient.pack_price_cents) / 100).toFixed(2)}"></label><label>IVA %<input name="purchaseVatPercent" type="number" min="0" max="100" step="0.01" value="${ingredient.purchase_vat_percent}"></label><label>Stock<input name="stockQuantity" type="number" min="0" step="0.001" value="${ingredient.stock_quantity}"></label><label>Mínimo<input name="minimumStockQuantity" type="number" min="0" step="0.001" value="${ingredient.minimum_stock_quantity}"></label><label>Proveedor<input name="supplier" value="${escapeHtml(ingredient.supplier || "")}"></label><button class="tpv-edit-button" type="submit">Guardar</button></form>`).join("") : `<p class="tpv-gestion-empty">Añade la primera materia prima: pan, café, aceite, bebida, etc.</p>`}</div></section><section class="tpv-gestion-card"><header><div><h2>Receta y escandallo</h2><span>Define lo que consume cada artículo vendido.</span></div></header><div class="tpv-recipe-selector"><label>Producto vendido<select data-recipe-product>${products.map((item) => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.name)}${item.variant ? ` · ${escapeHtml(item.variant)}` : ""}</option>`).join("")}</select></label>${selectedProduct ? `<strong>PVP actual: ${Core.formatEuros(selectedProduct.price_cents)}</strong>` : ""}</div>${selectedId ? `<form class="tpv-recipe-config" data-recipe-config-form><input type="hidden" name="productId" value="${selectedId}"><label>Raciones que salen<input name="yieldQuantity" type="number" min="0.001" step="0.001" value="${recipe?.yield_quantity || 1}"></label><label>Coste directo por ración (€)<input name="directCost" type="number" min="0" step="0.01" value="${(Number(recipe?.direct_cost_cents || 0) / 100).toFixed(2)}"></label><button class="tpv-edit-button" type="submit">Guardar receta</button></form><form class="tpv-recipe-line-form" data-recipe-line-form><input type="hidden" name="productId" value="${selectedId}"><label>Ingrediente<select name="ingredientId" required><option value="">Selecciona</option>${state.production.ingredients.map((ingredient) => `<option value="${ingredient.id}">${escapeHtml(ingredient.name)} · ${ingredient.base_unit}</option>`).join("")}</select></label><label>Cantidad por receta<input name="quantity" type="number" min="0.001" step="0.001" required></label><label>Merma (%)<input name="wastePercent" type="number" min="0" max="100" step="0.01" value="0"></label><button class="tpv-action" type="submit">Añadir ingrediente</button></form><div class="tpv-recipe-lines">${lines.length ? lines.map((line) => { const ingredient = ingredientById(line.ingredient_id); const cost = ingredient ? ingredientUnitCost(ingredient) * Number(line.quantity) * (1 + Number(line.waste_percent) / 100) / Number(recipe.yield_quantity || 1) : 0; return `<article><div><b>${escapeHtml(ingredient?.name || "Ingrediente eliminado")}</b><small>${formatQuantity(line.quantity, ingredient?.base_unit || "")} · merma ${line.waste_percent}%</small></div><strong>${Core.formatEuros(Math.round(cost))}</strong><button class="tpv-delete-button" type="button" data-delete-recipe-line="${line.id}">Quitar</button></article>`; }).join("") : `<p class="tpv-gestion-empty">Añade los ingredientes de esta receta.</p>`}</div><div class="tpv-recipe-total"><span>Coste real por ración (sin IVA recuperable)</span><strong>${recipeCostCents === null ? "Configura la receta" : Core.formatEuros(recipeCostCents)}</strong><span>Precio recomendado con ${settings.target_margin_percent}% de margen e IVA ${settings.sales_vat_percent}%</span><b>${suggestedPrice === null ? "—" : Core.formatEuros(suggestedPrice)}</b></div>` : `<p class="tpv-gestion-empty">No hay artículos de venta disponibles.</p>`}</section><aside class="tpv-management-note"><h2>Uso recomendado</h2><p>Empieza por los artículos más vendidos. Introduce la cantidad real usada por ración, el precio del proveedor y el stock.</p><p>El precio recomendado separa el IVA recuperable de compra, añade costes indirectos y aplica el margen que decidáis.</p></aside></section>`;
  }
  function renderAccounting() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session()?.user?.role)) return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><p class="tpv-gestion-empty">Inicia sesión como administrador para registrar facturas y gastos.</p></section></section>`;
    const invoices = state.accountingInvoices;
    const total = invoices.reduce((sum, invoice) => sum + Number(invoice.total_cents || 0), 0);
    const vat = invoices.reduce((sum, invoice) => sum + Number(invoice.vat_cents || 0), 0);
    return `<section class="tpv-gestion-content"><div class="tpv-gestion-metrics"><article><span>Facturas registradas</span><strong>${invoices.length}</strong></article><article><span>Compras con IVA</span><strong>${Core.formatEuros(total)}</strong></article><article><span>IVA soportado</span><strong>${Core.formatEuros(vat)}</strong></article><article><span>Lectura automática</span><strong>Preparada</strong></article></div><section class="tpv-gestion-card"><header><div><h2>Subir factura para lectura</h2><span>Admite PDF, JPG o PNG de hasta 6 MB. Se guarda de forma privada y queda pendiente de clasificar.</span></div></header><form class="tpv-invoice-upload" data-invoice-upload-form><label>Elegir archivo<input name="invoiceFile" type="file" accept="application/pdf,image/jpeg,image/png"></label><label class="tpv-camera-upload">Hacer foto<input name="invoiceCamera" type="file" accept="image/jpeg,image/png" capture="environment"><span>Usar cámara trasera</span></label><small>En móvil, pulsa “Usar cámara trasera”, fotografía la factura y súbela directamente. Una foto escaneada necesita OCR; una factura PDF con texto se puede leer sin IA.</small><button class="tpv-action" type="submit">Subir factura</button></form></section><section class="tpv-gestion-card"><header><div><h2>Registrar factura de proveedor</h2><span>Para introducir o corregir la información manualmente.</span></div></header><form class="tpv-invoice-form" data-invoice-form><label>Proveedor<input name="supplierName" required placeholder="Distribuciones Ejemplo"></label><label>Número factura<input name="invoiceNumber" placeholder="Opcional"></label><label>Fecha<input name="invoiceDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label class="tpv-invoice-form__wide">Líneas de factura<textarea name="lines" required placeholder="Producto | código | cantidad | precio unitario sin IVA (€) | IVA (%)\nPan bocadillo | 843... | 24 | 0.42 | 10\nBacon lonchas | BAC-01 | 10 | 4.50 | 10"></textarea><small>Una línea por producto. Este formato será el resultado que propondrá el lector automático.</small></label><label class="tpv-invoice-form__wide">Texto original u observaciones<textarea name="sourceText" placeholder="Pega aquí el texto extraído de una factura si lo tienes."></textarea></label><button class="tpv-action" type="submit">Guardar factura</button></form></section><section class="tpv-gestion-card"><header><div><h2>Facturas y gastos de compra</h2><span>Las facturas subidas se revisarán antes de afectar al stock o al coste.</span></div></header><div class="tpv-invoice-list">${invoices.length ? invoices.map((invoice) => `<article><header><div><b>${escapeHtml(invoice.supplier_name)}</b><small>${escapeHtml(invoice.invoice_number || "Sin número")} · ${new Date(`${invoice.invoice_date}T12:00:00`).toLocaleDateString("es-ES")}</small></div><strong>${Core.formatEuros(invoice.total_cents)}</strong></header><ul>${(invoice.supplier_invoice_lines || []).map((line) => `<li><span>${escapeHtml(line.product_name)}${line.product_code ? ` · ${escapeHtml(line.product_code)}` : ""}</span><span>${line.quantity} ${escapeHtml(line.unit || "uds.")}</span><b>${Core.formatEuros(line.line_total_cents)}</b></li>`).join("")}</ul><footer><span>Base: ${Core.formatEuros(invoice.subtotal_cents)} · IVA: ${Core.formatEuros(invoice.vat_cents)}</span><div>${invoice.source_file_path ? `<button class="tpv-edit-button" type="button" data-open-invoice-file="${invoice.id}">Abrir archivo</button>` : ""}<em>${invoice.classification_status === "manual" ? "Registrada manualmente" : "Pendiente de lectura"}</em></div></footer></article>`).join("") : `<p class="tpv-gestion-empty">Aún no hay facturas. Sube una cuando quieras probar el circuito.</p>`}</div></section><aside class="tpv-management-note"><h2>Lectura sin IA o con IA</h2><p>Un PDF digital se puede analizar por texto y reglas. Una foto o escaneo necesita OCR para reconocer letras y números.</p><p>La IA es útil para facturas con formatos distintos; siempre añadiremos una revisión humana antes de guardar productos, IVA o stock.</p></aside></section>`;
  }
  function renderAccountingPlan() {
    const groups = [["1", "Financiación básica", "Capital, reservas y deudas a largo plazo."], ["2", "Activo no corriente", "Inmovilizado, instalaciones, maquinaria y equipos."], ["3", "Existencias", "Materias primas, mercaderías y productos en curso."], ["4", "Acreedores y deudores", "Proveedores, clientes, IVA y Administraciones Públicas."], ["5", "Cuentas financieras", "Caja, bancos, tarjetas y créditos a corto plazo."], ["6", "Compras y gastos", "Compras, sueldos, suministros, alquileres y servicios."], ["7", "Ventas e ingresos", "Ventas, prestación de servicios y otros ingresos."], ["8", "Gastos imputados al patrimonio neto", "Ajustes contables específicos."], ["9", "Ingresos imputados al patrimonio neto", "Subvenciones y otros ajustes específicos."]];
    return `<section class="tpv-gestion-card"><header><div><h2>Plan General Contable español</h2><span>Los 9 grupos que utilizará la contabilidad al clasificar las facturas.</span></div></header><div class="tpv-feature-grid">${groups.map(([group, title, description]) => `<article><b>Grupo ${group} · ${title}</b><span>${description}</span></article>`).join("")}</div></section>`;
  }
  function accountingGroups() {
    return [["1", "Financiación básica", "Capital, reservas y deuda a largo plazo."], ["2", "Activo no corriente", "Instalaciones, maquinaria y equipos."], ["3", "Existencias", "Mercaderías y materias primas."], ["4", "Acreedores y deudores", "Proveedores, clientes e IVA."], ["5", "Cuentas financieras", "Caja, bancos y tarjetas."], ["6", "Compras y gastos", "Compras, personal, suministros y servicios."], ["7", "Ventas e ingresos", "Ventas, servicios e ingresos."], ["8", "Gastos imputados al patrimonio neto", "Ajustes contables específicos."], ["9", "Ingresos imputados al patrimonio neto", "Ajustes contables específicos."]];
  }
  function accountingAccountOptions(accounts, selectedId = "", allowedGroups = null) {
    return accounts.filter((account) => account.active !== false && (!allowedGroups || allowedGroups.includes(account.group_code))).map((account) => `<option value="${account.id}" ${account.id === selectedId ? "selected" : ""}>${escapeHtml(account.code)} · ${escapeHtml(account.name)}</option>`).join("");
  }
  function accountingLedger(accounts, entries) {
    const ledger = new Map(accounts.map((account) => [account.id, { account, debitCents: 0, creditCents: 0 }]));
    entries.filter((entry) => entry.status !== "void").forEach((entry) => (entry.accounting_entry_lines || []).forEach((line) => {
      const row = ledger.get(line.account_id);
      if (!row) return;
      row.debitCents += Number(line.debit_cents || 0);
      row.creditCents += Number(line.credit_cents || 0);
    }));
    return ledger;
  }
  function balanceLabel(debitCents, creditCents) {
    const balance = Number(debitCents || 0) - Number(creditCents || 0);
    if (!balance) return "Sin movimiento";
    return `${Core.formatEuros(Math.abs(balance))} · ${balance > 0 ? "saldo deudor" : "saldo acreedor"}`;
  }
  function renderAccountingWorkspace() {
    if (!isCloudConnected() || !["admin", "manager"].includes(session()?.user?.role)) return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><p class="tpv-gestion-empty">Inicia sesión como administrador para registrar facturas y gastos.</p></section></section>`;
    const invoices = state.accountingInvoices;
    const accounts = state.accountingAccounts;
    const entries = state.accountingEntries;
    const ledgerEnabled = state.accountingReady !== false;
    const total = invoices.reduce((sum, invoice) => sum + Number(invoice.total_cents || 0), 0);
    const vat = invoices.reduce((sum, invoice) => sum + Number(invoice.vat_cents || 0), 0);
    const expenseDefault = accounts.find((account) => account.code === "600")?.id || "";
    const invoiceEntries = new Map(entries.map((entry) => [entry.id, entry]));
    const accountOptions = accountingAccountOptions(accounts);
    const accountRows = Array.from({ length: 4 }, () => `<div class="tpv-accounting-entry-line"><select name="accountId"><option value="">Selecciona cuenta</option>${accountOptions}</select><input name="debit" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00"><input name="credit" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00"></div>`).join("");
    const readiness = ledgerEnabled ? "" : `<section class="tpv-gestion-card tpv-accounting-warning"><h2>Activa el libro contable</h2><p>Las facturas siguen disponibles, pero falta ejecutar <code>supabase/012_accounting_workbench.sql</code> en Supabase para crear cuentas, asientos y saldos.</p></section>`;
    const operatingForms = ledgerEnabled ? `<div class="tpv-accounting-workspace"><section class="tpv-gestion-card"><header><div><h2>Crear cuenta auxiliar</h2><span>Amplía el plan cuando necesites separar gastos, bancos o proveedores.</span></div></header><form class="tpv-accounting-account-form" data-accounting-account-form><label>Código<input name="code" inputmode="numeric" pattern="[0-9]{3,12}" maxlength="12" required placeholder="6281"></label><label>Nombre<input name="name" maxlength="160" required placeholder="Electricidad local"></label><label>Grupo<select name="groupCode" required>${accountingGroups().map(([code, title]) => `<option value="${code}" ${code === "6" ? "selected" : ""}>${code} · ${title}</option>`).join("")}</select></label><label>Naturaleza<select name="accountType"><option value="expense">Gasto</option><option value="income">Ingreso</option><option value="asset">Activo</option><option value="liability">Pasivo</option><option value="equity">Patrimonio neto</option></select></label><button class="tpv-action" type="submit">Crear cuenta</button></form></section><section class="tpv-gestion-card"><header><div><h2>Registrar asiento manual</h2><span>Escribe las líneas del Debe y el Haber. Solo se guarda si cuadra.</span></div></header><form class="tpv-accounting-entry-form" data-accounting-entry-form><div class="tpv-accounting-entry-head"><label>Fecha<input name="entryDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Referencia<input name="reference" maxlength="160" placeholder="Ej. ticket banco"></label><label>Concepto<input name="description" maxlength="500" required placeholder="Movimiento o ajuste contable"></label></div><div class="tpv-accounting-entry-labels"><span>Cuenta</span><span>Debe (€)</span><span>Haber (€)</span></div>${accountRows}<div class="tpv-accounting-entry-actions"><small>Ejemplo: 628 Suministros al Debe y 572 Bancos al Haber.</small><button class="tpv-action" type="submit">Registrar asiento</button></div></form></section></div>` : "";
    const invoiceAccount = ledgerEnabled && accounts.length ? `<label>Cuenta de compra o gasto<select name="expenseAccountId">${accountingAccountOptions(accounts, expenseDefault, ["3", "6"])}</select><small>Al guardar se crea el asiento: gasto + IVA soportado contra Proveedores.</small></label>` : "";
    const entryList = ledgerEnabled ? `<section class="tpv-gestion-card"><header><div><h2>Últimos asientos</h2><span>Libro diario simplificado con partidas que siempre cuadran.</span></div></header><div class="tpv-accounting-entries">${entries.length ? entries.slice(0, 12).map((entry) => { const entryLines = entry.accounting_entry_lines || []; const totalDebit = entryLines.reduce((sum, line) => sum + Number(line.debit_cents || 0), 0); return `<article><header><div><b>Asiento #${escapeHtml(entry.entry_number)}</b><small>${new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString("es-ES")}${entry.reference ? ` · ${escapeHtml(entry.reference)}` : ""}</small></div><strong>${Core.formatEuros(totalDebit)}</strong></header><p>${escapeHtml(entry.description)}</p><ul>${entryLines.map((line) => { const account = line.accounting_accounts || accounts.find((item) => item.id === line.account_id) || {}; return `<li><span>${escapeHtml(account.code || "—")} · ${escapeHtml(account.name || "Cuenta eliminada")}</span><b>${Number(line.debit_cents) ? `Debe ${Core.formatEuros(line.debit_cents)}` : `Haber ${Core.formatEuros(line.credit_cents)}`}</b></li>`; }).join("")}</ul></article>`; }).join("") : `<p class="tpv-gestion-empty">Todavía no hay asientos. Registra una factura o crea uno manual.</p>`}</div></section>` : "";
    return `<section class="tpv-gestion-content"><div class="tpv-gestion-metrics"><article><span>Facturas registradas</span><strong>${invoices.length}</strong></article><article><span>Compras con IVA</span><strong>${Core.formatEuros(total)}</strong></article><article><span>IVA soportado</span><strong>${Core.formatEuros(vat)}</strong></article><article><span>Asientos</span><strong>${ledgerEnabled ? entries.length : "Pendiente"}</strong></article></div>${readiness}${operatingForms}<section class="tpv-gestion-card"><header><div><h2>Subir factura para lectura</h2><span>Admite PDF, JPG o PNG de hasta 6 MB. Se guarda de forma privada y queda pendiente de clasificar.</span></div></header><form class="tpv-invoice-upload" data-invoice-upload-form><label>Elegir archivo<input name="invoiceFile" type="file" accept="application/pdf,image/jpeg,image/png"></label><label class="tpv-camera-upload">Hacer foto<input name="invoiceCamera" type="file" accept="image/jpeg,image/png" capture="environment"><span>Usar cámara trasera</span></label><small>En móvil, pulsa “Usar cámara trasera”, fotografía la factura y súbela directamente. Una foto escaneada necesita OCR; una factura PDF con texto se puede leer sin IA.</small><button class="tpv-action" type="submit">Subir factura</button></form></section><section class="tpv-gestion-card"><header><div><h2>Registrar factura de proveedor</h2><span>Introduce o corrige la información; al elegir una cuenta se genera el asiento automáticamente.</span></div></header><form class="tpv-invoice-form" data-invoice-form><label>Proveedor<input name="supplierName" required placeholder="Distribuciones Ejemplo"></label><label>Número factura<input name="invoiceNumber" placeholder="Opcional"></label><label>Fecha<input name="invoiceDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>${invoiceAccount}<label class="tpv-invoice-form__wide">Líneas de factura<textarea name="lines" required placeholder="Producto | código | cantidad | precio unitario sin IVA (€) | IVA (%)\nPan bocadillo | 843... | 24 | 0.42 | 10\nBacon lonchas | BAC-01 | 10 | 4.50 | 10"></textarea><small>Una línea por producto. Este formato será el resultado que propondrá el lector automático.</small></label><label class="tpv-invoice-form__wide">Texto original u observaciones<textarea name="sourceText" placeholder="Pega aquí el texto extraído de una factura si lo tienes."></textarea></label><button class="tpv-action" type="submit">Guardar factura</button></form></section>${entryList}<section class="tpv-gestion-card"><header><div><h2>Facturas y gastos de compra</h2><span>Las facturas subidas se revisan antes de afectar al stock o al coste.</span></div></header><div class="tpv-invoice-list">${invoices.length ? invoices.map((invoice) => { const entry = invoiceEntries.get(invoice.accounting_entry_id); return `<article><header><div><b>${escapeHtml(invoice.supplier_name)}</b><small>${escapeHtml(invoice.invoice_number || "Sin número")} · ${new Date(`${invoice.invoice_date}T12:00:00`).toLocaleDateString("es-ES")}</small></div><strong>${Core.formatEuros(invoice.total_cents)}</strong></header><ul>${(invoice.supplier_invoice_lines || []).map((line) => `<li><span>${escapeHtml(line.product_name)}${line.product_code ? ` · ${escapeHtml(line.product_code)}` : ""}</span><span>${line.quantity} ${escapeHtml(line.unit || "uds.")}</span><b>${Core.formatEuros(line.line_total_cents)}</b></li>`).join("")}</ul><footer><span>Base: ${Core.formatEuros(invoice.subtotal_cents)} · IVA: ${Core.formatEuros(invoice.vat_cents)}</span><div>${invoice.source_file_path ? `<button class="tpv-edit-button" type="button" data-open-invoice-file="${invoice.id}">Abrir archivo</button>` : ""}<em>${entry ? `Asiento #${entry.entry_number} contabilizado` : invoice.classification_status === "manual" ? "Registrada, sin asiento" : "Pendiente de lectura"}</em></div></footer></article>`; }).join("") : `<p class="tpv-gestion-empty">Aún no hay facturas. Sube una cuando quieras probar el circuito.</p>`}</div></section><aside class="tpv-management-note"><h2>Contabilidad de gestión</h2><p>El TPV registra compras y asientos equilibrados para controlar el negocio. Antes de presentar impuestos o cerrar el ejercicio, revisad cuentas, IVA y criterios con vuestra asesoría.</p><p>La lectura automática propone datos; una persona valida siempre la factura y su cuenta de gasto.</p></aside></section>`;
  }
  function renderAccountingLedger() {
    if (state.accountingReady === false) return "";
    const accounts = state.accountingAccounts;
    const ledger = accountingLedger(accounts, state.accountingEntries);
    return `<section class="tpv-gestion-card"><header><div><h2>Plan General Contable · libro mayor</h2><span>Cuentas de trabajo con acumulado de Debe, Haber y saldo. Los grupos 8 y 9 se pueden ampliar si los necesitáis.</span></div></header><div class="tpv-accounting-plan">${accountingGroups().map(([groupCode, title, description]) => { const rows = accounts.filter((account) => account.group_code === groupCode); const groupDebit = rows.reduce((sum, account) => sum + Number(ledger.get(account.id)?.debitCents || 0), 0); const groupCredit = rows.reduce((sum, account) => sum + Number(ledger.get(account.id)?.creditCents || 0), 0); return `<section><header><div><b>Grupo ${groupCode} · ${title}</b><small>${description}</small></div><strong>${balanceLabel(groupDebit, groupCredit)}</strong></header><div class="tpv-accounting-plan-head"><span>Cuenta</span><span>Debe</span><span>Haber</span><span>Saldo</span></div>${rows.length ? rows.map((account) => { const row = ledger.get(account.id) || { debitCents: 0, creditCents: 0 }; return `<div class="tpv-accounting-plan-row"><span><b>${escapeHtml(account.code)}</b> ${escapeHtml(account.name)}${account.active === false ? " · Inactiva" : ""}</span><span>${Core.formatEuros(row.debitCents)}</span><span>${Core.formatEuros(row.creditCents)}</span><strong>${balanceLabel(row.debitCents, row.creditCents)}</strong></div>`; }).join("") : `<p class="tpv-gestion-empty">No hay cuentas en este grupo todavía. Crea una cuenta auxiliar si la necesitáis.</p>`}</section>`; }).join("")}</div></section>`;
  }
  function priceModal() {
    if (!state.editingId && !state.creatingProduct) return "";
    const item = state.creatingProduct ? null : product(state.editingId);
    const cost = item ? state.data.costs?.[state.editingId] : undefined;
    const title = item ? item.name : "Nuevo artículo";
    const photo = item?.image ? `<figure class="tpv-product-photo-preview"><img src="${escapeHtml(item.image)}" alt="Foto actual de ${escapeHtml(item.name)}"><figcaption>Foto actual del artículo</figcaption></figure>` : `<p class="tpv-product-photo-missing">Aún no hay foto real para este artículo.</p>`;
    const removePhoto = item?.image ? `<label class="tpv-checkbox"><input name="removeImage" type="checkbox"><span>Quitar la foto actual</span></label>` : "";
    return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-product-form><button class="tpv-modal__close" type="button" data-close-edit aria-label="Cerrar">×</button><h2>${escapeHtml(title)}</h2><p>${item ? "Edita la información que aparecerá en el TPV." : "El artículo quedará disponible en todos los TPV conectados."}</p><label>Nombre<input name="name" maxlength="160" value="${escapeHtml(item?.name || "")}" required autofocus></label><label>Familia<input name="category" maxlength="100" value="${escapeHtml(item?.category || "")}" placeholder="Ej. Para picar" required></label><label>Formato o descripción<input name="description" maxlength="500" value="${escapeHtml(item?.description || "")}" placeholder="Ej. Ración entera"></label>${photo}<label class="tpv-product-photo-input">Foto real del artículo<input name="image" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><small>En el móvil puedes hacerla con la cámara. Se optimiza antes de guardarla.</small></label>${removePhoto}<label>Precio de venta (€)<input name="price" type="number" min="0" step="0.01" value="${item ? (item.priceCents / 100).toFixed(2) : ""}" required></label><label>Coste de compra (€)<input name="cost" type="number" min="0" step="0.01" value="${cost === undefined ? "" : (Number(cost) / 100).toFixed(2)}" placeholder="Pendiente"></label><label class="tpv-checkbox"><input name="sendsToKitchen" type="checkbox" ${item?.sendsToKitchen ? "checked" : ""}><span>Enviar este artículo a cocina</span></label><div class="tpv-modal__actions">${item?.active !== false ? `<button class="tpv-action is-danger" type="button" data-archive-product="${item.id}">Desactivar</button>` : ""}<button class="tpv-action is-secondary" type="button" data-close-edit>Cancelar</button><button class="tpv-action" type="submit">${item ? "Guardar cambios" : "Crear artículo"}</button></div></form></div>`;
  }
  function tableModal() {
    if (state.editingTableId) {
      const table = tableLayout().find((item) => item.id === state.editingTableId);
      if (!table) return "";
      return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-table-edit-form><button class="tpv-modal__close" type="button" data-close-table-modal aria-label="Cerrar">×</button><h2>Editar mesa ${table.id}</h2><p>El número debe ser único. Si hay una comanda abierta, se moverá a la nueva numeración.</p><label>Número de mesa<input name="tableNumber" inputmode="numeric" maxlength="3" value="${table.id}" required></label><label>Zona<select name="area"><option value="sala" ${table.area === "sala" ? "selected" : ""}>Sala</option><option value="wall" ${table.area === "wall" ? "selected" : ""}>Pared</option></select></label><div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-table-modal>Cancelar</button><button class="tpv-action" type="submit">Guardar mesa</button></div></form></div>`;
    }
    if (state.deletingTableId) {
      return `<div class="tpv-modal-backdrop"><section class="tpv-modal"><button class="tpv-modal__close" type="button" data-close-table-modal aria-label="Cerrar">×</button><h2>Quitar mesa ${state.deletingTableId}</h2><p>Se eliminará del plano. Esta acción no borra ventas históricas.</p><div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-table-modal>Cancelar</button><button class="tpv-action is-danger" type="button" data-confirm-delete-table="${state.deletingTableId}">Quitar mesa</button></div></section></div>`;
    }
    return "";
  }
  function loginModal() {
    if (!state.loginOpen) return "";
    const options = [["matias", "Matías", "Camarero"], ["lucia", "Lucía", "Camarera"], ["carlos", "Administrador", "Carlos"]];
    const waiter = ["matias", "lucia"].includes(state.loginUsername);
    return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-login-form><button class="tpv-modal__close" type="button" data-close-login aria-label="Cerrar">×</button><h2>¿Quién entra?</h2><p>${waiter ? "Selecciona tu nombre para entrar al TPV." : "El acceso de administración requiere PIN."}</p><div class="tpv-login-users">${options.map(([username, label, role]) => `<button class="tpv-login-user ${state.loginUsername === username ? "is-active" : ""}" type="button" data-login-user="${username}"><b>${label}</b><small>${role}</small></button>`).join("")}</div><label>Usuario<input name="username" value="${state.loginUsername}" readonly></label>${waiter ? "" : `<label>PIN<input name="pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{4,10}" minlength="4" maxlength="10" required autofocus></label>`}<div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-login>Cancelar</button><button class="tpv-action" type="submit">Entrar</button></div></form></div>`;
  }
  function render() {
    const baseContent = state.tab === "ventas" ? renderSales() : state.tab === "historial" ? renderTableHistory() : state.tab === "caja" ? renderCashManagement() : state.tab === "articulos" ? renderArticles() : state.tab === "reservas" ? renderReservations() : state.tab === "fidelizacion" ? renderLoyalty() : state.tab === "produccion" ? renderProduction() : state.tab === "escandallo" ? renderCosting() : state.tab === "contabilidad" ? renderAccountingWorkspace() : state.tab === "personal" ? renderStaff() : renderTables();
    const content = `${baseContent}${state.tab === "contabilidad" ? renderAccountingLedger() : ""}`;
    root.innerHTML = `<div class="tpv-management-app">${nav()}<main class="tpv-management-main">${topbar()}${content}</main>${priceModal()}${tableModal()}${loyaltyModal()}${loginModal()}${state.toast ? `<div class="tpv-toast is-success">${escapeHtml(state.toast)}</div>` : ""}</div>`;
    if (state.tab === "reservas") decorateReservationMenuForms();
  }
  function closeProductModal() {
    state.editingId = null;
    state.creatingProduct = false;
    if (window.location.hash === "#nuevo-articulo") window.history.replaceState(null, "", window.location.pathname);
  }
  root.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-create-product]");
    if (action) { event.preventDefault(); state.creatingProduct = true; render(); return; }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.tab) { state.tab = button.dataset.tab; if (state.tab === "personal") { Promise.all([refreshCloudStaff(), refreshCloudShiftHistory()]).then(render).catch((error) => { flash(error.message); render(); }); } if (["produccion", "escandallo"].includes(state.tab)) { refreshCloudProduction().then(render).catch((error) => { flash(error.message); render(); }); } if (state.tab === "contabilidad") { refreshCloudAccounting().then(render).catch((error) => { flash(error.message); render(); }); } if (state.tab === "reservas") { refreshCloudReservations().then(render).catch((error) => { flash(error.message); render(); }); } if (state.tab === "historial") { refreshCloudTableHistory().then(render).catch((error) => { flash(error.message); render(); }); } if (state.tab === "caja") { refreshCloudCash().then(render).catch((error) => { flash(error.message); render(); }); } render(); return; }
    if (button.dataset.loginUser) { state.loginUsername = button.dataset.loginUser; render(); return; }
    if (button.dataset.openLogin !== undefined) { state.loginOpen = true; render(); return; }
    if (button.dataset.closeLogin !== undefined) { state.loginOpen = false; render(); return; }
    if (button.dataset.loyaltyCustomer) { state.selectedLoyaltyCustomerId = button.dataset.loyaltyCustomer; render(); return; }
    if (button.dataset.closeLoyalty !== undefined) { state.selectedLoyaltyCustomerId = null; render(); return; }
    if (button.dataset.reservationStatus) {
      Cloud.updateReservationStatus(button.dataset.reservationId, button.dataset.reservationStatus)
        .then(async () => { await refreshCloudReservations(); flash(button.dataset.reservationStatus === "confirmed" ? "Reserva confirmada." : "Reserva cancelada y plazas liberadas."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (button.dataset.openInvoiceFile) {
      Cloud.getSupplierInvoiceFileUrl(button.dataset.openInvoiceFile)
        .then((url) => window.open(url, "_blank", "noopener"))
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (button.dataset.deleteRecipeLine) {
      try { await Cloud.deleteRecipeLine(button.dataset.deleteRecipeLine); await refreshCloudProduction(); flash("Ingrediente quitado de la receta."); } catch (error) { flash(error.message); }
      render();
      return;
    }
    if (button.dataset.logout !== undefined) { Cloud.logout(); flash("Sesión cerrada. Los cambios vuelven a guardarse solo en este dispositivo."); render(); return; }
    if (button.dataset.moveCategory) {
      if (!isCloudConnected() || !["admin", "manager"].includes(session()?.user?.role)) { flash("Inicia sesión como administrador para ordenar familias."); render(); return; }
      const categories = (state.data.remoteCategories || []).filter((category) => category.active !== false);
      const index = categories.findIndex((category) => category.id === button.dataset.moveCategory);
      const target = index + (button.dataset.direction === "up" ? -1 : 1);
      if (index < 0 || target < 0 || target >= categories.length) return;
      [categories[index], categories[target]] = [categories[target], categories[index]];
      try {
        const updatedCategories = await Cloud.reorderCategories(categories.map((category) => category.id));
        Cloud.saveRemoteCategories(state.data, updatedCategories);
        await refreshCloudProducts();
        flash("Orden de familias actualizado en todos los TPV.");
      } catch (error) {
        flash(error.message);
      }
      render();
      return;
    }
    if (button.dataset.editProduct) { state.creatingProduct = false; state.editingId = button.dataset.editProduct; render(); return; }
    if (button.dataset.closeEdit !== undefined) { closeProductModal(); render(); return; }
    if (button.dataset.archiveProduct) {
      const productId = button.dataset.archiveProduct;
      if (!isCloudConnected()) { flash("Inicia sesión para desactivar artículos."); render(); return; }
      Cloud.archiveProduct(state.data.cloudProductIds?.[productId])
        .then(async () => { await refreshCloudProducts(); state.editingId = null; flash("Artículo desactivado. Las ventas anteriores se conservan."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (button.dataset.editTable) { state.editingTableId = button.dataset.editTable; render(); return; }
    if (button.dataset.deleteTable) { state.deletingTableId = button.dataset.deleteTable; render(); return; }
    if (button.dataset.closeTableModal !== undefined) { state.editingTableId = null; state.deletingTableId = null; render(); return; }
    if (button.dataset.confirmDeleteTable) {
      const tableId = button.dataset.confirmDeleteTable;
      if (isTableOccupied(tableId)) { state.deletingTableId = null; flash("No puedes quitar una mesa con comanda activa."); render(); return; }
      if (isCloudConnected()) {
        try {
          await Cloud.deleteTable(Cloud.tableId(state.data, tableId));
          await refreshCloudTables();
          state.deletingTableId = null;
          flash(`Mesa ${tableId} eliminada de la base central.`);
          render();
        } catch (error) {
          flash(error.message);
          render();
        }
        return;
      }
      state.data.tableLayout = tableLayout().filter((table) => table.id !== tableId);
      state.deletingTableId = null;
      save();
      flash(`Mesa ${tableId} eliminada del plano.`);
      render();
    }
  });
  root.addEventListener("pointerdown", (event) => {
    const table = event.target.closest("[data-layout-table]");
    if (!table) return;
    const map = table.closest("[data-layout-map]");
    if (!map) return;
    draggedTable = { id: table.dataset.layoutTable, element: table, map, x: Number(table.style.getPropertyValue("--x")), y: Number(table.style.getPropertyValue("--y")) };
    table.classList.add("is-dragging");
    if (table.setPointerCapture) table.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  function moveDraggedTable(event) {
    if (!draggedTable) return;
    const rect = draggedTable.map.getBoundingClientRect();
    const x = Math.min(95, Math.max(5, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(91, Math.max(6, ((event.clientY - rect.top) / rect.height) * 100));
    draggedTable.x = Math.round(x * 10) / 10;
    draggedTable.y = Math.round(y * 10) / 10;
    draggedTable.element.style.setProperty("--x", draggedTable.x);
    draggedTable.element.style.setProperty("--y", draggedTable.y);
  }
  async function finishDraggedTable() {
    if (!draggedTable) return;
    const moved = draggedTable;
    moved.element.classList.remove("is-dragging");
    state.data.tableLayout = tableLayout().map((table) => table.id === moved.id ? { ...table, x: moved.x, y: moved.y } : table);
    draggedTable = null;
    save();
    if (isCloudConnected()) {
      try {
        await Cloud.updateTable(Cloud.tableId(state.data, moved.id), { x: moved.x, y: moved.y });
        flash(`Posición de mesa ${moved.id} sincronizada.`);
      } catch (error) {
        flash(error.message);
      }
    } else flash(`Posición de mesa ${moved.id} guardada.`);
    render();
  }
  if (window.addEventListener) {
    window.addEventListener("pointermove", moveDraggedTable);
    window.addEventListener("pointerup", finishDraggedTable);
    window.addEventListener("pointercancel", finishDraggedTable);
  }
  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-stock-product]")) {
      state.data.stockLevels = state.data.stockLevels || {};
      state.data.stockLevels[event.target.dataset.stockProduct] = Math.max(0, Number(event.target.value || 0));
      save();
      return;
    }
    if (!event.target.matches("[data-search-products]")) return;
    state.search = event.target.value;
    render();
    const input = root.querySelector("[data-search-products]");
    if (input) { input.focus(); input.setSelectionRange(state.search.length, state.search.length); }
  });
  root.addEventListener("change", (event) => {
    if (!event.target.matches("[data-recipe-product]")) return;
    state.recipeProductId = event.target.value;
    render();
  });
  root.addEventListener("submit", (event) => {
    if (event.target.matches("[data-reservation-slot-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.createReservationSlot({ serviceDate: form.get("serviceDate"), serviceTime: form.get("serviceTime"), capacityPeople: Number(form.get("capacityPeople")) })
        .then(async () => { await refreshCloudReservations(); flash("Turno publicado en el calendario web."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-reservation-slot-update]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.updateReservationSlot({ id: form.get("id"), capacityPeople: Number(form.get("capacityPeople")), enabled: form.get("enabled") === "on" })
        .then(async () => { await refreshCloudReservations(); flash("Disponibilidad actualizada."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-reservation-menu-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      const price = String(form.get("price") || "").trim();
      const image = event.target.querySelector('[name="image"]')?.files?.[0];
      (image?.size ? Cloud.uploadReservationMenuImage(image) : Promise.resolve(null))
        .then((imageUrl) => Cloud.createReservationMenu({ name: form.get("name"), description: form.get("description"), sortOrder: Number(form.get("sortOrder")), priceCents: price ? Math.round(Number(price.replace(",", ".")) * 100) : null, imageUrl }))
        .then(async () => { await refreshCloudReservations(); flash("Menú añadido a las reservas online."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-reservation-menu-update]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      const price = String(form.get("price") || "").trim();
      const image = event.target.querySelector('[name="image"]')?.files?.[0];
      (image?.size ? Cloud.uploadReservationMenuImage(image) : Promise.resolve(undefined))
        .then((imageUrl) => Cloud.updateReservationMenu({ id: form.get("id"), name: form.get("name"), description: form.get("description"), sortOrder: Number(form.get("sortOrder")), active: form.get("active") === "on", priceCents: price ? Math.round(Number(price.replace(",", ".")) * 100) : null, ...(imageUrl ? { imageUrl } : {}) }))
        .then(async () => { await refreshCloudReservations(); flash("Menú actualizado."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-accounting-account-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.createAccountingAccount({ code: String(form.get("code") || "").trim(), name: String(form.get("name") || "").trim(), groupCode: form.get("groupCode"), accountType: form.get("accountType") })
        .then(async () => { await refreshCloudAccounting(); flash("Cuenta añadida al plan contable."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-accounting-entry-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      const toCents = (value) => {
        const amount = String(value || "").trim();
        return amount ? Math.round(Number(amount.replace(",", ".")) * 100) : 0;
      };
      const accountIds = form.getAll("accountId");
      const debits = form.getAll("debit");
      const credits = form.getAll("credit");
      const lines = accountIds.map((accountId, index) => ({ accountId, debitCents: toCents(debits[index]), creditCents: toCents(credits[index]) })).filter((line) => line.accountId || line.debitCents || line.creditCents);
      if (lines.length < 2 || lines.some((line) => !Number.isFinite(line.debitCents) || !Number.isFinite(line.creditCents))) { flash("Incluye al menos dos líneas con importes válidos."); render(); return; }
      Cloud.createAccountingEntry({ entryDate: form.get("entryDate"), reference: form.get("reference"), description: form.get("description"), lines })
        .then(async () => { await refreshCloudAccounting(); flash("Asiento contable registrado y cuadrado."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-invoice-upload-form]")) {
      event.preventDefault();
      const file = event.target.querySelector('input[name="invoiceCamera"]')?.files?.[0] || event.target.querySelector('input[name="invoiceFile"]')?.files?.[0];
      if (!file) { flash("Selecciona una factura."); render(); return; }
      Cloud.uploadSupplierInvoiceFile(file)
        .then((uploaded) => Cloud.createSupplierInvoice({ supplierName: "Pendiente de lectura", invoiceNumber: "", invoiceDate: new Date().toISOString().slice(0, 10), sourceFileName: uploaded.fileName, sourceFilePath: uploaded.path, lines: [] }))
        .then(async () => { await refreshCloudAccounting(); flash("Factura subida. Queda pendiente de lectura y revisión."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-invoice-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      const lines = String(form.get("lines") || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
        const [productName, productCode, quantity, unitPrice, vatPercent] = line.split("|").map((value) => value.trim());
        return { productName, productCode, quantity: Number(quantity), unitPriceCents: Math.round(Number(String(unitPrice || "").replace(",", ".")) * 100), vatPercent: Number(String(vatPercent || "10").replace(",", ".")) };
      });
      Cloud.createSupplierInvoice({ supplierName: form.get("supplierName"), invoiceNumber: form.get("invoiceNumber"), invoiceDate: form.get("invoiceDate"), expenseAccountId: form.get("expenseAccountId"), sourceText: form.get("sourceText"), lines })
        .then(async () => { await refreshCloudAccounting(); flash("Factura registrada para contabilidad."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-cost-settings-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.updateCostingSettings({ salesVatPercent: Number(form.get("salesVatPercent")), targetMarginPercent: Number(form.get("targetMarginPercent")), overheadPerServingCents: Math.round(Number(form.get("overheadPerServing")) * 100), labourPerServingCents: Math.round(Number(form.get("labourPerServing")) * 100) })
        .then(async () => { await refreshCloudProduction(); flash("Reglas de coste guardadas."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-ingredient-create-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.createIngredient({ name: form.get("name"), baseUnit: form.get("baseUnit"), packQuantity: Number(form.get("packQuantity")), packPriceCents: Math.round(Number(form.get("packPrice")) * 100), purchaseVatPercent: Number(form.get("purchaseVatPercent")), stockQuantity: Number(form.get("stockQuantity")), minimumStockQuantity: Number(form.get("minimumStockQuantity")), supplier: form.get("supplier") })
        .then(async () => { await refreshCloudProduction(); flash("Materia prima creada."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-ingredient-update-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.updateIngredient({ id: form.get("id"), packQuantity: Number(form.get("packQuantity")), packPriceCents: Math.round(Number(form.get("packPrice")) * 100), purchaseVatPercent: Number(form.get("purchaseVatPercent")), stockQuantity: Number(form.get("stockQuantity")), minimumStockQuantity: Number(form.get("minimumStockQuantity")), supplier: form.get("supplier") })
        .then(async () => { await refreshCloudProduction(); flash("Materia prima actualizada."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-recipe-config-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.configureRecipe({ productId: form.get("productId"), yieldQuantity: Number(form.get("yieldQuantity")), directCostCents: Math.round(Number(form.get("directCost")) * 100) })
        .then(async () => { await refreshCloudProduction(); flash("Parámetros de receta guardados."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-recipe-line-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.addRecipeLine({ productId: form.get("productId"), ingredientId: form.get("ingredientId"), quantity: Number(form.get("quantity")), wastePercent: Number(form.get("wastePercent")) })
        .then(async () => { await refreshCloudProduction(); flash("Ingrediente añadido a la receta."); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-login-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.login(state.loginUsername, String(form.get("pin") || ""))
        .then(async () => {
          if (!["admin", "manager"].includes(session().user.role)) { window.location.href = "tpv.html"; return; }
          await refreshCloudTables();
          await refreshCloudProducts();
          await refreshCloudSales();
          await refreshCloudStaff();
          await refreshCloudCash();
          await refreshCloudShiftHistory();
          await refreshCloudTableHistory();
          await refreshCloudProduction();
          await refreshCloudAccounting();
          await refreshCloudReservations();
          state.loginOpen = false;
          flash("Sesión iniciada. Las mesas ya usan la base central.");
          render();
        })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-staff-form]")) {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      Cloud.createStaff(values)
        .then(async () => { await refreshCloudStaff(); flash(`${values.displayName} ya tiene acceso propio.`); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-loyalty-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      const name = String(form.get("name") || "").trim();
      if (!name) { flash("Indica el nombre del cliente."); render(); return; }
      state.data.loyaltyCustomers = [...loyaltyCustomers(), { id: `customer-${Date.now().toString(36)}`, name, phone: String(form.get("phone") || "").trim(), email: String(form.get("email") || "").trim(), duros: 0, createdAt: new Date().toISOString() }];
      save();
      flash(`${name} ya está en Fidelización.`);
      render();
      return;
    }
    if (event.target.matches("[data-table-add-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      const tableNumber = String(form.get("tableNumber") || "").trim();
      if (!validTableNumber(tableNumber)) { flash("Usa un número de mesa entre 1 y 999."); render(); return; }
      if (tableLayout().some((table) => table.id === tableNumber)) { flash(`La mesa ${tableNumber} ya existe.`); render(); return; }
      const position = Core.suggestedTablePosition(tableLayout());
      if (isCloudConnected()) {
        Cloud.createTable({ tableNumber, area: form.get("area") === "wall" ? "pared" : "sala", ...position })
          .then(async () => { await refreshCloudTables(); flash(`Mesa ${tableNumber} añadida a la base central.`); render(); })
          .catch((error) => { flash(error.message); render(); });
      } else {
        state.data.tableLayout = [...tableLayout(), { id: tableNumber, name: `Mesa ${tableNumber}`, area: form.get("area") === "wall" ? "wall" : "sala", ...position }];
        save();
        flash(`Mesa ${tableNumber} añadida al plano.`);
        render();
      }
      return;
    }
    if (event.target.matches("[data-table-edit-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      const tableNumber = String(form.get("tableNumber") || "").trim();
      const previousId = state.editingTableId;
      if (!validTableNumber(tableNumber)) { flash("Usa un número de mesa entre 1 y 999."); render(); return; }
      if (tableNumber !== previousId && tableLayout().some((table) => table.id === tableNumber)) { flash(`La mesa ${tableNumber} ya existe.`); render(); return; }
      if (isCloudConnected()) {
        const originalTable = tableLayout().find((table) => table.id === previousId);
        Cloud.updateTable(Cloud.tableId(state.data, previousId), { tableNumber, area: form.get("area") === "wall" ? "pared" : "sala", x: originalTable.x, y: originalTable.y })
          .then(async () => {
            moveTableReferences(previousId, tableNumber);
            await refreshCloudTables();
            state.editingTableId = null;
            flash(`Mesa ${previousId} actualizada en la base central.`);
            render();
          })
          .catch((error) => { flash(error.message); render(); });
      } else {
        state.data.tableLayout = tableLayout().map((table) => table.id === previousId ? { ...table, id: tableNumber, name: `Mesa ${tableNumber}`, area: form.get("area") === "wall" ? "wall" : "sala" } : table);
        moveTableReferences(previousId, tableNumber);
        state.editingTableId = null;
        save();
        flash(`Mesa ${previousId} actualizada como mesa ${tableNumber}.`);
        render();
      }
      return;
    }
    if (!event.target.matches("[data-product-form]")) return;
    event.preventDefault();
    const form = new FormData(event.target);
    const price = Math.round(Number(form.get("price")) * 100);
    const rawCost = String(form.get("cost") || "").trim();
    const name = String(form.get("name") || "").trim();
    const category = String(form.get("category") || "").trim();
    if (!name || !category || !Number.isFinite(price) || price < 0 || (rawCost && (!Number.isFinite(Number(rawCost)) || Number(rawCost) < 0))) { flash("Completa nombre, familia y un precio válido."); render(); return; }
    if (!isCloudConnected()) { flash("Inicia sesión para guardar cambios en la carta central."); render(); return; }
    const input = { name, category, description: String(form.get("description") || "").trim(), priceCents: price, costCents: rawCost ? Math.round(Number(rawCost) * 100) : null, sendsToKitchen: form.get("sendsToKitchen") === "on" };
    const creatingProduct = state.creatingProduct;
    const productId = state.editingId;
    const image = form.get("image");
    const upload = image?.size ? Cloud.uploadProductImage(image) : Promise.resolve(form.get("removeImage") === "on" ? null : undefined);
    event.target.querySelector('button[type="submit"]')?.setAttribute("disabled", "disabled");
    upload
      .then((imageUrl) => {
        if (imageUrl !== undefined) input.imageUrl = imageUrl;
        return creatingProduct ? Cloud.createProduct(input) : Cloud.updateProduct(state.data.cloudProductIds?.[productId], input);
      })
      .then(async () => {
        await refreshCloudProducts();
        state.editingId = null;
        state.creatingProduct = false;
        flash(creatingProduct ? "Artículo añadido a la carta central." : "Artículo actualizado en la base central.");
        render();
      })
      .catch((error) => { flash(error.message); render(); });
  });
  render();
  window.addEventListener("hashchange", () => {
    if (window.location.hash !== "#nuevo-articulo") return;
    state.editingId = null;
    state.creatingProduct = true;
    render();
  });
  if (isCloudConnected()) {
    Promise.all([refreshCloudTables(), refreshCloudProducts(), refreshCloudSales(), refreshCloudStaff(), refreshCloudCash(), refreshCloudShiftHistory(), refreshCloudTableHistory(), refreshCloudProduction(), refreshCloudAccounting(), refreshCloudReservations()]).then(render).catch(() => {});
    window.setInterval(() => Promise.all([refreshCloudTables(), refreshCloudProducts(), refreshCloudSales(), refreshCloudCash(), refreshCloudShiftHistory(), refreshCloudTableHistory(), refreshCloudProduction(), refreshCloudAccounting(), refreshCloudReservations()]).then(render).catch(() => {}), 15000);
  }
})();
