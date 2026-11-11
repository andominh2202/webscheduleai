'use client';

import * as React from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  COURSE_COLORS,
  EXAM_FORMAT_OPTIONS,
  GradingComponent,
  cn,
  getDayName,
  parseGradingBreakdown,
} from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/toast';

export interface SemesterOption {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface ScheduleItem {
  id?: string;
  courseId?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startPeriod?: number | null;
  numPeriods?: number | null;
  room?: string | null;
  location?: string | null;
  startDate: string;
  endDate: string;
  weekType: 'all' | 'even' | 'odd' | string;
}

export interface CourseItem {
  id: string;
  name: string;
  courseCode: string;
  instructor?: string | null;
  color: string;
  notes?: string | null;
  credits?: number | null;
  semesterId: string;
  hasMajorAssignment?: boolean;
  majorAssignmentNote?: string | null;
  examFormat?: string | null;
  examNotes?: string | null;
  gradingBreakdown?: string | null;
  schedules?: ScheduleItem[];
  _count?: {
    schedules?: number;
    sessions?: number;
    assignments?: number;
  };
}

const scheduleEntrySchema = z
  .object({
    id: z.string().optional(),
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    startTime: z.string().min(1, 'Nhập giờ bắt đầu'),
    endTime: z.string().min(1, 'Nhập giờ kết thúc'),
    startPeriod: z.preprocess(
      (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v)),
      z.number().int().min(1, 'Tiết phải >= 1').optional()
    ),
    numPeriods: z.preprocess(
      (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v)),
      z.number().int().min(1, 'Số tiết phải >= 1').optional()
    ),
    room: z.string().optional(),
    location: z.string().optional(),
    startDate: z.string().min(1, 'Chọn ngày bắt đầu'),
    endDate: z.string().min(1, 'Chọn ngày kết thúc'),
    weekType: z.enum(['all', 'even', 'odd']).default('all'),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu',
    path: ['endTime'],
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
    path: ['endDate'],
  });

const courseFormSchema = z.object({
  name: z.string().min(1, 'Tên môn học không được trống'),
  courseCode: z.string().min(1, 'Mã học phần không được trống'),
  instructor: z.string().optional(),
  color: z.string().default('#3b82f6'),
  notes: z.string().optional(),
  credits: z.preprocess(
    (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v)),
    z.number().int().min(0, 'Số tín chỉ không hợp lệ').optional()
  ),
  semesterId: z.string().min(1, 'Vui lòng chọn học kỳ'),
  hasMajorAssignment: z.boolean().default(false),
  majorAssignmentNote: z.string().optional(),
  examFormat: z.string().optional(),
  examNotes: z.string().optional(),
  schedules: z.array(scheduleEntrySchema).default([]),
});

type CourseFormValues = z.infer<typeof courseFormSchema>;

function toDateInputValue(dateStr?: string | null): string {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function timeOverlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  return toMinutes(s1) < toMinutes(e2) && toMinutes(s2) < toMinutes(e1);
}

export interface CourseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: CourseItem | null;
  semesters: SemesterOption[];
  existingCourses?: CourseItem[];
  onSaved?: () => void;
}

