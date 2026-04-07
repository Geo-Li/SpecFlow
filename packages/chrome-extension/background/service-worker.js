// Service worker: manages auth token and proxies API calls to SpecFlow server

const DEFAULT_SERVER_URL = "http://localhost:3001";

async function getConfig() {
  const result = await chrome.storage.local.get(["serverUrl", "token"]);
  return {
    serverUrl: result.serverUrl || DEFAULT_SERVER_URL,
    token: result.token || "",
  };
}

async function apiFetch(path, options = {}) {
  const { serverUrl, token } = await getConfig();
  const url = `${serverUrl}${path}`;
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function handleLogin({ serverUrl, password }) {
  if (serverUrl) {
    await chrome.storage.local.set({ serverUrl });
  }
  const { serverUrl: url } = await getConfig();
  const res = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  await chrome.storage.local.set({ token: data.token });
  return { ok: true };
}

async function handleCheckAuth() {
  try {
    const data = await apiFetch("/api/auth/check");
    return { authenticated: data.authenticated };
  } catch {
    return { authenticated: false };
  }
}

async function handleLogout() {
  await chrome.storage.local.remove("token");
  return { ok: true };
}

// Message handler — content scripts and popup communicate through here
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, payload } = message;

  const handlers = {
    login: () => handleLogin(payload),
    logout: () => handleLogout(),
    checkAuth: () => handleCheckAuth(),
    createSession: () =>
      apiFetch("/api/chat/sessions", {
        method: "POST",
        body: JSON.stringify({ title: payload.title }),
      }),
    getSessions: () => apiFetch("/api/chat/sessions"),
    getSession: () => apiFetch(`/api/chat/sessions/${payload.sessionId}`),
    sendMessage: () =>
      apiFetch(`/api/chat/sessions/${payload.sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: payload.content }),
      }),
    confirmPlan: () =>
      apiFetch(`/api/chat/sessions/${payload.sessionId}/confirm`, {
        method: "POST",
      }),
    cancelPlan: () =>
      apiFetch(`/api/chat/sessions/${payload.sessionId}/cancel`, {
        method: "POST",
      }),
  };

  const handler = handlers[type];
  if (!handler) {
    sendResponse({ error: `Unknown message type: ${type}` });
    return false;
  }

  handler()
    .then((data) => sendResponse({ data }))
    .catch((err) => sendResponse({ error: err.message }));

  return true; // Keep channel open for async response
});
