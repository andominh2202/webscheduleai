'use client';

import * as React from 'react';
import {
  AlertCircle,
  CalendarPlus,
  Clock,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
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
import { toVnDateString } from '@/lib/timezone';
import { cn } from '@/lib/utils';
import type { ListViewCourse } from './list-view';

interface MakeupSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: ListViewCourse[];
  onSaved?: () => void;
}

type SessionKind = 'makeup' | 'moved' | 'regular';

const SESSION_KIND_OPTIONS: Array<{
  value: SessionKind;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: 'makeup',
    label: 'Học bù',
    desc: 'Bù cho buổi nghỉ trước đó',
    icon: CalendarPlus,
  },
  {
    value: 'moved',
    label: 'Đổi lịch',
    desc: 'Dời sang khung giờ khác',
    icon: RefreshCw,
  },
  {
    value: 'regular',
    label: 'Tăng cường',
    desc: 'Buổi ôn tập / phụ đạo thêm',
    icon: Sparkles,
  },
];

const DEFAULT_PRESET_SLOTS = [
  { label: 'Ca 1', start: '07:00', end: '09:25' },
  { label: 'Ca 2', start: '09:35', end: '12:00' },
  { label: 'Ca 3', start: '13:00', end: '15:25' },
  { label: 'Ca 4', start: '15:35', end: '18:00' },
  { label: 'Ca tối', start: '18:30', end: '21:00' },
];

const CLASS_PERIODS_STORAGE_KEY = 'webschedule-class-periods-v1';

function computeDurationLabel(start: string, end: string): string | null {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  const diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours} giờ ${mins} phút`;
  if (hours > 0) return `${hours} giờ`;
  return `${mins} phút`;
}

export function MakeupSessionDialog({
  open,
  onOpenChange,
  courses,
  onSaved,
}: MakeupSessionDialogProps) {
  const [courseId, setCourseId] = React.useState('');
  const [date, setDate] = React.useState(() => toVnDateString(new Date()));
  const [startTime, setStartTime] = React.useState('07:00');
  const [endTime, setEndTime] = React.useState('09:25');
  const [room, setRoom] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [type, setType] = React.useState<SessionKind>('makeup');
  const [content, setContent] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [presetSlots, setPresetSlots] = React.useState(DEFAULT_PRESET_SLOTS);

  React.useEffect(() => {
    if (!open) return;
    setCourseId((prev) => prev || courses[0]?.id || '');

    try {
      const saved = window.localStorage.getItem(CLASS_PERIODS_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, { start?: string; end?: string }>;
      const customSlots = [1, 2, 3, 4].map((ca, idx) => {
        const p = parsed[String(ca)];
        if (p?.start && p?.end && p.start < p.end) {
          return { label: `Ca ${ca}`, start: p.start, end: p.end };
        }
        return DEFAULT_PRESET_SLOTS[idx];
      });
      setPresetSlots([...customSlots, DEFAULT_PRESET_SLOTS[4]]);
    } catch {
      // Fallback to default preset slots
    }
  }, [open, courses]);

  const timeInvalid = Boolean(startTime && endTime && startTime >= endTime);
  const durationLabel = React.useMemo(
    () => computeDurationLabel(startTime, endTime),
    [startTime, endTime]
  );

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
        const conflictName = data.conflicts[0].course?.name || 'môn khác';
        toast.warning(`Đã tạo buổi học, nhưng bị trùng giờ với ${conflictName}`);
      } else {
        toast.success('Đã thêm buổi học vào thời khóa biểu');
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
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Thêm buổi học bù / Lịch đặc biệt
          </DialogTitle>
          <DialogDescription>
            Tạo buổi học bù, đổi lịch hoặc buổi học tăng cường mà không ảnh hưởng lịch lặp hàng tuần.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Course Selector */}
          <div className="space-y-1.5">
            <Label htmlFor="makeup-course-select">Môn học *</Label>
            {courses.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Bạn chưa có môn học nào trong học kỳ này. Hãy tạo môn học hoặc nhập lịch trước.
              </div>
            ) : (
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="makeup-course-select">
                  <SelectValue placeholder="Chọn môn học" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="font-medium">{c.name}</span>
                        {c.courseCode && (
                          <span className="text-xs text-muted-foreground">
                            ({c.courseCode})
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Session Kind Segmented Cards */}
          <div className="space-y-1.5">
            <Label>Loại buổi học</Label>
            <div
              role="radiogroup"
              aria-label="Chọn loại buổi học"
              className="grid grid-cols-3 gap-2"
            >
              {SESSION_KIND_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setType(opt.value)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? 'border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/30'
                        : 'border-border bg-card hover:bg-accent/50 text-muted-foreground'
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Icon
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          selected ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                      {opt.label}
                    </span>
                    <span className="text-[11px] leading-snug text-muted-foreground hidden sm:inline">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date & Time + Quick Period Presets */}
          <div className="space-y-2 rounded-xl border bg-muted/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" />
                Chọn nhanh ca học
              </span>
              {durationLabel && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  Thời lượng: {durationLabel}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {presetSlots.map((slot) => {
                const isSelected =
                  startTime === slot.start && endTime === slot.end;
                return (
                  <button
                    key={slot.label}
                    type="button"
                    onClick={() => {
                      setStartTime(slot.start);
                      setEndTime(slot.end);
                    }}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    {slot.label} ({slot.start}–{slot.end})
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="space-y-1">
                <Label htmlFor="makeup-date" className="text-xs">
                  Ngày học *
                </Label>
                <Input
                  id="makeup-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="makeup-start-time" className="text-xs">
                  Giờ bắt đầu *
                </Label>
                <Input
                  id="makeup-start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="makeup-end-time" className="text-xs">
                  Giờ kết thúc *
                </Label>
                <Input
                  id="makeup-end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  aria-invalid={timeInvalid}
                  required
                />
              </div>
            </div>

            {timeInvalid && (
              <p
                role="alert"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Giờ kết thúc phải muộn hơn giờ bắt đầu.
              </p>
            )}
          </div>

          {/* Room & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="makeup-room" className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Phòng học
              </Label>
              <Input
                id="makeup-room"
                placeholder="VD: B1-205 hoặc Zoom"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="makeup-location">Địa điểm / Cơ sở</Label>
              <Input
                id="makeup-location"
                placeholder="VD: Cơ sở 1"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          {/* Content / Note */}
          <div className="space-y-1.5">
            <Label htmlFor="makeup-content">Ghi chú buổi học (tùy chọn)</Label>
            <Textarea
              id="makeup-content"
              placeholder="VD: Học bù cho buổi nghỉ tuần trước, mang theo laptop..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[72px]"
            />
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={submitting || courses.length === 0 || timeInvalid}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Thêm vào lịch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
