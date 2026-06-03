const loginPanel = document.querySelector("#loginPanel");
const cardPanel = document.querySelector("#cardPanel");
const loginNotice = document.querySelector("#loginNotice");
const cardNotice = document.querySelector("#cardNotice");
const batchNotice = document.querySelector("#batchNotice");
const statsGrid = document.querySelector("#statsGrid");
const cardsTable = document.querySelector("#cardsTable");
const detailModal = document.querySelector("#detailModal");
const detailTitle = document.querySelector("#detailTitle");
const detailGrid = document.querySelector("#detailGrid");
const detailCodes = document.querySelector("#detailCodes");
const settingsModal = document.querySelector("#settingsModal");
const settingsNotice = document.querySelector("#settingsNotice");

const REMEMBER_PASSWORD_KEY = "smsMineApiAdminPassword";

let editingKey = "";
let cardsCache = [];

document.querySelector("#loginButton").addEventListener("click", login);
document.querySelector("#logoutButton").addEventListener("click", logout);
document.querySelector("#settingsButton").addEventListener("click", openSettings);
document.querySelector("#saveCardButton").addEventListener("click", saveCard);
document.querySelector("#batchCreateButton").addEventListener("click", importBatch);
document.querySelector("#reloadButton").addEventListener("click", loadDashboard);
document.querySelector("#resetFormButton").addEventListener("click", resetForm);
document.querySelector("#closeDetailButton").addEventListener("click", closeDetail);
document.querySelector("#closeSettingsButton").addEventListener("click", closeSettings);
document.querySelector("#saveSettingsButton").addEventListener("click", saveSettings);
detailModal.addEventListener("click", (event) => {
  if (event.target === detailModal) closeDetail();
});
settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal) closeSettings();
});

initRememberedPassword();

async function login() {
  const password = document.querySelector("#adminPassword").value;
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    loginNotice.textContent = "密码错误";
    return;
  }
  saveRememberedPassword(password);
  loginPanel.classList.add("is-hidden");
  cardPanel.classList.remove("is-hidden");
  await Promise.all([loadDashboard(), loadAdminSettings()]);
}

async function logout() {
  await fetch("/api/admin/logout", { method: "POST" });
  location.reload();
}

async function loadDashboard() {
  const [statsRes, cardsRes] = await Promise.all([
    fetch("/api/admin/stats"),
    fetch("/api/admin/cards")
  ]);
  if (!statsRes.ok || !cardsRes.ok) return;
  const statsData = await statsRes.json();
  const cardsData = await cardsRes.json();
  cardsCache = cardsData.cards || [];
  renderStats(statsData.stats);
  renderCards(cardsCache);
}

async function loadAdminSettings() {
  const res = await fetch("/api/admin/settings");
  if (!res.ok) return;
  const data = await res.json();
  applyAdminSettings(data.settings || {});
  fillSettingsForm(data.settings || {});
}

function applyAdminSettings(settings) {
  document.querySelector("#adminTitle").textContent = settings.adminTitle || "SMSMineAPI 物理卡接码系统";
}

function fillSettingsForm(settings) {
  document.querySelector("#settingLogoName").value = settings.logoName || "";
  document.querySelector("#settingSimName").value = settings.simName || "";
  document.querySelector("#settingFooterCopyright").value = settings.footerCopyright || "";
  document.querySelector("#settingSystemName").value = settings.systemName || "";
  document.querySelector("#settingAdminTitle").value = settings.adminTitle || "";
  document.querySelector("#settingAdminPassword").value = "";
}

async function openSettings() {
  settingsNotice.textContent = "";
  await loadAdminSettings();
  settingsModal.classList.remove("is-hidden");
}

function closeSettings() {
  settingsModal.classList.add("is-hidden");
}

async function saveSettings() {
  const payload = {
    logoName: document.querySelector("#settingLogoName").value.trim(),
    simName: document.querySelector("#settingSimName").value.trim(),
    footerCopyright: document.querySelector("#settingFooterCopyright").value.trim(),
    systemName: document.querySelector("#settingSystemName").value.trim(),
    adminTitle: document.querySelector("#settingAdminTitle").value.trim()
  };
  const newPassword = document.querySelector("#settingAdminPassword").value.trim();
  if (newPassword) payload.adminPassword = newPassword;

  const res = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    settingsNotice.textContent = data.error || "保存失败";
    return;
  }
  applyAdminSettings(data.settings || {});
  fillSettingsForm(data.settings || {});
  settingsNotice.textContent = "已保存设置";
}

function renderStats(stats) {
  const items = [
    ["总卡密", stats.total],
    ["未激活", stats.new],
    ["已激活", stats.active],
    ["已归档", stats.archived],
    ["已过期", stats.expired],
    ["总查询", stats.totalQueries]
  ];
  statsGrid.innerHTML = items.map(([label, value]) => `
    <div class="stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value || 0))}</strong>
    </div>
  `).join("");
}

function renderCards(cards) {
  cardsTable.innerHTML = cards.map((card) => `
    <tr>
      <td><button class="card-link" data-detail="${escapeHtml(card.cardKey)}">${escapeHtml(card.cardKey)}</button></td>
      <td>${escapeHtml(card.downstreamName || "-")}</td>
      <td>${escapeHtml(card.phoneNumber)}</td>
      <td><span class="status-pill status-${escapeHtml(card.status)}">${statusLabel(card.status)}</span></td>
      <td>${escapeHtml(String(card.durationHours || card.durationDays * 24 || 600))} 小时</td>
      <td>${escapeHtml(remainingLabel(card))}</td>
      <td>${escapeHtml(String(card.queryCount || 0))}</td>
      <td>${escapeHtml(formatDate(card.lastQueriedAt))}</td>
      <td><button class="row-action" data-edit="${escapeHtml(card.cardKey)}">编辑</button></td>
    </tr>
  `).join("");
  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => editCard(button.dataset.edit));
  });
  document.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.detail));
  });
}

