(function () {
  const Cloud = window.BC_TPV_CLOUD;
  const form = document.getElementById("new-product-form");
  const message = document.getElementById("new-product-message");
  if (!Cloud || !form || !message) return;

  const session = Cloud.getSession();
  if (!session || !["admin", "manager"].includes(session.user?.role)) {
    message.textContent = "Inicia sesión como administrador o gestor desde Gestión TPV antes de crear artículos.";
    form.querySelector("button[type=submit]").disabled = true;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const priceCents = Math.round(Number(values.get("price")) * 100);
    const rawCost = String(values.get("cost") || "").trim();
    if (!Number.isFinite(priceCents) || priceCents < 0 || (rawCost && (!Number.isFinite(Number(rawCost)) || Number(rawCost) < 0))) {
      message.textContent = "Introduce un precio válido.";
      return;
    }
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    message.textContent = "Guardando artículo…";
    try {
      await Cloud.createProduct({
        name: String(values.get("name") || "").trim(),
        category: String(values.get("category") || "").trim(),
        description: String(values.get("description") || "").trim(),
        priceCents,
        costCents: rawCost ? Math.round(Number(rawCost) * 100) : null,
        sendsToKitchen: values.get("sendsToKitchen") === "on",
      });
      message.textContent = "Artículo creado. Volviendo a Gestión TPV…";
      window.setTimeout(() => { window.location.href = "tpv-gestion.html"; }, 700);
    } catch (error) {
      message.textContent = error.message || "No se pudo crear el artículo.";
      submit.disabled = false;
    }
  });
})();
