(function () {
  const Core = window.BC_TPV;
  const Cloud = window.BC_TPV_CLOUD;
  const root = document.getElementById("tpv-root");
  if (!Core || !root) return;

  const state = { page: "sala", selectedTableId: null, category: "all", modal: null, extraProductId: null, loginUsername: "carlos", toast: null, cashSession: null, paymentMethods: [], shift: null, data: Core.loadData() };
  let toastTimer = null;
  const orderSyncQueues = new Map();

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function product(productId) { return Core.getProduct(productId, state.data); }
  function lineCount(lines) { return (lines || []).reduce((total, line) => total + Number(line.qty || 0), 0); }
  function total(lines) { return (lines || []).reduce((sum, line) => sum + (product(line.productId)?.priceCents || 0) * Number(line.qty || 0), 0); }
  function save() { Core.saveData(state.data); }
  function session() { return Cloud?.getSession?.() || null; }
  function isCloudConnected() { return Boolean(session()); }
  function canManageCash() { return ["admin", "manager"].includes(session()?.user?.role); }
  async function refreshCashSession() {
    if (!isCloudConnected()) return;
    try { state.cashSession = await Cloud.loadCashSession(); } catch (error) { state.cashSession = null; }
  }
  async function refreshPaymentMethods() {
    if (!isCloudConnected()) return;
    try { state.paymentMethods = await Cloud.loadPaymentMethods(); } catch (error) { state.paymentMethods = []; }
  }
  async function refreshShift() {
    if (!isCloudConnected()) return;
    try { state.shift = await Cloud.loadShift(); } catch (error) { state.shift = null; }
  }
  function shiftDuration() {
    if (!state.shift?.started_at) return "Sin iniciar";
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(state.shift.started_at).getTime()) / 60000));
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  }
  function productExternalIds() {
    return Object.fromEntries(Object.entries(state.data.cloudProductIds || {}).map(([externalId, id]) => [id, externalId]));
  }
  function linesFromRemote(items) {
    const externalIds = productExternalIds();
    return (items || []).map((item) => ({ productId: externalIds[item.product_id] || item.productId, qty: Number(item.quantity || item.qty || 0), modifiers: item.modifiers || [] })).filter((line) => line.productId && line.qty > 0);
  }
  function queueOrderSave(tableId) {
    const ticket = state.data.tables[tableId];
    if (!ticket || !isCloudConnected()) return Promise.resolve();
    ticket.syncPending = true;
    const previous = orderSyncQueues.get(tableId) || Promise.resolve();
    const task = previous.then(async () => {
      if (!ticket.cloudOrderId) ticket.cloudOrderId = (await Cloud.openOrder(tableId)).id;
      await Cloud.saveOrder(ticket.cloudOrderId, ticket.lines.map((line) => ({ ...line })));
    });
    orderSyncQueues.set(tableId, task);
    return task.finally(() => {
      if (orderSyncQueues.get(tableId) === task) {
        ticket.syncPending = false;
        orderSyncQueues.delete(tableId);
      }
    });
  }
  async function refreshCloudState() {
    if (!session()) return;
    let products = await Cloud.loadProducts(true);
    if (!products.length && ["admin", "manager"].includes(session().user.role)) products = await Cloud.seedProducts();
    const [tables, orders, kitchenOrders, categories] = await Promise.all([Cloud.loadTables(), Cloud.loadOrders(), Cloud.loadKitchenOrders(), Cloud.loadCategories()]);
    Cloud.saveRemoteTables(state.data, tables);
    Cloud.saveRemoteProducts(state.data, products);
    Cloud.saveRemoteCategories(state.data, categories);
    const existingTables = state.data.tables;
    const openTables = {};
    orders.forEach((order) => {
      const tableId = String(order.table_number);
      const localTicket = existingTables[tableId];
      openTables[tableId] = localTicket?.syncPending ? localTicket : { cloudOrderId: order.id, openedAt: order.opened_at, sentAt: order.status === "sent" ? order.updated_at : null, lines: linesFromRemote(order.pos_order_items) };
    });
    Object.entries(existingTables).forEach(([tableId, ticket]) => {
      if (ticket.syncPending && !openTables[tableId]) openTables[tableId] = ticket;
    });
    state.data.tables = openTables;
    state.data.kitchenOrders = kitchenOrders.map((order) => ({
      id: order.order_id,
      tableId: String(order.raw_payload?.tableNumber || String(order.delivery_detail || "").replace(/\D/g, "")),
      status: order.status,
      createdAt: order.created_at,
      lines: (order.items || []).map((line) => ({ productId: productExternalIds()[line.productId] || line.productId, qty: Number(line.qty || 0) })).filter((line) => line.productId && line.qty > 0),
    }));
    save();
  }
  function timeSince(value) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    return minutes < 1 ? "ahora" : `${minutes} min`;
  }
  function flash(message, tone = "") {
    state.toast = { message, tone };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = null; render(); }, 2800);
  }
  function tableStatus(tableId) {
    const ticket = state.data.tables[tableId];
    if (!ticket) return "free";
    const orders = state.data.kitchenOrders.filter((order) => order.tableId === tableId && !["delivered", "completed", "cancelled"].includes(order.status));
    if (orders.some((order) => order.status === "ready")) return "ready";
    if (orders.some((order) => order.status === "preparing")) return "preparing";
    return "open";
  }
  function statusText(status) { return ({ free: "Libre", open: "Abierta", preparing: "En cocina", ready: "Lista", pending: "Pendiente" })[status] || status; }
  async function openTable(tableId) {
    if (!state.data.tables[tableId]) state.data.tables[tableId] = { openedAt: new Date().toISOString(), lines: [], sentAt: null };
    state.selectedTableId = tableId;
    state.category = "all";
    state.page = "comanda";
    save();
    render();
    if (isCloudConnected()) {
      try {
        state.data.tables[tableId].syncPending = true;
        const order = await Cloud.openOrder(tableId);
        const ticket = state.data.tables[tableId];
        if (ticket) {
          ticket.cloudOrderId = order.id;
          if (order.pos_order_items?.length) ticket.lines = linesFromRemote(order.pos_order_items);
          ticket.openedAt = order.opened_at || ticket.openedAt;
          ticket.syncPending = false;
          save();
          render();
        }
      } catch (error) {
        if (state.data.tables[tableId]) state.data.tables[tableId].syncPending = false;
        flash(error.message);
        render();
      }
    }
  }
  async function changeLine(productId, amount, modifiers = [], lineIndex = null) {
    const ticket = state.data.tables[state.selectedTableId];
    if (!ticket) return;
    const line = lineIndex === null ? ticket.lines.find((item) => item.productId === productId && JSON.stringify(item.modifiers || []) === JSON.stringify(modifiers)) : ticket.lines[lineIndex];
    if (lineIndex !== null) productId = line?.productId;
    const quantity = Math.max(0, Number(line?.qty || 0) + amount);
    if (!line && quantity) ticket.lines.push({ productId, qty: quantity, modifiers });
    if (line && quantity) line.qty = quantity;
    if (line && !quantity) ticket.lines = ticket.lines.filter((item) => item.productId !== productId);
    save();
    render();
    if (isCloudConnected()) {
      try {
        await queueOrderSave(state.selectedTableId);
      } catch (error) {
        flash(error.message);
        render();
      }
    }
  }
  function pendingKitchenLines(ticket) {
    const sent = new Map();
    state.data.kitchenOrders.filter((order) => order.tableId === state.selectedTableId && !["delivered", "completed", "cancelled"].includes(order.status)).flatMap((order) => order.lines).forEach((line) => sent.set(line.productId, (sent.get(line.productId) || 0) + line.qty));
    return ticket.lines.map((line) => ({ ...line, qty: Math.max(0, line.qty - (sent.get(line.productId) || 0)) })).filter((line) => line.qty > 0 && Core.isKitchenProduct(product(line.productId)));
  }
  async function sendKitchen() {
    const ticket = state.data.tables[state.selectedTableId];
    const lines = ticket ? pendingKitchenLines(ticket) : [];
    if (!lines.length) { flash("No hay productos de cocina nuevos para enviar."); render(); return; }
    state.data.kitchenOrders.unshift({ id: `K-${state.data.sequence++}`, tableId: state.selectedTableId, status: "pending", createdAt: new Date().toISOString(), lines });
    ticket.sentAt = new Date().toISOString();
    save();
    if (isCloudConnected()) {
      try {
        await queueOrderSave(state.selectedTableId);
        await Cloud.sendOrderToKitchen(ticket.cloudOrderId, ticket.lines);
        await refreshCloudState();
      } catch (error) {
        flash(error.message);
        render();
        return;
      }
    }
    flash(`Comanda de la mesa ${state.selectedTableId} enviada a cocina.`, "success");
    render();
  }
  async function moveKitchenOrder(orderId, status) {
    const order = state.data.kitchenOrders.find((item) => item.id === orderId);
    if (!order) return;
    order.status = status;
    save();
    if (isCloudConnected()) {
      try {
        await Cloud.updateKitchenOrder(orderId, status === "delivered" ? "completed" : status);
      } catch (error) {
        flash(error.message);
        render();
        return;
      }
    }
    flash(status === "ready" ? `Mesa ${order.tableId} lista para servir.` : "Estado de cocina actualizado.", "success");
    render();
  }
  function addLoyaltyDuros(customerId, totalCents) {
    if (!customerId) return null;
    const customers = Array.isArray(state.data.loyaltyCustomers) ? state.data.loyaltyCustomers : [];
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return null;
    const duros = Math.floor(Number(totalCents || 0) / 100);
    customer.duros = Number(customer.duros || 0) + duros;
    return { customer, duros };
  }
  async function pay(method, customerId, paymentMethodId) {
    const ticket = state.data.tables[state.selectedTableId];
    if (!ticket?.lines.length) { flash("Añade algún producto antes de cobrar."); render(); return; }
    const totalCents = total(ticket.lines);
    if (isCloudConnected()) {
      try {
        await queueOrderSave(state.selectedTableId);
        await Cloud.payOrder(ticket.cloudOrderId, method, ticket.lines, paymentMethodId);
        await refreshCashSession();
      } catch (error) {
        flash(error.message);
        render();
        return;
      }
    }
    state.data.sales.unshift({ id: `V-${state.data.sequence++}`, tableId: state.selectedTableId, customerId: customerId || null, totalCents, method, paidAt: new Date().toISOString(), lines: ticket.lines.map((line) => ({ ...line })) });
    const loyalty = addLoyaltyDuros(customerId, totalCents);
    state.data.kitchenOrders.forEach((order) => { if (order.tableId === state.selectedTableId && order.status === "ready") order.status = "delivered"; });
    delete state.data.tables[state.selectedTableId];
    state.selectedTableId = null;
    state.modal = null;
    state.page = "sala";
    save();
    flash(`Mesa cobrada en ${method === "card" ? "tarjeta" : "efectivo"} y cerrada.${loyalty ? ` ${loyalty.customer.name} suma ${loyalty.duros} Duros.` : ""}`, "success");
    render();
  }
  function resetDemo() {
    state.data = Core.initialData();
    state.selectedTableId = null;
    state.modal = null;
    state.page = "sala";
    save();
    flash("Datos de demostración restaurados.", "success");
    render();
  }

  function sidebar() {
    const nav = [["sala", "▦", "Sala"], ["cocina", "♨", "Cocina"], ["caja", "€", "Caja"]];
    const user = session()?.user;
    return `<aside class="tpv-sidebar"><a class="tpv-brand" href="index.html" aria-label="Volver a Bolera Contrastes"><span class="tpv-brand__mark">C</span><span class="tpv-brand__type"><strong>Contrastes</strong><small>TPV camarero</small></span></a><nav class="tpv-nav" aria-label="Navegación TPV">${nav.map(([page, icon, label]) => `<button type="button" class="${state.page === page || (page === "sala" && state.page === "comanda") ? "is-active" : ""}" data-nav="${page}"><span class="tpv-nav__icon">${icon}</span>${label}</button>`).join("")}</nav><div class="tpv-sidebar__bottom"><div class="tpv-user"><span class="tpv-user__avatar">${user ? escapeHtml(user.displayName.slice(0, 2).toUpperCase()) : "--"}</span><span>${user ? escapeHtml(user.displayName) : "Sin sesión"}</span></div>${user ? `<div class="tpv-shift"><span>Jornada · ${shiftDuration()}</span><button type="button" data-shift-action="${state.shift ? "end" : "start"}">${state.shift ? "Finalizar jornada" : "He llegado"}</button></div>` : ""}<button type="button" class="tpv-reset" data-open-login="true">${user ? "Sesión iniciada" : "Acceder al TPV"}</button>${user ? `<button type="button" class="tpv-reset" data-logout="true">Cerrar sesión</button>` : ""}<button type="button" class="tpv-reset" data-reset-demo="true">Restaurar demo</button></div></aside>`;
  }
  function topbar(title, subtitle) { return `<header class="tpv-topbar"><div><h1>${title}</h1><p>${subtitle}</p></div><span class="tpv-live">${session() ? "Mesas sincronizadas" : "Sistema local activo"}</span></header>`; }
  function renderFloor() {
    const opened = Object.keys(state.data.tables).length;
    const layout = Core.getTables(state.data);
    return `${topbar("Sala", `${opened} mesas abiertas · toca una mesa para tomar nota`)}<section class="tpv-floor-panel"><div class="tpv-panel__head"><div><h2>Plano del local</h2><span>Verde: lista · Ámbar: comanda abierta</span></div><span class="tpv-floor-count">${layout.length} mesas configuradas</span></div><div class="tpv-floor" aria-label="Plano de mesas"><div class="tpv-floor__bar"><span>Barra</span><i></i><i></i><i></i><i></i></div><div class="tpv-floor__plants" aria-hidden="true">●<br>●<br>●<br>●</div>${layout.map((table) => { const ticket = state.data.tables[table.id]; const status = tableStatus(table.id); return `<button type="button" class="tpv-floor-table is-${status} ${table.area === "wall" ? "is-wall" : ""}" style="--x:${table.x};--y:${table.y}" data-open-table="${table.id}" aria-label="${table.name}, ${statusText(status)}"><span class="tpv-floor-table__desk"></span><strong>${table.id}</strong><small>${ticket ? Core.formatEuros(total(ticket.lines)) : statusText(status)}</small></button>`; }).join("")}</div><div class="tpv-floor-legend"><span><i class="is-free"></i>Libre</span><span><i class="is-open"></i>Abierta</span><span><i class="is-preparing"></i>En cocina</span><span><i class="is-ready"></i>Lista para servir</span></div></section>`;
  }
  function ticketView(ticket) {
    const lines = ticket.lines || [];
    return `<aside class="tpv-ticket"><div class="tpv-ticket__head"><strong>Mesa ${state.selectedTableId}</strong><small>${lineCount(lines)} productos · abierta ${timeSince(ticket.openedAt)}</small></div>${lines.length ? `<ul class="tpv-ticket__items">${lines.map((line, index) => { const item = product(line.productId); return `<li><div><strong>${escapeHtml(item?.name || "Producto")}</strong><small>${line.modifiers?.length ? `${escapeHtml(line.modifiers.join(" · "))} · ` : ""}${Core.formatEuros(item?.priceCents || 0)} unidad</small></div><div><b>${Core.formatEuros((item?.priceCents || 0) * line.qty)}</b><div class="tpv-qty"><button type="button" data-change-line="${index}" data-amount="-1">−</button><span>${line.qty}</span><button type="button" data-change-line="${index}" data-amount="1">+</button></div></div></li>`; }).join("")}</ul>` : `<div class="tpv-ticket__empty">Aún no hay productos. Selecciónalos de la carta.</div>`}<div class="tpv-ticket__total"><span>Total</span><strong>${Core.formatEuros(total(lines))}</strong></div><div class="tpv-ticket__actions"><button type="button" class="tpv-action is-secondary" data-send-kitchen="true">Enviar cocina</button><button type="button" class="tpv-action" data-open-payment="true" ${lines.length ? "" : "disabled"}>Cobrar mesa</button></div></aside>`;
  }
  function renderOrder() {
    const ticket = state.data.tables[state.selectedTableId];
    if (!ticket) { state.page = "sala"; return renderFloor(); }
    const catalog = Core.getProducts(state.data);
    const categories = [{ id: "all", label: "Todo" }, ...Array.from(new Map(catalog.map((item) => [item.categoryId, { id: item.categoryId, label: item.category }])).values())];
    const visible = catalog.filter((item) => state.category === "all" || item.categoryId === state.category);
    return `${topbar(`Mesa ${state.selectedTableId}`, "Añade productos y envía la comanda cuando esté lista")}<div class="tpv-order"><section class="tpv-panel"><div class="tpv-panel__head"><div><h2>Carta completa</h2><span>${visible.length} productos disponibles</span></div><button class="tpv-action is-secondary" type="button" data-nav="sala">Volver a sala</button></div><div class="tpv-category-filter">${categories.map((category) => `<button type="button" class="${state.category === category.id ? "is-active" : ""}" data-category="${category.id}">${escapeHtml(category.label)}</button>`).join("")}</div><div class="tpv-catalog">${visible.map((item) => { const detail = item.description && item.description !== item.category ? `<small>${escapeHtml(item.description)}</small>` : ""; return `<article class="tpv-product${item.image ? " has-image" : ""}">${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">` : ""}<div class="tpv-product__copy"><strong>${escapeHtml(item.name)}</strong>${detail}</div><div class="tpv-product__bottom"><span class="tpv-product__price">${Core.formatEuros(item.priceCents)}</span><button type="button" class="tpv-add" data-add-product="${item.id}">Añadir</button></div></article>`; }).join("")}</div></section>${ticketView(ticket)}</div>`;
  }
  function kitchenCard(order) {
    const actions = order.status === "pending" ? `<button type="button" data-kitchen-order="${order.id}" data-kitchen-status="preparing">Empezar</button>` : order.status === "preparing" ? `<button type="button" data-kitchen-order="${order.id}" data-kitchen-status="ready">Marcar lista</button>` : `<button type="button" data-kitchen-order="${order.id}" data-kitchen-status="delivered">Entregada</button>`;
    return `<article class="tpv-kitchen-card"><div class="tpv-kitchen-card__head"><strong>Mesa ${order.tableId}</strong><span>${timeSince(order.createdAt)}</span></div><ul>${order.lines.map((line) => `<li><b>${line.qty}×</b> ${escapeHtml(product(line.productId)?.name || "Producto")}</li>`).join("")}</ul><div class="tpv-kitchen-card__actions">${actions}</div></article>`;
  }
  function renderKitchen() {
    const groups = [["pending", "Pendientes"], ["preparing", "En preparación"], ["ready", "Listas"]];
    return `${topbar("Cocina", "Comandas enviadas desde las mesas")}<section class="tpv-kitchen">${groups.map(([status, title]) => { const orders = state.data.kitchenOrders.filter((order) => order.status === status); return `<section class="tpv-kitchen-column"><div class="tpv-kitchen-column__head"><h2>${title}</h2><span>${orders.length}</span></div><div class="tpv-kitchen-list">${orders.length ? orders.map(kitchenCard).join("") : `<p class="tpv-kitchen-empty">No hay comandas.</p>`}</div></section>`; }).join("")}</section>`;
  }
  function renderCash() {
    const sales = state.data.sales;
    const localCard = sales.filter((sale) => sale.method === "card").reduce((sum, sale) => sum + sale.totalCents, 0);
    const localCash = sales.filter((sale) => sale.method === "cash").reduce((sum, sale) => sum + sale.totalCents, 0);
    const summary = state.cashSession?.summary;
    const card = summary ? summary.cardSalesCents : localCard;
    const cash = summary ? summary.cashSalesCents : localCash;
    const movements = summary?.movements || [];
    const status = !isCloudConnected() ? "Datos locales" : state.cashSession ? `Abierta desde ${new Date(state.cashSession.opened_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : "Sin caja abierta";
    let operations = "";
    if (!isCloudConnected()) operations = `<p>Inicia sesión para gestionar la caja central.</p>`;
    else if (!state.cashSession) operations = canManageCash() ? `<p>Abre el turno antes de registrar movimientos o realizar el cierre.</p><button type="button" class="tpv-action" data-open-cash>Abrir caja</button>` : `<p>No hay caja abierta. Un administrador debe abrir el turno.</p>`;
    else operations = `<div class="tpv-cash-expected"><span>Efectivo esperado</span><strong>${Core.formatEuros(summary.expectedCashCents)}</strong><small>Fondo ${Core.formatEuros(state.cashSession.opening_float_cents)} · movimientos ${summary.movementCents >= 0 ? "+" : ""}${Core.formatEuros(summary.movementCents)}</small></div>${canManageCash() ? `<div class="tpv-cash-actions"><button type="button" class="tpv-action is-secondary" data-cash-movement>Entrada / salida</button><button type="button" class="tpv-action is-secondary" data-cash-count>Arqueo</button><button type="button" class="tpv-action is-secondary" data-add-card>Nueva tarjeta</button><button type="button" class="tpv-action" data-close-cash>Cerrar turno</button></div>` : `<p>Solo administración puede realizar movimientos, arqueos o cerrar turno.</p>`}${summary.counts?.length ? `<div class="tpv-cash-counts"><b>Últimos arqueos</b>${summary.counts.slice(0, 3).map((count) => `<span>${new Date(count.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · ${Core.formatEuros(count.counted_cash_cents)} (${Number(count.difference_cents) === 0 ? "cuadra" : Core.formatEuros(count.difference_cents)})</span>`).join("")}</div>` : ""}${movements.length ? `<ul class="tpv-cash-movements">${movements.map((movement) => `<li><span>${movement.movement_type === "in" ? "Entrada" : "Salida"} · ${escapeHtml(movement.reason)}</span><b class="${movement.movement_type === "out" ? "is-out" : ""}">${movement.movement_type === "out" ? "−" : "+"}${Core.formatEuros(movement.amount_cents)}</b></li>`).join("")}</ul>` : `<p class="tpv-cash-empty">No hay movimientos manuales.</p>`}`;
    return `${topbar("Caja", status)}<section class="tpv-cash"><div><div class="tpv-cash__summary"><article class="tpv-metric"><span>Ventas del turno</span><strong>${Core.formatEuros(card + cash)}</strong></article><article class="tpv-metric"><span>Tarjeta</span><strong>${Core.formatEuros(card)}</strong></article><article class="tpv-metric"><span>Efectivo</span><strong>${Core.formatEuros(cash)}</strong></article></div><section class="tpv-panel tpv-open-bills"><div class="tpv-panel__head"><div><h2>Mesas pendientes de cobro</h2><span>Selecciona una para abrir la cuenta</span></div></div>${Object.keys(state.data.tables).length ? Object.keys(state.data.tables).map((tableId) => { const ticket = state.data.tables[tableId]; return `<div class="tpv-bill"><div><strong>Mesa ${tableId}</strong><small>${lineCount(ticket.lines)} productos · ${timeSince(ticket.openedAt)}</small></div><span class="tpv-bill__amount">${Core.formatEuros(total(ticket.lines))}</span><button type="button" class="tpv-action is-secondary" data-open-table="${tableId}">Abrir</button></div>`; }).join("") : `<p class="tpv-ticket__empty">No hay mesas abiertas.</p>`}</section></div><aside class="tpv-panel"><div class="tpv-panel__head"><div><h2>Operativa</h2><span>${status}</span></div></div><div class="tpv-insight">${operations}</div></aside></section>`;
  }
  function paymentModal() {
    if (state.modal !== "payment") return "";
    const ticket = state.data.tables[state.selectedTableId];
    const customers = Array.isArray(state.data.loyaltyCustomers) ? state.data.loyaltyCustomers : [];
    const cards = state.paymentMethods.filter((item) => item.method_type === "card");
    return `<div class="tpv-modal-backdrop"><section class="tpv-modal"><button class="tpv-modal__close" type="button" data-close-modal="true" aria-label="Cerrar">×</button><h2>Cobrar mesa ${state.selectedTableId}</h2><p>Total a registrar: <strong>${Core.formatEuros(total(ticket?.lines || []))}</strong></p>${customers.length ? `<label>Cliente fidelizado<select data-payment-customer><option value="">Sin cliente</option>${customers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)} · ${Number(customer.duros || 0)} Duros</option>`).join("")}</select></label><p class="tpv-modal__note">Cada euro completo suma un Duro.</p>` : ""}<div class="tpv-payment-options">${cards.map((card) => `<button type="button" data-pay="card" data-payment-method="${card.id}"><b>${escapeHtml(card.name)}</b><span>Confirmar en TPV bancario</span></button>`).join("") || `<button type="button" data-pay="card"><b>Tarjeta</b><span>Confirmar en TPV bancario</span></button>`}<button type="button" data-pay="cash"><b>Efectivo</b><span>Registrar cobro en caja</span></button></div><p class="tpv-modal__note">El pago con tarjeta se confirma después de cobrarlo en el terminal físico.</p></section></div>`;
  }
  function extrasModal() {
    if (state.modal !== "extras") return "";
    const item = product(state.extraProductId);
    const groups = [["Punto", ["Muy hecho", "Poco hecho", "Al punto"]], ["Sin", ["Sin tomate", "Sin sal", "Sin cebolla", "Sin picante"]], ["Extras", ["Con aceite", "Con ajoaceite", "Con beicon", "Con huevo", "Con ketchup", "Con mayonesa", "Con mostaza", "Con queso edam", "Con sal", "Con tomate"]], ["Guarnición", ["Ensalada", "Patatas fritas"]]];
    return `<div class="tpv-modal-backdrop"><form class="tpv-modal tpv-extras-modal" data-extras-form><button class="tpv-modal__close" type="button" data-close-modal aria-label="Cerrar">×</button><h2>${escapeHtml(item?.name || "Artículo")}</h2><p>Personaliza el pedido si hace falta.</p><input type="hidden" name="productId" value="${escapeHtml(state.extraProductId || "")}">${groups.map(([title, choices]) => `<fieldset><legend>${title}</legend>${choices.map((choice) => `<label><input type="checkbox" name="modifier" value="${escapeHtml(choice)}">${escapeHtml(choice)}</label>`).join("")}</fieldset>`).join("")}<div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-modal>Cancelar</button><button class="tpv-action" type="submit">Añadir a mesa</button></div></form></div>`;
  }
  function cashModal() {
    if (!state.modal?.startsWith("cash-")) return "";
    if (state.modal === "cash-open") return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-cash-open-form><button class="tpv-modal__close" type="button" data-close-modal aria-label="Cerrar">×</button><h2>Abrir caja</h2><p>Introduce el efectivo con el que empieza el turno.</p><label>Fondo inicial (€)<input name="openingFloat" type="number" min="0" step="0.01" required autofocus></label><label>Nota opcional<input name="notes" maxlength="500" placeholder="Ej. Cambio preparado"></label><div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-modal>Cancelar</button><button class="tpv-action" type="submit">Abrir turno</button></div></form></div>`;
    if (state.modal === "cash-movement") return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-cash-movement-form><button class="tpv-modal__close" type="button" data-close-modal aria-label="Cerrar">×</button><h2>Movimiento de caja</h2><p>Registra una entrada o salida manual de efectivo.</p><label>Tipo<select name="movementType"><option value="out">Salida de efectivo</option><option value="in">Entrada de efectivo</option></select></label><label>Importe (€)<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Motivo<input name="reason" maxlength="240" required placeholder="Ej. Pago a proveedor"></label><div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-modal>Cancelar</button><button class="tpv-action" type="submit">Registrar</button></div></form></div>`;
    if (state.modal === "cash-count") return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-cash-count-form><button class="tpv-modal__close" type="button" data-close-modal aria-label="Cerrar">×</button><h2>Arqueo de caja</h2><p>Efectivo esperado ahora: <strong>${Core.formatEuros(state.cashSession?.summary?.expectedCashCents || 0)}</strong>.</p><label>Efectivo contado (€)<input name="countedCash" type="number" min="0" step="0.01" required autofocus></label><label>Observaciones<input name="notes" maxlength="500" placeholder="Opcional"></label><div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-modal>Cancelar</button><button class="tpv-action" type="submit">Guardar arqueo</button></div></form></div>`;
    if (state.modal === "cash-card") return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-cash-card-form><button class="tpv-modal__close" type="button" data-close-modal aria-label="Cerrar">×</button><h2>Nueva tarjeta</h2><p>Añade el nombre que aparecerá al cobrar, por ejemplo “TPV Barra” o “Tarjeta terraza”.</p><label>Nombre<input name="name" maxlength="80" required autofocus></label><div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-modal>Cancelar</button><button class="tpv-action" type="submit">Añadir tarjeta</button></div></form></div>`;
    const expected = state.cashSession?.summary?.expectedCashCents || 0;
    return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-cash-close-form><button class="tpv-modal__close" type="button" data-close-modal aria-label="Cerrar">×</button><h2>Cerrar turno</h2><p>Efectivo esperado: <strong>${Core.formatEuros(expected)}</strong>. Cuenta el efectivo real antes de confirmar.</p><label>Efectivo contado (€)<input name="countedCash" type="number" min="0" step="0.01" required autofocus></label><label>Observaciones<input name="notes" maxlength="500" placeholder="Opcional"></label><div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-modal>Cancelar</button><button class="tpv-action is-danger" type="submit">Cerrar turno</button></div></form></div>`;
  }
  function loginModal() {
    if (state.modal !== "login") return "";
    const options = [["matias", "Matías", "Camarero"], ["lucia", "Lucía", "Camarera"], ["carlos", "Administrador", "Carlos"]];
    const waiter = ["matias", "lucia"].includes(state.loginUsername);
    return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-login-form><button class="tpv-modal__close" type="button" data-close-modal="true" aria-label="Cerrar">×</button><h2>¿Quién entra?</h2><p>${waiter ? "Selecciona tu nombre para entrar al TPV." : "El acceso de administración requiere PIN."}</p><div class="tpv-login-users">${options.map(([username, label, role]) => `<button class="tpv-login-user ${state.loginUsername === username ? "is-active" : ""}" type="button" data-login-user="${username}"><b>${label}</b><small>${role}</small></button>`).join("")}</div><label>Usuario<input name="username" value="${state.loginUsername}" readonly></label>${waiter ? "" : `<label>PIN<input name="pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{4,10}" minlength="4" maxlength="10" required autofocus></label>`}<div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-modal="true">Cancelar</button><button class="tpv-action" type="submit">Entrar</button></div></form></div>`;
  }
  function render() {
    const view = state.page === "comanda" ? renderOrder() : state.page === "cocina" ? renderKitchen() : state.page === "caja" ? renderCash() : renderFloor();
    root.innerHTML = `<div class="tpv-app">${sidebar()}<main class="tpv-main">${view}</main>${paymentModal()}${cashModal()}${extrasModal()}${loginModal()}${state.toast ? `<div class="tpv-toast ${state.toast.tone ? `is-${state.toast.tone}` : ""}">${escapeHtml(state.toast.message)}</div>` : ""}</div>`;
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button, [data-nav]");
    if (!button) return;
    if (button.dataset.loginUser) { state.loginUsername = button.dataset.loginUser; render(); return; }
    if (button.dataset.openLogin !== undefined) { state.modal = "login"; render(); return; }
    if (button.dataset.shiftAction) {
      const starting = button.dataset.shiftAction === "start";
      (starting ? Cloud.startShift() : Cloud.endShift())
        .then((shift) => { state.shift = starting ? shift : null; flash(starting ? "Jornada iniciada." : "Jornada finalizada.", "success"); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (button.dataset.logout !== undefined) { Cloud.logout(); flash("Sesión cerrada."); render(); return; }
    if (button.dataset.nav === "cocina") { window.location.href = "tpv-cocina.html"; return; }
    if (button.dataset.nav) { state.page = button.dataset.nav; state.selectedTableId = null; state.modal = null; render(); return; }
    if (button.dataset.openTable) { openTable(button.dataset.openTable); return; }
    if (button.dataset.category) { state.category = button.dataset.category; render(); return; }
    if (button.dataset.addProduct) { state.extraProductId = button.dataset.addProduct; state.modal = "extras"; render(); return; }
    if (button.dataset.changeLine) { changeLine(null, Number(button.dataset.amount), [], Number(button.dataset.changeLine)); return; }
    if (button.dataset.sendKitchen) { sendKitchen(); return; }
    if (button.dataset.kitchenOrder) { moveKitchenOrder(button.dataset.kitchenOrder, button.dataset.kitchenStatus); return; }
    if (button.dataset.openCash !== undefined) { state.modal = "cash-open"; render(); return; }
    if (button.dataset.cashMovement !== undefined) { state.modal = "cash-movement"; render(); return; }
    if (button.dataset.cashCount !== undefined) { state.modal = "cash-count"; render(); return; }
    if (button.dataset.addCard !== undefined) { state.modal = "cash-card"; render(); return; }
    if (button.dataset.closeCash !== undefined) { state.modal = "cash-close"; render(); return; }
    if (button.dataset.openPayment) { state.modal = "payment"; render(); return; }
    if (button.dataset.closeModal) { state.modal = null; render(); return; }
    if (button.dataset.pay) { pay(button.dataset.pay, root.querySelector("[data-payment-customer]")?.value, button.dataset.paymentMethod); return; }
    if (button.dataset.resetDemo) resetDemo();
  });
  root.addEventListener("submit", (event) => {
    if (event.target.matches("[data-extras-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      state.modal = null;
      changeLine(String(form.get("productId")), 1, form.getAll("modifier").map(String));
      return;
    }
    if (event.target.matches("[data-login-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.login(state.loginUsername, String(form.get("pin") || ""))
        .then(async () => {
          await Promise.all([refreshCloudState(), refreshCashSession(), refreshPaymentMethods(), refreshShift()]);
          state.modal = null;
          flash("Sesión iniciada. Las mesas están sincronizadas.", "success");
          render();
        })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-cash-open-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.openCashSession(Math.round(Number(form.get("openingFloat")) * 100), String(form.get("notes") || ""))
        .then((cashSession) => { state.cashSession = cashSession; state.modal = null; flash("Caja abierta correctamente.", "success"); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-cash-movement-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.addCashMovement(String(form.get("movementType")), Math.round(Number(form.get("amount")) * 100), String(form.get("reason") || ""))
        .then((cashSession) => { state.cashSession = cashSession; state.modal = null; flash("Movimiento registrado.", "success"); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-cash-count-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.addCashCount(Math.round(Number(form.get("countedCash")) * 100), String(form.get("notes") || ""))
        .then((cashSession) => { state.cashSession = cashSession; state.modal = null; flash("Arqueo guardado.", "success"); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-cash-card-form]")) {
      event.preventDefault();
      const name = String(new FormData(event.target).get("name") || "");
      Cloud.createPaymentMethod(name)
        .then(async () => { await refreshPaymentMethods(); state.modal = null; flash("Tarjeta añadida.", "success"); render(); })
        .catch((error) => { flash(error.message); render(); });
      return;
    }
    if (event.target.matches("[data-cash-close-form]")) {
      event.preventDefault();
      const form = new FormData(event.target);
      Cloud.closeCashSession(Math.round(Number(form.get("countedCash")) * 100), String(form.get("notes") || ""))
        .then((cashSession) => { state.cashSession = null; state.modal = null; flash(`Turno cerrado. Diferencia: ${Core.formatEuros(cashSession.difference_cents)}.`, "success"); render(); })
        .catch((error) => { flash(error.message); render(); });
    }
  });
  render();
  if (session()) {
    Promise.all([refreshCloudState(), refreshCashSession(), refreshPaymentMethods(), refreshShift()]).then(render).catch(() => {});
    window.setInterval(() => Promise.all([refreshCloudState(), refreshCashSession(), refreshPaymentMethods(), refreshShift()]).then(render).catch(() => {}), 15000);
  }
})();
