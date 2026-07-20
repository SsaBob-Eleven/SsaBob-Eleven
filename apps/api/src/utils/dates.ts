const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const weekdays = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
} as const;

type Weekday = keyof typeof weekdays;

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

export function getIsoWeekKey(now: Date): string {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const day = shifted.getUTCDay() || 7;
  shifted.setUTCDate(shifted.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(shifted.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((shifted.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${shifted.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function getWeeklySchedule(
  now: Date,
  openDay: Weekday,
  openTime: string,
  eventDay: Weekday,
  closeTime: string,
  locationCloseTime: string,
) {
  const parts = kstParts(now);
  const mondayDate = parts.date - parts.isoDay + 1;
  const opensAt = kstLocalToUtc(parts.year, parts.month, mondayDate + weekdays[openDay] - 1, openTime);
  const closesAt = kstLocalToUtc(parts.year, parts.month, mondayDate + weekdays[eventDay] - 1, closeTime);
  const locationClosesAt = kstLocalToUtc(
    parts.year,
    parts.month,
    mondayDate + weekdays[eventDay] - 1,
    locationCloseTime,
  );
  return { opensAt, closesAt, locationClosesAt };
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
