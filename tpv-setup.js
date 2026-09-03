(function () {
  const form = document.querySelector("[data-setup-form]");
  const message = document.querySelector("[data-setup-message]");
  if (!form || !message) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    message.textContent = "Preparando el TPV central…";
    try {
      const response = await fetch("/api/tpv-bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo completar la configuración.");
      message.textContent = "Administrador creado. Ya puedes iniciar sesión en Gestión TPV.";
      form.reset();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();
