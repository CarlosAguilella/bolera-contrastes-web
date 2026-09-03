(function () {
  const SESSION_KEY = "bc-tpv-session-v1";

  function getSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "");
      return saved?.token && saved?.user ? saved : null;
    } catch (error) {
      return null;
    }
  }

  function saveSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent("bc-tpv-session", { detail: session }));
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent("bc-tpv-session", { detail: null }));
  }

  async function request(path, options = {}) {
    const session = getSession();
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (options.body) headers["Content-Type"] = "application/json";
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    const response = await fetch(`/api/${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      const error = new Error(body.error || "No se pudo conectar con el TPV central.");
      error.status = response.status;
      if (response.status === 401) logout();
      throw error;
    }
    return body;
  }

  async function login(username, pin) {
    const result = await request("tpv-auth", { method: "POST", body: JSON.stringify({ username, pin }) });
    const session = { token: result.token, user: result.user };
    saveSession(session);
    return session;
  }

  async function loadTables() {
    const result = await request("tpv-tables");
    return result.tables || [];
  }

  function saveRemoteTables(data, tables) {
    if (!data || !Array.isArray(tables)) return data;
    data.tableLayout = tables.map((table) => ({
      id: String(table.table_number),
      name: `Mesa ${table.table_number}`,
      x: Number(table.position_x),
      y: Number(table.position_y),
      area: table.zone === "pared" ? "wall" : table.zone === "barra" ? "label" : "sala",
    }));
    data.cloudTableIds = Object.fromEntries(tables.map((table) => [String(table.table_number), table.id]));
    return data;
  }

  function tableId(data, tableNumber) {
    return data?.cloudTableIds?.[String(tableNumber)] || "";
  }

  async function createTable(input) {
    const result = await request("tpv-tables", { method: "POST", body: JSON.stringify(input) });
    return result.table;
  }

  async function updateTable(id, input) {
    const result = await request("tpv-tables", { method: "PATCH", body: JSON.stringify({ id, ...input }) });
    return result.table;
  }

  async function deleteTable(id) {
    return request("tpv-tables", { method: "DELETE", body: JSON.stringify({ id }) });
  }

  window.BC_TPV_CLOUD = {
    createTable,
    deleteTable,
    getSession,
    loadTables,
    login,
    logout,
    request,
    saveRemoteTables,
    tableId,
    updateTable,
  };
})();
