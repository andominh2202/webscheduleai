'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getISOWeek } from 'date-fns';
import {
  AlertCircle,
  CalendarPlus,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  isValidDateRange,
  isValidIsoDate,
  isValidTime24,
  isValidTimeRange,
} from '@/lib/date-time-validation';

export interface ClassPeriod {
  start: string;
  end: string;
}

export interface RecognizedImageRow {
  name: string;
  courseCode: string;
  credits: number;
  dayOfWeek: number;
  ca: number;
  room: string;
  startDate: string;
  endDate: string;
  firstWeek: number;
  lastWeek: number;
  startTime: string;
  endTime: string;
  needsSchedule?: boolean;
  confirmed?: boolean;
}

type OcrWorkflowStep =
  | 'upload'
  | 'preview'
  | 'processing'
  | 'review'
  | 'saving'
  | 'done';

const DAY_OF_WEEK_OPTIONS: Array<{ value: number; label: string }> = [
  { value: -1, label: '-- Chọn thứ --' },
  { value: 1, label: 'Thứ 2' },
  { value: 2, label: 'Thứ 3' },
  { value: 3, label: 'Thứ 4' },
  { value: 4, label: 'Thứ 5' },
  { value: 5, label: 'Thứ 6' },
  { value: 6, label: 'Thứ 7' },
  { value: 0, label: 'Chủ nhật' },
];

const WORKFLOW_STEPS: Array<{ id: OcrWorkflowStep; label: string }> = [
  { id: 'upload', label: '1. Tải ảnh' },
  { id: 'processing', label: '2. AI OCR' },
  { id: 'review', label: '3. Kiểm tra & Sửa' },
  { id: 'saving', label: '4. Xác nhận & Lưu' },
];

function applyPeriod(
  row: RecognizedImageRow,
  periods: Record<number, ClassPeriod>
): RecognizedImageRow {
  const period = periods[row.ca];
  if (!period) return row;
  return {
    ...row,
    startTime: row.startTime || period.start,
    endTime: row.endTime || period.end,
  };
}

function getRowValidationError(row: RecognizedImageRow): string | null {
  if (!row.name.trim()) return 'Thiếu tên môn học';
  if (row.dayOfWeek < 0 || row.dayOfWeek > 6) return 'Chưa chọn Thứ học';
  if (!isValidTime24(row.startTime) || !isValidTime24(row.endTime)) {
    return 'Thiếu hoặc sai định dạng giờ (HH:mm)';
  }
  if (!isValidTimeRange(row.startTime, row.endTime)) {
    return 'Giờ bắt đầu phải trước giờ kết thúc';
  }
  if (
    row.startDate &&
    row.endDate &&
    (!isValidIsoDate(row.startDate) ||
      !isValidIsoDate(row.endDate) ||
      !isValidDateRange(row.startDate, row.endDate))
  ) {
    return 'Khoảng ngày học không hợp lệ';
  }
  return null;
}

interface ScheduleImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classPeriods: Record<number, ClassPeriod>;
  onUpdateClassPeriod: (ca: number, field: keyof ClassPeriod, value: string) => void;
  onSaveClassPeriods: () => void;
  onImported: () => Promise<void>;
  onOpenManual: () => void;
}

