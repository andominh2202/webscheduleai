'use client';

import dynamic from 'next/dynamic';
import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  Edit,
  GraduationCap,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { cn, getDayName, parseGradingBreakdown } from '@/lib/utils';
import { getCached, invalidateCache, setCached } from '@/lib/client-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import type { CourseItem, SemesterOption } from '@/components/courses/course-form-dialog';

const CourseFormDialog = dynamic(
  () =>
    import('@/components/courses/course-form-dialog').then(
      (m) => m.CourseFormDialog
    ),
  { ssr: false }
);

const GRADING_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

type QuickCourseFilter = 'all' | 'major' | 'scheduled';

function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function CoursesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const cachedCourses = getCached<CourseItem[]>('/api/courses');
  const cachedSemesters = getCached<SemesterOption[]>('/api/semesters');

  const [courses, setCourses] = React.useState<CourseItem[]>(() => cachedCourses || []);
  const [semesters, setSemesters] = React.useState<SemesterOption[]>(
    () => cachedSemesters || []
  );
  const [selectedSemesterId, setSelectedSemesterId] = React.useState<string>('all');
  const [quickFilter, setQuickFilter] = React.useState<QuickCourseFilter>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 200);
  const [loading, setLoading] = React.useState(() => !cachedCourses);
  const [error, setError] = React.useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingCourse, setEditingCourse] = React.useState<CourseItem | null>(null);

  const [deletingCourse, setDeletingCourse] = React.useState<CourseItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const abortCtrlRef = React.useRef<AbortController | null>(null);

  const fetchData = React.useCallback(async () => {
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setError(null);
    setCourses((prev) => {
      if (prev.length === 0) setLoading(true);
      return prev;
    });

    try {
      const [semRes, courseRes] = await Promise.all([
        fetch('/api/semesters', { signal: ctrl.signal }),
        fetch('/api/courses', { signal: ctrl.signal }),
      ]);

      if (semRes.ok) {
        const semData: SemesterOption[] = await semRes.json();
        const list = Array.isArray(semData) ? semData : [];
        setSemesters(list);
        setCached('/api/semesters', list);
      }

      if (courseRes.ok) {
        const courseData: CourseItem[] = await courseRes.json();
        const list = Array.isArray(courseData) ? courseData : [];
        setCourses(list);
        setCached('/api/courses', list);
      } else {
        setError('Không thể tải danh sách môn học');
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setError('Lỗi kết nối khi tải danh sách môn học');
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
      setEditingCourse(null);
      setDialogOpen(true);
      router.replace('/courses');
    }
  }, [searchParams, router]);

  const handleOpenCreate = () => {
    setEditingCourse(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (course: CourseItem) => {
    setEditingCourse(course);
    setDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCourse || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/courses/${deletingCourse.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Không thể xóa môn học');
      }
      toast.success(`Đã xóa môn "${deletingCourse.name}"`);
      invalidateCache('/api/courses');
      invalidateCache('/api/schedule-overview');
      invalidateCache('/api/dashboard');
      setDeletingCourse(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xóa môn học thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const semesterScopedCourses = React.useMemo(() => {
    if (selectedSemesterId === 'all') return courses;
    return courses.filter((c) => c.semesterId === selectedSemesterId);
  }, [courses, selectedSemesterId]);

  const filteredCourses = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return semesterScopedCourses.filter((c) => {
      if (quickFilter === 'major' && !c.hasMajorAssignment) return false;
      if (quickFilter === 'scheduled') {
        const scCount = c.schedules?.length ?? c._count?.schedules ?? 0;
        if (scCount === 0) return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.courseCode.toLowerCase().includes(q) ||
        (c.instructor && c.instructor.toLowerCase().includes(q))
      );
    });
  }, [semesterScopedCourses, quickFilter, debouncedSearch]);

  const summaryStats = React.useMemo(() => {
    let totalCredits = 0;
    let majorCount = 0;
    for (const c of filteredCourses) {
      totalCredits += Number(c.credits || 0);
      if (c.hasMajorAssignment) majorCount += 1;
    }
    return { totalCredits, majorCount };
  }, [filteredCourses]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    selectedSemesterId !== 'all' ||
    quickFilter !== 'all';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">Quản lý môn học</h1>
            {!loading && courses.length > 0 && (
              <Badge variant="secondary" className="text-xs font-medium tabular-nums">
                {filteredCourses.length} môn • {summaryStats.totalCredits} tín chỉ
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Danh sách học phần, giảng viên, cơ cấu điểm và lịch học hàng tuần của bạn.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Thêm môn học
        </Button>
      </div>

      {/* Warning if no semesters exist */}
      {!loading && semesters.length === 0 && (
        <Card className="border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800">
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Bạn chưa có học kỳ nào. Hãy tạo học kỳ trước khi thêm môn học.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings">Đi tới Cài đặt học kỳ</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên môn, mã học phần, giảng viên..."
              aria-label="Tìm kiếm môn học"
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

          <Select value={selectedSemesterId} onValueChange={setSelectedSemesterId}>
            <SelectTrigger className="w-full sm:w-[240px]" aria-label="Lọc theo học kỳ">
              <SelectValue placeholder="Tất cả học kỳ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả học kỳ</SelectItem>
              {semesters.map((sem) => (
                <SelectItem key={sem.id} value={sem.id}>
                  {sem.name} {sem.isActive ? '(Hiện tại)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'all', label: `Tất cả (${semesterScopedCourses.length})` },
              {
                id: 'major',
                label: `Có Bài tập lớn (${
                  semesterScopedCourses.filter((c) => c.hasMajorAssignment).length
                })`,
              },
              {
                id: 'scheduled',
                label: `Đã xếp lịch (${
                  semesterScopedCourses.filter(
                    (c) => (c.schedules?.length ?? c._count?.schedules ?? 0) > 0
                  ).length
                })`,
              },
            ] as const
          ).map((chip) => {
            const active = quickFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => setQuickFilter(chip.id)}
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
                setSelectedSemesterId('all');
                setQuickFilter('all');
              }}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && courses.length === 0 ? (
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="animate-pulse overflow-hidden">
              <div className="h-1.5 w-full bg-muted" />
              <CardHeader className="space-y-2">
                <div className="h-5 w-3/4 bg-muted rounded" />
                <div className="h-4 w-1/3 bg-muted rounded" />
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="h-4 w-1/2 bg-muted rounded" />
                <div className="h-10 w-full bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium">
                {hasActiveFilters
                  ? 'Không tìm thấy môn học phù hợp'
                  : 'Chưa có môn học nào'}
              </p>
              <p className="text-sm text-muted-foreground max-w-sm">
                {hasActiveFilters
                  ? 'Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc học kỳ để xem thêm kết quả.'
                  : 'Nhấn "Thêm môn học" để thiết lập học phần và tạo lịch học tự động.'}
              </p>
            </div>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedSemesterId('all');
                  setQuickFilter('all');
                }}
              >
                Xóa bộ lọc
              </Button>
            ) : (
              semesters.length > 0 && (
                <Button onClick={handleOpenCreate} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Thêm môn học đầu tiên
                </Button>
              )
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCourses.map((course) => {
            const scheduleCount =
              course.schedules?.length ?? course._count?.schedules ?? 0;
            const accentColor = course.color || '#3b82f6';
            const grades = parseGradingBreakdown(course.gradingBreakdown);

            return (
              <Card
                key={course.id}
                className="group flex flex-col justify-between overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/30"
              >
                <div>
                  {/* Distinct color stripe */}
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: accentColor }}
                  />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className="h-3 w-3 rounded-full shrink-0 mt-1.5 ring-2 ring-background shadow-sm"
                          style={{ backgroundColor: accentColor }}
                        />
                        <div className="min-w-0">
                          <CardTitle className="text-base sm:text-lg leading-snug line-clamp-2">
                            {course.name}
                          </CardTitle>
                          {selectedSemesterId === 'all' && course.semester?.name && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {course.semester.name}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="shrink-0 font-mono text-xs"
                      >
                        {course.courseCode}
                      </Badge>
                    </div>
                    {course.instructor && (
                      <CardDescription className="flex items-center gap-1.5 pt-1">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{course.instructor}</span>
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-3 pb-4 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="gap-1 font-normal text-xs">
                        <Calendar className="h-3 w-3 text-primary" />
                        {scheduleCount} buổi/tuần
                      </Badge>
                      {course.credits !== null && course.credits !== undefined && (
                        <Badge variant="outline" className="gap-1 font-normal text-xs">
                          <GraduationCap className="h-3 w-3 text-primary" />
                          {course.credits} tín chỉ
                        </Badge>
                      )}
                      {course.hasMajorAssignment && (
                        <Badge className="text-[11px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20">
                          Có BTL
                        </Badge>
                      )}
                    </div>

                    {course.schedules && course.schedules.length > 0 && (
                      <div className="space-y-1.5">
                        {course.schedules.slice(0, 2).map((sched, i) => (
                          <div
                            key={sched.id || i}
                            className="text-xs flex items-center justify-between gap-2 bg-muted/45 rounded-lg px-2.5 py-1.5"
                          >
                            <span className="font-medium text-foreground/90 tabular-nums">
                              {getDayName(sched.dayOfWeek)} • {sched.startTime}–
                              {sched.endTime}
                            </span>
                            {sched.room && (
                              <span className="text-muted-foreground font-medium truncate">
                                P.{sched.room}
                              </span>
                            )}
                          </div>
                        ))}
                        {course.schedules.length > 2 && (
                          <p className="text-[11px] text-muted-foreground pl-1">
                            +{course.schedules.length - 2} lịch học khác trong tuần
                          </p>
                        )}
                      </div>
                    )}

                    {(course.examFormat ||
                      course.majorAssignmentNote ||
                      grades.length > 0 ||
                      course.examNotes) && (
                      <div className="rounded-xl border bg-muted/25 p-2.5 space-y-2 text-xs">
                        {course.examFormat && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Hình thức thi:</span>
                            <Badge variant="secondary" className="text-[11px]">
                              {course.examFormat}
                            </Badge>
                          </div>
                        )}

                        {course.hasMajorAssignment && course.majorAssignmentNote && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">
                            <span className="font-medium text-foreground">BTL:</span>{' '}
                            {course.majorAssignmentNote}
                          </p>
                        )}

                        {course.examNotes && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">
                            <span className="font-medium text-foreground">Lưu ý thi:</span>{' '}
                            {course.examNotes}
                          </p>
                        )}

                        {grades.length > 0 && (
                          <div className="space-y-1.5 pt-0.5">
                            <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-muted">
                              {grades.map((g, i) => (
                                <div
                                  key={i}
                                  style={{
                                    width: `${Math.max(0, Math.min(100, g.weight))}%`,
                                    backgroundColor:
                                      GRADING_PALETTE[i % GRADING_PALETTE.length],
                                  }}
                                  title={`${g.label}: ${g.weight}%`}
                                />
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                              {grades.map((g, i) => (
                                <span key={i} className="inline-flex items-center gap-1">
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{
                                      backgroundColor:
                                        GRADING_PALETTE[i % GRADING_PALETTE.length],
                                    }}
                                  />
                                  {g.label}:{' '}
                                  <strong className="text-foreground tabular-nums">
                                    {g.weight}%
                                  </strong>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {course.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {course.notes}
                      </p>
                    )}
                  </CardContent>
                </div>

                <CardFooter className="border-t bg-muted/15 px-4 py-2.5 flex justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5"
                    aria-label={`Chỉnh sửa môn ${course.name}`}
                    onClick={() => handleOpenEdit(course)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Sửa
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    aria-label={`Xóa môn ${course.name}`}
                    onClick={() => setDeletingCourse(course)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <CourseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        course={editingCourse}
        semesters={semesters}
        existingCourses={courses}
        onSaved={() => {
          invalidateCache('/api/courses');
          invalidateCache('/api/schedule-overview');
          invalidateCache('/api/dashboard');
          fetchData();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingCourse)}
        onOpenChange={(open) => !open && setDeletingCourse(null)}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa môn học</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa môn{' '}
              <span className="font-semibold text-foreground">
                {deletingCourse?.name}
              </span>
              ? Tất cả lịch học, buổi học, ghi chú và bài tập liên quan sẽ bị xóa vĩnh viễn.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingCourse(null)}
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
              {deleting ? 'Đang xóa...' : 'Xóa môn học'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CoursesPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-muted-foreground">
          Đang tải danh sách môn học...
        </div>
      }
    >
      <CoursesPageContent />
    </Suspense>
  );
}
