'use client';

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
import { MakeupSessionDialog } from '@/components/schedule/makeup-session-dialog';
import { SessionDetailPanel } from '@/components/sessions/session-detail-panel';

type ScheduleTab = 'week' | 'month' | 'list';
type ScheduleSession = WeekViewSession;

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

  const currentRangeRef = useRef<{ start: Date; end: Date } | null>(null);

  const fetchOverlayData = useCallback(async () => {
    try {
      const [coursesRes, assignmentsRes, examsRes] = await Promise.all([
        fetch('/api/courses', { cache: 'no-store' }),
        fetch('/api/assignments', { cache: 'no-store' }),
        fetch('/api/exams', { cache: 'no-store' }),
      ]);

      if (coursesRes.ok) {
        const data = await coursesRes.json();
        if (Array.isArray(data)) setCourses(data);
      }
      if (assignmentsRes.ok) {
        const data = await assignmentsRes.json();
        if (Array.isArray(data)) setAssignments(data);
      }
      if (examsRes.ok) {
        const data = await examsRes.json();
        if (Array.isArray(data)) setExams(data);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  const fetchSessionsByRange = useCallback(async (startDate: Date, endDate: Date) => {
    currentRangeRef.current = { start: startDate, end: endDate };
    setLoadingSessions(true);
    try {
      const startParam = format(startDate, 'yyyy-MM-dd');
      const endParam = format(endDate, 'yyyy-MM-dd');
      const res = await fetch(
        `/api/sessions?startDate=${encodeURIComponent(startParam)}&endDate=${encodeURIComponent(endParam)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        throw new Error('Không thể tải lịch học');
      }
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải lịch học'
      );
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const fetchAllSessions = useCallback(async () => {
    setLoadingListSessions(true);
    try {
      const res = await fetch('/api/sessions', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Không thể tải danh sách buổi học');
      }
      const data = await res.json();
      setAllSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Đã xảy ra lỗi khi tải danh sách buổi học'
      );
    } finally {
      setLoadingListSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchOverlayData();
  }, [fetchOverlayData]);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchAllSessions();
    }
  }, [activeTab, fetchAllSessions]);

  const handleDateRangeChange = useCallback(
    (startDate: Date, endDate: Date) => {
      fetchSessionsByRange(startDate, endDate);
    },
    [fetchSessionsByRange]
  );

  const handleRefresh = useCallback(() => {
    fetchOverlayData();
    if (activeTab === 'list') {
      fetchAllSessions();
    } else if (currentRangeRef.current) {
      fetchSessionsByRange(
        currentRangeRef.current.start,
        currentRangeRef.current.end
      );
    }
  }, [activeTab, fetchAllSessions, fetchOverlayData, fetchSessionsByRange]);

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
            <input type="file" accept=".xlsx,.xls,.csv" className="block w-full text-sm" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportResult(''); }} />
            <p className="text-xs text-muted-foreground">Cột yêu cầu: Tên môn học, Mã học phần, Thứ, Giờ bắt đầu, Giờ kết thúc. Có thể thêm Phòng học, Từ ngày, Đến ngày, Loại tuần.</p>
            <p className="text-xs text-muted-foreground">Nhập trực tiếp từ ảnh đang được phát triển; hiện tại chưa tự nhận diện ảnh để tránh lưu lịch sai.</p>
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
