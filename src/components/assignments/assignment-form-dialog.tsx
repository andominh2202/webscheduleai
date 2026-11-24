'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ClipboardList, Loader2 } from 'lucide-react';
import { AssignmentFormData, assignmentSchema } from '@/lib/validations';
import { cn, PRIORITY_LABELS } from '@/lib/utils';
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

export interface AssignmentCourseOption {
  id: string;
  name: string;
  courseCode?: string;
  color: string;
}

export interface AssignmentItem {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent' | string;
  courseId: string;
  sessionId?: string | null;
  course?: AssignmentCourseOption;
}

const PRIORITY_DOT_COLORS: Record<string, string> = {
  low: 'bg-emerald-500',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  urgent: 'bg-rose-500',
};

function formatLocalYmd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateInputValue(dateStr?: string | null, offsetDays = 1): string {
  if (!dateStr) {
    return formatLocalYmd(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return formatLocalYmd(new Date());
  return formatLocalYmd(d);
}

const DUE_QUICK_OPTIONS = [
  { label: 'Hôm nay', days: 0 },
  { label: 'Ngày mai', days: 1 },
  { label: '+3 ngày', days: 3 },
  { label: '+1 tuần', days: 7 },
];

export interface AssignmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment?: AssignmentItem | null;
  courses: AssignmentCourseOption[];
  defaultCourseId?: string;
  defaultSessionId?: string;
  onSaved?: () => void;
}

export function AssignmentFormDialog({
  open,
  onOpenChange,
  assignment,
  courses,
  defaultCourseId,
  defaultSessionId,
  onSaved,
}: AssignmentFormDialogProps) {
  const isEdit = Boolean(assignment?.id);
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: '',
      description: '',
      dueDate: toDateInputValue(null),
      priority: 'medium',
      courseId: defaultCourseId || courses[0]?.id || '',
      sessionId: defaultSessionId,
    },
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const watchedDueDate = watch('dueDate');

  React.useEffect(() => {
    if (!open) return;
    if (assignment) {
      reset({
        title: assignment.title,
        description: assignment.description || '',
        dueDate: toDateInputValue(assignment.dueDate),
        priority: (['low', 'medium', 'high', 'urgent'].includes(assignment.priority)
          ? assignment.priority
          : 'medium') as AssignmentFormData['priority'],
        courseId: assignment.courseId,
        sessionId: assignment.sessionId || undefined,
      });
    } else {
      reset({
        title: '',
        description: '',
        dueDate: toDateInputValue(null),
        priority: 'medium',
        courseId: defaultCourseId || courses[0]?.id || '',
        sessionId: defaultSessionId,
      });
    }
  }, [open, assignment, courses, defaultCourseId, defaultSessionId, reset]);

  const onSubmit = async (values: AssignmentFormData) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
      };

      const res = await fetch(
        isEdit && assignment ? `/api/assignments/${assignment.id}` : '/api/assignments',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể lưu bài tập');
      }

      toast.success(isEdit ? 'Đã cập nhật bài tập' : 'Đã thêm bài tập mới');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu bài tập');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[90dvh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary shrink-0" />
            {isEdit ? 'Chỉnh sửa bài tập' : 'Thêm bài tập mới'}
          </DialogTitle>
          <DialogDescription>
            Theo dõi hạn nộp và mức độ ưu tiên cho bài tập của bạn.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="assignment-title">
              Tên bài tập <span className="text-destructive">*</span>
            </Label>
            <Input
              id="assignment-title"
              placeholder="VD: Bài tập lớn tuần 5 - Cây nhị phân"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'assignment-title-error' : undefined}
              {...register('title')}
            />
            {errors.title && (
              <p id="assignment-title-error" role="alert" className="text-xs text-destructive">
                {errors.title.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assignment-course">
              Môn học <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={control}
              name="courseId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="assignment-course"
                    aria-invalid={Boolean(errors.courseId)}
                    aria-describedby={errors.courseId ? 'assignment-course-error' : undefined}
                  >
                    <SelectValue placeholder="Chọn môn học" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Chưa có môn học nào. Hãy tạo môn học trước.
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
                            {c.courseCode && (
                              <span className="text-xs text-muted-foreground font-mono">
                                ({c.courseCode})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.courseId && (
              <p id="assignment-course-error" role="alert" className="text-xs text-destructive">
                {errors.courseId.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="assignment-dueDate">
                Hạn nộp <span className="text-destructive">*</span>
              </Label>
              <Input
                id="assignment-dueDate"
                type="date"
                aria-invalid={Boolean(errors.dueDate)}
                aria-describedby={errors.dueDate ? 'assignment-due-error' : undefined}
                {...register('dueDate')}
              />
              {errors.dueDate && (
                <p id="assignment-due-error" role="alert" className="text-xs text-destructive">
                  {errors.dueDate.message}
                </p>
              )}
              <div className="flex flex-wrap gap-1 pt-0.5">
                {DUE_QUICK_OPTIONS.map((opt) => {
                  const targetDate = toDateInputValue(null, opt.days);
                  const active = watchedDueDate === targetDate;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() =>
                        setValue('dueDate', targetDate, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assignment-priority">Độ ưu tiên</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="assignment-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full shrink-0',
                                PRIORITY_DOT_COLORS[key] || 'bg-slate-400'
                              )}
                            />
                            <span>{label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assignment-description">Mô tả / Yêu cầu</Label>
            <Textarea
              id="assignment-description"
              placeholder="Ghi chú yêu cầu bài tập, định dạng nộp bài, link đề bài..."
              className="min-h-[88px] resize-y"
              {...register('description')}
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
              {isEdit ? 'Lưu thay đổi' : 'Thêm bài tập'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