async function openDetail(cardKey) {
  const res = await fetch(`/api/admin/cards/${encodeURIComponent(cardKey)}/detail`);
  const data = await res.json();
  if (!res.ok) return;
  const card = data.card;
  detailTitle.textContent = card.cardKey;
  detailGrid.innerHTML = [
    ["下游名称", card.downstreamName || "-"],
    ["API 链接", card.smsApiUrl || "-"],
    ["手机号", card.phoneNumber],
    ["状态", statusLabel(card.status)],
    ["激活时间", formatDate(card.redeemedAt)],
    ["到期时间", formatDate(card.expiresAt)],
    ["上次查询", formatDate(card.lastQueriedAt)],
    ["查询次数", String(card.queryCount || 0)]
  ].map(([label, value]) => `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `).join("");
  detailCodes.innerHTML = data.codes?.length
    ? data.codes.map((item) => `
      <div class="detail-code-row">
        <strong>${escapeHtml(item.code)}</strong>
        <span>${escapeHtml(formatDate(item.receivedAt))}</span>
      </div>
    `).join("")
    : `<div class="empty-detail">暂未收到验证码</div>`;
  detailModal.classList.remove("is-hidden");
}

function closeDetail() {
  detailModal.classList.add("is-hidden");
}

function editCard(cardKey) {
  const card = cardsCache.find((item) => item.cardKey === cardKey);
  if (!card) return;
  editingKey = card.cardKey;
  document.querySelector("#formTitle").textContent = "编辑卡密";
  document.querySelector("#saveCardButton").textContent = "保存修改";
  document.querySelector("#cardKey").value = card.cardKey;
  document.querySelector("#downstreamName").value = card.downstreamName || "";
  document.querySelector("#phoneNumber").value = card.phoneNumber;
  document.querySelector("#smsApiUrl").value = "";
  document.querySelector("#smsApiUrl").placeholder = "留空则不修改 API 链接";
  document.querySelector("#durationHours").value = card.durationHours || card.durationDays * 24 || 600;
  document.querySelector("#status").value = card.status;
  cardNotice.textContent = "正在编辑，API 链接留空则保持原值。";
}

async function saveCard() {
  const payload = {
    cardKey: document.querySelector("#cardKey").value.trim(),
    downstreamName: document.querySelector("#downstreamName").value.trim(),
    phoneNumber: document.querySelector("#phoneNumber").value.trim(),
    smsApiUrl: document.querySelector("#smsApiUrl").value.trim(),
    durationHours: Number(document.querySelector("#durationHours").value || 600),
    status: document.querySelector("#status").value
  };
  const url = editingKey ? `/api/admin/cards/${encodeURIComponent(editingKey)}` : "/api/admin/cards";
  const method = editingKey ? "PATCH" : "POST";
  if (!payload.smsApiUrl && !editingKey) {
    cardNotice.textContent = "新建卡密必须填写 API 链接";
    return;
  }
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    cardNotice.textContent = data.error || "保存失败";
    return;
  }
  cardNotice.textContent = editingKey ? "已保存修改" : `已创建：${data.card.cardKey}`;
  resetForm(false);
  await loadDashboard();
}

async function importBatch() {
  const text = document.querySelector("#batchText").value;
  const res = await fetch("/api/admin/cards/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  const data = await res.json();
  const createdCount = data.created?.length || 0;
  const errorText = (data.errors || []).map((error) => `第 ${error.line} 行：${error.reason}`).join("；");
  batchNotice.textContent = `成功 ${createdCount} 条${errorText ? `，错误：${errorText}` : ""}`;
  if (createdCount > 0) {
    document.querySelector("#batchText").value = "";
    await loadDashboard();
  }
}

function resetForm(clearNotice = true) {
  editingKey = "";
  document.querySelector("#formTitle").textContent = "创建卡密";
  document.querySelector("#saveCardButton").textContent = "创建卡密";
  document.querySelector("#cardKey").value = "";
  document.querySelector("#downstreamName").value = "";
  document.querySelector("#phoneNumber").value = "";
  document.querySelector("#smsApiUrl").value = "";
  document.querySelector("#smsApiUrl").placeholder = "短信 API 链接";
  document.querySelector("#durationHours").value = "600";
  document.querySelector("#status").value = "new";
  if (clearNotice) cardNotice.textContent = "";
}

function initRememberedPassword() {
  const rememberedPassword = localStorage.getItem(REMEMBER_PASSWORD_KEY);
  if (!rememberedPassword) return;
  document.querySelector("#adminPassword").value = rememberedPassword;
  document.querySelector("#rememberPassword").checked = true;
}

function saveRememberedPassword(password) {
  if (document.querySelector("#rememberPassword").checked) {
    localStorage.setItem(REMEMBER_PASSWORD_KEY, password);
  } else {
    localStorage.removeItem(REMEMBER_PASSWORD_KEY);
  }
}

function statusLabel(status) {
  return {
    new: "未激活",
    active: "已激活",
    archived: "已归档"
  }[status] || status;
}

function remainingLabel(card) {
  if (card.status === "new") return "未开始";
  if (card.status === "archived") return "已结束";
  if (!card.expiresAt) return "-";
  const ms = new Date(card.expiresAt).getTime() - Date.now();
  if (ms <= 0) return "已过期";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}小时 ${minutes}分`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
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
