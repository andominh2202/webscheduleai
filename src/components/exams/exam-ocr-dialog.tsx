'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ClipboardPaste,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
  X,
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { cn, EXAM_TYPE_LABELS } from '@/lib/utils';
import {
  formatIsoToVnDate,
  isValidTime24,
  isValidTimeRange,
  normalizeTime24,
  parseDateToIso,
} from '@/lib/date-time-validation';
import type { ExamCourseOption } from '@/components/exams/exam-form-dialog';

type ExamType = 'quiz' | 'midterm' | 'final' | 'other';

interface OcrExamRow {
  courseName: string;
  courseCode: string;
  courseId: string;
  title: string;
  type: ExamType;
  dateText: string; // dd/MM/yyyy shown to user
  startTime: string;
  endTime: string;
  room: string;
  location: string;
  notes: string;
}

export interface ExamOcrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: ExamCourseOption[];
  onSaved?: () => void;
}

function normalizeMatchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function matchCourseId(
  courseCode: string,
  courseName: string,
  courses: ExamCourseOption[]
): string {
  if (courses.length === 0) return '';
  const normCode = normalizeMatchText(courseCode);
  if (normCode) {
    const byCode = courses.find(
      (c) =>
        c.courseCode &&
        (normalizeMatchText(c.courseCode) === normCode ||
          normalizeMatchText(c.courseCode).includes(normCode) ||
          normCode.includes(normalizeMatchText(c.courseCode)))
    );
    if (byCode) return byCode.id;
  }

  const normName = normalizeMatchText(courseName);
  if (normName) {
    const byExact = courses.find((c) => normalizeMatchText(c.name) === normName);
    if (byExact) return byExact.id;
    const byPartial = courses.find((c) => {
      const target = normalizeMatchText(c.name);
      return target.includes(normName) || normName.includes(target);
    });
    if (byPartial) return byPartial.id;
  }

  return courses.length === 1 ? courses[0].id : '';
}

function getExamRowIssues(row: OcrExamRow): string[] {
  const issues: string[] = [];
  if (!row.courseId) issues.push('Chưa chọn môn học');
  if (!row.title.trim()) issues.push('Thiếu tên kỳ thi');
  if (!parseDateToIso(row.dateText)) issues.push('Ngày thi phải đúng dd/MM/yyyy');
  const start = row.startTime.trim();
  const end = row.endTime.trim();
  if (start && !isValidTime24(start)) issues.push('Giờ bắt đầu sai HH:mm');
  if (end && !isValidTime24(end)) issues.push('Giờ kết thúc sai HH:mm');
  if (start && end && isValidTime24(start) && isValidTime24(end) && !isValidTimeRange(start, end)) {
    issues.push('Giờ kết thúc phải sau giờ bắt đầu');
  }
  return issues;
}

