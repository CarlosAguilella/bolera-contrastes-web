// Bolera Contrastes — App principal + Tweaks
const { useState: useStateA, useEffect: useEffectA } = React;

// ===== Presets de paleta =====
const PALETTES = {
  restaurante: {
    label: "Monocromo",
    swatch: ["#111111", "#F7F7F5", "#666666"],
    light: {
      "--bg": "#F7F7F5", "--bg-elev": "#FFFFFF", "--bg-sunken": "#ECECEC",
      "--ink": "#111111", "--ink-soft": "#666666",
      "--line": "rgba(17, 17, 17, 0.10)", "--line-strong": "rgba(17, 17, 17, 0.22)",
      "--accent": "#111111", "--accent-ink": "#FFFFFF", "--accent-soft": "#E8E8E8",
      "--positive": "#2F2F2F", "--warning": "#777777",
    },
    dark: {
      "--bg": "#090909", "--bg-elev": "#151515", "--bg-sunken": "#000000",
      "--ink": "#F5F5F5", "--ink-soft": "#B8B8B8",
      "--line": "rgba(245, 245, 245, 0.12)", "--line-strong": "rgba(245, 245, 245, 0.24)",
      "--accent": "#F5F5F5", "--accent-ink": "#090909", "--accent-soft": "#2B2B2B",
      "--positive": "#D0D0D0", "--warning": "#A8A8A8",
    },
  },
  tostado: {
    label: "Gris cálido",
    swatch: ["#2B2B2B", "#F4F2EE", "#777777"],
    light: {
      "--bg": "#F4F2EE", "--bg-elev": "#FFFFFF", "--bg-sunken": "#E7E5E1",
      "--ink": "#181818", "--ink-soft": "#696969",
      "--line": "rgba(24, 24, 24, 0.10)", "--line-strong": "rgba(24, 24, 24, 0.22)",
      "--accent": "#2B2B2B", "--accent-ink": "#FFFFFF", "--accent-soft": "#E1E1E1",
      "--positive": "#3C3C3C", "--warning": "#787878",
    },
    dark: {
      "--bg": "#101010", "--bg-elev": "#1A1A1A", "--bg-sunken": "#050505",
      "--ink": "#F4F4F4", "--ink-soft": "#B0B0B0",
      "--line": "rgba(244, 244, 244, 0.12)", "--line-strong": "rgba(244, 244, 244, 0.24)",
      "--accent": "#EDEDED", "--accent-ink": "#101010", "--accent-soft": "#303030",
      "--positive": "#CFCFCF", "--warning": "#A0A0A0",
    },
  },
  olivo: {
    label: "Gris medio",
    swatch: ["#4B4B4B", "#F3F3F3", "#1F1F1F"],
    light: {
      "--bg": "#F3F3F3", "--bg-elev": "#FFFFFF", "--bg-sunken": "#E2E2E2",
      "--ink": "#1F1F1F", "--ink-soft": "#5F5F5F",
      "--line": "rgba(31, 31, 31, 0.10)", "--line-strong": "rgba(31, 31, 31, 0.22)",
      "--accent": "#4B4B4B", "--accent-ink": "#FFFFFF", "--accent-soft": "#DCDCDC",
      "--positive": "#444444", "--warning": "#808080",
    },
    dark: {
      "--bg": "#111111", "--bg-elev": "#1E1E1E", "--bg-sunken": "#070707",
      "--ink": "#EFEFEF", "--ink-soft": "#AFAFAF",
      "--line": "rgba(239, 239, 239, 0.12)", "--line-strong": "rgba(239, 239, 239, 0.24)",
      "--accent": "#D8D8D8", "--accent-ink": "#111111", "--accent-soft": "#343434",
      "--positive": "#CACACA", "--warning": "#9C9C9C",
    },
  },
  tinta: {
    label: "Blanco y negro",
    swatch: ["#000000", "#FAFAFA", "#505050"],
    light: {
      "--bg": "#FAFAFA", "--bg-elev": "#FFFFFF", "--bg-sunken": "#EAEAEA",
      "--ink": "#000000", "--ink-soft": "#505050",
      "--line": "rgba(0, 0, 0, 0.10)", "--line-strong": "rgba(0, 0, 0, 0.24)",
      "--accent": "#000000", "--accent-ink": "#FFFFFF", "--accent-soft": "#E5E5E5",
      "--positive": "#2A2A2A", "--warning": "#707070",
    },
    dark: {
      "--bg": "#000000", "--bg-elev": "#121212", "--bg-sunken": "#050505",
      "--ink": "#FFFFFF", "--ink-soft": "#BDBDBD",
      "--line": "rgba(255, 255, 255, 0.12)", "--line-strong": "rgba(255, 255, 255, 0.24)",
      "--accent": "#FFFFFF", "--accent-ink": "#000000", "--accent-soft": "#262626",
      "--positive": "#D6D6D6", "--warning": "#AAAAAA",
    },
  },
};

// ===== Pairings tipográficos =====
const FONTS = {
  bistro: {
    label: "Bistro",
    display: '"DM Serif Display", "Instrument Serif", Georgia, serif',
    body: '"DM Sans", "Geist", system-ui, sans-serif',
    google: "DM+Serif+Display:ital@0;1|DM+Sans:opsz,wght@9..40,300..700",
  },
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
  const p = PALETTES[palette] || PALETTES.restaurante;
  const tokens = mode === "dark" ? p.dark : p.light;
  Object.entries(tokens).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute("data-mode", mode);
  const f = FONTS[fontKey] || FONTS.bistro;
  root.style.setProperty("--font-display", f.display);
  root.style.setProperty("--font-body", f.body);
}

// Mapeo palette-array -> palette-key (para TweakColor que emite el array)
function paletteFromSwatch(swatch) {
  if (!Array.isArray(swatch)) return swatch;
  for (const [k, v] of Object.entries(PALETTES)) {
    if (v.swatch[0].toLowerCase() === String(swatch[0]).toLowerCase()) return k;
  }
  return "restaurante";
}

// ===== Defaults =====
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "restaurante",
  "mode": "light",
  "font": "bistro",
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
      {page === 'duros' && (
        <Plan
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
          value={PALETTES[t.palette]?.swatch || PALETTES.restaurante.swatch}
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
        <TweakButton label="Fidelización" onClick={() => handleNav('duros')} />
      </TweaksPanel>
    </React.Fragment>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
