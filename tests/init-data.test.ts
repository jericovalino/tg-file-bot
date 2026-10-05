import { describe, expect, it } from "vitest";
import { buildDataCheckString, signInitData, validateInitData, InitDataError } from "@/lib/telegram/init-data";

const TOKEN = "123456789:AAtestTOKENtestTOKENtestTOKENtestTOKEN";
const now = 1_700_000_000_000;

function fields(overrides: Record<string, string> = {}) {
  return {
    auth_date: String(Math.floor(now / 1000) - 60),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({ id: 279058397, first_name: "Vladislav", last_name: "Kibenko", username: "vdkfrost", language_code: "ru", is_premium: true }),
    chat_type: "supergroup",
    chat_instance: "8428209589180549439",
    start_param: "c_AbCdEfGh12345678",
    ...overrides,
  };
}

describe("validateInitData", () => {
  it("accepts data signed with the bot token", () => {
    const initData = signInitData(fields(), TOKEN);
    const parsed = validateInitData(initData, TOKEN, 86400, now);
    expect(parsed.user.id).toBe(279058397);
    expect(parsed.chatType).toBe("supergroup");
    expect(parsed.chatInstance).toBe("8428209589180549439");
    expect(parsed.startParam).toBe("c_AbCdEfGh12345678");
  });

  it("rejects data signed with a different token", () => {
    const initData = signInitData(fields(), "999:other-token");
    expect(() => validateInitData(initData, TOKEN, 86400, now)).toThrowError(InitDataError);
  });

  it("rejects tampered fields", () => {
    const initData = signInitData(fields(), TOKEN);
    const tampered = initData.replace("279058397", "1");
    expect(() => validateInitData(tampered, TOKEN, 86400, now)).toThrow(/invalid/);
  });

  it("rejects expired data", () => {
    const initData = signInitData(fields({ auth_date: String(Math.floor(now / 1000) - 90000) }), TOKEN);
    expect(() => validateInitData(initData, TOKEN, 86400, now)).toThrow(/expired/);
  });

  it("rejects missing hash and missing user", () => {
    expect(() => validateInitData("auth_date=1&user=%7B%7D", TOKEN, 86400, now)).toThrow(/hash/);
    const noUser = signInitData({ auth_date: String(Math.floor(now / 1000)), query_id: "x" }, TOKEN);
    expect(() => validateInitData(noUser, TOKEN, 86400, now)).toThrow(/user/);
  });

  it("includes the Bot API 8.0 `signature` field in the HMAC check string", () => {
    const initData = signInitData(fields({ signature: "abc" }), TOKEN);
    expect(() => validateInitData(initData, TOKEN, 86400, now)).not.toThrow();
    // Tampering with `signature` must invalidate the hash, which proves it is covered by the HMAC.
    expect(() => validateInitData(initData.replace("signature=abc", "signature=abd"), TOKEN, 86400, now)).toThrow(/invalid/);
  });

  it("matches the data-check-string algorithm used by grammY's validator (only `hash` removed)", () => {
    const params = new URLSearchParams("user=%7B%22id%22%3A1%7D&signature=s&auth_date=1&hash=deadbeef&query_id=q");
    expect(buildDataCheckString(params)).toBe('auth_date=1\nquery_id=q\nsignature=s\nuser={"id":1}');
  });
});
