// Bolera Contrastes — Puntos Contrastes (piloto local)
const { useEffect: useEffectP, useMemo: useMemoP, useRef: useRefP, useState: useStateP } = React;

const BC_POINTS_STORAGE_KEY = "bc_points_contrastes_v1";

const BC_POINTS_OFFERS = [
  { id: "r10", euros: 10, points: 10.5, bonus: 0.5, label: "Recarga rápida" },
  { id: "r30", euros: 30, points: 32, bonus: 2, label: "La más equilibrada" },
  { id: "r50", euros: 50, points: 55, bonus: 5, label: "Mejor valor" },
];

const BC_POINTS_PRODUCTS = [
  { id: "cocacola", name: "Coca-Cola", points: 2, cat: "Bebida" },
  { id: "cafe", name: "Café", points: 1.5, cat: "Café" },
  { id: "cana", name: "Caña", points: 2.2, cat: "Bebida" },
  { id: "tapa", name: "Tapa", points: 4.5, cat: "Comida" },
  { id: "bravas", name: "Bravas", points: 6.5, cat: "Comida" },
  { id: "burger", name: "Hamburguesa", points: 9, cat: "Comida" },
];

function pointsNowIso() {
  return new Date().toISOString();
}

function pointsId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function bizumReference(customer, offer) {
  const customerPart = customerShortCode(customer) || "CLIENTE";
  const offerPart = String(offer?.euros || 0).replace(/\D/g, "");
  return `BC-${customerPart}-${offerPart}`;
}

