import { describe, expect, it } from "vitest";
import { getDailySchedule, getKstDateKey, getNextActiveDate } from "./dates.js";

describe("KST daily schedule", () => {
  it("한국 시간 기준 같은 날 08:30~11:30 일정을 UTC로 변환한다", () => {
    const now = new Date("2026-07-20T03:00:00.000Z");
    const schedule = getDailySchedule(now, "08:30", "11:30", "11:40");
    expect(schedule.opensAt.toISOString()).toBe("2026-07-19T23:30:00.000Z");
    expect(schedule.closesAt.toISOString()).toBe("2026-07-20T02:30:00.000Z");
    expect(schedule.locationClosesAt.toISOString()).toBe("2026-07-20T02:40:00.000Z");
  });

  it("한국 날짜를 일간 회차 키로 계산한다", () => {
    expect(getKstDateKey(new Date("2026-07-19T15:30:00.000Z"))).toBe("2026-07-20");
  });

  it("주말에는 다음 월요일을 활성 날짜로 선택한다", () => {
    const saturday = new Date("2026-07-25T03:00:00.000Z");
    const next = getNextActiveDate(saturday, ["MON", "TUE", "WED", "THU", "FRI"]);
    expect(getKstDateKey(next)).toBe("2026-07-27");
  });

  it("평일에는 당일을 활성 날짜로 선택한다", () => {
    const friday = new Date("2026-07-24T03:00:00.000Z");
    const current = getNextActiveDate(friday, ["MON", "TUE", "WED", "THU", "FRI"]);
    expect(getKstDateKey(current)).toBe("2026-07-24");
  });
});
