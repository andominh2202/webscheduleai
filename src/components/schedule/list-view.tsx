'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  FilterX,
  MapPin,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getVnNowHHMM, parseVnDate, toVnDateString } from '@/lib/timezone';
import { getCoursePalette } from './week-view';
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

export interface ListViewProps {
  sessions: ListViewSession[];
  courses: ListViewCourse[];
  loading?: boolean;
  onSelectSession: (sessionId: string) => void;
  selectedCourseId?: string;
  onCourseChange?: (courseId: string) => void;
  selectedStatus?: string;
  onStatusChange?: (status: string) => void;
  hideCourseStatusFilters?: boolean;
}

const PAGE_SIZE = 14;

function normalizeTime(timeStr?: string | null): string {
  if (!timeStr) return '00:00';
  const [h = '00', m = '00'] = timeStr.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function ListViewSkeleton() {
  return (
    <div
      className="space-y-4 animate-pulse"
      aria-busy="true"
      aria-label="Đang tải danh sách buổi học"
    >
      {Array.from({ length: 2 }).map((_, groupIdx) => (
        <div key={groupIdx} className="space-y-2.5">
          <div className="h-4 w-48 rounded bg-muted/80" />
          {Array.from({ length: 3 }).map((__, itemIdx) => (
            <div
              key={itemIdx}
              className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-24 rounded-lg bg-muted/70" />
                <div className="space-y-2">
                  <div className="h-4 w-44 rounded bg-muted/80" />
                  <div className="h-3 w-28 rounded bg-muted/60" />
                </div>
              </div>
              <div className="h-6 w-20 rounded-full bg-muted/70" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListView({
  sessions,
  courses,
  loading = false,
  onSelectSession,
  selectedCourseId: controlledCourseId,
  onCourseChange,
  selectedStatus: controlledStatus,
  onStatusChange,
  hideCourseStatusFilters = false,
}: ListViewProps) {
  const [internalCourseId, setInternalCourseId] = useState<string>('all');
  const [internalStatus, setInternalStatus] = useState<string>('all');
  const [onlyFromToday, setOnlyFromToday] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [nowInfo, setNowInfo] = useState<{ todayKey: string; tomorrowKey: string; hhmm: string }>(() => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);
    return {
      todayKey: toVnDateString(now),
      tomorrowKey: toVnDateString(tomorrow),
      hhmm: getVnNowHHMM(now),
    };
  });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 86400000);
      setNowInfo({
        todayKey: toVnDateString(now),
        tomorrowKey: toVnDateString(tomorrow),
        hhmm: getVnNowHHMM(now),
      });
    };
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedCourseId = controlledCourseId ?? internalCourseId;
  const selectedStatus = controlledStatus ?? internalStatus;

  const handleCourseChange = useCallback(
    (next: string) => {
      if (onCourseChange) onCourseChange(next);
      else setInternalCourseId(next);
    },
    [onCourseChange]
  );

  const handleStatusChange = useCallback(
    (next: string) => {
      if (onStatusChange) onStatusChange(next);
      else setInternalStatus(next);
    },
    [onStatusChange]
  );

  // If user specifically filters for completed sessions, show past sessions too
  const effectiveOnlyFromToday =
    selectedStatus === 'completed' ? false : onlyFromToday;

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredSessions = useMemo(() => {
    const todayKey = nowInfo.todayKey;

    return sessions
      .filter((session) => {
        if (selectedCourseId !== 'all' && session.courseId !== selectedCourseId) {
          return false;
        }
        if (selectedStatus !== 'all') {
          if (selectedStatus === 'makeup') {
            if (session.type !== 'makeup' && session.type !== 'moved') return false;
          } else if (session.status !== selectedStatus) {
            return false;
          }
        }
        if (effectiveOnlyFromToday) {
          const sessionKey = toVnDateString(session.date);
          if (sessionKey < todayKey) return false;
        }
        if (normalizedQuery) {
          const name = (session.course?.name || '').toLowerCase();
          const code = (session.course?.courseCode || '').toLowerCase();
          const room = (session.room || '').toLowerCase();
          const location = (session.location || '').toLowerCase();
          if (
            !name.includes(normalizedQuery) &&
            !code.includes(normalizedQuery) &&
            !room.includes(normalizedQuery) &&
            !location.includes(normalizedQuery)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const keyA = toVnDateString(a.date);
        const keyB = toVnDateString(b.date);
        if (keyA !== keyB) return keyA.localeCompare(keyB);
        return normalizeTime(a.startTime).localeCompare(normalizeTime(b.startTime));
      });
  }, [
    sessions,
    selectedCourseId,
    selectedStatus,
    effectiveOnlyFromToday,
    normalizedQuery,
    nowInfo.todayKey,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [selectedCourseId, selectedStatus, effectiveOnlyFromToday, normalizedQuery]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedSessions = useMemo(() => {
    const startIdx = (page - 1) * PAGE_SIZE;
    return filteredSessions.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredSessions, page]);

  // Group paginated sessions by date for clear visual scanning
  const dateGroups = useMemo(() => {
    const groups: Array<{
      dateKey: string;
      weekdayLabel: string;
      shortDateLabel: string;
      isToday: boolean;
      isTomorrow: boolean;
      items: ListViewSession[];
    }> = [];

    for (const session of paginatedSessions) {
      const dateKey = toVnDateString(session.date);
      let lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.dateKey !== dateKey) {
        const dateObj = parseVnDate(dateKey);
        const weekdayLabel = format(dateObj, 'EEEE', { locale: vi });
        lastGroup = {
          dateKey,
          weekdayLabel:
            weekdayLabel.charAt(0).toUpperCase() + weekdayLabel.slice(1),
          shortDateLabel: formatShortDate(dateObj),
          isToday: dateKey === nowInfo.todayKey,
          isTomorrow: dateKey === nowInfo.tomorrowKey,
          items: [],
        };
        groups.push(lastGroup);
      }
      lastGroup.items.push(session);
    }

    return groups;
  }, [paginatedSessions, nowInfo.todayKey, nowInfo.tomorrowKey]);

  const hasAnyFilter =
    selectedCourseId !== 'all' ||
    selectedStatus !== 'all' ||
    onlyFromToday ||
    Boolean(normalizedQuery);

  const handleResetFilters = useCallback(() => {
    handleCourseChange('all');
    handleStatusChange('all');
    setOnlyFromToday(false);
    setSearchQuery('');
  }, [handleCourseChange, handleStatusChange]);

  return (
    <div className="space-y-4">
      {/* Search & Date Scope Bar */}
      <Card className="shadow-sm">
        <CardContent className="p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search input */}
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm môn, mã học phần, phòng..."
                aria-label="Tìm kiếm buổi học"
                className="h-9 pl-8 pr-8 text-xs sm:text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {!hideCourseStatusFilters && (
              <>
                <div className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Filter className="w-3.5 h-3.5" />
                  <span>Lọc:</span>
                </div>

                <Select
                  value={selectedCourseId}
                  onValueChange={handleCourseChange}
                >
                  <SelectTrigger className="h-9 w-full sm:w-[210px] text-xs sm:text-sm">
                    <SelectValue placeholder="Tất cả môn học" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả môn học</SelectItem>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: course.color || '#3b82f6' }}
                          />
                          <span className="truncate">{course.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedStatus} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-9 w-full sm:w-[165px] text-xs sm:text-sm">
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
                    <SelectItem value="makeup">Học bù / Đổi lịch</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}

            {selectedStatus !== 'completed' && (
              <div
                role="group"
                aria-label="Phạm vi thời gian"
                className="inline-flex items-center rounded-lg border bg-background p-0.5 text-xs"
              >
                <button
                  type="button"
                  aria-pressed={onlyFromToday}
                  onClick={() => setOnlyFromToday(true)}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-medium transition-colors',
                    onlyFromToday
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Từ hôm nay
                </button>
                <button
                  type="button"
                  aria-pressed={!onlyFromToday}
                  onClick={() => setOnlyFromToday(false)}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-medium transition-colors',
                    !onlyFromToday
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Toàn học kỳ
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-muted-foreground shrink-0">
            <span>
              Hiển thị{' '}
              <strong className="text-foreground font-semibold">
                {filteredSessions.length}
              </strong>{' '}
              buổi học
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Grouped Sessions List */}
      {loading && sessions.length === 0 ? (
        <ListViewSkeleton />
      ) : dateGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center space-y-3">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Không tìm thấy buổi học phù hợp
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {onlyFromToday
                ? 'Không còn buổi học sắp tới nào khớp điều kiện lọc. Bạn có thể xem toàn bộ học kỳ hoặc xóa bộ lọc.'
                : 'Chưa có buổi học nào khớp với từ khóa hoặc bộ lọc đang chọn.'}
            </p>
          </div>
          {hasAnyFilter && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="gap-1.5"
            >
              <FilterX className="h-3.5 w-3.5" />
              Hiển thị tất cả buổi học
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {dateGroups.map((group) => (
            <section key={group.dateKey} className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>
                      {group.weekdayLabel}, {group.shortDateLabel}
                    </span>
                  </h3>
                  {group.isToday && (
                    <Badge className="bg-primary text-primary-foreground text-[10px] px-2 py-0">
                      Hôm nay
                    </Badge>
                  )}
                  {group.isTomorrow && (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0">
                      Ngày mai
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {group.items.length} buổi
                </span>
              </div>

              <div className="space-y-2">
                {group.items.map((session) => {
                  const palette = getCoursePalette(session.course?.color);
                  const isCancelled = session.status === 'cancelled';
                  const startNorm = normalizeTime(session.startTime);
                  const endNorm = normalizeTime(session.endTime);
                  const isOngoing =
                    group.isToday &&
                    !isCancelled &&
                    nowInfo.hhmm >= startNorm &&
                    nowInfo.hhmm <= endNorm;

                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSelectSession(session.id)}
                      style={isCancelled ? undefined : palette.cssVars}
                      className={cn(
                        'group w-full text-left rounded-xl border border-l-4 bg-card p-3.5 sm:p-4 hover:bg-accent/35 hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isCancelled
                          ? 'border-l-rose-500 opacity-80'
                          : 'border-l-[var(--c-accent)]',
                        isOngoing && 'ring-2 ring-rose-500/60 bg-rose-50/20 dark:bg-rose-950/15'
                      )}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 min-w-0">
                        {/* Time Block */}
                        <div
                          className={cn(
                            'inline-flex sm:flex sm:flex-col items-center sm:items-start justify-center rounded-lg px-2.5 py-1.5 sm:w-32 shrink-0 tabular-nums border',
                            isCancelled
                              ? 'bg-muted/60 border-border text-muted-foreground'
                              : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-text)] dark:bg-[var(--c-dark-bg)] dark:border-[var(--c-dark-border)] dark:text-[var(--c-dark-text)]'
                          )}
                        >
                          <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold">
                            <Clock className="w-3.5 h-3.5 shrink-0 opacity-80" />
                            {startNorm}
                          </span>
                          <span className="ml-1.5 sm:ml-0 text-[11px] opacity-80">
                            đến {endNorm}
                          </span>
                        </div>

                        {/* Course Name, Code & Room */}
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'text-sm sm:text-base font-semibold text-foreground truncate',
                                isCancelled && 'line-through text-muted-foreground'
                              )}
                            >
                              {session.course?.name || 'Buổi học'}
                            </span>
                            {session.course?.courseCode && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {session.course.courseCode}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {(session.room || session.location) ? (
                              <span className="inline-flex items-center gap-1 font-medium text-foreground/85">
                                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                                {[
                                  session.room ? `Phòng ${session.room}` : null,
                                  session.location,
                                ]
                                  .filter(Boolean)
                                  .join(' • ')}
                              </span>
                            ) : (
                              <span>Chưa cập nhật phòng học</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Badges */}
                      <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isOngoing && (
                            <Badge className="bg-rose-500 hover:bg-rose-500 text-white gap-1 text-[11px]">
                              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                              Đang học
                            </Badge>
                          )}

                          {session.type === 'makeup' && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300 text-[11px]"
                            >
                              <Sparkles className="h-3 w-3" />
                              Học bù
                            </Badge>
                          )}

                          {session.type === 'moved' && (
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-[11px]"
                            >
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

                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-60 group-hover:translate-x-0.5 group-hover:opacity-100 transition-all hidden sm:block" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Trang <strong className="text-foreground">{page}</strong> / {totalPages}
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
