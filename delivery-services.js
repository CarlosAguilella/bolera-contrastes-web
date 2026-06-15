// Bolera Contrastes — utilidades de delivery, carrito y checkout
(function () {
  const CART_STORAGE_KEY = "bc-delivery-cart";
  const LAST_ORDER_STORAGE_KEY = "bc-last-paid-order";
  const PICKUP_OPTIONS = ["Lo antes posible", "En 20 minutos", "En 30 minutos", "En 45 minutos", "En 1 hora"];
  const FEATURED_DISH_IDS = ["p2", "p1", "h1", "d1"];
  const DELIVERY_FEE = 2.5;
  const PAYMENT_METHODS = [
    {
      id: "redsys",
      label: "Tarjeta o Bizum",
      detail: "Pago seguro con Redsys",
      badge: "Recomendado",
    },
  ];

  function formatPrice(value) {
    return `${Number(value || 0).toFixed(2).replace(".", ",")} €`;
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function readCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "{}");
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
      return Object.fromEntries(
        Object.entries(saved)
          .map(([id, qty]) => [id, Number(qty)])
          .filter(([id, qty]) => id && Number.isInteger(qty) && qty > 0)
      );
    } catch (error) {
      return {};
    }
  }

  function writeCart(cart) {
    try {
      if (cart && Object.keys(cart).length) localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      else localStorage.removeItem(CART_STORAGE_KEY);
    } catch (error) {}
  }

  function clearCart() {
    writeCart({});
  }

  function buildCartLines(cart, menu) {
    return Object.entries(cart || {})
      .map(([id, qty]) => {
        const dish = (menu || []).find((item) => item.id === id);
        const quantity = Number(qty);
        return dish && Number.isInteger(quantity) && quantity > 0 ? { dish, qty: quantity } : null;
      })
      .filter(Boolean);
  }

  function calculatePricing(cartLines, deliveryMethod) {
    const subtotal = (cartLines || []).reduce((sum, line) => sum + line.dish.price * line.qty, 0);
    const deliveryFee = deliveryMethod === "delivery" && subtotal > 0 ? DELIVERY_FEE : 0;
    return {
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
    };
  }

  function validateCheckout({ cartCount, checkout }) {
    const errors = {};
    const data = checkout || {};
    if (!cartCount) errors.cart = "Añade al menos un producto.";
    if (String(data.name || "").trim().length < 2) errors.name = "Indica nombre completo.";
    if (normalizePhone(data.phone).length < 6) errors.phone = "Indica un teléfono válido.";
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) {
      errors.email = "Revisa el email.";
    }
    if (!["pickup", "delivery"].includes(data.deliveryMethod)) errors.deliveryMethod = "Elige recogida o domicilio.";
    if (data.deliveryMethod === "delivery" && String(data.address || "").trim().length < 8) {
      errors.address = "Indica una dirección completa.";
    }
    if (!data.paymentMethod) errors.paymentMethod = "Elige un método de pago.";
    return {
      ok: Object.keys(errors).length === 0,
      errors,
    };
  }

  function buildOrderPayload({ cartLines, checkout }) {
    return {
      cart: (cartLines || []).map(({ dish, qty }) => ({ id: dish.id, qty })),
      customer: {
        name: checkout.name,
        phone: checkout.phone,
        email: checkout.email,
      },
      delivery: {
        method: checkout.deliveryMethod,
        address: checkout.deliveryMethod === "delivery" ? checkout.address : "",
        pickupTime: checkout.deliveryMethod === "pickup" ? checkout.pickupTime : "",
      },
      paymentMethod: checkout.paymentMethod,
      notes: checkout.notes,
    };
  }

  async function createPayment(orderPayload) {
    const response = await fetch("/api/redsys-create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "No se ha podido iniciar el pago.");
    }
    return payload;
  }

  function redirectToPayment(payload) {
    if (payload.redirectUrl) {
      window.location.assign(payload.redirectUrl);
      return;
    }

    if (!payload.paymentUrl || !payload.fields) {
      throw new Error("La pasarela no ha devuelto una URL de pago válida.");
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = payload.paymentUrl;
    form.style.display = "none";
    form.acceptCharset = "UTF-8";

    Object.entries(payload.fields || {}).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }

  function savePendingOrder(order) {
    try {
      const storageOrder = {
        ...order,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(LAST_ORDER_STORAGE_KEY, JSON.stringify(storageOrder));
      if (order.orderId) {
        localStorage.setItem(`bc-pending-order-${order.orderId}`, JSON.stringify(storageOrder));
      }
    } catch (error) {}
  }

  window.BC_DELIVERY = {
    CART_STORAGE_KEY,
    LAST_ORDER_STORAGE_KEY,
    PICKUP_OPTIONS,
    FEATURED_DISH_IDS,
    DELIVERY_FEE,
    PAYMENT_METHODS,
    buildCartLines,
    buildOrderPayload,
    calculatePricing,
    clearCart,
    createPayment,
    formatPrice,
    normalizePhone,
    readCart,
    redirectToPayment,
    savePendingOrder,
    validateCheckout,
    writeCart,
  };
})();
