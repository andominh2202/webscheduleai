import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(time: string): string {
  return time;
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatShortDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function getDayName(dayOfWeek: number): string {
  const days = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return days[dayOfWeek] || '';
}

export function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - startOfYear.getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.ceil(diff / oneWeek);
}

export function isEvenWeek(date: Date): boolean {
  return getWeekNumber(date) % 2 === 0;
}

export const COURSE_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#84cc16', // lime
  '#a855f7', // purple
];

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn cấp',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-green-600 bg-green-100',
  medium: 'text-yellow-600 bg-yellow-100',
  high: 'text-orange-600 bg-orange-100',
  urgent: 'text-red-600 bg-red-100',
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  upcoming: 'Sắp học',
  completed: 'Đã học',
  cancelled: 'Nghỉ học',
};

export const EXAM_TYPE_LABELS: Record<string, string> = {
  quiz: 'Kiểm tra',
  midterm: 'Giữa kỳ',
  final: 'Cuối kỳ',
  other: 'Khác',
};

export const EXAM_FORMAT_OPTIONS = [
  'Tự luận',
  'Trắc nghiệm',
  'Tự luận + Trắc nghiệm',
  'Vấn đáp',
  'Thực hành trên máy',
  'Bảo vệ đồ án / Tiểu luận',
  'Khác',
];

export interface GradingComponent {
  label: string;
  weight: number;
}

export function parseGradingBreakdown(raw?: string | null): GradingComponent[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x) => x && typeof x.label === 'string')
        .map((x) => ({ label: String(x.label), weight: Number(x.weight) || 0 }));
    }
  } catch {
    // Fallback if plain text like "30% QT - 70% CK"
  }
  return [];
}

