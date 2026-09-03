(function () {
  const Core = window.BC_TPV;
  const root = document.getElementById("tpv-root");
  if (!Core || !root) return;

  const state = { page: "sala", selectedTableId: null, category: "all", modal: null, toast: null, data: Core.loadData() };
  let toastTimer = null;

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function product(productId) { return Core.getProduct(productId, state.data); }
  function lineCount(lines) { return (lines || []).reduce((total, line) => total + Number(line.qty || 0), 0); }
  function total(lines) { return (lines || []).reduce((sum, line) => sum + (product(line.productId)?.priceCents || 0) * Number(line.qty || 0), 0); }
  function save() { Core.saveData(state.data); }
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
    const orders = state.data.kitchenOrders.filter((order) => order.tableId === tableId && !["delivered", "cancelled"].includes(order.status));
    if (orders.some((order) => order.status === "ready")) return "ready";
    if (orders.some((order) => order.status === "preparing")) return "preparing";
    return "open";
  }
  function statusText(status) { return ({ free: "Libre", open: "Abierta", preparing: "En cocina", ready: "Lista", pending: "Pendiente" })[status] || status; }
  function openTable(tableId) {
    if (!state.data.tables[tableId]) state.data.tables[tableId] = { openedAt: new Date().toISOString(), lines: [], sentAt: null };
    state.selectedTableId = tableId;
    state.category = "all";
    state.page = "comanda";
    save();
    render();
  }
  function changeLine(productId, amount) {
    const ticket = state.data.tables[state.selectedTableId];
    if (!ticket) return;
    const line = ticket.lines.find((item) => item.productId === productId);
    const quantity = Math.max(0, Number(line?.qty || 0) + amount);
    if (!line && quantity) ticket.lines.push({ productId, qty: quantity });
    if (line && quantity) line.qty = quantity;
    if (line && !quantity) ticket.lines = ticket.lines.filter((item) => item.productId !== productId);
    save();
    render();
  }
  function pendingKitchenLines(ticket) {
    const sent = new Map();
    state.data.kitchenOrders.filter((order) => order.tableId === state.selectedTableId && !["delivered", "cancelled"].includes(order.status)).flatMap((order) => order.lines).forEach((line) => sent.set(line.productId, (sent.get(line.productId) || 0) + line.qty));
    return ticket.lines.map((line) => ({ ...line, qty: Math.max(0, line.qty - (sent.get(line.productId) || 0)) })).filter((line) => line.qty > 0 && Core.isKitchenProduct(product(line.productId)));
  }
  function sendKitchen() {
    const ticket = state.data.tables[state.selectedTableId];
    const lines = ticket ? pendingKitchenLines(ticket) : [];
    if (!lines.length) { flash("No hay productos de cocina nuevos para enviar."); render(); return; }
    state.data.kitchenOrders.unshift({ id: `K-${state.data.sequence++}`, tableId: state.selectedTableId, status: "pending", createdAt: new Date().toISOString(), lines });
    ticket.sentAt = new Date().toISOString();
    save();
    flash(`Comanda de la mesa ${state.selectedTableId} enviada a cocina.`, "success");
    render();
  }
  function moveKitchenOrder(orderId, status) {
    const order = state.data.kitchenOrders.find((item) => item.id === orderId);
    if (!order) return;
    order.status = status;
    save();
    flash(status === "ready" ? `Mesa ${order.tableId} lista para servir.` : "Estado de cocina actualizado.", "success");
    render();
  }
  function pay(method) {
    const ticket = state.data.tables[state.selectedTableId];
    if (!ticket?.lines.length) { flash("Añade algún producto antes de cobrar."); render(); return; }
    const totalCents = total(ticket.lines);
    state.data.sales.unshift({ id: `V-${state.data.sequence++}`, tableId: state.selectedTableId, totalCents, method, paidAt: new Date().toISOString(), lines: ticket.lines.map((line) => ({ ...line })) });
    state.data.kitchenOrders.forEach((order) => { if (order.tableId === state.selectedTableId && order.status === "ready") order.status = "delivered"; });
    delete state.data.tables[state.selectedTableId];
    state.selectedTableId = null;
    state.modal = null;
    state.page = "sala";
    save();
    flash(`Mesa cobrada en ${method === "card" ? "tarjeta" : "efectivo"} y cerrada.`, "success");
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
    return `<aside class="tpv-sidebar"><a class="tpv-brand" href="index.html" aria-label="Volver a Bolera Contrastes"><span class="tpv-brand__mark">C</span><span class="tpv-brand__type"><strong>Contrastes</strong><small>TPV camarero</small></span></a><nav class="tpv-nav" aria-label="Navegación TPV">${nav.map(([page, icon, label]) => `<button type="button" class="${state.page === page || (page === "sala" && state.page === "comanda") ? "is-active" : ""}" data-nav="${page}"><span class="tpv-nav__icon">${icon}</span>${label}</button>`).join("")}</nav><div class="tpv-sidebar__bottom"><div class="tpv-user"><span class="tpv-user__avatar">RC</span><span>Turno activo</span></div><button type="button" class="tpv-reset" data-reset-demo="true">Restaurar demo</button></div></aside>`;
  }
  function topbar(title, subtitle) { return `<header class="tpv-topbar"><div><h1>${title}</h1><p>${subtitle}</p></div><span class="tpv-live">Sistema local activo</span></header>`; }
  function renderFloor() {
    const opened = Object.keys(state.data.tables).length;
    const layout = Core.getTables(state.data);
    return `${topbar("Sala", `${opened} mesas abiertas · toca una mesa para tomar nota`)}<section class="tpv-floor-panel"><div class="tpv-panel__head"><div><h2>Plano del local</h2><span>Verde: lista · Ámbar: comanda abierta</span></div><span class="tpv-floor-count">${layout.length} mesas configuradas</span></div><div class="tpv-floor" aria-label="Plano de mesas"><div class="tpv-floor__bar"><span>Barra</span><i></i><i></i><i></i><i></i></div><div class="tpv-floor__plants" aria-hidden="true">●<br>●<br>●<br>●</div>${layout.map((table) => { const ticket = state.data.tables[table.id]; const status = tableStatus(table.id); return `<button type="button" class="tpv-floor-table is-${status} ${table.area === "wall" ? "is-wall" : ""}" style="--x:${table.x};--y:${table.y}" data-open-table="${table.id}" aria-label="${table.name}, ${statusText(status)}"><span class="tpv-floor-table__desk"></span><strong>${table.id}</strong><small>${ticket ? Core.formatEuros(total(ticket.lines)) : statusText(status)}</small></button>`; }).join("")}</div><div class="tpv-floor-legend"><span><i class="is-free"></i>Libre</span><span><i class="is-open"></i>Abierta</span><span><i class="is-preparing"></i>En cocina</span><span><i class="is-ready"></i>Lista para servir</span></div></section>`;
  }
  function ticketView(ticket) {
    const lines = ticket.lines || [];
    return `<aside class="tpv-ticket"><div class="tpv-ticket__head"><strong>Mesa ${state.selectedTableId}</strong><small>${lineCount(lines)} productos · abierta ${timeSince(ticket.openedAt)}</small></div>${lines.length ? `<ul class="tpv-ticket__items">${lines.map((line) => { const item = product(line.productId); return `<li><div><strong>${escapeHtml(item?.name || "Producto")}</strong><small>${Core.formatEuros(item?.priceCents || 0)} unidad</small></div><div><b>${Core.formatEuros((item?.priceCents || 0) * line.qty)}</b><div class="tpv-qty"><button type="button" data-change-line="${line.productId}" data-amount="-1">−</button><span>${line.qty}</span><button type="button" data-change-line="${line.productId}" data-amount="1">+</button></div></div></li>`; }).join("")}</ul>` : `<div class="tpv-ticket__empty">Aún no hay productos. Selecciónalos de la carta.</div>`}<div class="tpv-ticket__total"><span>Total</span><strong>${Core.formatEuros(total(lines))}</strong></div><div class="tpv-ticket__actions"><button type="button" class="tpv-action is-secondary" data-send-kitchen="true">Enviar cocina</button><button type="button" class="tpv-action" data-open-payment="true" ${lines.length ? "" : "disabled"}>Cobrar mesa</button></div></aside>`;
  }
  function renderOrder() {
    const ticket = state.data.tables[state.selectedTableId];
    if (!ticket) { state.page = "sala"; return renderFloor(); }
    const categories = [{ id: "all", label: "Todo" }, ...Array.from(new Map(Core.products.map((item) => [item.categoryId, { id: item.categoryId, label: item.category }])).values())];
    const visible = Core.products.filter((item) => state.category === "all" || item.categoryId === state.category);
    return `${topbar(`Mesa ${state.selectedTableId}`, "Añade productos y envía la comanda cuando esté lista")}<div class="tpv-order"><section class="tpv-panel"><div class="tpv-panel__head"><div><h2>Carta completa</h2><span>${visible.length} productos disponibles</span></div><button class="tpv-action is-secondary" type="button" data-nav="sala">Volver a sala</button></div><div class="tpv-category-filter">${categories.map((category) => `<button type="button" class="${state.category === category.id ? "is-active" : ""}" data-category="${category.id}">${escapeHtml(category.label)}</button>`).join("")}</div><div class="tpv-catalog">${visible.map((item) => `<article class="tpv-product">${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : ""}<div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span></div><div class="tpv-product__bottom"><span class="tpv-product__price">${Core.formatEuros(item.priceCents)}</span><button type="button" class="tpv-add" data-add-product="${item.id}">Añadir</button></div></article>`).join("")}</div></section>${ticketView(ticket)}</div>`;
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
    const card = sales.filter((sale) => sale.method === "card").reduce((sum, sale) => sum + sale.totalCents, 0);
    const cash = sales.filter((sale) => sale.method === "cash").reduce((sum, sale) => sum + sale.totalCents, 0);
    return `${topbar("Caja", "Resumen del turno actual")}<section class="tpv-cash"><div><div class="tpv-cash__summary"><article class="tpv-metric"><span>Ventas registradas</span><strong>${Core.formatEuros(card + cash)}</strong></article><article class="tpv-metric"><span>Tarjeta</span><strong>${Core.formatEuros(card)}</strong></article><article class="tpv-metric"><span>Efectivo</span><strong>${Core.formatEuros(cash)}</strong></article></div><section class="tpv-panel tpv-open-bills"><div class="tpv-panel__head"><div><h2>Mesas pendientes de cobro</h2><span>Selecciona una para abrir la cuenta</span></div></div>${Object.keys(state.data.tables).length ? Object.keys(state.data.tables).map((tableId) => { const ticket = state.data.tables[tableId]; return `<div class="tpv-bill"><div><strong>Mesa ${tableId}</strong><small>${lineCount(ticket.lines)} productos · ${timeSince(ticket.openedAt)}</small></div><span class="tpv-bill__amount">${Core.formatEuros(total(ticket.lines))}</span><button type="button" class="tpv-action is-secondary" data-open-table="${tableId}">Abrir</button></div>`; }).join("") : `<p class="tpv-ticket__empty">No hay mesas abiertas.</p>`}</section></div><aside class="tpv-panel"><div class="tpv-panel__head"><div><h2>Operativa</h2><span>Resumen de la caja</span></div></div><div class="tpv-insight"><p>Las ventas registradas aparecen en el panel de gestión reservado a administración.</p></div></aside></section>`;
  }
  function paymentModal() {
    if (state.modal !== "payment") return "";
    const ticket = state.data.tables[state.selectedTableId];
    return `<div class="tpv-modal-backdrop"><section class="tpv-modal"><button class="tpv-modal__close" type="button" data-close-modal="true" aria-label="Cerrar">×</button><h2>Cobrar mesa ${state.selectedTableId}</h2><p>Total a registrar: <strong>${Core.formatEuros(total(ticket?.lines || []))}</strong></p><div class="tpv-payment-options"><button type="button" data-pay="card"><b>Tarjeta</b><span>Confirmar en TPV bancario</span></button><button type="button" data-pay="cash"><b>Efectivo</b><span>Registrar cobro en caja</span></button></div><p class="tpv-modal__note">El pago con tarjeta se confirma después de cobrarlo en el terminal físico.</p></section></div>`;
  }
  function render() {
    const view = state.page === "comanda" ? renderOrder() : state.page === "cocina" ? renderKitchen() : state.page === "caja" ? renderCash() : renderFloor();
    root.innerHTML = `<div class="tpv-app">${sidebar()}<main class="tpv-main">${view}</main>${paymentModal()}${state.toast ? `<div class="tpv-toast ${state.toast.tone ? `is-${state.toast.tone}` : ""}">${escapeHtml(state.toast.message)}</div>` : ""}</div>`;
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button, [data-nav]");
    if (!button) return;
    if (button.dataset.nav) { state.page = button.dataset.nav; state.selectedTableId = null; state.modal = null; render(); return; }
    if (button.dataset.openTable) { openTable(button.dataset.openTable); return; }
    if (button.dataset.category) { state.category = button.dataset.category; render(); return; }
    if (button.dataset.addProduct) { changeLine(button.dataset.addProduct, 1); return; }
    if (button.dataset.changeLine) { changeLine(button.dataset.changeLine, Number(button.dataset.amount)); return; }
    if (button.dataset.sendKitchen) { sendKitchen(); return; }
    if (button.dataset.kitchenOrder) { moveKitchenOrder(button.dataset.kitchenOrder, button.dataset.kitchenStatus); return; }
    if (button.dataset.openPayment) { state.modal = "payment"; render(); return; }
    if (button.dataset.closeModal) { state.modal = null; render(); return; }
    if (button.dataset.pay) { pay(button.dataset.pay); return; }
    if (button.dataset.resetDemo) resetDemo();
  });
  render();
})();
