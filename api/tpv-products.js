const crypto = require("crypto");
const { audit, cleanText, getConfig, readRequestBody, requireConfig, requireRoles, sendError, supabaseRequest } = require("./_tpv");
const { listCategories, listProducts, seedCatalog, sendsToKitchen } = require("./_tpv-catalog");

async function categoryId(config, name) {
  const categoryName = cleanText(name, 100);
  if (!categoryName) throw new Error("Indica una familia para el artículo.");
  const existing = await supabaseRequest(config, `product_categories?name=eq.${encodeURIComponent(categoryName)}&select=id,name&limit=1`, { method: "GET" });
  if (Array.isArray(existing) && existing[0]?.id) return existing[0];
  const categories = await listCategories(config);
  const sortOrder = categories.reduce((maximum, category) => Math.max(maximum, Number(category.sort_order || 0)), -1) + 1;
  const created = await supabaseRequest(config, "product_categories", {
    method: "POST",
    body: JSON.stringify({ name: categoryName, sort_order: sortOrder }),
    headers: { Prefer: "return=representation" },
  });
  const category = Array.isArray(created) ? created[0] : created;
  if (!category?.id) throw new Error("No se pudo guardar la familia.");
  return { id: category.id, name: categoryName };
}

function cents(value, label, allowEmpty = false) {
  if (allowEmpty && (value === null || value === "" || value === undefined)) return null;
  const amount = Math.round(Number(value));
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`El ${label} no es válido.`);
  return amount;
}

function decimal(value, label, minimum = 0, maximum = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw Object.assign(new Error(`El ${label} no es válido.`), { statusCode: 400 });
  return parsed;
}

