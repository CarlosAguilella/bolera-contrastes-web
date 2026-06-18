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

  const terminalStatuses = new Set(["completed", "cancelled"]);

  const state = {
    pin: localStorage.getItem("bc-kitchen-pin") || "",
    filter: ["active", "all"].includes(localStorage.getItem("bc-kitchen-filter")) ? localStorage.getItem("bc-kitchen-filter") : "active",
    knownOrderIds: new Set(),
    firstLoadDone: false,
    timer: null,
    soundReady: false,
    audioContext: null,
  };

  const login = document.getElementById("kitchen-login");
  const pinInput = document.getElementById("kitchen-pin");
  const toolbar = document.getElementById("kitchen-toolbar");
  const refreshButton = document.getElementById("kitchen-refresh");
  const testOrderButton = document.getElementById("kitchen-test-order");
  const testEmailButton = document.getElementById("kitchen-test-email");
  const filterButtons = Array.from(document.querySelectorAll("[data-kitchen-filter]"));
  const ordersEl = document.getElementById("kitchen-orders");
  const statusEl = document.getElementById("kitchen-status");
  const countEl = document.getElementById("kitchen-count");
  const updatedEl = document.getElementById("kitchen-updated");
  const warningEl = document.getElementById("kitchen-warning");

  if (state.pin) pinInput.value = state.pin;
  setActiveFilter(state.filter);
  document.addEventListener("pointerdown", () => {
    state.soundReady = true;
  }, { once: true });

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

  function formatElapsed(value) {
    if (!value) return "Ahora";
    const date = new Date(value);
    const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (!Number.isFinite(diffMinutes)) return "Ahora";
    if (diffMinutes < 1) return "Ahora";
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
    return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  function setActiveFilter(filter) {
    state.filter = filter;
    localStorage.setItem("bc-kitchen-filter", filter);
    filterButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.kitchenFilter === filter);
    });
  }

  function getOrderActions(status, isPending) {
    if (isPending) return [{ status: "cancelled", label: "Archivar" }];
    if (status === "paid" || status === "created") {
      return [
        { status: "accepted", label: "Aceptar" },
        { status: "cancelled", label: "Cancelar" },
      ];
    }
    if (status === "accepted") {
      return [
        { status: "preparing", label: "Pasar a cocina" },
        { status: "cancelled", label: "Cancelar" },
      ];
    }
    if (status === "preparing") return [{ status: "ready", label: "Marcar listo" }];
    if (status === "ready") return [{ status: "completed", label: "Entregado" }];
    return [];
  }

  function playNotificationSound(count) {
    if (!state.soundReady) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const audioContext = state.audioContext || new AudioContext();
    state.audioContext = audioContext;
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});

    Array.from({ length: Math.min(count, 3) }).forEach((_, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startsAt = audioContext.currentTime + index * 0.18;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, startsAt);
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(0.18, startsAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.16);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + 0.18);
    });
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
    const activeOrders = orders.filter((order) => !terminalStatuses.has(order.status));
    const visibleOrders = state.filter === "active" ? activeOrders : orders;
    countEl.textContent = `${activeOrders.length} activos · ${orders.length} total`;
    updatedEl.textContent = `Actualizado ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
    setActiveFilter(state.filter);

    if (!visibleOrders.length) {
      ordersEl.innerHTML = '<article class="kitchen-empty">Todavía no hay pedidos en cocina.</article>';
      return;
    }

    ordersEl.innerHTML = visibleOrders.map((order) => {
      const status = order.status || "paid";
      const isPending = status === "pending_payment" || order.payment_status === "pending";
      const actions = getOrderActions(status, isPending);
      const elapsed = formatElapsed(order.created_at || order.paid_at || order.updated_at);
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
            ${order.customer_phone ? `<a href="tel:${escapeHtml(order.customer_phone)}">${escapeHtml(order.customer_phone)}</a>` : "<span>Sin teléfono</span>"}
            <span>${escapeHtml(order.delivery_method === "delivery" ? "Domicilio" : "Recogida")}</span>
            <span>${formatEuros(order.amount_cents)}</span>
            <span>${escapeHtml(elapsed)}</span>
          </div>
          <p class="kitchen-detail">${escapeHtml(order.delivery_detail || "Sin detalle de entrega")}</p>
          ${order.notes ? `<p class="kitchen-notes">Notas: ${escapeHtml(order.notes)}</p>` : ""}
          ${isPending ? '<div class="kitchen-alert">NO COCINAR todavía: pedido pendiente de confirmación/pago.</div>' : ""}
          <ul class="kitchen-items">${renderItems(order.items)}</ul>
          <footer>
            ${actions.length ? actions.map((action) => `
              <button type="button" data-order="${escapeHtml(order.order_id)}" data-status="${action.status}" data-next-status="${action.status}">
                ${action.label}
              </button>
            `).join("") : '<span class="kitchen-done">Sin acciones pendientes</span>'}
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
      const orders = payload.orders || [];
      const newOrders = orders.filter((order) => {
        const isActionable = !terminalStatuses.has(order.status) && order.payment_status !== "pending";
        return isActionable && order.order_id && !state.knownOrderIds.has(order.order_id);
      });
      if (state.firstLoadDone && newOrders.length) {
        showWarning(`${newOrders.length} pedido${newOrders.length === 1 ? "" : "s"} nuevo${newOrders.length === 1 ? "" : "s"} en cocina.`);
        playNotificationSound(newOrders.length);
      }
      state.knownOrderIds = new Set(orders.map((order) => order.order_id).filter(Boolean));
      state.firstLoadDone = true;
      renderOrders(orders);
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
    state.soundReady = true;
    localStorage.setItem("bc-kitchen-pin", state.pin);
    loadOrders();
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(loadOrders, 20000);
  });

  refreshButton.addEventListener("click", loadOrders);
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveFilter(button.dataset.kitchenFilter || "active");
      loadOrders();
    });
  });
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
