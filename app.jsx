// Bolera Contrastes — App principal + Tweaks
const { useState: useStateA, useEffect: useEffectA } = React;

// ===== Presets de paleta =====
const PALETTES = {
  tostado: {
    label: "Tostado",
    swatch: ["#C8552B", "#F5EFE6", "#1B1814"],
    light: {
      "--bg": "#F5EFE6", "--bg-elev": "#FFFFFF", "--bg-sunken": "#ECE3D4",
      "--ink": "#1B1814", "--ink-soft": "#5B554E",
      "--line": "rgba(27, 24, 20, 0.08)", "--line-strong": "rgba(27, 24, 20, 0.18)",
      "--accent": "#C8552B", "--accent-ink": "#FFF6EF", "--accent-soft": "#F3DCC9",
    },
    dark: {
      "--bg": "#15110D", "--bg-elev": "#1F1A14", "--bg-sunken": "#0D0907",
      "--ink": "#F4EBDD", "--ink-soft": "#A89B89",
      "--line": "rgba(244, 235, 221, 0.10)", "--line-strong": "rgba(244, 235, 221, 0.22)",
      "--accent": "#E07347", "--accent-ink": "#15110D", "--accent-soft": "#3A2418",
    },
  },
  olivo: {
    label: "Olivo",
    swatch: ["#6B7A3A", "#F2F1EA", "#1F2419"],
    light: {
      "--bg": "#F2F1EA", "--bg-elev": "#FBFAF4", "--bg-sunken": "#E5E4DA",
      "--ink": "#1F2419", "--ink-soft": "#5D6155",
      "--line": "rgba(31, 36, 25, 0.10)", "--line-strong": "rgba(31, 36, 25, 0.20)",
      "--accent": "#6B7A3A", "--accent-ink": "#FAFAF0", "--accent-soft": "#E3E5C5",
    },
    dark: {
      "--bg": "#141611", "--bg-elev": "#1D1F18", "--bg-sunken": "#0C0E0A",
      "--ink": "#EEEEE0", "--ink-soft": "#9DA088",
      "--line": "rgba(238, 238, 224, 0.10)", "--line-strong": "rgba(238, 238, 224, 0.22)",
      "--accent": "#A8B86A", "--accent-ink": "#141611", "--accent-soft": "#2A2F1A",
    },
  },
  tinta: {
    label: "Tinta",
    swatch: ["#B43E2A", "#F6F2EB", "#14110E"],
    light: {
      "--bg": "#F6F2EB", "--bg-elev": "#FFFCF6", "--bg-sunken": "#EAE3D5",
      "--ink": "#14110E", "--ink-soft": "#56504A",
      "--line": "rgba(20, 17, 14, 0.10)", "--line-strong": "rgba(20, 17, 14, 0.22)",
      "--accent": "#B43E2A", "--accent-ink": "#FFF6EF", "--accent-soft": "#F1D6CB",
    },
    dark: {
      "--bg": "#0E0C0A", "--bg-elev": "#181513", "--bg-sunken": "#070605",
      "--ink": "#F6EEDF", "--ink-soft": "#9A8E7C",
      "--line": "rgba(246, 238, 223, 0.10)", "--line-strong": "rgba(246, 238, 223, 0.22)",
      "--accent": "#E16B4E", "--accent-ink": "#0E0C0A", "--accent-soft": "#36211A",
    },
  },
};

// ===== Pairings tipográficos =====
const FONTS = {
  editorial: {
    label: "Editorial",
    display: '"Instrument Serif", Georgia, serif',
    body: '"Geist", system-ui, sans-serif',
    google: "Instrument+Serif:ital@0;1|Geist:wght@300..700",
  },
  moderno: {
    label: "Moderno",
    display: '"Bricolage Grotesque", system-ui, sans-serif',
    body: '"Bricolage Grotesque", system-ui, sans-serif',
    google: "Bricolage+Grotesque:opsz,wght@12..96,300..700",
  },
  clasico: {
    label: "Clásico",
    display: '"DM Serif Display", Georgia, serif',
    body: '"DM Sans", system-ui, sans-serif',
    google: "DM+Serif+Display:ital@0;1|DM+Sans:opsz,wght@9..40,300..700",
  },
};

