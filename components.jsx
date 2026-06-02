// Bolera Contrastes — componentes compartidos
// Header, Footer, Marquee, Status pill, Allergen chip
const { useState, useEffect, useMemo, useRef } = React;

// ===== Computar estado abierto/cerrado en función del día y hora =====
function useNowOpen() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(i);
  }, []);
  // domingo cerrado, lun 8-23, mar-jue 8-23, vie-sab 8-1
  const now = new Date();
  const day = now.getDay(); // 0 = dom
  const minutes = now.getHours() * 60 + now.getMinutes();
  let openMin, closeMin;
  let openLabel = "";
  if (day === 0) {
    return { isOpen: false, label: "Cerrado · Domingo", closesAt: null };
  } else if (day === 1) {
    openMin = 8 * 60; closeMin = 23 * 60; openLabel = "Hasta las 23:00";
  } else if (day >= 2 && day <= 4) {
    openMin = 8 * 60; closeMin = 23 * 60; openLabel = "Hasta las 23:00";
  } else { // vie sab
    openMin = 8 * 60; closeMin = 25 * 60; openLabel = "Hasta la 1:00";
  }
  const isOpen = minutes >= openMin && minutes < closeMin;
  return {
    isOpen,
    label: isOpen ? `Abierto · ${openLabel}` : `Cerrado · Abre a las ${Math.floor(openMin/60)}:00`,
    closesAt: openLabel,
  };
}

// ===== Status pill =====
function StatusPill() {
  const s = useNowOpen();
  return (
    <span className={"status-pill " + (s.isOpen ? "" : "is-closed")}>
      <span className="status-dot"></span>
      {s.label}
    </span>
  );
}

// ===== Logo mark =====
function Logo({ size = 50 }) {
  return (
    <span className="bc-logo">
      <span
        className="bc-logo__mark"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        C
      </span>
      <span className="bc-logo__type">
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', color: 'var(--ink-soft)' }}>bolera</span>
        <strong>Contrastes</strong>
      </span>
    </span>
  );
}

// ===== Header =====
function Header({ page, onNav }) {
  return (
    <header className="bc-header" data-screen-label="Header">
      <div className="bc-container bc-header__inner">
        <button onClick={() => onNav('home')} aria-label="Inicio">
          <Logo />
        </button>
        <nav className="bc-nav">
          <button
            className={"bc-nav__link is-text " + (page === 'carta' ? 'is-active' : '')}
            onClick={() => onNav('carta')}
          >
            Carta
          </button>
          <button
            className={"bc-nav__link is-text " + (page === 'eventos' ? 'is-active' : '')}
            onClick={() => onNav('eventos')}
          >
            Eventos
          </button>
          <button
            className={"bc-nav__link is-text " + (page === 'contacto' ? 'is-active' : '')}
            onClick={() => onNav('contacto')}
          >
            Visítanos
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onNav('reservar')}
            style={{ marginLeft: 8 }}
          >
            Reservar
          </button>
        </nav>
      </div>
    </header>
  );
}

