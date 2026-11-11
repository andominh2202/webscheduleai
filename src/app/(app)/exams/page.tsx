'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Calendar,
  Clock,
  Edit,
  FileText,
  History,
  MapPin,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { cn, EXAM_TYPE_LABELS, formatShortDate } from '@/lib/utils';
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
import {
  ExamCourseOption,
  ExamFormDialog,
  ExamItem,
} from '@/components/exams/exam-form-dialog';

const EXAM_TYPE_COLORS: Record<string, string> = {
  quiz: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  midterm: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  final: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  other: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function getStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDaysDiff(dateStr: string): number {
  const target = getStartOfDay(new Date(dateStr));
  const today = getStartOfDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ExamsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [exams, setExams] = React.useState<ExamItem[]>([]);
  const [courses, setCourses] = React.useState<ExamCourseOption[]>([]);
  const [courseFilter, setCourseFilter] = React.useState<string>('all');
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingExam, setEditingExam] = React.useState<ExamItem | null>(null);

  const [deletingExam, setDeletingExam] = React.useState<ExamItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (courseFilter !== 'all') params.set('courseId', courseFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const queryStr = params.toString() ? `?${params.toString()}` : '';

      const [courseRes, examRes] = await Promise.all([
        fetch('/api/courses'),
        fetch(`/api/exams${queryStr}`),
      ]);

      if (courseRes.ok) {
        const cData = await courseRes.json();
        setCourses(Array.isArray(cData) ? cData : []);
      }

      if (examRes.ok) {
        const eData = await examRes.json();
        setExams(Array.isArray(eData) ? eData : []);
      } else {
        toast.error('Không thể tải danh sách lịch thi');
      }
    } catch {
      toast.error('Lỗi kết nối khi tải lịch thi');
    } finally {
      setLoading(false);
    }
  }, [courseFilter, typeFilter]);

  React.useEffect(() => {
    fetchData();
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
    const q = searchQuery.trim().toLowerCase();
    const filtered = exams.filter((e) => {
      if (courseFilter !== 'all' && e.courseId !== courseFilter) return false;
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (q) {
        const courseName = e.course?.name || courseMap.get(e.courseId)?.name || '';
        return (
          e.title.toLowerCase().includes(q) ||
          courseName.toLowerCase().includes(q) ||
          (e.room && e.room.toLowerCase().includes(q))
        );
      }
      return true;
    });

    const upcoming: ExamItem[] = [];
    const past: ExamItem[] = [];

    filtered.forEach((item) => {
      if (getDaysDiff(item.date) >= 0) {
        upcoming.push(item);
      } else {
        past.push(item);
      }
    });

    upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { upcomingExams: upcoming, pastExams: past };
  }, [exams, courseFilter, typeFilter, searchQuery, courseMap]);

  const renderExamTable = (items: ExamItem[], isUpcoming: boolean) => {
    if (items.length === 0) {
      return (
        <p className="text-sm text-muted-foreground py-2">
          {isUpcoming ? 'Không có lịch thi sắp tới.' : 'Chưa có lịch thi nào đã qua.'}
        </p>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium text-muted-foreground">
              <th className="pb-2.5 pr-4">Kỳ thi</th>
              <th className="pb-2.5 pr-4">Loại</th>
              <th className="pb-2.5 pr-4">Môn học</th>
              <th className="pb-2.5 pr-4">Ngày thi</th>
              <th className="pb-2.5 pr-4">Giờ thi</th>
              <th className="pb-2.5 pr-4">Phòng thi</th>
              <th className="pb-2.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((exam) => {
              const course = exam.course || courseMap.get(exam.courseId);
              const daysDiff = getDaysDiff(exam.date);
              const countdownText =
                isUpcoming && daysDiff === 0
                  ? 'Hôm nay'
                  : isUpcoming && daysDiff === 1
                  ? 'Ngày mai'
                  : isUpcoming && daysDiff > 1
                  ? `Còn ${daysDiff} ngày`
                  : null;

              return (
                <tr
                  key={exam.id}
                  className={cn(
                    'hover:bg-muted/40 transition-colors',
                    !isUpcoming && 'opacity-75'
                  )}
                >
                  <td className="py-3 pr-4">
                    <div className="font-medium">{exam.title}</div>
                    {exam.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-1 max-w-[260px]">
                        {exam.notes}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Badge
                      variant="secondary"
                      className={cn('text-xs', EXAM_TYPE_COLORS[exam.type] || '')}
                    >
                      {EXAM_TYPE_LABELS[exam.type] || exam.type}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {course ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: course.color || '#3b82f6' }}
                        />
                        <span>{course.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{formatShortDate(exam.date)}</span>
                    </div>
                    {countdownText && (
                      <span
                        className={cn(
                          'text-[11px] font-medium',
                          daysDiff === 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-primary'
                        )}
                      >
                        {countdownText}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {exam.startTime ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {exam.startTime}
                        {exam.endTime ? ` - ${exam.endTime}` : ''}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {exam.room || exam.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {[exam.room, exam.location].filter(Boolean).join(' • ')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingExam(exam);
                          setDialogOpen(true);
                        }}
                        aria-label="Sửa lịch thi"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingExam(exam)}
                        aria-label="Xóa lịch thi"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const totalShown = upcomingExams.length + pastExams.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quản lý lịch thi</h1>
          <p className="text-sm text-muted-foreground">
            Theo dõi ngày thi, phòng thi và thời gian thi các môn học.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingExam(null);
            setDialogOpen(true);
          }}
          className="gap-2 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Thêm lịch thi
        </Button>
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

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên kỳ thi, môn học, phòng thi..."
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

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full md:w-[180px]">
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

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="h-24 rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      ) : totalShown === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium">Chưa có dữ liệu</p>
              <p className="text-sm text-muted-foreground">
                Chưa có lịch thi nào phù hợp. Nhấn &ldquo;Thêm lịch thi&rdquo; để thêm mới.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Upcoming Exams */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Lịch thi sắp tới ({upcomingExams.length})
              </CardTitle>
            </CardHeader>
            <CardContent>{renderExamTable(upcomingExams, true)}</CardContent>
          </Card>

          {/* Past Exams */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                <History className="h-5 w-5" />
                Lịch thi đã qua ({pastExams.length})
              </CardTitle>
            </CardHeader>
            <CardContent>{renderExamTable(pastExams, false)}</CardContent>
          </Card>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <ExamFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        exam={editingExam}
        courses={courses}
        onSaved={fetchData}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={Boolean(deletingExam)}
        onOpenChange={(open) => !open && setDeletingExam(null)}
      >
        <DialogContent className="max-w-md">
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
          <DialogFooter className="gap-2">
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
          Đang tải...
        </div>
      }
    >
      <ExamsPageContent />
    </Suspense>
  );
}