// Aplicar tokens a :root
function applyTokens(palette, mode, fontKey) {
  const root = document.documentElement;
  const p = PALETTES[palette] || PALETTES.tostado;
  const tokens = mode === "dark" ? p.dark : p.light;
  Object.entries(tokens).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute("data-mode", mode);
  const f = FONTS[fontKey] || FONTS.editorial;
  root.style.setProperty("--font-display", f.display);
  root.style.setProperty("--font-body", f.body);
}

// Mapeo palette-array -> palette-key (para TweakColor que emite el array)
function paletteFromSwatch(swatch) {
  if (!Array.isArray(swatch)) return swatch;
  for (const [k, v] of Object.entries(PALETTES)) {
    if (v.swatch[0].toLowerCase() === String(swatch[0]).toLowerCase()) return k;
  }
  return "tostado";
}

// ===== Defaults =====
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "tostado",
  "mode": "light",
  "font": "editorial",
  "density": "cozy",
  "photos": true,
  "heroStyle": "photo"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = useStateA(window.BC_INITIAL_PAGE || "home");

  // Aplicar tokens cuando cambian tweaks
  useEffectA(() => {
    applyTokens(t.palette, t.mode, t.font);
  }, [t.palette, t.mode, t.font]);

  // Navegación + scroll arriba
  const handleNav = (p) => {
    setPage(p);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  return (
    <React.Fragment>
      <Header page={page} onNav={handleNav} />
      {page === 'home' && <Home onNav={handleNav} tweaks={t} />}
      {page === 'carta' && <Carta onNav={handleNav} tweaks={t} />}
      {page === 'reservar' && <Reservar onNav={handleNav} />}
      {page === 'eventos' && <Eventos onNav={handleNav} />}
      {page === 'puntos' && (
        <Puntos
          onNav={handleNav}
          initialView={window.BC_POINTS_INITIAL_VIEW || "cliente"}
          adminOnly={Boolean(window.BC_POINTS_ADMIN_ONLY)}
        />
      )}
      {page === 'contacto' && <Home onNav={handleNav} tweaks={t} />}
      <Footer onNav={handleNav} />
      <MobileCTA onNav={handleNav} />

      {/* ===== TWEAKS PANEL ===== */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Dirección visual" />
        <TweakColor
          label="Paleta"
          value={PALETTES[t.palette]?.swatch || PALETTES.tostado.swatch}
          options={Object.values(PALETTES).map((p) => p.swatch)}
          onChange={(v) => setTweak('palette', paletteFromSwatch(v))}
        />
        <TweakRadio
          label="Modo"
          value={t.mode}
          options={[
            { value: "light", label: "Día" },
            { value: "dark", label: "Noche" },
          ]}
          onChange={(v) => setTweak('mode', v)}
        />
        <TweakRadio
          label="Tipo"
          value={t.font}
          options={Object.entries(FONTS).map(([k, v]) => ({ value: k, label: v.label }))}
          onChange={(v) => setTweak('font', v)}
        />

        <TweakSection label="Carta" />
        <TweakRadio
          label="Densidad"
          value={t.density}
          options={[
            { value: "compact", label: "Compacta" },
            { value: "cozy",    label: "Cómoda" },
            { value: "airy",    label: "Espaciosa" },
          ]}
          onChange={(v) => setTweak('density', v)}
        />
        <TweakToggle
          label="Mostrar fotos"
          value={t.photos}
          onChange={(v) => setTweak('photos', v)}
        />

        <TweakSection label="Home" />
        <TweakRadio
          label="Hero"
          value={t.heroStyle}
          options={[
            { value: "photo",  label: "Foto" },
            { value: "mosaic", label: "Mosaico" },
            { value: "solid",  label: "Color" },
          ]}
          onChange={(v) => setTweak('heroStyle', v)}
        />

        <TweakSection label="Ir a" />
        <TweakButton label="Home" onClick={() => handleNav('home')} />
        <TweakButton label="Carta" onClick={() => handleNav('carta')} />
        <TweakButton label="Reservar" onClick={() => handleNav('reservar')} />
        <TweakButton label="Eventos" onClick={() => handleNav('eventos')} />
        <TweakButton label="Puntos" onClick={() => handleNav('puntos')} />
      </TweaksPanel>
    </React.Fragment>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
