// Bolera Contrastes — Página Home
const { useEffect: useEffectH, useState: useStateH } = React;

function Home({ onNav, tweaks }) {
  const I = window.BC_INFO;
  const concepts = window.BC_CONCEPTS;
  const events = window.BC_EVENTS;
  const status = useNowOpen();

  return (
    <main id="contenido" data-screen-label="Home">
      {/* ===== HERO ===== */}
      <section className="hero" data-hero={tweaks.heroStyle}>
        <div className="bc-container">
          <div className="hero__inner">
            <div>
              <span className="eyebrow">Onda · Castelló · desde 1998</span>
              <h1 className="hero__title" style={{ marginTop: 16 }}>
                Cinco sitios<br/>
                <em>en uno</em>.<br/>
                A dos pasos<br/>
                de casa.
              </h1>
              <p className="hero__sub pretty">
                Pub, cafetería, cervecería, apuestas 1x2 y cocina temática. Desde las 8 de la mañana hasta tarde — abierto cuando lo necesitas.
              </p>
              <div className="hero__ctas">
                <button className="btn btn-primary btn-lg" onClick={() => onNav('reservar')}>
                  Reservar por WhatsApp
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button className="btn btn-secondary btn-lg" onClick={() => onNav('carta')}>
                  Ver la carta
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                <StatusPill />
                <span className="chip" style={{ background: 'transparent' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12Z" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.6"/></svg>
                  {I.address}
                </span>
              </div>
            </div>
            <div className="hero__media">
              {tweaks.heroStyle === 'photo' && (
                <img
                  src="https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=1200&q=70"
                  alt="Interior de Bolera Contrastes"
                />
              )}
              {tweaks.heroStyle === 'mosaic' && (
                <React.Fragment>
                  <img src="https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=600&q=70" alt="Interior"/>
                  <img src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=70" alt="Hamburguesa"/>
                  <img src="https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&q=70" alt="Café"/>
                  <img src="https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&q=70" alt="Cerveza"/>
                </React.Fragment>
              )}
              {tweaks.heroStyle !== 'solid' && (
                <span className="hero__badge">
                  <span className="status-dot" style={{ color: 'var(--accent)' }}></span>
                  Hoy: paella valenciana
                </span>
              )}
            </div>
          </div>

          {/* ===== INFO STRIP ===== */}
          <div className="info-strip">
            <div className="info-strip__cell">
              <span className="info-strip__label">Ahora</span>
              <span className="info-strip__value">{status.isOpen ? "Abierto" : "Cerrado"}</span>
              <span className="info-strip__cta">{status.closesAt || "Vuelve mañana"}</span>
            </div>
            <div className="info-strip__cell">
              <span className="info-strip__label">Dónde</span>
              <span className="info-strip__value">{I.address.replace('Carrer del ', '')}</span>
              <a className="info-strip__cta" href={I.mapsUrl}>Cómo llegar →</a>
            </div>
            <div className="info-strip__cell">
              <span className="info-strip__label">Teléfono</span>
              <span className="info-strip__value">{I.phonePretty}</span>
              <a className="info-strip__cta" href={`tel:${I.phone}`}>Llamar →</a>
            </div>
            <div className="info-strip__cell">
              <span className="info-strip__label">Reservar</span>
              <span className="info-strip__value">WhatsApp</span>
              <button className="info-strip__cta" onClick={() => onNav('reservar')}>Reservar mesa →</button>
            </div>
          </div>
        </div>
      </section>

      <Marquee />

      {/* ===== PLAN DE FIDELIZACION ===== */}
      <section className="section bc-container">
        <div className="points-home">
          <div>
            <span className="eyebrow">Nuevo piloto</span>
            <h2 className="h-section balance" style={{ marginTop: 8 }}>
              Recarga saldo y paga con Plan de Fidelización.
            </h2>
            <p className="muted pretty" style={{ maxWidth: '52ch', marginTop: 12 }}>
              Crea tu cuenta, carga saldo con ofertas y paga en barra con QR o teléfono. Pensado para clientes habituales y promociones del local.
            </p>
          </div>
          <div className="points-home__offer">
            <span>Oferta de recarga</span>
            <strong>30 € → 32 duros</strong>
            <button className="btn btn-primary" onClick={() => onNav('duros')}>Ver fidelización</button>
          </div>
        </div>
      </section>

      {/* ===== 5 CONCEPTOS ===== */}
      <section className="section bc-container">
        <div className="section__head">
          <div>
            <span className="eyebrow">Qué somos</span>
            <h2 className="h-section balance" style={{ marginTop: 8 }}>
              Cinco conceptos, una sola barra.
            </h2>
          </div>
          <p className="muted pretty" style={{ maxWidth: '36ch', margin: 0 }}>
            Pasamos del café con leche del desayuno a la caña con tapas, del partido en directo a la paella del domingo — todo bajo el mismo techo.
          </p>
        </div>
        <div className="concept-grid">
          {concepts.map((c, i) => (
            <div key={c.id} className="concept-card">
              <span className="concept-card__num">0{i + 1}</span>
              <span className="concept-card__name">{c.name}</span>
              <p className="concept-card__blurb pretty">{c.blurb}</p>
              <span className="concept-card__when">{c.when}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== EVENTOS ===== */}
      <section className="section bc-container" id="eventos">
        <div className="section__head">
          <div>
            <span className="eyebrow">Próximamente</span>
            <h2 className="h-section balance" style={{ marginTop: 8 }}>
              Esta semana en Contrastes.
            </h2>
          </div>
          <button className="btn btn-secondary" onClick={() => onNav('eventos')}>
            Ver agenda completa
          </button>
        </div>
        <div className="event-grid">
          {events.slice(0, 4).map((e) => (
            <article key={e.id} className="event-card">
              <div className="event-card__media">
                <img src={e.img} alt={e.title} loading="lazy"/>
              </div>
              <div className="event-card__body">
                <span className="event-card__date">{e.date} · {e.time}</span>
                <h3 className="event-card__title">{e.title}</h3>
                <p className="event-card__sub muted">{e.subtitle}</p>
                <div className="event-card__meta">
                  <span>{e.spots}</span>
                  <span>·</span>
                  <span>{e.price}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ===== VISITANOS ===== */}
      <section className="section bc-container" id="contacto" data-screen-label="Visítanos">
        <div className="section__head">
          <div>
            <span className="eyebrow">Cómo encontrarnos</span>
            <h2 className="h-section balance" style={{ marginTop: 8 }}>
              En pleno centro de Onda.
            </h2>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'var(--s-5)' }} className="visit-grid">
          <MapCard />
          <div className="card" style={{ padding: 'var(--s-5)' }}>
            <div style={{ marginBottom: 20 }}>
              <span className="eyebrow">Dirección</span>
              <p style={{ margin: '6px 0 0', fontSize: 18, fontFamily: 'var(--font-display)' }}>
                {I.address}<br/>
                <span className="muted" style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>{I.city}</span>
              </p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <span className="eyebrow">Horario</span>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                {I.hours.map((h, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 500 }}>{h.days}</span>
                    <span className="muted">
                      {h.closed ? "Cerrado" : `${h.open} – ${h.close}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn btn-primary btn-sm" href={`tel:${I.phone}`}>Llamar</a>
              <a className="btn btn-secondary btn-sm" href={I.mapsUrl}>Cómo llegar</a>
              <a className="btn btn-secondary btn-sm" href={I.facebookUrl}>Facebook</a>
            </div>
          </div>
        </div>
        <style>{`
          @media (max-width: 880px) {
            .visit-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>
    </main>
  );
}

window.Home = Home;
