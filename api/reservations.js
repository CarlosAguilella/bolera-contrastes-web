const { audit, cleanText, getConfig, readRequestBody, requireRoles, sendError, supabaseRequest } = require("./_tpv");

function configOrThrow() {
  const config = getConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw Object.assign(new Error("Las reservas aún no están conectadas a la base de datos."), { statusCode: 503 });
  }
  return config;
}

function reservationDate(value, label = "fecha") {
  const date = cleanText(value, 20);
  const parsed = new Date(`${date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error(`La ${label} no es válida.`), { statusCode: 400 });
  }
  return date;
}

function reservationTime(value) {
  const time = cleanText(value, 10);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Object.assign(new Error("La hora no es válida."), { statusCode: 400 });
  return time;
}

function partySize(value) {
  const size = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(size) || size < 1 || size > 80) throw Object.assign(new Error("El número de comensales debe estar entre 1 y 80."), { statusCode: 400 });
  return size;
}

function capacityPeople(value) {
  const capacity = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) throw Object.assign(new Error("El aforo debe estar entre 1 y 200 personas."), { statusCode: 400 });
  return capacity;
}

function validEmail(value) {
  const email = cleanText(value, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error("El email no tiene un formato válido."), { statusCode: 400 });
  return email || null;
}

function publicSlot(slot) {
  return {
    id: slot.id,
    serviceDate: slot.service_date,
    serviceTime: String(slot.service_time || "").slice(0, 5),
    capacityPeople: Number(slot.capacity_people || 0),
    reservedPeople: Number(slot.reserved_people || 0),
    availablePeople: Math.max(0, Number(slot.capacity_people || 0) - Number(slot.reserved_people || 0)),
  };
}

async function publicData(config, from, to) {
  const [slots, menus] = await Promise.all([
    supabaseRequest(config, `reservation_slots?enabled=eq.true&service_date=gte.${encodeURIComponent(from)}&service_date=lte.${encodeURIComponent(to)}&select=id,service_date,service_time,capacity_people,reserved_people&order=service_date.asc,service_time.asc`, { method: "GET" }),
    supabaseRequest(config, "reservation_menu_options?active=eq.true&select=id,name,description,price_cents,sort_order&order=sort_order.asc,name.asc", { method: "GET" }),
  ]);
  return { slots: (Array.isArray(slots) ? slots : []).map(publicSlot), menus: Array.isArray(menus) ? menus : [] };
}

async function adminData(config, from, to) {
  const [slots, menus, reservations] = await Promise.all([
    supabaseRequest(config, `reservation_slots?service_date=gte.${encodeURIComponent(from)}&service_date=lte.${encodeURIComponent(to)}&select=*&order=service_date.asc,service_time.asc`, { method: "GET" }),
    supabaseRequest(config, "reservation_menu_options?select=*&order=sort_order.asc,name.asc", { method: "GET" }),
    supabaseRequest(config, `reservations?service_date=gte.${encodeURIComponent(from)}&service_date=lte.${encodeURIComponent(to)}&select=*&order=service_date.asc,service_time.asc,created_at.desc`, { method: "GET" }),
  ]);
  return { slots: Array.isArray(slots) ? slots : [], menus: Array.isArray(menus) ? menus : [], reservations: Array.isArray(reservations) ? reservations : [] };
}

async function createPublicReservation(config, body) {
  const name = cleanText(body.name, 100);
  const phone = cleanText(body.phone, 40);
  const email = validEmail(body.email);
  const slotId = cleanText(body.slotId, 80);
  const menuOptionId = cleanText(body.menuOptionId, 80) || null;
  if (name.length < 2 || phone.replace(/\D/g, "").length < 6 || !slotId) {
    throw Object.assign(new Error("Indica nombre, teléfono y un horario disponible."), { statusCode: 400 });
  }
  const rows = await supabaseRequest(config, "rpc/create_web_reservation", {
    method: "POST",
    body: JSON.stringify({ p_slot_id: slotId, p_customer_name: name, p_customer_phone: phone, p_customer_email: email, p_party_size: partySize(body.partySize), p_menu_option_id: menuOptionId, p_notes: cleanText(body.notes, 800) || null }),
  });
  const reservation = Array.isArray(rows) ? rows[0] : rows;
  if (!reservation?.id) throw new Error("No se pudo registrar la reserva.");
  return reservation;
}

module.exports = async function handler(req, res) {
  try {
    const config = configOrThrow();
    const today = new Date().toISOString().slice(0, 10);
    const maximumDate = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    const from = reservationDate(req.query?.from || today, "fecha inicial");
    const to = reservationDate(req.query?.to || maximumDate, "fecha final");
    if (from > to || to > maximumDate) throw Object.assign(new Error("El rango de reservas solicitado no es válido."), { statusCode: 400 });

    if (req.method === "GET") {
      if (req.query?.scope === "admin") {
        requireRoles(req, ["admin", "manager"]);
        return res.status(200).json({ ok: true, ...(await adminData(config, from, to)) });
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, ...(await publicData(config, from, to)) });
    }

    const body = await readRequestBody(req);
    if (req.method === "POST" && body.action === "create") {
      const reservation = await createPublicReservation(config, body);
      return res.status(201).json({ ok: true, reservation: { reference: reservation.reference, serviceDate: reservation.service_date, serviceTime: String(reservation.service_time || "").slice(0, 5), partySize: reservation.party_size, status: reservation.status } });
    }

    const session = requireRoles(req, ["admin", "manager"]);
    if (req.method === "POST" && body.action === "slot_create") {
      const rows = await supabaseRequest(config, "reservation_slots", { method: "POST", body: JSON.stringify({ service_date: reservationDate(body.serviceDate), service_time: reservationTime(body.serviceTime), capacity_people: capacityPeople(body.capacityPeople), enabled: body.enabled !== false }) });
      const slot = Array.isArray(rows) ? rows[0] : rows;
      await audit(config, session.sub, "reservation_slots", slot?.id || "", "create", { serviceDate: slot?.service_date, serviceTime: slot?.service_time });
      return res.status(201).json({ ok: true, slot });
    }
    if (req.method === "PATCH" && body.action === "slot_update") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Turno de reserva no válido." });
      const current = await supabaseRequest(config, `reservation_slots?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { method: "GET" });
      const currentSlot = Array.isArray(current) ? current[0] : null;
      if (!currentSlot) return res.status(404).json({ ok: false, error: "Turno de reserva no encontrado." });
      const capacity = capacityPeople(body.capacityPeople ?? currentSlot.capacity_people);
      if (capacity < Number(currentSlot.reserved_people || 0)) return res.status(409).json({ ok: false, error: "No puedes bajar el aforo por debajo de las plazas ya reservadas." });
      const rows = await supabaseRequest(config, `reservation_slots?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ service_date: reservationDate(body.serviceDate || currentSlot.service_date), service_time: reservationTime(body.serviceTime || String(currentSlot.service_time).slice(0, 5)), capacity_people: capacity, enabled: typeof body.enabled === "boolean" ? body.enabled : currentSlot.enabled }) });
      return res.status(200).json({ ok: true, slot: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "POST" && body.action === "menu_create") {
      const name = cleanText(body.name, 120);
      if (name.length < 2) return res.status(400).json({ ok: false, error: "Indica el nombre del menú." });
      const price = body.priceCents === "" || body.priceCents === null || body.priceCents === undefined ? null : Math.round(Number(body.priceCents));
      if (price !== null && (!Number.isInteger(price) || price < 0)) return res.status(400).json({ ok: false, error: "El precio del menú no es válido." });
      const rows = await supabaseRequest(config, "reservation_menu_options", { method: "POST", body: JSON.stringify({ name, description: cleanText(body.description, 500) || null, price_cents: price, sort_order: Math.max(0, Number.parseInt(body.sortOrder, 10) || 0), active: true }) });
      return res.status(201).json({ ok: true, menu: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "PATCH" && body.action === "menu_update") {
      const id = cleanText(body.id, 80);
      const name = cleanText(body.name, 120);
      const price = body.priceCents === "" || body.priceCents === null || body.priceCents === undefined ? null : Math.round(Number(body.priceCents));
      if (!id || name.length < 2 || (price !== null && (!Number.isInteger(price) || price < 0))) return res.status(400).json({ ok: false, error: "Revisa los datos del menú." });
      const rows = await supabaseRequest(config, `reservation_menu_options?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name, description: cleanText(body.description, 500) || null, price_cents: price, sort_order: Math.max(0, Number.parseInt(body.sortOrder, 10) || 0), active: body.active !== false }) });
      return res.status(200).json({ ok: true, menu: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "PATCH" && body.action === "reservation_status") {
      const status = cleanText(body.status, 20);
      const rows = await supabaseRequest(config, "rpc/admin_set_reservation_status", { method: "POST", body: JSON.stringify({ p_reservation_id: cleanText(body.id, 80), p_status: status }) });
      const reservation = Array.isArray(rows) ? rows[0] : rows;
      await audit(config, session.sub, "reservations", reservation?.id || "", "status", { status });
      return res.status(200).json({ ok: true, reservation });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudieron gestionar las reservas.");
  }
};
