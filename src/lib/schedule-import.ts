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
  const text = String(value ?? '').trim();
  let year: number, month: number, day: number;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const vn = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
  } else if (vn) {
    day = Number(vn[1]); month = Number(vn[2]); year = Number(vn[3]);
  } else {
    return null;
  }
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseImportedTime(value: unknown): string | null {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]), second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second !== 0) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
