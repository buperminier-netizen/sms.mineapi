import express from "express";
import cookieSession from "cookie-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig } from "./config.js";
import { createDb } from "./db.js";
import { createCardService } from "./cardService.js";
import { requireAdmin } from "./auth.js";
import { createSettingsService } from "./settingsService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

export function createApp({ config = readConfig(), db = createDb(config.databasePath), fetchImpl = fetch } = {}) {
  const app = express();
  const service = createCardService({
    db,
    defaultDurationDays: config.defaultDurationDays,
    smsFetchTimeoutMs: config.smsFetchTimeoutMs,
    fetchImpl
  });
  const settingsService = createSettingsService({
    db,
    fallbackAdminPassword: config.adminPassword
  });

  app.use(express.json({ limit: "64kb" }));
  app.use(cookieSession({
    name: "sms_mineapi_session",
    keys: [config.sessionSecret],
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
  }));

  app.post("/api/admin/login", async (req, res) => {
    const ok = await settingsService.verifyAdminPassword(req.body?.password);
    if (!ok) return res.status(401).json({ error: "密码错误" });
    req.session.admin = true;
    return res.json({ ok: true });
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session = null;
    return res.json({ ok: true });
  });

  app.get("/api/admin/cards", requireAdmin, (req, res) => {
    return res.json({ cards: service.listCards() });
  });

  app.get("/api/admin/stats", requireAdmin, (req, res) => {
    return res.json({ stats: service.getStats() });
  });

  app.get("/api/settings/public", (req, res) => {
    return res.json({ settings: settingsService.getPublicSettings() });
  });

  app.get("/api/admin/settings", requireAdmin, (req, res) => {
    return res.json({ settings: settingsService.getAdminSettings() });
  });

  app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await settingsService.updateSettings(req.body || {});
      return res.json({ settings });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.get("/demo-sms", (req, res) => {
    return res.json({
      message: "Your SMS.MineApi demo verification code is 492817",
      receivedAt: new Date().toISOString()
    });
  });

  app.post("/api/admin/cards", requireAdmin, (req, res) => {
    try {
      const card = service.createCard(req.body || {});
      return res.status(201).json({
        card: {
          cardKey: card.cardKey,
          phoneNumber: card.phoneNumber,
          durationDays: card.durationDays,
          durationHours: card.durationHours,
          downstreamName: card.downstreamName,
          status: card.status,
          createdAt: card.createdAt
        }
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/cards/batch", requireAdmin, (req, res) => {
    const result = service.importBatch(req.body?.text || "");
    return res.status(result.created.length > 0 ? 201 : 400).json(result);
  });

  app.get("/api/admin/cards/:cardKey/detail", requireAdmin, (req, res) => {
    const detail = service.getAdminCardDetail(req.params.cardKey);
    if (!detail) return res.status(404).json({ error: "card not found" });
    return res.json(detail);
  });

  app.patch("/api/admin/cards/:cardKey", requireAdmin, (req, res) => {
    try {
      const card = service.updateCard(req.params.cardKey, req.body || {});
      return res.json({ card });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/redeem", async (req, res) => {
    const result = await service.redeemCard(req.body?.cardKey);
    return res.status(result.status === "not_found" ? 404 : 200).json({
      ...result,
      autoRefreshSeconds: config.autoRefreshSeconds
    });
  });

  app.get("/api/session/:cardKey", async (req, res) => {
    const result = await service.refreshCard(req.params.cardKey);
    return res.status(result.status === "not_found" ? 404 : 200).json({
      ...result,
      autoRefreshSeconds: config.autoRefreshSeconds
    });
  });

  app.use(express.static(publicDir));
  app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = readConfig();
  const app = createApp({ config });
  app.listen(config.port, () => {
    console.log(`SMS.MineApi listening on http://localhost:${config.port}`);
  });
}
