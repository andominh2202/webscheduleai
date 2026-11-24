'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { GraduationCap, Loader2, Sparkles } from 'lucide-react';
import { ExamFormData, examSchema } from '@/lib/validations';
import { EXAM_TYPE_LABELS } from '@/lib/utils';
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
import { toast } from '@/components/ui/toast';

export interface ExamCourseOption {
  id: string;
  name: string;
  courseCode?: string;
  color: string;
}

export interface ExamItem {
  id: string;
  title: string;
  type: 'quiz' | 'midterm' | 'final' | 'other' | string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  room?: string | null;
  location?: string | null;
  notes?: string | null;
  courseId: string;
  course?: ExamCourseOption;
}

function formatLocalYmd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateInputValue(dateStr?: string | null, offsetDays = 7): string {
  if (!dateStr) {
    return formatLocalYmd(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return formatLocalYmd(new Date());
  return formatLocalYmd(d);
}

const EXAM_TITLE_PRESETS: Array<{ label: string; type: ExamFormData['type'] }> = [
  { label: 'Thi giữa kỳ', type: 'midterm' },
  { label: 'Thi cuối kỳ', type: 'final' },
  { label: 'Kiểm tra quá trình', type: 'quiz' },
  { label: 'Bảo vệ đồ án', type: 'other' },
];

export interface ExamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam?: ExamItem | null;
  courses: ExamCourseOption[];
  onSaved?: () => void;
}

export function ExamFormDialog({
  open,
  onOpenChange,
  exam,
  courses,
  onSaved,
}: ExamFormDialogProps) {
  const isEdit = Boolean(exam?.id);
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<ExamFormData>({
    resolver: zodResolver(examSchema),
    defaultValues: {
      title: '',
      type: 'midterm',
      date: toDateInputValue(null),
      startTime: '07:30',
      endTime: '09:00',
      room: '',
      location: '',
      notes: '',
      courseId: courses[0]?.id || '',
    },
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = form;

  React.useEffect(() => {
    if (!open) return;
    if (exam) {
      reset({
        title: exam.title,
        type: (['quiz', 'midterm', 'final', 'other'].includes(exam.type)
          ? exam.type
          : 'midterm') as ExamFormData['type'],
        date: toDateInputValue(exam.date),
        startTime: exam.startTime || '',
        endTime: exam.endTime || '',
        room: exam.room || '',
        location: exam.location || '',
        notes: exam.notes || '',
        courseId: exam.courseId,
      });
    } else {
      reset({
        title: '',
        type: 'midterm',
        date: toDateInputValue(null),
        startTime: '07:30',
        endTime: '09:00',
        room: '',
        location: '',
        notes: '',
        courseId: courses[0]?.id || '',
      });
    }
  }, [open, exam, courses, reset]);

  const onSubmit = async (values: ExamFormData) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        title: values.title.trim(),
        startTime: values.startTime?.trim() || undefined,
        endTime: values.endTime?.trim() || undefined,
        room: values.room?.trim() || undefined,
        location: values.location?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
      };

      const res = await fetch(
        isEdit && exam ? `/api/exams/${exam.id}` : '/api/exams',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể lưu lịch thi');
      }

      toast.success(isEdit ? 'Đã cập nhật lịch thi' : 'Đã thêm lịch thi mới');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu lịch thi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[90dvh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary shrink-0" />
            {isEdit ? 'Chỉnh sửa lịch thi' : 'Thêm lịch thi mới'}
          </DialogTitle>
          <DialogDescription>
            Cập nhật ngày thi, phòng thi và các lưu ý quan trọng cho kỳ thi.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1" noValidate>
          <div className="space-y-2">
            <Label htmlFor="exam-title">
              Tên kỳ thi <span className="text-destructive">*</span>
            </Label>
            <Input
              id="exam-title"
              placeholder="VD: Thi giữa kỳ môn Giải tích"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'exam-title-error' : undefined}
              {...register('title')}
            />
            {errors.title && (
              <p id="exam-title-error" role="alert" className="text-xs text-destructive">
                {errors.title.message}
              </p>
            )}
            {!isEdit && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  Điền nhanh:
                </span>
                {EXAM_TITLE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setValue('title', preset.label, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      setValue('type', preset.type, { shouldDirty: true });
                    }}
                    className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="exam-course">
                Môn học <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="courseId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="exam-course"
                      aria-invalid={Boolean(errors.courseId)}
                      aria-describedby={errors.courseId ? 'exam-course-error' : undefined}
                    >
                      <SelectValue placeholder="Chọn môn học" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          Chưa có môn học nào.
                        </div>
                      ) : (
                        courses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: c.color || '#3b82f6' }}
                              />
                              <span className="truncate">{c.name}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.courseId && (
                <p id="exam-course-error" role="alert" className="text-xs text-destructive">
                  {errors.courseId.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-type">Loại kỳ thi</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="exam-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXAM_TYPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label htmlFor="exam-date">
                Ngày thi <span className="text-destructive">*</span>
              </Label>
              <Input
                id="exam-date"
                type="date"
                aria-invalid={Boolean(errors.date)}
                aria-describedby={errors.date ? 'exam-date-error' : undefined}
                {...register('date')}
              />
              {errors.date && (
                <p id="exam-date-error" role="alert" className="text-xs text-destructive">
                  {errors.date.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-startTime">Giờ bắt đầu</Label>
              <Input id="exam-startTime" type="time" {...register('startTime')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-endTime">Giờ kết thúc</Label>
              <Input id="exam-endTime" type="time" {...register('endTime')} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="exam-room">Phòng thi</Label>
              <Input id="exam-room" placeholder="VD: Hội trường A2" {...register('room')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-location">Địa điểm / Cơ sở</Label>
              <Input
                id="exam-location"
                placeholder="VD: Cơ sở 1"
                {...register('location')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exam-notes">Ghi chú & Quy định phòng thi</Label>
            <Textarea
              id="exam-notes"
              placeholder="Hình thức thi (tự luận/trắc nghiệm), tài liệu được mang vào, số báo danh..."
              className="min-h-[76px] resize-y"
              {...register('notes')}
            />
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={submitting || courses.length === 0}
              className="w-full sm:w-auto"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Lưu thay đổi' : 'Thêm lịch thi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
