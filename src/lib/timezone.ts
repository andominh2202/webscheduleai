// Múi giờ chuẩn Việt Nam: Asia/Ho_Chi_Minh (UTC+7)
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Chuyển chuỗi ngày (YYYY-MM-DD hoặc ISO) thành Date cố định ở 12:00:00 giờ Việt Nam (05:00:00 UTC)
 * để tránh bị lệch ngày khi chuyển đổi giữa UTC và Asia/Ho_Chi_Minh.
 */
export function parseVnDate(input: string | Date): Date {
  if (input instanceof Date) {
    const ymd = toVnDateString(input);
    return new Date(`${ymd}T12:00:00+07:00`);
  }
  const trimmed = input.trim();
  const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (dateOnlyMatch) {
    return new Date(`${dateOnlyMatch[1]}T12:00:00+07:00`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Ngày không hợp lệ: ${input}`);
  }
  const ymd = toVnDateString(parsed);
  return new Date(`${ymd}T12:00:00+07:00`);
}

/**
 * Lấy chuỗi YYYY-MM-DD theo múi giờ Asia/Ho_Chi_Minh
 */
export function toVnDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const vnTime = new Date(d.getTime() + VN_OFFSET_MS);
  const year = vnTime.getUTCFullYear();
  const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vnTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Lấy thứ trong tuần (0 = CN, 1 = T2, ..., 6 = T7) theo múi giờ Asia/Ho_Chi_Minh
 */
export function getVnDayOfWeek(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const vnTime = new Date(d.getTime() + VN_OFFSET_MS);
  return vnTime.getUTCDay();
}

/**
 * Trả về [startOfDay, endOfDay] của 1 ngày theo múi giờ Asia/Ho_Chi_Minh
 */
export function getVnDayBounds(dateInput: Date | string): { start: Date; end: Date } {
  const ymd = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ? dateInput
    : toVnDateString(dateInput);
  return {
    start: new Date(`${ymd}T00:00:00.000+07:00`),
    end: new Date(`${ymd}T23:59:59.999+07:00`),
  };
}

/**
 * Trả về [startOfWeek (Thứ 2), endOfWeek (Chủ nhật)] theo múi giờ Asia/Ho_Chi_Minh
 */
export function getVnWeekBounds(referenceDate: Date = new Date()): { start: Date; end: Date } {
  const ymd = toVnDateString(referenceDate);
  const anchor = new Date(`${ymd}T12:00:00+07:00`);
  const day = getVnDayOfWeek(anchor);
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(anchor.getTime() + diffToMonday * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);

  return {
    start: new Date(`${toVnDateString(monday)}T00:00:00.000+07:00`),
    end: new Date(`${toVnDateString(sunday)}T23:59:59.999+07:00`),
  };
}

/**
 * Cộng thêm n ngày vào Date một cách an toàn theo lịch VN
 */
export function addVnDays(date: Date, days: number): Date {
  const ymd = toVnDateString(date);
  const base = new Date(`${ymd}T12:00:00+07:00`);
  return new Date(base.getTime() + days * 86400000);
}

/**
 * Lấy giờ:phút hiện tại theo múi giờ Asia/Ho_Chi_Minh
 */
export function getVnNowHHMM(now: Date = new Date()): string {
  const vnTime = new Date(now.getTime() + VN_OFFSET_MS);
  const h = String(vnTime.getUTCHours()).padStart(2, '0');
  const m = String(vnTime.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

