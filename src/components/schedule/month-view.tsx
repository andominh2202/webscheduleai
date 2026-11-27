'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction';
import viLocale from '@fullcalendar/core/locales/vi';
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventInput,
} from '@fullcalendar/core';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { toVnDateString } from '@/lib/timezone';
import {
  BookOpen,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FilterX,
  GraduationCap,
  Loader2,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCoursePalette } from './week-view';
import {
  cn,
  EXAM_TYPE_LABELS,
  formatDate,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  SESSION_STATUS_LABELS,
} from '@/lib/utils';

export interface MonthViewSession {
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
  };
}

export interface MonthViewAssignment {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  completed: boolean;
  priority: string;
  courseId: string;
  course: {
    id: string;
    name: string;
    color: string;
  };
}

export interface MonthViewExam {
  id: string;
  title: string;
  type: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  room?: string | null;
  location?: string | null;
  courseId: string;
  course: {
    id: string;
    name: string;
    color: string;
  };
}

export interface MonthViewProps {
  sessions: MonthViewSession[];
  assignments: MonthViewAssignment[];
  exams: MonthViewExam[];
  loading?: boolean;
  active?: boolean;
  hasActiveFilter?: boolean;
  onClearFilter?: () => void;
  onSelectSession: (sessionId: string) => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
}

