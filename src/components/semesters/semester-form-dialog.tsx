'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
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

function toDateInputValue(dateStr?: string | null, offsetDays = 0): string {
  if (!dateStr) {
    const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Chỉnh sửa học kỳ' : 'Thêm học kỳ mới'}</DialogTitle>
          <DialogDescription>
            Thiết lập tên và khoảng thời gian diễn ra học kỳ.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="semester-name">
              Tên học kỳ <span className="text-destructive">*</span>
            </Label>
            <Input
              id="semester-name"
              placeholder="VD: Học kỳ 1 - 2026-2027"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="semester-startDate">
                Ngày bắt đầu <span className="text-destructive">*</span>
              </Label>
              <Input
                id="semester-startDate"
                type="date"
                {...register('startDate')}
              />
              {errors.startDate && (
                <p className="text-xs text-destructive">{errors.startDate.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="semester-endDate">
                Ngày kết thúc <span className="text-destructive">*</span>
              </Label>
              <Input
                id="semester-endDate"
                type="date"
                {...register('endDate')}
              />
              {errors.endDate && (
                <p className="text-xs text-destructive">{errors.endDate.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="semester-active" className="text-sm font-medium">
                Đặt làm học kỳ hiện tại
              </Label>
              <p className="text-xs text-muted-foreground">
                Hiển thị mặc định cho môn học và thời khóa biểu.
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

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Lưu thay đổi' : 'Tạo học kỳ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

