/**
 * Strict, timezone-independent date (dd/MM/yyyy <-> yyyy-MM-dd)
 * and 24-hour time (HH:mm) validation & normalization helpers.
 */

const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Strict Vietnamese date check: exact dd/MM/yyyy and real calendar date (handles leap years). */
export function isValidVnDate(value: string): boolean {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return isRealCalendarDate(year, month, day);
}

/** Strict ISO date check: exact yyyy-MM-dd and real calendar date (handles leap years). */
export function isValidIsoDate(value: string): boolean {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isRealCalendarDate(year, month, day);
}

/**
 * Parse ISO (yyyy-MM-dd) or Vietnamese date (d/M/yyyy, dd/MM/yyyy, dd-MM-yyyy, dd.MM.yyyy)
 * into canonical ISO yyyy-MM-dd. Never interprets US MM/DD/YYYY.
 */
export function parseDateToIso(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;

  let year: number;
  let month: number;
  let day: number;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const vn = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (vn) {
    day = Number(vn[1]);
    month = Number(vn[2]);
    year = Number(vn[3]);
  } else {
    return null;
  }

  if (!isRealCalendarDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Alias for parseDateToIso. */
export const parseVnOrIsoDate = parseDateToIso;

/** Convert ISO yyyy-MM-dd to Vietnamese dd/MM/yyyy. Returns original string if not valid ISO. */
export function formatIsoToVnDate(iso: string): string {
  const trimmed = String(iso ?? '').trim();
  if (!isValidIsoDate(trimmed)) return trimmed;
  const [year, month, day] = trimmed.split('-');
  return `${day}/${month}/${year}`;
}

/** Strict 24-hour clock check: exact HH:mm from 00:00 to 23:59. */
export function isValidTime24(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

/**
 * Normalize 24-hour time string (e.g. "7:5", "7:00", "07:05", "07:05:00") into strict "HH:mm".
 * Rejects hours > 23, minutes > 59, or non-zero seconds.
 */
export function normalizeTime24(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] !== undefined ? Number(match[3]) : 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second !== 0) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Validate that both dates are valid (dd/MM/yyyy or yyyy-MM-dd) and start <= end. */
export function isValidDateRange(start: unknown, end: unknown): boolean {
  const startIso = parseDateToIso(start);
  const endIso = parseDateToIso(end);
  if (!startIso || !endIso) return false;
  return startIso <= endIso;
}

/** Alias for isValidDateRange. */
export const compareDateRange = isValidDateRange;

/** Validate that both times are strict HH:mm (00:00-23:59) and start < end. */
export function isValidTimeRange(start: unknown, end: unknown): boolean {
  const startStr = String(start ?? '').trim();
  const endStr = String(end ?? '').trim();
  if (!isValidTime24(startStr) || !isValidTime24(endStr)) return false;
  return startStr < endStr;
}

/** Alias for isValidTimeRange. */
export const compareTimeRange = isValidTimeRange;
