'use client';

import dynamic from 'next/dynamic';
import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  AlertCircle,
  Calendar,
  ImagePlus,
  Clock,
  Edit,
  GraduationCap,
  History,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { cn, EXAM_TYPE_LABELS } from '@/lib/utils';
import { getCached, invalidateCache, setCached } from '@/lib/client-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import type { ExamCourseOption, ExamItem } from '@/components/exams/exam-form-dialog';

const ExamFormDialog = dynamic(
  () =>
    import('@/components/exams/exam-form-dialog').then((m) => m.ExamFormDialog),
  { ssr: false }
);

const ExamImageImportDialog = dynamic(
  () =>
    import('@/components/exams/exam-image-import-dialog').then((m) => m.ExamImageImportDialog),
  { ssr: false }
);

const EXAM_TYPE_BADGES: Record<string, string> = {
  quiz: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  midterm: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  final: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25',
  other: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
};

type ExamTimeTab = 'all' | 'upcoming' | 'past';

function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function getStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDaysDiff(dateStr: string): number {
  const target = getStartOfDay(new Date(dateStr));
  const today = getStartOfDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function ExamsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const cachedCourses = getCached<ExamCourseOption[]>('/api/courses');
  const cachedExams = getCached<ExamItem[]>('/api/exams');

  const [exams, setExams] = React.useState<ExamItem[]>(() => cachedExams || []);
  const [courses, setCourses] = React.useState<ExamCourseOption[]>(
    () => cachedCourses || []
  );
  const [timeTab, setTimeTab] = React.useState<ExamTimeTab>('all');
  const [courseFilter, setCourseFilter] = React.useState<string>('all');
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 200);
  const [loading, setLoading] = React.useState(() => !cachedExams);
  const [error, setError] = React.useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [imageImportOpen, setImageImportOpen] = React.useState(false);
  const [editingExam, setEditingExam] = React.useState<ExamItem | null>(null);

  const [deletingExam, setDeletingExam] = React.useState<ExamItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const abortCtrlRef = React.useRef<AbortController | null>(null);

  const fetchData = React.useCallback(async () => {
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setError(null);
    setExams((prev) => {
      if (prev.length === 0) setLoading(true);
      return prev;
    });

    try {
      const [courseRes, examRes] = await Promise.all([
        fetch('/api/courses', { signal: ctrl.signal }),
        fetch('/api/exams', { signal: ctrl.signal }),
      ]);

      if (courseRes.ok) {
        const cData = await courseRes.json();
        const list = Array.isArray(cData) ? cData : [];
        setCourses(list);
        setCached('/api/courses', list);
      }

      if (examRes.ok) {
        const eData = await examRes.json();
        const list = Array.isArray(eData) ? eData : [];
        setExams(list);
        setCached('/api/exams', list);
      } else {
        setError('Không thể tải danh sách lịch thi');
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setError('Lỗi kết nối khi tải lịch thi');
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

  React.useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setEditingExam(null);
      setDialogOpen(true);
      router.replace('/exams');
    }
  }, [searchParams, router]);

  const handleConfirmDelete = async () => {
    if (!deletingExam || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/exams/${deletingExam.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success(`Đã xóa lịch thi "${deletingExam.title}"`);
      invalidateCache('/api/exams');
      invalidateCache('/api/dashboard');
      setDeletingExam(null);
      fetchData();
    } catch {
      toast.error('Xóa lịch thi thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const courseMap = React.useMemo(() => {
    const map = new Map<string, ExamCourseOption>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  const { upcomingExams, pastExams } = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = exams.filter((e) => {
      if (courseFilter !== 'all' && e.courseId !== courseFilter) return false;
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (q) {
        const courseName =
          e.course?.name || courseMap.get(e.courseId)?.name || '';
        return (
          e.title.toLowerCase().includes(q) ||
          courseName.toLowerCase().includes(q) ||
          (e.room && e.room.toLowerCase().includes(q)) ||
          (e.notes && e.notes.toLowerCase().includes(q))
        );
      }
      return true;
    });

    const upcoming: ExamItem[] = [];
    const past: ExamItem[] = [];

    for (const item of filtered) {
      if (getDaysDiff(item.date) >= 0) {
        upcoming.push(item);
      } else {
        past.push(item);
      }
    }

    upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { upcomingExams: upcoming, pastExams: past };
  }, [exams, courseFilter, typeFilter, debouncedSearch, courseMap]);

  const showUpcoming = timeTab === 'all' || timeTab === 'upcoming';
  const showPast = timeTab === 'all' || timeTab === 'past';
  const visibleCount =
    (showUpcoming ? upcomingExams.length : 0) + (showPast ? pastExams.length : 0);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    courseFilter !== 'all' ||
    typeFilter !== 'all' ||
    timeTab !== 'all';

  const renderExamCard = (exam: ExamItem, isUpcoming: boolean) => {
    const course = exam.course || courseMap.get(exam.courseId);
    const courseColor = course?.color || '#3b82f6';
    const examDate = new Date(exam.date);
    const daysDiff = getDaysDiff(exam.date);

    let countdownInfo: { text: string; className: string } | null = null;
    if (isUpcoming) {
      if (daysDiff === 0) {
        countdownInfo = {
          text: 'Thi hôm nay!',
          className:
            'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
        };
      } else if (daysDiff === 1) {
        countdownInfo = {
          text: 'Ngày mai',
          className:
            'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
        };
      } else if (daysDiff <= 7) {
        countdownInfo = {
          text: `Còn ${daysDiff} ngày`,
          className:
            'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
        };
      } else {
        countdownInfo = {
          text: `Còn ${daysDiff} ngày`,
          className: 'bg-muted text-muted-foreground border-border',
        };
      }
    }

    return (
      <div
        key={exam.id}
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-xl border p-3.5 sm:p-4 bg-card transition-all hover:bg-accent/30',
          !isUpcoming && 'opacity-75'
        )}
        style={{
          borderLeftWidth: '4px',
          borderLeftColor: isUpcoming ? courseColor : '#94a3b8',
        }}
      >
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          {/* Date Block */}
          <div className="w-14 h-14 rounded-xl border bg-muted/40 flex flex-col items-center justify-center shrink-0 text-center">
            <span className="text-base font-bold leading-none tabular-nums">
              {format(examDate, 'dd/MM')}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize mt-1">
              {format(examDate, 'EEE', { locale: vi })}
            </span>
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm sm:text-base leading-snug">
                {exam.title}
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium px-2 py-0.5 rounded-full border',
                  EXAM_TYPE_BADGES[exam.type] || EXAM_TYPE_BADGES.other
                )}
              >
                {EXAM_TYPE_LABELS[exam.type] || exam.type}
              </span>
              {countdownInfo && (
                <span
                  suppressHydrationWarning
                  className={cn(
                    'text-[11px] font-medium px-2 py-0.5 rounded-md border',
                    countdownInfo.className
                  )}
                >
                  {countdownInfo.text}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {course && (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: courseColor }}
                  />
                  {course.name}
                </span>
              )}
              {exam.startTime && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="h-3.5 w-3.5" />
                  {exam.startTime}
                  {exam.endTime ? ` – ${exam.endTime}` : ''}
                </span>
              )}
              {(exam.room || exam.location) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {[exam.room ? `P.${exam.room}` : null, exam.location]
                    .filter(Boolean)
                    .join(' • ')}
                </span>
              )}
            </div>

            {exam.notes && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {exam.notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setEditingExam(exam);
              setDialogOpen(true);
            }}
            aria-label={`Sửa lịch thi ${exam.title}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeletingExam(exam)}
            aria-label={`Xóa lịch thi ${exam.title}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">Quản lý lịch thi</h1>
            {!loading && exams.length > 0 && (
              <Badge variant="secondary" className="text-xs font-medium tabular-nums">
                {upcomingExams.length} sắp tới • {pastExams.length} đã qua
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Theo dõi ngày thi, ca thi, phòng thi và các quy định phòng thi quan trọng.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => setImageImportOpen(true)}
            className="gap-2"
          >
            <ImagePlus className="h-4 w-4" />
            Nhập từ ảnh
          </Button>
          <Button
            onClick={() => {
              setEditingExam(null);
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Thêm lịch thi
          </Button>
        </div>
      </div>

      {/* Course missing banner */}
      {!loading && courses.length === 0 && (
        <Card className="border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800">
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Bạn chưa có môn học nào. Hãy thêm môn học trước khi tạo lịch thi.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/courses">Đi tới Môn học</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên kỳ thi, môn học, phòng thi..."
              aria-label="Tìm kiếm lịch thi"
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
            <SelectTrigger className="w-full md:w-[220px]" aria-label="Lọc theo môn học">
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

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-[180px]" aria-label="Lọc theo loại kỳ thi">
              <SelectValue placeholder="Tất cả loại thi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại thi</SelectItem>
              {Object.entries(EXAM_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              {
                id: 'all',
                label: `Tất cả (${upcomingExams.length + pastExams.length})`,
              },
              { id: 'upcoming', label: `Sắp tới (${upcomingExams.length})` },
              { id: 'past', label: `Đã qua (${pastExams.length})` },
            ] as const
          ).map((chip) => {
            const active = timeTab === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTimeTab(chip.id)}
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
                setTypeFilter('all');
                setTimeTab('all');
              }}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {error && exams.length === 0 ? (
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
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="h-24 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : visibleCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium">
                {hasActiveFilters
                  ? 'Không tìm thấy lịch thi phù hợp'
                  : 'Chưa có lịch thi nào'}
              </p>
              <p className="text-sm text-muted-foreground max-w-sm">
                {hasActiveFilters
                  ? 'Thử xóa bộ lọc để xem toàn bộ lịch thi của bạn.'
                  : 'Nhấn "Thêm lịch thi" để theo dõi ngày thi, ca thi và phòng thi.'}
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
                  setTypeFilter('all');
                  setTimeTab('all');
                }}
              >
                Xóa bộ lọc
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Upcoming Exams */}
          {showUpcoming && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary shrink-0" />
                  Lịch thi sắp tới ({upcomingExams.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {upcomingExams.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Không có lịch thi sắp tới.
                  </p>
                ) : (
                  upcomingExams.map((exam) => renderExamCard(exam, true))
                )}
              </CardContent>
            </Card>
          )}

          {/* Past Exams */}
          {showPast && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                  <History className="h-5 w-5 shrink-0" />
                  Lịch thi đã qua ({pastExams.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {pastExams.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Chưa có lịch thi nào đã qua.
                  </p>
                ) : (
                  pastExams.map((exam) => renderExamCard(exam, false))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <ExamImageImportDialog
        open={imageImportOpen}
        onOpenChange={setImageImportOpen}
        courses={courses}
        onSaved={() => {
          invalidateCache('/api/exams');
          invalidateCache('/api/dashboard');
          fetchData();
        }}
      />

      {/* Add / Edit Dialog */}
      <ExamFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        exam={editingExam}
        courses={courses}
        onSaved={() => {
          invalidateCache('/api/exams');
          invalidateCache('/api/dashboard');
          fetchData();
        }}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={Boolean(deletingExam)}
        onOpenChange={(open) => !open && setDeletingExam(null)}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa lịch thi</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa lịch thi{' '}
              <span className="font-semibold text-foreground">
                {deletingExam?.title}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingExam(null)}
              disabled={deleting}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Đang xóa...' : 'Xóa lịch thi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ExamsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-muted-foreground">
          Đang tải danh sách lịch thi...
        </div>
      }
    >
      <ExamsPageContent />
    </Suspense>
  );
}
