'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarRange, Loader2, Sparkles } from 'lucide-react';
import { semesterSchema } from '@/lib/validations';
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
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';

export interface SemesterItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  _count?: {
    courses?: number;
  };
}

const formSchema = semesterSchema.refine((d) => d.startDate <= d.endDate, {
  message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
  path: ['endDate'],
});

type SemesterFormValues = z.infer<typeof formSchema>;

function formatLocalYmd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateInputValue(dateStr?: string | null, offsetDays = 0): string {
  if (!dateStr) {
    return formatLocalYmd(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return formatLocalYmd(new Date());
  return formatLocalYmd(d);
}

export interface SemesterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semester?: SemesterItem | null;
  onSaved?: () => void;
}

export function SemesterFormDialog({
  open,
  onOpenChange,
  semester,
  onSaved,
}: SemesterFormDialogProps) {
  const isEdit = Boolean(semester?.id);
  const [submitting, setSubmitting] = React.useState(false);

  const quickPresets = React.useMemo(() => {
    const year = new Date().getFullYear();
    const academicSpan = `${year}-${year + 1}`;
    return [
      `Học kỳ 1 - ${academicSpan}`,
      `Học kỳ 2 - ${academicSpan}`,
      `Học kỳ Hè - ${academicSpan}`,
    ];
  }, []);

  const form = useForm<SemesterFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      startDate: toDateInputValue(null, 0),
      endDate: toDateInputValue(null, 120),
      isActive: false,
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
    if (semester) {
      reset({
        name: semester.name,
        startDate: toDateInputValue(semester.startDate),
        endDate: toDateInputValue(semester.endDate),
        isActive: semester.isActive,
      });
    } else {
      reset({
        name: '',
        startDate: toDateInputValue(null, 0),
        endDate: toDateInputValue(null, 120),
        isActive: false,
      });
    }
  }, [open, semester, reset]);

  const onSubmit = async (values: SemesterFormValues) => {
    setSubmitting(true);
    try {
      const res = await fetch(
        isEdit && semester ? `/api/semesters/${semester.id}` : '/api/semesters',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...values,
            name: values.name.trim(),
          }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể lưu học kỳ');
      }

      if (values.isActive && data?.id) {
        await fetch(`/api/semesters/${data.id}/activate`, {
          method: 'POST',
        }).catch(() => {});
      }

      toast.success(isEdit ? 'Đã cập nhật học kỳ' : 'Đã thêm học kỳ mới');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu học kỳ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[90dvh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary shrink-0" />
            {isEdit ? 'Chỉnh sửa học kỳ' : 'Thêm học kỳ mới'}
          </DialogTitle>
          <DialogDescription>
            Thiết lập tên và khoảng thời gian diễn ra học kỳ để phân loại môn học.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1" noValidate>
          <div className="space-y-2">
            <Label htmlFor="semester-name">
              Tên học kỳ <span className="text-destructive">*</span>
            </Label>
            <Input
              id="semester-name"
              placeholder="VD: Học kỳ 1 - 2026-2027"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'semester-name-error' : undefined}
              {...register('name')}
            />
            {errors.name && (
              <p id="semester-name-error" role="alert" className="text-xs text-destructive">
                {errors.name.message}
              </p>
            )}

            {!isEdit && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mr-0.5">
                  <Sparkles className="h-3 w-3" />
                  Gợi ý:
                </span>
                {quickPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      setValue('name', preset, { shouldDirty: true, shouldValidate: true })
                    }
                    className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="semester-startDate">
                Ngày bắt đầu <span className="text-destructive">*</span>
              </Label>
              <Input
                id="semester-startDate"
                type="date"
                aria-invalid={Boolean(errors.startDate)}
                aria-describedby={errors.startDate ? 'semester-start-error' : undefined}
                {...register('startDate')}
              />
              {errors.startDate && (
                <p id="semester-start-error" role="alert" className="text-xs text-destructive">
                  {errors.startDate.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="semester-endDate">
                Ngày kết thúc <span className="text-destructive">*</span>
              </Label>
              <Input
                id="semester-endDate"
                type="date"
                aria-invalid={Boolean(errors.endDate)}
                aria-describedby={errors.endDate ? 'semester-end-error' : undefined}
                {...register('endDate')}
              />
              {errors.endDate && (
                <p id="semester-end-error" role="alert" className="text-xs text-destructive">
                  {errors.endDate.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/25 p-3.5">
            <div className="space-y-0.5">
              <Label htmlFor="semester-active" className="text-sm font-medium cursor-pointer">
                Đặt làm học kỳ hiện tại
              </Label>
              <p className="text-xs text-muted-foreground">
                Hiển thị mặc định cho bảng điều khiển và thời khóa biểu.
              </p>
            </div>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch
                  id="semester-active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
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
            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Lưu thay đổi' : 'Tạo học kỳ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
