import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/db.js";
import { createCardService } from "../src/cardService.js";

let db;
let service;

beforeEach(() => {
  db = createDb(":memory:");
  service = createCardService({
    db,
    defaultDurationDays: 25,
    smsFetchTimeoutMs: 1000,
    fetchImpl: vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ msg: "验证码 492817", time: "2026-06-02 22:58" })
    }))
  });
});

afterEach(() => {
  db.close();
});

describe("card lifecycle", () => {
  it("creates and redeems a new card with default 25 day expiry", async () => {
    service.createCard({
      cardKey: "MINE-TEST-001",
      phoneNumber: "+10000000001",
      smsApiUrl: "https://example.test/sms"
    });

    const result = await service.redeemCard("MINE-TEST-001", new Date("2026-06-02T00:00:00Z"));
    expect(result.status).toBe("active");
    expect(result.phoneNumber).toBe("+10000000001");
    expect(result.expiresAt).toBe("2026-06-27T00:00:00.000Z");
    expect(result.latestCode.code).toBe("492817");
    expect(result.smsApiUrl).toBeUndefined();
  });

  it("creates cards with hour based duration and tracks user queries", async () => {
    service.createCard({
      cardKey: "MINE-HOURS-001",
      phoneNumber: "+10000000001",
      smsApiUrl: "https://example.test/sms",
      durationHours: 2
    });

    const first = await service.redeemCard("MINE-HOURS-001", new Date("2026-06-02T00:00:00Z"));
    const second = await service.refreshCard("MINE-HOURS-001", new Date("2026-06-02T00:10:00Z"));
    const adminCard = service.getAdminCard("MINE-HOURS-001");

    expect(first.expiresAt).toBe("2026-06-02T02:00:00.000Z");
    expect(second.status).toBe("active");
    expect(adminCard.durationHours).toBe(2);
    expect(adminCard.queryCount).toBe(2);
    expect(adminCard.lastQueriedAt).toBe("2026-06-02T00:10:00.000Z");
  });

  it("updates card values and recalculates active expiry when duration changes", async () => {
    service.createCard({
      cardKey: "MINE-EDIT-001",
      phoneNumber: "+10000000001",
      smsApiUrl: "https://example.test/sms",
      durationHours: 24
    });
    await service.redeemCard("MINE-EDIT-001", new Date("2026-06-02T00:00:00Z"));

    const updated = service.updateCard("MINE-EDIT-001", {
      cardKey: "MINE-EDIT-002",
      phoneNumber: "+10000000003",
      smsApiUrl: "https://example.test/updated",
      status: "active",
      durationHours: 48
    });

    expect(updated.cardKey).toBe("MINE-EDIT-002");
    expect(updated.phoneNumber).toBe("+10000000003");
    expect(updated.durationHours).toBe(48);
    expect(updated.expiresAt).toBe("2026-06-04T00:00:00.000Z");
  });

  it("stores downstream name as admin-only card metadata", async () => {
    service.createCard({
      cardKey: "MINE-DOWNSTREAM-001",
      phoneNumber: "+10000000001",
      smsApiUrl: "https://example.test/sms",
      durationHours: 24,
      downstreamName: "Partner A"
    });

    const adminCard = service.getAdminCard("MINE-DOWNSTREAM-001");
    const redeemed = await service.redeemCard("MINE-DOWNSTREAM-001", new Date("2026-06-02T00:00:00Z"));

    expect(adminCard.downstreamName).toBe("Partner A");
    expect(JSON.stringify(redeemed)).not.toContain("Partner A");

    const updated = service.updateCard("MINE-DOWNSTREAM-001", {
      downstreamName: "Partner B"
    });
    expect(updated.downstreamName).toBe("Partner B");
  });

  it("imports cards from batch lines and reports invalid rows", () => {
    const result = service.importBatch([
      "MINE-BATCH-001----+10000000003----https://example.test/a----600----Partner A",
      "MINE-BATCH-002----+10000000001----https://example.test/b----24",
      "BROKEN LINE"
    ].join("\n"));

    expect(result.created).toHaveLength(2);
    expect(result.errors).toEqual([
      { line: 3, reason: "格式应为：卡密----电话号----API链接----时效小时----下游名称" }
    ]);
    expect(service.getAdminCard("MINE-BATCH-001").downstreamName).toBe("Partner A");
    expect(service.getAdminCard("MINE-BATCH-002").durationHours).toBe(24);
  });

  it("returns admin stats with counts and total queries", async () => {
    service.createCard({
      cardKey: "MINE-STATS-001",
      phoneNumber: "+10000000001",
      smsApiUrl: "https://example.test/sms",
      durationHours: 1
    });
    service.createCard({
      cardKey: "MINE-STATS-002",
      phoneNumber: "+10000000002",
      smsApiUrl: "https://example.test/sms",
      durationHours: 1
    });
    await service.redeemCard("MINE-STATS-001", new Date("2026-06-02T00:00:00Z"));
    await service.refreshCard("MINE-STATS-001", new Date("2026-06-03T00:00:00Z"));

    const stats = service.getStats(new Date("2026-06-03T00:00:00Z"));

    expect(stats.total).toBe(2);
    expect(stats.new).toBe(1);
    expect(stats.archived).toBe(1);
    expect(stats.totalQueries).toBe(2);
  });

  it("returns admin card detail with activation, last query, and received codes", async () => {
    let responseText = "验证码 111222";
    const detailService = createCardService({
      db,
      defaultDurationDays: 25,
      smsFetchTimeoutMs: 1000,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        text: async () => responseText
      }))
    });
    detailService.createCard({
      cardKey: "MINE-DETAIL-001",
      phoneNumber: "+10000000003",
      smsApiUrl: "https://example.test/sms",
      durationHours: 24
    });

    await detailService.redeemCard("MINE-DETAIL-001", new Date("2026-06-02T00:00:00Z"));
    responseText = "验证码 333444";
    await detailService.refreshCard("MINE-DETAIL-001", new Date("2026-06-02T00:05:00Z"));

    const detail = detailService.getAdminCardDetail("MINE-DETAIL-001");

    expect(detail.card.cardKey).toBe("MINE-DETAIL-001");
    expect(detail.card.redeemedAt).toBe("2026-06-02T00:00:00.000Z");
    expect(detail.card.lastQueriedAt).toBe("2026-06-02T00:05:00.000Z");
    expect(detail.card.queryCount).toBe(2);
    expect(detail.card.smsApiUrl).toBe("https://example.test/sms");
    expect(detail.codes.map((item) => item.code)).toEqual(["333444", "111222"]);
  });

  it("deduplicates repeated codes in admin card detail", async () => {
    const duplicateService = createCardService({
      db,
      defaultDurationDays: 25,
      smsFetchTimeoutMs: 1000,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        text: async () => "验证码 922557"
      }))
    });
    duplicateService.createCard({
      cardKey: "MINE-DETAIL-DEDUP",
      phoneNumber: "+10000000003",
      smsApiUrl: "https://example.test/sms",
      durationHours: 24
    });
    await duplicateService.redeemCard("MINE-DETAIL-DEDUP", new Date("2026-06-02T00:00:00Z"));

    const card = db.prepare("SELECT id FROM cards WHERE card_key = ?").get("MINE-DETAIL-DEDUP");
    db.prepare(`
      INSERT INTO codes (card_id, code, message, received_at, source_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(card.id, "922557", "验证码 922557", "2026-06-02T00:01:00.000Z", "legacy-duplicate", "2026-06-02T00:01:00.000Z");

    const detail = duplicateService.getAdminCardDetail("MINE-DETAIL-DEDUP");

    expect(detail.codes).toHaveLength(1);
    expect(detail.codes[0].code).toBe("922557");
    expect(detail.codes[0].receivedAt).toBe("2026-06-02T00:01:00.000Z");
  });

  it("archives expired cards and hides private data", async () => {
    service.createCard({
      cardKey: "MINE-TEST-002",
      phoneNumber: "+10000000001",
      smsApiUrl: "https://example.test/sms",
      durationDays: 1
    });

    await service.redeemCard("MINE-TEST-002", new Date("2026-06-02T00:00:00Z"));
    const expired = await service.refreshCard("MINE-TEST-002", new Date("2026-06-04T00:00:00Z"));

    expect(expired.status).toBe("archived");
    expect(expired.phoneNumber).toBeUndefined();
    expect(expired.latestCode).toBeUndefined();
  });

  it("does not duplicate the same SMS source", async () => {
    service.createCard({
      cardKey: "MINE-TEST-003",
      phoneNumber: "+10000000001",
      smsApiUrl: "https://example.test/sms"
    });

    await service.redeemCard("MINE-TEST-003", new Date("2026-06-02T00:00:00Z"));
    const second = await service.refreshCard("MINE-TEST-003", new Date("2026-06-02T00:00:10Z"));
    expect(second.history).toHaveLength(1);
  });

  it("does not duplicate plain-text SMS when upstream has no received time", async () => {
    const plainTextService = createCardService({
      db,
      defaultDurationDays: 25,
      smsFetchTimeoutMs: 1000,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        text: async () => "您的验证码是 884211，请勿泄露"
      }))
    });
    plainTextService.createCard({
      cardKey: "MINE-PLAIN-001",
      phoneNumber: "+10000000003",
      smsApiUrl: "https://example.test/sms"
    });

    await plainTextService.redeemCard("MINE-PLAIN-001", new Date("2026-06-02T00:00:00Z"));
    const second = await plainTextService.refreshCard("MINE-PLAIN-001", new Date("2026-06-02T00:00:10Z"));
    const third = await plainTextService.refreshCard("MINE-PLAIN-001", new Date("2026-06-02T00:00:20Z"));

    expect(second.history).toHaveLength(1);
    expect(third.history).toHaveLength(1);
    expect(third.history[0].code).toBe("884211");
  });

  it("treats upstream no-SMS text as empty code history", async () => {
    const noSmsService = createCardService({
      db,
      defaultDurationDays: 25,
      smsFetchTimeoutMs: 1000,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        text: async () => "暂无短信|链接到期时间2026-06-28 23:59:59，续费请提前联系客服"
      }))
    });
    noSmsService.createCard({
      cardKey: "MINE-TEST-004",
      phoneNumber: "+10000000003",
      smsApiUrl: "https://example.test/sms"
    });

    const result = await noSmsService.redeemCard("MINE-TEST-004", new Date("2026-06-02T00:00:00Z"));
    expect(result.status).toBe("active");
    expect(result.latestCode).toBeNull();
    expect(result.history).toEqual([]);
  });
});
