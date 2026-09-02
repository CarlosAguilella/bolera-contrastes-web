(function () {
  const STORAGE_KEY = "bc-tpv-mvp-v1";
  const MENU = [
    { id: "cafe", name: "Café con leche", category: "Cafés", priceCents: 180 },
    { id: "cana", name: "Caña", category: "Cervezas", priceCents: 250 },
    { id: "coca", name: "Coca-Cola", category: "Refrescos", priceCents: 250 },
    { id: "cubata", name: "Cubata", category: "Copas", priceCents: 500 },
    { id: "bravas", name: "Patatas bravas", category: "Para picar", priceCents: 650 },
    { id: "croquetas", name: "Croquetas", category: "Para picar", priceCents: 750 },
    { id: "hamburguesa", name: "Smash Contrastes", category: "Cocina", priceCents: 1250 },
    { id: "bocata", name: "Bocadillo calamares", category: "Cocina", priceCents: 750 },
    { id: "tarta", name: "Tarta de queso", category: "Postres", priceCents: 480 },
  ];
  const TABLES = Array.from({ length: 12 }, (_, index) => ({ id: String(index + 1), name: `Mesa ${index + 1}` }));
  const root = document.getElementById("tpv-root");
  let toastTimer = null;

  const state = {
    page: "mesas",
    selectedTableId: null,
    modal: null,
    toast: null,
    data: null,
  };

  function initialData() {
    const now = Date.now();
    return {
      tables: {
        "2": { openedAt: new Date(now - 36 * 60000).toISOString(), lines: [{ productId: "cafe", qty: 2 }, { productId: "bravas", qty: 1 }], sentAt: new Date(now - 22 * 60000).toISOString() },
        "6": { openedAt: new Date(now - 19 * 60000).toISOString(), lines: [{ productId: "cana", qty: 3 }, { productId: "croquetas", qty: 1 }], sentAt: new Date(now - 12 * 60000).toISOString() },
        "9": { openedAt: new Date(now - 8 * 60000).toISOString(), lines: [{ productId: "coca", qty: 2 }], sentAt: null },
      },
      kitchenOrders: [
        { id: "K-1002", tableId: "2", status: "preparing", createdAt: new Date(now - 22 * 60000).toISOString(), lines: [{ productId: "bravas", qty: 1 }] },
        { id: "K-1001", tableId: "6", status: "ready", createdAt: new Date(now - 12 * 60000).toISOString(), lines: [{ productId: "croquetas", qty: 1 }] },
      ],
      sales: [
        { id: "V-1001", tableId: "4", totalCents: 1250, method: "card", paidAt: new Date(now - 55 * 60000).toISOString() },
      ],
      sequence: 1003,
    };
  }

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "");
      if (saved && saved.tables && saved.kitchenOrders && saved.sales) return saved;
    } catch (error) {}
    return initialData();
  }

  function saveData() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data)); } catch (error) {}
  }

  function formatEuros(cents) {
    return `${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")} €`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getProduct(productId) {
    return MENU.find((item) => item.id === productId);
  }

  function getLinesTotal(lines) {
    return (lines || []).reduce((total, line) => total + ((getProduct(line.productId)?.priceCents || 0) * Number(line.qty || 0)), 0);
  }

  function getLineCount(lines) {
    return (lines || []).reduce((total, line) => total + Number(line.qty || 0), 0);
  }

  function tableStatus(tableId) {
    const table = state.data.tables[tableId];
    if (!table) return "free";
    const linkedOrders = state.data.kitchenOrders.filter((order) => order.tableId === tableId && order.status !== "delivered");
    return linkedOrders.some((order) => order.status === "ready") ? "ready" : "open";
  }

  function statusLabel(status) {
    return ({ free: "Libre", open: "Abierta", ready: "Lista", pending: "Pendiente", preparing: "Preparando", paid: "Cobrada" })[status] || status;
  }

  function statusClass(status) {
    return `is-${status}`;
  }

  function relativeTime(value) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    if (!Number.isFinite(minutes) || minutes < 1) return "ahora";
    return `${minutes} min`;
  }

  function flash(message, tone) {
    state.toast = { message, tone: tone || "" };
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      state.toast = null;
      render();
    }, 2600);
  }

  function openTable(tableId) {
    if (!state.data.tables[tableId]) {
      state.data.tables[tableId] = { openedAt: new Date().toISOString(), lines: [], sentAt: null };
      saveData();
    }
    state.selectedTableId = tableId;
    state.page = "comanda";
    render();
  }

  function updateLine(productId, change) {
    const table = state.data.tables[state.selectedTableId];
    if (!table) return;
    const line = table.lines.find((item) => item.productId === productId);
    const nextQty = Math.max(0, Number(line?.qty || 0) + change);
    if (!line && nextQty > 0) table.lines.push({ productId, qty: nextQty });
    if (line && nextQty > 0) line.qty = nextQty;
    if (line && nextQty === 0) table.lines = table.lines.filter((item) => item.productId !== productId);
    saveData();
    render();
  }

  function getKitchenLines(table) {
    const existing = state.data.kitchenOrders
      .filter((order) => order.tableId === state.selectedTableId && order.status !== "delivered")
      .flatMap((order) => order.lines);
    const alreadySent = new Map();
    existing.forEach((line) => alreadySent.set(line.productId, (alreadySent.get(line.productId) || 0) + line.qty));
    return table.lines
      .map((line) => ({ ...line, qty: Math.max(0, line.qty - (alreadySent.get(line.productId) || 0)) }))
      .filter((line) => line.qty > 0 && ["Para picar", "Cocina", "Postres"].includes(getProduct(line.productId)?.category));
  }

  function sendToKitchen() {
    const table = state.data.tables[state.selectedTableId];
    if (!table) return;
    const lines = getKitchenLines(table);
    if (!lines.length) {
      flash("No hay productos de cocina nuevos para enviar.");
      render();
      return;
    }
    const id = `K-${state.data.sequence++}`;
    state.data.kitchenOrders.unshift({ id, tableId: state.selectedTableId, status: "pending", createdAt: new Date().toISOString(), lines });
    table.sentAt = new Date().toISOString();
    saveData();
    flash(`Comanda de Mesa ${state.selectedTableId} enviada a cocina.`, "success");
    render();
  }

  function moveKitchenOrder(orderId, nextStatus) {
    const order = state.data.kitchenOrders.find((item) => item.id === orderId);
    if (!order) return;
    order.status = nextStatus;
    if (nextStatus === "ready") flash(`Mesa ${order.tableId} está lista para servir.`, "success");
    saveData();
    render();
  }

  function closeAndPay(method) {
    const table = state.data.tables[state.selectedTableId];
    if (!table || !table.lines.length) {
      flash("La mesa no tiene productos para cobrar.");
      render();
      return;
    }
    const totalCents = getLinesTotal(table.lines);
    state.data.sales.unshift({ id: `V-${state.data.sequence++}`, tableId: state.selectedTableId, totalCents, method, paidAt: new Date().toISOString() });
    state.data.kitchenOrders.forEach((order) => {
      if (order.tableId === state.selectedTableId && order.status === "ready") order.status = "delivered";
    });
    delete state.data.tables[state.selectedTableId];
    state.selectedTableId = null;
    state.modal = null;
    state.page = "mesas";
    saveData();
    flash(`Mesa cobrada en ${method === "card" ? "tarjeta" : "efectivo"} y cerrada.`, "success");
    render();
  }

  function resetDemo() {
    state.data = initialData();
    state.selectedTableId = null;
    state.modal = null;
    state.page = "mesas";
    saveData();
    flash("Demo del TPV restaurada.", "success");
    render();
  }

  function renderSidebar() {
    const nav = [
      ["mesas", "▦", "Mesas"],
      ["cocina", "♨", "Cocina"],
      ["caja", "€", "Caja"],
      ["admin", "◫", "Administración"],
    ];
    return `
      <aside class="tpv-sidebar">
        <div class="tpv-brand">
          <span class="tpv-brand__mark">C</span>
          <span class="tpv-brand__type"><strong>Contrastes</strong><small>TPV interno</small></span>
        </div>
        <nav class="tpv-nav" aria-label="Navegación TPV">
          ${nav.map(([page, icon, label]) => `<button type="button" class="${state.page === page || (page === "mesas" && state.page === "comanda") ? "is-active" : ""}" data-nav="${page}"><span class="tpv-nav__icon">${icon}</span>${label}</button>`).join("")}
        </nav>
        <div class="tpv-sidebar__bottom">
          <div class="tpv-user"><span class="tpv-user__avatar">RC</span><span>Rafa · turno activo</span></div>
          <button type="button" class="tpv-reset" data-reset-demo="true">Restaurar datos demo</button>
        </div>
      </aside>
    `;
  }

  function renderTopbar(title, subtitle) {
    return `<header class="tpv-topbar"><div><h1>${title}</h1><p>${subtitle}</p></div><span class="tpv-live">Sistema local activo</span></header>`;
  }

  function renderTables() {
    const occupied = Object.keys(state.data.tables).length;
    return `
      ${renderTopbar("Mesas", `${occupied} abiertas · toca una mesa para abrir la comanda`)}
      <section class="tpv-dashboard">
        <section class="tpv-panel">
          <div class="tpv-panel__head"><div><h2>Sala</h2><span>Estado en tiempo real del local</span></div><button type="button" class="tpv-action is-secondary" data-new-bar-order="true">Venta rápida</button></div>
          <div class="tpv-table-grid">
            ${TABLES.map((table) => {
              const ticket = state.data.tables[table.id];
              const status = tableStatus(table.id);
              return `<button type="button" class="tpv-table ${status !== "free" ? `is-${status}` : ""}" data-open-table="${table.id}"><span class="tpv-table__number">${table.name}</span><span class="tpv-status ${statusClass(status)}">${statusLabel(status)}</span><span class="tpv-table__meta">${ticket ? `${getLineCount(ticket.lines)} productos · ${formatEuros(getLinesTotal(ticket.lines))}` : "Disponible"}</span></button>`;
            }).join("")}
          </div>
        </section>
        <aside class="tpv-panel"><div class="tpv-panel__head"><div><h2>Ahora</h2><span>Resumen del turno</span></div></div><div class="tpv-quick">${renderQuick()}</div></aside>
      </section>
    `;
  }

  function renderQuick() {
    const pending = state.data.kitchenOrders.filter((order) => order.status === "pending").length;
    const preparing = state.data.kitchenOrders.filter((order) => order.status === "preparing").length;
    const ready = state.data.kitchenOrders.filter((order) => order.status === "ready").length;
    const todaySales = state.data.sales.reduce((total, sale) => total + sale.totalCents, 0);
    return `
      <div class="tpv-quick__card"><small>Ventas registradas</small><strong>${formatEuros(todaySales)}</strong><button type="button" data-nav="caja">Abrir caja</button></div>
      <div class="tpv-quick__list">
        <div class="tpv-quick__item"><div><strong>Por preparar</strong><small>Comandas recién enviadas</small></div><span class="tpv-quick__count">${pending}</span></div>
        <div class="tpv-quick__item"><div><strong>En cocina</strong><small>En elaboración</small></div><span class="tpv-quick__count">${preparing}</span></div>
        <div class="tpv-quick__item"><div><strong>Listas para servir</strong><small>Avisar al camarero</small></div><span class="tpv-quick__count">${ready}</span></div>
      </div>
    `;
  }

  function renderOrder() {
    const table = state.data.tables[state.selectedTableId];
    if (!table) {
      state.page = "mesas";
      return renderTables();
    }
    return `
      ${renderTopbar(`Mesa ${state.selectedTableId}`, "Añade productos, envía a cocina y cobra cuando termine la mesa")}
      <section class="tpv-order">
        <section class="tpv-panel"><div class="tpv-panel__head"><div><h2>Productos</h2><span>Catálogo inicial MVP</span></div><button type="button" class="tpv-action is-secondary" data-nav="mesas">Volver a mesas</button></div><div class="tpv-catalog">${MENU.map((product) => `<article class="tpv-product"><div><strong>${escapeHtml(product.name)}</strong><span>${product.category}</span></div><div class="tpv-product__bottom"><span class="tpv-product__price">${formatEuros(product.priceCents)}</span><button type="button" class="tpv-add" data-add-product="${product.id}">Añadir +</button></div></article>`).join("")}</div></section>
        ${renderTicket(table)}
      </section>
    `;
  }

  function renderTicket(table) {
    const kitchenLines = getKitchenLines(table);
    const total = getLinesTotal(table.lines);
    return `
      <aside class="tpv-ticket"><div class="tpv-ticket__head"><strong>Mesa ${state.selectedTableId}</strong><small>${table.openedAt ? `Abierta hace ${relativeTime(table.openedAt)}` : "Nueva comanda"}</small></div>
        ${table.lines.length ? `<ul class="tpv-ticket__items">${table.lines.map((line) => { const product = getProduct(line.productId); return `<li><div><strong>${escapeHtml(product?.name || "Producto")}</strong><small>${formatEuros(product?.priceCents || 0)} · ${formatEuros((product?.priceCents || 0) * line.qty)}</small></div><div class="tpv-qty"><button type="button" data-change-product="${line.productId}" data-change="-1">−</button><span>${line.qty}</span><button type="button" data-change-product="${line.productId}" data-change="1">+</button></div></li>`; }).join("")}</ul>` : `<div class="tpv-ticket__empty">Añade productos a la comanda.</div>`}
        <div class="tpv-ticket__total"><span>Total</span><strong>${formatEuros(total)}</strong></div>
        <div class="tpv-ticket__actions"><button type="button" class="tpv-action is-secondary" data-send-kitchen="true" ${kitchenLines.length ? "" : "disabled"}>Enviar ${kitchenLines.length} producto${kitchenLines.length === 1 ? "" : "s"} a cocina</button><button type="button" class="tpv-action" data-open-payment="true" ${table.lines.length ? "" : "disabled"}>Cobrar mesa</button></div>
      </aside>
    `;
  }

  function renderKitchenCard(order) {
    const next = order.status === "pending" ? ["preparing", "Empezar"] : order.status === "preparing" ? ["ready", "Marcar lista"] : ["delivered", "Entregada"];
    return `<article class="tpv-kitchen-card"><div class="tpv-kitchen-card__head"><strong>Mesa ${order.tableId}</strong><span>${relativeTime(order.createdAt)}</span></div><ul>${order.lines.map((line) => `<li>${line.qty} × ${escapeHtml(getProduct(line.productId)?.name || "Producto")}</li>`).join("")}</ul><div class="tpv-kitchen-card__actions"><button type="button" data-kitchen-status="${next[0]}" data-order-id="${order.id}">${next[1]}</button></div></article>`;
  }

  function renderKitchen() {
    const columns = [["pending", "Pendiente"], ["preparing", "Preparando"], ["ready", "Listo"]];
    return `${renderTopbar("Cocina", "Las comandas se actualizan al enviar una mesa desde camarero")}
      <section class="tpv-kitchen">${columns.map(([status, label]) => { const orders = state.data.kitchenOrders.filter((order) => order.status === status); return `<section class="tpv-kitchen-column"><header class="tpv-kitchen-column__head"><h2>${label}</h2><span>${orders.length}</span></header><div class="tpv-kitchen-list">${orders.length ? orders.map(renderKitchenCard).join("") : `<div class="tpv-kitchen-empty">No hay comandas aquí.</div>`}</div></section>`; }).join("")}</section>`;
  }

  function renderCash() {
    const openTables = Object.entries(state.data.tables).map(([tableId, table]) => ({ tableId, table })).filter(({ table }) => table.lines.length);
    const totalSales = state.data.sales.reduce((total, sale) => total + sale.totalCents, 0);
    const cardSales = state.data.sales.filter((sale) => sale.method === "card").reduce((total, sale) => total + sale.totalCents, 0);
    const cashSales = totalSales - cardSales;
    return `${renderTopbar("Caja", "Cobros del turno y mesas pendientes de cierre")}
      <section class="tpv-cash"><div><div class="tpv-cash__summary"><div class="tpv-metric"><span>Ventas turno</span><strong>${formatEuros(totalSales)}</strong></div><div class="tpv-metric"><span>Tarjeta</span><strong>${formatEuros(cardSales)}</strong></div><div class="tpv-metric"><span>Efectivo</span><strong>${formatEuros(cashSales)}</strong></div></div><section class="tpv-panel tpv-open-bills"><div class="tpv-panel__head"><div><h2>Mesas abiertas</h2><span>${openTables.length} pendientes de cobro</span></div></div>${openTables.length ? openTables.map(({ tableId, table }) => `<div class="tpv-bill"><div><strong>Mesa ${tableId}</strong><small>${getLineCount(table.lines)} productos · abierta hace ${relativeTime(table.openedAt)}</small></div><strong class="tpv-bill__amount">${formatEuros(getLinesTotal(table.lines))}</strong><button type="button" class="tpv-action" data-open-table="${tableId}">Abrir y cobrar</button></div>`).join("") : `<div class="tpv-ticket__empty">No hay mesas pendientes de cobro.</div>`}</section></div><aside class="tpv-panel"><div class="tpv-panel__head"><div><h2>Próximo paso</h2><span>MVP de caja</span></div></div><div class="tpv-insight"><div class="tpv-insight__row"><span>Ahora</span><strong>Cobro manual</strong></div><div class="tpv-insight__row"><span>Siguiente fase</span><strong>TPV bancario + ticket</strong></div><div class="tpv-insight__row"><span>Después</span><strong>Cierres y arqueo</strong></div></div></aside></section>`;
  }

  function renderAdmin() {
    const revenue = state.data.sales.reduce((total, sale) => total + sale.totalCents, 0);
    return `${renderTopbar("Administración", "Productos, precios y primeras métricas del negocio")}
      <section class="tpv-admin"><section class="tpv-panel"><div class="tpv-panel__head"><div><h2>Productos y precios</h2><span>Catálogo inicial del TPV</span></div><button type="button" class="tpv-action is-secondary" data-admin-message="true">Añadir producto</button></div><div class="tpv-admin-list">${MENU.map((product) => `<div class="tpv-admin-product"><div><strong>${escapeHtml(product.name)}</strong><span>${product.category}</span></div><strong class="tpv-admin-product__amount">${formatEuros(product.priceCents)}</strong><button type="button" data-admin-message="true">Editar</button></div>`).join("")}</div></section><aside class="tpv-panel"><div class="tpv-panel__head"><div><h2>Datos del MVP</h2><span>Guardados en este dispositivo</span></div></div><div class="tpv-insight"><div class="tpv-insight__row"><span>Ventas registradas</span><strong>${formatEuros(revenue)}</strong></div><div class="tpv-insight__row"><span>Comandas de cocina</span><strong>${state.data.kitchenOrders.length}</strong></div><div class="tpv-insight__row"><span>Próxima conexión</span><strong>Base de datos central</strong></div></div></aside></section>`;
  }

  function renderModal() {
    if (state.modal !== "payment") return "";
    const table = state.data.tables[state.selectedTableId];
    if (!table) return "";
    const total = getLinesTotal(table.lines);
    return `<div class="tpv-modal-backdrop"><section class="tpv-modal" role="dialog" aria-modal="true" aria-label="Cobrar mesa"><h2>Cobrar Mesa ${state.selectedTableId}</h2><p>Total a cobrar: <strong>${formatEuros(total)}</strong>. En este MVP se registra el método de pago; la conexión bancaria llegará en la siguiente fase.</p><div class="tpv-modal__actions"><button type="button" class="tpv-action is-secondary" data-close-modal="true">Cancelar</button><button type="button" class="tpv-action is-positive" data-pay-method="cash">Efectivo</button><button type="button" class="tpv-action" data-pay-method="card">Tarjeta</button></div></section></div>`;
  }

  function render() {
    let content = "";
    if (state.page === "mesas") content = renderTables();
    if (state.page === "comanda") content = renderOrder();
    if (state.page === "cocina") content = renderKitchen();
    if (state.page === "caja") content = renderCash();
    if (state.page === "admin") content = renderAdmin();
    root.innerHTML = `<div class="tpv-app">${renderSidebar()}<main class="tpv-main">${content}</main></div>${state.toast ? `<div class="tpv-toast ${state.toast.tone === "success" ? "is-success" : ""}">${escapeHtml(state.toast.message)}</div>` : ""}${renderModal()}`;
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.dataset.nav) { state.page = button.dataset.nav; state.selectedTableId = null; state.modal = null; render(); }
    if (button.dataset.openTable) openTable(button.dataset.openTable);
    if (button.dataset.newBarOrder) openTable("B");
    if (button.dataset.addProduct) updateLine(button.dataset.addProduct, 1);
    if (button.dataset.changeProduct) updateLine(button.dataset.changeProduct, Number(button.dataset.change));
    if (button.dataset.sendKitchen) sendToKitchen();
    if (button.dataset.kitchenStatus) moveKitchenOrder(button.dataset.orderId, button.dataset.kitchenStatus);
    if (button.dataset.openPayment) { state.modal = "payment"; render(); }
    if (button.dataset.closeModal) { state.modal = null; render(); }
    if (button.dataset.payMethod) closeAndPay(button.dataset.payMethod);
    if (button.dataset.resetDemo) resetDemo();
    if (button.dataset.adminMessage) { flash("La edición de productos se conectará a Administración en la fase 2."); render(); }
  });

  state.data = loadData();
  render();
})();
