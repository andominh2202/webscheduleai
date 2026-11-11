'use client';

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
  Search,
  Trash2,
} from 'lucide-react';
import {
  cn,
  formatShortDate,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
} from '@/lib/utils';
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
import {
  AssignmentCourseOption,
  AssignmentFormDialog,
  AssignmentItem,
} from '@/components/assignments/assignment-form-dialog';

function getStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDaysDiff(dueStr: string): number {
  const due = getStartOfDay(new Date(dueStr));
  const today = getStartOfDay(new Date());
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function AssignmentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [assignments, setAssignments] = React.useState<AssignmentItem[]>([]);
  const [courses, setCourses] = React.useState<AssignmentCourseOption[]>([]);
  const [courseFilter, setCourseFilter] = React.useState<string>('all');
  const [priorityFilter, setPriorityFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingAssignment, setEditingAssignment] = React.useState<AssignmentItem | null>(null);

  const [deletingAssignment, setDeletingAssignment] = React.useState<AssignmentItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (courseFilter !== 'all') params.set('courseId', courseFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      const queryStr = params.toString() ? `?${params.toString()}` : '';

      const [courseRes, assignRes] = await Promise.all([
        fetch('/api/courses'),
        fetch(`/api/assignments${queryStr}`),
      ]);

      if (courseRes.ok) {
        const cData = await courseRes.json();
        setCourses(Array.isArray(cData) ? cData : []);
      }

      if (assignRes.ok) {
        const aData = await assignRes.json();
        setAssignments(Array.isArray(aData) ? aData : []);
      } else {
        toast.error('Không thể tải danh sách bài tập');
      }
    } catch {
      toast.error('Lỗi kết nối khi tải bài tập');
    } finally {
      setLoading(false);
    }
  }, [courseFilter, priorityFilter]);

  React.useEffect(() => {
    fetchData();
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
    setAssignments((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, completed: nextCompleted } : a))
    );
    try {
      const res = await fetch(`/api/assignments/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: nextCompleted }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        nextCompleted ? 'Đã đánh dấu hoàn thành bài tập' : 'Đã chuyển về chưa hoàn thành'
      );
    } catch {
      setAssignments((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, completed: item.completed } : a))
      );
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

  const { overdueList, upcomingList, completedList } = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = assignments
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

    const overdue: AssignmentItem[] = [];
    const upcoming: AssignmentItem[] = [];
    const completed: AssignmentItem[] = [];

    filtered.forEach((item) => {
      if (item.completed) {
        completed.push(item);
      } else if (getDaysDiff(item.dueDate) < 0) {
        overdue.push(item);
      } else {
        upcoming.push(item);
      }
    });

    return {
      overdueList: overdue,
      upcomingList: upcoming,
      completedList: completed,
    };
  }, [assignments, courseFilter, priorityFilter, searchQuery, courseMap]);

  const totalShown = overdueList.length + upcomingList.length + completedList.length;

  const renderAssignmentRow = (item: AssignmentItem, isOverdue: boolean) => {
    const course = item.course || courseMap.get(item.courseId);
    const daysDiff = getDaysDiff(item.dueDate);

    let dueLabel = formatShortDate(item.dueDate);
    if (!item.completed) {
      if (daysDiff < 0) {
        dueLabel = `${formatShortDate(item.dueDate)} (Quá hạn ${Math.abs(daysDiff)} ngày)`;
      } else if (daysDiff === 0) {
        dueLabel = `${formatShortDate(item.dueDate)} (Hôm nay)`;
      } else if (daysDiff === 1) {
        dueLabel = `${formatShortDate(item.dueDate)} (Ngày mai)`;
      }
    }

    return (
      <div
        key={item.id}
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3.5 bg-card transition-colors hover:bg-accent/30',
          isOverdue && 'border-rose-300 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/10',
          item.completed && 'opacity-75'
        )}
      >
        <div className="flex items-start gap-3 min-w-0">
          <Checkbox
            checked={item.completed}
            onCheckedChange={() => handleToggleComplete(item)}
            className="mt-1"
            aria-label={`Đánh dấu hoàn thành ${item.title}`}
          />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'font-medium text-sm sm:text-base',
                  item.completed && 'line-through text-muted-foreground'
                )}
              >
                {item.title}
              </span>
              <Badge
                variant="secondary"
                className={cn('text-[11px]', PRIORITY_COLORS[item.priority] || '')}
              >
                {PRIORITY_LABELS[item.priority] || item.priority}
              </Badge>
            </div>

            {item.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {item.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {course && (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: course.color || '#3b82f6' }}
                  />
                  {course.name}
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center gap-1',
                  isOverdue && 'text-rose-600 dark:text-rose-400 font-medium',
                  !item.completed && daysDiff === 0 && 'text-amber-600 dark:text-amber-400 font-medium'
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {dueLabel}
              </span>
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
            aria-label="Sửa bài tập"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeletingAssignment(item)}
            aria-label="Xóa bài tập"
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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quản lý bài tập</h1>
          <p className="text-sm text-muted-foreground">
            Theo dõi hạn nộp bài tập, mức độ ưu tiên và tiến độ hoàn thành.
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

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm bài tập theo tiêu đề hoặc môn học..."
            className="pl-9"
          />
        </div>

        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="w-full md:w-[220px]">
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

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full md:w-[180px]">
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

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-20 rounded-lg border bg-card animate-pulse p-4" />
          ))}
        </div>
      ) : totalShown === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium">Chưa có dữ liệu</p>
              <p className="text-sm text-muted-foreground">
                Không có bài tập nào phù hợp. Nhấn &ldquo;Thêm bài tập&rdquo; để tạo mới.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          {overdueList.length > 0 && (
            <Card className="border-rose-200 dark:border-rose-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-5 w-5" />
                  Quá hạn ({overdueList.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {overdueList.map((item) => renderAssignmentRow(item, true))}
              </CardContent>
            </Card>
          )}

          {/* Upcoming */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
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

          {/* Completed */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
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
        </div>
      )}

      {/* Add / Edit Dialog */}
      <AssignmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        assignment={editingAssignment}
        courses={courses}
        onSaved={fetchData}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={Boolean(deletingAssignment)}
        onOpenChange={(open) => !open && setDeletingAssignment(null)}
      >
        <DialogContent className="max-w-md">
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
          <DialogFooter className="gap-2">
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
          Đang tải...
        </div>
      }
    >
      <AssignmentsPageContent />
    </Suspense>
  );
}