function normalizePoints(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatPoints(value) {
  const amount = normalizePoints(value);
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(amount)} puntos`;
}

function formatEuros(value) {
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function seedPointsStore() {
  const createdAt = pointsNowIso();
  const customer = {
    id: "cli-demo",
    name: "Cliente demo",
    phone: "600 123 123",
    pin: "1234",
    balance: 32.5,
    createdAt,
  };

  return {
    customers: [customer],
    transactions: [
      {
        id: "mov-demo-3",
        customerId: customer.id,
        type: "pago",
        amount: -2,
        label: "Pago Coca-Cola",
        employee: "Barra",
        method: "QR",
        status: "confirmado",
        createdAt,
      },
      {
        id: "mov-demo-2",
        customerId: customer.id,
        type: "recarga",
        amount: 32,
        label: "Recarga 30 € + 2 puntos extra",
        employee: "Barra",
        method: "Bizum confirmado",
        status: "confirmado",
        createdAt,
      },
      {
        id: "mov-demo-1",
        customerId: customer.id,
        type: "registro",
        amount: 0,
        label: "Cuenta creada",
        employee: "Sistema",
        method: "Web",
        status: "confirmado",
        createdAt,
      },
    ],
  };
}

function loadPointsStore() {
  try {
    const saved = localStorage.getItem(BC_POINTS_STORAGE_KEY);
    if (!saved) return seedPointsStore();
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.customers) || !Array.isArray(parsed.transactions)) {
      return seedPointsStore();
    }
    return parsed;
  } catch (error) {
    return seedPointsStore();
  }
}

function customerInitials(customer) {
  return customer.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "BC";
}

function buildQrCells(seed) {
  const digits = String(seed || "contrastes")
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return Array.from({ length: 49 }, (_, index) => {
    const isFinder =
      (index < 14 && index % 7 < 2) ||
      (index > 34 && index % 7 > 4) ||
      (index % 7 === 0 && index < 21);
    return isFinder || ((index * 11 + digits) % 5 !== 0);
  });
}

function customerQrPayload(customer) {
  return customer ? `BCPUNTOS:${customer.id}` : "";
}

function customerShortCode(customer) {
  return customer ? customer.id.replace(/^cli-/, "").slice(0, 10).toUpperCase() : "";
}

function parseCustomerQrPayload(rawValue) {
  const value = String(rawValue || "").trim();
  if (value.startsWith("BCPUNTOS:")) return value.replace("BCPUNTOS:", "");
  return value;
}

function Puntos() {
  const [store, setStore] = useStateP(loadPointsStore);
  const [view, setView] = useStateP("cliente");
  const [selectedCustomerId, setSelectedCustomerId] = useStateP(() => store.customers[0]?.id || "");
  const [notice, setNotice] = useStateP("");
  const [registerForm, setRegisterForm] = useStateP({ name: "", phone: "", pin: "" });
  const [manualForm, setManualForm] = useStateP({ amount: "", reason: "" });
  const [adminPin, setAdminPin] = useStateP("");
  const [adminUnlocked, setAdminUnlocked] = useStateP(false);
  const [pendingBizum, setPendingBizum] = useStateP(null);

  useEffectP(() => {
    localStorage.setItem(BC_POINTS_STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  useEffectP(() => {
    if (!selectedCustomerId && store.customers[0]) {
      setSelectedCustomerId(store.customers[0].id);
    }
  }, [selectedCustomerId, store.customers]);

  useEffectP(() => {
    setPendingBizum(null);
  }, [selectedCustomerId]);

  const selectedCustomer = useMemoP(
    () => store.customers.find((customer) => customer.id === selectedCustomerId) || store.customers[0],
    [selectedCustomerId, store.customers]
  );

  const selectedTransactions = useMemoP(() => {
    if (!selectedCustomer) return [];
    return store.transactions
      .filter((transaction) => transaction.customerId === selectedCustomer.id)
      .slice(0, 8);
  }, [selectedCustomer, store.transactions]);

  const totalBalance = useMemoP(
    () => store.customers.reduce((sum, customer) => sum + normalizePoints(customer.balance), 0),
    [store.customers]
  );

  const todayPayments = useMemoP(() => {
    const today = new Date().toISOString().slice(0, 10);
    return store.transactions
      .filter((transaction) => transaction.type === "pago" && transaction.createdAt.slice(0, 10) === today)
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  }, [store.transactions]);

  function showNotice(message) {
    setNotice(message);
    setTimeout(() => setNotice(""), 2800);
  }

  function pushTransaction(customerId, transaction) {
    setStore((currentStore) => {
      const amount = normalizePoints(transaction.amount);
      const customers = currentStore.customers.map((customer) => {
        if (customer.id !== customerId) return customer;
        return { ...customer, balance: normalizePoints(customer.balance + amount) };
      });
      return {
        ...currentStore,
        customers,
        transactions: [
          {
            id: pointsId("mov"),
            customerId,
            amount,
            status: "confirmado",
            createdAt: pointsNowIso(),
            ...transaction,
          },
          ...currentStore.transactions,
        ],
      };
    });
  }

  function registerCustomer(event) {
    event.preventDefault();
    const name = registerForm.name.trim();
    const phone = registerForm.phone.trim();
    const pin = registerForm.pin.trim();

    if (name.length < 2 || phone.length < 6 || pin.length < 4) {
      showNotice("Completa nombre, teléfono y PIN de 4 números.");
      return;
    }

    const existing = store.customers.find((customer) => customer.phone.replace(/\s/g, "") === phone.replace(/\s/g, ""));
    if (existing) {
      setSelectedCustomerId(existing.id);
      setView("cliente");
      showNotice("Ese teléfono ya existe. Cuenta seleccionada.");
      return;
    }

    const customer = {
      id: pointsId("cli"),
      name,
      phone,
      pin,
      balance: 0,
      createdAt: pointsNowIso(),
    };

    setStore((currentStore) => ({
      ...currentStore,
      customers: [customer, ...currentStore.customers],
      transactions: [
        {
          id: pointsId("mov"),
          customerId: customer.id,
          type: "registro",
          amount: 0,
          label: "Cuenta creada",
          employee: "Sistema",
          method: "Web",
          status: "confirmado",
          createdAt: pointsNowIso(),
        },
        ...currentStore.transactions,
      ],
    }));
    setSelectedCustomerId(customer.id);
    setRegisterForm({ name: "", phone: "", pin: "" });
    showNotice("Cuenta creada. Ya se puede recargar saldo.");
  }

  function rechargeCustomer(offer, origin = "Web") {
    if (!selectedCustomer) return;
    pushTransaction(selectedCustomer.id, {
      type: "recarga",
      amount: offer.points,
      label: `Recarga ${formatEuros(offer.euros)} + ${formatPoints(offer.bonus)} extra`,
      employee: origin,
      method: origin === "Web" ? "Bizum simulado" : "Caja",
    });
    showNotice(`Recarga añadida: ${formatPoints(offer.points)}.`);
  }

  function startBizumRecharge(offer) {
    if (!selectedCustomer) return;
    setPendingBizum({
      offer,
      reference: bizumReference(selectedCustomer, offer),
      createdAt: pointsNowIso(),
    });
    showNotice("Bizum preparado. Confirma cuando esté pagado.");
  }

  function confirmBizumRecharge() {
    if (!selectedCustomer || !pendingBizum) return;
    pushTransaction(selectedCustomer.id, {
      type: "recarga",
      amount: pendingBizum.offer.points,
      label: `Bizum ${formatEuros(pendingBizum.offer.euros)} + ${formatPoints(pendingBizum.offer.bonus)} extra`,
      employee: "Web",
      method: `Bizum demo · Ref. ${pendingBizum.reference}`,
    });
    showNotice(`Bizum confirmado: ${formatPoints(pendingBizum.offer.points)} añadidos.`);
    setPendingBizum(null);
  }

  function chargeProduct(product) {
    if (!selectedCustomer) return;
    if (normalizePoints(selectedCustomer.balance) < product.points) {
      showNotice("Saldo insuficiente para este pago.");
      return;
    }

    pushTransaction(selectedCustomer.id, {
      type: "pago",
      amount: -product.points,
      label: `Pago ${product.name}`,
      employee: "Barra",
      method: "QR / teléfono",
    });
    showNotice(`${product.name} cobrado con puntos.`);
  }

  function manualAdjustment(event) {
    event.preventDefault();
    if (!selectedCustomer) return;
    const amount = normalizePoints(manualForm.amount.replace(",", "."));
    const reason = manualForm.reason.trim() || "Ajuste manual";

    if (!amount) {
      showNotice("Indica una cantidad positiva o negativa.");
      return;
    }

    if (amount < 0 && selectedCustomer.balance + amount < 0) {
      showNotice("El ajuste dejaría el saldo en negativo.");
      return;
    }

    pushTransaction(selectedCustomer.id, {
      type: "ajuste",
      amount,
      label: reason,
      employee: "Admin",
      method: "Panel interno",
    });
    setManualForm({ amount: "", reason: "" });
    showNotice("Ajuste registrado.");
  }

  function resetDemo() {
    const seeded = seedPointsStore();
    setStore(seeded);
    setSelectedCustomerId(seeded.customers[0].id);
    showNotice("Datos del piloto reiniciados.");
  }

  function unlockAdmin(event) {
    event.preventDefault();
    if (adminPin === "1998") {
      setAdminUnlocked(true);
      setAdminPin("");
      showNotice("Panel de barra desbloqueado.");
      return;
    }
    showNotice("PIN incorrecto. PIN piloto: 1998.");
  }

  function selectCustomerFromQr(rawValue) {
    const parsedId = parseCustomerQrPayload(rawValue);
    const normalized = String(parsedId || "").trim().toLowerCase();
    const customer = store.customers.find((item) => {
      return item.id.toLowerCase() === normalized || customerShortCode(item).toLowerCase() === normalized;
    });

    if (!customer) {
      showNotice("QR no reconocido. Prueba con el código manual del cliente.");
      return false;
    }

    setSelectedCustomerId(customer.id);
    showNotice(`Cliente seleccionado: ${customer.name}.`);
    return true;
  }

  return (
    <main className="points-page" data-screen-label="Puntos Contrastes">
      <section className="points-hero">
        <div className="bc-container points-hero__inner">
          <div>
            <span className="eyebrow">Piloto interno</span>
            <h1 className="points-hero__title">
              Puntos Contrastes para pagar en barra.
            </h1>
            <p className="points-hero__copy pretty">
              Registro de clientes, saldo recargable, ofertas tipo Bizum, pagos con QR o teléfono e historial completo para controlar cada movimiento.
            </p>
            <div className="points-hero__actions">
              <button className="btn btn-primary btn-lg" onClick={() => setView("cliente")}>Vista cliente</button>
              <button className="btn btn-secondary btn-lg" onClick={() => setView("barra")}>Panel barra</button>
            </div>
          </div>

          <div className="points-hero__card">
            <span className="points-card-label">Saldo total piloto</span>
            <strong>{formatPoints(totalBalance)}</strong>
            <div className="points-hero__stats">
              <span>{store.customers.length} clientes</span>
              <span>{formatPoints(todayPayments)} cobrado hoy</span>
            </div>
          </div>
        </div>
      </section>

      <section className="bc-container points-shell">
        <div className="points-notice">
          <strong>Modo piloto:</strong> funciona hoy en este navegador y guarda datos en local. Para producción hay que conectar Supabase, login real y Bizum/Redsys.
        </div>

        {notice && <div className="points-toast">{notice}</div>}

        <div className="points-tabs" role="tablist" aria-label="Vistas de Puntos Contrastes">
          <button className={view === "cliente" ? "is-active" : ""} onClick={() => setView("cliente")}>Cliente</button>
          <button className={view === "barra" ? "is-active" : ""} onClick={() => setView("barra")}>Barra / Admin</button>
          <button onClick={resetDemo}>Reiniciar demo</button>
        </div>

        {view === "cliente" ? (
          <ClientPointsView
            customer={selectedCustomer}
            customers={store.customers}
            registerForm={registerForm}
            setRegisterForm={setRegisterForm}
            selectedTransactions={selectedTransactions}
            setSelectedCustomerId={setSelectedCustomerId}
            onRegister={registerCustomer}
            pendingBizum={pendingBizum}
            onStartBizum={startBizumRecharge}
            onConfirmBizum={confirmBizumRecharge}
            onCancelBizum={() => setPendingBizum(null)}
          />
        ) : !adminUnlocked ? (
          <AdminLock adminPin={adminPin} setAdminPin={setAdminPin} onUnlock={unlockAdmin} />
        ) : (
          <BarPointsView
            customer={selectedCustomer}
            customers={store.customers}
            transactions={store.transactions}
            manualForm={manualForm}
            setManualForm={setManualForm}
            setSelectedCustomerId={setSelectedCustomerId}
            onRecharge={rechargeCustomer}
            onCharge={chargeProduct}
            onAdjust={manualAdjustment}
            onScanCustomer={selectCustomerFromQr}
          />
        )}
      </section>
    </main>
  );
}

function AdminLock({ adminPin, setAdminPin, onUnlock }) {
  return (
    <section className="points-panel points-lock">
      <span className="eyebrow">Panel interno</span>
      <h2>Acceso barra</h2>
      <p>
        Este panel permite recargar saldo, cobrar productos y modificar puntos. En el piloto usa el PIN <strong>1998</strong>.
      </p>
      <form className="points-form" onSubmit={onUnlock}>
        <label>
          PIN de barra
          <input
            value={adminPin}
            onChange={(event) => setAdminPin(event.target.value)}
            placeholder="1998"
            maxLength="4"
          />
        </label>
        <button className="btn btn-primary btn-block" type="submit">Entrar al panel</button>
      </form>
    </section>
  );
}

function CustomerQr({ customer }) {
  const canvasRef = useRefP(null);
  const payload = customerQrPayload(customer);

  useEffectP(() => {
    if (!canvasRef.current || !payload || !window.QRCode) return;
    window.QRCode.toCanvas(canvasRef.current, payload, {
      width: 220,
      margin: 1,
      color: {
        dark: "#1B1814",
        light: "#FFFDF8",
      },
    });
  }, [payload]);

  if (!customer) return null;

  if (!window.QRCode) {
    return (
      <div className="points-qr" aria-label="QR visual del cliente">
        {buildQrCells(customer.id).map((active, index) => (
          <i key={index} className={active ? "is-on" : ""}></i>
        ))}
      </div>
    );
  }

  return (
    <div className="points-qr-real">
      <canvas ref={canvasRef} aria-label="QR real del cliente"></canvas>
      <span>Código: {customerShortCode(customer)}</span>
    </div>
  );
}

function BizumDemoBox({ customer, pendingBizum, onConfirm, onCancel }) {
  const phone = window.BC_INFO?.phonePretty || window.BC_INFO?.phone || "Teléfono del local";
  const { offer, reference } = pendingBizum;

  return (
    <div className="points-bizum-box">
      <div>
        <span className="eyebrow">Pago Bizum</span>
        <h3>Envía {formatEuros(offer.euros)}</h3>
        <p>
          Cliente: <strong>{customer.name}</strong><br/>
          Número del local: <strong>{phone}</strong><br/>
          Concepto: <strong>{reference}</strong>
        </p>
      </div>
      <div className="points-bizum-box__summary">
        <span>Saldo que recibirá</span>
        <strong>{formatPoints(offer.points)}</strong>
        <em>Incluye +{formatPoints(offer.bonus)} extra</em>
      </div>
      <div className="points-bizum-box__actions">
        <button className="btn btn-primary" type="button" onClick={onConfirm}>He hecho el Bizum</button>
        <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancelar</button>
      </div>
      <p className="points-help">
        Piloto: este botón simula la confirmación. En producción solo se sumará saldo cuando Redsys/Bizum confirme el pago.
      </p>
    </div>
  );
}

function QrScanner({ onScanCustomer }) {
  const videoRef = useRefP(null);
  const canvasRef = useRefP(null);
  const streamRef = useRefP(null);
  const frameRef = useRefP(null);
  const [isScanning, setIsScanning] = useStateP(false);
  const [manualCode, setManualCode] = useStateP("");
  const [scanStatus, setScanStatus] = useStateP("Listo para abrir cámara.");

  function stopScanner() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    setIsScanning(false);
  }

  useEffectP(() => {
    return () => stopScanner();
  }, []);

  function scanFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !window.jsQR) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);

      if (code?.data) {
        const found = onScanCustomer(code.data);
        setScanStatus(found ? "QR leído y cliente seleccionado." : "QR leído, pero no coincide con ningún cliente.");
        stopScanner();
        return;
      }
    }

    frameRef.current = requestAnimationFrame(scanFrame);
  }

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanStatus("Este navegador no permite cámara aquí. Usa el código manual.");
      return;
    }

    if (!window.jsQR) {
      setScanStatus("No se ha cargado el lector QR. Usa el código manual.");
      return;
    }

    try {
      stopScanner();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setIsScanning(true);
      setScanStatus("Apunta la cámara al QR del cliente.");
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      setScanStatus("No se pudo abrir la cámara. Revisa permisos o usa el código manual.");
      setIsScanning(false);
    }
  }

  function submitManualCode(event) {
    event.preventDefault();
    if (!manualCode.trim()) return;
    const found = onScanCustomer(manualCode);
    setScanStatus(found ? "Código manual reconocido." : "Código manual no encontrado.");
    if (found) setManualCode("");
  }

  return (
    <div className="points-scanner">
      <div className="points-section-title">
        <h3>Lector QR</h3>
        <span>Cámara o código manual</span>
      </div>
      <div className="points-scanner__stage">
        <video ref={videoRef} muted playsInline></video>
        {!isScanning && <div className="points-scanner__empty">Cámara apagada</div>}
        <canvas ref={canvasRef} hidden></canvas>
      </div>
      <div className="points-scanner__actions">
        <button className="btn btn-primary" type="button" onClick={startScanner}>Abrir cámara</button>
        <button className="btn btn-secondary" type="button" onClick={stopScanner}>Cerrar</button>
      </div>
      <form className="points-scanner__manual" onSubmit={submitManualCode}>
        <input
          value={manualCode}
          onChange={(event) => setManualCode(event.target.value)}
          placeholder="Código del cliente"
        />
        <button className="btn btn-secondary" type="submit">Buscar</button>
      </form>
      <p className="points-help">{scanStatus}</p>
    </div>
  );
}

function ClientPointsView({
  customer,
  customers,
  registerForm,
  setRegisterForm,
  selectedTransactions,
  setSelectedCustomerId,
  onRegister,
  pendingBizum,
  onStartBizum,
  onConfirmBizum,
  onCancelBizum,
}) {
  return (
    <div className="points-grid">
      <section className="points-panel points-panel--register">
        <div className="points-panel__head">
          <span className="eyebrow">Acceso cliente</span>
          <h2>Registro rápido</h2>
        </div>
        <form className="points-form" onSubmit={onRegister}>
          <label>
            Nombre
            <input
              value={registerForm.name}
              onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })}
              placeholder="María García"
            />
          </label>
          <label>
            Teléfono
            <input
              value={registerForm.phone}
              onChange={(event) => setRegisterForm({ ...registerForm, phone: event.target.value })}
              placeholder="600 000 000"
            />
          </label>
          <label>
            PIN
            <input
              value={registerForm.pin}
              onChange={(event) => setRegisterForm({ ...registerForm, pin: event.target.value })}
              placeholder="1234"
              maxLength="4"
            />
          </label>
          <button className="btn btn-primary btn-block" type="submit">Crear cuenta</button>
        </form>

        <div className="points-select">
          <span>Probar con cliente existente</span>
          <select value={customer?.id || ""} onChange={(event) => setSelectedCustomerId(event.target.value)}>
            {customers.map((option) => (
              <option key={option.id} value={option.id}>{option.name} · {formatPoints(option.balance)}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="points-panel points-wallet">
        {customer && (
          <React.Fragment>
            <div className="points-wallet__top">
              <div>
                <span className="eyebrow">Mi saldo</span>
                <h2>{customer.name}</h2>
                <p>{customer.phone}</p>
              </div>
              <div className="points-avatar">{customerInitials(customer)}</div>
            </div>
            <div className="points-balance-card">
              <span>Saldo disponible</span>
              <strong>{formatPoints(customer.balance)}</strong>
              <small>1 € = 1 punto. Saldo solo para Bolera Contrastes.</small>
            </div>
            <CustomerQr customer={customer} />
            <p className="points-help">En barra se escanea este QR o se busca tu teléfono.</p>
          </React.Fragment>
        )}
      </section>

      <section className="points-panel points-panel--wide">
        <div className="points-panel__head">
          <span className="eyebrow">Recargar con Bizum</span>
          <h2>Ofertas activas</h2>
        </div>
        <div className="points-offers">
          {BC_POINTS_OFFERS.map((offer) => (
            <button key={offer.id} className="points-offer" onClick={() => onStartBizum(offer)} type="button">
              <span>{offer.label}</span>
              <strong>{formatEuros(offer.euros)}</strong>
              <em>Recibes {formatPoints(offer.points)}</em>
              <small>Bonus: +{formatPoints(offer.bonus)}</small>
            </button>
          ))}
        </div>
        <p className="points-help">
          En producción este paso se confirmará automáticamente con Bizum comercio mediante Redsys/TPV virtual.
        </p>
        {pendingBizum && customer && (
          <BizumDemoBox
            customer={customer}
            pendingBizum={pendingBizum}
            onConfirm={onConfirmBizum}
            onCancel={onCancelBizum}
          />
        )}
      </section>

      <section className="points-panel">
        <div className="points-panel__head">
          <span className="eyebrow">Movimientos</span>
          <h2>Historial</h2>
        </div>
        <TransactionList transactions={selectedTransactions} />
      </section>
    </div>
  );
}

function BarPointsView({
  customer,
  customers,
  transactions,
  manualForm,
  setManualForm,
  setSelectedCustomerId,
  onRecharge,
  onCharge,
  onAdjust,
  onScanCustomer,
}) {
  return (
    <div className="points-admin">
      <aside className="points-panel points-customers">
        <div className="points-panel__head">
          <span className="eyebrow">Clientes</span>
          <h2>Seleccionar</h2>
        </div>
        <div className="points-customer-list">
          {customers.map((option) => (
            <button
              key={option.id}
              className={customer?.id === option.id ? "is-active" : ""}
              onClick={() => setSelectedCustomerId(option.id)}
              type="button"
            >
              <span>{option.name}</span>
              <strong>{formatPoints(option.balance)}</strong>
            </button>
          ))}
        </div>
      </aside>

      <section className="points-panel points-admin-main">
        {customer && (
          <React.Fragment>
            <div className="points-admin-summary">
              <div>
                <span className="eyebrow">Cliente activo</span>
                <h2>{customer.name}</h2>
                <p>{customer.phone}</p>
              </div>
              <strong>{formatPoints(customer.balance)}</strong>
            </div>

            <div className="points-admin-section">
              <QrScanner onScanCustomer={onScanCustomer} />
            </div>

            <div className="points-admin-section">
              <div className="points-section-title">
                <h3>Recargar saldo</h3>
                <span>Confirmación manual de caja/Bizum</span>
              </div>
              <div className="points-action-grid">
                {BC_POINTS_OFFERS.map((offer) => (
                  <button key={offer.id} className="points-admin-action" onClick={() => onRecharge(offer, "Barra")} type="button">
                    <strong>{formatEuros(offer.euros)}</strong>
                    <span>Sumar {formatPoints(offer.points)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="points-admin-section">
              <div className="points-section-title">
                <h3>Cobrar producto</h3>
                <span>Descuenta puntos del saldo</span>
              </div>
              <div className="points-products">
                {BC_POINTS_PRODUCTS.map((product) => (
                  <button key={product.id} onClick={() => onCharge(product)} type="button">
                    <span>{product.cat}</span>
                    <strong>{product.name}</strong>
                    <em>{formatPoints(product.points)}</em>
                  </button>
                ))}
              </div>
            </div>

            <form className="points-admin-section points-adjust" onSubmit={onAdjust}>
              <div className="points-section-title">
                <h3>Ajuste manual</h3>
                <span>Ejemplo: +5 o -2,5 puntos</span>
              </div>
              <input
                value={manualForm.amount}
                onChange={(event) => setManualForm({ ...manualForm, amount: event.target.value })}
                placeholder="+5"
              />
              <input
                value={manualForm.reason}
                onChange={(event) => setManualForm({ ...manualForm, reason: event.target.value })}
                placeholder="Motivo del ajuste"
              />
              <button className="btn btn-secondary" type="submit">Guardar ajuste</button>
            </form>
          </React.Fragment>
        )}
      </section>

      <section className="points-panel points-admin-history">
        <div className="points-panel__head">
          <span className="eyebrow">Auditoría</span>
          <h2>Últimos movimientos</h2>
        </div>
        <TransactionList transactions={transactions.slice(0, 12)} showCustomer={true} customers={customers} />
      </section>
    </div>
  );
}

function TransactionList({ transactions, showCustomer = false, customers = [] }) {
  if (!transactions.length) {
    return <p className="points-help">Todavía no hay movimientos.</p>;
  }

  return (
    <div className="points-transactions">
      {transactions.map((transaction) => {
        const customer = customers.find((item) => item.id === transaction.customerId);
        return (
          <article key={transaction.id} className={"points-transaction is-" + transaction.type}>
            <div>
              <strong>{transaction.label}</strong>
              <span>
                {formatDateTime(transaction.createdAt)}
                {showCustomer && customer ? ` · ${customer.name}` : ""}
                {" · "}
                {transaction.employee}
              </span>
            </div>
            <em>{transaction.amount > 0 ? "+" : ""}{formatPoints(transaction.amount)}</em>
          </article>
        );
      })}
    </div>
  );
}

window.Puntos = Puntos;
