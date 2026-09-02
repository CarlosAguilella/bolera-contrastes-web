(function () {
  const Core = window.BC_TPV;
  const root = document.getElementById("tpv-gestion-root");
  if (!Core || !root) return;

  const state = { tab: "ventas", search: "", editingId: null, data: Core.loadData(), toast: null };
  let toastTimer = null;

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function product(productId) { return Core.getProduct(productId, state.data); }
  function save() { Core.saveData(state.data); }
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
  function nav() {
    return `<aside class="tpv-management-sidebar"><a class="tpv-brand" href="tpv.html"><span class="tpv-brand__mark">C</span><span class="tpv-brand__type"><strong>Contrastes</strong><small>Gestión TPV</small></span></a><nav><a href="tpv.html">← Volver al TPV</a><button type="button" class="${state.tab === "ventas" ? "is-active" : ""}" data-tab="ventas">Ventas</button><button type="button" class="${state.tab === "articulos" ? "is-active" : ""}" data-tab="articulos">Artículos y precios</button><button type="button" class="is-disabled" disabled>Clientes <small>Próximamente</small></button><button type="button" class="is-disabled" disabled>Proveedores <small>Próximamente</small></button></nav><p>Panel interno<br>Datos guardados en este dispositivo.</p></aside>`;
  }
  function topbar() {
    return `<header class="tpv-gestion-topbar"><div><span>Administración</span><h1>${state.tab === "ventas" ? "Ventas" : "Artículos y precios"}</h1></div><div class="tpv-gestion-topbar__actions"><span class="tpv-live">Datos locales</span><a class="tpv-action is-secondary" href="tpv.html">TPV camarero</a></div></header>`;
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
  function renderArticles() {
    const query = state.search.trim().toLocaleLowerCase("es");
    const products = Core.products.filter((item) => `${item.name} ${item.category}`.toLocaleLowerCase("es").includes(query));
    return `<section class="tpv-gestion-content"><section class="tpv-gestion-card"><header><div><h2>Catálogo del restaurante</h2><span>${products.length} artículos · PVP usado por el TPV</span></div><label class="tpv-search"><span>⌕</span><input type="search" value="${escapeHtml(state.search)}" placeholder="Buscar artículo" data-search-products></label></header><div class="tpv-articles-table"><div class="tpv-articles-row is-heading"><span>Artículo</span><span>Familia</span><span>PVP</span><span>Coste compra</span><span>Margen</span><span></span></div>${products.map((item) => { const pvp = product(item.id).priceCents; const cost = state.data.costs?.[item.id]; const margin = Number.isFinite(Number(cost)) ? pvp - Number(cost) : null; return `<div class="tpv-articles-row"><div><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.description)}</small></div><span>${escapeHtml(item.category)}</span><strong>${Core.formatEuros(pvp)}</strong><span>${margin === null ? `<em>Pendiente</em>` : Core.formatEuros(cost)}</span><span>${margin === null ? "—" : Core.formatEuros(margin)}</span><button class="tpv-edit-button" type="button" data-edit-product="${item.id}">Editar</button></div>`; }).join("") || `<p class="tpv-gestion-empty">No se han encontrado artículos.</p>`}</div></section><aside class="tpv-management-note"><h2>Sobre los costes</h2><p>Los costes de compra se muestran como pendientes hasta que se registren. El margen es orientativo y no incluye impuestos ni otros costes.</p><p>Los precios guardados aquí se aplican en el TPV de camarero de este mismo navegador.</p></aside></section>`;
  }
  function editModal() {
    if (!state.editingId) return "";
    const item = product(state.editingId);
    const cost = state.data.costs?.[state.editingId];
    return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-price-form><button class="tpv-modal__close" type="button" data-close-edit aria-label="Cerrar">×</button><h2>${escapeHtml(item.name)}</h2><p>Actualiza el precio de venta y el coste de compra.</p><label>Precio de venta (€)<input name="price" type="number" min="0" step="0.01" value="${(item.priceCents / 100).toFixed(2)}" required></label><label>Coste de compra (€)<input name="cost" type="number" min="0" step="0.01" value="${cost === undefined ? "" : (Number(cost) / 100).toFixed(2)}" placeholder="Pendiente"></label><div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-edit>Cancelar</button><button class="tpv-action" type="submit">Guardar cambios</button></div></form></div>`;
  }
  function render() {
    const content = state.tab === "ventas" ? renderSales() : renderArticles();
    root.innerHTML = `<div class="tpv-management-app">${nav()}<main class="tpv-management-main">${topbar()}${content}</main>${editModal()}${state.toast ? `<div class="tpv-toast is-success">${escapeHtml(state.toast)}</div>` : ""}</div>`;
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.tab) { state.tab = button.dataset.tab; render(); return; }
    if (button.dataset.editProduct) { state.editingId = button.dataset.editProduct; render(); return; }
    if (button.dataset.closeEdit !== undefined) { state.editingId = null; render(); }
  });
  root.addEventListener("input", (event) => {
    if (!event.target.matches("[data-search-products]")) return;
    state.search = event.target.value;
    render();
    const input = root.querySelector("[data-search-products]");
    if (input) { input.focus(); input.setSelectionRange(state.search.length, state.search.length); }
  });
  root.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-price-form]")) return;
    event.preventDefault();
    const form = new FormData(event.target);
    const price = Math.round(Number(form.get("price")) * 100);
    const rawCost = String(form.get("cost") || "").trim();
    if (!Number.isFinite(price) || price < 0) { flash("Introduce un precio de venta válido."); render(); return; }
    state.data.prices = state.data.prices || {};
    state.data.costs = state.data.costs || {};
    state.data.prices[state.editingId] = price;
    if (rawCost) state.data.costs[state.editingId] = Math.round(Number(rawCost) * 100);
    else delete state.data.costs[state.editingId];
    state.editingId = null;
    save();
    flash("Artículo actualizado en este dispositivo.");
    render();
  });
  render();
})();
