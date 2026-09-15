(function () {
  const Core = window.BC_TPV;
  const Cloud = window.BC_TPV_CLOUD;
  const root = document.getElementById("tpv-gestion-root");
  if (!Core || !root) return;

  const state = { tab: "ventas", search: "", staff: [], cashSession: null, cashHistory: [], shiftHistory: [], tableHistory: [], editingId: null, creatingProduct: window.location.hash === "#nuevo-articulo", editingTableId: null, deletingTableId: null, loginOpen: false, loginUsername: "carlos", data: Core.loadData(), toast: null };
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
    return `<aside class="tpv-management-sidebar"><a class="tpv-brand" href="tpv.html"><span class="tpv-brand__mark">C</span><span class="tpv-brand__type"><strong>Contrastes</strong><small>Gestión TPV</small></span></a><nav><a href="tpv.html">← Volver al TPV</a><button type="button" class="${state.tab === "ventas" ? "is-active" : ""}" data-tab="ventas">Ventas</button><button type="button" class="${state.tab === "historial" ? "is-active" : ""}" data-tab="historial">Historial de mesas</button><button type="button" class="${state.tab === "caja" ? "is-active" : ""}" data-tab="caja">Caja y cierres</button><button type="button" class="${state.tab === "articulos" ? "is-active" : ""}" data-tab="articulos">Artículos y precios</button><button type="button" class="${state.tab === "fidelizacion" ? "is-active" : ""}" data-tab="fidelizacion">Fidelización · Duros</button><button type="button" class="${state.tab === "produccion" ? "is-active" : ""}" data-tab="produccion">Producción</button><button type="button" class="${state.tab === "escandallo" ? "is-active" : ""}" data-tab="escandallo">Escandallo</button><button type="button" class="${state.tab === "sala" ? "is-active" : ""}" data-tab="sala">Sala y mesas</button><button type="button" class="${state.tab === "personal" ? "is-active" : ""}" data-tab="personal">Personal y PIN</button><button type="button" class="${state.tab === "contabilidad" ? "is-active" : ""}" data-tab="contabilidad">Contabilidad</button></nav><p>Panel interno<br>Datos guardados en la base central.</p></aside>`;
  }
  function topbar() {
    const title = { ventas: "Ventas", historial: "Historial de mesas", caja: "Caja y cierres", articulos: "Artículos y precios", fidelizacion: "Fidelización", produccion: "Producción", escandallo: "Escandallo", sala: "Sala y mesas", personal: "Personal y PIN", contabilidad: "Contabilidad" }[state.tab];
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
    const categoryOrder = categories.length ? `<section class="tpv-gestion-card"><header><div><h2>Orden de familias en la carta</h2><span>Este orden aparece en los filtros del TPV de camareros</span></div></header><div class="tpv-category-order">${categories.map((category, index) => `<article><span>${index + 1}</span><b>${escapeHtml(category.name)}</b>${canManage ? `<div><button class="tpv-edit-button" type="button" data-move-category="${category.id}" data-direction="up" ${index === 0 ? "disabled" : ""}>↑</button><button class="tpv-edit-button" type="button" data-move-category="${category.id}" data-direction="down" ${index === categories.length - 1 ? "disabled" : ""}>↓</button></div>` : ""}</article>`).join("")}</div></section>` : "";
    return `<section class="tpv-gestion-content">${categoryOrder}<section class="tpv-gestion-card"><header><div><h2>Catálogo del restaurante</h2><span>${products.length} artículos · sincronizados en todos los TPV</span></div><div class="tpv-gestion-header-actions"><label class="tpv-search"><span>⌕</span><input type="search" value="${escapeHtml(state.search)}" placeholder="Buscar artículo" data-search-products></label>${canManage ? `<a class="tpv-action" href="tpv-articulo-nuevo">Nuevo artículo</a>` : ""}</div></header><div class="tpv-articles-table"><div class="tpv-articles-row is-heading"><span>Artículo</span><span>Familia</span><span>PVP</span><span>Coste compra</span><span>Margen</span><span></span></div>${products.map((item) => { const pvp = item.priceCents; const cost = state.data.costs?.[item.id]; const margin = Number.isFinite(Number(cost)) ? pvp - Number(cost) : null; return `<div class="tpv-articles-row ${item.active === false ? "is-inactive" : ""}"><div><b>${escapeHtml(item.name)}${item.active === false ? " · Desactivado" : ""}</b><small>${escapeHtml(item.description)}</small></div><span>${escapeHtml(item.category)}</span><strong>${Core.formatEuros(pvp)}</strong><span>${margin === null ? `<em>Pendiente</em>` : Core.formatEuros(cost)}</span><span>${margin === null ? "—" : Core.formatEuros(margin)}</span>${canManage ? `<button class="tpv-edit-button" type="button" data-edit-product="${item.id}">Editar</button>` : ""}</div>`; }).join("") || `<p class="tpv-gestion-empty">No se han encontrado artículos.</p>`}</div></section><aside class="tpv-management-note"><h2>Carta centralizada</h2><p>Sube o baja una familia para decidir qué filtros ven primero los camareros: por ejemplo, Bocatas, Cafés o Bebidas.</p><p>Los cambios se guardan en la base central y se aplican en todos los TPV conectados.</p></aside></section>`;
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
    return `<section class="tpv-gestion-content"><div class="tpv-gestion-metrics"><article><span>Clientes</span><strong>${customers.length}</strong></article><article><span>Duros emitidos</span><strong>${duros}</strong></article><article><span>Regla inicial</span><strong>1 € = 1 Duro</strong></article><article><span>Canje</span><strong>Por definir</strong></article></div><section class="tpv-gestion-card"><header><div><h2>Alta de cliente</h2><span>Base inicial para el programa de fidelización</span></div></header><form class="tpv-loyalty-form" data-loyalty-form><label>Nombre<input name="name" maxlength="80" placeholder="Nombre del cliente" required></label><label>Teléfono<input name="phone" inputmode="tel" maxlength="30" placeholder="Opcional"></label><label>Email<input name="email" type="email" maxlength="120" placeholder="Opcional"></label><button class="tpv-action" type="submit">Crear cliente</button></form><div class="tpv-loyalty-list">${customers.length ? customers.map((customer) => `<article><div><b>${escapeHtml(customer.name)}</b><small>${escapeHtml(customer.phone || customer.email || "Sin contacto")}</small></div><strong>${Number(customer.duros || 0)} Duros</strong></article>`).join("") : `<p class="tpv-gestion-empty">Aún no hay clientes. Crea el primero para enseñar el programa.</p>`}</div></section><aside class="tpv-management-note"><h2>Cómo crecerá</h2><p>El cliente se seleccionará al cobrar una mesa y acumulará automáticamente Duros por el importe de la compra.</p><p>El canje, caducidad y promociones se definirán con tu jefe antes de activarlos.</p></aside></section>`;
  }
  function productionRows() {
    const sold = new Map();
    state.data.sales.forEach((sale) => (sale.lines || []).forEach((line) => sold.set(line.productId, (sold.get(line.productId) || 0) + Number(line.qty || 0))));
    return [...sold.entries()].map(([productId, quantity]) => ({ item: product(productId), quantity })).filter((row) => row.item).sort((first, second) => second.quantity - first.quantity).slice(0, 12);
  }
  function renderProduction() {
    const rows = productionRows();
    const stock = state.data.stockLevels || {};
    return `<section class="tpv-gestion-content"><div class="tpv-gestion-metrics"><article><span>Base de cálculo</span><strong>${state.data.sales.length} ventas</strong></article><article><span>Horizonte</span><strong>Próx. 3 días</strong></article><article><span>Artículos a revisar</span><strong>${rows.length}</strong></article><article><span>Stock</span><strong>Editable</strong></article></div><section class="tpv-gestion-card"><header><div><h2>Previsión de compra</h2><span>Estimación inicial según las ventas registradas y el stock introducido</span></div></header><div class="tpv-production-table"><div class="tpv-production-row is-heading"><span>Artículo</span><span>Vendidas</span><span>Previsión</span><span>Stock actual</span><span>Sugerencia</span></div>${rows.length ? rows.map((row) => { const forecast = Math.max(1, Math.ceil(row.quantity * 1.5)); const currentStock = Math.max(0, Number(stock[row.item.id] || 0)); return `<div class="tpv-production-row"><b>${escapeHtml(row.item.name)}</b><span>${row.quantity} uds.</span><span>${forecast} uds.</span><input type="number" min="0" value="${currentStock}" data-stock-product="${row.item.id}" aria-label="Stock de ${escapeHtml(row.item.name)}"><strong>${Math.max(0, forecast - currentStock)} uds.</strong></div>`; }).join("") : `<p class="tpv-gestion-empty">Cuando haya ventas cobradas, aquí aparecerán las previsiones por producto.</p>`}</div></section><aside class="tpv-management-note"><h2>Previsión inicial</h2><p>Ahora calcula una propuesta básica. Después podremos añadir ingredientes, proveedores, temporadas, días de la semana y stock mínimo.</p><p>Así el pedido sugerido pasará de productos vendidos a cantidades reales de compra.</p></aside></section>`;
  }
  function renderCosting() { return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><header><div><h2>Escandallo de recetas</h2><span>Diseñado para conocer el coste real y el margen de cada plato</span></div></header><div class="tpv-feature-grid"><article><b>Ingredientes por receta</b><span>Gramajes, unidades y mermas por cada artículo.</span></article><article><b>Coste automático</b><span>Coste por ración, margen bruto y aviso si cambia el proveedor.</span></article><article><b>Rentabilidad</b><span>Comparativa entre precio, coste y margen de cada plato.</span></article></div></section><aside class="tpv-management-note"><h2>Para decidir con tu jefe</h2><p>Hay que definir si el escandallo se hará por receta, por lote, por proveedor o combinando los tres.</p><p>Esta sección está preparada como propuesta antes de cargar ingredientes reales.</p></aside></section>`; }
  function renderAccounting() { return `<section class="tpv-gestion-content"><section class="tpv-gestion-card tpv-coming-soon"><span>Próximamente</span><h2>Contabilidad</h2><p>Ingresos, gastos, facturas, impuestos y exportación para la asesoría.</p></section></section>`; }
  function priceModal() {
    if (!state.editingId && !state.creatingProduct) return "";
    const item = state.creatingProduct ? null : product(state.editingId);
    const cost = item ? state.data.costs?.[state.editingId] : undefined;
    const title = item ? item.name : "Nuevo artículo";
    return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-product-form><button class="tpv-modal__close" type="button" data-close-edit aria-label="Cerrar">×</button><h2>${escapeHtml(title)}</h2><p>${item ? "Edita la información que aparecerá en el TPV." : "El artículo quedará disponible en todos los TPV conectados."}</p><label>Nombre<input name="name" maxlength="160" value="${escapeHtml(item?.name || "")}" required autofocus></label><label>Familia<input name="category" maxlength="100" value="${escapeHtml(item?.category || "")}" placeholder="Ej. Para picar" required></label><label>Formato o descripción<input name="description" maxlength="500" value="${escapeHtml(item?.description || "")}" placeholder="Ej. Ración entera"></label><label>Precio de venta (€)<input name="price" type="number" min="0" step="0.01" value="${item ? (item.priceCents / 100).toFixed(2) : ""}" required></label><label>Coste de compra (€)<input name="cost" type="number" min="0" step="0.01" value="${cost === undefined ? "" : (Number(cost) / 100).toFixed(2)}" placeholder="Pendiente"></label><label class="tpv-checkbox"><input name="sendsToKitchen" type="checkbox" ${item?.sendsToKitchen ? "checked" : ""}><span>Enviar este artículo a cocina</span></label><div class="tpv-modal__actions">${item?.active !== false ? `<button class="tpv-action is-danger" type="button" data-archive-product="${item.id}">Desactivar</button>` : ""}<button class="tpv-action is-secondary" type="button" data-close-edit>Cancelar</button><button class="tpv-action" type="submit">${item ? "Guardar cambios" : "Crear artículo"}</button></div></form></div>`;
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
    const content = state.tab === "ventas" ? renderSales() : state.tab === "historial" ? renderTableHistory() : state.tab === "caja" ? renderCashManagement() : state.tab === "articulos" ? renderArticles() : state.tab === "fidelizacion" ? renderLoyalty() : state.tab === "produccion" ? renderProduction() : state.tab === "escandallo" ? renderCosting() : state.tab === "contabilidad" ? renderAccounting() : state.tab === "personal" ? renderStaff() : renderTables();
    root.innerHTML = `<div class="tpv-management-app">${nav()}<main class="tpv-management-main">${topbar()}${content}</main>${priceModal()}${tableModal()}${loginModal()}${state.toast ? `<div class="tpv-toast is-success">${escapeHtml(state.toast)}</div>` : ""}</div>`;
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
    if (button.dataset.tab) { state.tab = button.dataset.tab; if (state.tab === "personal") { Promise.all([refreshCloudStaff(), refreshCloudShiftHistory()]).then(render).catch((error) => { flash(error.message); render(); }); } if (state.tab === "historial") { refreshCloudTableHistory().then(render).catch((error) => { flash(error.message); render(); }); } if (state.tab === "caja") { refreshCloudCash().then(render).catch((error) => { flash(error.message); render(); }); } render(); return; }
    if (button.dataset.loginUser) { state.loginUsername = button.dataset.loginUser; render(); return; }
    if (button.dataset.openLogin !== undefined) { state.loginOpen = true; render(); return; }
    if (button.dataset.closeLogin !== undefined) { state.loginOpen = false; render(); return; }
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
  root.addEventListener("submit", (event) => {
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
    const request = creatingProduct ? Cloud.createProduct(input) : Cloud.updateProduct(state.data.cloudProductIds?.[productId], input);
    request
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
    Promise.all([refreshCloudTables(), refreshCloudProducts(), refreshCloudSales(), refreshCloudStaff(), refreshCloudCash(), refreshCloudShiftHistory(), refreshCloudTableHistory()]).then(render).catch(() => {});
    window.setInterval(() => Promise.all([refreshCloudTables(), refreshCloudProducts(), refreshCloudSales(), refreshCloudCash(), refreshCloudShiftHistory(), refreshCloudTableHistory()]).then(render).catch(() => {}), 15000);
  }
})();
