// Bolera Contrastes — Carta y pedidos online
const { useState: useStateC, useMemo: useMemoC, useEffect: useEffectC } = React;
const Delivery = window.BC_DELIVERY;

const CHECKOUT_INITIAL = {
  name: "",
  phone: "",
  email: "",
  deliveryMethod: "pickup",
  address: "",
  pickupTime: Delivery.PICKUP_OPTIONS[0],
  notes: "",
  paymentMethod: "redsys",
};

function scrollToDeliveryCheckout() {
  document.getElementById("pedido-recoger")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToMenuStart() {
  document.getElementById("carta-listado")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getCheckoutError(errors, field, showErrors) {
  return showErrors && errors[field] ? errors[field] : "";
}

function Carta({ onNav, tweaks }) {
  const ALL = window.BC_MENU;
  const CATS = window.BC_CATEGORIES;
  const ALLERGENS = window.BC_ALLERGENS;

  const [query, setQuery] = useStateC("");
  const [cat, setCat] = useStateC("all");
  const [excluded, setExcluded] = useStateC([]);
  const [vegOnly, setVegOnly] = useStateC(false);
  const [showAllergens, setShowAllergens] = useStateC(false);
  const [cart, setCart] = useStateC(() => Delivery.readCart());
  const [checkout, setCheckout] = useStateC(() => Delivery.readCheckout(CHECKOUT_INITIAL));
  const [checkoutAttempted, setCheckoutAttempted] = useStateC(false);
  const [paymentState, setPaymentState] = useStateC({ type: "idle", message: "" });
  const [lastCartAction, setLastCartAction] = useStateC("");

  useEffectC(() => {
    Delivery.writeCart(cart);
  }, [cart]);

  useEffectC(() => {
    Delivery.writeCheckout(checkout);
  }, [checkout]);

  const filtered = useMemoC(() => {
    return ALL.filter((dish) => {
      if (cat !== "all" && dish.cat !== cat) return false;
      if (vegOnly && !dish.veg) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!dish.name.toLowerCase().includes(q) && !dish.desc.toLowerCase().includes(q)) return false;
      }
      if (excluded.length && dish.allergens.some((a) => excluded.includes(a))) return false;
      return true;
    });
  }, [ALL, cat, excluded, query, vegOnly]);

  const grouped = useMemoC(() => {
    if (cat !== "all") return [[cat, filtered]];
    const groups = {};
    filtered.forEach((dish) => {
      groups[dish.cat] = groups[dish.cat] || [];
      groups[dish.cat].push(dish);
    });
    return CATS.filter((category) => category.id !== "all" && groups[category.id]?.length)
      .map((category) => [category.id, groups[category.id]]);
  }, [CATS, cat, filtered]);

  const featuredDishes = useMemoC(() => {
    return Delivery.FEATURED_DISH_IDS.map((id) => ALL.find((dish) => dish.id === id)).filter(Boolean);
  }, [ALL]);

  const cartLines = useMemoC(() => Delivery.buildCartLines(cart, ALL), [ALL, cart]);
  const cartCount = useMemoC(() => cartLines.reduce((sum, line) => sum + line.qty, 0), [cartLines]);
  const pricing = useMemoC(() => Delivery.calculatePricing(cartLines, checkout.deliveryMethod), [cartLines, checkout.deliveryMethod]);
  const validation = useMemoC(
    () => Delivery.validateCheckout({ cartCount, checkout }),
    [cartCount, checkout]
  );
  const showErrors = checkoutAttempted || paymentState.type === "error";
  const canPayOrder = validation.ok && paymentState.type !== "loading";
  const firstError = Object.values(validation.errors)[0] || "";

  const updateCart = (dish, delta) => {
    let actionMessage = "";
    setCart((current) => {
      const next = { ...current };
      const currentQty = next[dish.id] || 0;
      const qty = Math.min(Math.max(currentQty + delta, 0), Delivery.MAX_ITEM_QTY);
      if (delta > 0 && currentQty >= Delivery.MAX_ITEM_QTY) {
        actionMessage = `Máximo ${Delivery.MAX_ITEM_QTY} unidades por producto.`;
        return current;
      }
      if (qty <= 0) delete next[dish.id];
      else next[dish.id] = qty;
      actionMessage = qty > currentQty
        ? `${dish.name} añadido al pedido.`
        : qty === 0
          ? `${dish.name} eliminado del pedido.`
          : `${dish.name} actualizado.`;
      return next;
    });
    if (actionMessage) setLastCartAction(actionMessage);
    if (paymentState.type !== "loading") {
      setPaymentState({ type: "idle", message: "" });
    }
  };

  const clearCart = () => {
    setCart({});
    setLastCartAction("Carrito vaciado.");
    setPaymentState({ type: "idle", message: "" });
  };

  const updateCheckout = (field, value) => {
    setCheckout((current) => ({ ...current, [field]: value }));
    if (paymentState.type !== "loading") {
      setPaymentState({ type: "idle", message: "" });
    }
  };

  const toggleAllergen = (code) => {
    setExcluded((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code]
    );
  };

  const payButtonLabel = paymentState.type === "loading"
    ? "Preparando pago seguro…"
    : cartCount === 0
      ? "Añade productos"
      : canPayOrder
        ? `Pagar ${Delivery.formatPrice(pricing.total)}`
        : "Completa datos para pagar";

  const checkoutHint = paymentState.type === "loading"
    ? "Conectando con la pasarela en esta misma pestaña…"
    : validation.ok
      ? "Todo listo · Pago seguro y pedido enviado al local tras confirmación bancaria"
      : firstError;

  const checkoutHintTone = paymentState.type === "loading"
    ? "is-loading"
    : validation.ok
      ? "is-ready"
      : "is-pending";
  const checkoutStep = cartCount === 0 ? 1 : validation.ok ? 3 : 2;

  const startPayment = async (event) => {
    event.preventDefault();
    setCheckoutAttempted(true);

    const currentValidation = Delivery.validateCheckout({ cartCount, checkout });
    if (!currentValidation.ok) {
      setPaymentState({
        type: "error",
        message: Object.values(currentValidation.errors)[0] || "Revisa los datos del pedido.",
      });
      return;
    }

    setPaymentState({ type: "loading", message: "Preparando pago seguro…" });

    try {
      const orderPayload = Delivery.buildOrderPayload({ cartLines, checkout });
      const payment = await Delivery.createPayment(orderPayload);

      Delivery.savePendingOrder({
        orderId: payment.orderId,
        provider: payment.provider,
        subtotalCents: payment.subtotalCents,
        deliveryFeeCents: payment.deliveryFeeCents,
        totalCents: payment.totalCents,
        customer: orderPayload.customer,
        delivery: orderPayload.delivery,
        paymentMethod: orderPayload.paymentMethod,
        notes: orderPayload.notes,
        lines: cartLines.map(({ dish, qty }) => ({
          id: dish.id,
          name: dish.name,
          qty,
          unitPrice: dish.price,
          unitPriceCents: Math.round(dish.price * 100),
          subtotal: dish.price * qty,
          subtotalCents: Math.round(dish.price * qty * 100),
        })),
      });

      setPaymentState({
        type: "loading",
        message: payment.provider === "demo" ? "Modo demo: mostrando confirmación…" : "Redirigiendo a Redsys…",
      });
      Delivery.redirectToPayment(payment);
    } catch (error) {
      setPaymentState({
        type: "error",
        message: error.message || "No se ha podido preparar el pago. Inténtalo de nuevo.",
      });
    }
  };

  return (
    <main data-screen-label="Carta">
      <section className="delivery-hero bc-container">
        <div>
          <span className="eyebrow">Pedido online · Recogida o domicilio</span>
          <h1 className="h-hero" style={{ marginTop: 10 }}>
            Pide fácil.<br/><em>Recoge rápido</em>.
          </h1>
          <p className="muted pretty" style={{ maxWidth: '54ch', marginTop: 14, fontSize: 18 }}>
            Elige platos, revisa el total, paga sin ventanas emergentes y recibe una confirmación clara del pedido.
          </p>
          <div className="delivery-hero__actions">
            <button className="btn btn-primary btn-lg" type="button" onClick={scrollToMenuStart}>Empezar pedido</button>
            <button className="btn btn-secondary btn-lg" type="button" onClick={scrollToDeliveryCheckout}>
              Ver carrito {cartCount > 0 ? `(${cartCount})` : ""}
            </button>
          </div>
          <div className="delivery-service-strip" aria-label="Información rápida de pedidos">
            {Delivery.SERVICE_PROMISES.map((item) => (
              <span key={item.label}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="delivery-steps-card">
          <span className="eyebrow">Cómo funciona</span>
          <ol>
            <li><strong>1</strong><span>Elige productos y cantidades.</span></li>
            <li><strong>2</strong><span>Completa datos y método de entrega.</span></li>
            <li><strong>3</strong><span>Paga con Redsys en la misma pestaña.</span></li>
          </ol>
        </div>
      </section>

      {featuredDishes.length > 0 && (
        <section className="delivery-featured bc-container" aria-label="Recomendados para pedir rápido">
          <div className="delivery-featured__head">
            <div>
              <span className="eyebrow">Para pedir en 10 segundos</span>
              <h2>Lo más fácil para empezar</h2>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={scrollToMenuStart}>Ver toda la carta</button>
          </div>
          <div className="delivery-featured__grid">
            {featuredDishes.map((dish) => (
              <button className="delivery-featured-card" type="button" key={dish.id} onClick={() => updateCart(dish, 1)}>
                <img src={dish.img} alt="" loading="lazy" />
                <span>
                  <strong>{dish.name}</strong>
                  <small>{Delivery.formatPrice(dish.price)}</small>
                  <em>{cart[dish.id] ? `${cart[dish.id]} en tu pedido` : "Añadir rápido"}</em>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="carta-toolbar">
        <div className="bc-container">
          <div className="carta-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--ink-soft)' }}>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              placeholder="Buscar plato, ingrediente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar en la carta"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Borrar búsqueda">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          <div className="carta-cats">
            {CATS.map((category) => (
              <button
                key={category.id}
                type="button"
                className={"chip " + (cat === category.id ? "is-active" : "")}
                onClick={() => setCat(category.id)}
              >
                {category.label}
              </button>
            ))}
            <button
              type="button"
              className={"chip " + (vegOnly ? "is-active" : "")}
              onClick={() => setVegOnly((value) => !value)}
              title="Solo platos vegetarianos"
            >
              🌱 Veg
            </button>
            <button
              type="button"
              className={"chip " + (showAllergens || excluded.length ? "is-active" : "")}
              onClick={() => setShowAllergens((value) => !value)}
            >
              Alérgenos {excluded.length > 0 ? `(${excluded.length})` : ""}
            </button>
            <button
              type="button"
              className={"chip " + (cartCount > 0 ? "is-active" : "")}
              onClick={scrollToDeliveryCheckout}
            >
              Mi pedido {cartCount > 0 ? `(${cartCount}) · ${Delivery.formatPrice(pricing.total)}` : ""}
            </button>
          </div>

          {showAllergens && (
            <div className="allergen-bar fade-in">
              <span className="allergen-bar__label">Excluir:</span>
              {Object.entries(ALLERGENS).map(([code, allergen]) => (
                <button
                  key={code}
                  type="button"
                  className={"allergen-pick " + (excluded.includes(code) ? "is-excluded" : "")}
                  onClick={() => toggleAllergen(code)}
                >
                  <span className="chip-allergen">{allergen.short}</span>
                  <span>{allergen.label}</span>
                </button>
              ))}
              {excluded.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => setExcluded([])}
                  style={{ marginLeft: 'auto' }}
                >
                  Limpiar
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div id="carta-listado" className="bc-container" style={{ paddingTop: 'var(--s-3)', paddingBottom: 'var(--s-8)' }}>
        <div className="delivery-menu-shell">
          <div className="delivery-menu-feed">
            {filtered.length === 0 ? (
              <div className="delivery-empty-results">
                <p>Nada con esos filtros 😕</p>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setQuery(""); setCat("all"); setExcluded([]); setVegOnly(false); }}>
                  Limpiar filtros
                </button>
              </div>
            ) : (
              grouped.map(([catId, items]) => (
                <section key={catId}>
                  <div className="menu-cat">
                    <h3 className="display">{CATS.find((category) => category.id === catId)?.label || catId}</h3>
                    <span className="menu-cat__count">{items.length} {items.length === 1 ? "plato" : "platos"}</span>
                  </div>
                  <div className="menu-grid" data-density={tweaks.density} data-photos={tweaks.photos ? "on" : "off"}>
                    {items.map((dish) => (
                      <DishCard
                        key={dish.id}
                        dish={dish}
                        excluded={excluded}
                        quantity={cart[dish.id] || 0}
                        onAdd={() => updateCart(dish, 1)}
                        onRemove={() => updateCart(dish, -1)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
          <DeliverySideCart
            cartLines={cartLines}
            cartCount={cartCount}
            pricing={pricing}
            checkout={checkout}
            onUpdateCart={updateCart}
            onClearCart={clearCart}
          />
        </div>

        <section className="delivery-checkout" id="pedido-recoger">
          <div className="delivery-checkout__head">
            <div>
              <span className="eyebrow">Finalizar pedido</span>
              <h2 className="h-section" style={{ marginTop: 8 }}>Revisa, paga y confirma</h2>
              <p className="muted pretty" style={{ marginTop: 10, maxWidth: '58ch' }}>
                El pago se hace con redirección segura en la misma pestaña. El local recibe el pedido cuando el banco confirma la operación.
              </p>
            </div>
            <div className="delivery-trust-card">
              <strong>Seguro para producción</strong>
              <span>Precio recalculado en servidor · Sin claves en frontend · Sin popups bloqueables</span>
            </div>
          </div>
          <div className="delivery-progress" aria-label="Progreso del pedido">
            <span className={checkoutStep >= 1 ? "is-active" : ""}>1 · Carta</span>
            <span className={checkoutStep >= 2 ? "is-active" : ""}>2 · Datos</span>
            <span className={checkoutStep >= 3 ? "is-active" : ""}>3 · Pago</span>
          </div>

          <div className="delivery-order">
            <aside className="delivery-cart" aria-label="Resumen del pedido">
              <div className="delivery-card-head">
                <div>
                  <span className="eyebrow">Carrito</span>
                  <strong>{cartCount > 0 ? `${cartCount} productos` : "Vacío"}</strong>
                </div>
                {cartLines.length > 0 && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={clearCart}>Vaciar</button>
                )}
              </div>
              {lastCartAction && (
                <div className="delivery-cart-notice" role="status">{lastCartAction}</div>
              )}

              {cartLines.length === 0 ? (
                <div className="delivery-empty-cart">
                  <p>Añade productos de la carta para preparar el pedido.</p>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={scrollToMenuStart}>Ver platos</button>
                </div>
              ) : (
                <React.Fragment>
                  {cartLines.map(({ dish, qty }) => (
                    <div className="delivery-cart__line" key={dish.id}>
                      <div>
                        <strong>{dish.name}</strong>
                        <span>{qty} x {Delivery.formatPrice(dish.price)}</span>
                        <em>{Delivery.formatPrice(dish.price * qty)}</em>
                      </div>
                      <div className="delivery-cart__qty">
                        <button type="button" onClick={() => updateCart(dish, -1)} aria-label={`Quitar ${dish.name}`}>−</button>
                        <span>{qty}</span>
                        <button type="button" onClick={() => updateCart(dish, 1)} disabled={qty >= Delivery.MAX_ITEM_QTY} aria-label={`Añadir ${dish.name}`}>+</button>
                      </div>
                      <button className="delivery-cart__remove" type="button" onClick={() => updateCart(dish, -qty)}>
                        Quitar
                      </button>
                    </div>
                  ))}

                  <div className="delivery-summary">
                    <div><span>Subtotal</span><strong>{Delivery.formatPrice(pricing.subtotal)}</strong></div>
                    <div><span>{checkout.deliveryMethod === "delivery" ? "Entrega domicilio" : "Recogida local"}</span><strong>{pricing.deliveryFee ? Delivery.formatPrice(pricing.deliveryFee) : "Gratis"}</strong></div>
                    <div><span>Preparación estimada</span><strong>{checkout.deliveryMethod === "delivery" ? "35–50 min" : checkout.pickupTime}</strong></div>
                  </div>
                  <div className="delivery-cart__total">
                    <span>Total final</span>
                    <strong>{Delivery.formatPrice(pricing.total)}</strong>
                  </div>
                </React.Fragment>
              )}
            </aside>

            <form className="delivery-form" onSubmit={startPayment} noValidate>
              <div className="delivery-card-head delivery-form__full">
                <div>
                  <span className="eyebrow">Checkout</span>
                  <strong>Datos del pedido</strong>
                </div>
                <span className="delivery-secure-pill">🔒 Sin popups</span>
              </div>

              <div className="delivery-checkout-step delivery-form__full">
                <span>1</span>
                <div>
                  <strong>Contacto</strong>
                  <small>Necesario para avisarte si hay cualquier duda.</small>
                </div>
              </div>

              <label className={getCheckoutError(validation.errors, "name", showErrors) ? "has-error" : ""}>
                Nombre completo
                <input value={checkout.name} onChange={(e) => updateCheckout("name", e.target.value)} placeholder="Tu nombre" autoComplete="name" />
                {getCheckoutError(validation.errors, "name", showErrors) && <small>{validation.errors.name}</small>}
              </label>

              <label className={getCheckoutError(validation.errors, "phone", showErrors) ? "has-error" : ""}>
                Teléfono
                <input value={checkout.phone} onChange={(e) => updateCheckout("phone", e.target.value)} placeholder="600 000 000" type="tel" inputMode="tel" autoComplete="tel" />
                {getCheckoutError(validation.errors, "phone", showErrors) && <small>{validation.errors.phone}</small>}
              </label>

              <label className={"delivery-form__full " + (getCheckoutError(validation.errors, "email", showErrors) ? "has-error" : "")}>
                Email recomendado
                <input value={checkout.email} onChange={(e) => updateCheckout("email", e.target.value)} placeholder="tu@email.com" type="email" autoComplete="email" />
                {getCheckoutError(validation.errors, "email", showErrors) && <small>{validation.errors.email}</small>}
              </label>

              <div className="delivery-checkout-step delivery-form__full">
                <span>2</span>
                <div>
                  <strong>Entrega</strong>
                  <small>Elige si vienes a recoger o prefieres entrega a domicilio.</small>
                </div>
              </div>

              <fieldset className="delivery-choice delivery-form__full">
                <legend>Método de entrega</legend>
                <div>
                  <button
                    type="button"
                    className={checkout.deliveryMethod === "pickup" ? "is-active" : ""}
                    onClick={() => updateCheckout("deliveryMethod", "pickup")}
                  >
                    <strong>Recogida en local</strong>
                    <span>Sin gastos · Carrer del Ceramista Abad, 9</span>
                  </button>
                  <button
                    type="button"
                    className={checkout.deliveryMethod === "delivery" ? "is-active" : ""}
                    onClick={() => updateCheckout("deliveryMethod", "delivery")}
                  >
                    <strong>Entrega a domicilio</strong>
                    <span>{Delivery.formatPrice(Delivery.DELIVERY_FEE)} · Onda y alrededores</span>
                  </button>
                </div>
              </fieldset>
              <div className="delivery-service-note delivery-form__full">
                <strong>{checkout.deliveryMethod === "delivery" ? "Entrega a domicilio" : "Recogida en local"}</strong>
                <span>
                  {checkout.deliveryMethod === "delivery"
                    ? "Confirmaremos el pedido en cocina tras el pago. Si la dirección queda fuera de zona, te llamaremos."
                    : "Te esperamos en Carrer del Ceramista Abad, 9. Elige la hora aproximada de recogida."}
                </span>
              </div>

              {checkout.deliveryMethod === "pickup" ? (
                <fieldset className="delivery-time delivery-form__full">
                  <legend>Hora de recogida</legend>
                  <div>
                    {Delivery.PICKUP_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={checkout.pickupTime === option ? "is-active" : ""}
                        onClick={() => updateCheckout("pickupTime", option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <label className={"delivery-form__full " + (getCheckoutError(validation.errors, "address", showErrors) ? "has-error" : "")}>
                  Dirección completa
                  <input value={checkout.address} onChange={(e) => updateCheckout("address", e.target.value)} placeholder="Calle, número, piso, localidad" autoComplete="street-address" />
                  {getCheckoutError(validation.errors, "address", showErrors) && <small>{validation.errors.address}</small>}
                </label>
              )}

              <div className="delivery-checkout-step delivery-form__full">
                <span>3</span>
                <div>
                  <strong>Pago seguro</strong>
                  <small>Redirección bancaria en la misma pestaña, sin ventanas emergentes.</small>
                </div>
              </div>

              <fieldset className="delivery-choice delivery-form__full">
                <legend>Método de pago</legend>
                <div>
                  {Delivery.PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      className={checkout.paymentMethod === method.id ? "is-active" : ""}
                      onClick={() => updateCheckout("paymentMethod", method.id)}
                    >
                      <strong>{method.label}</strong>
                      <span>{method.detail}</span>
                      {method.badge && <em>{method.badge}</em>}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="delivery-form__full">
                Notas del pedido
                <textarea value={checkout.notes} onChange={(e) => updateCheckout("notes", e.target.value)} placeholder="Sin cebolla, alérgenos, portal, horario, cambio..." />
              </label>

              <div className={`delivery-checkout-hint ${checkoutHintTone} delivery-form__full`} role="status">
                {checkoutHint}
              </div>

              {paymentState.message && paymentState.type !== "idle" && (
                <div className={`delivery-payment-status is-${paymentState.type} delivery-form__full`} role="status">
                  {paymentState.message}
                </div>
              )}

              <button className="btn btn-primary btn-lg btn-block delivery-form__full" type="submit" disabled={!canPayOrder}>
                {payButtonLabel}
              </button>
            </form>
          </div>
        </section>
      </div>

      {cartCount > 0 && (
        <div className="delivery-sticky-cart">
          <button type="button" onClick={scrollToDeliveryCheckout} aria-label={`Finalizar pedido de ${Delivery.formatPrice(pricing.total)}`}>
            <span>{cartCount} {cartCount === 1 ? "producto" : "productos"}</span>
            <strong>{Delivery.formatPrice(pricing.total)}</strong>
            <small>Finalizar pedido</small>
          </button>
        </div>
      )}
    </main>
  );
}

function DishCard({ dish, excluded, quantity = 0, onAdd, onRemove }) {
  const hasExcluded = dish.allergens.some((allergen) => excluded.includes(allergen));
  return (
    <article className={"dish-card " + (quantity > 0 ? "is-in-cart" : "")} style={hasExcluded ? { opacity: 0.4 } : {}}>
      <div className="dish-card__media">
        <img src={dish.img} alt={dish.name} loading="lazy"/>
        {quantity > 0 && <span className="dish-card__cart-badge">{quantity} en pedido</span>}
        {dish.veg && (
          <span className="dish-card__veg" title="Vegetariano" aria-label="Vegetariano">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 2a10 10 0 0 0 0 20 10 10 0 0 0-2-19.9C8.6 4 7 8 7 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </span>
        )}
      </div>
      <div className="dish-card__body">
        <div className="dish-card__head">
          <h4 className="dish-card__name balance">{dish.name}</h4>
          <span className="dish-card__price">{Delivery.formatPrice(dish.price)}</span>
        </div>
        <p className="dish-card__desc pretty">{dish.desc}</p>
        {dish.allergens.length > 0 && (
          <div className="dish-card__allergens">
            {dish.allergens.map((code) => (
              <AllergenChip key={code} code={code} mode={excluded.includes(code) ? "warning" : "plain"}/>
            ))}
          </div>
        )}
        <div className="dish-card__order">
          {quantity > 0 ? (
            <div className="dish-card__qty">
              <button type="button" onClick={onRemove} aria-label={`Quitar ${dish.name}`}>−</button>
              <span>{quantity}</span>
              <button type="button" onClick={onAdd} disabled={quantity >= Delivery.MAX_ITEM_QTY} aria-label={`Añadir ${dish.name}`}>+</button>
            </div>
          ) : (
            <button className="btn btn-secondary btn-sm" type="button" onClick={onAdd}>Añadir</button>
          )}
        </div>
      </div>
    </article>
  );
}

function DeliverySideCart({ cartLines, cartCount, pricing, checkout, onUpdateCart, onClearCart }) {
  return (
    <aside className="delivery-side-cart" aria-label="Carrito lateral">
      <div className="delivery-side-cart__top">
        <div>
          <span className="eyebrow">Tu pedido</span>
          <strong>{cartCount > 0 ? `${cartCount} productos` : "Empieza tu pedido"}</strong>
        </div>
        {cartLines.length > 0 && (
          <button type="button" onClick={onClearCart}>Vaciar</button>
        )}
      </div>

      {cartLines.length === 0 ? (
        <div className="delivery-side-cart__empty">
          <span>🛒</span>
          <p>Añade platos y verás aquí el resumen en tiempo real.</p>
        </div>
      ) : (
        <React.Fragment>
          <div className="delivery-side-cart__lines">
            {cartLines.map(({ dish, qty }) => (
              <div className="delivery-side-cart__line" key={dish.id}>
                <div>
                  <strong>{dish.name}</strong>
                  <span>{Delivery.formatPrice(dish.price * qty)}</span>
                </div>
                <div className="delivery-cart__qty">
                  <button type="button" onClick={() => onUpdateCart(dish, -1)} aria-label={`Quitar ${dish.name}`}>−</button>
                  <span>{qty}</span>
                  <button type="button" onClick={() => onUpdateCart(dish, 1)} disabled={qty >= Delivery.MAX_ITEM_QTY} aria-label={`Añadir ${dish.name}`}>+</button>
                </div>
              </div>
            ))}
          </div>
          <div className="delivery-side-cart__summary">
            <div><span>Subtotal</span><strong>{Delivery.formatPrice(pricing.subtotal)}</strong></div>
            <div><span>{checkout.deliveryMethod === "delivery" ? "Domicilio" : "Recogida"}</span><strong>{pricing.deliveryFee ? Delivery.formatPrice(pricing.deliveryFee) : "Gratis"}</strong></div>
            <div className="is-total"><span>Total</span><strong>{Delivery.formatPrice(pricing.total)}</strong></div>
          </div>
          <button className="btn btn-primary btn-block" type="button" onClick={scrollToDeliveryCheckout}>
            Finalizar pedido
          </button>
        </React.Fragment>
      )}
    </aside>
  );
}

window.Carta = Carta;
window.DishCard = DishCard;
