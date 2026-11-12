'use client';

import dynamic from 'next/dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  Download,
  HelpCircle,
  Image as ImageIcon,
  List,
  Printer,
  RefreshCw,
  Upload,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { WeekView, type WeekViewSession } from '@/components/schedule/week-view';
import {
  MonthView,
  type MonthViewAssignment,
  type MonthViewExam,
} from '@/components/schedule/month-view';
import { ListView, type ListViewCourse } from '@/components/schedule/list-view';



const SessionDetailPanel = dynamic(() => import('@/components/sessions/session-detail-panel').then((m) => m.SessionDetailPanel), { ssr: false });
const MakeupSessionDialog = dynamic(() => import('@/components/schedule/makeup-session-dialog').then((m) => m.MakeupSessionDialog), { ssr: false });

type ScheduleTab = 'week' | 'month' | 'list';
type ScheduleSession = WeekViewSession;
type ClassPeriod = { start: string; end: string };
const DEFAULT_CLASS_PERIODS: Record<number, ClassPeriod> = {
  1: { start: '07:00', end: '09:25' },
  2: { start: '09:35', end: '12:00' },
  3: { start: '13:00', end: '15:25' },
  4: { start: '15:35', end: '18:00' },
};
const CLASS_PERIODS_STORAGE_KEY = 'webschedule-class-periods-v1';
const validClock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function applyPeriod<T extends { ca: number; startTime: string; endTime: string }>(row: T, periods: Record<number, ClassPeriod>): T {
  const period = periods[row.ca];
  return period ? { ...row, startTime: period.start, endTime: period.end } : row;
}


function exportWeekScheduleToPng(sessions: ScheduleSession[], startDate?: Date) {
  const canvas = document.createElement('canvas');
  const width = 1280;
  const height = 820;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('THỜI KHÓA BIỂU TUẦN - WebSchedule', 36, 42);

  const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];
  const leftMargin = 80;
  const topMargin = 80;
  const gridWidth = width - leftMargin - 30;
  const colWidth = gridWidth / 7;
  const startHour = 6;
  const endHour = 22;
  const hourHeight = (height - topMargin - 30) / (endHour - startHour);

  // Header
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(leftMargin, topMargin - 32, gridWidth, 32);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#1e293b';
  for (let d = 0; d < 7; d++) {
    ctx.fillText(dayLabels[d], leftMargin + d * colWidth + 12, topMargin - 10);
  }

  // Grid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#64748b';

  for (let h = startHour; h <= endHour; h++) {
    const y = topMargin + (h - startHour) * hourHeight;
    ctx.beginPath();
    ctx.moveTo(leftMargin, y);
    ctx.lineTo(leftMargin + gridWidth, y);
    ctx.stroke();
    ctx.fillText(`${String(h).padStart(2, '0')}:00`, 24, y + 4);
  }

  for (let d = 0; d <= 7; d++) {
    const x = leftMargin + d * colWidth;
    ctx.beginPath();
    ctx.moveTo(x, topMargin - 32);
    ctx.lineTo(x, topMargin + (endHour - startHour) * hourHeight);
    ctx.stroke();
  }

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // Draw sessions
  sessions.forEach((s) => {
    if (s.status === 'cancelled') return;
    const d = new Date(s.date);
    if (startDate) {
      const diff = Math.floor((d.getTime() - startDate.getTime()) / 86400000);
      if (diff < -1 || diff > 7) return;
    }
    const dow = d.getDay(); // 0=CN..6=T7
    const colIdx = dow === 0 ? 6 : dow - 1;
    const startM = toMin(s.startTime);
    const endM = toMin(s.endTime);

    const x = leftMargin + colIdx * colWidth + 4;
    const y = topMargin + ((startM - startHour * 60) / 60) * hourHeight;
    const w = colWidth - 8;
    const h = Math.max(24, ((endM - startM) / 60) * hourHeight - 2);

    ctx.fillStyle = s.course?.color || '#3b82f6';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText((s.course?.name || '').slice(0, 20), x + 6, y + 16);
    ctx.font = '11px sans-serif';
    ctx.fillText(`${s.startTime}-${s.endTime}`, x + 6, y + 32);
    if (s.room && h > 44) {
      ctx.fillText(`P.${s.room}`, x + 6, y + 46);
    }
  });

  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `thoikhoabieu-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = url;
  link.click();
}

function VietnameseDateInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const display = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;
  const [draft, setDraft] = useState(() => display(value));
  useEffect(() => { setDraft(display(value)); }, [value]);
  const commit = () => {
    const match = draft.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) { setDraft(display(value)); toast.error('Ngày phải có dạng DD/MM/YYYY'); return; }
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      setDraft(display(value)); toast.error('Ngày không hợp lệ'); return;
    }
    const iso = `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(iso);
    setDraft(display(iso));
  };
  return <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" aria-label="Ngày (ngày/tháng/năm)" className="mt-1 w-full rounded border bg-background p-2" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}

