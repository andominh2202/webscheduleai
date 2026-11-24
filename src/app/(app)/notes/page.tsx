'use client';

import dynamic from 'next/dynamic';
import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  Clock,
  FileText,
  RefreshCw,
  Search,
  StickyNote,
  X,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { getCached, invalidateCache, setCached } from '@/lib/client-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SessionDetailData } from '@/components/sessions/session-detail-panel';

const SessionDetailPanel = dynamic(
  () =>
    import('@/components/sessions/session-detail-panel').then(
      (m) => m.SessionDetailPanel
    ),
  { ssr: false }
);

interface CourseFilterOption {
  id: string;
  name: string;
  courseCode?: string;
  color: string;
}

type NoteKindFilter = 'all' | 'lecture' | 'personal';

const BR_RE = /<br\s*\/?>/gi;
const BLOCK_END_RE = /<\/(p|li|h2|h3|blockquote)>/gi;
const HTML_TAG_RE = /<[^>]*>/g;
const MULTI_NEWLINE_RE = /\n{2,}/g;

function stripHtml(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(BR_RE, '\n')
    .replace(BLOCK_END_RE, '\n')
    .replace(HTML_TAG_RE, '')
    .replace(MULTI_NEWLINE_RE, '\n')
    .trim();
}

function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  upcoming: {
    label: 'Chưa học',
    className:
      'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20',
  },
  completed: {
    label: 'Đã học',
    className:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20',
  },
  cancelled: {
    label: 'Nghỉ học',
    className:
      'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20',
  },
};

function NotesPageContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const cachedSessions = getCached<SessionDetailData[]>('/api/sessions?notesOnly=true');
  const cachedCourses = getCached<CourseFilterOption[]>('/api/courses');

  const [sessions, setSessions] = React.useState<SessionDetailData[]>(
    () => cachedSessions || []
  );
  const [courses, setCourses] = React.useState<CourseFilterOption[]>(
    () => cachedCourses || []
  );
  const [courseFilter, setCourseFilter] = React.useState<string>('all');
  const [kindFilter, setKindFilter] = React.useState<NoteKindFilter>('all');
  const [searchQuery, setSearchQuery] = React.useState(initialSearch);
  const debouncedSearch = useDebouncedValue(searchQuery, 200);
  const [loading, setLoading] = React.useState(() => !cachedSessions);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const paramSearch = searchParams.get('search');
    if (paramSearch !== null) {
      setSearchQuery(paramSearch);
    }
  }, [searchParams]);

  const abortCtrlRef = React.useRef<AbortController | null>(null);

  const fetchData = React.useCallback(async () => {
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setError(null);
    setSessions((prev) => {
      if (prev.length === 0) setLoading(true);
      return prev;
    });

    try {
      const [courseRes, sessionRes] = await Promise.all([
        fetch('/api/courses', { signal: ctrl.signal }),
        fetch('/api/sessions?notesOnly=true', { signal: ctrl.signal }),
      ]);

      if (courseRes.ok) {
        const cData = await courseRes.json();
        const list = Array.isArray(cData) ? cData : [];
        setCourses(list);
        setCached('/api/courses', list);
      }

      if (sessionRes.ok) {
        const sData = await sessionRes.json();
        const list = Array.isArray(sData) ? sData : [];
        setSessions(list);
        setCached('/api/sessions?notesOnly=true', list);
      } else {
        setError('Không thể tải danh sách ghi chú');
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setError('Lỗi kết nối khi tải ghi chú');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
    return () => {
      abortCtrlRef.current?.abort();
    };
  }, [fetchData]);

  React.useEffect(() => {
    const handleSemChange = () => fetchData();
    window.addEventListener('semester-changed', handleSemChange);
    return () => window.removeEventListener('semester-changed', handleSemChange);
  }, [fetchData]);

  const courseMap = React.useMemo(() => {
    const map = new Map<string, CourseFilterOption>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  // Pre-compute stripped plain text once per sessions update
  const preparedNotes = React.useMemo(() => {
    return sessions
      .map((sessionItem) => {
        const plainContent = stripHtml(sessionItem.content);
        const plainNote = stripHtml(sessionItem.personalNote);
        const course = sessionItem.course || courseMap.get(sessionItem.courseId);
        const haystack = [
          plainContent,
          plainNote,
          course?.name || '',
          course?.courseCode || '',
        ]
          .join(' ')
          .toLowerCase();

        return {
          sessionItem,
          course,
          plainContent,
          plainNote,
          haystack,
          timestamp: new Date(sessionItem.date).getTime(),
        };
      })
      .filter((entry) => Boolean(entry.plainContent || entry.plainNote))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [sessions, courseMap]);

  const filteredNotes = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return preparedNotes.filter((entry) => {
      if (courseFilter !== 'all' && entry.sessionItem.courseId !== courseFilter) {
        return false;
      }
      if (kindFilter === 'lecture' && !entry.plainContent) return false;
      if (kindFilter === 'personal' && !entry.plainNote) return false;
      if (q && !entry.haystack.includes(q)) return false;
      return true;
    });
  }, [preparedNotes, courseFilter, kindFilter, debouncedSearch]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) || courseFilter !== 'all' || kindFilter !== 'all';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">Ghi chú buổi học</h1>
            {!loading && preparedNotes.length > 0 && (
              <Badge variant="secondary" className="text-xs font-medium tabular-nums">
                {filteredNotes.length} buổi có ghi chú
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Tra cứu nhanh nội dung bài giảng và ghi chú cá nhân. Nhấn vào thẻ để xem hoặc chỉnh sửa.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5 self-start sm:self-auto">
          <Link href="/schedule">
            <Calendar className="h-4 w-4" />
            Mở Thời khóa biểu
          </Link>
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm trong nội dung bài giảng, ghi chú, tên môn..."
              aria-label="Tìm kiếm ghi chú"
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-full sm:w-[240px]" aria-label="Lọc theo môn học">
              <SelectValue placeholder="Tất cả môn học" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả môn học</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: c.color || '#3b82f6' }}
                    />
                    <span className="truncate">{c.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Kind Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'all', label: `Tất cả (${preparedNotes.length})` },
              {
                id: 'lecture',
                label: `Có nội dung bài giảng (${
                  preparedNotes.filter((n) => Boolean(n.plainContent)).length
                })`,
              },
              {
                id: 'personal',
                label: `Có ghi chú cá nhân (${
                  preparedNotes.filter((n) => Boolean(n.plainNote)).length
                })`,
              },
            ] as const
          ).map((chip) => {
            const active = kindFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => setKindFilter(chip.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {chip.label}
              </button>
            );
          })}

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setCourseFilter('all');
                setKindFilter('all');
              }}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      {/* Notes list */}
      {error && sessions.length === 0 ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
              <RefreshCw className="h-4 w-4" />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Card key={idx} className="animate-pulse overflow-hidden">
              <div className="h-1.5 w-full bg-muted" />
              <CardHeader className="space-y-2">
                <div className="h-5 w-1/2 bg-muted rounded" />
                <div className="h-4 w-1/3 bg-muted rounded" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-4 w-full bg-muted rounded" />
                <div className="h-4 w-4/5 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <StickyNote className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium">
                {hasActiveFilters
                  ? 'Không tìm thấy ghi chú phù hợp'
                  : 'Chưa có ghi chú buổi học nào'}
              </p>
              <p className="text-sm text-muted-foreground max-w-md">
                {hasActiveFilters
                  ? 'Thử thay đổi từ khóa tìm kiếm hoặc chọn môn học khác.'
                  : 'Mở bất kỳ buổi học nào trong Thời khóa biểu để bắt đầu ghi lại nội dung bài giảng và lưu ý cá nhân.'}
              </p>
            </div>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setCourseFilter('all');
                  setKindFilter('all');
                }}
              >
                Xóa bộ lọc
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredNotes.map(({ sessionItem, course, plainContent, plainNote }) => {
            const statusInfo =
              STATUS_BADGES[sessionItem.status] || STATUS_BADGES.upcoming;
            const accentColor = course?.color || '#3b82f6';

            return (
              <Card
                key={sessionItem.id}
                role="button"
                tabIndex={0}
                aria-label={`Mở ghi chú môn ${course?.name || 'Buổi học'} ngày ${formatDate(sessionItem.date)}`}
                onClick={() => setSelectedSessionId(sessionItem.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedSessionId(sessionItem.id);
                  }
                }}
                className="cursor-pointer overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div
                  className="h-1.5 w-full"
                  style={{ backgroundColor: accentColor }}
                />
                <CardHeader className="pb-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: accentColor }}
                      />
                      <CardTitle className="text-base truncate">
                        {course?.name || 'Buổi học'}
                      </CardTitle>
                      {course?.courseCode && (
                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                          ({course.courseCode})
                        </span>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn('text-[11px] shrink-0', statusInfo.className)}
                    >
                      {statusInfo.label}
                    </Badge>
                  </div>

                  <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs pt-1">
                    <span className="inline-flex items-center gap-1 capitalize">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(sessionItem.date)}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock className="h-3.5 w-3.5" />
                      {sessionItem.startTime} – {sessionItem.endTime}
                    </span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-2.5 text-sm">
                  {plainContent && (
                    <div className="space-y-1 rounded-xl bg-muted/35 p-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                        Nội dung buổi học
                      </div>
                      <p className="text-xs sm:text-sm text-foreground/90 line-clamp-3 whitespace-pre-line">
                        {plainContent}
                      </p>
                    </div>
                  )}

                  {plainNote && (
                    <div className="space-y-1 rounded-xl bg-amber-500/10 p-2.5 border border-amber-500/20">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                        <StickyNote className="h-3.5 w-3.5 shrink-0" />
                        Ghi chú cá nhân
                      </div>
                      <p className="text-xs text-foreground/85 line-clamp-2 whitespace-pre-line">
                        {plainNote}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Session Detail Slide-Over Panel */}
      <SessionDetailPanel
        sessionId={selectedSessionId}
        open={Boolean(selectedSessionId)}
        onOpenChange={(open) => {
          if (!open) setSelectedSessionId(null);
        }}
        onUpdated={() => {
          invalidateCache('/api/sessions');
          invalidateCache('/api/schedule-overview');
          invalidateCache('/api/dashboard');
          fetchData();
        }}
      />
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-muted-foreground">
          Đang tải ghi chú buổi học...
        </div>
      }
    >
      <NotesPageContent />
    </Suspense>
  );
}
