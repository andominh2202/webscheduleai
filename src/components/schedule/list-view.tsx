'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, startOfDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  MapPin,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatShortDate, SESSION_STATUS_LABELS } from '@/lib/utils';

export interface ListViewCourse {
  id: string;
  name: string;
  courseCode?: string | null;
  color: string;
}

export interface ListViewSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  location?: string | null;
  status: string;
  type?: string;
  courseId: string;
  course: ListViewCourse;
}

interface ListViewProps {
  sessions: ListViewSession[];
  courses: ListViewCourse[];
  loading?: boolean;
  onSelectSession: (sessionId: string) => void;
}

const PAGE_SIZE = 12;

function normalizeTime(timeStr?: string | null): string {
  if (!timeStr) return '00:00';
  const [h = '00', m = '00'] = timeStr.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function ListView({
  sessions,
  courses,
  loading = false,
  onSelectSession,
}: ListViewProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [onlyFromToday, setOnlyFromToday] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

  // If user specifically filters for completed sessions, show past sessions too
  const effectiveOnlyFromToday =
    selectedStatus === 'completed' ? false : onlyFromToday;

  const filteredSessions = useMemo(() => {
    const todayStart = startOfDay(new Date());

    return [...sessions]
      .filter((session) => {
        if (selectedCourseId !== 'all' && session.courseId !== selectedCourseId) {
          return false;
        }
        if (selectedStatus !== 'all' && session.status !== selectedStatus) {
          return false;
        }
        if (effectiveOnlyFromToday) {
          const sessionDay = startOfDay(new Date(session.date));
          if (sessionDay < todayStart) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateDiff =
          new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return normalizeTime(a.startTime).localeCompare(
          normalizeTime(b.startTime)
        );
      });
  }, [sessions, selectedCourseId, selectedStatus, effectiveOnlyFromToday]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [selectedCourseId, selectedStatus, effectiveOnlyFromToday]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedSessions = useMemo(() => {
    const startIdx = (page - 1) * PAGE_SIZE;
    return filteredSessions.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredSessions, page]);

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span>Lọc:</span>
            </div>

            {/* Course Filter */}
            <Select
              value={selectedCourseId}
              onValueChange={setSelectedCourseId}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Tất cả môn học" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả môn học</SelectItem>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: course.color || '#3b82f6' }}
                      />
                      <span className="truncate">{course.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full sm:w-[175px]">
                <SelectValue placeholder="Tất cả trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="upcoming">
                  {SESSION_STATUS_LABELS.upcoming}
                </SelectItem>
                <SelectItem value="completed">
                  {SESSION_STATUS_LABELS.completed}
                </SelectItem>
                <SelectItem value="cancelled">
                  {SESSION_STATUS_LABELS.cancelled}
                </SelectItem>
              </SelectContent>
            </Select>

            {selectedStatus !== 'completed' && (
              <Button
                type="button"
                variant={onlyFromToday ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setOnlyFromToday((prev) => !prev)}
                className="text-xs"
              >
                {onlyFromToday ? 'Đang hiện: Từ hôm nay' : 'Đang hiện: Tất cả ngày'}
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground flex-shrink-0">
            Hiển thị <strong className="text-foreground">{filteredSessions.length}</strong> buổi học
          </div>
        </CardContent>
      </Card>

      {/* Sessions List */}
      {loading ? (
        <div className="rounded-xl border bg-card p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Đang tải danh sách buổi học...</span>
        </div>
      ) : paginatedSessions.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Không có buổi học nào phù hợp với bộ lọc
          </p>
          {(selectedCourseId !== 'all' ||
            selectedStatus !== 'all' ||
            onlyFromToday) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCourseId('all');
                setSelectedStatus('all');
                setOnlyFromToday(false);
              }}
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {paginatedSessions.map((session) => {
            const color = session.course?.color || '#3b82f6';
            const dateObj = new Date(session.date);
            const weekdayName = format(dateObj, 'EEEE', { locale: vi });

            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(session.id)}
                className="w-full text-left rounded-xl border bg-card p-4 hover:bg-accent/40 hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 min-w-0">
                  {/* Date & Time */}
                  <div className="flex items-center gap-3 sm:w-52 flex-shrink-0">
                    <div
                      className="w-1.5 h-10 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold capitalize flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span>
                          {weekdayName}, {formatShortDate(session.date)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>
                          {normalizeTime(session.startTime)} -{' '}
                          {normalizeTime(session.endTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Course colored badge + Room */}
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Badge
                      className="text-white border-0 font-medium px-2.5 py-0.5"
                      style={{ backgroundColor: color }}
                    >
                      {session.course?.name}
                    </Badge>
                    {session.course?.courseCode && (
                      <span className="text-xs text-muted-foreground">
                        {session.course.courseCode}
                      </span>
                    )}
                    {(session.room || session.location) && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        {[
                          session.room ? `Phòng ${session.room}` : null,
                          session.location,
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center justify-end flex-shrink-0">
                  <Badge
                    variant={
                      session.status === 'completed'
                        ? 'default'
                        : session.status === 'cancelled'
                          ? 'destructive'
                          : 'secondary'
                    }
                    className={cn(
                      session.status === 'completed' &&
                        'bg-emerald-600 hover:bg-emerald-600 text-white'
                    )}
                  >
                    {SESSION_STATUS_LABELS[session.status] || session.status}
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Trang {page} / {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="gap-1"
            >
              Sau
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

