'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Calendar,
  Clock,
  FileText,
  Search,
  StickyNote,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
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
import { toast } from '@/components/ui/toast';
import {
  SessionDetailData,
  SessionDetailPanel,
} from '@/components/sessions/session-detail-panel';

interface CourseFilterOption {
  id: string;
  name: string;
  courseCode?: string;
  color: string;
}

const stripHtml = (raw?: string | null): string => {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h2|h3|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  upcoming: {
    label: 'Chưa học',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  },
  completed: {
    label: 'Đã học',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  cancelled: {
    label: 'Nghỉ học',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
};

function NotesPageContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [sessions, setSessions] = React.useState<SessionDetailData[]>([]);
  const [courses, setCourses] = React.useState<CourseFilterOption[]>([]);
  const [courseFilter, setCourseFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState(initialSearch);
  const [loading, setLoading] = React.useState(true);
  const [selectedSessionId, setSelectedSessionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const paramSearch = searchParams.get('search');
    if (paramSearch !== null) {
      setSearchQuery(paramSearch);
    }
  }, [searchParams]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (courseFilter !== 'all') params.set('courseId', courseFilter);
      params.set('notesOnly', 'true');
      const qs = `?${params.toString()}`;

      const [courseRes, sessionRes] = await Promise.all([
        fetch('/api/courses'),
        fetch(`/api/sessions${qs}`),
      ]);

      if (courseRes.ok) {
        const cData = await courseRes.json();
        setCourses(Array.isArray(cData) ? cData : []);
      }

      if (sessionRes.ok) {
        const sData = await sessionRes.json();
        setSessions(Array.isArray(sData) ? sData : []);
      } else {
        toast.error('Không thể tải danh sách ghi chú');
      }
    } catch {
      toast.error('Lỗi kết nối khi tải ghi chú');
    } finally {
      setLoading(false);
    }
  }, [courseFilter]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const courseMap = React.useMemo(() => {
    const map = new Map<string, CourseFilterOption>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  const notedSessions = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return sessions
      .filter((s) => Boolean(stripHtml(s.content) || stripHtml(s.personalNote)))
      .filter((s) => {
        if (courseFilter !== 'all' && s.courseId !== courseFilter) return false;
        if (!q) return true;
        const course = s.course || courseMap.get(s.courseId);
        return (
          stripHtml(s.content).toLowerCase().includes(q) ||
          stripHtml(s.personalNote).toLowerCase().includes(q) ||
          (course?.name && course.name.toLowerCase().includes(q)) ||
          (course?.courseCode && course.courseCode.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sessions, courseFilter, searchQuery, courseMap]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ghi chú buổi học</h1>
        <p className="text-sm text-muted-foreground">
          Tổng hợp nội dung bài giảng và ghi chú cá nhân qua các buổi học. Nhấn vào từng thẻ để xem hoặc chỉnh sửa chi tiết.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm trong nội dung, ghi chú, tên môn học..."
            className="pl-9"
          />
        </div>

        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="w-full sm:w-[240px]">
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
                  <span>{c.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Card key={idx} className="animate-pulse">
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
      ) : notedSessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <StickyNote className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium">Chưa có dữ liệu</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? 'Không tìm thấy ghi chú nào khớp với từ khóa tìm kiếm.'
                  : 'Chưa có buổi học nào có ghi chú. Hãy mở một buổi học trong Thời khóa biểu để bắt đầu ghi chép.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notedSessions.map((sessionItem) => {
            const course = sessionItem.course || courseMap.get(sessionItem.courseId);
            const statusInfo =
              STATUS_BADGES[sessionItem.status] || STATUS_BADGES.upcoming;

            return (
              <Card
                key={sessionItem.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedSessionId(sessionItem.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedSessionId(sessionItem.id);
                  }
                }}
                className="cursor-pointer overflow-hidden transition-all hover:shadow-md hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div
                  className="h-1 w-full"
                  style={{ backgroundColor: course?.color || '#3b82f6' }}
                />
                <CardHeader className="pb-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: course?.color || '#3b82f6' }}
                      />
                      <CardTitle className="text-base truncate">
                        {course?.name || 'Buổi học'}
                      </CardTitle>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn('text-[11px] shrink-0', statusInfo.className)}
                    >
                      {statusInfo.label}
                    </Badge>
                  </div>

                  <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs pt-1">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(sessionItem.date)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {sessionItem.startTime} - {sessionItem.endTime}
                    </span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-2.5 text-sm">
                  {stripHtml(sessionItem.content) && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        Nội dung buổi học
                      </div>
                      <p className="text-sm text-foreground/90 line-clamp-3 whitespace-pre-line">
                        {stripHtml(sessionItem.content)}
                      </p>
                    </div>
                  )}

                  {stripHtml(sessionItem.personalNote) && (
                    <div className="space-y-1 rounded-md bg-amber-50/70 dark:bg-amber-950/25 p-2.5 border border-amber-200/70 dark:border-amber-900/50">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <StickyNote className="h-3.5 w-3.5" />
                        Ghi chú cá nhân
                      </div>
                      <p className="text-xs text-foreground/85 line-clamp-2 whitespace-pre-line">
                        {stripHtml(sessionItem.personalNote)}
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
        onUpdated={fetchData}
      />
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-muted-foreground">
          Đang tải...
        </div>
      }
    >
      <NotesPageContent />
    </Suspense>
  );
}

