'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
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
  GraduationCap,
  Loader2,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface MonthViewProps {
  sessions: MonthViewSession[];
  assignments: MonthViewAssignment[];
  exams: MonthViewExam[];
  loading?: boolean;
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

export function MonthView({
  sessions,
  assignments,
  exams,
  loading = false,
  onSelectSession,
  onDateRangeChange,
}: MonthViewProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [monthLabel, setMonthLabel] = useState<string>('');
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() =>
    format(new Date(), 'yyyy-MM-dd')
  );
  const lastRangeRef = useRef<string>('');

  const events: EventInput[] = useMemo(() => {
    const sessionEvents: EventInput[] = sessions.map((s) => {
      const dateKey = getLocalDateKey(s.date);
      const color = s.course?.color || '#3b82f6';
      const isCancelled = s.status === 'cancelled';
      return {
        id: `session-${s.id}`,
        title: s.course?.name || 'Buổi học',
        start: `${dateKey}T${normalizeTime(s.startTime)}:00`,
        end: `${dateKey}T${normalizeTime(s.endTime)}:00`,
        backgroundColor: isCancelled ? '#94a3b8' : color,
        borderColor: isCancelled ? '#64748b' : color,
        textColor: '#ffffff',
        extendedProps: {
          kind: 'session',
          sessionId: s.id,
          dateKey,
          timeLabel: normalizeTime(s.startTime),
          courseColor: color,
          status: s.status,
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
        backgroundColor: a.completed ? '#94a3b8' : '#f59e0b',
        borderColor: a.completed ? '#64748b' : '#d97706',
        textColor: '#ffffff',
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
        backgroundColor: '#e11d48',
        borderColor: '#be123c',
        textColor: '#ffffff',
        extendedProps: {
          kind: 'exam',
          examId: e.id,
          dateKey,
          timeLabel: e.startTime ? normalizeTime(e.startTime) : '',
        },
      };
    });

    return [...sessionEvents, ...examEvents, ...assignmentEvents];
  }, [sessions, assignments, exams]);

  const selectedDayItems = useMemo(() => {
    const daySessions = sessions
      .filter((s) => getLocalDateKey(s.date) === selectedDayKey)
      .sort((a, b) =>
        normalizeTime(a.startTime).localeCompare(normalizeTime(b.startTime))
      );

    const dayAssignments = assignments.filter(
      (a) => getLocalDateKey(a.dueDate) === selectedDayKey
    );

    const dayExams = exams.filter(
      (e) => getLocalDateKey(e.date) === selectedDayKey
    );

    return { daySessions, dayAssignments, dayExams };
  }, [sessions, assignments, exams, selectedDayKey]);

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      // arg.view.currentStart is the 1st of the active month
      const titleDate = arg.view.currentStart;
      const formattedMonth = format(titleDate, 'MMMM, yyyy', { locale: vi });
      setMonthLabel(
        formattedMonth.charAt(0).toUpperCase() + formattedMonth.slice(1)
      );

      const rangeKey = `${arg.startStr}_${arg.endStr}`;
      if (lastRangeRef.current !== rangeKey) {
        lastRangeRef.current = rangeKey;
        const endInclusive = new Date(arg.end.getTime() - 86400000);
        onDateRangeChange?.(arg.start, endInclusive);
      }
    },
    [onDateRangeChange]
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

  const renderEventContent = (eventInfo: EventContentArg) => {
    const props = eventInfo.event.extendedProps as {
      kind?: string;
      timeLabel?: string;
      status?: string;
      completed?: boolean;
    };

    const prefix =
      props.kind === 'exam'
        ? 'Thi:'
        : props.kind === 'assignment'
          ? 'BT:'
          : props.timeLabel || '';

    const isMuted = props.status === 'cancelled' || props.completed;

    return (
      <div
        className={cn(
          'flex items-center gap-1 px-1.5 py-0.5 text-[11px] leading-tight truncate text-white',
          isMuted && 'line-through opacity-80'
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white/90 flex-shrink-0" />
        {prefix && <span className="font-semibold flex-shrink-0">{prefix}</span>}
        <span className="truncate">{eventInfo.event.title}</span>
      </div>
    );
  };

  const selectedDateObj = useMemo(
    () => new Date(`${selectedDayKey}T12:00:00`),
    [selectedDayKey]
  );

  const totalSelectedCount =
    selectedDayItems.daySessions.length +
    selectedDayItems.dayAssignments.length +
    selectedDayItems.dayExams.length;

  return (
    <div className="space-y-4">
      {/* Toolbar + Legend */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border bg-card shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => calendarRef.current?.getApi().prev()}
              className="rounded-r-none border-r px-2.5"
              aria-label="Tháng trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                calendarRef.current?.getApi().today();
                setSelectedDayKey(format(new Date(), 'yyyy-MM-dd'));
              }}
              className="rounded-none px-3 font-medium"
            >
              Hôm nay
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => calendarRef.current?.getApi().next()}
              className="rounded-l-none border-l px-2.5"
              aria-label="Tháng sau"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2 ml-1">
            <CalendarIcon className="w-4 h-4 text-primary hidden sm:inline" />
            <span>{monthLabel || 'Lịch tháng'}</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {loading && (
            <span className="inline-flex items-center gap-1.5 mr-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Đang tải...
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            Buổi học (theo màu môn)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            Hạn bài tập
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
            Lịch thi
          </span>
        </div>
      </div>

      {/* Month Calendar */}
      <div className="rounded-xl border bg-card p-2 sm:p-4 shadow-sm">
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
              ? 'ring-2 ring-inset ring-primary/60 bg-primary/5'
              : 'cursor-pointer hover:bg-accent/30'
          }
        />
      </div>

      {/* Selected Day Events List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base sm:text-lg capitalize">
              Sự kiện ngày {formatDate(selectedDateObj)}
            </CardTitle>
            <Badge variant="secondary">{totalSelectedCount} mục</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {totalSelectedCount === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Không có buổi học, bài tập hay lịch thi nào trong ngày này
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
                        className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-3 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-sm">{exam.title}</span>
                          <Badge variant="destructive" className="text-[11px] flex-shrink-0">
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
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {normalizeTime(exam.startTime)}
                              {exam.endTime ? ` - ${normalizeTime(exam.endTime)}` : ''}
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
                      const color = session.course?.color || '#3b82f6';
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => onSelectSession(session.id)}
                          className="text-left rounded-lg border p-3 hover:bg-accent/50 transition-colors space-y-1.5 w-full"
                          style={{
                            borderLeftWidth: '4px',
                            borderLeftColor: color,
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-sm">
                              {session.course?.name}
                            </span>
                            <Badge
                              variant={
                                session.status === 'completed'
                                  ? 'default'
                                  : session.status === 'cancelled'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                              className="text-[11px] flex-shrink-0"
                            >
                              {SESSION_STATUS_LABELS[session.status] || session.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {normalizeTime(session.startTime)} -{' '}
                              {normalizeTime(session.endTime)}
                            </span>
                            {session.room && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                Phòng {session.room}
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
                        className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-1.5"
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
                              'text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
                              PRIORITY_COLORS[assignment.priority] || PRIORITY_COLORS.medium
                            )}
                          >
                            {PRIORITY_LABELS[assignment.priority] || assignment.priority}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
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

