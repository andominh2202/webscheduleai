'use client';

import * as React from 'react';
import { ClipboardPaste, ImagePlus, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ExamCourseOption } from '@/components/exams/exam-form-dialog';

type ExamOcrRow = {
  title: string;
  courseName: string;
  courseCode: string;
  type: 'quiz' | 'midterm' | 'final' | 'other';
  date: string;
  startTime: string;
  endTime: string;
  room: string;
  location: string;
  notes: string;
  courseId: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: ExamCourseOption[];
  onSaved: () => void;
};

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const TYPE_LABELS: Record<ExamOcrRow['type'], string> = {
  quiz: 'Kiểm tra',
  midterm: 'Giữa kỳ',
  final: 'Cuối kỳ',
  other: 'Khác',
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('vi').normalize('NFC');
}

function matchCourse(row: Omit<ExamOcrRow, 'courseId'>, courses: ExamCourseOption[]) {
  const code = normalize(row.courseCode);
  if (code) {
    const byCode = courses.find((course) => normalize(course.courseCode || '') === code);
    if (byCode) return byCode.id;
  }
  const name = normalize(row.courseName);
  if (name) {
    const byName = courses.find((course) => normalize(course.name) === name);
    if (byName) return byName.id;
  }
  return '';
}

export function ExamImageImportDialog({ open, onOpenChange, courses, onSaved }: Props) {
  const [file, setFile] = React.useState<File | null>(null);
  const [rows, setRows] = React.useState<ExamOcrRow[]>([]);
  const [recognizing, setRecognizing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setRows([]);
      setRecognizing(false);
      setSaving(false);
    }
  }, [open]);

  const acceptFile = React.useCallback((candidate?: File) => {
    if (!candidate) return;
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      toast.error('Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP.');
      return;
    }
    if (candidate.size > 5 * 1024 * 1024) {
      toast.error('Ảnh vượt quá 5 MB. Hãy chọn ảnh nhẹ hơn.');
      return;
    }
    setFile(candidate);
    setRows([]);
  }, []);

  const recognize = async () => {
    if (!file || recognizing) return;
    setRecognizing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/import/exams/image', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không thể nhận diện lịch thi');
      const recognized = (Array.isArray(data.rows) ? data.rows : []) as Omit<ExamOcrRow, 'courseId'>[];
      setRows(recognized.map((row) => ({
        ...row,
        courseId: matchCourse(row, courses),
      })));
      toast.success(`Đã nhận diện ${recognized.length} dòng lịch thi. Hãy kiểm tra trước khi lưu.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nhận diện ảnh thất bại');
    } finally {
      setRecognizing(false);
    }
  };

  const updateRow = (index: number, key: keyof ExamOcrRow, value: string) => {
    setRows((current) => current.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [key]: value } : row
    ));
  };

  const saveRows = async () => {
    if (!rows.length) return;
    const invalid = rows.findIndex((row) =>
      !row.title.trim() || !row.courseId || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      (row.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime)) ||
      (row.endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime)) ||
      (row.startTime && row.endTime && row.startTime >= row.endTime)
    );
    if (invalid >= 0) {
      toast.error(`Kiểm tra tên kỳ thi, môn học, ngày và giờ ở dòng ${invalid + 1}.`);
      return;
    }

    setSaving(true);
    let saved = 0;
    try {
      for (const row of rows) {
        const response = await fetch('/api/exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: row.title.trim(),
            type: row.type,
            date: row.date,
            startTime: row.startTime || undefined,
            endTime: row.endTime || undefined,
            room: row.room || undefined,
            location: row.location || undefined,
            notes: row.notes || undefined,
            courseId: row.courseId,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || `Không thể lưu dòng ${saved + 1}`);
        }
        saved += 1;
      }
      toast.success(`Đã lưu ${saved} lịch thi.`);
      onSaved();
      onOpenChange(false);
    } catch (error) {
      if (saved > 0) {
        toast.warning(`Đã lưu ${saved}/${rows.length} lịch thi. ${error instanceof Error ? error.message : 'Có lỗi khi lưu'}`);
        onSaved();
      } else {
        toast.error(error instanceof Error ? error.message : 'Lưu lịch thi thất bại');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Nhập lịch thi từ hình ảnh
          </DialogTitle>
          <DialogDescription>
            Tải ảnh, kéo thả hoặc dán ảnh chụp lịch thi bằng Ctrl + V. OCR sẽ đọc nội dung để bạn kiểm tra trước khi lưu.
          </DialogDescription>
        </DialogHeader>

        <div
          role="group"
          aria-label="Khu vực tải ảnh lịch thi"
          tabIndex={0}
          className="space-y-3 rounded-xl border border-dashed border-primary/40 bg-muted/20 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => {
            event.preventDefault();
            acceptFile(Array.from(event.dataTransfer.files).find((item) => ACCEPTED_TYPES.includes(item.type)));
          }}
          onPaste={(event) => {
            const pasted = Array.from(event.clipboardData.files).find((item) => ACCEPTED_TYPES.includes(item.type));
            if (pasted) {
              event.preventDefault();
              acceptFile(pasted);
            }
          }}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <ImagePlus className="h-4 w-4 text-primary" />
            Chọn ảnh hoặc thả ảnh vào đây
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={recognizing || saving}
            onChange={(event) => {
              acceptFile(event.target.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={recognizing || saving}>
              <Upload className="mr-2 h-4 w-4" /> Chọn ảnh
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClipboardPaste className="h-3.5 w-3.5" /> Dán ảnh bằng Ctrl + V khi khu vực này được chọn
            </span>
          </div>
          {file && (
            <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
              <p className="min-w-0 truncate text-xs">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setFile(null); setRows([]); }} aria-label="Bỏ ảnh">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Hỗ trợ PNG, JPG, JPEG, WebP · Tối đa 5 MB</p>
          <Button type="button" onClick={recognize} disabled={!file || recognizing || saving}>
            {recognizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {recognizing ? 'Đang nhận diện...' : 'Nhận diện lịch thi'}
          </Button>
        </div>

        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Kết quả nhận diện ({rows.length})</p>
              <p className="text-xs text-muted-foreground">Chỉnh lại thông tin trước khi lưu</p>
            </div>
            <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
              {rows.map((row, index) => (
                <section key={index} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Lịch thi {index + 1}</p>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>
                      <X className="mr-1 h-3.5 w-3.5" /> Bỏ dòng
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Tên kỳ thi</Label>
                      <Input value={row.title} onChange={(event) => updateRow(index, 'title', event.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Môn học</Label>
                      <Select value={row.courseId} onValueChange={(value) => updateRow(index, 'courseId', value)}>
                        <SelectTrigger><SelectValue placeholder="Chọn môn học" /></SelectTrigger>
                        <SelectContent>
                          {courses.map((course) => (
                            <SelectItem key={course.id} value={course.id}>{course.name}{course.courseCode ? ` · ${course.courseCode}` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!row.courseId && <p className="text-xs text-amber-600">Chưa ghép được môn học, hãy chọn thủ công.</p>}
                      <p className="text-[11px] text-muted-foreground">OCR đọc: {row.courseName || 'Không rõ'} {row.courseCode ? `· ${row.courseCode}` : ''}</p>
                    </div>
                    <div className="space-y-1">
                      <Label>Loại kỳ thi</Label>
                      <Select value={row.type} onValueChange={(value) => updateRow(index, 'type', value as ExamOcrRow['type'])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Ngày thi</Label>
                      <Input type="date" value={row.date} onChange={(event) => updateRow(index, 'date', event.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1"><Label>Bắt đầu</Label><Input type="time" value={row.startTime} onChange={(event) => updateRow(index, 'startTime', event.target.value)} /></div>
                      <div className="space-y-1"><Label>Kết thúc</Label><Input type="time" value={row.endTime} onChange={(event) => updateRow(index, 'endTime', event.target.value)} /></div>
                    </div>
                    <div className="space-y-1"><Label>Phòng thi</Label><Input value={row.room} onChange={(event) => updateRow(index, 'room', event.target.value)} /></div>
                    <div className="space-y-1"><Label>Cơ sở / Địa điểm</Label><Input value={row.location} onChange={(event) => updateRow(index, 'location', event.target.value)} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label>Ghi chú</Label><Input value={row.notes} onChange={(event) => updateRow(index, 'notes', event.target.value)} /></div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Hủy</Button>
          <Button type="button" onClick={saveRows} disabled={!rows.length || saving || recognizing}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu {rows.length} lịch thi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