export function ExamOcrDialog({
  open,
  onOpenChange,
  courses,
  onSaved,
}: ExamOcrDialogProps) {
  const [recognizing, setRecognizing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [isDragging, setIsDragging] = React.useState(false);
  const [rows, setRows] = React.useState<OcrExamRow[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearImage = React.useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFileName('');
    setRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRecognize = React.useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error('Vui lòng chọn hoặc dán tệp ảnh PNG/JPEG/WebP.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Ảnh vượt quá giới hạn 5 MB.');
        return;
      }

      const nextUrl = URL.createObjectURL(file);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });
      setFileName(file.name || 'lich-thi-clipboard.png');
      setRecognizing(true);
      setRows([]);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mode', 'exam');
        const res = await fetch('/api/import/image', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không thể nhận diện lịch thi từ ảnh');

        const parsedRows: OcrExamRow[] = (Array.isArray(data.rows) ? data.rows : []).map(
          (item: Record<string, unknown>) => {
            const courseName = String(item.courseName || '');
            const courseCode = String(item.courseCode || '');
            const isoDate = parseDateToIso(item.date) || '';
            const rawType = String(item.type || 'final');
            const type: ExamType =
              rawType === 'quiz' ||
              rawType === 'midterm' ||
              rawType === 'final' ||
              rawType === 'other'
                ? rawType
                : 'final';

            return {
              courseName,
              courseCode,
              courseId: matchCourseId(courseCode, courseName, courses),
              title: String(item.title || (courseName ? `Thi ${courseName}` : '')),
              type,
              dateText: isoDate ? formatIsoToVnDate(isoDate) : '',
              startTime: normalizeTime24(item.startTime) || '',
              endTime: normalizeTime24(item.endTime) || '',
              room: String(item.room || ''),
              location: String(item.location || ''),
              notes: String(item.notes || ''),
            };
          }
        );

        setRows(parsedRows);
        const needReview = parsedRows.filter((r) => getExamRowIssues(r).length > 0).length;
        if (needReview > 0) {
          toast.warning(
            `Đã nhận diện ${parsedRows.length} lịch thi (${needReview} dòng cần chọn môn học hoặc kiểm tra ngày/giờ).`
          );
        } else {
          toast.success(
            `Đã nhận diện ${parsedRows.length} lịch thi. Hãy rà soát trước khi lưu.`
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nhận diện lịch thi thất bại');
      } finally {
        setRecognizing(false);
      }
    },
    [courses]
  );

  React.useEffect(() => {
    if (!open) return;
    const handlePaste = (event: ClipboardEvent) => {
      if (recognizing || saving) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            event.preventDefault();
            void handleRecognize(pastedFile);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open, recognizing, saving, handleRecognize]);

  const updateRow = <K extends keyof OcrExamRow>(
    index: number,
    key: K,
    value: OcrExamRow[K]
  ) => {
    setRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [key]: value } : row))
    );
  };

  const handleDateBlur = (index: number) => {
    const raw = rows[index]?.dateText.trim() || '';
    if (!raw) return;
    const iso = parseDateToIso(raw);
    if (iso) {
      updateRow(index, 'dateText', formatIsoToVnDate(iso));
    }
  };

  const handleTimeBlur = (index: number, key: 'startTime' | 'endTime') => {
    const raw = rows[index]?.[key].trim() || '';
    if (!raw) return;
    const normalized = normalizeTime24(raw);
    if (normalized) {
      updateRow(index, key, normalized);
    }
  };

  const handleSaveAll = async () => {
    if (!rows.length || saving) return;

    for (let i = 0; i < rows.length; i++) {
      const issues = getExamRowIssues(rows[i]);
      if (issues.length > 0) {
        toast.error(`Lịch thi ${i + 1}: ${issues.join(', ')}.`);
        return;
      }
    }

    setSaving(true);
    let createdCount = 0;
    const failedMessages: string[] = [];

    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const isoDate = parseDateToIso(row.dateText)!;
        const payload = {
          courseId: row.courseId,
          title: row.title.trim(),
          type: row.type,
          date: isoDate,
          startTime: row.startTime.trim() || undefined,
          endTime: row.endTime.trim() || undefined,
          room: row.room.trim() || undefined,
          location: row.location.trim() || undefined,
          notes: row.notes.trim() || undefined,
        };

        const res = await fetch('/api/exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          createdCount += 1;
        } else {
          const data = await res.json().catch(() => ({}));
          failedMessages.push(`Dòng ${i + 1}: ${data?.error || 'Lỗi lưu lịch thi'}`);
        }
      }

      if (createdCount > 0) {
        toast.success(`Đã lưu ${createdCount}/${rows.length} lịch thi từ ảnh.`);
        onSaved?.();
      }
      if (failedMessages.length > 0) {
        toast.error(failedMessages.slice(0, 3).join('; '));
      } else {
        clearImage();
        onOpenChange(false);
      }
    } catch {
      toast.error('Lỗi kết nối khi lưu lịch thi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[90dvh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary shrink-0" />
            Nhập lịch thi từ ảnh (OCR)
          </DialogTitle>
          <DialogDescription>
            Dán ảnh chụp bảng lịch thi bằng <strong>Ctrl+V</strong>, kéo thả hoặc chọn tệp. AI sẽ tự trích xuất ngày thi, giờ thi và phòng thi để bạn rà soát trước khi lưu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {courses.length === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Bạn chưa có môn học nào. Bạn vẫn có thể thử nhận diện ảnh, nhưng cần tạo ít nhất 1 môn học để gắn lịch thi khi lưu.
              </span>
            </div>
          )}

          {/* Dropzone / Paste Area */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => !recognizing && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !recognizing) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!recognizing) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (recognizing) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void handleRecognize(file);
            }}
            className={cn(
              'rounded-xl border-2 border-dashed p-4 text-center transition-colors cursor-pointer',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 bg-muted/20 hover:border-primary/50 hover:bg-muted/35',
              recognizing && 'opacity-60 pointer-events-none'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Chọn ảnh lịch thi"
              className="hidden"
              disabled={recognizing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleRecognize(file);
              }}
            />

            {previewUrl ? (
              <div className="space-y-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Ảnh lịch thi đã chọn"
                  className="mx-auto max-h-44 rounded-lg border bg-background object-contain"
                />
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="max-w-[220px] truncate text-muted-foreground">
                    {fileName}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    disabled={recognizing || saving}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Chọn ảnh khác
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                    disabled={recognizing || saving}
                    onClick={(e) => {
                      e.stopPropagation();
                      clearImage();
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Xóa ảnh
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ClipboardPaste className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium">
                  Nhấn <strong>Ctrl+V</strong> để dán ảnh, kéo thả hoặc bấm chọn tệp
                </p>
                <p className="text-xs text-muted-foreground">
                  Hỗ trợ PNG, JPEG, WebP (tối đa 5 MB)
                </p>
              </div>
            )}
          </div>

          {recognizing && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-primary font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang nhận diện bảng lịch thi từ ảnh...
            </div>
          )}

          {/* Extracted Exam Rows */}
          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Đã nhận diện {rows.length} lịch thi — kiểm tra và chỉnh sửa trước khi lưu:
                </p>
              </div>

              <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
                {rows.map((row, idx) => {
                  const issues = getExamRowIssues(row);
                  const hasIssues = issues.length > 0;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'space-y-2.5 rounded-xl border bg-card p-3',
                        hasIssues &&
                          'border-amber-400/80 bg-amber-50/30 dark:bg-amber-950/15'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold">Lịch thi {idx + 1}</span>
                          {(row.courseCode || row.courseName) && (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {[row.courseCode, row.courseName].filter(Boolean).join(' – ')}
                            </Badge>
                          )}
                          {hasIssues && (
                            <Badge
                              variant="outline"
                              className="border-amber-400 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px]"
                            >
                              Cần kiểm tra
                            </Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            setRows((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label={`Bỏ lịch thi ${idx + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {hasIssues && (
                        <div className="flex items-start gap-1.5 rounded-md border border-amber-300/70 bg-amber-50/70 dark:bg-amber-950/30 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{issues.join(' • ')}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Môn học *
                          </label>
                          <Select
                            value={row.courseId}
                            onValueChange={(val) => updateRow(idx, 'courseId', val)}
                          >
                            <SelectTrigger
                              className={cn(
                                'h-8 text-xs',
                                !row.courseId && 'border-amber-500'
                              )}
                            >
                              <SelectValue placeholder="Chọn môn học" />
                            </SelectTrigger>
                            <SelectContent>
                              {courses.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-2 w-2 rounded-full shrink-0"
                                      style={{ backgroundColor: c.color || '#3b82f6' }}
                                    />
                                    <span className="truncate">
                                      {c.courseCode ? `${c.courseCode} – ${c.name}` : c.name}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Loại kỳ thi
                          </label>
                          <Select
                            value={row.type}
                            onValueChange={(val) =>
                              updateRow(idx, 'type', val as ExamType)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
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
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Tên kỳ thi *
                          </label>
                          <Input
                            className="h-8 text-xs"
                            value={row.title}
                            onChange={(e) => updateRow(idx, 'title', e.target.value)}
                            placeholder="VD: Thi cuối kỳ"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Phòng thi
                          </label>
                          <Input
                            className="h-8 text-xs"
                            value={row.room}
                            onChange={(e) => updateRow(idx, 'room', e.target.value)}
                            placeholder="VD: A2.301"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Ngày thi (dd/MM/yyyy) *
                          </label>
                          <Input
                            className={cn(
                              'h-8 text-xs',
                              row.dateText.trim() &&
                                !parseDateToIso(row.dateText) &&
                                'border-destructive'
                            )}
                            value={row.dateText}
                            onChange={(e) => updateRow(idx, 'dateText', e.target.value)}
                            onBlur={() => handleDateBlur(idx)}
                            placeholder="dd/MM/yyyy"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Giờ bắt đầu (HH:mm)
                          </label>
                          <Input
                            className={cn(
                              'h-8 text-xs',
                              row.startTime.trim() &&
                                !isValidTime24(row.startTime) &&
                                'border-destructive'
                            )}
                            value={row.startTime}
                            onChange={(e) => updateRow(idx, 'startTime', e.target.value)}
                            onBlur={() => handleTimeBlur(idx, 'startTime')}
                            placeholder="07:30"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Giờ kết thúc (HH:mm)
                          </label>
                          <Input
                            className={cn(
                              'h-8 text-xs',
                              row.endTime.trim() &&
                                !isValidTime24(row.endTime) &&
                                'border-destructive'
                            )}
                            value={row.endTime}
                            onChange={(e) => updateRow(idx, 'endTime', e.target.value)}
                            onBlur={() => handleTimeBlur(idx, 'endTime')}
                            placeholder="09:00"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Địa điểm / Cơ sở
                          </label>
                          <Input
                            className="h-8 text-xs"
                            value={row.location}
                            onChange={(e) => updateRow(idx, 'location', e.target.value)}
                            placeholder="VD: Cơ sở 1"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Ghi chú (hình thức thi, SBD...)
                          </label>
                          <Input
                            className="h-8 text-xs"
                            value={row.notes}
                            onChange={(e) => updateRow(idx, 'notes', e.target.value)}
                            placeholder="VD: Tự luận, SBD 123"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Đóng
          </Button>
          <Button
            type="button"
            onClick={handleSaveAll}
            disabled={saving || recognizing || rows.length === 0 || courses.length === 0}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? 'Đang lưu...' : `Lưu ${rows.length} lịch thi`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
