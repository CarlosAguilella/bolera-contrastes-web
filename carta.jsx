// Bolera Contrastes — Carta
const { useState: useStateC, useMemo: useMemoC, useEffect: useEffectC } = React;

function formatCartaPrice(value) {
  return `${Number(value).toFixed(2).replace('.', ',')} €`;
}

function Carta({ onNav, tweaks }) {
  const I = window.BC_INFO;
  const ALL = window.BC_MENU;
  const CATS = window.BC_CATEGORIES;
  const ALLERGENS = window.BC_ALLERGENS;

  const [query, setQuery] = useStateC("");
  const [cat, setCat] = useStateC("all");
  const [excluded, setExcluded] = useStateC([]); // alérgenos a excluir
  const [vegOnly, setVegOnly] = useStateC(false);
  const [showAllergens, setShowAllergens] = useStateC(false);
  const [cart, setCart] = useStateC({});
  const [orderName, setOrderName] = useStateC("");
  const [orderPhone, setOrderPhone] = useStateC("");
  const [pickupTime, setPickupTime] = useStateC("Lo antes posible");
  const [orderNotes, setOrderNotes] = useStateC("");

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

  const clearCart = () => setCart({});

  const orderMessage = useMemoC(() => {
    const lines = [
      "Hola Bolera Contrastes, quiero hacer un pedido para recoger:",
      "",
      `Nombre: ${orderName || "—"}`,
      `Teléfono: ${orderPhone || "—"}`,
      `Recogida: ${pickupTime}`,
      "",
      "Pedido:",
      ...cartLines.map((line) => {
        const subtotal = line.dish.price * line.qty;
        return `• ${line.qty} x ${line.dish.name} — ${formatCartaPrice(subtotal)}`;
      }),
      "",
      `Total aproximado: ${formatCartaPrice(cartTotal)}`,
    ];
    if (orderNotes.trim()) lines.push("", `Notas: ${orderNotes.trim()}`);
    lines.push("", "¿Me lo confirmáis? Gracias.");
    return lines.join("\n");
  }, [cartLines, cartTotal, orderName, orderPhone, pickupTime, orderNotes]);

  const canSendOrder = cartCount > 0 && orderName.trim().length >= 2 && orderPhone.trim().length >= 6;

  const sendOrder = (event) => {
    event.preventDefault();
    if (!canSendOrder) return;
    const num = I.whatsapp.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(orderMessage)}`, "_blank");
  };

  return (
    <main data-screen-label="Carta">
      {/* HERO compacto de carta */}
      <section style={{ padding: 'var(--s-7) 0 var(--s-5)' }} className="bc-container">
        <span className="eyebrow">Pedido online · Recogida en local</span>
        <h1 className="h-hero" style={{ marginTop: 10 }}>
          Pide online<br/><em>y recoge</em>.
        </h1>
        <p className="muted pretty" style={{ maxWidth: '52ch', marginTop: 14, fontSize: 17 }}>
          Añade platos al carrito, dinos cuándo pasas a recogerlo y te abrimos WhatsApp con el pedido listo para enviar.
        </p>
      </section>

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
              onClick={() => document.getElementById("pedido-recoger")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              Pedido {cartCount > 0 ? `(${cartCount}) · ${formatCartaPrice(cartTotal)}` : ""}
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
      <div className="bc-container" style={{ paddingTop: 'var(--s-3)', paddingBottom: 'var(--s-8)' }}>
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
          <div>
            <span className="eyebrow">Pedido para recoger</span>
            <h2 className="h-section" style={{ marginTop: 8 }}>Tu pedido</h2>
            <p className="muted pretty" style={{ marginTop: 10, maxWidth: '52ch' }}>
              El pedido se envía por WhatsApp para que el local lo confirme. El pago se puede gestionar en barra o con el método que indiquéis al cliente.
            </p>
          </div>

          <div className="delivery-order">
            <div className="delivery-cart">
              {cartLines.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>Añade platos de la carta para preparar el pedido.</p>
              ) : (
                <React.Fragment>
                  {cartLines.map(({ dish, qty }) => (
                    <div className="delivery-cart__line" key={dish.id}>
                      <div>
                        <strong>{dish.name}</strong>
                        <span>{qty} x {formatCartaPrice(dish.price)}</span>
                      </div>
                      <div className="delivery-cart__qty">
                        <button type="button" onClick={() => updateCart(dish, -1)} aria-label={`Quitar ${dish.name}`}>−</button>
                        <span>{qty}</span>
                        <button type="button" onClick={() => updateCart(dish, 1)} aria-label={`Añadir ${dish.name}`}>+</button>
                      </div>
                    </div>
                  ))}
                  <div className="delivery-cart__total">
                    <span>Total aproximado</span>
                    <strong>{formatCartaPrice(cartTotal)}</strong>
                  </div>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={clearCart}>Vaciar pedido</button>
                </React.Fragment>
              )}
            </div>

            <form className="delivery-form" onSubmit={sendOrder}>
              <label>
                Nombre
                <input value={orderName} onChange={(e) => setOrderName(e.target.value)} placeholder="Tu nombre" />
              </label>
              <label>
                Teléfono
                <input value={orderPhone} onChange={(e) => setOrderPhone(e.target.value)} placeholder="600 000 000" />
              </label>
              <label>
                Hora de recogida
                <select value={pickupTime} onChange={(e) => setPickupTime(e.target.value)}>
                  <option>Lo antes posible</option>
                  <option>En 20 minutos</option>
                  <option>En 30 minutos</option>
                  <option>En 45 minutos</option>
                  <option>En 1 hora</option>
                </select>
              </label>
              <label className="delivery-form__full">
                Notas
                <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Sin cebolla, alérgenos, cambio de horario..." />
              </label>
              <button className="btn btn-whatsapp btn-lg btn-block delivery-form__full" type="submit" disabled={!canSendOrder} style={{ opacity: canSendOrder ? 1 : 0.5 }}>
                Enviar pedido por WhatsApp
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function DishCard({ dish, excluded, quantity = 0, onAdd, onRemove }) {
  const hasExcluded = dish.allergens.some((a) => excluded.includes(a));
  return (
    <article className="dish-card" style={hasExcluded ? { opacity: 0.4 } : {}}>
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
