'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  Calendar,
  Clock,
  Edit,
  FileText,
  GraduationCap,
  MapPin,
  Trash2,
} from 'lucide-react';
import { cn, EXAM_TYPE_LABELS } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ExamCourseOption, ExamItem } from '@/components/exams/exam-form-dialog';

export interface ExamDetailDialogProps {
  exam: ExamItem | null;
  course?: ExamCourseOption;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (exam: ExamItem) => void;
  onDelete: (exam: ExamItem) => void;
}

function getDaysDiff(dateStr: string): number {
  const d = new Date(dateStr);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function ExamDetailDialog({
  exam,
  course,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: ExamDetailDialogProps) {
  if (!exam) return null;

  const resolvedCourse = exam.course || course;
  const courseColor = resolvedCourse?.color || '#3b82f6';
  const examDate = new Date(exam.date);
  const daysDiff = getDaysDiff(exam.date);
  const isUpcoming = daysDiff >= 0;

  const statusText =
    daysDiff === 0
      ? 'Thi hôm nay'
      : daysDiff === 1
      ? 'Ngày mai'
      : daysDiff > 1
      ? `Còn ${daysDiff} ngày`
      : `Đã qua ${Math.abs(daysDiff)} ngày`;

  const timeRange =
    exam.startTime && exam.endTime
      ? `${exam.startTime} – ${exam.endTime}`
      : exam.startTime || 'Chưa cập nhật giờ thi';

  const typeLabel = EXAM_TYPE_LABELS[exam.type] || exam.type || 'Khác';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: courseColor }}
            />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {resolvedCourse?.courseCode ? `${resolvedCourse.courseCode} • ` : ''}
              {resolvedCourse?.name || 'Môn học'}
            </span>
          </div>
          <DialogTitle className="text-xl leading-snug">{exam.title}</DialogTitle>
          <DialogDescription className="sr-only">
            Thông tin chi tiết kỳ thi
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status & Type */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <GraduationCap className="h-3.5 w-3.5 mr-1" />
              {typeLabel}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-xs font-medium',
                daysDiff === 0
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                  : daysDiff === 1
                  ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30'
                  : isUpcoming
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                  : 'bg-muted text-muted-foreground border-border'
              )}
            >
              {isUpcoming ? 'Sắp diễn ra' : 'Đã hoàn thành'} • {statusText}
            </Badge>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border bg-muted/25 p-3.5 text-sm">
            <div className="flex items-start gap-2.5">
              <Calendar className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Ngày thi</p>
                <p className="font-medium capitalize">
                  {format(examDate, 'EEEE, dd/MM/yyyy', { locale: vi })}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Giờ thi</p>
                <p className="font-medium tabular-nums">{timeRange}</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 sm:col-span-2">
              <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Phòng thi / Địa điểm</p>
                <p className="font-medium">
                  {exam.room || exam.location
                    ? [exam.room ? `Phòng ${exam.room}` : null, exam.location]
                        .filter(Boolean)
                        .join(' — ')
                    : 'Chưa cập nhật phòng thi'}
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {exam.notes && (
            <div className="rounded-xl border bg-card p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                Ghi chú
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {exam.notes}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              onOpenChange(false);
              onDelete(exam);
            }}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Xóa lịch thi
          </Button>
          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Đóng
            </Button>
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onEdit(exam);
              }}
            >
              <Edit className="h-4 w-4 mr-1.5" />
              Chỉnh sửa
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
