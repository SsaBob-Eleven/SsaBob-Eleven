import { describe, expect, it } from "vitest";
import { isValidParticipantName } from "@ssabap/shared";
import { cleanDisplayName, normalizeName } from "./name.js";

describe("participant name", () => {
  it("공백 없이 정확히 3글자인 이름만 허용한다", () => {
    expect(isValidParticipantName("홍길동")).toBe(true);
    expect(isValidParticipantName("ABC")).toBe(true);
    expect(isValidParticipantName("홍길")).toBe(false);
    expect(isValidParticipantName("홍길동님")).toBe(false);
    expect(isValidParticipantName("홍 길")).toBe(false);
  });

  it("검증 전에 Unicode와 앞뒤 공백을 정규화한다", () => {
    expect(cleanDisplayName("  홍길동  ")).toBe("홍길동");
    expect(normalizeName("  AbC  ")).toBe("abc");
  });
});
