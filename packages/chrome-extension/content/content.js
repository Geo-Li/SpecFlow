// SpecFlow Content Script — Chat Widget
// Injects a floating chat bubble and panel into a shadow DOM on localhost pages.
// SAFETY: All dynamic content uses textContent or safe DOM construction. No innerHTML with dynamic data.

(function () {
  "use strict";

  // Prevent double-injection
  if (document.getElementById("specflow-chat-root")) return;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let sessions = [];
  let activeSessionId = null;
  let isOpen = false;
  let isLoading = false;
  let pollTimer = null;

  // ---------------------------------------------------------------------------
  // Shadow DOM host
  // ---------------------------------------------------------------------------
  const host = document.createElement("div");
  host.id = "specflow-chat-root";
  const shadow = host.attachShadow({ mode: "closed" });

  // Load stylesheet into shadow root
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("content/content.css");
  shadow.appendChild(link);

  // ---------------------------------------------------------------------------
  // Helper: send message to background service worker
  // ---------------------------------------------------------------------------
  function send(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response ? response.data : null);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helper: create an element with classes
  // ---------------------------------------------------------------------------
  function el(tag, ...classNames) {
    const elem = document.createElement(tag);
    if (classNames.length) elem.classList.add(...classNames);
    return elem;
  }

  // ---------------------------------------------------------------------------
  // Build UI elements
  // ---------------------------------------------------------------------------

  // -- Bubble button --
  const bubble = el("button", "sf-bubble");
  bubble.setAttribute("aria-label", "Open SpecFlow chat");
  const bubbleSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  bubbleSvg.setAttribute("viewBox", "0 0 24 24");
  const bubblePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  bubblePath.setAttribute(
    "d",
    "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
  );
  bubbleSvg.appendChild(bubblePath);
  bubble.appendChild(bubbleSvg);

  // -- Panel --
  const panel = el("div", "sf-panel");

  // Header
  const header = el("div", "sf-header");
  const headerTitle = el("span", "sf-header-title");
  headerTitle.textContent = "SpecFlow";
  const headerActions = el("div", "sf-header-actions");

  const newBtn = el("button", "sf-header-btn");
  newBtn.textContent = "+";
  newBtn.title = "New thread";

  const minBtn = el("button", "sf-header-btn");
  minBtn.textContent = "\u2212"; // minus sign
  minBtn.title = "Minimize";

  headerActions.appendChild(newBtn);
  headerActions.appendChild(minBtn);
  header.appendChild(headerTitle);
  header.appendChild(headerActions);
  panel.appendChild(header);

  // Body
  const body = el("div", "sf-body");

  // Thread list
  const threadList = el("div", "sf-threads");

  // Conversation area
  const conversation = el("div", "sf-conversation");
  const messagesArea = el("div", "sf-messages");
  const actionsBar = el("div", "sf-actions");
  actionsBar.style.display = "none";

  const confirmBtn = el("button", "sf-action-btn", "confirm");
  confirmBtn.textContent = "Confirm Plan";
  const cancelBtn = el("button", "sf-action-btn", "cancel");
  cancelBtn.textContent = "Cancel";
  actionsBar.appendChild(confirmBtn);
  actionsBar.appendChild(cancelBtn);

  const statusBar = el("div", "sf-status-bar");
  statusBar.style.display = "none";

  // Input area
  const inputArea = el("div", "sf-input-area");
  const textarea = document.createElement("textarea");
  textarea.classList.add("sf-input");
  textarea.placeholder = "Type a message\u2026";
  textarea.rows = 1;

  const sendBtn = el("button", "sf-send-btn");
  sendBtn.setAttribute("aria-label", "Send message");
  const sendSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sendSvg.setAttribute("viewBox", "0 0 24 24");
  sendSvg.setAttribute("width", "16");
  sendSvg.setAttribute("height", "16");
  sendSvg.setAttribute("fill", "none");
  sendSvg.setAttribute("stroke", "currentColor");
  sendSvg.setAttribute("stroke-width", "2");
  const sendPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  sendPath.setAttribute("d", "M22 2L11 13");
  const sendPoly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  sendPoly.setAttribute("points", "22 2 15 22 11 13 2 9 22 2");
  sendSvg.appendChild(sendPath);
  sendSvg.appendChild(sendPoly);
  sendBtn.appendChild(sendSvg);

  inputArea.appendChild(textarea);
  inputArea.appendChild(sendBtn);

  conversation.appendChild(messagesArea);
  conversation.appendChild(actionsBar);
  conversation.appendChild(statusBar);
  conversation.appendChild(inputArea);

  body.appendChild(threadList);
  body.appendChild(conversation);
  panel.appendChild(body);

  shadow.appendChild(bubble);
  shadow.appendChild(panel);

  // ---------------------------------------------------------------------------
  // Render: threads
  // ---------------------------------------------------------------------------
  function renderThreads() {
    threadList.textContent = "";
    sessions.forEach((s) => {
      const item = el("div", "sf-thread-item");
      if (s.id === activeSessionId) item.classList.add("active");

      const title = el("div", "sf-thread-title");
      title.textContent = s.title || "Untitled";

      const status = el("div", "sf-thread-status");
      status.textContent = s.status || "";

      item.appendChild(title);
      item.appendChild(status);
      item.addEventListener("click", () => selectSession(s.id));
      threadList.appendChild(item);
    });
  }

  // ---------------------------------------------------------------------------
  // Render: messages
  // ---------------------------------------------------------------------------
  function renderMessages(session) {
    messagesArea.textContent = "";

    if (!session || !session.messages || session.messages.length === 0) {
      const empty = el("div", "sf-empty");
      const emptyIcon = document.createTextNode("\uD83D\uDCAC"); // speech balloon
      const emptyP = el("p");
      emptyP.textContent = "No messages yet. Start by typing below.";
      empty.appendChild(emptyIcon);
      empty.appendChild(emptyP);
      messagesArea.appendChild(empty);
      return;
    }

    session.messages.forEach((msg) => {
      if (msg.role === "system") return;
      const msgEl = el("div", "sf-message", msg.role);
      msgEl.textContent = msg.content;
      messagesArea.appendChild(msgEl);
    });

    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  // ---------------------------------------------------------------------------
  // Render: actions / status
  // ---------------------------------------------------------------------------
  function renderActions(session) {
    actionsBar.style.display = "none";
    statusBar.style.display = "none";
    statusBar.textContent = "";
    stopPolling();

    if (!session) return;

    if (session.status === "awaiting_confirmation") {
      actionsBar.style.display = "flex";
    } else if (session.status === "executing") {
      actionsBar.style.display = "none";
      statusBar.style.display = "block";
      statusBar.textContent = "Executing\u2026";
      startPolling();
    } else if (session.status === "done") {
      if (session.prUrl) {
        statusBar.style.display = "block";
        statusBar.textContent = "";
        const prText = document.createTextNode("PR created: ");
        const prLink = document.createElement("a");
        prLink.href = session.prUrl;
        prLink.target = "_blank";
        prLink.rel = "noopener noreferrer";
        prLink.textContent = session.prUrl;
        prLink.style.color = "#6366F1";
        prLink.style.textDecoration = "underline";
        statusBar.appendChild(prText);
        statusBar.appendChild(prLink);
      } else if (session.error) {
        statusBar.style.display = "block";
        statusBar.textContent = "Error: " + session.error;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Loading dots
  // ---------------------------------------------------------------------------
  let loadingEl = null;

  function showLoading() {
    if (loadingEl) return;
    isLoading = true;
    loadingEl = el("div", "sf-loading");
    for (let i = 0; i < 3; i++) {
      loadingEl.appendChild(el("div", "sf-loading-dot"));
    }
    messagesArea.appendChild(loadingEl);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function hideLoading() {
    isLoading = false;
    if (loadingEl && loadingEl.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl);
    }
    loadingEl = null;
  }

  // ---------------------------------------------------------------------------
  // Data operations
  // ---------------------------------------------------------------------------
  async function loadSessions() {
    try {
      const data = await send("getSessions");
      sessions = Array.isArray(data) ? data : data.sessions || [];
      renderThreads();
    } catch (err) {
      console.error("[SpecFlow] Failed to load sessions:", err.message);
    }
  }

  async function selectSession(id) {
    activeSessionId = id;
    renderThreads();
    try {
      const data = await send("getSession", { sessionId: id });
      const session = data.session || data;
      renderMessages(session);
      renderActions(session);
    } catch (err) {
      console.error("[SpecFlow] Failed to load session:", err.message);
    }
  }

  async function refreshActiveSession() {
    if (!activeSessionId) return;
    try {
      const data = await send("getSession", { sessionId: activeSessionId });
      const session = data.session || data;
      renderMessages(session);
      renderActions(session);
    } catch (err) {
      console.error("[SpecFlow] Failed to refresh session:", err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(refreshActiveSession, 5000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function createNewSession() {
    const title = window.prompt("Session title:");
    if (!title) return;
    try {
      const data = await send("createSession", { title });
      const session = data.session || data;
      sessions.unshift(session);
      activeSessionId = session.id;
      renderThreads();
      renderMessages(session);
      renderActions(session);
    } catch (err) {
      console.error("[SpecFlow] Failed to create session:", err.message);
    }
  }

  async function sendMessage() {
    const content = textarea.value.trim();
    if (!content || !activeSessionId) return;

    textarea.value = "";
    textarea.style.height = "auto";

    // Optimistic user message
    const userMsg = el("div", "sf-message", "user");
    userMsg.textContent = content;
    messagesArea.appendChild(userMsg);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    showLoading();

    try {
      const data = await send("sendMessage", {
        sessionId: activeSessionId,
        content,
      });
      hideLoading();
      const session = data.session || data;

      // Show assistant response if present
      if (session.messages && session.messages.length > 0) {
        renderMessages(session);
      } else if (data.reply) {
        const assistantMsg = el("div", "sf-message", "assistant");
        assistantMsg.textContent = data.reply;
        messagesArea.appendChild(assistantMsg);
        messagesArea.scrollTop = messagesArea.scrollHeight;
      }

      renderActions(session);
    } catch (err) {
      hideLoading();
      const errMsg = el("div", "sf-message", "assistant");
      errMsg.textContent = "Error: " + err.message;
      messagesArea.appendChild(errMsg);
      messagesArea.scrollTop = messagesArea.scrollHeight;
    }
  }

  async function confirmPlan() {
    if (!activeSessionId) return;
    try {
      await send("confirmPlan", { sessionId: activeSessionId });
      actionsBar.style.display = "none";
      statusBar.style.display = "block";
      statusBar.textContent = "Executing\u2026";
      startPolling();
    } catch (err) {
      console.error("[SpecFlow] Failed to confirm plan:", err.message);
    }
  }

  async function cancelPlan() {
    if (!activeSessionId) return;
    try {
      await send("cancelPlan", { sessionId: activeSessionId });
      await refreshActiveSession();
    } catch (err) {
      console.error("[SpecFlow] Failed to cancel plan:", err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Event listeners
  // ---------------------------------------------------------------------------

  // Bubble toggles panel
  bubble.addEventListener("click", () => {
    isOpen = !isOpen;
    if (isOpen) {
      panel.classList.add("open");
      loadSessions();
    } else {
      panel.classList.remove("open");
      stopPolling();
    }
  });

  // Minimize button closes panel
  minBtn.addEventListener("click", () => {
    isOpen = false;
    panel.classList.remove("open");
    stopPolling();
  });

  // New thread button
  newBtn.addEventListener("click", createNewSession);

  // Send button
  sendBtn.addEventListener("click", sendMessage);

  // Confirm / Cancel
  confirmBtn.addEventListener("click", confirmPlan);
  cancelBtn.addEventListener("click", cancelPlan);

  // Enter key sends (without Shift)
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Textarea auto-resize
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 80) + "px";
  });

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------
  document.body.appendChild(host);
})();
