import { describe, expect, it } from "vitest";
import { extractSmsEntries, extractVerificationCode } from "../src/codeExtractor.js";

describe("extractVerificationCode", () => {
  it("extracts code from Chinese SMS text", () => {
    expect(extractVerificationCode("您的验证码是 492817，5分钟内有效")).toBe("492817");
  });

  it("prefers numbers near verification keywords", () => {
    const text = "订单 202606021234 已创建，验证码 731044，请勿泄露";
    expect(extractVerificationCode(text)).toBe("731044");
  });

  it("does not return part of a long number", () => {
    expect(extractVerificationCode("phone +10000000001 no code")).toBeNull();
  });

  it("does not treat no-SMS expiry text as a verification code", () => {
    const text = "暂无短信|链接到期时间2026-06-28 23:59:59，续费请提前联系客服";
    expect(extractVerificationCode(text)).toBeNull();
  });
});

describe("extractSmsEntries", () => {
  it("handles plain text responses", () => {
    expect(extractSmsEntries("验证码 492817")).toEqual([
      { message: "验证码 492817", receivedAt: null }
    ]);
  });

  it("handles common JSON fields", () => {
    expect(extractSmsEntries({ msg: "验证码 492817", time: "2026-06-02 22:58" })).toEqual([
      { message: "验证码 492817", receivedAt: "2026-06-02 22:58" }
    ]);
  });

  it("handles arrays of messages", () => {
    const entries = extractSmsEntries([
      { content: "验证码 111222", created_at: "2026-06-02 21:00" },
      { text: "验证码 333444", created_at: "2026-06-02 22:00" }
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe("验证码 111222");
  });

  it("handles nested data lists", () => {
    const entries = extractSmsEntries({
      data: {
        list: [
          { sms: "验证码 555666", receive_time: "2026-06-02 23:00" }
        ]
      }
    });
    expect(entries).toEqual([
      { message: "验证码 555666", receivedAt: "2026-06-02 23:00" }
    ]);
  });
});