function reservationDate(value, label = "fecha") {
  const date = cleanText(value, 20);
  const parsed = new Date(`${date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw Object.assign(new Error(`La ${label} no es válida.`), { statusCode: 400 });
  return date;
}

function reservationTime(value) {
  const time = cleanText(value, 10);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Object.assign(new Error("La hora no es válida."), { statusCode: 400 });
  return time;
}

function reservationPartySize(value) {
  const size = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(size) || size < 1 || size > 80) throw Object.assign(new Error("El número de comensales debe estar entre 1 y 80."), { statusCode: 400 });
  return size;
}

function reservationCapacity(value) {
  const capacity = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) throw Object.assign(new Error("El aforo debe estar entre 1 y 200 personas."), { statusCode: 400 });
  return capacity;
}

function reservationEmail(value) {
  const email = cleanText(value, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error("El email no tiene un formato válido."), { statusCode: 400 });
  return email || null;
}

function reservationRange(query = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const maximumDate = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
  const from = reservationDate(query.from || today, "fecha inicial");
  const to = reservationDate(query.to || maximumDate, "fecha final");
  if (from > to || to > maximumDate) throw Object.assign(new Error("El rango de reservas solicitado no es válido."), { statusCode: 400 });
  return { from, to };
}

async function reservationPublicData(config, from, to) {
  const [slots, menus] = await Promise.all([
    supabaseRequest(config, `reservation_slots?enabled=eq.true&service_date=gte.${encodeURIComponent(from)}&service_date=lte.${encodeURIComponent(to)}&select=id,service_date,service_time,capacity_people,reserved_people&order=service_date.asc,service_time.asc`, { method: "GET" }),
    supabaseRequest(config, "reservation_menu_options?active=eq.true&select=id,name,description,price_cents,image_url,sort_order&order=sort_order.asc,name.asc", { method: "GET" }),
  ]);
  return { slots: (Array.isArray(slots) ? slots : []).map((slot) => ({ id: slot.id, serviceDate: slot.service_date, serviceTime: String(slot.service_time || "").slice(0, 5), capacityPeople: Number(slot.capacity_people || 0), reservedPeople: Number(slot.reserved_people || 0), availablePeople: Math.max(0, Number(slot.capacity_people || 0) - Number(slot.reserved_people || 0)) })), menus: Array.isArray(menus) ? menus : [] };
}

async function reservationAdminData(config, from, to) {
  const [slots, menus, reservations] = await Promise.all([
    supabaseRequest(config, `reservation_slots?service_date=gte.${encodeURIComponent(from)}&service_date=lte.${encodeURIComponent(to)}&select=*&order=service_date.asc,service_time.asc`, { method: "GET" }),
    supabaseRequest(config, "reservation_menu_options?select=*&order=sort_order.asc,name.asc", { method: "GET" }),
    supabaseRequest(config, `reservations?service_date=gte.${encodeURIComponent(from)}&service_date=lte.${encodeURIComponent(to)}&select=*&order=service_date.asc,service_time.asc,created_at.desc`, { method: "GET" }),
  ]);
  return { slots: Array.isArray(slots) ? slots : [], menus: Array.isArray(menus) ? menus : [], reservations: Array.isArray(reservations) ? reservations : [] };
}

async function createWebReservation(config, body) {
  const name = cleanText(body.name, 100);
  const phone = cleanText(body.phone, 40);
  const slotId = cleanText(body.slotId, 80);
  if (name.length < 2 || phone.replace(/\D/g, "").length < 6 || !slotId) throw Object.assign(new Error("Indica nombre, teléfono y un horario disponible."), { statusCode: 400 });
  const rows = await supabaseRequest(config, "rpc/create_web_reservation", { method: "POST", body: JSON.stringify({ p_slot_id: slotId, p_customer_name: name, p_customer_phone: phone, p_customer_email: reservationEmail(body.email), p_party_size: reservationPartySize(body.partySize), p_menu_option_id: cleanText(body.menuOptionId, 80) || null, p_notes: cleanText(body.notes, 800) || null }) });
  const reservation = Array.isArray(rows) ? rows[0] : rows;
  if (!reservation?.id) throw new Error("No se pudo registrar la reserva.");
  return reservation;
}

async function productionData(config) {
  const [ingredients, recipes, recipeLines, settings] = await Promise.all([
    supabaseRequest(config, "ingredients?select=*&order=name.asc", { method: "GET" }),
    supabaseRequest(config, "product_recipes?select=*&order=created_at.asc", { method: "GET" }),
    supabaseRequest(config, "recipe_ingredients?select=*&order=created_at.asc", { method: "GET" }),
    supabaseRequest(config, "costing_settings?id=eq.true&select=*&limit=1", { method: "GET" }),
  ]);
  return { ingredients: Array.isArray(ingredients) ? ingredients : [], recipes: Array.isArray(recipes) ? recipes : [], recipeLines: Array.isArray(recipeLines) ? recipeLines : [], settings: Array.isArray(settings) ? settings[0] || null : null };
}

async function recipeForProduct(config, productId) {
  const rows = await supabaseRequest(config, `product_recipes?product_id=eq.${encodeURIComponent(productId)}&select=*&limit=1`, { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function accountingData(config) {
  const invoices = await supabaseRequest(config, "supplier_invoices?select=*,supplier_invoice_lines(*)&order=invoice_date.desc,created_at.desc&limit=100", { method: "GET" });
  try {
    const [accounts, entries] = await Promise.all([
      supabaseRequest(config, "accounting_accounts?select=*&order=group_code.asc,code.asc", { method: "GET" }),
      supabaseRequest(config, "accounting_entries?select=*,accounting_entry_lines(*,accounting_accounts(code,name,group_code))&order=entry_date.desc,entry_number.desc&limit=150", { method: "GET" }),
    ]);
    return { invoices: Array.isArray(invoices) ? invoices : [], accounts: Array.isArray(accounts) ? accounts : [], entries: Array.isArray(entries) ? entries : [], ledgerEnabled: true };
  } catch (error) {
    if ([400, 404].includes(Number(error.statusCode))) return { invoices: Array.isArray(invoices) ? invoices : [], accounts: [], entries: [], ledgerEnabled: false };
    throw error;
  }
}

function accountingDate(value) {
  const date = cleanText(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error("La fecha del asiento no es válida."), { statusCode: 400 });
  return date;
}

function accountingLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 40) throw Object.assign(new Error("El asiento debe tener entre 2 y 40 líneas."), { statusCode: 400 });
  const cleanLines = lines.map((line) => {
    const accountId = cleanText(line?.accountId, 80);
    const debitCents = line?.debitCents === null || line?.debitCents === undefined || line?.debitCents === "" ? 0 : cents(line.debitCents, "importe al debe");
    const creditCents = line?.creditCents === null || line?.creditCents === undefined || line?.creditCents === "" ? 0 : cents(line.creditCents, "importe al haber");
    if (!accountId) throw Object.assign(new Error("Selecciona una cuenta en cada línea."), { statusCode: 400 });
    if ((debitCents > 0) === (creditCents > 0)) throw Object.assign(new Error("Cada línea debe tener importe solo en Debe o solo en Haber."), { statusCode: 400 });
    return { account_id: accountId, debit_cents: debitCents, credit_cents: creditCents, description: cleanText(line?.description, 300) || null };
  });
  const debitTotal = cleanLines.reduce((sum, line) => sum + line.debit_cents, 0);
  const creditTotal = cleanLines.reduce((sum, line) => sum + line.credit_cents, 0);
  if (!debitTotal || debitTotal !== creditTotal) throw Object.assign(new Error("El asiento debe cuadrar: el Debe y el Haber deben ser iguales."), { statusCode: 400 });
  return cleanLines;
}

async function activeAccountingAccounts(config) {
  const accounts = await supabaseRequest(config, "accounting_accounts?active=eq.true&select=id,code,name,group_code,account_type&order=group_code.asc,code.asc", { method: "GET" });
  return Array.isArray(accounts) ? accounts : [];
}

async function supplierInvoiceAccounts(config, expenseAccountId, vatCents, subtotalCents) {
  const expenseId = cleanText(expenseAccountId, 80);
  if (!expenseId) return null;
  if (Number(subtotalCents) <= 0 || Number(subtotalCents) + Number(vatCents) <= 0) {
    throw Object.assign(new Error("La factura debe tener un importe mayor que cero para crear el asiento."), { statusCode: 400 });
  }
  const accounts = await activeAccountingAccounts(config);
  const expenseAccount = accounts.find((account) => account.id === expenseId);
  const supplierAccount = accounts.find((account) => account.code === "400");
  const vatAccount = accounts.find((account) => account.code === "472");
  if (!expenseAccount || !supplierAccount || (Number(vatCents) > 0 && !vatAccount)) {
    throw Object.assign(new Error("Faltan cuentas para contabilizar la factura. Revisa el plan contable."), { statusCode: 409 });
  }
  return { expenseAccount, supplierAccount, vatAccount };
}

async function createAccountingEntry(config, session, input) {
  const entryDate = accountingDate(input.entryDate);
  const description = cleanText(input.description, 500);
  const reference = cleanText(input.reference, 160) || null;
  const sourceType = ["manual", "supplier_invoice", "pos_sale", "cash_close"].includes(input.sourceType) ? input.sourceType : "manual";
  const sourceId = cleanText(input.sourceId, 80) || null;
  if (!description) throw Object.assign(new Error("Describe el asiento contable."), { statusCode: 400 });
  const lines = accountingLines(input.lines);
  const accounts = await activeAccountingAccounts(config);
  const accountIds = new Set(accounts.map((account) => account.id));
  if (lines.some((line) => !accountIds.has(line.account_id))) throw Object.assign(new Error("Una de las cuentas seleccionadas no está disponible."), { statusCode: 400 });
  const rows = await supabaseRequest(config, "accounting_entries", {
    method: "POST",
    body: JSON.stringify({ entry_date: entryDate, reference, description, source_type: sourceType, source_id: sourceId, status: "posted", created_by: session.sub }),
  });
  const entry = Array.isArray(rows) ? rows[0] : rows;
  if (!entry?.id) throw new Error("No se pudo crear el asiento contable.");
  try {
    await supabaseRequest(config, "accounting_entry_lines", {
      method: "POST",
      body: JSON.stringify(lines.map((line) => ({ ...line, entry_id: entry.id }))),
      headers: { Prefer: "return=minimal" },
    });
  } catch (error) {
    try { await supabaseRequest(config, `accounting_entries?id=eq.${encodeURIComponent(entry.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); } catch (cleanupError) {}
    throw error;
  }
  await audit(config, session.sub, "accounting_entries", entry.id, "create", { entryDate, reference, sourceType, lineCount: lines.length });
  return entry;
}

