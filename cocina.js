(function () {
  const statusLabels = {
    pending_payment: "Pendiente / no cobrado",
    paid: "Pagado",
    accepted: "Aceptado",
    preparing: "En cocina",
    ready: "Listo",
    completed: "Entregado",
    cancelled: "Cancelado",
    created: "Creado",
  };

  const nextActions = [
    { status: "accepted", label: "Aceptar" },
    { status: "preparing", label: "En cocina" },
    { status: "ready", label: "Listo" },
    { status: "completed", label: "Entregado" },
    { status: "cancelled", label: "Cancelar" },
  ];

  const state = {
    pin: localStorage.getItem("bc-kitchen-pin") || "",
    timer: null,
  };

  const login = document.getElementById("kitchen-login");
  const pinInput = document.getElementById("kitchen-pin");
  const toolbar = document.getElementById("kitchen-toolbar");
  const refreshButton = document.getElementById("kitchen-refresh");
  const testOrderButton = document.getElementById("kitchen-test-order");
  const testEmailButton = document.getElementById("kitchen-test-email");
  const ordersEl = document.getElementById("kitchen-orders");
  const statusEl = document.getElementById("kitchen-status");
  const countEl = document.getElementById("kitchen-count");
  const updatedEl = document.getElementById("kitchen-updated");
  const warningEl = document.getElementById("kitchen-warning");

  if (state.pin) pinInput.value = state.pin;

  function formatEuros(cents) {
    return `${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")} €`;
  }

  function setStatus(text, mode) {
    statusEl.textContent = text;
    statusEl.dataset.mode = mode || "idle";
  }

  function showWarning(message) {
    warningEl.hidden = !message;
    warningEl.textContent = message || "";
  }

  async function api(path, options) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-kitchen-pin": state.pin,
        ...(options && options.headers ? options.headers : {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "No se pudo cargar cocina.");
    }
    return payload;
  }

  function renderItems(items) {
    if (!Array.isArray(items) || items.length === 0) return "<li>Sin detalle de artículos</li>";
    return items.map((item) => {
      const name = item.name || item.id || "Producto";
      const qty = item.qty || 0;
      const cents = item.subtotalCents || item.subtotal_cents;
      const amount = cents ? ` <em>${formatEuros(cents)}</em>` : "";
      return `<li><strong>${qty} x ${escapeHtml(name)}</strong>${amount}</li>`;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderOrders(orders) {
    countEl.textContent = `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}`;
    updatedEl.textContent = `Actualizado ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;

    if (!orders.length) {
      ordersEl.innerHTML = '<article class="kitchen-empty">Todavía no hay pedidos en cocina.</article>';
      return;
    }

    ordersEl.innerHTML = orders.map((order) => {
      const status = order.status || "paid";
      const isPending = status === "pending_payment" || order.payment_status === "pending";
      const actions = isPending ? [{ status: "cancelled", label: "Archivar" }] : nextActions;
      return `
        <article class="kitchen-card ${isPending ? "is-pending" : ""}">
          <header>
            <div>
              <span class="eyebrow">#${escapeHtml(order.order_id)}</span>
              <h2>${escapeHtml(order.customer_name || "Cliente")}</h2>
            </div>
            <span class="kitchen-badge" data-status="${escapeHtml(status)}">${escapeHtml(statusLabels[status] || status)}</span>
          </header>
          <div class="kitchen-meta">
            <span>${escapeHtml(order.customer_phone || "Sin teléfono")}</span>
            <span>${escapeHtml(order.delivery_method === "delivery" ? "Domicilio" : "Recogida")}</span>
            <span>${formatEuros(order.amount_cents)}</span>
          </div>
          <p class="kitchen-detail">${escapeHtml(order.delivery_detail || "Sin detalle de entrega")}</p>
          ${order.notes ? `<p class="kitchen-notes">Notas: ${escapeHtml(order.notes)}</p>` : ""}
          ${isPending ? '<div class="kitchen-alert">NO COCINAR todavía: pedido pendiente de confirmación/pago.</div>' : ""}
          <ul class="kitchen-items">${renderItems(order.items)}</ul>
          <footer>
            ${actions.map((action) => `
              <button type="button" data-order="${escapeHtml(order.order_id)}" data-status="${action.status}">
                ${action.label}
              </button>
            `).join("")}
          </footer>
        </article>
      `;
    }).join("");
  }

  async function loadOrders() {
    if (!state.pin) return;
    setStatus("Cargando…", "loading");
    try {
      const payload = await api("/api/kitchen-orders?limit=60", { method: "GET" });
      toolbar.hidden = false;
      if (!payload.storageConfigured) {
        showWarning("El panel está instalado, pero falta configurar Supabase. Mientras tanto, los pedidos siguen llegando por email/WhatsApp si esas variables están configuradas.");
      } else {
        showWarning("");
      }
      renderOrders(payload.orders || []);
      setStatus("Conectado", "ok");
    } catch (error) {
      setStatus("Error", "error");
      showWarning(error.message);
      ordersEl.innerHTML = "";
    }
  }

  async function updateStatus(orderId, status) {
    setStatus("Guardando…", "loading");
    await api("/api/kitchen-orders", {
      method: "PATCH",
      body: JSON.stringify({ orderId, status }),
    });
    await loadOrders();
  }

  async function testKitchenOrder() {
    setStatus("Probando pedido…", "loading");
    const payload = await api("/api/test-kitchen-order", { method: "POST" });
    if (!payload.storage || !payload.storage.saved) {
      showWarning(`No se pudo guardar el pedido de prueba: ${payload.storage?.reason || "falta Supabase"}.`);
      setStatus("Conectado", "ok");
      return;
    }
    showWarning("Pedido de prueba creado. Debe aparecer en la lista y puede archivarse con Cancelar.");
    await loadOrders();
  }

  async function testEmail() {
    setStatus("Enviando email…", "loading");
    const payload = await api("/api/test-order-email", { method: "POST" });
    if (!payload.email || !payload.email.sent) {
      showWarning(`Email no enviado: ${payload.email?.reason || "falta configurar Gmail"}.`);
    } else {
      showWarning("Email de prueba enviado. Revisa la bandeja de entrada del correo configurado.");
    }
    setStatus("Conectado", "ok");
  }

  login.addEventListener("submit", (event) => {
    event.preventDefault();
    state.pin = pinInput.value.trim();
    localStorage.setItem("bc-kitchen-pin", state.pin);
    loadOrders();
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(loadOrders, 20000);
  });

  refreshButton.addEventListener("click", loadOrders);
  testOrderButton.addEventListener("click", () => {
    testKitchenOrder().catch((error) => {
      setStatus("Error", "error");
      showWarning(error.message);
    });
  });
  testEmailButton.addEventListener("click", () => {
    testEmail().catch((error) => {
      setStatus("Error", "error");
      showWarning(error.message);
    });
  });
  ordersEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-order][data-status]");
    if (!button) return;
    updateStatus(button.dataset.order, button.dataset.status).catch((error) => {
      setStatus("Error", "error");
      showWarning(error.message);
    });
  });

  if (state.pin) {
    loadOrders();
    state.timer = setInterval(loadOrders, 20000);
  }
})();
