'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
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

function toDateInputValue(dateStr?: string | null): string {
  if (!dateStr) {
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return nextWeek.toISOString().slice(0, 10);
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Chỉnh sửa lịch thi' : 'Thêm lịch thi mới'}</DialogTitle>
          <DialogDescription>
            Cập nhật ngày thi, phòng thi và các lưu ý quan trọng cho kỳ thi.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="exam-title">
              Tên kỳ thi <span className="text-destructive">*</span>
            </Label>
            <Input
              id="exam-title"
              placeholder="VD: Thi giữa kỳ môn Giải tích"
              {...register('title')}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="exam-course">
                Môn học <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="courseId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="exam-course">
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
                              <span>{c.name}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.courseId && (
                <p className="text-xs text-destructive">{errors.courseId.message}</p>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="exam-date">
                Ngày thi <span className="text-destructive">*</span>
              </Label>
              <Input id="exam-date" type="date" {...register('date')} />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date.message}</p>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <Label htmlFor="exam-notes">Ghi chú thi</Label>
            <Textarea
              id="exam-notes"
              placeholder="Hình thức thi (tự luận/trắc nghiệm), tài liệu được mang vào, số báo danh..."
              className="min-h-[80px]"
              {...register('notes')}
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
            <Button type="submit" disabled={submitting || courses.length === 0}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Lưu thay đổi' : 'Thêm lịch thi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

