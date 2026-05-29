// Bolera Contrastes — Eventos
function Eventos({ onNav }) {
  const events = window.BC_EVENTS;
  const [filter, setFilter] = React.useState("all");

  const tags = ["all", ...new Set(events.map((e) => e.tag))];
  const tagLabel = (t) => t === "all" ? "Todos" : t;
  const shown = filter === "all" ? events : events.filter((e) => e.tag === filter);

  return (
    <main data-screen-label="Eventos">
      <section className="bc-container" style={{ padding: 'var(--s-7) 0 var(--s-5)' }}>
        <span className="eyebrow">Agenda</span>
        <h1 className="h-hero" style={{ marginTop: 10 }}>
          Qué pasa<br/><em>en Contrastes</em>.
        </h1>
        <p className="muted pretty" style={{ maxWidth: '52ch', marginTop: 14, fontSize: 17 }}>
          Paellas, partidos, catas y noches temáticas. Reserva tu sitio con antelación — las plazas vuelan.
        </p>

        <div style={{ display: 'flex', gap: 8, marginTop: 28, flexWrap: 'wrap' }}>
          {tags.map((t) => (
            <button
              key={t}
              className={"chip " + (filter === t ? "is-active" : "")}
              onClick={() => setFilter(t)}
            >
              {tagLabel(t)}
            </button>
          ))}
        </div>
      </section>

      <section className="bc-container" style={{ paddingBottom: 'var(--s-8)' }}>
        <div className="event-grid">
          {shown.map((e) => (
            <article key={e.id} className="event-card" style={{ gridTemplateColumns: '180px 1fr' }}>
              <div className="event-card__media">
                <img src={e.img} alt={e.title} loading="lazy"/>
              </div>
              <div className="event-card__body">
                <span className="event-card__date">{e.date} · {e.time}</span>
                <h3 className="event-card__title">{e.title}</h3>
                <p className="event-card__sub muted">{e.subtitle}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                  <span className="chip" style={{ fontSize: 11 }}>{e.tag}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{e.spots}</span>
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', gap: 8, paddingTop: 14 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => onNav('reservar')}>
                    Reservar plaza
                  </button>
                  <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>{e.price}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

window.Eventos = Eventos;
