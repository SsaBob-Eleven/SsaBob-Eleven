const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAYS = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
} as const;

export type Weekday = keyof typeof WEEKDAYS;

function kstParts(date: Date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    isoDay: shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(),
  };
}
function parseTime(value: string): [number, number] {
  const [hour = "0", minute = "0"] = value.split(":");
  return [Number(hour), Number(minute)];
}

function kstLocalToUtc(year: number, month: number, date: number, time: string): Date {
  const [hour, minute] = parseTime(time);
  return new Date(Date.UTC(year, month, date, hour, minute) - KST_OFFSET_MS);
}

export function getKstDateKey(date: Date): string {
  const parts = kstParts(date);
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.date).padStart(2, "0")}`;
}

export function getNextActiveDate(now: Date, activeWeekdays: readonly Weekday[]): Date {
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(now.getTime() + offset * DAY_MS);
    const isoDay = kstParts(candidate).isoDay;
    if (activeWeekdays.some((weekday) => WEEKDAYS[weekday] === isoDay)) return candidate;
  }
  throw new Error("At least one active weekday is required");
}

export function getDailySchedule(
  scheduleDate: Date,
  openTime: string,
  closeTime: string,
  locationCloseTime: string,
) {
  const parts = kstParts(scheduleDate);
  const opensAt = kstLocalToUtc(parts.year, parts.month, parts.date, openTime);
  const closesAt = kstLocalToUtc(parts.year, parts.month, parts.date, closeTime);
  const locationClosesAt = kstLocalToUtc(parts.year, parts.month, parts.date, locationCloseTime);
  return { opensAt, closesAt, locationClosesAt };
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
