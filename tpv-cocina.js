(function () {
  const Core = window.BC_TPV;
  const Cloud = window.BC_TPV_CLOUD;
  const root = document.getElementById("tpv-cocina-root");
  if (!Core || !Cloud || !root) return;

  const state = { data: Core.loadData(), orders: [], loginOpen: false, loginUsername: "cocina", toast: null, loaded: false };
  let toastTimer = null;

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function session() { return Cloud.getSession(); }
  function canManageKitchen() { return ["admin", "manager", "kitchen"].includes(session()?.user?.role); }
  function flash(message, tone = "") {
    state.toast = { message, tone };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = null; render(); }, 3200);
  }
  function age(createdAt) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
    return minutes < 1 ? "Ahora" : `${minutes} min`;
  }
  function isLate(order) { return Date.now() - new Date(order.createdAt).getTime() > 20 * 60 * 1000; }
  function productIdsByDatabaseId() {
    return Object.fromEntries(Object.entries(state.data.cloudProductIds || {}).map(([externalId, databaseId]) => [databaseId, externalId]));
  }
  function productName(line) {
    const product = Core.getProduct(line.productId, state.data);
    return product?.name || line.name || "Producto";
  }
  async function refresh() {
    if (!session()) return;
    const products = await Cloud.loadProducts();
    Cloud.saveRemoteProducts(state.data, products);
    const byDatabaseId = productIdsByDatabaseId();
    const orders = await Cloud.loadKitchenOrders();
    const previousIds = new Set(state.orders.map((order) => order.id));
    state.orders = orders.map((order) => ({
      id: order.order_id,
      status: order.status,
      createdAt: order.created_at,
      tableNumber: String(order.raw_payload?.tableNumber || String(order.delivery_detail || "").replace(/\D/g, "") || "—"),
      lines: (order.items || []).map((line) => ({ productId: byDatabaseId[line.productId] || line.productId, name: line.name, qty: Number(line.qty || 0), variant: line.variant })).filter((line) => line.qty > 0),
    }));
    if (state.loaded && state.orders.some((order) => !previousIds.has(order.id) && order.status === "pending")) flash("Nueva comanda en cocina.", "alert");
    state.loaded = true;
  }
  async function changeStatus(orderId, status) {
    try {
      await Cloud.updateKitchenOrder(orderId, status);
      await refresh();
      flash(status === "ready" ? "Comanda lista para servir." : "Estado actualizado.", "success");
    } catch (error) {
      flash(error.message, "error");
    }
    render();
  }
  function loginModal() {
    if (!state.loginOpen) return "";
    const options = [["cocina", "Cocina"], ["carlos", "Administrador"]];
    return `<div class="tpv-modal-backdrop"><form class="tpv-modal" data-kitchen-login><button class="tpv-modal__close" type="button" data-close-login aria-label="Cerrar">×</button><h2>Acceso a cocina</h2><p>Selecciona el perfil e introduce el PIN.</p><div class="tpv-login-users">${options.map(([username, label]) => `<button class="tpv-login-user ${state.loginUsername === username ? "is-active" : ""}" type="button" data-login-user="${username}"><b>${label}</b><small>${username === "cocina" ? "Preparación" : "Configuración"}</small></button>`).join("")}</div><label>PIN<input name="pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{4,10}" minlength="4" maxlength="10" required autofocus></label><div class="tpv-modal__actions"><button class="tpv-action is-secondary" type="button" data-close-login>Cancelar</button><button class="tpv-action" type="submit">Entrar</button></div></form></div>`;
  }
  function card(order) {
    const action = order.status === "pending"
      ? ["preparing", "Empezar preparación"]
      : order.status === "preparing"
        ? ["ready", "Marcar como lista"]
        : ["completed", "Entregada"];
    return `<article class="kitchen-screen-card ${isLate(order) ? "is-late" : ""}"><header><div><span>Mesa</span><strong>${escapeHtml(order.tableNumber)}</strong></div><b>${age(order.createdAt)}</b></header><ul>${order.lines.map((line) => `<li><b>${line.qty}×</b><span>${escapeHtml(productName(line))}${line.variant ? `<small>${escapeHtml(line.variant)}</small>` : ""}</span></li>`).join("")}</ul>${canManageKitchen() ? `<button type="button" data-kitchen-status="${action[0]}" data-kitchen-order="${escapeHtml(order.id)}">${action[1]}</button>` : `<p class="kitchen-screen-card__readonly">Solo cocina o administración puede cambiar el estado.</p>`}</article>`;
  }
  function column(status, title) {
    const orders = state.orders.filter((order) => order.status === status);
    return `<section class="kitchen-screen-column is-${status}"><header><h2>${title}</h2><span>${orders.length}</span></header><div>${orders.length ? orders.map(card).join("") : `<p class="kitchen-screen-empty">Sin comandas</p>`}</div></section>`;
  }
  function render() {
    const user = session()?.user;
    root.innerHTML = `<div class="kitchen-screen"><header class="kitchen-screen-top"><a href="tpv.html" class="tpv-brand"><span class="tpv-brand__mark">C</span><span class="tpv-brand__type"><strong>Contrastes</strong><small>Pantalla de cocina</small></span></a><div class="kitchen-screen-top__title"><span>Producción</span><h1>Cocina</h1></div><div class="kitchen-screen-top__actions"><span class="tpv-live">${user ? `${escapeHtml(user.displayName)} · ${state.orders.length} activas` : "Sin acceso"}</span>${user ? `<button type="button" class="tpv-action is-secondary" data-logout>Salir</button>` : `<button type="button" class="tpv-action" data-open-login>Acceder</button>`}</div></header>${user ? `<main class="kitchen-screen-board">${column("pending", "Pendientes")}${column("preparing", "En preparación")}${column("ready", "Listas")}</main>` : `<main class="kitchen-screen-welcome"><h2>Pantalla exclusiva de cocina</h2><p>Las comandas llegan aquí al enviarlas desde una mesa.</p><button class="tpv-action" type="button" data-open-login>Acceder a cocina</button></main>`}${loginModal()}${state.toast ? `<div class="tpv-toast ${state.toast.tone ? `is-${state.toast.tone}` : ""}">${escapeHtml(state.toast.message)}</div>` : ""}</div>`;
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.openLogin !== undefined) { state.loginOpen = true; render(); return; }
    if (button.dataset.closeLogin !== undefined) { state.loginOpen = false; render(); return; }
    if (button.dataset.loginUser) { state.loginUsername = button.dataset.loginUser; render(); return; }
    if (button.dataset.logout !== undefined) { Cloud.logout(); state.orders = []; state.loaded = false; render(); return; }
    if (button.dataset.kitchenOrder) changeStatus(button.dataset.kitchenOrder, button.dataset.kitchenStatus);
  });
  root.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-kitchen-login]")) return;
    event.preventDefault();
    const form = new FormData(event.target);
    Cloud.login(state.loginUsername, String(form.get("pin") || ""))
      .then(async () => { await refresh(); state.loginOpen = false; render(); })
      .catch((error) => { flash(error.message, "error"); render(); });
  });
  render();
  if (session()) {
    refresh().then(render).catch((error) => { flash(error.message, "error"); render(); });
    window.setInterval(() => refresh().then(render).catch(() => {}), 5000);
  }
})();
