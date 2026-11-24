'use client';

import dynamic from 'next/dynamic';
import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Edit,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { cn, formatShortDate, PRIORITY_LABELS } from '@/lib/utils';
import { getCached, invalidateCache, setCached } from '@/lib/client-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import type {
  AssignmentCourseOption,
  AssignmentItem,
} from '@/components/assignments/assignment-form-dialog';

const AssignmentFormDialog = dynamic(
  () =>
    import('@/components/assignments/assignment-form-dialog').then(
      (m) => m.AssignmentFormDialog
    ),
  { ssr: false }
);

const PRIORITY_BADGE_STYLES: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20',
  urgent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
};

type AssignmentTab = 'all' | 'pending' | 'overdue' | 'completed';

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

function getDaysDiff(dueStr: string): number {
  const due = getStartOfDay(new Date(dueStr));
  const today = getStartOfDay(new Date());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function AssignmentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const cachedCourses = getCached<AssignmentCourseOption[]>('/api/courses');
  const cachedAssignments = getCached<AssignmentItem[]>('/api/assignments');

  const [assignments, setAssignments] = React.useState<AssignmentItem[]>(
    () => cachedAssignments || []
  );
  const [courses, setCourses] = React.useState<AssignmentCourseOption[]>(
    () => cachedCourses || []
  );
  const [statusTab, setStatusTab] = React.useState<AssignmentTab>('all');
  const [courseFilter, setCourseFilter] = React.useState<string>('all');
  const [priorityFilter, setPriorityFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 200);
  const [loading, setLoading] = React.useState(() => !cachedAssignments);
  const [error, setError] = React.useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingAssignment, setEditingAssignment] =
    React.useState<AssignmentItem | null>(null);

  const [deletingAssignment, setDeletingAssignment] =
    React.useState<AssignmentItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const abortCtrlRef = React.useRef<AbortController | null>(null);

  const fetchData = React.useCallback(async () => {
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setError(null);
    setAssignments((prev) => {
      if (prev.length === 0) setLoading(true);
      return prev;
    });

    try {
      const [courseRes, assignRes] = await Promise.all([
        fetch('/api/courses', { signal: ctrl.signal }),
        fetch('/api/assignments', { signal: ctrl.signal }),
      ]);

      if (courseRes.ok) {
        const cData = await courseRes.json();
        const list = Array.isArray(cData) ? cData : [];
        setCourses(list);
        setCached('/api/courses', list);
      }

      if (assignRes.ok) {
        const aData = await assignRes.json();
        const list = Array.isArray(aData) ? aData : [];
        setAssignments(list);
        setCached('/api/assignments', list);
      } else {
        setError('Không thể tải danh sách bài tập');
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setError('Lỗi kết nối khi tải danh sách bài tập');
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
      setEditingAssignment(null);
      setDialogOpen(true);
      router.replace('/assignments');
    }
  }, [searchParams, router]);

  const handleToggleComplete = async (item: AssignmentItem) => {
    const nextCompleted = !item.completed;
    setAssignments((prev) => {
      const updated = prev.map((a) =>
        a.id === item.id ? { ...a, completed: nextCompleted } : a
      );
      setCached('/api/assignments', updated);
      return updated;
    });
    try {
      const res = await fetch(`/api/assignments/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: nextCompleted }),
      });
      if (!res.ok) throw new Error();
      invalidateCache('/api/dashboard');
      toast.success(
        nextCompleted
          ? 'Đã đánh dấu hoàn thành bài tập'
          : 'Đã chuyển về chưa hoàn thành'
      );
    } catch {
      setAssignments((prev) => {
        const reverted = prev.map((a) =>
          a.id === item.id ? { ...a, completed: item.completed } : a
        );
        setCached('/api/assignments', reverted);
        return reverted;
      });
      toast.error('Không thể cập nhật trạng thái bài tập');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAssignment || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/assignments/${deletingAssignment.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success(`Đã xóa bài tập "${deletingAssignment.title}"`);
      invalidateCache('/api/assignments');
      invalidateCache('/api/dashboard');
      setDeletingAssignment(null);
      fetchData();
    } catch {
      toast.error('Xóa bài tập thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const courseMap = React.useMemo(() => {
    const map = new Map<string, AssignmentCourseOption>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  const baseFiltered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return assignments
      .filter((a) => {
        if (courseFilter !== 'all' && a.courseId !== courseFilter) return false;
        if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false;
        if (q) {
          const courseName =
            a.course?.name || courseMap.get(a.courseId)?.name || '';
          return (
            a.title.toLowerCase().includes(q) ||
            (a.description && a.description.toLowerCase().includes(q)) ||
            courseName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      );
  }, [assignments, courseFilter, priorityFilter, debouncedSearch, courseMap]);

  const { overdueList, upcomingList, completedList } = React.useMemo(() => {
    const overdue: AssignmentItem[] = [];
    const upcoming: AssignmentItem[] = [];
    const completed: AssignmentItem[] = [];

    for (const item of baseFiltered) {
      if (item.completed) {
        completed.push(item);
      } else if (getDaysDiff(item.dueDate) < 0) {
        overdue.push(item);
      } else {
        upcoming.push(item);
      }
    }

    return {
      overdueList: overdue,
      upcomingList: upcoming,
      completedList: completed,
    };
  }, [baseFiltered]);

  const showOverdue = statusTab === 'all' || statusTab === 'pending' || statusTab === 'overdue';
  const showUpcoming = statusTab === 'all' || statusTab === 'pending';
  const showCompleted = statusTab === 'all' || statusTab === 'completed';

  const visibleCount =
    (showOverdue ? overdueList.length : 0) +
    (showUpcoming ? upcomingList.length : 0) +
    (showCompleted ? completedList.length : 0);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    courseFilter !== 'all' ||
    priorityFilter !== 'all' ||
    statusTab !== 'all';

  const renderAssignmentRow = (item: AssignmentItem, isOverdue: boolean) => {
    const course = item.course || courseMap.get(item.courseId);
    const daysDiff = getDaysDiff(item.dueDate);
    const courseColor = course?.color || '#3b82f6';

    let countdownBadge: { text: string; className: string } | null = null;
    if (!item.completed) {
      if (daysDiff < 0) {
        countdownBadge = {
          text: `Quá hạn ${Math.abs(daysDiff)} ngày`,
          className:
            'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
        };
      } else if (daysDiff === 0) {
        countdownBadge = {
          text: 'Hạn hôm nay',
          className:
            'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
        };
      } else if (daysDiff === 1) {
        countdownBadge = {
          text: 'Ngày mai',
          className:
            'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
        };
      } else {
        countdownBadge = {
          text: `Còn ${daysDiff} ngày`,
          className: 'bg-muted text-muted-foreground border-border',
        };
      }
    }

    return (
      <div
        key={item.id}
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 bg-card transition-all hover:bg-accent/30',
          isOverdue &&
            'border-rose-300 dark:border-rose-900/70 bg-rose-50/40 dark:bg-rose-950/15',
          item.completed && 'opacity-75'
        )}
        style={{
          borderLeftWidth: '4px',
          borderLeftColor: item.completed ? '#10b981' : courseColor,
        }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <Checkbox
            checked={item.completed}
            onCheckedChange={() => handleToggleComplete(item)}
            className="mt-1"
            aria-label={`Đánh dấu hoàn thành ${item.title}`}
          />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'font-medium text-sm sm:text-base leading-snug',
                  item.completed && 'line-through text-muted-foreground'
                )}
              >
                {item.title}
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium px-2 py-0.5 rounded-full border',
                  PRIORITY_BADGE_STYLES[item.priority] ||
                    PRIORITY_BADGE_STYLES.medium
                )}
              >
                {PRIORITY_LABELS[item.priority] || item.priority}
              </span>
            </div>

            {item.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {item.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {course && (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: courseColor }}
                  />
                  {course.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1 tabular-nums">
                <CalendarClock className="h-3.5 w-3.5" />
                {formatShortDate(item.dueDate)}
              </span>
              {countdownBadge && (
                <span
                  suppressHydrationWarning
                  className={cn(
                    'px-2 py-0.5 rounded-md border text-[11px] font-medium',
                    countdownBadge.className
                  )}
                >
                  {countdownBadge.text}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setEditingAssignment(item);
              setDialogOpen(true);
            }}
            aria-label={`Sửa bài tập ${item.title}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeletingAssignment(item)}
            aria-label={`Xóa bài tập ${item.title}`}
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
            <h1 className="text-2xl font-bold tracking-tight">Quản lý bài tập</h1>
            {!loading && assignments.length > 0 && (
              <Badge variant="secondary" className="text-xs font-medium tabular-nums">
                {overdueList.length + upcomingList.length} cần làm • {completedList.length} hoàn thành
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Theo dõi hạn nộp bài tập, mức độ ưu tiên và tiến độ hoàn thành từng môn.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingAssignment(null);
            setDialogOpen(true);
          }}
          className="gap-2 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Thêm bài tập
        </Button>
      </div>

      {/* Course missing banner */}
      {!loading && courses.length === 0 && (
        <Card className="border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800">
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Bạn chưa có môn học nào. Hãy thêm môn học trước khi tạo bài tập.
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
              placeholder="Tìm bài tập theo tiêu đề, mô tả hoặc môn học..."
              aria-label="Tìm kiếm bài tập"
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

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full md:w-[180px]" aria-label="Lọc theo mức ưu tiên">
              <SelectValue placeholder="Tất cả ưu tiên" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả ưu tiên</SelectItem>
              {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
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
              { id: 'all', label: `Tất cả (${baseFiltered.length})` },
              {
                id: 'pending',
                label: `Cần làm (${overdueList.length + upcomingList.length})`,
              },
              { id: 'overdue', label: `Quá hạn (${overdueList.length})` },
              { id: 'completed', label: `Đã xong (${completedList.length})` },
            ] as const
          ).map((tab) => {
            const active = statusTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusTab(tab.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {tab.label}
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
                setPriorityFilter('all');
                setStatusTab('all');
              }}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {error && assignments.length === 0 ? (
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
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="h-20 rounded-xl border bg-card animate-pulse p-4"
            />
          ))}
        </div>
      ) : visibleCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium">
                {hasActiveFilters
                  ? 'Không có bài tập khớp với bộ lọc'
                  : 'Chưa có bài tập nào'}
              </p>
              <p className="text-sm text-muted-foreground max-w-sm">
                {hasActiveFilters
                  ? 'Thử xóa bộ lọc để xem toàn bộ danh sách bài tập của bạn.'
                  : 'Nhấn "Thêm bài tập" để tạo nhắc nhở deadline cho học kỳ.'}
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
                  setPriorityFilter('all');
                  setStatusTab('all');
                }}
              >
                Xóa bộ lọc
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          {showOverdue && overdueList.length > 0 && (
            <Card className="border-rose-200 dark:border-rose-900/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  Quá hạn nộp ({overdueList.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {overdueList.map((item) => renderAssignmentRow(item, true))}
              </CardContent>
            </Card>
          )}

          {/* Upcoming */}
          {showUpcoming && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-primary shrink-0" />
                  Sắp tới ({upcomingList.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {upcomingList.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Không có bài tập sắp tới.
                  </p>
                ) : (
                  upcomingList.map((item) => renderAssignmentRow(item, false))
                )}
              </CardContent>
            </Card>
          )}

          {/* Completed */}
          {showCompleted && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  Đã hoàn thành ({completedList.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {completedList.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Chưa có bài tập nào hoàn thành.
                  </p>
                ) : (
                  completedList.map((item) => renderAssignmentRow(item, false))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <AssignmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        assignment={editingAssignment}
        courses={courses}
        onSaved={() => {
          invalidateCache('/api/assignments');
          invalidateCache('/api/dashboard');
          fetchData();
        }}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={Boolean(deletingAssignment)}
        onOpenChange={(open) => !open && setDeletingAssignment(null)}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa bài tập</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa bài tập{' '}
              <span className="font-semibold text-foreground">
                {deletingAssignment?.title}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingAssignment(null)}
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
              {deleting ? 'Đang xóa...' : 'Xóa bài tập'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-muted-foreground">
          Đang tải danh sách bài tập...
        </div>
      }
    >
      <AssignmentsPageContent />
    </Suspense>
  );
}