async function createSupplierInvoiceEntry(config, session, invoice, accounts) {
  if (!accounts) return null;
  const { expenseAccount, supplierAccount, vatAccount } = accounts;
  const lines = [{ accountId: expenseAccount.id, debitCents: Number(invoice.subtotal_cents), creditCents: 0 }];
  if (Number(invoice.vat_cents) > 0) lines.push({ accountId: vatAccount.id, debitCents: Number(invoice.vat_cents), creditCents: 0 });
  lines.push({ accountId: supplierAccount.id, debitCents: 0, creditCents: Number(invoice.total_cents) });
  return createAccountingEntry(config, session, {
    entryDate: invoice.invoice_date,
    reference: invoice.invoice_number || `FAC-${invoice.id.slice(0, 8)}`,
    description: `Factura de proveedor · ${invoice.supplier_name}`,
    sourceType: "supplier_invoice",
    sourceId: invoice.id,
    lines,
  });
}

async function storageRequest(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/storage/v1/${path}`, {
    ...options,
    headers: { apikey: config.supabaseServiceRoleKey, Authorization: `Bearer ${config.supabaseServiceRoleKey}`, ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (error) { body = { message: text }; }
  if (!response.ok) throw Object.assign(new Error(body?.message || "No se pudo guardar el archivo."), { statusCode: response.status });
  return body;
}

function invoiceFile(body) {
  const fileName = cleanText(body.fileName, 180).replace(/[^a-zA-Z0-9._-]/g, "_");
  const mimeType = cleanText(body.mimeType, 80);
  const allowed = new Set(["application/pdf", "image/jpeg", "image/png"]);
  if (!fileName || !allowed.has(mimeType)) throw Object.assign(new Error("Solo se permiten PDF, JPG o PNG."), { statusCode: 400 });
  const content = String(body.contentBase64 || "").replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(content, "base64");
  if (!buffer.length || buffer.length > 6 * 1024 * 1024) throw Object.assign(new Error("El archivo debe ocupar menos de 6 MB."), { statusCode: 400 });
  return { fileName, mimeType, buffer };
}

function productImageFile(body) {
  const fileName = cleanText(body.fileName, 180).replace(/[^a-zA-Z0-9._-]/g, "_");
  const mimeType = cleanText(body.mimeType, 80);
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!fileName || !allowed.has(mimeType)) throw Object.assign(new Error("Solo se permiten fotos JPG, PNG o WEBP."), { statusCode: 400 });
  const content = String(body.contentBase64 || "").replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(content, "base64");
  const validImage = (mimeType === "image/jpeg" && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    || (mimeType === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    || (mimeType === "image/webp" && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP");
  if (!validImage || !buffer.length || buffer.length > 3 * 1024 * 1024) throw Object.assign(new Error("La foto debe ser una imagen válida de menos de 3 MB."), { statusCode: 400 });
  return { fileName, mimeType, buffer };
}

function productImageUrl(config, value) {
  if (value === null || value === "" || value === undefined) return null;
  const url = String(value).trim().slice(0, 1200);
  const prefix = `${config.supabaseUrl}/storage/v1/object/public/product-images/`;
  if (!url.startsWith(prefix)) throw Object.assign(new Error("La foto del artículo no es válida."), { statusCode: 400 });
  return url;
}

function invoiceLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 150) throw Object.assign(new Error("Incluye al menos una línea de factura válida."), { statusCode: 400 });
  return lines.map((line) => {
    const productName = cleanText(line.productName, 240);
    const quantity = decimal(line.quantity, "cantidad", 0.001);
    const unitPriceCents = cents(line.unitPriceCents, "precio unitario");
    if (!productName) throw Object.assign(new Error("Falta el nombre de un producto de la factura."), { statusCode: 400 });
    return { product_code: cleanText(line.productCode, 100) || null, product_name: productName, quantity, unit: cleanText(line.unit, 30) || null, unit_price_cents: unitPriceCents, line_total_cents: Math.round(quantity * unitPriceCents), vat_percent: decimal(line.vatPercent, "IVA", 0, 100) };
  });
}

module.exports = async function handler(req, res) {
  try {
    const config = requireConfig(getConfig());
    if (req.method === "GET") {
      const reservationScope = String(req.query?.scope || "");
      if (reservationScope === "reservations_public") {
        const { from, to } = reservationRange(req.query);
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({ ok: true, ...(await reservationPublicData(config, from, to)) });
      }
      requireRoles(req);
      if (reservationScope === "reservations") {
        requireRoles(req, ["admin", "manager"]);
        const { from, to } = reservationRange(req.query);
        return res.status(200).json({ ok: true, ...(await reservationAdminData(config, from, to)) });
      }
      if (req.query?.scope === "categories") return res.status(200).json({ ok: true, categories: await listCategories(config) });
      if (req.query?.scope === "production") {
        requireRoles(req, ["admin", "manager"]);
        return res.status(200).json({ ok: true, ...(await productionData(config)) });
      }
      if (req.query?.scope === "accounting") {
        requireRoles(req, ["admin", "manager"]);
        return res.status(200).json({ ok: true, ...(await accountingData(config)) });
      }
      if (req.query?.scope === "invoice_file") {
        requireRoles(req, ["admin", "manager"]);
        const invoiceId = cleanText(req.query?.invoiceId, 80);
        const rows = await supabaseRequest(config, `supplier_invoices?id=eq.${encodeURIComponent(invoiceId)}&select=source_file_path&limit=1`, { method: "GET" });
        const sourcePath = Array.isArray(rows) ? rows[0]?.source_file_path : null;
        if (!sourcePath) return res.status(404).json({ ok: false, error: "Esta factura no tiene archivo adjunto." });
        const signed = await storageRequest(config, `object/sign/supplier-invoices/${encodeURIComponent(sourcePath)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 900 }) });
        const signedPath = signed?.signedURL || signed?.signedUrl;
        if (!signedPath) throw new Error("No se pudo abrir el archivo.");
        return res.status(200).json({ ok: true, url: `${config.supabaseUrl}/storage/v1${signedPath}` });
      }
      const includeInactive = String(req.query?.includeInactive || "") === "true";
      return res.status(200).json({ ok: true, products: await listProducts(config, includeInactive) });
    }

    const body = await readRequestBody(req);
    if (req.method === "POST" && body.action === "reservation_create") {
      const reservation = await createWebReservation(config, body);
      return res.status(201).json({ ok: true, reservation: { reference: reservation.reference, serviceDate: reservation.service_date, serviceTime: String(reservation.service_time || "").slice(0, 5), partySize: reservation.party_size, status: reservation.status } });
    }
    const session = requireRoles(req, ["admin", "manager"]);
    if (req.method === "POST" && body.action === "reservation_slot_create") {
      const rows = await supabaseRequest(config, "reservation_slots", { method: "POST", body: JSON.stringify({ service_date: reservationDate(body.serviceDate), service_time: reservationTime(body.serviceTime), capacity_people: reservationCapacity(body.capacityPeople), enabled: body.enabled !== false }) });
      const slot = Array.isArray(rows) ? rows[0] : rows;
      await audit(config, session.sub, "reservation_slots", slot?.id || "", "create", { serviceDate: slot?.service_date, serviceTime: slot?.service_time });
      return res.status(201).json({ ok: true, slot });
    }
    if (req.method === "PATCH" && body.action === "reservation_slot_update") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Turno de reserva no válido." });
      const current = await supabaseRequest(config, `reservation_slots?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { method: "GET" });
      const currentSlot = Array.isArray(current) ? current[0] : null;
      if (!currentSlot) return res.status(404).json({ ok: false, error: "Turno de reserva no encontrado." });
      const capacity = reservationCapacity(body.capacityPeople ?? currentSlot.capacity_people);
      if (capacity < Number(currentSlot.reserved_people || 0)) return res.status(409).json({ ok: false, error: "No puedes bajar el aforo por debajo de las plazas ya reservadas." });
      const rows = await supabaseRequest(config, `reservation_slots?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ service_date: reservationDate(body.serviceDate || currentSlot.service_date), service_time: reservationTime(body.serviceTime || String(currentSlot.service_time).slice(0, 5)), capacity_people: capacity, enabled: typeof body.enabled === "boolean" ? body.enabled : currentSlot.enabled }) });
      return res.status(200).json({ ok: true, slot: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "POST" && body.action === "reservation_menu_create") {
      const name = cleanText(body.name, 120);
      const price = body.priceCents === "" || body.priceCents === null || body.priceCents === undefined ? null : Math.round(Number(body.priceCents));
      if (name.length < 2 || (price !== null && (!Number.isInteger(price) || price < 0))) return res.status(400).json({ ok: false, error: "Revisa el nombre y el precio del menú." });
      const rows = await supabaseRequest(config, "reservation_menu_options", { method: "POST", body: JSON.stringify({ name, description: cleanText(body.description, 500) || null, price_cents: price, image_url: productImageUrl(config, body.imageUrl), sort_order: Math.max(0, Number.parseInt(body.sortOrder, 10) || 0), active: true }) });
      return res.status(201).json({ ok: true, menu: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "POST" && body.action === "reservation_menu_image_upload") {
      const file = productImageFile(body);
      const path = `reservation-menus/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomBytes(5).toString("hex")}-${file.fileName}`;
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      await storageRequest(config, `object/product-images/${encodedPath}`, { method: "POST", headers: { "Content-Type": file.mimeType, "x-upsert": "false" }, body: file.buffer });
      const url = `${config.supabaseUrl}/storage/v1/object/public/product-images/${encodedPath}`;
      await audit(config, session.sub, "reservation_menu_options", "images", "photo_upload", { path });
      return res.status(201).json({ ok: true, url });
    }
    if (req.method === "PATCH" && body.action === "reservation_menu_update") {
      const id = cleanText(body.id, 80);
      const name = cleanText(body.name, 120);
      const price = body.priceCents === "" || body.priceCents === null || body.priceCents === undefined ? null : Math.round(Number(body.priceCents));
      if (!id || name.length < 2 || (price !== null && (!Number.isInteger(price) || price < 0))) return res.status(400).json({ ok: false, error: "Revisa los datos del menú." });
      const changes = { name, description: cleanText(body.description, 500) || null, price_cents: price, sort_order: Math.max(0, Number.parseInt(body.sortOrder, 10) || 0), active: body.active !== false };
      if (Object.prototype.hasOwnProperty.call(body, "imageUrl")) changes.image_url = productImageUrl(config, body.imageUrl);
      const rows = await supabaseRequest(config, `reservation_menu_options?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });
      return res.status(200).json({ ok: true, menu: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "PATCH" && body.action === "reservation_status") {
      const status = cleanText(body.status, 20);
      const rows = await supabaseRequest(config, "rpc/admin_set_reservation_status", { method: "POST", body: JSON.stringify({ p_reservation_id: cleanText(body.id, 80), p_status: status }) });
      const reservation = Array.isArray(rows) ? rows[0] : rows;
      await audit(config, session.sub, "reservations", reservation?.id || "", "status", { status });
      return res.status(200).json({ ok: true, reservation });
    }
    if (req.method === "POST" && body.action === "account_create") {
      const code = cleanText(body.code, 12);
      const name = cleanText(body.name, 160);
      const groupCode = cleanText(body.groupCode, 1);
      const accountType = cleanText(body.accountType, 20);
      if (!/^\d{3,12}$/.test(code) || !["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(groupCode) || code.charAt(0) !== groupCode || !name || !["asset", "liability", "equity", "expense", "income"].includes(accountType)) {
        return res.status(400).json({ ok: false, error: "Completa un código, grupo, nombre y naturaleza de cuenta válidos." });
      }
      const rows = await supabaseRequest(config, "accounting_accounts", {
        method: "POST",
        body: JSON.stringify({ code, name, group_code: groupCode, account_type: accountType, active: true, is_system: false }),
      });
      const account = Array.isArray(rows) ? rows[0] : rows;
      await audit(config, session.sub, "accounting_accounts", account?.id || code, "create", { code, name, groupCode, accountType });
      return res.status(201).json({ ok: true, account });
    }
    if (req.method === "POST" && body.action === "accounting_entry_create") {
      const entry = await createAccountingEntry(config, session, body);
      return res.status(201).json({ ok: true, entry });
    }
    if (req.method === "POST" && body.action === "ingredient_create") {
      const name = cleanText(body.name, 160);
      const baseUnit = ["g", "ml", "unidad"].includes(body.baseUnit) ? body.baseUnit : "unidad";
      if (!name) return res.status(400).json({ ok: false, error: "Indica el nombre de la materia prima." });
      const rows = await supabaseRequest(config, "ingredients", { method: "POST", body: JSON.stringify({ name, base_unit: baseUnit, pack_quantity: decimal(body.packQuantity, "cantidad del envase", 0.001), pack_price_cents: cents(body.packPriceCents, "precio de compra"), purchase_vat_percent: decimal(body.purchaseVatPercent, "IVA de compra", 0, 100), stock_quantity: decimal(body.stockQuantity, "stock"), minimum_stock_quantity: decimal(body.minimumStockQuantity, "stock mínimo"), supplier: cleanText(body.supplier, 120) || null }) });
      const ingredient = Array.isArray(rows) ? rows[0] : rows;
      await audit(config, session.sub, "ingredients", ingredient.id, "create", { name });
      return res.status(201).json({ ok: true, ingredient });
    }
    if (req.method === "PATCH" && body.action === "ingredient_update") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Materia prima no válida." });
      const rows = await supabaseRequest(config, `ingredients?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ pack_quantity: decimal(body.packQuantity, "cantidad del envase", 0.001), pack_price_cents: cents(body.packPriceCents, "precio de compra"), purchase_vat_percent: decimal(body.purchaseVatPercent, "IVA de compra", 0, 100), stock_quantity: decimal(body.stockQuantity, "stock"), minimum_stock_quantity: decimal(body.minimumStockQuantity, "stock mínimo"), supplier: cleanText(body.supplier, 120) || null }) });
      return res.status(200).json({ ok: true, ingredient: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "PATCH" && body.action === "settings_update") {
      const rows = await supabaseRequest(config, "costing_settings?id=eq.true", { method: "PATCH", body: JSON.stringify({ sales_vat_percent: decimal(body.salesVatPercent, "IVA de venta", 0, 100), target_margin_percent: decimal(body.targetMarginPercent, "margen objetivo", 0, 99.99), overhead_per_serving_cents: cents(body.overheadPerServingCents, "gasto indirecto"), labour_per_serving_cents: cents(body.labourPerServingCents, "mano de obra") }) });
      return res.status(200).json({ ok: true, settings: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "PATCH" && body.action === "recipe_configure") {
      const productId = cleanText(body.productId, 80);
      if (!productId) return res.status(400).json({ ok: false, error: "Selecciona un producto de venta." });
      const recipe = await recipeForProduct(config, productId);
      const changes = { yield_quantity: decimal(body.yieldQuantity, "rendimiento", 0.001), direct_cost_cents: cents(body.directCostCents, "coste directo") };
      const rows = recipe ? await supabaseRequest(config, `product_recipes?id=eq.${encodeURIComponent(recipe.id)}`, { method: "PATCH", body: JSON.stringify(changes) }) : await supabaseRequest(config, "product_recipes", { method: "POST", body: JSON.stringify({ product_id: productId, ...changes }) });
      return res.status(200).json({ ok: true, recipe: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "POST" && body.action === "recipe_line_add") {
      const productId = cleanText(body.productId, 80);
      const ingredientId = cleanText(body.ingredientId, 80);
      if (!productId || !ingredientId) return res.status(400).json({ ok: false, error: "Selecciona producto e ingrediente." });
      let recipe = await recipeForProduct(config, productId);
      if (!recipe) { const created = await supabaseRequest(config, "product_recipes", { method: "POST", body: JSON.stringify({ product_id: productId }) }); recipe = Array.isArray(created) ? created[0] : created; }
      const existing = await supabaseRequest(config, `recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipe.id)}&ingredient_id=eq.${encodeURIComponent(ingredientId)}&select=id&limit=1`, { method: "GET" });
      const changes = { quantity: decimal(body.quantity, "cantidad de receta", 0.001), waste_percent: decimal(body.wastePercent, "merma", 0, 100) };
      const rows = Array.isArray(existing) && existing[0] ? await supabaseRequest(config, `recipe_ingredients?id=eq.${encodeURIComponent(existing[0].id)}`, { method: "PATCH", body: JSON.stringify(changes) }) : await supabaseRequest(config, "recipe_ingredients", { method: "POST", body: JSON.stringify({ recipe_id: recipe.id, ingredient_id: ingredientId, ...changes }) });
      return res.status(200).json({ ok: true, line: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "DELETE" && body.action === "recipe_line_delete") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Línea de receta no válida." });
      await supabaseRequest(config, `recipe_ingredients?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST" && body.action === "invoice_create") {
      const supplierName = cleanText(body.supplierName, 160);
      const invoiceNumber = cleanText(body.invoiceNumber, 100) || null;
      const invoiceDate = cleanText(body.invoiceDate, 20);
      const sourceFilePath = cleanText(body.sourceFilePath, 500) || null;
      if (!supplierName || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return res.status(400).json({ ok: false, error: "Indica proveedor y fecha de factura." });
      const lines = Array.isArray(body.lines) && body.lines.length ? invoiceLines(body.lines) : [];
      if (!lines.length && !sourceFilePath) return res.status(400).json({ ok: false, error: "Incluye líneas de factura o adjunta un archivo." });
      const subtotalCents = lines.reduce((total, line) => total + line.line_total_cents, 0);
      const vatCents = Math.round(lines.reduce((total, line) => total + line.line_total_cents * line.vat_percent / 100, 0));
      const invoiceAccounts = await supplierInvoiceAccounts(config, body.expenseAccountId, vatCents, subtotalCents);
      const rows = await supabaseRequest(config, "supplier_invoices", { method: "POST", body: JSON.stringify({ supplier_name: supplierName, invoice_number: invoiceNumber, invoice_date: invoiceDate, subtotal_cents: subtotalCents, vat_cents: vatCents, total_cents: subtotalCents + vatCents, classification_status: lines.length ? "manual" : "pending_ai", source_file_name: cleanText(body.sourceFileName, 180) || null, source_file_path: sourceFilePath, source_text: cleanText(body.sourceText, 12000) || null, created_by: session.sub }) });
      const invoice = Array.isArray(rows) ? rows[0] : rows;
      await supabaseRequest(config, "supplier_invoice_lines", { method: "POST", body: JSON.stringify(lines.map((line) => ({ ...line, invoice_id: invoice.id }))), headers: { Prefer: "return=minimal" } });
      const entry = await createSupplierInvoiceEntry(config, session, invoice, invoiceAccounts);
      if (entry?.id) await supabaseRequest(config, `supplier_invoices?id=eq.${encodeURIComponent(invoice.id)}`, { method: "PATCH", body: JSON.stringify({ accounting_entry_id: entry.id }) });
      await audit(config, session.sub, "supplier_invoices", invoice.id, "create", { supplierName, lines: lines.length, accountingEntryId: entry?.id || null });
      return res.status(201).json({ ok: true, invoice: { ...invoice, accounting_entry_id: entry?.id || null }, entry });
    }
    if (req.method === "POST" && body.action === "invoice_file_upload") {
      const file = invoiceFile(body);
      const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${file.fileName}`;
      await storageRequest(config, `object/supplier-invoices/${encodeURIComponent(path)}`, { method: "POST", headers: { "Content-Type": file.mimeType, "x-upsert": "false" }, body: file.buffer });
      return res.status(201).json({ ok: true, path, fileName: file.fileName });
    }
    if (req.method === "POST" && body.action === "product_image_upload") {
      const file = productImageFile(body);
      const path = `catalog/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomBytes(5).toString("hex")}-${file.fileName}`;
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      await storageRequest(config, `object/product-images/${encodedPath}`, { method: "POST", headers: { "Content-Type": file.mimeType, "x-upsert": "false" }, body: file.buffer });
      const url = `${config.supabaseUrl}/storage/v1/object/public/product-images/${encodedPath}`;
      await audit(config, session.sub, "products", "catalog", "photo_upload", { path });
      return res.status(201).json({ ok: true, url });
    }
    if (req.method === "PATCH" && body.action === "reorder_categories") {
      const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds.map((id) => cleanText(id, 80)).filter(Boolean) : [];
      const uniqueIds = [...new Set(categoryIds)];
      const categories = await listCategories(config);
      const validIds = new Set(categories.map((category) => category.id));
      if (!uniqueIds.length || uniqueIds.length !== categories.length || uniqueIds.some((id) => !validIds.has(id))) {
        return res.status(400).json({ ok: false, error: "El orden de familias no es válido." });
      }
      await Promise.all(uniqueIds.map((id, index) => supabaseRequest(config, `product_categories?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ sort_order: index }),
      })));
      const updatedCategories = await listCategories(config);
      await audit(config, session.sub, "product_categories", "catalog", "reorder", { categoryIds: uniqueIds });
      return res.status(200).json({ ok: true, categories: updatedCategories });
    }
    if (req.method === "POST" && body.action === "seed") {
      const count = await seedCatalog(config);
      await audit(config, session.sub, "products", "catalog", "seed", { count });
      return res.status(200).json({ ok: true, count, products: await listProducts(config) });
    }

    if (req.method === "POST" && body.action === "create") {
      const name = cleanText(body.name, 160);
      const variant = cleanText(body.variant, 120) || null;
      const description = cleanText(body.description, 500) || variant || null;
      if (!name) return res.status(400).json({ ok: false, error: "Indica el nombre del artículo." });
      const category = await categoryId(config, body.category);
      const priceCents = cents(body.priceCents, "precio de venta");
      const costCents = cents(body.costCents, "coste de compra", true);
      const kitchen = typeof body.sendsToKitchen === "boolean" ? body.sendsToKitchen : sendsToKitchen(category.name);
      const products = await supabaseRequest(config, "products", {
        method: "POST",
        body: JSON.stringify({
          external_id: `custom-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
          category_id: category.id,
          name,
          variant,
          description,
          image_url: productImageUrl(config, body.imageUrl),
          price_cents: priceCents,
          cost_cents: costCents,
          sends_to_kitchen: kitchen,
          active: true,
          sort_order: 9999,
        }),
        headers: { Prefer: "return=representation" },
      });
      const product = Array.isArray(products) ? products[0] : products;
      await audit(config, session.sub, "products", product?.id || name, "create", { name, category: category.name });
      return res.status(201).json({ ok: true, product });
    }

    if (req.method === "PATCH") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Artículo no válido." });
      const changes = {};
      if (Object.prototype.hasOwnProperty.call(body, "name")) {
        const name = cleanText(body.name, 160);
        if (!name) return res.status(400).json({ ok: false, error: "Indica el nombre del artículo." });
        changes.name = name;
      }
      if (Object.prototype.hasOwnProperty.call(body, "variant")) changes.variant = cleanText(body.variant, 120) || null;
      if (Object.prototype.hasOwnProperty.call(body, "description")) changes.description = cleanText(body.description, 500) || null;
      if (Object.prototype.hasOwnProperty.call(body, "imageUrl")) changes.image_url = productImageUrl(config, body.imageUrl);
      if (Object.prototype.hasOwnProperty.call(body, "priceCents")) changes.price_cents = cents(body.priceCents, "precio de venta");
      if (Object.prototype.hasOwnProperty.call(body, "costCents")) changes.cost_cents = cents(body.costCents, "coste de compra", true);
      if (typeof body.sendsToKitchen === "boolean") changes.sends_to_kitchen = body.sendsToKitchen;
      if (Object.prototype.hasOwnProperty.call(body, "category")) changes.category_id = (await categoryId(config, body.category)).id;
      if (!Object.keys(changes).length) return res.status(400).json({ ok: false, error: "No hay cambios para guardar." });
      const rows = await supabaseRequest(config, `products?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      const product = Array.isArray(rows) ? rows[0] : rows;
      if (!product) return res.status(404).json({ ok: false, error: "Artículo no encontrado." });
      await audit(config, session.sub, "products", id, "update", changes);
      return res.status(200).json({ ok: true, product });
    }

    if (req.method === "DELETE") {
      const id = cleanText(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: "Artículo no válido." });
      const rows = await supabaseRequest(config, `products?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      const product = Array.isArray(rows) ? rows[0] : rows;
      if (!product) return res.status(404).json({ ok: false, error: "Artículo no encontrado." });
      await audit(config, session.sub, "products", id, "archive", {});
      return res.status(200).json({ ok: true, product });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  } catch (error) {
    return sendError(res, error, "No se pudo actualizar el catálogo.");
  }
};
