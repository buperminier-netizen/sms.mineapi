const MESSAGE_KEYS = ["data", "message", "msg", "content", "text", "sms"];
const TIME_KEYS = ["time", "created_at", "createdAt", "receive_time", "received_at", "receivedAt", "date"];
const LIST_KEYS = ["list", "messages", "items", "records", "rows"];
const KEYWORD_RE = /(验证码|驗證碼|校验码|code|verification|verify|otp)/i;
const NO_SMS_RE = /(暂无短信|暂无|无短信|no\s*sms|no\s*message)/i;
const CODE_RE = /(?<!\d)\d{4,8}(?!\d)/g;

export function extractVerificationCode(message) {
  if (!message || typeof message !== "string") return null;
  if (NO_SMS_RE.test(message)) return null;

  const matches = [...message.matchAll(CODE_RE)].map((match) => ({
    code: match[0],
    index: match.index ?? 0
  }));
  if (matches.length === 0) return null;

  const keywordMatches = [...message.matchAll(new RegExp(KEYWORD_RE, "gi"))].map((match) => match.index ?? 0);
  if (keywordMatches.length === 0) return matches[0].code;

  matches.sort((a, b) => {
    const aDistance = Math.min(...keywordMatches.map((index) => Math.abs(index - a.index)));
    const bDistance = Math.min(...keywordMatches.map((index) => Math.abs(index - b.index)));
    return aDistance - bDistance;
  });

  return matches[0].code;
}

export function extractSmsEntries(payload) {
  const parsed = parsePayload(payload);
  const entries = collectEntries(parsed);
  return dedupeEntries(entries);
}

function parsePayload(payload) {
  if (typeof payload !== "string") return payload;
  const trimmed = payload.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function collectEntries(value) {
  if (!value) return [];
  if (typeof value === "string") return [{ message: value, receivedAt: null }];
  if (Array.isArray(value)) return value.flatMap((item) => collectEntries(item));
  if (typeof value !== "object") return [];

  const directMessage = findFirstString(value, MESSAGE_KEYS);
  if (directMessage) {
    return [{ message: directMessage, receivedAt: findFirstString(value, TIME_KEYS) }];
  }

  for (const key of LIST_KEYS) {
    if (Array.isArray(value[key])) return value[key].flatMap((item) => collectEntries(item));
  }

  const nested = [];
  for (const key of Object.keys(value)) {
    if (value[key] && typeof value[key] === "object") {
      nested.push(...collectEntries(value[key]));
    }
  }
  return nested;
}

function findFirstString(object, keys) {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function dedupeEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.message}|${entry.receivedAt || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
