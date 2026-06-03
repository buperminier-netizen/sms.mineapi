import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { extractSmsEntries, extractVerificationCode } from "./codeExtractor.js";

export function createCardService({ db, defaultDurationDays = 25, smsFetchTimeoutMs = 10000, fetchImpl = fetch }) {
  const defaultDurationHours = defaultDurationDays * 24;
  return {
    createCard(input) {
      const now = new Date().toISOString();
      const cardKey = input.cardKey?.trim() || `MINE-${nanoid(4).toUpperCase()}-${nanoid(4).toUpperCase()}`;
      const durationHours = normalizeDurationHours(input, defaultDurationHours);
      const durationDays = Math.ceil(durationHours / 24);
      const downstreamName = normalizeOptionalText(input.downstreamName);
      if (!input.phoneNumber?.trim()) throw new Error("phoneNumber is required");
      if (!input.smsApiUrl?.trim()) throw new Error("smsApiUrl is required");

      db.prepare(`
        INSERT INTO cards (card_key, phone_number, sms_api_url, duration_days, duration_hours, downstream_name, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
      `).run(cardKey, input.phoneNumber.trim(), input.smsApiUrl.trim(), durationDays, durationHours, downstreamName, now);

      return getCardByKey(db, cardKey);
    },

    listCards() {
      return db.prepare(`
        SELECT id, card_key AS cardKey, phone_number AS phoneNumber,
               duration_days AS durationDays, duration_hours AS durationHours,
               created_at AS createdAt, redeemed_at AS redeemedAt, expires_at AS expiresAt,
               archived_at AS archivedAt, status, query_count AS queryCount,
               last_queried_at AS lastQueriedAt, downstream_name AS downstreamName
        FROM cards
        ORDER BY id DESC
      `).all();
    },

    getAdminCard(cardKey) {
      const card = getCardByKey(db, cardKey);
      if (!card) return null;
      return stripPrivateCard(card);
    },

    getAdminCardDetail(cardKey) {
      const card = getCardByKey(db, cardKey);
      if (!card) return null;
      return {
        card,
        codes: dedupeCodeHistory(getCodeHistory(db, card.id))
      };
    },

    getStats(now = new Date()) {
      autoArchiveExpired(db, now);
      const rows = db.prepare("SELECT status, COUNT(*) AS count FROM cards GROUP BY status").all();
      const stats = { total: 0, new: 0, active: 0, archived: 0, expired: 0, totalQueries: 0 };
      for (const row of rows) {
        stats[row.status] = row.count;
        stats.total += row.count;
      }
      stats.expired = db.prepare("SELECT COUNT(*) AS count FROM cards WHERE status = 'archived' AND archived_at IS NOT NULL").get().count;
      stats.totalQueries = db.prepare("SELECT COALESCE(SUM(query_count), 0) AS total FROM cards").get().total;
      return stats;
    },

    updateCard(cardKey, input) {
      const existing = getCardByKey(db, cardKey);
      if (!existing) throw new Error("card not found");
      const nextCardKey = input.cardKey?.trim() || existing.cardKey;
      const nextPhone = input.phoneNumber?.trim() || existing.phoneNumber;
      const nextApi = input.smsApiUrl?.trim() || existing.smsApiUrl;
      const nextStatus = input.status || existing.status;
      const nextDownstreamName = input.downstreamName === undefined
        ? existing.downstreamName
        : normalizeOptionalText(input.downstreamName);
      if (!["new", "active", "archived"].includes(nextStatus)) throw new Error("invalid status");
      const nextDurationHours = normalizeDurationHours(
        { durationHours: input.durationHours ?? existing.durationHours },
        existing.durationHours || defaultDurationHours
      );
      const nextDurationDays = Math.ceil(nextDurationHours / 24);
      const archivedAt = nextStatus === "archived" ? (existing.archivedAt || new Date().toISOString()) : null;
      const expiresAt = existing.redeemedAt && nextStatus === "active"
        ? new Date(new Date(existing.redeemedAt).getTime() + nextDurationHours * 60 * 60 * 1000).toISOString()
        : (nextStatus === "new" ? null : existing.expiresAt);

      db.prepare(`
        UPDATE cards
        SET card_key = ?, phone_number = ?, sms_api_url = ?, duration_days = ?,
            duration_hours = ?, downstream_name = ?, status = ?, expires_at = ?, archived_at = ?
        WHERE id = ?
      `).run(nextCardKey, nextPhone, nextApi, nextDurationDays, nextDurationHours, nextDownstreamName, nextStatus, expiresAt, archivedAt, existing.id);

      return stripPrivateCard(getCardByKey(db, nextCardKey));
    },

    importBatch(text) {
      const created = [];
      const errors = [];
      const lines = String(text || "").split(/\r?\n/);
      lines.forEach((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return;
        const parts = line.split("----").map((part) => part.trim());
        if (parts.length < 3 || parts.length > 5 || parts.some((part, partIndex) => partIndex < 3 && !part)) {
          errors.push({ line: index + 1, reason: "格式应为：卡密----电话号----API链接----时效小时----下游名称" });
          return;
        }
        try {
          const card = this.createCard({
            cardKey: parts[0],
            phoneNumber: parts[1],
            smsApiUrl: parts[2],
            durationHours: parts[3] ? Number(parts[3]) : defaultDurationHours,
            downstreamName: parts[4] || ""
          });
          created.push(stripPrivateCard(card));
        } catch (error) {
          errors.push({ line: index + 1, reason: error.message });
        }
      });
      return { created, errors };
    },

    async redeemCard(cardKey, now = new Date()) {
      const card = getCardByKey(db, cardKey);
      if (!card) return { status: "not_found", message: "卡密不存在或输入错误" };
      const activeCard = activateIfNeeded(db, card, now);
      return refreshActiveCard({ db, card: activeCard, now, smsFetchTimeoutMs, fetchImpl });
    },

    async refreshCard(cardKey, now = new Date()) {
      const card = getCardByKey(db, cardKey);
      if (!card) return { status: "not_found", message: "卡密不存在或输入错误" };
      if (card.status === "new") return this.redeemCard(cardKey, now);
      return refreshActiveCard({ db, card, now, smsFetchTimeoutMs, fetchImpl });
    }
  };
}