export default function SchedulePage() {
  const [activeTab, setActiveTab] = useState<ScheduleTab>('week');
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [allSessions, setAllSessions] = useState<ScheduleSession[]>([]);
  const [courses, setCourses] = useState<ListViewCourse[]>([]);
  const [assignments, setAssignments] = useState<MonthViewAssignment[]>([]);
  const [exams, setExams] = useState<MonthViewExam[]>([]);

  const [loadingSessions, setLoadingSessions] = useState<boolean>(false);
  const [loadingListSessions, setLoadingListSessions] = useState<boolean>(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [makeupOpen, setMakeupOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string>('');
  const [imageRows, setImageRows] = useState<Array<{ name: string; courseCode: string; credits: number; dayOfWeek: number; ca: number; room: string; startDate: string; endDate: string; firstWeek: number; lastWeek: number; startTime: string; endTime: string }>>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [classPeriods, setClassPeriods] = useState<Record<number, ClassPeriod>>(DEFAULT_CLASS_PERIODS);
  const [periodEditorOpen, setPeriodEditorOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CLASS_PERIODS_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, ClassPeriod>;
      const merged = { ...DEFAULT_CLASS_PERIODS };
      for (const ca of [1, 2, 3, 4]) {
        const period = parsed[String(ca)];
        if (period && validClock(period.start) && validClock(period.end) && period.start < period.end) {
          merged[ca] = period;
        }
      }
      setClassPeriods(merged);
    } catch {
      // Invalid stored preferences: use defaults.
    }
  }, []);

  const updateClassPeriod = (ca: number, field: keyof ClassPeriod, value: string) => {
    setClassPeriods((previous) => ({ ...previous, [ca]: { ...previous[ca], [field]: value } }));
  };
  const saveClassPeriods = () => {
    if (Object.values(classPeriods).some((period) => !validClock(period.start) || !validClock(period.end) || period.start >= period.end)) {
      toast.error('Giờ bắt đầu phải trước giờ kết thúc và đúng định dạng.');
      return;
    }
    window.localStorage.setItem(CLASS_PERIODS_STORAGE_KEY, JSON.stringify(classPeriods));
    setImageRows((previous) => previous.map((row) => applyPeriod(row, classPeriods)));
    setPeriodEditorOpen(false);
    toast.success('Đã lưu giờ học theo ca trên thiết bị này.');
  };

  const currentRangeRef = useRef<{ start: Date; end: Date } | null>(null);

  const requestIdRef = useRef(0);
  const loadSchedule = useCallback(async (startDate?: Date, endDate?: Date, listMode = false) => {
    const requestId = ++requestIdRef.current;
    if (listMode) setLoadingListSessions(true);
    else setLoadingSessions(true);
    try {
      const params = new URLSearchParams();
      if (listMode) params.set('allSessions', 'true');
      else if (startDate && endDate) {
        params.set('startDate', format(startDate, 'yyyy-MM-dd'));
        params.set('endDate', format(endDate, 'yyyy-MM-dd'));
      }
      const res = await fetch(`/api/schedule-overview?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Không thể tải dữ liệu thời khóa biểu');
      const data = await res.json();
      if (requestId !== requestIdRef.current) return;
      setCourses(Array.isArray(data.courses) ? data.courses : []);
      setAssignments(Array.isArray(data.assignments) ? data.assignments : []);
      setExams(Array.isArray(data.exams) ? data.exams : []);
      if (listMode) setAllSessions(Array.isArray(data.sessions) ? data.sessions : []);
      else setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (error) {
      if (requestId === requestIdRef.current) toast.error(error instanceof Error ? error.message : 'Lỗi tải lịch học');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingSessions(false);
        setLoadingListSessions(false);
      }
    }
  }, []);

  const fetchSessionsByRange = useCallback((startDate: Date, endDate: Date) => {
    currentRangeRef.current = { start: startDate, end: endDate };
    return loadSchedule(startDate, endDate);
  }, [loadSchedule]);

  const fetchAllSessions = useCallback(() => loadSchedule(undefined, undefined, true), [loadSchedule]);

  useEffect(() => {
    if (activeTab === 'list') fetchAllSessions();
  }, [activeTab, fetchAllSessions]);

  const handleDateRangeChange = useCallback(
    (startDate: Date, endDate: Date) => {
      fetchSessionsByRange(startDate, endDate);
    },
    [fetchSessionsByRange]
  );

  const handleRefresh = useCallback(() => {
    if (activeTab === 'list') {
      fetchAllSessions();
    } else if (currentRangeRef.current) {
      fetchSessionsByRange(
        currentRangeRef.current.start,
        currentRangeRef.current.end
      );
    }
  }, [activeTab, fetchAllSessions, fetchSessionsByRange]);

  useEffect(() => {
    const handler = () => handleRefresh();
    window.addEventListener('semester-changed', handler);
    return () => window.removeEventListener('semester-changed', handler);
  }, [handleRefresh]);

  const handleSessionReschedule = useCallback(
    async (
      sessionId: string,
      payload: { date: string; startTime: string; endTime: string }
    ) => {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, type: 'moved' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Không thể di chuyển buổi học');
        throw new Error(data?.error);
      }

      if (Array.isArray(data.conflicts) && data.conflicts.length > 0) {
        toast.warning(
          `Đã dời lịch, nhưng bị trùng với "${data.conflicts[0].course?.name || 'môn khác'}"`
        );
      } else {
        toast.success('Đã điều chỉnh lịch học');
      }
      handleRefresh();
    },
    [handleRefresh]
  );

  const handleImageRecognize = async (file: File) => {
    setImageBusy(true);
    setImageRows([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import/image', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể đọc ảnh');
      setImageRows((data.rows || []).map((row: typeof imageRows[number]) => applyPeriod(row, classPeriods)));
      toast.success(`Đã nhận diện ${data.rows?.length || 0} học phần. Hãy kiểm tra trước khi lưu.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nhận diện ảnh thất bại');
    } finally {
      setImageBusy(false);
    }
  };

  const updateImageRow = (index: number, key: string, value: string) => {
    setImageRows((previous) => previous.map((row, i) => i === index ? (key === 'ca' ? applyPeriod({ ...row, ca: Number(value) }, classPeriods) : { ...row, [key]: ['credits', 'dayOfWeek', 'firstWeek', 'lastWeek'].includes(key) ? Number(value) : value }) : row));
  };

  const saveImageRows = async () => {
    if (!imageRows.length || imageRows.some((row) => !row.name || !row.courseCode || !row.startTime || !row.endTime || row.startTime >= row.endTime || !/^\d{4}-\d{2}-\d{2}$/.test(row.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(row.endDate))) {
      toast.error('Kiểm tra tên môn, mã học phần, ngày và giờ học của tất cả dòng.');
      return;
    }
    const headers = ['Tên môn học', 'Mã học phần', 'Số tín chỉ', 'Thứ', 'Giờ bắt đầu', 'Giờ kết thúc', 'Phòng học', 'Từ ngày', 'Đến ngày'];
    const csvEscape = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const lines = [headers.map(csvEscape).join(',')];
    for (const row of imageRows) {
      const base = new Date(row.startDate + 'T12:00:00');
      const start = new Date(base);
      start.setDate(start.getDate() + (Math.max(1, row.firstWeek) - 1) * 7);
      const end = new Date(base);
      end.setDate(end.getDate() + (Math.max(row.firstWeek, row.lastWeek || row.firstWeek) - 1) * 7 + 6);
      const iso = (date: Date) => format(date, 'yyyy-MM-dd');
      lines.push([row.name, row.courseCode, row.credits, row.dayOfWeek, row.startTime, row.endTime, row.room, iso(start), iso(end) < row.endDate ? iso(end) : row.endDate].map(csvEscape).join(','));
    }
    const csvFile = new File([lines.join('\n')], 'lich-tu-anh.csv', { type: 'text/csv' });
    setImportFile(csvFile);
    setImportBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể lưu');
      setImportResult(`Đã lưu ${data.createdCourses} môn, ${data.createdSchedules} lịch. ${(data.warnings || []).join('; ')}`);
      toast.success('Đã lưu thời khóa biểu từ ảnh');
      setImageRows([]);
      handleRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể lưu lịch');
    } finally {
      setImportBusy(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImportBusy(true);
    setImportResult('');
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể nhập lịch');
      const message = `Đã nhập ${data.createdCourses} môn, ${data.createdSchedules} lịch, ${data.createdSessions} buổi học.`;
      setImportResult(message + (data.warnings?.length ? ` Cảnh báo: ${data.warnings.slice(0, 5).join('; ')}` : ''));
      toast.success(message);
      handleRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nhập lịch thất bại');
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thời khóa biểu</h1>
          <p className="text-sm text-muted-foreground">
            Theo dõi lịch học theo tuần, tháng, danh sách và ghi chú từng buổi học
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5">
            <Upload className="w-4 h-4" /> Nhập lịch
          </Button>
          <Button
            size="sm"
            onClick={() => setMakeupOpen(true)}
            className="gap-1.5"
          >
            <CalendarPlus className="w-4 h-4" />
            Học bù / Đổi lịch
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = '/api/export/ics';
            }}
            className="gap-1.5"
          >
            <Download className="w-4 h-4" />
            Xuất .ics
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportWeekScheduleToPng(sessions, currentRangeRef.current?.start)}
            className="gap-1.5"
          >
            <ImageIcon className="w-4 h-4" />
            Xuất ảnh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5"
          >
            <Printer className="w-4 h-4" />
            In / PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGuideOpen(true)}
            className="gap-1.5"
          >
            <HelpCircle className="w-4 h-4" />
            Chỉ dẫn
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </Button>
        </div>
      </div>

      {/* View Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ScheduleTab)}
        className="space-y-4"
      >
        <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-3 print:hidden">
          <TabsTrigger value="week" className="gap-1.5">
            <CalendarRange className="w-4 h-4" />
            <span>Tuần</span>
          </TabsTrigger>
          <TabsTrigger value="month" className="gap-1.5">
            <CalendarDays className="w-4 h-4" />
            <span>Tháng</span>
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="w-4 h-4" />
            <span>Danh sách</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="week" className="mt-0">
          <WeekView
            sessions={sessions}
            loading={loadingSessions}
            onSelectSession={setSelectedSessionId}
            onDateRangeChange={handleDateRangeChange}
            onSessionReschedule={handleSessionReschedule}
          />
        </TabsContent>

        <TabsContent value="month" className="mt-0">
          <MonthView
            sessions={sessions}
            assignments={assignments}
            exams={exams}
            loading={loadingSessions}
            onSelectSession={setSelectedSessionId}
            onDateRangeChange={handleDateRangeChange}
          />
        </TabsContent>

        <TabsContent value="list" className="mt-0">
          <ListView
            sessions={allSessions}
            courses={courses}
            loading={loadingListSessions}
            onSelectSession={setSelectedSessionId}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nhập thời khóa biểu</DialogTitle>
            <DialogDescription>Nhập Excel (.xlsx, .xls) hoặc CSV từ Google Sheets (Tệp → Tải xuống → CSV). Kiểm tra dữ liệu trước khi nhập để tránh trùng lịch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-semibold">Nhập lịch từ ảnh (PNG/JPEG/WebP)</p>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm" disabled={imageBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImageRecognize(file); }} />
              <div className="space-y-2 rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">Giờ học theo ca (có thể tùy chỉnh theo trường)</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPeriodEditorOpen((value) => !value)}>{periodEditorOpen ? 'Đóng' : 'Chỉnh giờ ca'}</Button>
                </div>
                <p className="text-xs text-muted-foreground">{[1, 2, 3, 4].map((ca) => `Ca ${ca}: ${classPeriods[ca].start}–${classPeriods[ca].end}`).join(' · ')}</p>
                {periodEditorOpen && <div className="space-y-2">
                  {[1, 2, 3, 4].map((ca) => <div key={ca} className="grid grid-cols-[45px_1fr_1fr] items-center gap-2">
                    <span className="text-xs">Ca {ca}</span>
                    <input aria-label={`Ca ${ca} bắt đầu`} type="time" className="w-full rounded border bg-background p-1 text-sm" value={classPeriods[ca].start} onChange={(event) => updateClassPeriod(ca, 'start', event.target.value)} />
                    <input aria-label={`Ca ${ca} kết thúc`} type="time" className="w-full rounded border bg-background p-1 text-sm" value={classPeriods[ca].end} onChange={(event) => updateClassPeriod(ca, 'end', event.target.value)} />
                  </div>)}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={saveClassPeriods}>Lưu giờ học</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setClassPeriods(DEFAULT_CLASS_PERIODS)}>Khôi phục mặc định</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Cấu hình lưu trên trình duyệt này. Sau khi lưu, giờ các dòng đang xem sẽ cập nhật theo ca.</p>
                </div>}
              </div>
              {imageBusy && <p className="text-xs">Đang nhận diện ảnh...</p>}
              {imageRows.length > 0 && <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                <p className="text-xs text-muted-foreground">Giờ được tự điền theo ca. Có thể chỉnh riêng từng dòng trước khi lưu.</p>
                {imageRows.map((row, index) => <div key={index} className="space-y-2 rounded-md border p-2">
                  <p className="text-sm font-semibold">Học phần {index + 1}</p>
                  {(['name','courseCode','room','startDate','endDate','startTime','endTime'] as const).map((key) => <label key={key} className="block text-xs">
                    {({name:'Tên môn',courseCode:'Mã học phần',room:'Phòng',startDate:'Ngày bắt đầu',endDate:'Ngày kết thúc',startTime:'Giờ bắt đầu (HH:mm)',endTime:'Giờ kết thúc (HH:mm)'})[key]}
                    {key.includes('Date') ? <VietnameseDateInput value={row[key]} onChange={(value) => updateImageRow(index, key, value)} /> : <input className="mt-1 w-full rounded border bg-background p-2" type="text" placeholder={key.includes('Time') ? 'HH:mm (24 giờ)' : undefined} value={row[key]} onChange={(event) => updateImageRow(index, key, event.target.value)} />}
                  </label>)}
                  <div className="grid grid-cols-4 gap-2">
                    {(['dayOfWeek','ca','firstWeek','lastWeek'] as const).map((key) => <label key={key} className="text-xs">{({dayOfWeek:'Thứ (1=T2)',ca:'Ca',firstWeek:'Tuần đầu',lastWeek:'Tuần cuối'})[key]}<input type="number" className="mt-1 w-full rounded border bg-background p-1" value={row[key]} onChange={(event) => updateImageRow(index, key, event.target.value)} /></label>)}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setImageRows((previous) => previous.filter((_, i) => i !== index))}>Bỏ dòng này</Button>
                </div>)}
                <Button disabled={importBusy} onClick={saveImageRows} className="w-full">{importBusy ? 'Đang lưu...' : 'Xác nhận lưu lịch từ ảnh'}</Button>
              </div>}
            </div>
            <input type="file" accept=".xlsx,.xls,.csv" className="block w-full text-sm" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportResult(''); }} />
            <p className="text-xs text-muted-foreground">Cột yêu cầu: Tên môn học, Mã học phần, Thứ, Giờ bắt đầu, Giờ kết thúc. Có thể thêm Phòng học, Từ ngày, Đến ngày, Loại tuần.</p>

            <Button disabled={!importFile || importBusy} onClick={handleImport} className="w-full">{importBusy ? 'Đang nhập...' : 'Xác nhận nhập lịch'}</Button>
            {importResult && <p role="status" className="text-sm whitespace-pre-wrap">{importResult}</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Makeup Session Dialog */}
      <MakeupSessionDialog
        open={makeupOpen}
        onOpenChange={setMakeupOpen}
        courses={courses}
        onSaved={handleRefresh}
      />

      {/* Quick Schedule Guide Dialog */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chỉ dẫn sử dụng Thời khóa biểu</DialogTitle>
            <DialogDescription>
              Quy trình nhanh để thiết lập lịch học và đồng bộ lên iPhone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="font-semibold">1. Tạo Môn học & Lịch lặp hàng tuần</p>
              <p className="text-xs text-muted-foreground">
                Vào mục <strong>Môn học → Thêm môn học</strong> để nhập tên môn, hình thức thi, có bài tập lớn hay không, cách chia điểm % và các buổi học trong tuần (hỗ trợ tuần chẵn / lẻ).
              </p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="font-semibold">2. Ghi chú riêng từng buổi & Đổi lịch nhanh</p>
              <p className="text-xs text-muted-foreground">
                Nhấn vào một buổi học trên lịch để mở bảng ghi chú Markdown, checklist, tài liệu và đổi phòng. Kéo thả khối màu trên lịch Tuần để dời ngày hoặc đổi giờ học.
              </p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="font-semibold">3. Hiện lịch thành Widget trên iPhone</p>
              <p className="text-xs text-muted-foreground">
                Vào <strong>Cài đặt → Widget lịch học trên iPhone (iOS)</strong> để đăng ký lịch trực tiếp vào Apple Calendar Widget hoặc lấy code Scriptable tạo Widget ngoài màn hình chính.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Session Detail Slide-over Panel */}
      <SessionDetailPanel
        sessionId={selectedSessionId}
        open={Boolean(selectedSessionId)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedSessionId(null);
        }}
        onClose={() => setSelectedSessionId(null)}
        onUpdated={handleRefresh}
      />
    </div>
  );
}
