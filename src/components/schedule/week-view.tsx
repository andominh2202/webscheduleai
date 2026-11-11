'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
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
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2,
  MapPin,
  Clock,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, SESSION_STATUS_LABELS } from '@/lib/utils';

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
  };
}

interface WeekViewProps {
  sessions: WeekViewSession[];
  loading?: boolean;
  onSelectSession: (sessionId: string) => void;
  onDateRangeChange?: (startDate: Date, endDate: Date) => void;
  onSessionReschedule?: (
    sessionId: string,
    payload: { date: string; startTime: string; endTime: string }
  ) => Promise<void>;
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

function normalizeTime(timeStr?: string | null): string {
  if (!timeStr) return '07:00';
  const [h = '07', m = '00'] = timeStr.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function buildIsoDateTime(dateStr: string, timeStr: string): string {
  const datePart = format(new Date(dateStr), 'yyyy-MM-dd');
  return `${datePart}T${normalizeTime(timeStr)}:00`;
}

export function WeekView({
  sessions,
  loading = false,
  onSelectSession,
  onDateRangeChange,
  onSessionReschedule,
}: WeekViewProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [rangeLabel, setRangeLabel] = useState<string>('');
  const [axisMode, setAxisMode] = useState<'hour' | 'period'>('hour');
  const lastRangeRef = useRef<string>('');

  const events: EventInput[] = useMemo(() => {
    return sessions.map((session) => {
      const color = session.course?.color || '#3b82f6';
      const isCancelled = session.status === 'cancelled';
      return {
        id: session.id,
        title: session.course?.name || 'Buổi học',
        start: buildIsoDateTime(session.date, session.startTime),
        end: buildIsoDateTime(session.date, session.endTime),
        backgroundColor: isCancelled ? '#94a3b8' : color,
        borderColor: isCancelled ? '#64748b' : color,
        textColor: '#ffffff',
        extendedProps: {
          sessionId: session.id,
          room: session.room || '',
          location: session.location || '',
          courseId: session.courseId,
          courseName: session.course?.name || '',
          courseCode: session.course?.courseCode || '',
          startTime: normalizeTime(session.startTime),
          endTime: normalizeTime(session.endTime),
          status: session.status,
          type: session.type || 'regular',
        },
      };
    });
  }, [sessions]);

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const endDisplay = new Date(arg.end.getTime() - 86400000);
      const startLabel = format(arg.start, 'dd/MM', { locale: vi });
      const endLabel = format(endDisplay, 'dd/MM/yyyy', { locale: vi });
      setRangeLabel(`Tuần ${startLabel} - ${endLabel}`);

      const rangeKey = `${arg.startStr}_${arg.endStr}`;
      if (lastRangeRef.current !== rangeKey) {
        lastRangeRef.current = rangeKey;
        onDateRangeChange?.(arg.start, endDisplay);
      }
    },
    [onDateRangeChange]
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

  const renderEventContent = (eventInfo: EventContentArg) => {
    const props = eventInfo.event.extendedProps as {
      room?: string;
      startTime?: string;
      endTime?: string;
      status?: string;
      type?: string;
      courseName?: string;
    };
    const isCancelled = props.status === 'cancelled';

    return (
      <div
        className={cn(
          'h-full w-full p-1.5 overflow-hidden flex flex-col justify-between text-white leading-tight select-none',
          isCancelled && 'opacity-75 line-through'
        )}
      >
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center justify-between gap-1 text-[11px] font-medium opacity-90 truncate">
            <span>
              {props.startTime} - {props.endTime}
            </span>
            {props.type === 'makeup' && (
              <span className="bg-black/25 px-1 rounded text-[9px] shrink-0">Học bù</span>
            )}
            {props.type === 'moved' && (
              <span className="bg-black/25 px-1 rounded text-[9px] shrink-0">Đổi lịch</span>
            )}
          </div>
          <div className="text-xs font-semibold line-clamp-2">
            {props.courseName || eventInfo.event.title}
          </div>
        </div>
        {(props.room || isCancelled) && (
          <div className="flex items-center justify-between gap-1 mt-1 text-[10px] opacity-95 truncate">
            {props.room ? (
              <span className="inline-flex items-center gap-0.5 truncate">
                <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                {props.room}
              </span>
            ) : (
              <span />
            )}
            {isCancelled && (
              <span className="bg-black/25 px-1 rounded text-[9px] flex-shrink-0">
                {SESSION_STATUS_LABELS.cancelled}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Custom Navigation Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-md border bg-card shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => calendarRef.current?.getApi().prev()}
              className="rounded-r-none border-r px-2.5"
              aria-label="Tuần trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => calendarRef.current?.getApi().today()}
              className="rounded-none px-3 font-medium"
            >
              Hôm nay
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => calendarRef.current?.getApi().next()}
              className="rounded-l-none border-l px-2.5"
              aria-label="Tuần sau"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2 ml-1">
            <CalendarIcon className="w-4 h-4 text-primary hidden sm:inline" />
            <span>{rangeLabel || 'Thời khóa biểu tuần'}</span>
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {loading && (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mr-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Đang tải...</span>
            </div>
          )}

          {/* Axis Mode Toggle */}
          <div className="inline-flex items-center rounded-md border bg-card p-0.5 text-xs print:hidden">
            <button
              type="button"
              onClick={() => setAxisMode('hour')}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-sm font-medium transition-colors',
                axisMode === 'hour'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Clock className="w-3 h-3" />
              Theo giờ
            </button>
            <button
              type="button"
              onClick={() => setAxisMode('period')}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-sm font-medium transition-colors',
                axisMode === 'period'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <GraduationCap className="w-3 h-3" />
              Theo tiết
            </button>
          </div>
        </div>
      </div>

      {/* Drag & drop hint */}
      {onSessionReschedule && (
        <p className="text-xs text-muted-foreground print:hidden">
          Mẹo: Nhấn vào buổi học để viết ghi chú & checklist, hoặc kéo thả khối lịch để điều chỉnh ngày/giờ học.
        </p>
      )}

      {/* FullCalendar Week Grid */}
      <div className="relative rounded-xl border bg-card p-2 sm:p-4 shadow-sm overflow-x-auto">
        <div className="min-w-[640px]">
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale={viLocale}
            firstDay={1}
            headerToolbar={false}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            slotLabelContent={(arg) => {
              if (axisMode === 'period') {
                const h = arg.date.getHours();
                const m = arg.date.getMinutes();
                if (m === 0 && PERIOD_HOURS[h]) {
                  return (
                    <span className="text-[11px] font-medium">
                      {PERIOD_HOURS[h]} ({String(h).padStart(2, '0')}:00)
                    </span>
                  );
                }
                return '';
              }
              return undefined;
            }}
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
            expandRows={true}
            events={events}
            eventContent={renderEventContent}
            eventClick={handleEventClick}
            eventDrop={handleEventDropOrResize}
            eventResize={handleEventDropOrResize}
            datesSet={handleDatesSet}
            eventClassNames="shadow-sm hover:brightness-95 transition-all"
          />
        </div>
      </div>
    </div>
  );
}
