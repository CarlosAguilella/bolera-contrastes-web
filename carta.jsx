// Bolera Contrastes — Carta
const { useState: useStateC, useMemo: useMemoC, useEffect: useEffectC } = React;

function Carta({ onNav, tweaks }) {
  const ALL = window.BC_MENU;
  const CATS = window.BC_CATEGORIES;
  const ALLERGENS = window.BC_ALLERGENS;

  const [query, setQuery] = useStateC("");
  const [cat, setCat] = useStateC("all");
  const [excluded, setExcluded] = useStateC([]); // alérgenos a excluir
  const [vegOnly, setVegOnly] = useStateC(false);
  const [showAllergens, setShowAllergens] = useStateC(false);

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

  return (
    <main data-screen-label="Carta">
      {/* HERO compacto de carta */}
      <section style={{ padding: 'var(--s-7) 0 var(--s-5)' }} className="bc-container">
        <span className="eyebrow">Carta</span>
        <h1 className="h-hero" style={{ marginTop: 10 }}>
          Para todo el<br/><em>día</em>.
        </h1>
        <p className="muted pretty" style={{ maxWidth: '52ch', marginTop: 14, fontSize: 17 }}>
          Cocina casera y bocados rápidos. Indícanos tus alérgenos y te filtramos la carta entera.
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
                  <DishCard key={d.id} dish={d} excluded={excluded}/>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}

function DishCard({ dish, excluded }) {
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
          <span className="dish-card__price">{dish.price.toFixed(2).replace('.', ',')} €</span>
        </div>
        <p className="dish-card__desc pretty">{dish.desc}</p>
        {dish.allergens.length > 0 && (
          <div className="dish-card__allergens">
            {dish.allergens.map((code) => (
              <AllergenChip key={code} code={code} mode={excluded.includes(code) ? "warning" : "plain"}/>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

window.Carta = Carta;
window.DishCard = DishCard;
