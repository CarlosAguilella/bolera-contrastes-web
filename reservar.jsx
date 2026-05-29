// Bolera Contrastes — Reservar (envía a WhatsApp)
const { useState: useStateR, useMemo: useMemoR } = React;

function Reservar({ onNav }) {
  const I = window.BC_INFO;
  const today = new Date();
  const tomorrowStr = (() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const [name, setName] = useStateR("");
  const [people, setPeople] = useStateR(2);
  const [date, setDate] = useStateR(tomorrowStr);
  const [time, setTime] = useStateR("21:00");
  const [notes, setNotes] = useStateR("");
  const [occasion, setOccasion] = useStateR("");

  // Slots realistas (cocina abre desde 13h)
  const slots = [
    "13:00", "13:30", "14:00", "14:30",
    "20:30", "21:00", "21:30", "22:00",
  ];

  const datePretty = useMemoR(() => {
    if (!date) return "";
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  }, [date]);

  const message = useMemoR(() => {
    const lines = [
      `¡Hola Bolera Contrastes! 👋`,
      `Quiero reservar una mesa:`,
      ``,
      `• Nombre: ${name || "—"}`,
      `• Personas: ${people}`,
      `• Día: ${datePretty || "—"}`,
      `• Hora: ${time || "—"}`,
    ];
    if (occasion) lines.push(`• Ocasión: ${occasion}`);
    if (notes) lines.push(`• Notas: ${notes}`);
    lines.push(``, `¿Me lo confirmáis? ¡Gracias!`);
    return lines.join("\n");
  }, [name, people, date, time, notes, occasion, datePretty]);

  const isValid = name.trim().length >= 2 && people > 0 && date && time;

  const sendToWhatsApp = () => {
    if (!isValid) return;
    const num = I.whatsapp.replace(/[^0-9]/g, "");
    const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  return (
    <main data-screen-label="Reservar" id="reservas">
      <section className="bc-container" style={{ padding: 'var(--s-7) 0 var(--s-5)' }}>
        <span className="eyebrow">Reservas</span>
        <h1 className="h-hero" style={{ marginTop: 10 }}>
          Reserva en<br/><em>30 segundos</em>.
        </h1>
        <p className="muted pretty" style={{ maxWidth: '52ch', marginTop: 14, fontSize: 17 }}>
          Rellena el formulario y te abrimos el WhatsApp con todo escrito. Solo tienes que enviarlo. Te contestamos en minutos.
        </p>
      </section>

      <section className="bc-container" style={{ paddingBottom: 'var(--s-8)' }}>
        <div className="reservar-wrap">
          {/* ===== FORM ===== */}
          <form className="reservar-form" onSubmit={(e) => { e.preventDefault(); sendToWhatsApp(); }}>
            <div className="reservar-form__grid">
              <div className="field field--full">
                <label htmlFor="r-name">Nombre y apellidos</label>
                <input
                  id="r-name"
                  type="text"
                  placeholder="María García"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>

              <div className="field">
                <label>¿Cuántos sois?</label>
                <div className="people-pick">
                  <button type="button" onClick={() => setPeople(Math.max(1, people - 1))} aria-label="Quitar persona">−</button>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={people}
                    onChange={(e) => setPeople(Math.max(1, +e.target.value || 1))}
                    aria-label="Número de personas"
                  />
                  <button type="button" onClick={() => setPeople(people + 1)} aria-label="Añadir persona">+</button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="r-date">Día</label>
                <input
                  id="r-date"
                  type="date"
                  value={date}
                  min={today.toISOString().slice(0,10)}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="field field--full">
                <label>Hora preferida</label>
                <div className="timeslots">
                  {slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={"timeslot " + (time === s ? "is-active" : "")}
                      onClick={() => setTime(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field field--full">
                <label htmlFor="r-occ">Ocasión <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                <select id="r-occ" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                  <option value="">Sin especificar</option>
                  <option>Cena con amigos</option>
                  <option>Cumpleaños</option>
                  <option>Cita</option>
                  <option>Comida familiar</option>
                  <option>Ver el partido</option>
                  <option>Reunión / Empresa</option>
                </select>
              </div>

              <div className="field field--full">
                <label htmlFor="r-notes">Notas <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(alérgenos, sillita de bebé, mesa al fondo…)</span></label>
                <textarea
                  id="r-notes"
                  placeholder="P. ej.: somos 4 adultos y 2 niños, uno celíaco."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              <button
                type="submit"
                className="btn btn-whatsapp btn-lg btn-block"
                disabled={!isValid}
                style={{ flex: 1, minWidth: 240, opacity: isValid ? 1 : 0.5 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.5 3.5A11.7 11.7 0 0 0 12 0C5.4 0 .1 5.3.1 11.9c0 2.1.6 4.1 1.6 5.9L0 24l6.4-1.7a11.9 11.9 0 0 0 5.6 1.4h.01c6.5 0 11.9-5.3 11.9-11.9 0-3.2-1.2-6.2-3.4-8.3ZM12 21.7c-1.8 0-3.6-.5-5.2-1.4l-.4-.2-3.8 1 1-3.7-.2-.4a9.8 9.8 0 0 1-1.5-5.1c0-5.5 4.4-9.9 9.9-9.9 2.6 0 5.1 1 7 2.9 1.9 1.9 2.9 4.4 2.9 7-.01 5.5-4.5 9.8-9.7 9.8Zm5.5-7.4c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2s-.8 1-1 1.2-.4.2-.7 0c-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1.1-1.1 2.6 0 1.5 1.1 3 1.3 3.2.2.2 2.2 3.4 5.4 4.8.8.3 1.4.5 1.9.6.8.3 1.5.2 2.1.1.6-.1 1.8-.7 2.1-1.5.3-.7.3-1.4.2-1.5 0-.1-.3-.2-.6-.4Z"/>
                </svg>
                Enviar por WhatsApp
              </button>
              <a className="btn btn-secondary btn-lg" href={`tel:${I.phone}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L8 9.6a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9Z" stroke="currentColor" strokeWidth="1.6"/>
                </svg>
                O llamar
              </a>
            </div>

            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              💡 Te contestamos en horario del local. Si no estás seguro de la hora, escribe en notas y nos cuadramos.
            </p>
          </form>

          {/* ===== WHATSAPP PREVIEW ===== */}
          <div className="wa-preview">
            <div className="wa-preview__head">
              <span className="wa-preview__head__avatar">BC</span>
              <span>
                <span className="wa-preview__name">Bolera Contrastes</span><br/>
                <span className="wa-preview__sub">en línea</span>
              </span>
            </div>
            <div className="wa-bubble">
              {message}
              <span className="wa-bubble__time">
                {today.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} ✓
              </span>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 14, color: '#5B6B66' }}>
              Esto es lo que enviarás al darle a "Enviar por WhatsApp".
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

window.Reservar = Reservar;
