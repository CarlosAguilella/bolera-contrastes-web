(function () {
  const Core = window.BC_TPV;
  const Cloud = window.BC_TPV_CLOUD;
  const root = document.getElementById("tpv-cocina-root");
  if (!Core || !Cloud || !root) return;

  const state = { data: Core.loadData(), orders: [], loginOpen: false, loginUsername: "cocina", toast: null, loaded: false, shift: null };
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
  function shiftDuration() {
    if (!state.shift?.started_at) return "Sin iniciar";
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(state.shift.started_at).getTime()) / 60000));
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  }
  function productIdsByDatabaseId() {
    return Object.fromEntries(Object.entries(state.data.cloudProductIds || {}).map(([externalId, databaseId]) => [databaseId, externalId]));
  }
  function productName(line) {
    const product = Core.getProduct(line.productId, state.data);
    return product?.name || line.name || "Producto";
  }
  function printOnlineLabels(order) {
    const units = order.lines.flatMap((line) => Array.from({ length: Number(line.qty || 0) }, () => ({ ...line })));
    if (!units.length) return;
    const finishedAt = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const popup = window.open("", "_blank", "width=420,height=620");
    if (!popup) { flash("Permite las ventanas emergentes para imprimir la etiqueta.", "error"); return; }
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas pedido</title><style>@page{size:80mm auto;margin:4mm}body{font-family:Arial;margin:0}.label{page-break-after:always;border-bottom:1px dashed #000;padding:7mm 2mm;min-height:48mm}.label:last-child{page-break-after:auto}h1{margin:0;font-size:24px}p{margin:5px 0;font-size:15px}.count{font-size:28px;font-weight:bold}.muted{font-size:12px;color:#333}</style></head><body>${units.map((line, index) => `<section class="label"><div class="count">${index + 1} de ${units.length}</div><h1>${escapeHtml(productName(line))}</h1>${line.variant ? `<p>${escapeHtml(line.variant)}</p>` : ""}<p><b>${escapeHtml(order.customerName || "Pedido online")}</b></p><p>${escapeHtml(order.deliveryMethod === "delivery" ? order.deliveryDetail || "Domicilio" : "Recogida en local")}</p><p class="muted">Finalizado: ${finishedAt}</p></section>`).join("")}<script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }
  async function refresh() {
    if (!session()) return;
    const products = await Cloud.loadProducts(true);
    Cloud.saveRemoteProducts(state.data, products);
    const byDatabaseId = productIdsByDatabaseId();
    const orders = await Cloud.loadKitchenOrders();
    const previousIds = new Set(state.orders.map((order) => order.id));
    state.orders = orders.map((order) => ({
      id: order.order_id,
      status: order.status === "paid" ? "pending" : order.status,
      createdAt: order.created_at,
      readyAt: order.ready_at,
      tableNumber: String(order.raw_payload?.tableNumber || String(order.delivery_detail || "").replace(/\D/g, "") || "—"),
      online: order.source !== "tpv",
      deliveryMethod: order.delivery_method,
      deliveryDetail: order.delivery_detail,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      lines: (order.items || []).map((line) => ({ productId: byDatabaseId[line.productId] || line.productId, name: line.name, qty: Number(line.qty || 0), variant: line.variant, modifiers: line.modifiers || [] })).filter((line) => line.qty > 0),
    }));
    if (state.loaded && state.orders.some((order) => !previousIds.has(order.id) && order.status === "pending")) flash("Nueva comanda en cocina.", "alert");
    state.loaded = true;
    try { state.shift = await Cloud.loadShift(); } catch (error) { state.shift = null; }
  }
  async function changeStatus(orderId, status) {
    try {
      const order = state.orders.find((item) => item.id === orderId);
      if (status === "ready" && order?.online) printOnlineLabels(order);
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
    const action = order.status === "pending_confirmation"
      ? ["pending", "Confirmar pedido"]
      : order.status === "pending"
      ? ["preparing", "Empezar preparación"]
      : order.status === "preparing"
        ? ["ready", "Hecho"]
        : ["completed", "Entregada"];
    const backAction = order.status === "preparing" ? ["pending", "Volver a pendientes"] : order.status === "ready" ? ["preparing", "Volver a preparación"] : null;
    const onlineDetails = order.online ? `<div class="kitchen-screen-online"><b>Online · ${order.deliveryMethod === "delivery" ? "Domicilio" : "Recogida"}</b><span>${escapeHtml(order.customerName || "Cliente web")}</span>${order.customerPhone ? `<a href="tel:${escapeHtml(order.customerPhone)}">${escapeHtml(order.customerPhone)}</a>` : ""}<small>${escapeHtml(order.deliveryDetail || "Lo antes posible")}</small></div>` : "";
    return `<article class="kitchen-screen-card ${order.online ? "is-online" : ""} ${isLate(order) ? "is-late" : ""}"><header><div><span>${order.online ? "PEDIDO WEB" : "MESA"}</span><strong>${escapeHtml(order.online ? order.customerName || "Online" : order.tableNumber)}</strong></div><b>${order.readyAt ? `Hecho ${new Date(order.readyAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : age(order.createdAt)}</b></header>${onlineDetails}<ul>${order.lines.map((line) => `<li><b>${line.qty}×</b><span>${escapeHtml(productName(line))}${line.variant ? `<small>${escapeHtml(line.variant)}</small>` : ""}${line.modifiers?.length ? `<small>${escapeHtml(line.modifiers.join(" · "))}</small>` : ""}</span></li>`).join("")}</ul>${canManageKitchen() ? `<div class="kitchen-screen-card__actions">${backAction ? `<button type="button" class="is-secondary" data-kitchen-status="${backAction[0]}" data-kitchen-order="${escapeHtml(order.id)}">${backAction[1]}</button>` : ""}<button type="button" data-kitchen-status="${action[0]}" data-kitchen-order="${escapeHtml(order.id)}">${action[1]}</button>${order.online && order.status === "ready" ? `<button type="button" class="is-secondary" data-print-label="${escapeHtml(order.id)}">Imprimir etiqueta</button>` : ""}</div>` : `<p class="kitchen-screen-card__readonly">Solo cocina o administración puede cambiar el estado.</p>`}</article>`;
  }
  function column(status, title) {
    const orders = state.orders.filter((order) => order.status === status);
    return `<section class="kitchen-screen-column is-${status}"><header><h2>${title}</h2><span>${orders.length}</span></header><div>${orders.length ? orders.map(card).join("") : `<p class="kitchen-screen-empty">Sin comandas</p>`}</div></section>`;
  }
  function render() {
    const user = session()?.user;
    root.innerHTML = `<div class="kitchen-screen"><header class="kitchen-screen-top"><a href="tpv.html" class="tpv-brand"><span class="tpv-brand__mark">C</span><span class="tpv-brand__type"><strong>Contrastes</strong><small>Pantalla de cocina</small></span></a><div class="kitchen-screen-top__title"><span>Producción</span><h1>Cocina</h1></div><div class="kitchen-screen-top__actions"><span class="tpv-live">${user ? `${escapeHtml(user.displayName)} · ${state.orders.length} activas` : "Sin acceso"}</span>${user ? `<div class="tpv-shift kitchen-screen-shift"><span>Jornada · ${shiftDuration()}</span><button type="button" data-shift-action="${state.shift ? "end" : "start"}">${state.shift ? "Finalizar" : "He llegado"}</button></div><button type="button" class="tpv-action is-secondary" data-logout>Salir</button>` : `<button type="button" class="tpv-action" data-open-login>Acceder</button>`}</div></header>${user ? `<main class="kitchen-screen-board">${column("pending_confirmation", "Por confirmar")}${column("pending", "Pendientes")}${column("preparing", "En preparación")}${column("ready", "Listas")}</main>` : `<main class="kitchen-screen-welcome"><h2>Pantalla exclusiva de cocina</h2><p>Las comandas llegan aquí al enviarlas desde una mesa o desde la web.</p><button class="tpv-action" type="button" data-open-login>Acceder a cocina</button></main>`}${loginModal()}${state.toast ? `<div class="tpv-toast ${state.toast.tone ? `is-${state.toast.tone}` : ""}">${escapeHtml(state.toast.message)}</div>` : ""}</div>`;
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.openLogin !== undefined) { state.loginOpen = true; render(); return; }
    if (button.dataset.closeLogin !== undefined) { state.loginOpen = false; render(); return; }
    if (button.dataset.loginUser) { state.loginUsername = button.dataset.loginUser; render(); return; }
    if (button.dataset.shiftAction) {
      const starting = button.dataset.shiftAction === "start";
      (starting ? Cloud.startShift() : Cloud.endShift())
        .then((shift) => { state.shift = starting ? shift : null; flash(starting ? "Jornada iniciada." : "Jornada finalizada.", "success"); render(); })
        .catch((error) => { flash(error.message, "error"); render(); });
      return;
    }
    if (button.dataset.logout !== undefined) { Cloud.logout(); state.orders = []; state.loaded = false; render(); return; }
    if (button.dataset.printLabel) { const order = state.orders.find((item) => item.id === button.dataset.printLabel); if (order) printOnlineLabels(order); return; }
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
