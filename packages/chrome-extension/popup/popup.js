const serverUrlInput = document.getElementById("server-url");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const errorEl = document.getElementById("error");
const statusEl = document.getElementById("status");
const loginForm = document.getElementById("login-form");
const loggedIn = document.getElementById("logged-in");

async function send(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, resolve);
  });
}

async function checkStatus() {
  const stored = await chrome.storage.local.get(["serverUrl"]);
  if (stored.serverUrl) serverUrlInput.value = stored.serverUrl;

  const result = await send("checkAuth");
  if (result && result.data && result.data.authenticated) {
    loginForm.style.display = "none";
    loggedIn.style.display = "block";
    statusEl.textContent = "Authenticated";
    statusEl.className = "status ok";
  } else {
    loginForm.style.display = "block";
    loggedIn.style.display = "none";
    statusEl.textContent = "Not connected";
    statusEl.className = "status fail";
  }
}

loginBtn.addEventListener("click", async () => {
  errorEl.textContent = "";
  loginBtn.disabled = true;
  const serverUrl = serverUrlInput.value.replace(/\/+$/, "") || undefined;
  const password = passwordInput.value;

  if (!password) {
    errorEl.textContent = "Password is required";
    loginBtn.disabled = false;
    return;
  }

  const result = await send("login", { serverUrl, password });
  loginBtn.disabled = false;

  if (result && result.error) {
    errorEl.textContent = result.error;
  } else {
    await checkStatus();
  }
});

logoutBtn.addEventListener("click", async () => {
  await send("logout");
  await checkStatus();
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

checkStatus();
