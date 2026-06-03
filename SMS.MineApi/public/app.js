let activeCardKey = "";
let expiresAt = null;
let pollTimer = null;
let countdownTimer = null;
let autoRefreshSeconds = 10;

const redeemPanel = document.querySelector("#redeemPanel");
const receiverPanel = document.querySelector("#receiverPanel");
const notice = document.querySelector("#redeemNotice");

loadPublicSettings();

document.querySelector("#redeemButton").addEventListener("click", redeem);
document.querySelector("#manualRefresh").addEventListener("click", () => refresh(true));
document.querySelector("#copyPhone").addEventListener("click", () => copyText(document.querySelector("#phoneNumber").textContent));
document.querySelector("#copyCode").addEventListener("click", () => copyText(document.querySelector("#latestCode").textContent));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPolling();
  else if (activeCardKey) startPolling();
});

async function loadPublicSettings() {
  try {
    const res = await fetch("/api/settings/public");
    if (!res.ok) return;
    const data = await res.json();
    const settings = data.settings || {};
    document.querySelector("#siteLogo").textContent = settings.logoName || "SMS.MineApi";
    document.querySelector("#simNameLabel").textContent = settings.simName || "MINE SIM";
    document.querySelector("#footerCopyright").innerHTML = settings.footerCopyright || "SMS.MineApi.eu.cc | Powered By <b>Open Artivis</b>";
    document.querySelector("#systemName").textContent = settings.systemName || "物理卡接码系统";
  } catch {
    // Keep built-in defaults when settings are temporarily unavailable.
  }
}

async function redeem() {
  const cardKey = document.querySelector("#cardInput").value.trim();
  if (!cardKey) {
    notice.textContent = "请输入卡密";
    return;
  }
  const res = await fetch("/api/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardKey })
  });
  const data = await res.json();
  if (!res.ok || data.status !== "active") {
    notice.textContent = data.message || "卡密不存在或输入错误";
    return;
  }
  activeCardKey = data.cardKey;
  renderActive(data);
  redeemPanel.classList.add("is-hidden");
  receiverPanel.classList.remove("is-hidden");
  document.querySelector("#countdown").classList.remove("is-hidden");
  startPolling();
}

async function refresh(manual = false) {
  if (!activeCardKey) return;
  const res = await fetch(`/api/session/${encodeURIComponent(activeCardKey)}`);
  const data = await res.json();
  if (data.status !== "active") {
    stopPolling();
    notice.textContent = data.message || "该卡密已过期";
    receiverPanel.classList.add("is-hidden");
    redeemPanel.classList.remove("is-hidden");
    return;
  }
  renderActive(data);
  if (manual && data.fetchError) document.querySelector("#latestTime").textContent = data.fetchError;
}

function renderActive(data) {
  expiresAt = new Date(data.expiresAt);
  autoRefreshSeconds = data.autoRefreshSeconds || 10;
  document.querySelector("#refreshHint").textContent = `自动刷新：每 ${autoRefreshSeconds} 秒`;
  document.querySelector("#cardKeyLabel").textContent = `卡密：${data.cardKey}`;
  document.querySelector("#phoneNumber").textContent = data.phoneNumber;
  renderLatest(data.latestCode);
  renderHistory(data.history || []);
  startCountdown();
}

function renderLatest(latest) {
  const latestWrap = document.querySelector(".latest-code");
  const latestCode = document.querySelector("#latestCode");
  const copyCode = document.querySelector("#copyCode");
  if (latest?.code) {
    latestWrap.classList.remove("is-empty");
    latestCode.textContent = latest.code;
    copyCode.disabled = false;
  } else {
    latestWrap.classList.add("is-empty");
    latestCode.textContent = "暂未收到";
    copyCode.disabled = true;
  }
  document.querySelector("#latestTime").textContent = latest
    ? `${formatDate(latest.receivedAt)} 接收，从短信内容自动提取。`
    : "暂未收到验证码";
}

function renderHistory(history) {
  document.querySelector("#historyList").innerHTML = history.map((item) => `
    <div class="history-row">
      <strong>${escapeHtml(item.code)}</strong>
      <span>${escapeHtml(formatDate(item.receivedAt))}</span>
      <button data-code="${escapeHtml(item.code)}">复制</button>
    </div>
  `).join("");
  document.querySelectorAll(".history-row button").forEach((button) => {
    button.addEventListener("click", () => copyText(button.dataset.code));
  });
}

function startPolling() {
  stopPolling();
  if (document.hidden) return;
  pollTimer = setInterval(() => refresh(false), autoRefreshSeconds * 1000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);
}

function updateCountdown() {
  if (!expiresAt) return;
  const seconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  document.querySelector("#countdown").textContent = `剩余 ${days}天 ${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  if (seconds <= 0) stopPolling();
}

async function copyText(value) {
  if (!value || value === "暂无") return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    window.prompt("请手动复制", value);
  }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}
