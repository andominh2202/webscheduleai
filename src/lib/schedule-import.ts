import { normalizeTime24, parseDateToIso } from './date-time-validation';

/** Strict, timezone-independent parsing for timetable imports. */
export function parseImportedDay(value: unknown): number | null {
  const text = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (['cn', 'chủ nhật', 'chu nhat', '0', '8'].includes(text)) return 0;
  // CSV columns use the app's internal index: 1=Mon, ..., 6=Sat.
  if (/^[1-6]$/.test(text)) return Number(text);
  const match = text.match(/^(?:thứ|thu|t)\s*([2-7])$/);
  return match ? Number(match[1]) - 1 : null;
}

/** OCR must provide a weekday label, never an ambiguous numeric index. */
export function parseOcrDay(value: unknown): number | null {
  const text = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (['cn', 'chủ nhật', 'chu nhat'].includes(text)) return 0;
  const match = text.match(/^(?:thứ|thu|t)\s*([2-7])$/);
  return match ? Number(match[1]) - 1 : null;
}

/** Accept ISO YYYY-MM-DD or Vietnamese DD/MM/YYYY, not US MM/DD/YYYY. */
export function parseImportedDate(value: unknown): string | null {
  return parseDateToIso(value);
}

/** Normalize 24-hour clock times (e.g. 7:00 -> 07:00), rejecting invalid hours/minutes. */
export function parseImportedTime(value: unknown): string | null {
  return normalizeTime24(value);
}