export function CourseFormDialog({
  open,
  onOpenChange,
  course,
  semesters,
  existingCourses = [],
  onSaved,
}: CourseFormDialogProps) {
  const isEdit = Boolean(course?.id);
  const [submitting, setSubmitting] = React.useState(false);
  const [loadingSchedules, setLoadingSchedules] = React.useState(false);
  const [conflictWarnings, setConflictWarnings] = React.useState<string[]>([]);
  const initialScheduleIdsRef = React.useRef<string[]>([]);
  const savedCourseIdRef = React.useRef<string | null>(null);
  const [gradingItems, setGradingItems] = React.useState<GradingComponent[]>([
    { label: 'Chuyên cần', weight: 10 },
    { label: 'Giữa kỳ', weight: 30 },
    { label: 'Cuối kỳ', weight: 60 },
  ]);

  const activeSemester = React.useMemo(
    () => semesters.find((s) => s.isActive) || semesters[0],
    [semesters]
  );

  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      name: '',
      courseCode: '',
      instructor: '',
      color: COURSE_COLORS[0],
      notes: '',
      credits: undefined,
      semesterId: activeSemester?.id || '',
      hasMajorAssignment: false,
      majorAssignmentNote: '',
      examFormat: '',
      examNotes: '',
      schedules: [],
    },
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'schedules',
    keyName: 'fieldKey',
  });

  const watchedSemesterId = watch('semesterId');
  const watchedColor = watch('color');
  const watchedSchedules = watch('schedules');
  const watchedHasMajor = watch('hasMajorAssignment');

  const selectedSemester = React.useMemo(
    () => semesters.find((s) => s.id === watchedSemesterId) || activeSemester,
    [semesters, watchedSemesterId, activeSemester]
  );

  // Initialize form when dialog opens
  React.useEffect(() => {
    if (!open) return;
    setConflictWarnings([]);
    savedCourseIdRef.current = course?.id || null;

    if (course) {
      const mappedSchedules = (course.schedules || []).map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        startPeriod: s.startPeriod ?? undefined,
        numPeriods: s.numPeriods ?? undefined,
        room: s.room || '',
        location: s.location || '',
        startDate: toDateInputValue(s.startDate),
        endDate: toDateInputValue(s.endDate),
        weekType: (['all', 'even', 'odd'].includes(s.weekType) ? s.weekType : 'all') as
          | 'all'
          | 'even'
          | 'odd',
      }));

      initialScheduleIdsRef.current = (course.schedules || [])
        .map((s) => s.id)
        .filter((id): id is string => Boolean(id));

      reset({
        name: course.name,
        courseCode: course.courseCode,
        instructor: course.instructor || '',
        color: course.color || COURSE_COLORS[0],
        notes: course.notes || '',
        credits: course.credits ?? undefined,
        semesterId: course.semesterId || activeSemester?.id || '',
        hasMajorAssignment: Boolean(course.hasMajorAssignment),
        majorAssignmentNote: course.majorAssignmentNote || '',
        examFormat: course.examFormat || '',
        examNotes: course.examNotes || '',
        schedules: mappedSchedules,
      });
      const parsedGrades = parseGradingBreakdown(course.gradingBreakdown);
      setGradingItems(
        parsedGrades.length > 0
          ? parsedGrades
          : [
              { label: 'Chuyên cần', weight: 10 },
              { label: 'Giữa kỳ', weight: 30 },
              { label: 'Cuối kỳ', weight: 60 },
            ]
      );

      // Fetch full course detail to ensure schedules are up-to-date
      if (!course.schedules) {
        setLoadingSchedules(true);
        fetch(`/api/courses/${course.id}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((detail: CourseItem | null) => {
            if (detail?.schedules) {
              initialScheduleIdsRef.current = detail.schedules
                .map((s) => s.id)
                .filter((id): id is string => Boolean(id));
              replace(
                detail.schedules.map((s) => ({
                  id: s.id,
                  dayOfWeek: s.dayOfWeek,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  startPeriod: s.startPeriod ?? undefined,
                  numPeriods: s.numPeriods ?? undefined,
                  room: s.room || '',
                  location: s.location || '',
                  startDate: toDateInputValue(s.startDate),
                  endDate: toDateInputValue(s.endDate),
                  weekType: (['all', 'even', 'odd'].includes(s.weekType)
                    ? s.weekType
                    : 'all') as 'all' | 'even' | 'odd',
                }))
              );
            }
          })
          .catch(() => {})
          .finally(() => setLoadingSchedules(false));
      }
    } else {
      initialScheduleIdsRef.current = [];
      reset({
        name: '',
        courseCode: '',
        instructor: '',
        color: COURSE_COLORS[0],
        notes: '',
        credits: undefined,
        semesterId: activeSemester?.id || '',
        hasMajorAssignment: false,
        majorAssignmentNote: '',
        examFormat: '',
        examNotes: '',
        schedules: [],
      });
      setGradingItems([
        { label: 'Chuyên cần', weight: 10 },
        { label: 'Giữa kỳ', weight: 30 },
        { label: 'Cuối kỳ', weight: 60 },
      ]);
    }
  }, [open, course, activeSemester, reset, replace]);

  // Live conflict detection against other courses and between current schedule rows
  const liveConflicts = React.useMemo(() => {
    const warnings: string[] = [];
    const currentSchedules = watchedSchedules || [];

    currentSchedules.forEach((sched, idx) => {
      if (!sched.startTime || !sched.endTime || sched.startTime >= sched.endTime) return;

      // Check internal duplicate/overlap
      for (let j = idx + 1; j < currentSchedules.length; j++) {
        const other = currentSchedules[j];
        if (
          Number(sched.dayOfWeek) === Number(other.dayOfWeek) &&
          timeOverlaps(sched.startTime, sched.endTime, other.startTime, other.endTime)
        ) {
          warnings.push(
            `Buổi #${idx + 1} và Buổi #${j + 1} bị trùng giờ vào ${getDayName(Number(sched.dayOfWeek))}.`
          );
        }
      }

      // Check against existing courses' schedules
      existingCourses.forEach((otherCourse) => {
        if (course && otherCourse.id === course.id) return;
        (otherCourse.schedules || []).forEach((otherSched) => {
          if (
            Number(sched.dayOfWeek) === Number(otherSched.dayOfWeek) &&
            timeOverlaps(sched.startTime, sched.endTime, otherSched.startTime, otherSched.endTime)
          ) {
            warnings.push(
              `Buổi #${idx + 1} (${getDayName(Number(sched.dayOfWeek))}, ${sched.startTime}-${sched.endTime}) trùng lịch với môn "${otherCourse.name}" (${otherSched.startTime}-${otherSched.endTime}).`
            );
          }
        });
      });
    });

    return warnings;
  }, [watchedSchedules, existingCourses, course]);

  const handleAddScheduleRow = () => {
    const defaultStart = selectedSemester?.startDate
      ? toDateInputValue(selectedSemester.startDate)
      : new Date().toISOString().slice(0, 10);
    const defaultEnd = selectedSemester?.endDate
      ? toDateInputValue(selectedSemester.endDate)
      : new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    append({
      dayOfWeek: 1,
      startTime: '07:30',
      endTime: '09:30',
      startPeriod: 1,
      numPeriods: 2,
      room: '',
      location: '',
      startDate: defaultStart,
      endDate: defaultEnd,
      weekType: 'all',
    });
  };

  const onSubmit = async (values: CourseFormValues) => {
    setSubmitting(true);
    setConflictWarnings([]);

    try {
      const validGrades = gradingItems.filter((g) => g.label.trim() && g.weight > 0);
      const coursePayload = {
        name: values.name.trim(),
        courseCode: values.courseCode.trim(),
        instructor: values.instructor?.trim() || undefined,
        color: values.color || '#3b82f6',
        notes: values.notes?.trim() || undefined,
        credits: values.credits,
        semesterId: values.semesterId,
        hasMajorAssignment: Boolean(values.hasMajorAssignment),
        majorAssignmentNote: values.majorAssignmentNote?.trim() || undefined,
        examFormat: values.examFormat?.trim() || undefined,
        examNotes: values.examNotes?.trim() || undefined,
        gradingBreakdown: validGrades.length > 0 ? JSON.stringify(validGrades) : undefined,
      };

      const effectiveCourseId = course?.id || savedCourseIdRef.current;
      const shouldUpdateCourse = Boolean(effectiveCourseId);

      const courseRes = await fetch(
        effectiveCourseId ? `/api/courses/${effectiveCourseId}` : '/api/courses',
        {
          method: shouldUpdateCourse ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(coursePayload),
        }
      );

      const courseData = await courseRes.json();
      if (!courseRes.ok) {
        throw new Error(courseData?.error || 'Không thể lưu thông tin môn học');
      }

      const savedCourseId: string = courseData.id || effectiveCourseId;
      savedCourseIdRef.current = savedCourseId;
      const serverConflicts: string[] = [];

      // Delete removed schedules when editing or re-submitting
      if (shouldUpdateCourse) {
        const currentIds = new Set(
          values.schedules.map((s) => s.id).filter((id): id is string => Boolean(id))
        );
        const removedIds = initialScheduleIdsRef.current.filter((id) => !currentIds.has(id));
        await Promise.all(
          removedIds.map((schedId) =>
            fetch(`/api/schedules/${schedId}`, { method: 'DELETE' })
          )
        );
        initialScheduleIdsRef.current = initialScheduleIdsRef.current.filter((id) =>
          currentIds.has(id)
        );
      }

      // Create or update schedules
      for (let i = 0; i < values.schedules.length; i++) {
        const s = values.schedules[i];
        const schedPayload = {
          courseId: savedCourseId,
          dayOfWeek: Number(s.dayOfWeek),
          startTime: s.startTime,
          endTime: s.endTime,
          startPeriod: s.startPeriod,
          numPeriods: s.numPeriods,
          room: s.room?.trim() || undefined,
          location: s.location?.trim() || undefined,
          startDate: s.startDate,
          endDate: s.endDate,
          weekType: s.weekType,
        };

        const schedRes = await fetch(
          s.id ? `/api/schedules/${s.id}` : '/api/schedules',
          {
            method: s.id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(schedPayload),
          }
        );

        const schedData = await schedRes.json().catch(() => ({}));

        if (Array.isArray(schedData?.conflicts) && schedData.conflicts.length > 0) {
          schedData.conflicts.forEach(
            (c: { course?: { name?: string }; startTime?: string; endTime?: string }) => {
              serverConflicts.push(
                `Lịch #${i + 1} có xung đột với môn "${c.course?.name || 'khác'}" (${c.startTime || ''}-${c.endTime || ''}).`
              );
            }
          );
        }

        if (!schedRes.ok) {
          if (!Array.isArray(schedData?.conflicts) || schedData.conflicts.length === 0) {
            const msg =
              schedData?.error ||
              `Lỗi khi lưu lịch học #${i + 1} (${getDayName(Number(s.dayOfWeek))})`;
            serverConflicts.push(msg);
          }
          continue;
        }

        const createdId: string | undefined = schedData?.id || schedData?.schedule?.id;
        if (!s.id && createdId) {
          setValue(`schedules.${i}.id`, createdId);
          initialScheduleIdsRef.current.push(createdId);
        }
      }

      if (serverConflicts.length > 0) {
        setConflictWarnings(serverConflicts);
        toast.warning('Đã lưu môn học nhưng có cảnh báo trùng lịch');
        onSaved?.();
        return;
      }

      toast.success(isEdit ? 'Đã cập nhật môn học' : 'Đã thêm môn học mới');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu môn học');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Chỉnh sửa môn học' : 'Thêm môn học mới'}</DialogTitle>
          <DialogDescription>
            Nhập thông tin học phần và thiết lập các buổi học lặp lại hàng tuần.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Basic Course Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="course-name">
                Tên môn học <span className="text-destructive">*</span>
              </Label>
              <Input
                id="course-name"
                placeholder="VD: Cấu trúc dữ liệu & Giải thuật"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="course-code">
                Mã học phần <span className="text-destructive">*</span>
              </Label>
              <Input
                id="course-code"
                placeholder="VD: IT3011"
                {...register('courseCode')}
              />
              {errors.courseCode && (
                <p className="text-xs text-destructive">{errors.courseCode.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="course-semester">
                Học kỳ <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="semesterId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="course-semester">
                      <SelectValue placeholder="Chọn học kỳ" />
                    </SelectTrigger>
                    <SelectContent>
                      {semesters.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          Chưa có học kỳ nào. Hãy tạo trong Cài đặt.
                        </div>
                      ) : (
                        semesters.map((sem) => (
                          <SelectItem key={sem.id} value={sem.id}>
                            {sem.name} {sem.isActive ? '(Đang chọn)' : ''}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.semesterId && (
                <p className="text-xs text-destructive">{errors.semesterId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="course-instructor">Giảng viên</Label>
              <Input
                id="course-instructor"
                placeholder="VD: TS. Nguyễn Văn A"
                {...register('instructor')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="course-credits">Số tín chỉ</Label>
              <Input
                id="course-credits"
                type="number"
                min={0}
                placeholder="VD: 3"
                {...register('credits')}
              />
              {errors.credits && (
                <p className="text-xs text-destructive">{errors.credits.message}</p>
              )}
            </div>

            {/* Color Picker */}
            <div className="space-y-2 sm:col-span-2">
              <Label>Màu nhận diện</Label>
              <div className="flex flex-wrap gap-2">
                {COURSE_COLORS.map((c) => {
                  const selected = watchedColor === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setValue('color', c, { shouldDirty: true })}
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                        selected && 'ring-2 ring-foreground ring-offset-2 scale-110'
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    >
                      {selected && <Check className="h-4 w-4 text-white drop-shadow" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="course-notes">Ghi chú môn học</Label>
              <Textarea
                id="course-notes"
                placeholder="Thông tin chung, email giảng viên, tài liệu giáo trình..."
                className="min-h-[65px]"
                {...register('notes')}
              />
            </div>
          </div>

          <Separator />

          {/* Exam, Major Assignment & Grading Breakdown Section */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold">Thi cử, Bài tập lớn & Cơ cấu chia điểm</h4>
              <p className="text-xs text-muted-foreground">
                Ghi rõ môn này thi như nào, có làm bài tập lớn không và cách tính điểm môn.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="has-major-assignment" className="text-sm font-medium">
                    Có cần làm Bài tập lớn / Đồ án không?
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Bật nếu môn học có bài tập lớn, tiểu luận hoặc project nhóm.
                  </p>
                </div>
                <Controller
                  control={control}
                  name="hasMajorAssignment"
                  render={({ field }) => (
                    <Switch
                      id="has-major-assignment"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>

              {watchedHasMajor && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Chi tiết bài tập lớn / đồ án</Label>
                  <Input
                    placeholder="VD: Làm nhóm 3 người, nộp báo cáo và demo tuần 14"
                    className="h-9 text-xs"
                    {...register('majorAssignmentNote')}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Hình thức thi cuối kỳ</Label>
                <Controller
                  control={control}
                  name="examFormat"
                  render={({ field }) => (
                    <Select
                      value={field.value || ''}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Chọn hình thức thi" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXAM_FORMAT_OPTIONS.map((fmt) => (
                          <SelectItem key={fmt} value={fmt}>
                            {fmt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Thi như thế nào / Quy định thi</Label>
                <Input
                  placeholder="VD: 90 phút, được dùng 1 tờ A4 viết tay, cấm tài liệu"
                  className="h-9 text-xs"
                  {...register('examNotes')}
                />
              </div>
            </div>

            {/* Grading Breakdown */}
            <div className="space-y-2.5 rounded-lg border p-3 bg-muted/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold">Chia điểm ra sao (%)</Label>
                  {(() => {
                    const total = gradingItems.reduce((acc, g) => acc + (Number(g.weight) || 0), 0);
                    return (
                      <Badge
                        variant={total === 100 ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        Tổng: {total}%
                      </Badge>
                    );
                  })()}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() =>
                      setGradingItems([
                        { label: 'Chuyên cần', weight: 10 },
                        { label: 'Bài tập lớn', weight: 20 },
                        { label: 'Giữa kỳ', weight: 20 },
                        { label: 'Cuối kỳ', weight: 50 },
                      ])
                    }
                  >
                    10-20-20-50
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() =>
                      setGradingItems([
                        { label: 'Quá trình', weight: 30 },
                        { label: 'Cuối kỳ', weight: 70 },
                      ])
                    }
                  >
                    30-70
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] gap-1"
                    onClick={() =>
                      setGradingItems((prev) => [...prev, { label: '', weight: 0 }])
                    }
                  >
                    <Plus className="h-3 w-3" />
                    Thêm đầu điểm
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {gradingItems.map((g, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={g.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setGradingItems((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, label: val } : item))
                        );
                      }}
                      placeholder="VD: Chuyên cần, BTL, Giữa kỳ..."
                      className="h-8 text-xs flex-1"
                    />
                    <div className="flex items-center gap-1 w-24">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={g.weight}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                          setGradingItems((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, weight: val } : item))
                          );
                        }}
                        className="h-8 text-xs text-right"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() =>
                        setGradingItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          {/* Schedules Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <CalendarPlus className="h-4 w-4 text-primary" />
                  Lịch học hàng tuần
                </h4>
                <p className="text-xs text-muted-foreground">
                  Hệ thống tự động tạo các buổi học dựa trên lịch lặp lại này.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddScheduleRow}
                className="gap-1.5 shrink-0"
              >
                <Plus className="h-4 w-4" />
                Thêm buổi học
              </Button>
            </div>

            {/* Conflict warnings */}
            {(liveConflicts.length > 0 || conflictWarnings.length > 0) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Cảnh báo trùng lịch học
                </div>
                <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
                  {liveConflicts.map((w, idx) => (
                    <li key={`live-${idx}`}>{w}</li>
                  ))}
                  {conflictWarnings.map((w, idx) => (
                    <li key={`srv-${idx}`}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {loadingSchedules ? (
              <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải lịch học...
              </div>
            ) : fields.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Chưa có lịch học nào. Nhấn &ldquo;Thêm buổi học&rdquo; để thiết lập thời khóa biểu.
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((fieldItem, index) => {
                  const rowErr = errors.schedules?.[index];
                  return (
                    <div
                      key={fieldItem.fieldKey}
                      className="rounded-lg border bg-muted/30 p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Lịch học #{index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                          className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Xóa
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="space-y-1 col-span-2 sm:col-span-1">
                          <Label className="text-xs">Thứ</Label>
                          <Controller
                            control={control}
                            name={`schedules.${index}.dayOfWeek`}
                            render={({ field }) => (
                              <Select
                                value={String(field.value)}
                                onValueChange={(v) => field.onChange(Number(v))}
                              >
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                                    <SelectItem key={d} value={String(d)}>
                                      {getDayName(d)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Giờ bắt đầu</Label>
                          <Input
                            type="time"
                            className="h-9 text-xs"
                            {...register(`schedules.${index}.startTime`)}
                          />
                          {rowErr?.startTime && (
                            <p className="text-[11px] text-destructive">
                              {rowErr.startTime.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Giờ kết thúc</Label>
                          <Input
                            type="time"
                            className="h-9 text-xs"
                            {...register(`schedules.${index}.endTime`)}
                          />
                          {rowErr?.endTime && (
                            <p className="text-[11px] text-destructive">
                              {rowErr.endTime.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1 col-span-2 sm:col-span-1">
                          <Label className="text-xs">Loại tuần</Label>
                          <Controller
                            control={control}
                            name={`schedules.${index}.weekType`}
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Hàng tuần</SelectItem>
                                  <SelectItem value="odd">Tuần lẻ</SelectItem>
                                  <SelectItem value="even">Tuần chẵn</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Phòng học</Label>
                          <Input
                            placeholder="VD: B1-203"
                            className="h-9 text-xs"
                            {...register(`schedules.${index}.room`)}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Cơ sở / Địa điểm</Label>
                          <Input
                            placeholder="VD: Cơ sở 1"
                            className="h-9 text-xs"
                            {...register(`schedules.${index}.location`)}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Tiết bắt đầu</Label>
                          <Input
                            type="number"
                            min={1}
                            placeholder="1"
                            className="h-9 text-xs"
                            {...register(`schedules.${index}.startPeriod`)}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Số tiết</Label>
                          <Input
                            type="number"
                            min={1}
                            placeholder="2"
                            className="h-9 text-xs"
                            {...register(`schedules.${index}.numPeriods`)}
                          />
                        </div>

                        <div className="space-y-1 col-span-1 sm:col-span-2">
                          <Label className="text-xs">Từ ngày</Label>
                          <Input
                            type="date"
                            className="h-9 text-xs"
                            {...register(`schedules.${index}.startDate`)}
                          />
                          {rowErr?.startDate && (
                            <p className="text-[11px] text-destructive">
                              {rowErr.startDate.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1 col-span-1 sm:col-span-2">
                          <Label className="text-xs">Đến ngày</Label>
                          <Input
                            type="date"
                            className="h-9 text-xs"
                            {...register(`schedules.${index}.endDate`)}
                          />
                          {rowErr?.endDate && (
                            <p className="text-[11px] text-destructive">
                              {rowErr.endDate.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || semesters.length === 0}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Lưu thay đổi' : 'Tạo môn học'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
