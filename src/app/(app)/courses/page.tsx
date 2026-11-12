'use client';

import dynamic from 'next/dynamic';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  Edit,
  GraduationCap,
  Plus,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { getDayName, parseGradingBreakdown } from '@/lib/utils';
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
const CourseFormDialog = dynamic(() => import('@/components/courses/course-form-dialog').then((m) => m.CourseFormDialog), { ssr: false });

function CoursesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [courses, setCourses] = React.useState<CourseItem[]>([]);
  const [semesters, setSemesters] = React.useState<SemesterOption[]>([]);
  const [selectedSemesterId, setSelectedSemesterId] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  // Form dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingCourse, setEditingCourse] = React.useState<CourseItem | null>(null);

  // Delete confirmation dialog state
  const [deletingCourse, setDeletingCourse] = React.useState<CourseItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const fetchData = React.useCallback(async (semesterFilter?: string) => {
    setLoading(true);
    try {
      const [semRes, courseRes] = await Promise.all([
        fetch('/api/semesters'),
        fetch(
          semesterFilter && semesterFilter !== 'all'
            ? `/api/courses?semesterId=${encodeURIComponent(semesterFilter)}`
            : '/api/courses'
        ),
      ]);

      if (semRes.ok) {
        const semData: SemesterOption[] = await semRes.json();
        setSemesters(Array.isArray(semData) ? semData : []);
      }

      if (courseRes.ok) {
        const courseData: CourseItem[] = await courseRes.json();
        setCourses(Array.isArray(courseData) ? courseData : []);
      } else {
        toast.error('Không thể tải danh sách môn học');
      }
    } catch {
      toast.error('Lỗi kết nối khi tải môn học');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData(selectedSemesterId);
  }, [fetchData, selectedSemesterId]);

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
      setDeletingCourse(null);
      fetchData(selectedSemesterId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xóa môn học thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const filteredCourses = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.courseCode.toLowerCase().includes(q) ||
        (c.instructor && c.instructor.toLowerCase().includes(q))
    );
  }, [courses, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quản lý môn học</h1>
          <p className="text-sm text-muted-foreground">
            Danh sách các học phần, giảng viên và lịch học hàng tuần của bạn.
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên môn, mã học phần, giảng viên..."
            className="pl-9"
          />
        </div>

        <Select value={selectedSemesterId} onValueChange={setSelectedSemesterId}>
          <SelectTrigger className="w-full sm:w-[240px]">
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

      {/* Course Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-5 w-3/4 bg-muted rounded" />
                <div className="h-4 w-1/3 bg-muted rounded" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-4 w-1/2 bg-muted rounded" />
                <div className="h-4 w-2/3 bg-muted rounded" />
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
              <p className="text-base font-medium">Chưa có dữ liệu</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? 'Không tìm thấy môn học nào phù hợp với từ khóa.'
                  : 'Chưa có môn học nào. Nhấn "Thêm môn học" để bắt đầu.'}
              </p>
            </div>
            {!searchQuery && semesters.length > 0 && (
              <Button onClick={handleOpenCreate} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Thêm môn học đầu tiên
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCourses.map((course) => {
            const scheduleCount =
              course.schedules?.length ?? course._count?.schedules ?? 0;

            return (
              <Card
                key={course.id}
                className="flex flex-col justify-between overflow-hidden transition-shadow hover:shadow-md"
              >
                <div>
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: course.color || '#3b82f6' }}
                  />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="h-3.5 w-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: course.color || '#3b82f6' }}
                        />
                        <CardTitle className="text-lg leading-snug truncate">
                          {course.name}
                        </CardTitle>
                      </div>
                      <Badge variant="secondary" className="shrink-0 font-mono text-xs">
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

                  <CardContent className="space-y-2.5 pb-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Calendar className="h-3 w-3" />
                        {scheduleCount} lịch học/tuần
                      </Badge>
                      {course.credits !== null && course.credits !== undefined && (
                        <Badge variant="outline" className="gap-1 font-normal">
                          <GraduationCap className="h-3 w-3" />
                          {course.credits} tín chỉ
                        </Badge>
                      )}
                    </div>

                    {course.schedules && course.schedules.length > 0 && (
                      <div className="space-y-1 pt-1">
                        {course.schedules.slice(0, 2).map((sched, i) => (
                          <div
                            key={sched.id || i}
                            className="text-xs text-muted-foreground flex items-center justify-between bg-muted/50 rounded px-2 py-1"
                          >
                            <span>
                              {getDayName(sched.dayOfWeek)} • {sched.startTime}-{sched.endTime}
                            </span>
                            {sched.room && <span className="font-medium">{sched.room}</span>}
                          </div>
                        ))}
                        {course.schedules.length > 2 && (
                          <p className="text-[11px] text-muted-foreground pl-1">
                            +{course.schedules.length - 2} lịch học khác
                          </p>
                        )}
                      </div>
                    )}

                    {/* Assessment & Exam Info */}
                    {(course.examFormat || course.hasMajorAssignment || course.gradingBreakdown || course.examNotes) && (
                      <div className="rounded-md border bg-muted/30 p-2.5 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {course.examFormat && (
                            <Badge variant="secondary" className="text-[11px]">
                              Thi: {course.examFormat}
                            </Badge>
                          )}
                          {course.hasMajorAssignment ? (
                            <Badge className="text-[11px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-500/20">
                              Có Bài tập lớn
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[11px] text-muted-foreground">
                              Không có BTL
                            </Badge>
                          )}
                        </div>

                        {course.hasMajorAssignment && course.majorAssignmentNote && (
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">BTL:</span> {course.majorAssignmentNote}
                          </p>
                        )}

                        {course.examNotes && (
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">Hình thức thi:</span> {course.examNotes}
                          </p>
                        )}

                        {(() => {
                          const grades = parseGradingBreakdown(course.gradingBreakdown);
                          if (grades.length === 0) return null;
                          const palette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
                          return (
                            <div className="space-y-1 pt-0.5">
                              <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-muted">
                                {grades.map((g, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      width: `${Math.max(0, Math.min(100, g.weight))}%`,
                                      backgroundColor: palette[i % palette.length],
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
                                      style={{ backgroundColor: palette[i % palette.length] }}
                                    />
                                    {g.label}: <strong className="text-foreground">{g.weight}%</strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {course.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2 pt-1">
                        {course.notes}
                      </p>
                    )}
                  </CardContent>
                </div>

                <CardFooter className="border-t bg-muted/20 px-4 py-2.5 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5"
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
        onSaved={() => fetchData(selectedSemesterId)}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingCourse)}
        onOpenChange={(open) => !open && setDeletingCourse(null)}
      >
        <DialogContent className="max-w-md">
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
          <DialogFooter className="gap-2">
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
          Đang tải...
        </div>
      }
    >
      <CoursesPageContent />
    </Suspense>
  );
}

