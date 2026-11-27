'use client';

import * as React from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ExamCourseOption, ExamItem } from '@/components/exams/exam-form-dialog';

export interface ExamCalendarViewProps {
  exams: ExamItem[];
  courseMap: Map<string, ExamCourseOption>;
  onSelectExam: (exam: ExamItem) => void;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function ExamCalendarView({
  exams,
  courseMap,
  onSelectExam,
}: ExamCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => {
    const now = new Date();
    const upcoming = exams
      .filter((e) => new Date(e.date).getTime() >= now.setHours(0, 0, 0, 0))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (upcoming.length > 0) {
      return startOfMonth(new Date(upcoming[0].date));
    }
    return startOfMonth(new Date());
  });

  const calendarDays = React.useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const examsByDay = React.useMemo(() => {
    const map = new Map<string, ExamItem[]>();
    for (const exam of exams) {
      const key = format(new Date(exam.date), 'yyyy-MM-dd');
      const list = map.get(key) || [];
      list.push(exam);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }
    return map;
  }, [exams]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base sm:text-lg capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: vi })}
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(startOfMonth(new Date()))}
          >
            Hôm nay
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Tháng trước"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Tháng sau"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-2 sm:p-4 pt-0">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground py-1.5"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayExams = examsByDay.get(key) || [];
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);

            return (
              <div
                key={key}
                className={cn(
                  'min-h-[84px] sm:min-h-[104px] rounded-lg border p-1.5 flex flex-col gap-1 transition-colors',
                  inMonth ? 'bg-card' : 'bg-muted/30 text-muted-foreground/60',
                  today && 'ring-2 ring-primary/60 border-primary/50'
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums h-5 w-5 flex items-center justify-center rounded-full',
                      today && 'bg-primary text-primary-foreground font-bold'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {dayExams.length > 0 && (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {dayExams.length}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1 overflow-y-auto max-h-[76px]">
                  {dayExams.map((exam) => {
                    const course = exam.course || courseMap.get(exam.courseId);
                    const color = course?.color || '#3b82f6';
                    return (
                      <button
                        key={exam.id}
                        type="button"
                        onClick={() => onSelectExam(exam)}
                        className={cn(
                          'w-full text-left rounded-md px-1.5 py-1 text-[11px] leading-tight transition-colors border',
                          'hover:bg-accent/70 bg-background/80'
                        )}
                        style={{ borderLeftWidth: '3px', borderLeftColor: color }}
                        title={`${course?.name || ''} - ${exam.title}`}
                      >
                        <div className="font-medium truncate">
                          {course?.courseCode || course?.name || exam.title}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                          {exam.startTime && (
                            <span className="inline-flex items-center gap-0.5 shrink-0">
                              <Clock className="h-2.5 w-2.5" />
                              {exam.startTime}
                            </span>
                          )}
                          {exam.room && (
                            <span className="inline-flex items-center gap-0.5 truncate">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              {exam.room}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