function normalizeTime(timeStr?: string | null): string {
  if (!timeStr) return '00:00';
  const [h = '00', m = '00'] = timeStr.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function getLocalDateKey(dateInput: string | Date): string {
  return toVnDateString(dateInput);
}

export function MonthViewSkeleton() {
  return (
    <div
      className="rounded-xl border bg-card p-3 sm:p-4 shadow-sm space-y-3 animate-pulse"
      aria-busy="true"
      aria-label="Đang tải lịch tháng"
    >
      <div className="grid grid-cols-7 gap-2 border-b pb-2">
        {Array.from({ length: 7 }).map((_, idx) => (
          <div key={idx} className="h-4 rounded bg-muted/80" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, idx) => (
          <div
            key={idx}
            className="h-20 rounded-lg border border-border/50 bg-muted/20 p-1.5 space-y-1.5"
          >
            <div className="h-3 w-5 rounded bg-muted/70 ml-auto" />
            {idx % 3 === 0 && <div className="h-3.5 w-full rounded bg-primary/15" />}
            {idx % 5 === 0 && <div className="h-3.5 w-4/5 rounded bg-amber-500/15" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonthView({
  sessions,
  assignments,
  exams,
  loading = false,
  active = true,
  hasActiveFilter = false,
  onClearFilter,
  onSelectSession,
  onDateRangeChange,
}: MonthViewProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [monthLabel, setMonthLabel] = useState<string>('');
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() =>
    toVnDateString(new Date())
  );
  const lastEmittedRangeRef = useRef<string>('');
  const latestRangeRef = useRef<{ start: Date; end: Date; key: string } | null>(null);

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

  const events: EventInput[] = useMemo(() => {
    const sessionEvents: EventInput[] = sessions.map((s) => {
      const dateKey = getLocalDateKey(s.date);
      const color = s.course?.color || '#3b82f6';
      return {
        id: `session-${s.id}`,
        title: s.course?.name || 'Buổi học',
        start: `${dateKey}T${normalizeTime(s.startTime)}:00`,
        end: `${dateKey}T${normalizeTime(s.endTime)}:00`,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        extendedProps: {
          kind: 'session',
          sessionId: s.id,
          dateKey,
          timeLabel: normalizeTime(s.startTime),
          room: s.room || '',
          courseColor: color,
          status: s.status,
          type: s.type || 'regular',
        },
      };
    });

    const assignmentEvents: EventInput[] = assignments.map((a) => {
      const dateKey = getLocalDateKey(a.dueDate);
      return {
        id: `assignment-${a.id}`,
        title: a.title,
        start: dateKey,
        allDay: true,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        extendedProps: {
          kind: 'assignment',
          assignmentId: a.id,
          dateKey,
          completed: a.completed,
        },
      };
    });

    const examEvents: EventInput[] = exams.map((e) => {
      const dateKey = getLocalDateKey(e.date);
      return {
        id: `exam-${e.id}`,
        title: e.title,
        start: dateKey,
        allDay: true,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        extendedProps: {
          kind: 'exam',
          examId: e.id,
          dateKey,
          timeLabel: e.startTime ? normalizeTime(e.startTime) : '',
        },
      };
    });

    return [...examEvents, ...sessionEvents, ...assignmentEvents];
  }, [sessions, assignments, exams]);

  // Pre-index items by date key in O(N) so clicking between days in MonthView is O(1)
  const itemsByDayMap = useMemo(() => {
    const map = new Map<
      string,
      {
        daySessions: MonthViewSession[];
        dayAssignments: MonthViewAssignment[];
        dayExams: MonthViewExam[];
      }
    >();

    const ensure = (key: string) => {
      let entry = map.get(key);
      if (!entry) {
        entry = { daySessions: [], dayAssignments: [], dayExams: [] };
        map.set(key, entry);
      }
      return entry;
    };

    for (const s of sessions) {
      ensure(getLocalDateKey(s.date)).daySessions.push(s);
    }
    for (const a of assignments) {
      ensure(getLocalDateKey(a.dueDate)).dayAssignments.push(a);
    }
    for (const e of exams) {
      ensure(getLocalDateKey(e.date)).dayExams.push(e);
    }
    for (const entry of map.values()) {
      entry.daySessions.sort((a, b) =>
        normalizeTime(a.startTime).localeCompare(normalizeTime(b.startTime))
      );
    }
    return map;
  }, [sessions, assignments, exams]);

  const selectedDayItems = useMemo(() => {
    return (
      itemsByDayMap.get(selectedDayKey) || {
        daySessions: [],
        dayAssignments: [],
        dayExams: [],
      }
    );
  }, [itemsByDayMap, selectedDayKey]);

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const titleDate = arg.view.currentStart;
      const formattedMonth = format(titleDate, 'MMMM, yyyy', { locale: vi });
      setMonthLabel(
        formattedMonth.charAt(0).toUpperCase() + formattedMonth.slice(1)
      );

      const rangeKey = `${arg.startStr}_${arg.endStr}`;
      const endInclusive = new Date(arg.end.getTime() - 86400000);
      latestRangeRef.current = { start: arg.start, end: endInclusive, key: rangeKey };

      if (active && lastEmittedRangeRef.current !== rangeKey) {
        lastEmittedRangeRef.current = rangeKey;
        onDateRangeChange?.(arg.start, endInclusive);
      }
    },
    [active, onDateRangeChange]
  );

  const handleDateClick = useCallback((arg: DateClickArg) => {
    setSelectedDayKey(arg.dateStr.slice(0, 10));
  }, []);

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const props = info.event.extendedProps as {
        kind?: string;
        sessionId?: string;
        dateKey?: string;
      };
      if (props.dateKey) {
        setSelectedDayKey(props.dateKey);
      }
      if (props.kind === 'session' && props.sessionId) {
        onSelectSession(props.sessionId);
      }
    },
    [onSelectSession]
  );

  const renderEventContent = useCallback((eventInfo: EventContentArg) => {
    const props = eventInfo.event.extendedProps as {
      kind?: string;
      timeLabel?: string;
      room?: string;
      courseColor?: string;
      status?: string;
      type?: string;
      completed?: boolean;
    };

    if (props.kind === 'exam') {
      return (
        <div className="flex items-center gap-1 rounded border border-rose-300 dark:border-rose-800 bg-rose-100/95 dark:bg-rose-950/80 px-1.5 py-0.5 text-[10px] sm:text-[11px] leading-tight truncate text-rose-900 dark:text-rose-200 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400 shrink-0" />
          <span className="font-bold shrink-0">Thi:</span>
          <span className="truncate">{eventInfo.event.title}</span>
        </div>
      );
    }

    if (props.kind === 'assignment') {
      return (
        <div
          className={cn(
            'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] sm:text-[11px] leading-tight truncate font-medium',
            props.completed
              ? 'border-slate-300 bg-slate-100 text-slate-500 line-through dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
              : 'border-amber-300 bg-amber-100/95 text-amber-950 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full shrink-0',
              props.completed ? 'bg-slate-400' : 'bg-amber-500'
            )}
          />
          <span className="font-semibold shrink-0">BT:</span>
          <span className="truncate">{eventInfo.event.title}</span>
        </div>
      );
    }

    const isCancelled = props.status === 'cancelled';
    const palette = getCoursePalette(props.courseColor);
    const tooltipText = [
      eventInfo.event.title,
      props.timeLabel,
      props.room ? `P.${props.room}` : undefined,
    ]
      .filter(Boolean)
      .join(' • ');

    return (
      <div
        title={tooltipText}
        style={isCancelled ? undefined : palette.cssVars}
        className={cn(
          'flex items-center gap-1 rounded border border-l-[3px] px-1.5 py-0.5 text-[10px] sm:text-[11px] leading-tight truncate transition-colors',
          isCancelled
            ? 'border-slate-300 border-l-rose-500 bg-slate-100 text-slate-500 line-through dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
            : 'bg-[var(--c-bg)] hover:bg-[var(--c-bg-hover)] border-[var(--c-border)] border-l-[var(--c-accent)] text-[var(--c-text)] dark:bg-[var(--c-dark-bg)] dark:hover:bg-[var(--c-dark-bg-hover)] dark:border-[var(--c-dark-border)] dark:text-[var(--c-dark-text)]'
        )}
      >
        {props.timeLabel && (
          <span className="font-semibold tabular-nums shrink-0 opacity-85">
            {props.timeLabel}
          </span>
        )}
        <span className="font-medium truncate">{eventInfo.event.title}</span>
      </div>
    );
  }, []);

  const selectedDateObj = useMemo(
    () => new Date(`${selectedDayKey}T12:00:00`),
    [selectedDayKey]
  );

  const totalSelectedCount =
    selectedDayItems.daySessions.length +
    selectedDayItems.dayAssignments.length +
    selectedDayItems.dayExams.length;

  const showInitialSkeleton =
    loading &&
    sessions.length === 0 &&
    assignments.length === 0 &&
    exams.length === 0;

  return (
    <div className="space-y-4">
      {/* Toolbar + Legend */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-lg border bg-background p-0.5 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => calendarRef.current?.getApi().prev()}
              className="h-7 w-7 p-0 rounded-md"
              aria-label="Tháng trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                calendarRef.current?.getApi().today();
                setSelectedDayKey(toVnDateString(new Date()));
              }}
              className="h-7 px-2.5 text-xs font-medium rounded-md"
            >
              Hôm nay
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => calendarRef.current?.getApi().next()}
              className="h-7 w-7 p-0 rounded-md"
              aria-label="Tháng sau"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <h2 className="text-sm sm:text-base font-semibold flex items-center gap-1.5 ml-1">
            <CalendarIcon className="w-4 h-4 text-primary hidden sm:inline" />
            <span>{monthLabel || 'Lịch tháng'}</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {loading && !showInitialSkeleton && (
            <span className="inline-flex items-center gap-1.5 text-primary font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Đang đồng bộ...
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary/80" />
            Buổi học
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
            Hạn bài tập
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-600" />
            Lịch thi
          </span>
        </div>
      </div>

      {/* Month Calendar */}
      <div className="relative rounded-xl border bg-card p-2 sm:p-4 shadow-sm overflow-x-auto">
        {showInitialSkeleton && (
          <div className="absolute inset-0 z-20 bg-card/90 backdrop-blur-[1px] p-3">
            <MonthViewSkeleton />
          </div>
        )}

        <div className="min-w-[560px] sm:min-w-0 [&_.fc-daygrid-event]:!bg-transparent [&_.fc-daygrid-event]:!border-0 [&_.fc-daygrid-event-harness]:mb-0.5 [&_.fc-day-today_.fc-daygrid-day-number]:bg-primary [&_.fc-day-today_.fc-daygrid-day-number]:text-primary-foreground [&_.fc-day-today_.fc-daygrid-day-number]:rounded-full [&_.fc-day-today_.fc-daygrid-day-number]:px-1.5 [&_.fc-day-today_.fc-daygrid-day-number]:py-0.5 [&_.fc-day-today_.fc-daygrid-day-number]:font-bold [&_.fc-day-today_.fc-daygrid-day-number]:m-0.5">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={viLocale}
            firstDay={1}
            headerToolbar={false}
            height="auto"
            dayMaxEvents={3}
            events={events}
            eventContent={renderEventContent}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            dayCellClassNames={(arg) =>
              getLocalDateKey(arg.date) === selectedDayKey
                ? 'ring-2 ring-inset ring-primary/70 bg-primary/5 cursor-pointer'
                : 'cursor-pointer hover:bg-accent/30 transition-colors'
            }
          />
        </div>
      </div>

      {/* Selected Day Events List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base sm:text-lg capitalize flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
              <span>Chi tiết {formatDate(selectedDateObj)}</span>
            </CardTitle>
            <Badge variant="secondary">{totalSelectedCount} sự kiện</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {totalSelectedCount === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Không có buổi học, hạn nộp bài tập hay lịch thi trong ngày này
              </p>
              {hasActiveFilter && onClearFilter && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearFilter}
                  className="gap-1.5 text-xs"
                >
                  <FilterX className="h-3.5 w-3.5" />
                  Xóa bộ lọc đang bật
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Exams */}
              {selectedDayItems.dayExams.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5" />
                    Lịch thi ({selectedDayItems.dayExams.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {selectedDayItems.dayExams.map((exam) => (
                      <div
                        key={exam.id}
                        className="rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/60 dark:bg-rose-950/25 p-3 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-sm">{exam.title}</span>
                          <Badge variant="destructive" className="text-[11px] shrink-0">
                            {EXAM_TYPE_LABELS[exam.type] || exam.type}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: exam.course?.color || '#e11d48' }}
                            />
                            {exam.course?.name}
                          </span>
                          {exam.startTime && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Clock className="w-3 h-3" />
                              {normalizeTime(exam.startTime)}
                              {exam.endTime ? ` – ${normalizeTime(exam.endTime)}` : ''}
                            </span>
                          )}
                          {exam.room && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              Phòng {exam.room}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sessions */}
              {selectedDayItems.daySessions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    Buổi học ({selectedDayItems.daySessions.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {selectedDayItems.daySessions.map((session) => {
                      const palette = getCoursePalette(session.course?.color);
                      const isCancelled = session.status === 'cancelled';

                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => onSelectSession(session.id)}
                          style={isCancelled ? undefined : palette.cssVars}
                          className={cn(
                            'text-left rounded-xl border border-l-4 p-3 transition-all space-y-1.5 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isCancelled
                              ? 'bg-slate-100/80 border-slate-300 border-l-rose-500 text-slate-600 dark:bg-slate-900/70 dark:border-slate-700 dark:text-slate-400'
                              : 'bg-[var(--c-bg)] hover:bg-[var(--c-bg-hover)] border-[var(--c-border)] border-l-[var(--c-accent)] text-[var(--c-text)] dark:bg-[var(--c-dark-bg)] dark:hover:bg-[var(--c-dark-bg-hover)] dark:border-[var(--c-dark-border)] dark:text-[var(--c-dark-text)]'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span
                                className={cn(
                                  'font-semibold text-sm block truncate',
                                  isCancelled && 'line-through'
                                )}
                              >
                                {session.course?.name}
                              </span>
                              {session.course?.courseCode && (
                                <span className="text-[11px] opacity-75">
                                  {session.course.courseCode}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {session.type === 'makeup' && (
                                <Badge variant="outline" className="text-[10px] bg-background/80">
                                  Học bù
                                </Badge>
                              )}
                              {session.type === 'moved' && (
                                <Badge variant="outline" className="text-[10px] bg-background/80">
                                  Đổi lịch
                                </Badge>
                              )}
                              <Badge
                                variant={
                                  session.status === 'completed'
                                    ? 'default'
                                    : session.status === 'cancelled'
                                      ? 'destructive'
                                      : 'secondary'
                                }
                                className={cn(
                                  'text-[11px]',
                                  session.status === 'completed' &&
                                    'bg-emerald-600 hover:bg-emerald-600 text-white'
                                )}
                              >
                                {SESSION_STATUS_LABELS[session.status] || session.status}
                              </Badge>
                            </div>
                          </div>

                          <div
                            className={cn(
                              'flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium',
                              !isCancelled && 'text-[var(--c-sub)] dark:text-[var(--c-dark-sub)]'
                            )}
                          >
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Clock className="w-3 h-3" />
                              {normalizeTime(session.startTime)} –{' '}
                              {normalizeTime(session.endTime)}
                            </span>
                            {(session.room || session.location) && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {[
                                  session.room ? `Phòng ${session.room}` : null,
                                  session.location,
                                ]
                                  .filter(Boolean)
                                  .join(' • ')}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Assignments */}
              {selectedDayItems.dayAssignments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" />
                    Hạn nộp bài tập ({selectedDayItems.dayAssignments.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {selectedDayItems.dayAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/50 dark:bg-amber-950/25 p-3 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={cn(
                              'font-semibold text-sm',
                              assignment.completed && 'line-through text-muted-foreground'
                            )}
                          >
                            {assignment.title}
                          </span>
                          <span
                            className={cn(
                              'text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                              PRIORITY_COLORS[assignment.priority] || PRIORITY_COLORS.medium
                            )}
                          >
                            {PRIORITY_LABELS[assignment.priority] || assignment.priority}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: assignment.course?.color || '#f59e0b',
                              }}
                            />
                            {assignment.course?.name}
                          </span>
                          <span>
                            {assignment.completed ? 'Đã hoàn thành' : 'Chưa hoàn thành'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