function getCardByKey(db, cardKey) {
  return db.prepare(`
    SELECT id, card_key AS cardKey, phone_number AS phoneNumber, sms_api_url AS smsApiUrl,
           duration_days AS durationDays, duration_hours AS durationHours,
           created_at AS createdAt, redeemed_at AS redeemedAt,
           expires_at AS expiresAt, archived_at AS archivedAt, status,
           query_count AS queryCount, last_queried_at AS lastQueriedAt,
           downstream_name AS downstreamName
    FROM cards
    WHERE card_key = ?
  `).get(String(cardKey || "").trim());
}

function activateIfNeeded(db, card, now) {
  if (card.status !== "new") return card;
  const redeemedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + card.durationHours * 60 * 60 * 1000).toISOString();
  db.prepare("UPDATE cards SET redeemed_at = ?, expires_at = ?, status = 'active' WHERE id = ?")
    .run(redeemedAt, expiresAt, card.id);
  return { ...card, redeemedAt, expiresAt, status: "active" };
}

async function refreshActiveCard({ db, card, now, smsFetchTimeoutMs, fetchImpl }) {
  trackQuery(db, card.id, now);
  if (card.status === "archived" || (card.expiresAt && new Date(card.expiresAt).getTime() <= now.getTime())) {
    archiveCard(db, card.id, now);
    return { status: "archived", message: "该卡密已过期" };
  }

  let fetchError = null;
  try {
    await fetchAndPersistCodes({ db, card, now, smsFetchTimeoutMs, fetchImpl });
  } catch {
    fetchError = "接码接口暂时不可用，请稍后刷新";
  }

  const history = getCodeHistory(db, card.id);
  return {
    status: "active",
    cardKey: card.cardKey,
    phoneNumber: card.phoneNumber,
    expiresAt: card.expiresAt,
    remainingSeconds: Math.max(0, Math.floor((new Date(card.expiresAt).getTime() - now.getTime()) / 1000)),
    latestCode: history[0] || null,
    history,
    fetchError
  };
}

async function fetchAndPersistCodes({ db, card, now, smsFetchTimeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), smsFetchTimeoutMs);
  try {
    const response = await fetchImpl(card.smsApiUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`SMS API returned ${response.status}`);
    const body = await response.text();
    const entries = extractSmsEntries(body);
    for (const entry of entries) {
      const code = extractVerificationCode(entry.message);
      if (!code) continue;
      const receivedAt = normalizeDate(entry.receivedAt, now);
      const hash = crypto.createHash("sha256").update(`${entry.message}|${code}`).digest("hex");
      db.prepare(`
        INSERT OR IGNORE INTO codes (card_id, code, message, received_at, source_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(card.id, code, entry.message, receivedAt, hash, now.toISOString());
    }
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDate(value, fallback) {
  if (!value) return fallback.toISOString();
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return fallback.toISOString();
}

function getCodeHistory(db, cardId) {
  return db.prepare(`
    SELECT code, message, received_at AS receivedAt, created_at AS createdAt
    FROM codes
    WHERE card_id = ?
    ORDER BY received_at DESC, id DESC
    LIMIT 20
  `).all(cardId);
}

function dedupeCodeHistory(history) {
  const seen = new Set();
  return history.filter((item) => {
    const key = `${item.code}|${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function archiveCard(db, cardId, now) {
  db.prepare("UPDATE cards SET status = 'archived', archived_at = ? WHERE id = ? AND status != 'archived'")
    .run(now.toISOString(), cardId);
}

function normalizeDurationHours(input, fallback) {
  const raw = input.durationHours ?? (input.durationDays ? Number(input.durationDays) * 24 : fallback);
  const durationHours = Number(raw);
  if (!Number.isInteger(durationHours) || durationHours <= 0) {
    throw new Error("durationHours must be a positive integer");
  }
  return durationHours;
}

function normalizeOptionalText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function trackQuery(db, cardId, now) {
  db.prepare(`
    UPDATE cards
    SET query_count = query_count + 1, last_queried_at = ?
    WHERE id = ?
  `).run(now.toISOString(), cardId);
}

function stripPrivateCard(card) {
  const { smsApiUrl, ...safe } = card;
  return safe;
}

function autoArchiveExpired(db, now) {
  db.prepare(`
    UPDATE cards
    SET status = 'archived', archived_at = COALESCE(archived_at, ?)
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?
  `).run(now.toISOString(), now.toISOString());
}