// ===== Marquee =====
function Marquee() {
  const items = [
    "Cocina casera",
    "Pub & cervecería",
    "Apuestas 1x2",
    "Café de especialidad",
    "Paella los domingos",
    "Para compartir",
  ];
  const rendered = [...items, ...items, ...items];
  return (
    <div className="marquee">
      <div className="marquee__track">
        {rendered.map((item, i) => (
          <React.Fragment key={i}>
            <span className="marquee__item">{item}</span>
            <span className="marquee__item marquee__dot">·</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ===== Allergen chip =====
function AllergenChip({ code, mode = "plain" }) {
  const a = window.BC_ALLERGENS[code];
  if (!a) return null;
  return (
    <span
      className={"chip-allergen " + (mode === "warning" ? "is-warning" : "")}
      title={a.label}
      aria-label={a.label}
    >
      {a.short}
    </span>
  );
}

// ===== Map placeholder (mapa estilizado) =====
function MapCard() {
  return (
    <div className="map-card" role="img" aria-label="Mapa de Onda">
      <svg viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="400" height="250" fill="url(#grid)"/>
        {/* "carreteras" estilizadas */}
        <path d="M 0 130 Q 100 110, 200 140 T 400 120" stroke="rgba(0,0,0,0.18)" strokeWidth="3" fill="none"/>
        <path d="M 80 0 L 110 250" stroke="rgba(0,0,0,0.12)" strokeWidth="2" fill="none"/>
        <path d="M 240 0 L 260 250" stroke="rgba(0,0,0,0.12)" strokeWidth="2" fill="none"/>
        <path d="M 0 60 L 400 70" stroke="rgba(0,0,0,0.08)" strokeWidth="1.5" fill="none"/>
        <path d="M 0 200 L 400 195" stroke="rgba(0,0,0,0.08)" strokeWidth="1.5" fill="none"/>
        {/* manzanas */}
        <rect x="120" y="80" width="60" height="40" fill="rgba(0,0,0,0.04)" rx="2"/>
        <rect x="200" y="80" width="40" height="40" fill="rgba(0,0,0,0.04)" rx="2"/>
        <rect x="120" y="150" width="50" height="40" fill="rgba(0,0,0,0.04)" rx="2"/>
        <rect x="190" y="150" width="50" height="40" fill="rgba(0,0,0,0.04)" rx="2"/>
        {/* pin */}
        <g transform="translate(200 130)">
          <circle r="22" fill="var(--accent)" opacity="0.25"/>
          <circle r="14" fill="var(--accent)" opacity="0.45"/>
          <circle r="8" fill="var(--accent)"/>
          <circle r="3" fill="white"/>
        </g>
      </svg>
    </div>
  );
}

// ===== Footer =====
function Footer({ onNav }) {
  const I = window.BC_INFO;
  return (
    <footer className="bc-footer" data-screen-label="Footer">
      <div className="bc-container">
        <div className="bc-footer__grid">
          <div>
            <Logo />
            <p className="muted pretty" style={{ marginTop: 16, maxWidth: '28ch', fontSize: 14 }}>
              {I.tagline}. Un sitio de barrio para cualquier momento del día.
            </p>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Carta</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
              <li><button onClick={() => onNav('carta')}>Desayunos</button></li>
              <li><button onClick={() => onNav('carta')}>Para picar</button></li>
              <li><button onClick={() => onNav('carta')}>Hamburguesas</button></li>
              <li><button onClick={() => onNav('carta')}>Cócteles</button></li>
            </ul>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Visítanos</div>
            <p style={{ fontSize: 14, margin: 0 }}>
              {I.address}<br/>
              {I.city}<br/>
              <a href={I.mapsUrl}>Cómo llegar →</a>
            </p>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Contacto</div>
            <p style={{ fontSize: 14, margin: 0 }}>
              <a href={`tel:${I.phone}`}>{I.phonePretty}</a><br/>
              <a href={I.facebookUrl}>Facebook</a><br/>
              <button onClick={() => onNav('reservar')}>Reservar mesa</button>
            </p>
          </div>
        </div>
        <div className="bc-footer__bottom">
          <span>© 2026 Bolera Contrastes</span>
          <span style={{ display: 'flex', gap: 16 }}>
            <a href="#">Privacidad</a>
            <a href="#">Cookies</a>
            <a href="#">Aviso legal</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

// ===== Mobile fixed CTA =====
function MobileCTA({ onNav }) {
  return (
    <div className="mobile-cta">
      <button className="btn btn-secondary btn-sm" onClick={() => onNav('carta')}>Carta</button>
      <a className="btn btn-primary btn-sm" href={`tel:${window.BC_INFO.phone}`}>Llamar</a>
      <button className="btn btn-whatsapp btn-sm" onClick={() => onNav('reservar')}>
        WhatsApp
      </button>
    </div>
  );
}

// Export to window
Object.assign(window, {
  useNowOpen, StatusPill, Logo, Header, Marquee, AllergenChip, MapCard, Footer, MobileCTA
});
