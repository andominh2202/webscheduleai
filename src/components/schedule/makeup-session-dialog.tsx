'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
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
import type { ListViewCourse } from './list-view';

interface MakeupSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: ListViewCourse[];
  onSaved?: () => void;
}

export function MakeupSessionDialog({
  open,
  onOpenChange,
  courses,
  onSaved,
}: MakeupSessionDialogProps) {
  const [courseId, setCourseId] = React.useState('');
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = React.useState('07:30');
  const [endTime, setEndTime] = React.useState('09:30');
  const [room, setRoom] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [type, setType] = React.useState<'makeup' | 'moved' | 'regular'>('makeup');
  const [content, setContent] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCourseId((prev) => prev || courses[0]?.id || '');
    }
  }, [open, courses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId) {
      toast.error('Vui lòng chọn môn học');
      return;
    }
    if (startTime >= endTime) {
      toast.error('Giờ kết thúc phải sau giờ bắt đầu');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/sessions/makeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          date,
          startTime,
          endTime,
          room: room.trim() || undefined,
          location: location.trim() || undefined,
          type,
          content: content.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể tạo buổi học');
      }

      if (Array.isArray(data.conflicts) && data.conflicts.length > 0) {
        toast.warning(
          `Đã tạo buổi học, nhưng bị trùng giờ với "${data.conflicts[0].course?.name || 'môn khác'}"`
        );
      } else {
        toast.success('Đã thêm buổi học bù vào thời khóa biểu');
      }

      setRoom('');
      setLocation('');
      setContent('');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Tạo buổi học thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm buổi học bù / Lịch đặc biệt</DialogTitle>
          <DialogDescription>
            Tạo buổi học bù, đổi lịch hoặc buổi học thêm mà không làm thay đổi lịch lặp cố định.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Môn học *</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn môn học" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Loại buổi học</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as 'makeup' | 'moved' | 'regular')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="makeup">Học bù</SelectItem>
                  <SelectItem value="moved">Đổi lịch</SelectItem>
                  <SelectItem value="regular">Bổ sung</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Ngày học *</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Giờ bắt đầu *</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Giờ kết thúc *</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phòng học</Label>
              <Input
                placeholder="VD: B1-205"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Địa điểm / Cơ sở</Label>
              <Input
                placeholder="VD: Cơ sở 1"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Ghi chú buổi học (tùy chọn)</Label>
            <Textarea
              placeholder="VD: Học bù cho buổi nghỉ tuần trước..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[70px]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || courses.length === 0}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Thêm buổi học
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

