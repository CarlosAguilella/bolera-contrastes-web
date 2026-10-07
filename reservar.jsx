// Bolera Contrastes — reservas online conectadas a disponibilidad real.
const { useEffect: useEffectR, useMemo: useMemoR, useState: useStateR } = React;

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function euroReservation(cents) {
  if (cents === null || cents === undefined) return "A consultar";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(cents || 0) / 100);
}

function Reservar({ onNav }) {
  const I = window.BC_INFO;
  const today = localDateString(new Date());
  const [catalog, setCatalog] = useStateR({ slots: [], menus: [] });
  const [loading, setLoading] = useStateR(true);
  const [loadError, setLoadError] = useStateR("");
  const [month, setMonth] = useStateR(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [name, setName] = useStateR("");
  const [phone, setPhone] = useStateR("");
  const [email, setEmail] = useStateR("");
  const [people, setPeople] = useStateR(2);
  const [date, setDate] = useStateR("");
  const [slotId, setSlotId] = useStateR("");
  const [menuId, setMenuId] = useStateR("");
  const [notes, setNotes] = useStateR("");
  const [submitting, setSubmitting] = useStateR(false);
  const [submitError, setSubmitError] = useStateR("");
  const [confirmation, setConfirmation] = useStateR(null);

  useEffectR(() => {
    const from = localDateString(new Date());
    const until = new Date();
    until.setDate(until.getDate() + 90);
    fetch(`/api/tpv-products?scope=reservations_public&from=${from}&to=${localDateString(until)}`)
      .then((response) => response.json().then((body) => ({ response, body })))
      .then(({ response, body }) => {
        if (!response.ok || !body.ok) throw new Error(body.error || "No se ha podido cargar la disponibilidad.");
        setCatalog({ slots: Array.isArray(body.slots) ? body.slots : [], menus: Array.isArray(body.menus) ? body.menus : [] });
        const firstAvailable = (body.slots || []).find((slot) => Number(slot.availablePeople) > 0);
        if (firstAvailable) {
          setDate((current) => current || firstAvailable.serviceDate);
          const firstDate = new Date(`${firstAvailable.serviceDate}T12:00:00`);
          setMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
        }
      })
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, []);

  const slotsByDate = useMemoR(() => catalog.slots.reduce((all, slot) => {
    all[slot.serviceDate] = [...(all[slot.serviceDate] || []), slot];
    return all;
  }, {}), [catalog.slots]);
  const selectedSlots = (slotsByDate[date] || []).sort((first, second) => first.serviceTime.localeCompare(second.serviceTime));
  const selectedSlot = selectedSlots.find((slot) => slot.id === slotId) || null;
  const selectedMenu = catalog.menus.find((menu) => menu.id === menuId) || null;
  const menuPreview = selectedMenu || catalog.menus.find((menu) => menu.image_url) || catalog.menus[0] || null;
  const datePretty = date ? new Date(`${date}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : "";
  const isValid = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 6 && people >= 1 && selectedSlot && selectedSlot.availablePeople >= people;

  const selectDate = (nextDate) => { setDate(nextDate); setSlotId(""); setSubmitError(""); };
  const submitReservation = async (event) => {
    event.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true); setSubmitError("");
    try {
      const response = await fetch("/api/tpv-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reservation_create", slotId: selectedSlot.id, name, phone, email, partySize: people, menuOptionId: menuId || null, notes }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "No se ha podido enviar la reserva.");
      setConfirmation(body.reservation);
      setCatalog((current) => ({ ...current, slots: current.slots.map((slot) => slot.id === selectedSlot.id ? { ...slot, reservedPeople: Number(slot.reservedPeople) + people, availablePeople: Number(slot.availablePeople) - people } : slot) }));
    } catch (error) { setSubmitError(error.message); } finally { setSubmitting(false); }
  };

  const days = useMemoR(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = (first.getDay() + 6) % 7;
    const amount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: start + amount }, (_, index) => index < start ? null : new Date(month.getFullYear(), month.getMonth(), index - start + 1));
  }, [month]);
  const canGoPrevious = month.getFullYear() > new Date().getFullYear() || month.getMonth() > new Date().getMonth();

  if (confirmation) return <main data-screen-label="Reserva confirmada"><section className="bc-container reservar-success"><span className="eyebrow">Solicitud recibida</span><h1 className="h-hero" style={{ marginTop: 10 }}>Tu mesa ya está <em>solicitada</em>.</h1><p className="muted pretty">Referencia {confirmation.reference}. Hemos guardado la solicitud para {confirmation.partySize} personas el {new Date(`${confirmation.serviceDate}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long" })} a las {confirmation.serviceTime}. Te confirmaremos la disponibilidad desde el local.</p><div className="reservar-success__actions"><a className="btn btn-primary btn-lg" href={`tel:${I.phone}`}>Llamar al local</a><a className="btn btn-whatsapp btn-lg" href={`https://wa.me/${String(I.whatsapp || "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Escribir por WhatsApp</a><button className="btn btn-secondary btn-lg" onClick={() => onNav("home")}>Volver al inicio</button></div></section></main>;

  return <main data-screen-label="Reservar" id="reservas">
    <section className="bc-container reservar-intro"><span className="eyebrow">Reservas online</span><h1 className="h-hero" style={{ marginTop: 10 }}>Tu mesa, <em>a tu hora</em>.</h1><p className="muted pretty">Consulta la disponibilidad real, elige el turno y déjanos los datos de la reserva. Si prefieres, puedes llamarnos o escribirnos por WhatsApp.</p></section>
    <section className="bc-container" style={{ paddingBottom: "var(--s-8)" }}>
      <div className="reservar-contact"><a href={`tel:${I.phone}`}>Llamar: {I.phonePretty}</a><a href={`https://wa.me/${String(I.whatsapp || "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp del local</a></div>
      {loading ? <section className="reservar-loading">Cargando calendario de disponibilidad…</section> : loadError ? <section className="reservar-loading"><strong>No se ha podido cargar la disponibilidad.</strong><span>{loadError}</span></section> : !catalog.slots.length ? <section className="reservar-loading"><strong>Aún no hay turnos publicados.</strong><span>Llámanos o escríbenos para reservar y configuraremos la agenda muy pronto.</span></section> : <form className="reservar-booking" onSubmit={submitReservation}>
        <section className="reservar-calendar-card">
          <header><div><span className="eyebrow">1 · Día y hora</span><h2>Elige cuándo vienes</h2></div><div className="reservar-calendar-nav"><button type="button" disabled={!canGoPrevious} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button><strong>{month.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</strong><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button></div></header>
          <div className="reservar-calendar-week">{["L", "M", "X", "J", "V", "S", "D"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="reservar-calendar-days">{days.map((day, index) => { if (!day) return <span key={`blank-${index}`} />; const key = localDateString(day); const available = (slotsByDate[key] || []).some((slot) => slot.availablePeople > 0); return <button key={key} type="button" disabled={!available || key < today} className={date === key ? "is-selected" : ""} onClick={() => selectDate(key)}><b>{day.getDate()}</b><small>{available ? "Disponible" : "Completo"}</small></button>; })}</div>
          <div className="reservar-time-picker"><span className="eyebrow">Horarios disponibles {datePretty ? `· ${datePretty}` : ""}</span>{date ? <div className="timeslots">{selectedSlots.map((slot) => { const allowed = slot.availablePeople >= people; return <button key={slot.id} type="button" disabled={!allowed} className={`timeslot ${slotId === slot.id ? "is-active" : ""}`} onClick={() => { setSlotId(slot.id); setSubmitError(""); }}><b>{slot.serviceTime}</b><small>{allowed ? `${slot.availablePeople} plazas` : `Solo ${slot.availablePeople} plazas`}</small></button>; })}</div> : <p className="muted">Selecciona un día disponible en el calendario.</p>}</div>
        </section>
        <section className="reservar-form reservar-booking-form">
          <header><span className="eyebrow">2 · Datos de la reserva</span><h2>Cuéntanos quién viene</h2></header>
          <div className="reservar-form__grid"><div className="field field--full"><label htmlFor="r-name">Nombre y apellidos</label><input id="r-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="María García" required /></div><div className="field"><label htmlFor="r-phone">Teléfono</label><input id="r-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="600 000 000" required /></div><div className="field"><label htmlFor="r-email">Email <small>(opcional)</small></label><input id="r-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="maria@email.com" /></div><div className="field field--full"><label>¿Cuántos sois?</label><div className="people-pick"><button type="button" onClick={() => { setPeople(Math.max(1, people - 1)); setSlotId(""); }}>−</button><input type="number" min="1" max="80" value={people} onChange={(event) => { setPeople(Math.min(80, Math.max(1, Number(event.target.value) || 1))); setSlotId(""); }} aria-label="Número de personas" /><button type="button" onClick={() => { setPeople(Math.min(80, people + 1)); setSlotId(""); }}>+</button><span>{people === 1 ? "persona" : "personas"}</span></div></div></div>
          <div className="field field--full"><label htmlFor="r-notes">Notas <small>(alérgenos, niños, sillita, celebración…)</small></label><textarea id="r-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Cuéntanos cualquier detalle que debamos tener en cuenta." /></div>
          {selectedSlot ? <div className="reservation-summary"><span>Solicitud para <b>{people} {people === 1 ? "persona" : "personas"}</b></span><strong>{datePretty} · {selectedSlot.serviceTime}</strong>{selectedMenu && <small>{selectedMenu.name} · {euroReservation(selectedMenu.price_cents)}</small>}</div> : null}
          {submitError ? <p className="reservation-error">{submitError}</p> : null}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!isValid || submitting}>{submitting ? "Guardando reserva…" : "Solicitar reserva"}</button><p className="muted reservation-legal">La reserva queda pendiente de confirmación del local. No se realiza ningún cobro online.</p>
        </section>
        <section className="reservation-menu-showcase" aria-label="Menús para la reserva">
          <div className="reservation-menu-showcase__preview">
            <header><span className="eyebrow">3 · Menús</span><h2>Descubre nuestros menús</h2>{menuPreview ? <p className="muted">{menuPreview.name}{menuPreview.description ? ` · ${menuPreview.description}` : ""}</p> : null}</header>
            {menuPreview?.image_url ? <img src={menuPreview.image_url} alt={`Carta de ${menuPreview.name}`} /> : <div className="reservation-menu-showcase__empty">Selecciona un menú para consultar su propuesta.</div>}
          </div>
          <div className="reservation-menus reservation-menu-choice"><label>Elige el menú <small>(opcional)</small></label>{catalog.menus.length ? <div className="reservation-menus__grid"><button type="button" className={!menuId ? "is-selected" : ""} onClick={() => setMenuId("")}><b>A la carta</b><small>Decidiréis allí</small></button>{catalog.menus.map((menu) => <button type="button" key={menu.id} className={menuId === menu.id ? "is-selected" : ""} onClick={() => setMenuId(menu.id)}><b>{menu.name}</b><small>{menu.description || "Menú de grupo"}</small><strong>{euroReservation(menu.price_cents)}</strong></button>)}</div> : <p className="muted">Ahora mismo puedes reservar a la carta. Los menús de grupo aparecerán aquí cuando los publiquemos.</p>}</div>
        </section>
      </form>}
    </section>
  </main>;
}

window.Reservar = Reservar;
