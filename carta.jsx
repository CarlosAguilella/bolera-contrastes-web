// Bolera Contrastes — Carta
const { useState: useStateC, useMemo: useMemoC, useEffect: useEffectC } = React;

function formatCartaPrice(value) {
  return `${Number(value).toFixed(2).replace('.', ',')} €`;
}

const CART_STORAGE_KEY = "bc-delivery-cart";
const PICKUP_OPTIONS = ["Lo antes posible", "En 20 minutos", "En 30 minutos", "En 45 minutos", "En 1 hora"];
const FEATURED_DISH_IDS = ["p2", "p1", "h1", "d1"];

function scrollToDeliveryCheckout() {
  document.getElementById("pedido-recoger")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToMenuStart() {
  document.getElementById("carta-listado")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function submitRedsysForm(paymentUrl, fields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = paymentUrl;
  form.style.display = "none";
  form.acceptCharset = "UTF-8";

  Object.entries(fields || {}).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

function savePendingKitchenOrder(order) {
  try {
    const storageOrder = {
      ...order,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem("bc-last-paid-order", JSON.stringify(storageOrder));
    if (order.orderId) {
      localStorage.setItem(`bc-pending-order-${order.orderId}`, JSON.stringify(storageOrder));
    }
  } catch (error) {}
}

function Carta({ onNav, tweaks }) {
  const ALL = window.BC_MENU;
  const CATS = window.BC_CATEGORIES;
  const ALLERGENS = window.BC_ALLERGENS;

  const [query, setQuery] = useStateC("");
  const [cat, setCat] = useStateC("all");
  const [excluded, setExcluded] = useStateC([]); // alérgenos a excluir
  const [vegOnly, setVegOnly] = useStateC(false);
  const [showAllergens, setShowAllergens] = useStateC(false);
  const [cart, setCart] = useStateC(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch (error) {
      return {};
    }
  });
  const [orderName, setOrderName] = useStateC("");
  const [orderPhone, setOrderPhone] = useStateC("");
  const [pickupTime, setPickupTime] = useStateC("Lo antes posible");
  const [orderNotes, setOrderNotes] = useStateC("");
  const [paymentStatus, setPaymentStatus] = useStateC({ type: "idle", message: "" });

  useEffectC(() => {
    try {
      if (Object.keys(cart).length) localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      else localStorage.removeItem(CART_STORAGE_KEY);
    } catch (error) {}
  }, [cart]);

  const filtered = useMemoC(() => {
    return ALL.filter((d) => {
      if (cat !== "all" && d.cat !== cat) return false;
      if (vegOnly && !d.veg) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!d.name.toLowerCase().includes(q) && !d.desc.toLowerCase().includes(q)) return false;
      }
      if (excluded.length && d.allergens.some((a) => excluded.includes(a))) return false;
      return true;
    });
  }, [query, cat, excluded, vegOnly]);

  // Group by category if showing all
  const grouped = useMemoC(() => {
    if (cat !== "all") return [[cat, filtered]];
    const groups = {};
    filtered.forEach((d) => {
      groups[d.cat] = groups[d.cat] || [];
      groups[d.cat].push(d);
    });
    // Preservar el orden de CATS
    return CATS.filter((c) => c.id !== "all" && groups[c.id]?.length).map((c) => [c.id, groups[c.id]]);
  }, [filtered, cat]);

  const featuredDishes = useMemoC(() => {
    return FEATURED_DISH_IDS.map((id) => ALL.find((dish) => dish.id === id)).filter(Boolean);
  }, [ALL]);

  const toggleAllergen = (code) => {
    setExcluded((cur) =>
      cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]
    );
  };

  const cartLines = useMemoC(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const dish = ALL.find((item) => item.id === id);
        return dish ? { dish, qty } : null;
      })
      .filter(Boolean);
  }, [cart, ALL]);

  const cartCount = useMemoC(() => {
    return cartLines.reduce((sum, line) => sum + line.qty, 0);
  }, [cartLines]);

  const cartTotal = useMemoC(() => {
    return cartLines.reduce((sum, line) => sum + line.dish.price * line.qty, 0);
  }, [cartLines]);

  const updateCart = (dish, delta) => {
    setCart((current) => {
      const next = { ...current };
      const qty = (next[dish.id] || 0) + delta;
      if (qty <= 0) delete next[dish.id];
      else next[dish.id] = qty;
      return next;
    });
  };

  const clearCart = () => {
    setCart({});
    setPaymentStatus({ type: "idle", message: "" });
  };

  const checkoutHint = useMemoC(() => {
    if (cartCount === 0) return "Añade algo al carrito para empezar";
    if (orderName.trim().length < 2) return "Escribe tu nombre para identificar el pedido";
    if (orderPhone.replace(/\D/g, "").length < 6) return "Añade un teléfono de contacto";
    if (paymentStatus.type === "loading") return "Preparando pago seguro…";
    return "Pago seguro con Redsys · Pedido confirmado al pagar";
  }, [cartCount, orderName, orderPhone, paymentStatus.type]);

  const canPayOrder = cartCount > 0 && orderName.trim().length >= 2 && orderPhone.replace(/\D/g, "").length >= 6 && paymentStatus.type !== "loading";
  const checkoutHintTone = paymentStatus.type === "loading" ? "is-loading" : canPayOrder ? "is-ready" : "is-pending";
  const payButtonLabel = paymentStatus.type === "loading"
    ? "Preparando pago…"
    : cartCount === 0
      ? "Añade productos"
      : canPayOrder
        ? `Pagar ${formatCartaPrice(cartTotal)}`
        : "Completa datos para pagar";

  const sendOrder = async (event) => {
    event.preventDefault();
    if (!canPayOrder) return;

    setPaymentStatus({ type: "loading", message: "Preparando pago seguro con Redsys…" });

    try {
      const response = await fetch("/api/redsys-create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cartLines.map(({ dish, qty }) => ({ id: dish.id, qty })),
          customer: { name: orderName, phone: orderPhone },
          pickupTime,
          notes: orderNotes,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.paymentUrl || !payload.fields) {
        throw new Error(payload.error || "No se ha podido iniciar el pago.");
      }

      setPaymentStatus({ type: "loading", message: "Redirigiendo a Redsys para pagar…" });
      savePendingKitchenOrder({
        orderId: payload.orderId,
        totalCents: payload.totalCents,
        customer: { name: orderName, phone: orderPhone },
        pickupTime,
        notes: orderNotes,
        lines: cartLines.map(({ dish, qty }) => ({
          id: dish.id,
          name: dish.name,
          qty,
          unitPrice: dish.price,
          subtotal: dish.price * qty,
        })),
      });
      submitRedsysForm(payload.paymentUrl, payload.fields);
    } catch (error) {
      setPaymentStatus({
        type: "error",
        message: error.message || "No se ha podido preparar el pago. Inténtalo de nuevo.",
      });
    }
  };

  return (
    <main data-screen-label="Carta">
      <section className="delivery-hero bc-container">
        <div>
          <span className="eyebrow">Pedido online · Recogida en local</span>
          <h1 className="h-hero" style={{ marginTop: 10 }}>
            Pide fácil.<br/><em>Recoge rápido</em>.
          </h1>
          <p className="muted pretty" style={{ maxWidth: '54ch', marginTop: 14, fontSize: 18 }}>
            Elige platos, paga de forma segura y el pedido llega preparado a cocina. Sin llamadas, sin esperas raras.
          </p>
          <div className="delivery-hero__actions">
            <button className="btn btn-primary btn-lg" type="button" onClick={scrollToMenuStart}>Empezar pedido</button>
            <button className="btn btn-secondary btn-lg" type="button" onClick={scrollToDeliveryCheckout}>
              Ver carrito {cartCount > 0 ? `(${cartCount})` : ""}
            </button>
          </div>
        </div>
        <div className="delivery-steps-card">
          <span className="eyebrow">Cómo funciona</span>
          <ol>
            <li><strong>1</strong><span>Elige tus platos favoritos.</span></li>
            <li><strong>2</strong><span>Paga con Redsys antes de cocinar.</span></li>
            <li><strong>3</strong><span>Recoge en Bolera Contrastes.</span></li>
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
                  <small>{formatCartaPrice(dish.price)}</small>
                  <em>{cart[dish.id] ? `${cart[dish.id]} en tu pedido` : "Añadir rápido"}</em>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* TOOLBAR sticky */}
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
              <button onClick={() => setQuery("")} aria-label="Borrar búsqueda">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          <div className="carta-cats">
            {CATS.map((c) => (
              <button
                key={c.id}
                className={"chip " + (cat === c.id ? "is-active" : "")}
                onClick={() => setCat(c.id)}
              >
                {c.label}
              </button>
            ))}
            <button
              className={"chip " + (vegOnly ? "is-active" : "")}
              onClick={() => setVegOnly((v) => !v)}
              title="Solo platos vegetarianos"
            >
              🌱 Veg
            </button>
            <button
              className={"chip " + (showAllergens || excluded.length ? "is-active" : "")}
              onClick={() => setShowAllergens((v) => !v)}
            >
              Alérgenos {excluded.length > 0 ? `(${excluded.length})` : ""}
            </button>
            <button
              className={"chip " + (cartCount > 0 ? "is-active" : "")}
              onClick={scrollToDeliveryCheckout}
            >
              Mi pedido {cartCount > 0 ? `(${cartCount}) · ${formatCartaPrice(cartTotal)}` : ""}
            </button>
          </div>

          {showAllergens && (
            <div className="allergen-bar fade-in">
              <span className="allergen-bar__label">Excluir:</span>
              {Object.entries(ALLERGENS).map(([code, a]) => (
                <button
                  key={code}
                  className={"allergen-pick " + (excluded.includes(code) ? "is-excluded" : "")}
                  onClick={() => toggleAllergen(code)}
                >
                  <span className="chip-allergen">{a.short}</span>
                  <span>{a.label}</span>
                </button>
              ))}
              {excluded.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
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

      {/* LISTADO */}
      <div id="carta-listado" className="bc-container" style={{ paddingTop: 'var(--s-3)', paddingBottom: 'var(--s-8)' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--s-8) 0', color: 'var(--ink-soft)' }}>
            <p style={{ fontSize: 18 }}>Nada con esos filtros 😕</p>
            <button className="btn btn-ghost btn-sm" onClick={() => { setQuery(""); setCat("all"); setExcluded([]); setVegOnly(false); }}>
              Limpiar filtros
            </button>
          </div>
        ) : (
          grouped.map(([catId, items]) => (
            <section key={catId}>
              <div className="menu-cat">
                <h3 className="display">{CATS.find((c) => c.id === catId)?.label || catId}</h3>
                <span className="menu-cat__count">{items.length} {items.length === 1 ? "plato" : "platos"}</span>
              </div>
              <div className="menu-grid" data-density={tweaks.density} data-photos={tweaks.photos ? "on" : "off"}>
                {items.map((d) => (
                  <DishCard
                    key={d.id}
                    dish={d}
                    excluded={excluded}
                    quantity={cart[d.id] || 0}
                    onAdd={() => updateCart(d, 1)}
                    onRemove={() => updateCart(d, -1)}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        <section className="delivery-checkout" id="pedido-recoger">
          <div className="delivery-checkout__head">
            <div>
              <span className="eyebrow">Finalizar pedido</span>
              <h2 className="h-section" style={{ marginTop: 8 }}>Revisa y paga</h2>
              <p className="muted pretty" style={{ marginTop: 10, maxWidth: '54ch' }}>
                Cocina recibe el pedido cuando Redsys confirma el pago. Tú solo vienes, recoges y listo.
              </p>
            </div>
            <div className="delivery-trust-card">
              <strong>Pago protegido</strong>
              <span>Importe recalculado en servidor · Confirmación Redsys · Aviso a cocina</span>
            </div>
          </div>

          <div className="delivery-order">
            <div className="delivery-cart">
              <div className="delivery-card-head">
                <div>
                  <span className="eyebrow">Carrito</span>
                  <strong>{cartCount > 0 ? `${cartCount} productos` : "Vacío"}</strong>
                </div>
                {cartLines.length > 0 && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={clearCart}>Vaciar</button>
                )}
              </div>
              {cartLines.length === 0 ? (
                <div className="delivery-empty-cart">
                  <p>Añade platos de la carta para preparar el pedido.</p>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={scrollToMenuStart}>Ver platos</button>
                </div>
              ) : (
                <React.Fragment>
                  {cartLines.map(({ dish, qty }) => (
                    <div className="delivery-cart__line" key={dish.id}>
                      <div>
                        <strong>{dish.name}</strong>
                        <span>{qty} x {formatCartaPrice(dish.price)}</span>
                        <em>{formatCartaPrice(dish.price * qty)}</em>
                      </div>
                      <div className="delivery-cart__qty">
                        <button type="button" onClick={() => updateCart(dish, -1)} aria-label={`Quitar ${dish.name}`}>−</button>
                        <span>{qty}</span>
                        <button type="button" onClick={() => updateCart(dish, 1)} aria-label={`Añadir ${dish.name}`}>+</button>
                      </div>
                    </div>
                  ))}
                  <div className="delivery-cart__total">
                    <span>Total a pagar</span>
                    <strong>{formatCartaPrice(cartTotal)}</strong>
                  </div>
                </React.Fragment>
              )}
            </div>

            <form className="delivery-form" onSubmit={sendOrder}>
              <div className="delivery-card-head delivery-form__full">
                <div>
                  <span className="eyebrow">Tus datos</span>
                  <strong>Solo lo necesario</strong>
                </div>
                <span className="delivery-secure-pill">🔒 Redsys</span>
              </div>
              <label>
                Nombre
                <input value={orderName} onChange={(e) => setOrderName(e.target.value)} placeholder="Tu nombre" autoComplete="name" />
              </label>
              <label>
                Teléfono
                <input value={orderPhone} onChange={(e) => setOrderPhone(e.target.value)} placeholder="600 000 000" type="tel" inputMode="tel" autoComplete="tel" />
              </label>
              <fieldset className="delivery-time delivery-form__full">
                <legend>Hora de recogida</legend>
                <div>
                  {PICKUP_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={pickupTime === option ? "is-active" : ""}
                      onClick={() => setPickupTime(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="delivery-form__full">
                Notas para cocina
                <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Sin cebolla, alérgenos, cambio de horario..." />
              </label>
              <div className={`delivery-checkout-hint ${checkoutHintTone} delivery-form__full`}>{checkoutHint}</div>
              {paymentStatus.message && (
                <div className={`delivery-payment-status is-${paymentStatus.type} delivery-form__full`} role="status">
                  {paymentStatus.message}
                </div>
              )}
              <button className="btn btn-primary btn-lg btn-block delivery-form__full" type="submit" disabled={!canPayOrder} style={{ opacity: canPayOrder ? 1 : 0.5 }}>
                {payButtonLabel}
              </button>
            </form>
          </div>
        </section>
      </div>

      {cartCount > 0 && (
        <div className="delivery-sticky-cart">
          <button type="button" onClick={scrollToDeliveryCheckout} aria-label={`Finalizar pedido de ${formatCartaPrice(cartTotal)}`}>
            <span>{cartCount} {cartCount === 1 ? "producto" : "productos"}</span>
            <strong>{formatCartaPrice(cartTotal)}</strong>
            <small>Finalizar pedido</small>
          </button>
        </div>
      )}
    </main>
  );
}

function DishCard({ dish, excluded, quantity = 0, onAdd, onRemove }) {
  const hasExcluded = dish.allergens.some((a) => excluded.includes(a));
  return (
    <article className={"dish-card " + (quantity > 0 ? "is-in-cart" : "")} style={hasExcluded ? { opacity: 0.4 } : {}}>
      <div className="dish-card__media">
        <img src={dish.img} alt={dish.name} loading="lazy"/>
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
          <span className="dish-card__price">{formatCartaPrice(dish.price)}</span>
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
              <button type="button" onClick={onAdd} aria-label={`Añadir ${dish.name}`}>+</button>
            </div>
          ) : (
            <button className="btn btn-secondary btn-sm" type="button" onClick={onAdd}>Añadir</button>
          )}
        </div>
      </div>
    </article>
  );
}

window.Carta = Carta;
window.DishCard = DishCard;