export function ScheduleImportDialog({
  open,
  onOpenChange,
  classPeriods,
  onUpdateClassPeriod,
  onSaveClassPeriods,
  onImported,
  onOpenManual,
}: ScheduleImportDialogProps) {
  const [importModalTab, setImportModalTab] = useState<'ocr' | 'excel' | 'manual'>('ocr');
  const [importBusy, setImportBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string>('');

  const [imageRows, setImageRows] = useState<RecognizedImageRow[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');
  const [imageFileSize, setImageFileSize] = useState<number>(0);
  const [ocrError, setOcrError] = useState<string>('');
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [periodEditorOpen, setPeriodEditorOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const clearImageSelection = useCallback(() => {
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageFileName('');
    setImageFileSize(0);
    setImageRows([]);
    setOcrError('');
    setImportResult('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const handleImageRecognize = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        const msg = 'Định dạng không hợp lệ. Vui lòng chọn hoặc dán tệp ảnh (PNG, JPEG, WebP).';
        setOcrError(msg);
        toast.error(msg);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        const msg = 'Ảnh vượt quá 5 MB. Hãy nén hoặc chọn ảnh dung lượng nhỏ hơn.';
        setOcrError(msg);
        toast.error(msg);
        return;
      }

      setImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setImageFileName(file.name || 'anh-dan-tu-clipboard.png');
      setImageFileSize(file.size);
      setImageBusy(true);
      setOcrError('');
      setImportResult('');
      setImageRows([]);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mode', 'schedule');
        const res = await fetch('/api/import/image', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không thể đọc ảnh thời khóa biểu.');

        const nextRows: RecognizedImageRow[] = (data.rows || []).map(
          (row: RecognizedImageRow) => {
            const withPeriod = applyPeriod(row, classPeriods);
            const hasValidRange =
              isValidIsoDate(withPeriod.startDate) &&
              isValidIsoDate(withPeriod.endDate) &&
              isValidDateRange(withPeriod.startDate, withPeriod.endDate);
            const startWeek = isValidIsoDate(withPeriod.startDate)
              ? getISOWeek(new Date(withPeriod.startDate + 'T12:00:00'))
              : 1;
            const endWeek = hasValidRange
              ? getISOWeek(new Date(withPeriod.endDate + 'T12:00:00'))
              : startWeek;
            const normalized: RecognizedImageRow = {
              ...withPeriod,
              firstWeek:
                withPeriod.lastWeek > 0 && withPeriod.firstWeek > 0
                  ? withPeriod.firstWeek
                  : startWeek,
              lastWeek: withPeriod.lastWeek > 0 ? withPeriod.lastWeek : endWeek,
              confirmed: false,
            };
            return normalized;
          }
        );

        if (nextRows.length === 0) {
          setOcrError(
            'AI OCR không tìm thấy dòng môn học nào trong ảnh. Hãy thử ảnh rõ nét hơn, chụp thẳng bảng thời khóa biểu.'
          );
          return;
        }

        setImageRows(nextRows);
        const missingCount = nextRows.filter((r) => Boolean(getRowValidationError(r))).length;
        if (missingCount > 0) {
          toast.warning(
            `Đã nhận diện ${nextRows.length} học phần, trong đó ${missingCount} dòng thiếu thông tin. Hãy kiểm tra và bổ sung trước khi lưu.`
          );
        } else {
          toast.success(
            `Đã nhận diện ${nextRows.length} học phần. Hãy kiểm tra và xác nhận trước khi lưu.`
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Nhận diện ảnh thất bại';
        setOcrError(msg);
        toast.error(msg);
      } finally {
        setImageBusy(false);
      }
    },
    [classPeriods]
  );

  useEffect(() => {
    if (!open || importModalTab !== 'ocr') return;
    const handleWindowPaste = (event: ClipboardEvent) => {
      if (imageBusy) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            event.preventDefault();
            void handleImageRecognize(pastedFile);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [open, importModalTab, imageBusy, handleImageRecognize]);

  const updateImageRow = (index: number, key: string, value: string | boolean) => {
    setImageRows((previous) =>
      previous.map((row, i) => {
        if (i !== index) return row;
        if (key === 'confirmed') {
          return { ...row, confirmed: Boolean(value) };
        }
        if (key === 'ca') {
          const next = applyPeriod({ ...row, ca: Number(value) }, classPeriods);
          return {
            ...next,
            confirmed: false,
            needsSchedule:
              next.dayOfWeek < 0 ||
              !isValidTime24(next.startTime) ||
              !isValidTime24(next.endTime),
          };
        }
        if (key === 'dayOfWeek') {
          const nextDay = Number(value);
          return {
            ...row,
            dayOfWeek: nextDay,
            confirmed: false,
            needsSchedule:
              nextDay < 0 ||
              !isValidTime24(row.startTime) ||
              !isValidTime24(row.endTime),
          };
        }
        if (key === 'credits' || key === 'firstWeek' || key === 'lastWeek') {
          return { ...row, [key]: Number(value) || 0, confirmed: false };
        }
        const nextRow = { ...row, [key]: String(value), confirmed: false };
        return {
          ...nextRow,
          needsSchedule:
            nextRow.dayOfWeek < 0 ||
            !isValidTime24(nextRow.startTime) ||
            !isValidTime24(nextRow.endTime),
        };
      })
    );
  };

  const removeImageRow = (index: number) => {
    setImageRows((previous) => previous.filter((_, i) => i !== index));
  };

  const confirmAllValidRows = () => {
    setImageRows((previous) =>
      previous.map((row) =>
        getRowValidationError(row) ? row : { ...row, confirmed: true }
      )
    );
  };

  const saveImageRows = async () => {
    if (imageRows.length === 0) return;
    const invalidRow = imageRows.find((r) => Boolean(getRowValidationError(r)));
    if (invalidRow) {
      toast.error(
        `Môn "${invalidRow.name || 'Chưa đặt tên'}": ${getRowValidationError(invalidRow)}`
      );
      return;
    }

    setImportBusy(true);
    try {
      const payload = {
        rows: imageRows.map((row) => ({
          name: row.name,
          courseCode: row.courseCode,
          credits: row.credits || 0,
          dayOfWeek: row.dayOfWeek,
          startTime: row.startTime,
          endTime: row.endTime,
          room: row.room,
          startDate: row.startDate,
          endDate: row.endDate,
          firstWeek: row.firstWeek || 1,
          lastWeek: row.lastWeek || 0,
        })),
      };
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể lưu lịch từ ảnh');

      toast.success(`Đã lưu ${data.createdCourses || imageRows.length} học phần vào thời khóa biểu.`);
      clearImageSelection();
      onOpenChange(false);
      await onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Lưu lịch thất bại');
    } finally {
      setImportBusy(false);
    }
  };

  const handleExcelImport = async () => {
    if (!importFile) return;
    setImportBusy(true);
    setImportResult('');
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Nhập tệp thất bại');
      setImportResult(
        `Đã nhập thành công ${data.createdCourses ?? 0} học phần và ${data.createdSessions ?? 0} buổi học.`
      );
      toast.success('Đã nhập thời khóa biểu từ tệp!');
      setImportFile(null);
      await onImported();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Nhập tệp thất bại';
      setImportResult(msg);
      toast.error(msg);
    } finally {
      setImportBusy(false);
    }
  };

  const currentWorkflowStep: OcrWorkflowStep = useMemo(() => {
    if (importBusy) return 'saving';
    if (imageBusy) return 'processing';
    if (imageRows.length > 0) return 'review';
    if (imagePreviewUrl) return 'preview';
    return 'upload';
  }, [importBusy, imageBusy, imageRows.length, imagePreviewUrl]);

  const invalidCount = useMemo(
    () => imageRows.filter((r) => Boolean(getRowValidationError(r))).length,
    [imageRows]
  );
  const confirmedCount = useMemo(
    () => imageRows.filter((r) => r.confirmed && !getRowValidationError(r)).length,
    [imageRows]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[92vh] overflow-y-auto transition-[max-width] duration-200',
          imageRows.length > 0 ? 'w-[95vw] max-w-5xl' : 'max-w-xl'
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Tạo &amp; Nhập thời khóa biểu
          </DialogTitle>
          <DialogDescription>
            Chọn phương thức nhập phù hợp: quét ảnh TKB bằng AI OCR, nhập tệp Excel/CSV hoặc thêm thủ công.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={importModalTab}
          onValueChange={(value) => setImportModalTab(value as 'ocr' | 'excel' | 'manual')}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ocr" className="gap-1.5 text-xs sm:text-sm">
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Ảnh TKB (OCR)</span>
            </TabsTrigger>
            <TabsTrigger value="excel" className="gap-1.5 text-xs sm:text-sm">
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
              <span>Excel / CSV</span>
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-1.5 text-xs sm:text-sm">
              <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
              <span>Thêm buổi học</span>
            </TabsTrigger>
          </TabsList>

          {importModalTab === 'ocr' && (
            <div className="space-y-4">
              {/* Workflow Stepper */}
              <div className="grid grid-cols-4 gap-1.5 rounded-xl border bg-muted/30 p-2">
                {WORKFLOW_STEPS.map((step, idx) => {
                  const stepOrder = ['upload', 'processing', 'review', 'saving'];
                  const currentIdx = Math.max(
                    0,
                    stepOrder.indexOf(
                      currentWorkflowStep === 'preview' ? 'upload' : currentWorkflowStep
                    )
                  );
                  const isDone = idx < currentIdx;
                  const isActive = idx === currentIdx;
                  return (
                    <div
                      key={step.id}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center text-[11px] font-medium transition-colors',
                        isActive && 'bg-primary text-primary-foreground shadow-sm',
                        isDone && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                        !isActive && !isDone && 'text-muted-foreground'
                      )}
                    >
                      {isDone && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{step.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Upload / Preview Zone */}
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDraggingImage(true);
                }}
                onDragLeave={() => setIsDraggingImage(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDraggingImage(false);
                  if (imageBusy) return;
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped) void handleImageRecognize(dropped);
                }}
                className={cn(
                  'relative rounded-xl border-2 border-dashed p-4 transition-all duration-200',
                  isDraggingImage
                    ? 'scale-[1.01] border-primary bg-primary/10 ring-4 ring-primary/10'
                    : 'border-muted-foreground/25 bg-muted/15 hover:border-primary/50 hover:bg-muted/25'
                )}
              >
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Chọn ảnh thời khóa biểu"
                  className="hidden"
                  disabled={imageBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleImageRecognize(file);
                  }}
                />

                {imagePreviewUrl ? (
                  <div className="space-y-3">
                    <div className="relative mx-auto max-h-52 overflow-hidden rounded-lg border bg-background/80 p-1.5 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreviewUrl}
                        alt="Ảnh thời khóa biểu đã chọn"
                        className="mx-auto max-h-48 w-auto rounded object-contain"
                      />
                      {imageBusy && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-[2px]">
                          <Loader2 className="h-7 w-7 animate-spin text-primary" />
                          <p className="text-xs font-medium text-primary">
                            Đang phân tích ảnh bằng AI OCR...
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate font-medium">{imageFileName}</span>
                        {imageFileSize > 0 && (
                          <span className="shrink-0 text-muted-foreground">
                            ({(imageFileSize / 1024).toFixed(0)} KB)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={imageBusy}
                          onClick={() => imageInputRef.current?.click()}
                        >
                          Đổi ảnh
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={imageBusy}
                          onClick={clearImageSelection}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Xóa ảnh
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UploadCloud className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        Kéo thả ảnh thời khóa biểu vào đây
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Hoặc nhấn{' '}
                        <kbd className="rounded border bg-background px-1.5 py-0.5 text-[11px] font-semibold">
                          Ctrl + V
                        </kbd>{' '}
                        để dán trực tiếp từ clipboard (PNG, JPEG, WebP &lt; 5 MB)
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={imageBusy}
                        onClick={() => imageInputRef.current?.click()}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        Chọn ảnh từ thiết bị
                      </Button>
                      <Badge variant="secondary" className="gap-1 py-1 text-[11px] font-normal">
                        <ClipboardPaste className="h-3 w-3" />
                        Hỗ trợ Ctrl+V
                      </Badge>
                    </div>
                  </div>
                )}
              </div>

              {/* OCR Error Banner */}
              {ocrError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold">Không thể nhận diện ảnh</p>
                    <p>{ocrError}</p>
                    <p className="text-[11px] opacity-90">
                      Gợi ý: Chụp rõ nét bảng thời khóa biểu, tránh bị mờ hoặc cắt chữ, sau đó chọn lại ảnh hoặc dán ảnh khác.
                    </p>
                  </div>
                </div>
              )}

              {/* Class Periods Configuration */}
              <div className="rounded-xl border bg-background p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Giờ học theo ca (tự động điền khi thiếu giờ)</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setPeriodEditorOpen((v) => !v)}
                  >
                    {periodEditorOpen ? 'Đóng' : 'Chỉnh giờ ca'}
                  </Button>
                </div>
                {periodEditorOpen && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[1, 2, 3, 4].map((ca) => (
                        <div key={ca} className="flex items-center gap-2 text-xs">
                          <span className="w-10 font-medium">Ca {ca}</span>
                          <input
                            type="time"
                            value={classPeriods[ca]?.start || ''}
                            onChange={(e) => onUpdateClassPeriod(ca, 'start', e.target.value)}
                            className="h-8 rounded-md border bg-background px-2 text-xs"
                          />
                          <span>-</span>
                          <input
                            type="time"
                            value={classPeriods[ca]?.end || ''}
                            onChange={(e) => onUpdateClassPeriod(ca, 'end', e.target.value)}
                            className="h-8 rounded-md border bg-background px-2 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                    <Button type="button" size="sm" onClick={onSaveClassPeriods} className="h-7 text-xs">
                      Lưu cấu hình ca
                    </Button>
                  </div>
                )}
              </div>

              {/* Data Review Section */}
              {imageRows.length > 0 && (
                <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold">
                        Kết quả nhận diện ({imageRows.length} học phần)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Đã xác nhận: <strong className="text-foreground">{confirmedCount}/{imageRows.length}</strong>
                        {invalidCount > 0 && (
                          <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                            • {invalidCount} dòng thiếu thông tin cần bổ sung
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={confirmAllValidRows}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                      Đánh dấu hợp lệ là đã kiểm tra
                    </Button>
                  </div>

                  <div className="max-h-[42vh] space-y-2.5 overflow-y-auto pr-1">
                    {imageRows.map((row, index) => {
                      const rowError = getRowValidationError(row);
                      const isConfirmed = Boolean(row.confirmed && !rowError);
                      return (
                        <div
                          key={`${row.courseCode}-${index}`}
                          className={cn(
                            'rounded-lg border p-3 space-y-2.5 transition-colors',
                            rowError
                              ? 'border-amber-400/70 bg-amber-50/50 dark:bg-amber-950/20'
                              : isConfirmed
                                ? 'border-emerald-500/50 bg-emerald-50/40 dark:bg-emerald-950/20'
                                : 'bg-background'
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-muted-foreground">
                                #{index + 1}
                              </span>
                              {rowError ? (
                                <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300 text-[11px]">
                                  {rowError}
                                </Badge>
                              ) : isConfirmed ? (
                                <Badge className="bg-emerald-600 text-white text-[11px]">
                                  Đã xác nhận
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[11px]">
                                  Dữ liệu OCR (chưa xác nhận)
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {!rowError && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isConfirmed ? 'secondary' : 'outline'}
                                  className="h-7 text-xs"
                                  onClick={() => updateImageRow(index, 'confirmed', !isConfirmed)}
                                >
                                  {isConfirmed ? 'Bỏ xác nhận' : 'Xác nhận dòng này'}
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={() => removeImageRow(index)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            <label className="space-y-1 text-xs sm:col-span-2">
                              <span className="text-muted-foreground">Tên môn học *</span>
                              <input
                                value={row.name}
                                onChange={(e) => updateImageRow(index, 'name', e.target.value)}
                                className={cn(
                                  'h-8 w-full rounded-md border bg-background px-2 text-xs',
                                  !row.name.trim() && 'border-amber-500 ring-1 ring-amber-500/30'
                                )}
                              />
                            </label>
                            <label className="space-y-1 text-xs">
                              <span className="text-muted-foreground">Mã học phần</span>
                              <input
                                value={row.courseCode}
                                onChange={(e) => updateImageRow(index, 'courseCode', e.target.value)}
                                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                              />
                            </label>
                            <label className="space-y-1 text-xs">
                              <span className="text-muted-foreground">Phòng học</span>
                              <input
                                value={row.room}
                                onChange={(e) => updateImageRow(index, 'room', e.target.value)}
                                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                              />
                            </label>
                            <label className="space-y-1 text-xs">
                              <span className="text-muted-foreground">Thứ *</span>
                              <select
                                value={row.dayOfWeek}
                                onChange={(e) => updateImageRow(index, 'dayOfWeek', e.target.value)}
                                className={cn(
                                  'h-8 w-full rounded-md border bg-background px-2 text-xs',
                                  row.dayOfWeek < 0 && 'border-amber-500 ring-1 ring-amber-500/30'
                                )}
                              >
                                {DAY_OF_WEEK_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1 text-xs">
                              <span className="text-muted-foreground">Ca học</span>
                              <select
                                value={row.ca}
                                onChange={(e) => updateImageRow(index, 'ca', e.target.value)}
                                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                              >
                                <option value={0}>Tùy chỉnh</option>
                                {[1, 2, 3, 4].map((c) => (
                                  <option key={c} value={c}>
                                    Ca {c}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1 text-xs">
                              <span className="text-muted-foreground">Giờ bắt đầu *</span>
                              <input
                                type="time"
                                value={row.startTime}
                                onChange={(e) => updateImageRow(index, 'startTime', e.target.value)}
                                className={cn(
                                  'h-8 w-full rounded-md border bg-background px-2 text-xs',
                                  !isValidTime24(row.startTime) && 'border-amber-500 ring-1 ring-amber-500/30'
                                )}
                              />
                            </label>
                            <label className="space-y-1 text-xs">
                              <span className="text-muted-foreground">Giờ kết thúc *</span>
                              <input
                                type="time"
                                value={row.endTime}
                                onChange={(e) => updateImageRow(index, 'endTime', e.target.value)}
                                className={cn(
                                  'h-8 w-full rounded-md border bg-background px-2 text-xs',
                                  !isValidTime24(row.endTime) && 'border-amber-500 ring-1 ring-amber-500/30'
                                )}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    disabled={importBusy || invalidCount > 0}
                    onClick={saveImageRows}
                    className="w-full gap-2"
                  >
                    {importBusy ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Đang lưu vào thời khóa biểu...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Xác nhận &amp; Lưu {imageRows.length} học phần
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {importModalTab === 'excel' && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Nhập từ tệp Excel (.xlsx, .xls) hoặc CSV</p>
                <p className="text-xs text-muted-foreground">
                  Tải lên tệp bảng tính chứa danh sách môn học và lịch học để tạo hàng loạt.
                </p>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                aria-label="Chọn tệp Excel hoặc CSV"
                className="block w-full text-xs sm:text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-secondary-foreground"
                onChange={(event) => {
                  setImportFile(event.target.files?.[0] || null);
                  setImportResult('');
                }}
              />
              <div className="rounded-lg border bg-background p-2.5 text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-semibold text-foreground">Cột bắt buộc:</span> Tên môn học, Mã học phần, Thứ, Giờ bắt đầu, Giờ kết thúc.
                </p>
                <p>
                  <span className="font-semibold text-foreground">Tùy chọn:</span> Phòng học, Từ ngày, Đến ngày, Loại tuần.
                </p>
              </div>
              <Button
                disabled={!importFile || importBusy}
                onClick={handleExcelImport}
                className="w-full"
              >
                {importBusy ? 'Đang nhập...' : 'Xác nhận nhập tệp'}
              </Button>
            </div>
          )}

          {importModalTab === 'manual' && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Thêm buổi học thủ công / Học bù</p>
                <p className="text-xs text-muted-foreground">
                  Thêm nhanh một buổi học mới, buổi học bù hoặc đổi lịch cho môn học đã có.
                </p>
              </div>
              <Button
                type="button"
                className="w-full gap-2"
                onClick={() => {
                  onOpenChange(false);
                  onOpenManual();
                }}
              >
                <CalendarPlus className="h-4 w-4" />
                Mở biểu mẫu thêm buổi học
              </Button>
            </div>
          )}

          {importResult && (
            <p
              role="status"
              className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-2.5 text-xs sm:text-sm whitespace-pre-wrap text-emerald-900 dark:text-emerald-200"
            >
              {importResult}
            </p>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
