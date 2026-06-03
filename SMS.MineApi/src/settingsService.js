import { hashAdminPassword, verifyAdminPassword } from "./auth.js";

const PUBLIC_SETTING_KEYS = [
  "logoName",
  "simName",
  "footerCopyright",
  "systemName"
];

const ADMIN_SETTING_KEYS = [
  ...PUBLIC_SETTING_KEYS,
  "adminTitle"
];

const DEFAULT_SETTINGS = {
  logoName: "SMS.MineApi",
  simName: "MINE SIM",
  footerCopyright: "SMS.MineApi.eu.cc | Powered By <b>Open Artivis</b>",
  systemName: "物理卡接码系统",
  adminTitle: "SMSMineAPI 物理卡接码系统"
};

export function createSettingsService({ db, fallbackAdminPassword = "" }) {
  ensureDefaultSettings(db);

  return {
    getPublicSettings() {
      return pickSettings(readSettings(db), PUBLIC_SETTING_KEYS);
    },

    getAdminSettings() {
      return pickSettings(readSettings(db), ADMIN_SETTING_KEYS);
    },

    async updateSettings(input = {}) {
      const now = new Date().toISOString();
      for (const key of ADMIN_SETTING_KEYS) {
        if (input[key] === undefined) continue;
        const value = normalizeSettingValue(input[key], DEFAULT_SETTINGS[key]);
        setSetting(db, key, value, now);
      }

      if (input.adminPassword !== undefined && String(input.adminPassword).trim()) {
        const passwordHash = await hashAdminPassword(String(input.adminPassword).trim());
        setSetting(db, "adminPasswordHash", passwordHash, now);
      }

      return this.getAdminSettings();
    },

    async verifyAdminPassword(password) {
      const passwordHash = getSetting(db, "adminPasswordHash");
      if (passwordHash) return verifyAdminPassword(password, passwordHash);
      return verifyAdminPassword(password, fallbackAdminPassword);
    }
  };
}

function ensureDefaultSettings(db) {
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `).run(key, value, now);
  }
}

function readSettings(db) {
  const settings = { ...DEFAULT_SETTINGS };
  const rows = db.prepare("SELECT key, value FROM settings").all();
  for (const row of rows) {
    if (ADMIN_SETTING_KEYS.includes(row.key)) settings[row.key] = row.value;
  }
  return settings;
}

function pickSettings(settings, keys) {
  return Object.fromEntries(keys.map((key) => [key, settings[key]]));
}

function normalizeSettingValue(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function getSetting(db, key) {
  return db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value || "";
}

function setSetting(db, key, value, now) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now);
}
