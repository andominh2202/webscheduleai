'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import viLocale from '@fullcalendar/core/locales/vi';
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getVnNowHHMM, toVnDateString } from '@/lib/timezone';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  MapPin,
  Clock,
  GraduationCap,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Rows3,
  FilterX,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatShortDate, SESSION_STATUS_LABELS } from '@/lib/utils';

export interface WeekViewSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  location?: string | null;
  status: string;
  type?: string;
  courseId: string;
  course: {
    id: string;
    name: string;
    courseCode?: string | null;
    color: string;
    instructor?: string | null;
  };
}

export interface WeekViewProps {
  sessions: WeekViewSession[];
  loading?: boolean;
  active?: boolean;
  hasActiveFilter?: boolean;
  onClearFilter?: () => void;
  onOpenMakeup?: () => void;
  onOpenImport?: () => void;
  onSelectSession: (sessionId: string) => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
  onSessionReschedule?: (
    sessionId: string,
    payload: { date: string; startTime: string; endTime: string }
  ) => Promise<void>;
}

export interface CourseColorPalette {
  accent: string;
  cssVars: React.CSSProperties;
}

const paletteCache = new Map<string, CourseColorPalette>();

function hexToHsl(hexInput?: string | null): { h: number; s: number; l: number } {
  const fallback = { h: 217, s: 91, l: 60 };
  if (!hexInput) return fallback;
  const cleaned = hexInput.trim().replace(/^#/, '');
  let r = 59;
  let g = 130;
  let b = 246;

  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
  } else {
    return fallback;
  }

  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Generates WCAG AA/AAA accessible Light & Dark CSS custom properties from any course hex color.
 */
export function getCoursePalette(color?: string | null): CourseColorPalette {
  const key = (color || '#3b82f6').toLowerCase();
  const cached = paletteCache.get(key);
  if (cached) return cached;

  const { h, s, l } = hexToHsl(key);
  const sat = Math.max(s, 55);
  const accent = `hsl(${h} ${Math.min(sat, 90)}% ${Math.min(Math.max(l, 42), 55)}%)`;

  const palette: CourseColorPalette = {
    accent,
    cssVars: {
      '--c-accent': accent,
      '--c-bg': `hsl(${h} ${Math.min(sat, 88)}% 95%)`,
      '--c-bg-hover': `hsl(${h} ${Math.min(sat, 88)}% 91%)`,
      '--c-border': `hsl(${h} ${Math.min(sat, 72)}% 81%)`,
      '--c-text': `hsl(${h} ${Math.min(sat, 82)}% 19%)`,
      '--c-sub': `hsl(${h} ${Math.min(sat, 56)}% 31%)`,
      '--c-badge': `hsl(${h} ${Math.min(sat, 78)}% 88%)`,
      '--c-dark-bg': `hsl(${h} ${Math.min(sat, 62)}% 16%)`,
      '--c-dark-bg-hover': `hsl(${h} ${Math.min(sat, 64)}% 21%)`,
      '--c-dark-border': `hsl(${h} ${Math.min(sat, 52)}% 30%)`,
      '--c-dark-text': `hsl(${h} ${Math.min(sat, 88)}% 92%)`,
      '--c-dark-sub': `hsl(${h} ${Math.min(sat, 62)}% 77%)`,
      '--c-dark-badge': `hsl(${h} ${Math.min(sat, 56)}% 25%)`,
    } as React.CSSProperties,
  };

  if (paletteCache.size > 150) {
    paletteCache.clear();
  }
  paletteCache.set(key, palette);
  return palette;
}

const PERIOD_HOURS: Record<number, string> = {
  7: 'Tiết 1',
  8: 'Tiết 2',
  9: 'Tiết 3',
  10: 'Tiết 4',
  11: 'Tiết 5',
  12: 'Nghỉ trưa',
  13: 'Tiết 6',
  14: 'Tiết 7',
  15: 'Tiết 8',
  16: 'Tiết 9',
  17: 'Tiết 10',
  18: 'Tiết 11',
  19: 'Tiết 12',
  20: 'Tiết 13',
  21: 'Tiết 14',
};

const WEEKDAY_LABELS = [
  { dow: 1, short: 'T2', full: 'Thứ Hai' },
  { dow: 2, short: 'T3', full: 'Thứ Ba' },
  { dow: 3, short: 'T4', full: 'Thứ Tư' },
  { dow: 4, short: 'T5', full: 'Thứ Năm' },
  { dow: 5, short: 'T6', full: 'Thứ Sáu' },
  { dow: 6, short: 'T7', full: 'Thứ Bảy' },
  { dow: 0, short: 'CN', full: 'Chủ nhật' },
];

function normalizeTime(timeStr?: string | null): string {
  if (!timeStr) return '07:00';
  const [h = '07', m = '00'] = timeStr.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function WeekViewSkeleton() {
  return (
    <div
      className="rounded-xl border bg-card p-3 sm:p-4 shadow-sm space-y-3 animate-pulse"
      aria-busy="true"
      aria-label="Đang tải lịch tuần"
    >
      <div className="grid grid-cols-8 gap-2 border-b pb-2.5">
        <div className="h-5 rounded bg-muted/70" />
        {Array.from({ length: 7 }).map((_, idx) => (
          <div key={idx} className="h-5 rounded bg-muted/80" />
        ))}
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 7 }).map((_, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-8 gap-2 items-center">
            <div className="h-4 w-12 rounded bg-muted/60" />
            {Array.from({ length: 7 }).map((__, colIdx) => {
              const hasBlock = (rowIdx + colIdx * 2) % 5 === 0;
              return (
                <div
                  key={colIdx}
                  className={cn(
                    'h-12 rounded-lg border border-border/40',
                    hasBlock ? 'bg-primary/15 border-l-4 border-l-primary/50' : 'bg-muted/20'
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeekView({
  sessions,
  loading = false,
  active = true,
  hasActiveFilter = false,
  onClearFilter,
  onOpenMakeup,
  onOpenImport,
  onSelectSession,
  onDateRangeChange,
  onSessionReschedule,
}: WeekViewProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [rangeLabel, setRangeLabel] = useState<string>('');
  const [currentWeekBounds, setCurrentWeekBounds] = useState<{ start: Date; end: Date } | null>(null);
  const [axisMode, setAxisMode] = useState<'hour' | 'period'>('hour');
  const [compact, setCompact] = useState(false);
  const [mobileMode, setMobileMode] = useState<'agenda' | 'grid'>('grid');
  const [nowInfo, setNowInfo] = useState<{ todayKey: string; hhmm: string } | null>(null);

  const lastEmittedRangeRef = useRef<string>('');
  const latestRangeRef = useRef<{ start: Date; end: Date; key: string } | null>(null);

  // Live current-time clock (updates once a minute, client-only to avoid hydration mismatch)
  useEffect(() => {
    const syncClock = () => {
      const now = new Date();
      setNowInfo({
        todayKey: toVnDateString(now),
        hhmm: getVnNowHHMM(now),
      });
    };
    syncClock();
    const timer = window.setInterval(syncClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (active && calendarRef.current) {
      calendarRef.current.getApi().updateSize();
      if (
        latestRangeRef.current &&
        lastEmittedRangeRef.current !== latestRangeRef.current.key
      ) {
        lastEmittedRangeRef.current = latestRangeRef.current.key;
        onDateRangeChange?.(latestRangeRef.current.start, latestRangeRef.current.end);
      }
    }
  }, [active, onDateRangeChange]);

  const isCurrentWeekDisplayed = useMemo(() => {
    if (!currentWeekBounds || !nowInfo) return true;
    const startKey = format(currentWeekBounds.start, 'yyyy-MM-dd');
    const endKey = format(currentWeekBounds.end, 'yyyy-MM-dd');
    return nowInfo.todayKey >= startKey && nowInfo.todayKey <= endKey;
  }, [currentWeekBounds, nowInfo]);

  const events: EventInput[] = useMemo(() => {
    return sessions.map((session) => {
      const startNorm = normalizeTime(session.startTime);
      const endNorm = normalizeTime(session.endTime);
      const dateKey = toVnDateString(session.date);
      const isOngoing =
        Boolean(nowInfo) &&
        session.status !== 'cancelled' &&
        dateKey === nowInfo?.todayKey &&
        nowInfo.hhmm >= startNorm &&
        nowInfo.hhmm <= endNorm;

      return {
        id: session.id,
        title: session.course?.name || 'Buổi học',
        start: `${dateKey}T${startNorm}:00`,
        end: `${dateKey}T${endNorm}:00`,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        extendedProps: {
          sessionId: session.id,
          room: session.room || '',
          location: session.location || '',
          courseId: session.courseId,
          courseName: session.course?.name || 'Buổi học',
          courseCode: session.course?.courseCode || '',
          color: session.course?.color || '#3b82f6',
          startTime: startNorm,
          endTime: endNorm,
          status: session.status,
          type: session.type || 'regular',
          isOngoing,
        },
      };
    });
  }, [sessions, nowInfo]);

  // Group sessions by day of week for mobile Agenda mode
  const groupedWeekDays = useMemo(() => {
    const byDate = new Map<string, WeekViewSession[]>();
    for (const s of sessions) {
      const key = toVnDateString(s.date);
      const list = byDate.get(key);
      if (list) list.push(s);
      else byDate.set(key, [s]);
    }
    for (const list of byDate.values()) {
      list.sort((a, b) => normalizeTime(a.startTime).localeCompare(normalizeTime(b.startTime)));
    }

    if (!currentWeekBounds) return [];

    return WEEKDAY_LABELS.map((dayMeta, idx) => {
      const dayDate = new Date(currentWeekBounds.start.getTime() + idx * 86400000);
      const dateKey = format(dayDate, 'yyyy-MM-dd');
      return {
        ...dayMeta,
        dateKey,
        displayDate: format(dayDate, 'dd/MM'),
        isToday: nowInfo?.todayKey === dateKey,
        items: byDate.get(dateKey) || [],
      };
    });
  }, [sessions, currentWeekBounds, nowInfo]);

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const endDisplay = new Date(arg.end.getTime() - 86400000);
      const startLabel = format(arg.start, 'dd/MM', { locale: vi });
      const endLabel = format(endDisplay, 'dd/MM/yyyy', { locale: vi });
      setRangeLabel(`Tuần ${startLabel} – ${endLabel}`);
      setCurrentWeekBounds({ start: arg.start, end: endDisplay });

      const rangeKey = `${arg.startStr}_${arg.endStr}`;
      latestRangeRef.current = { start: arg.start, end: endDisplay, key: rangeKey };

      if (active && lastEmittedRangeRef.current !== rangeKey) {
        lastEmittedRangeRef.current = rangeKey;
        onDateRangeChange?.(arg.start, endDisplay);
      }
    },
    [active, onDateRangeChange]
  );

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const sessionId =
        (info.event.extendedProps?.sessionId as string | undefined) || info.event.id;
      if (sessionId) {
        onSelectSession(sessionId);
      }
    },
    [onSelectSession]
  );

  const handleEventDropOrResize = useCallback(
    async (info: EventDropArg | EventResizeDoneArg) => {
      if (!onSessionReschedule || !info.event.start || !info.event.end) {
        info.revert();
        return;
      }

      const sessionId =
        (info.event.extendedProps?.sessionId as string | undefined) || info.event.id;
      const newDate = format(info.event.start, 'yyyy-MM-dd');
      const newStart = format(info.event.start, 'HH:mm');
      const newEnd = format(info.event.end, 'HH:mm');

      try {
        await onSessionReschedule(sessionId, {
          date: newDate,
          startTime: newStart,
          endTime: newEnd,
        });
      } catch {
        info.revert();
      }
    },
    [onSessionReschedule]
  );

  const renderEventContent = useCallback((eventInfo: EventContentArg) => {
    const props = eventInfo.event.extendedProps as {
      room?: string;
      location?: string;
      startTime?: string;
      endTime?: string;
      status?: string;
      type?: string;
      courseName?: string;
      courseCode?: string;
      color?: string;
      isOngoing?: boolean;
    };

    const isCancelled = props.status === 'cancelled';
    const isCompleted = props.status === 'completed';
    const palette = getCoursePalette(props.color);
    const tooltipText = [
      props.courseCode ? `[${props.courseCode}] ${props.courseName || eventInfo.event.title}` : (props.courseName || eventInfo.event.title),
      `${props.startTime}–${props.endTime}`,
      props.room ? `Phòng ${props.room}` : props.location,
    ]
      .filter(Boolean)
      .join(' • ');

    return (
      <div
        title={tooltipText}
        style={isCancelled ? undefined : palette.cssVars}
        className={cn(
          'group h-full w-full rounded-md border border-l-[3.5px] px-1.5 py-1 overflow-hidden flex flex-col justify-between leading-tight select-none transition-all',
          isCancelled
            ? 'bg-slate-100/95 border-slate-300 border-l-rose-500 text-slate-600 dark:bg-slate-900/90 dark:border-slate-700 dark:border-l-rose-500 dark:text-slate-400'
            : 'bg-[var(--c-bg)] hover:bg-[var(--c-bg-hover)] border-[var(--c-border)] border-l-[var(--c-accent)] text-[var(--c-text)] dark:bg-[var(--c-dark-bg)] dark:hover:bg-[var(--c-dark-bg-hover)] dark:border-[var(--c-dark-border)] dark:text-[var(--c-dark-text)] shadow-sm',
          props.isOngoing && 'ring-2 ring-rose-500/70 shadow-sm'
        )}
      >
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center justify-between gap-1 text-[10px] font-medium tabular-nums truncate">
            <span
              className={cn(
                'truncate',
                !isCancelled && 'text-[var(--c-sub)] dark:text-[var(--c-dark-sub)]'
              )}
            >
              {props.startTime}–{props.endTime}
            </span>

            {props.isOngoing ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-rose-500 px-1 py-0.5 text-[9px] font-semibold text-white shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                Đang học
              </span>
            ) : isCancelled ? (
              <span className="rounded bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 px-1 py-0.5 text-[9px] font-semibold shrink-0">
                {SESSION_STATUS_LABELS.cancelled}
              </span>
            ) : props.type === 'makeup' ? (
              <span className="rounded bg-[var(--c-badge)] dark:bg-[var(--c-dark-badge)] px-1 py-0.5 text-[9px] font-semibold shrink-0">
                Học bù
              </span>
            ) : props.type === 'moved' ? (
              <span className="rounded bg-[var(--c-badge)] dark:bg-[var(--c-dark-badge)] px-1 py-0.5 text-[9px] font-semibold shrink-0">
                Đổi lịch
              </span>
            ) : isCompleted ? (
              <CheckCircle2
                className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-label="Đã học"
              />
            ) : null}
          </div>

          <div
            className={cn(
              'text-[11px] sm:text-xs font-semibold line-clamp-2 break-words',
              isCancelled && 'line-through opacity-80'
            )}
          >
            {props.courseName || eventInfo.event.title}
          </div>
        </div>

        {(props.room || props.location) && (
          <div
            className={cn(
              'flex items-center gap-1 mt-0.5 text-[10px] font-medium truncate',
              !isCancelled && 'text-[var(--c-sub)] dark:text-[var(--c-dark-sub)]'
            )}
          >
            <MapPin className="w-2.5 h-2.5 shrink-0 opacity-80" />
            <span className="truncate">
              {props.room ? `P.${props.room}` : props.location}
            </span>
          </div>
        )}
      </div>
    );
  }, []);

  const slotLabelContent = useCallback(
    (arg: { date: Date }) => {
      if (axisMode === 'period') {
        const h = arg.date.getHours();
        const m = arg.date.getMinutes();
        if (m === 0 && PERIOD_HOURS[h]) {
          return (
            <div className="flex flex-col items-end pr-1 leading-tight">
              <span className="text-[11px] font-semibold text-foreground">
                {PERIOD_HOURS[h]}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          );
        }
        return '';
      }
      return undefined;
    },
    [axisMode]
  );

  const showInitialSkeleton = loading && sessions.length === 0;
  const showEmptyBanner = !loading && sessions.length === 0;

  return (
    <div className="space-y-3">
      {/* Week Navigation & View Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-sm">
        <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-lg border bg-background p-0.5 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => calendarRef.current?.getApi().prev()}
              className="h-7 w-7 p-0 rounded-md"
              aria-label="Tuần trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant={isCurrentWeekDisplayed ? 'ghost' : 'secondary'}
              size="sm"
              onClick={() => calendarRef.current?.getApi().today()}
              className="h-7 px-2.5 text-xs font-medium rounded-md gap-1.5"
            >
              {!isCurrentWeekDisplayed && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
              Hôm nay
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => calendarRef.current?.getApi().next()}
              className="h-7 w-7 p-0 rounded-md"
              aria-label="Tuần sau"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <h2 className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-primary hidden sm:inline shrink-0" />
            <span>{rangeLabel || 'Thời khóa biểu tuần'}</span>
          </h2>

          {nowInfo && isCurrentWeekDisplayed && (
            <span
              className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
              title="Vạch đỏ trên lịch biểu thị thời gian hiện tại"
            >
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              Bây giờ {nowInfo.hhmm}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap print:hidden">
          {loading && sessions.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>Đang đồng bộ...</span>
            </span>
          )}

          {/* Mobile layout switcher: Grid vs Day Agenda */}
          <div
            role="group"
            aria-label="Chế độ hiển thị trên màn hình nhỏ"
            className="inline-flex md:hidden items-center rounded-lg border bg-background p-0.5 text-xs"
          >
            <button
              type="button"
              aria-pressed={mobileMode === 'grid'}
              onClick={() => setMobileMode('grid')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors',
                mobileMode === 'grid'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="w-3 h-3" />
              Lưới
            </button>
            <button
              type="button"
              aria-pressed={mobileMode === 'agenda'}
              onClick={() => setMobileMode('agenda')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors',
                mobileMode === 'agenda'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Rows3 className="w-3 h-3" />
              Theo thứ
            </button>
          </div>

          {/* Density Toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCompact((value) => !value)}
            className={cn('h-8 gap-1.5 text-xs', mobileMode === 'agenda' && 'hidden md:inline-flex')}
            aria-pressed={compact}
          >
            {compact ? (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Chi tiết</span>
              </>
            ) : (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Thu gọn</span>
              </>
            )}
          </Button>

          {/* Axis Mode Toggle */}
          <div
            role="group"
            aria-label="Đơn vị trục thời gian"
            className={cn(
              'inline-flex items-center rounded-lg border bg-background p-0.5 text-xs',
              mobileMode === 'agenda' && 'hidden md:inline-flex'
            )}
          >
            <button
              type="button"
              aria-pressed={axisMode === 'hour'}
              onClick={() => setAxisMode('hour')}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors',
                axisMode === 'hour'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Clock className="w-3 h-3" />
              Theo giờ
            </button>
            <button
              type="button"
              aria-pressed={axisMode === 'period'}
              onClick={() => setAxisMode('period')}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors',
                axisMode === 'period'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <GraduationCap className="w-3 h-3" />
              Theo tiết
            </button>
          </div>
        </div>
      </div>

      {/* Empty State Banner (keeps FullCalendar mounted so navigation still works smoothly) */}
      {showEmptyBanner && (
        <div className="rounded-xl border border-dashed bg-card/70 px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {hasActiveFilter
                  ? 'Không có buổi học nào khớp bộ lọc trong tuần này'
                  : 'Tuần này chưa có buổi học nào được lên lịch'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hasActiveFilter
                  ? 'Thử xóa bộ lọc môn học/trạng thái hoặc chuyển sang tuần khác.'
                  : 'Bạn có thể chuyển tuần, thêm buổi học bù hoặc nhập thời khóa biểu từ Excel/ảnh.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasActiveFilter && onClearFilter ? (
              <Button variant="outline" size="sm" onClick={onClearFilter} className="gap-1.5 text-xs">
                <FilterX className="h-3.5 w-3.5" />
                Xóa bộ lọc
              </Button>
            ) : (
              <>
                {onOpenMakeup && (
                  <Button variant="outline" size="sm" onClick={onOpenMakeup} className="gap-1.5 text-xs">
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Thêm học bù
                  </Button>
                )}
                {onOpenImport && (
                  <Button variant="secondary" size="sm" onClick={onOpenImport} className="gap-1.5 text-xs">
                    <Upload className="h-3.5 w-3.5" />
                    Nhập TKB
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Day-by-Day Agenda View (optional toggle on small screens) */}
      {mobileMode === 'agenda' && (
        <div className="md:hidden space-y-2.5">
          {showInitialSkeleton ? (
            <div className="space-y-2.5 animate-pulse">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-24 rounded-xl border bg-card p-3" />
              ))}
            </div>
          ) : (
            groupedWeekDays.map((day) => (
              <div
                key={day.dateKey}
                className={cn(
                  'rounded-xl border bg-card p-3 space-y-2 transition-colors',
                  day.isToday && 'border-primary/60 ring-1 ring-primary/20'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold',
                        day.isToday
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      )}
                    >
                      {day.full}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {day.displayDate}
                    </span>
                    {day.isToday && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Hôm nay
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {day.items.length > 0 ? `${day.items.length} buổi` : 'Trống'}
                  </span>
                </div>

                {day.items.length > 0 && (
                  <div className="space-y-2">
                    {day.items.map((session) => {
                      const palette = getCoursePalette(session.course?.color);
                      const isCancelled = session.status === 'cancelled';
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => onSelectSession(session.id)}
                          style={isCancelled ? undefined : palette.cssVars}
                          className={cn(
                            'w-full text-left rounded-lg border border-l-4 p-2.5 transition-all',
                            isCancelled
                              ? 'bg-slate-100/90 border-slate-300 border-l-rose-500 text-slate-600 dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-400'
                              : 'bg-[var(--c-bg)] border-[var(--c-border)] border-l-[var(--c-accent)] text-[var(--c-text)] dark:bg-[var(--c-dark-bg)] dark:border-[var(--c-dark-border)] dark:text-[var(--c-dark-text)]'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={cn(
                                'text-sm font-semibold',
                                isCancelled && 'line-through'
                              )}
                            >
                              {session.course?.name}
                            </span>
                            <span className="text-[11px] font-medium tabular-nums shrink-0">
                              {normalizeTime(session.startTime)}–{normalizeTime(session.endTime)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 mt-1 text-xs opacity-90">
                            <span>
                              {session.room
                                ? `Phòng ${session.room}`
                                : session.location || formatShortDate(session.date)}
                            </span>
                            <span className="text-[11px] font-medium">
                              {session.type === 'makeup'
                                ? 'Học bù • '
                                : session.type === 'moved'
                                  ? 'Đổi lịch • '
                                  : ''}
                              {SESSION_STATUS_LABELS[session.status] || session.status}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* FullCalendar Week Grid (kept mounted so datesSet & ref API stay active) */}
      <div
        className={cn(
          'relative rounded-xl border bg-card p-1.5 sm:p-3 shadow-sm overflow-x-auto',
          mobileMode === 'agenda' && 'hidden md:block'
        )}
      >
        {showInitialSkeleton && (
          <div className="absolute inset-0 z-20 bg-card/90 backdrop-blur-[1px] p-3">
            <WeekViewSkeleton />
          </div>
        )}

        <div
          className={cn(
            // Prominent red current-time indicator line + glowing dot
            '[&_.fc-timegrid-now-indicator-line]:border-t-2 [&_.fc-timegrid-now-indicator-line]:border-rose-500 [&_.fc-timegrid-now-indicator-line]:z-20',
            "[&_.fc-timegrid-now-indicator-line]:before:content-[''] [&_.fc-timegrid-now-indicator-line]:before:absolute [&_.fc-timegrid-now-indicator-line]:before:-left-1.5 [&_.fc-timegrid-now-indicator-line]:before:-top-[5px] [&_.fc-timegrid-now-indicator-line]:before:h-2.5 [&_.fc-timegrid-now-indicator-line]:before:w-2.5 [&_.fc-timegrid-now-indicator-line]:before:rounded-full [&_.fc-timegrid-now-indicator-line]:before:bg-rose-500 [&_.fc-timegrid-now-indicator-line]:before:ring-4 [&_.fc-timegrid-now-indicator-line]:before:ring-rose-500/25",
            '[&_.fc-timegrid-now-indicator-arrow]:border-rose-500',
            '[&_.fc-timegrid-event_.fc-event-main]:p-0.5',
            '[&_.fc-timegrid-col.fc-day-today]:bg-primary/[0.025]',
            '[&_.fc-col-header-cell.fc-day-today]:bg-primary/10 [&_.fc-col-header-cell.fc-day-today_.fc-col-header-cell-cushion]:text-primary [&_.fc-col-header-cell.fc-day-today_.fc-col-header-cell-cushion]:font-bold',
            compact
              ? 'w-full min-w-0 [&_.fc-col-header-cell-cushion]:text-[11px] sm:[&_.fc-col-header-cell-cushion]:text-xs [&_.fc-timegrid-slot]:h-[1.75em]'
              : 'min-w-[680px] sm:min-w-0 [&_.fc-timegrid-slot]:h-[2.25em]'
          )}
        >
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale={viLocale}
            firstDay={1}
            headerToolbar={false}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            slotDuration={compact ? '01:00:00' : '00:30:00'}
            slotLabelContent={slotLabelContent}
            slotLabelFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }}
            dayHeaderFormat={{
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
            }}
            allDaySlot={false}
            nowIndicator={true}
            editable={Boolean(onSessionReschedule)}
            eventDurationEditable={Boolean(onSessionReschedule)}
            height="auto"
            eventMinHeight={compact ? 22 : 34}
            dayHeaderClassNames={compact ? 'text-[11px] sm:text-xs' : 'text-xs sm:text-sm'}
            expandRows={true}
            events={events}
            eventContent={renderEventContent}
            eventClick={handleEventClick}
            eventDrop={handleEventDropOrResize}
            eventResize={handleEventDropOrResize}
            datesSet={handleDatesSet}
            eventClassNames="!bg-transparent !border-0 !shadow-none !p-0 overflow-visible"
          />
        </div>
      </div>

      {onSessionReschedule && (
        <p className="text-xs text-muted-foreground px-1 print:hidden">
          Mẹo: Nhấn vào thẻ môn học để mở ghi chú, checklist & tài liệu; kéo thả thẻ trên lưới tuần để dời ngày hoặc đổi giờ học.
        </p>
      )}
    </div>
  );
}
