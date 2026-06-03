import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/db.js";
import { createApp } from "../src/server.js";

let app;

beforeEach(() => {
  const db = createDb(":memory:");
  app = createApp({
    config: {
      sessionSecret: "test-secret",
      adminPassword: "test-password",
      defaultDurationDays: 25,
      smsFetchTimeoutMs: 1000,
      autoRefreshSeconds: 10
    },
    db,
    fetchImpl: vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ msg: "验证码 492817", time: "2026-06-02 22:58" })
    }))
  });
});

describe("routes", () => {
  it("blocks unauthenticated admin card creation", async () => {
    const res = await request(app).post("/api/admin/cards").send({});
    expect(res.status).toBe(401);
  });

  it("creates a card after admin login and does not leak smsApiUrl on redeem", async () => {
    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "test-password" }).expect(200);
    await agent.post("/api/admin/cards").send({
      cardKey: "MINE-ROUTE-001",
      phoneNumber: "+10000000001",
      smsApiUrl: "https://example.test/sms",
      durationDays: 25
    }).expect(201);

    const redeem = await request(app).post("/api/redeem").send({ cardKey: "MINE-ROUTE-001" }).expect(200);
    expect(redeem.body.phoneNumber).toBe("+10000000001");
    expect(JSON.stringify(redeem.body)).not.toContain("example.test");
    expect(redeem.body.latestCode.code).toBe("492817");
  });

  it("returns no latest code for no-SMS upstream text without leaking URL", async () => {
    const db = createDb(":memory:");
    const noSmsApp = createApp({
      config: {
        sessionSecret: "test-secret",
        adminPassword: "test-password",
        defaultDurationDays: 25,
        smsFetchTimeoutMs: 1000,
        autoRefreshSeconds: 10
      },
      db,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        text: async () => "暂无短信|链接到期时间2026-06-28 23:59:59，续费请提前联系客服"
      }))
    });
    const agent = request.agent(noSmsApp);
    await agent.post("/api/admin/login").send({ password: "test-password" }).expect(200);
    await agent.post("/api/admin/cards").send({
      cardKey: "MINE-ROUTE-002",
      phoneNumber: "+10000000003",
      smsApiUrl: "https://example.test/no-sms",
      durationDays: 25
    }).expect(201);

    const redeem = await request(noSmsApp).post("/api/redeem").send({ cardKey: "MINE-ROUTE-002" }).expect(200);
    expect(redeem.body.latestCode).toBeNull();
    expect(redeem.body.history).toEqual([]);
    expect(JSON.stringify(redeem.body)).not.toContain("example.test");
  });

  it("supports admin stats, edit, and batch import", async () => {
    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "test-password" }).expect(200);

    await agent.post("/api/admin/cards/batch").send({
      text: [
        "MINE-BULK-001----+10000000003----https://example.test/a----600",
        "MINE-BULK-002----+10000000001----https://example.test/b----12"
      ].join("\n")
    }).expect(201);

    const patch = await agent.patch("/api/admin/cards/MINE-BULK-002").send({
      cardKey: "MINE-BULK-EDITED",
      phoneNumber: "+10000000002",
      smsApiUrl: "https://example.test/edited",
      durationHours: 48,
      status: "new"
    }).expect(200);

    expect(patch.body.card.cardKey).toBe("MINE-BULK-EDITED");
    expect(patch.body.card.durationHours).toBe(48);

    const stats = await agent.get("/api/admin/stats").expect(200);
    expect(stats.body.stats.total).toBe(2);
    expect(stats.body.stats.new).toBe(2);

    const list = await agent.get("/api/admin/cards").expect(200);
    expect(JSON.stringify(list.body)).not.toContain("example.test/edited");
  });

  it("returns admin card detail with received codes", async () => {
    const agent = request.agent(app);
    await request(app).get("/api/admin/cards/MINE-ROUTE-001/detail").expect(401);
    await agent.post("/api/admin/login").send({ password: "test-password" }).expect(200);
    await agent.post("/api/admin/cards").send({
      cardKey: "MINE-DETAIL-ROUTE",
      phoneNumber: "+10000000003",
      smsApiUrl: "https://example.test/detail",
      durationHours: 24
    }).expect(201);
    await request(app).post("/api/redeem").send({ cardKey: "MINE-DETAIL-ROUTE" }).expect(200);

    const detail = await agent.get("/api/admin/cards/MINE-DETAIL-ROUTE/detail").expect(200);

    expect(detail.body.card.cardKey).toBe("MINE-DETAIL-ROUTE");
    expect(detail.body.card.redeemedAt).toBeTruthy();
    expect(detail.body.card.lastQueriedAt).toBeTruthy();
    expect(detail.body.codes[0].code).toBe("492817");
    expect(detail.body.card.smsApiUrl).toBe("https://example.test/detail");
  });

  it("updates public branding settings and admin password", async () => {
    const publicDefaults = await request(app).get("/api/settings/public").expect(200);
    expect(publicDefaults.body.settings.logoName).toBe("SMS.MineApi");

    const agent = request.agent(app);
    await request(app).get("/api/admin/settings").expect(401);
    await agent.post("/api/admin/login").send({ password: "test-password" }).expect(200);

    const updated = await agent.patch("/api/admin/settings").send({
      logoName: "Test Logo",
      simName: "Test SIM",
      footerCopyright: "Test Footer",
      systemName: "Test System",
      adminTitle: "Test Admin",
      adminPassword: "new-test-password"
    }).expect(200);

    expect(updated.body.settings).toEqual({
      logoName: "Test Logo",
      simName: "Test SIM",
      footerCopyright: "Test Footer",
      systemName: "Test System",
      adminTitle: "Test Admin"
    });
    expect(JSON.stringify(updated.body)).not.toContain("new-test-password");

    const publicSettings = await request(app).get("/api/settings/public").expect(200);
    expect(publicSettings.body.settings.simName).toBe("Test SIM");
    expect(publicSettings.body.settings.adminTitle).toBeUndefined();

    const oldLogin = await request(app).post("/api/admin/login").send({ password: "test-password" });
    expect(oldLogin.status).toBe(401);
    await request(app).post("/api/admin/login").send({ password: "new-test-password" }).expect(200);
  });

  it("exposes downstream name only through admin APIs", async () => {
    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "test-password" }).expect(200);

    const created = await agent.post("/api/admin/cards").send({
      cardKey: "MINE-DOWNSTREAM-ROUTE",
      phoneNumber: "+10000000003",
      smsApiUrl: "https://example.test/downstream",
      durationHours: 24,
      downstreamName: "Partner Route"
    }).expect(201);
    expect(created.body.card.downstreamName).toBe("Partner Route");

    const list = await agent.get("/api/admin/cards").expect(200);
    expect(list.body.cards[0].downstreamName).toBe("Partner Route");

    const detail = await agent.get("/api/admin/cards/MINE-DOWNSTREAM-ROUTE/detail").expect(200);
    expect(detail.body.card.downstreamName).toBe("Partner Route");
    expect(detail.body.card.smsApiUrl).toBe("https://example.test/downstream");

    const redeem = await request(app).post("/api/redeem").send({ cardKey: "MINE-DOWNSTREAM-ROUTE" }).expect(200);
    expect(JSON.stringify(redeem.body)).not.toContain("Partner Route");
    expect(JSON.stringify(redeem.body)).not.toContain("example.test/downstream");
  });
});
