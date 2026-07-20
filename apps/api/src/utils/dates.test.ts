import { describe, expect, it } from "vitest";
import { getIsoWeekKey, getWeeklySchedule } from "./dates.js";

describe("KST weekly schedule", () => {
  it("한국 시간 기준 주간 일정을 UTC로 변환한다", () => {
    const now = new Date("2026-07-20T03:00:00.000Z");
    const schedule = getWeeklySchedule(now, "MON", "09:00", "FRI", "11:30", "11:40");
    expect(schedule.opensAt.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(schedule.closesAt.toISOString()).toBe("2026-07-24T02:30:00.000Z");
    expect(schedule.locationClosesAt.toISOString()).toBe("2026-07-24T02:40:00.000Z");
  });

  it("ISO week key를 계산한다", () => {
    expect(getIsoWeekKey(new Date("2026-07-20T03:00:00.000Z"))).toBe("2026-W30");
  });
});
