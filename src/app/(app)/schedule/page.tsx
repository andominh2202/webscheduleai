'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, getISOWeek } from 'date-fns';
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChevronDown,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  Filter,
  FilterX,
  HelpCircle,
  Image as ImageIcon,
  List,
  Printer,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { dedupeRequest, getCached, invalidateCache, setCached } from '@/lib/client-cache';
import {
  formatIsoToVnDate,
  isValidDateRange,
  isValidIsoDate,
  isValidTime24,
  isValidTimeRange,
  parseDateToIso,
} from '@/lib/date-time-validation';
import { cn, SESSION_STATUS_LABELS } from '@/lib/utils';
import { WeekViewSkeleton, type WeekViewSession } from '@/components/schedule/week-view';
import {
  MonthViewSkeleton,
  type MonthViewAssignment,
  type MonthViewExam,
} from '@/components/schedule/month-view';
import { ListViewSkeleton, type ListViewCourse } from '@/components/schedule/list-view';

const WeekView = dynamic(
  () => import('@/components/schedule/week-view').then((m) => m.WeekView),
  { ssr: false, loading: () => <WeekViewSkeleton /> }
);

const MonthView = dynamic(
  () => import('@/components/schedule/month-view').then((m) => m.MonthView),
  { ssr: false, loading: () => <MonthViewSkeleton /> }
);

const ListView = dynamic(
  () => import('@/components/schedule/list-view').then((m) => m.ListView),
  { ssr: false, loading: () => <ListViewSkeleton /> }
);

const SessionDetailPanel = dynamic(
  () => import('@/components/sessions/session-detail-panel').then((m) => m.SessionDetailPanel),
  { ssr: false }
);

const MakeupSessionDialog = dynamic(
  () => import('@/components/schedule/makeup-session-dialog').then((m) => m.MakeupSessionDialog),
  { ssr: false }
);

type ScheduleTab = 'week' | 'month' | 'list';
type ScheduleSession = WeekViewSession;
type ClassPeriod = { start: string; end: string };

interface ScheduleOverviewResponse {
  courses?: ListViewCourse[];
  assignments?: MonthViewAssignment[];
  exams?: MonthViewExam[];
  sessions?: ScheduleSession[];
}

interface RecognizedImageRow {
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
}

const DEFAULT_CLASS_PERIODS: Record<number, ClassPeriod> = {
  1: { start: '07:00', end: '09:25' },
  2: { start: '09:35', end: '12:00' },
  3: { start: '13:00', end: '15:25' },
  4: { start: '15:35', end: '18:00' },
};
const CLASS_PERIODS_STORAGE_KEY = 'webschedule-class-periods-v1';

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

function applyPeriod<T extends { ca: number; startTime: string; endTime: string }>(
  row: T,
  periods: Record<number, ClassPeriod>
): T {
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
  ctx.fillText('THỜI KHÓA BIỂU TUẦN - WebScheduleAI', 36, 42);

  const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];
  const leftMargin = 80;
  const topMargin = 80;
  const gridWidth = width - leftMargin - 30;
  const colWidth = gridWidth / 7;
  const startHour = 6;
  const endHour = 22;
  const hourHeight = (height - topMargin - 30) / (endHour - startHour);

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(leftMargin, topMargin - 32, gridWidth, 32);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#1e293b';
  for (let d = 0; d < 7; d++) {
    ctx.fillText(dayLabels[d], leftMargin + d * colWidth + 12, topMargin - 10);
  }

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

  sessions.forEach((s) => {
    if (s.status === 'cancelled') return;
    const d = new Date(s.date);
    if (startDate) {
      const diff = Math.floor((d.getTime() - startDate.getTime()) / 86400000);
      if (diff < -1 || diff > 7) return;
    }
    const dow = d.getDay();
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

function VietnameseDateInput({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState(() => formatIsoToVnDate(value));
  useEffect(() => {
    setDraft(formatIsoToVnDate(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onChange('');
      setDraft('');
      return;
    }
    const iso = parseDateToIso(trimmed);
    if (!iso) {
      setDraft(formatIsoToVnDate(value));
      toast.error('Ngày không hợp lệ. Vui lòng nhập theo định dạng dd/MM/yyyy.');
      return;
    }
    onChange(iso);
    setDraft(formatIsoToVnDate(iso));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="dd/MM/yyyy"
      aria-label="Ngày (dd/MM/yyyy)"
      className={cn(
        'mt-1 w-full rounded-md border bg-background p-2 text-sm',
        invalid && 'border-amber-500 focus-visible:ring-amber-500'
      )}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export default function SchedulePage() {
  const [activeTab, setActiveTab] = useState<ScheduleTab>('week');
  const [visitedTabs, setVisitedTabs] = useState<Record<ScheduleTab, boolean>>({
    week: true,
    month: false,
    list: false,
  });

  // Unified filters shared across Week, Month & List views
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [allSessions, setAllSessions] = useState<ScheduleSession[]>([]);
  const [courses, setCourses] = useState<ListViewCourse[]>([]);
  const [assignments, setAssignments] = useState<MonthViewAssignment[]>([]);
  const [exams, setExams] = useState<MonthViewExam[]>([]);

  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  const [loadingListSessions, setLoadingListSessions] = useState<boolean>(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [makeupOpen, setMakeupOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importModalTab, setImportModalTab] = useState<'ocr' | 'excel' | 'manual'>('ocr');
  const [importBusy, setImportBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string>('');
  const [imageRows, setImageRows] = useState<RecognizedImageRow[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [classPeriods, setClassPeriods] = useState<Record<number, ClassPeriod>>(
    DEFAULT_CLASS_PERIODS
  );
  const [periodEditorOpen, setPeriodEditorOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CLASS_PERIODS_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, ClassPeriod>;
      const merged = { ...DEFAULT_CLASS_PERIODS };
      for (const ca of [1, 2, 3, 4]) {
        const period = parsed[String(ca)];
        if (
          period &&
          isValidTime24(period.start) &&
          isValidTime24(period.end) &&
          isValidTimeRange(period.start, period.end)
        ) {
          merged[ca] = period;
        }
      }
      setClassPeriods(merged);
    } catch {
      // Invalid stored preferences: use defaults.
    }
  }, []);

  const handleTabChange = useCallback((value: string) => {
    const nextTab = value as ScheduleTab;
    setActiveTab(nextTab);
    setVisitedTabs((prev) => (prev[nextTab] ? prev : { ...prev, [nextTab]: true }));
  }, []);

  const updateClassPeriod = (ca: number, field: keyof ClassPeriod, value: string) => {
    setClassPeriods((previous) => ({
      ...previous,
      [ca]: { ...previous[ca], [field]: value },
    }));
  };

  const saveClassPeriods = () => {
    if (
      Object.values(classPeriods).some(
        (period) =>
          !isValidTime24(period.start) ||
          !isValidTime24(period.end) ||
          !isValidTimeRange(period.start, period.end)
      )
    ) {
      toast.error('Giờ bắt đầu phải trước giờ kết thúc và đúng định dạng HH:mm.');
      return;
    }
    window.localStorage.setItem(CLASS_PERIODS_STORAGE_KEY, JSON.stringify(classPeriods));
    setImageRows((previous) => previous.map((row) => applyPeriod(row, classPeriods)));
    setPeriodEditorOpen(false);
    toast.success('Đã lưu giờ học theo ca trên thiết bị này.');
  };

  const currentRangeRef = useRef<{ start: Date; end: Date } | null>(null);
  const requestIdRef = useRef(0);

  const applySchedulePayload = useCallback(
    (payload: ScheduleOverviewResponse, listMode: boolean) => {
      setCourses(Array.isArray(payload.courses) ? payload.courses : []);
      setAssignments(Array.isArray(payload.assignments) ? payload.assignments : []);
      setExams(Array.isArray(payload.exams) ? payload.exams : []);
      if (listMode) {
        setAllSessions(Array.isArray(payload.sessions) ? payload.sessions : []);
      } else {
        setSessions(Array.isArray(payload.sessions) ? payload.sessions : []);
      }
    },
    []
  );

  const loadSchedule = useCallback(
    async (startDate?: Date, endDate?: Date, listMode = false) => {
      const requestId = ++requestIdRef.current;

      const params = new URLSearchParams();
      if (listMode) params.set('allSessions', 'true');
      else if (startDate && endDate) {
        params.set('startDate', format(startDate, 'yyyy-MM-dd'));
        params.set('endDate', format(endDate, 'yyyy-MM-dd'));
      }
      const cacheKey = `/api/schedule-overview?${params.toString()}`;
      const cached = getCached<ScheduleOverviewResponse>(cacheKey);
      if (cached) {
        applySchedulePayload(cached, listMode);
        if (listMode) setLoadingListSessions(false);
        else setLoadingSessions(false);
      } else {
        if (listMode) setLoadingListSessions(true);
        else setLoadingSessions(true);
      }

      try {
        const data = await dedupeRequest<ScheduleOverviewResponse>(cacheKey, async () => {
          const res = await fetch(cacheKey);
          if (!res.ok) throw new Error('Không thể tải dữ liệu thời khóa biểu');
          return (await res.json()) as ScheduleOverviewResponse;
        });
        if (requestId !== requestIdRef.current) return;
        setCached(cacheKey, data);
        applySchedulePayload(data, listMode);
      } catch (error: unknown) {
        if (
          (error as Error)?.name !== 'AbortError' &&
          requestId === requestIdRef.current
        ) {
          toast.error(error instanceof Error ? error.message : 'Lỗi tải lịch học');
        }
      } finally {
        if (requestId === requestIdRef.current) {
          if (listMode) setLoadingListSessions(false);
          else setLoadingSessions(false);
        }
      }
    },
    [applySchedulePayload]
  );

  const fetchSessionsByRange = useCallback(
    (startDate: Date, endDate: Date) => {
      currentRangeRef.current = { start: startDate, end: endDate };
      return loadSchedule(startDate, endDate, false);
    },
    [loadSchedule]
  );

  const fetchAllSessions = useCallback(
    () => loadSchedule(undefined, undefined, true),
    [loadSchedule]
  );

  useEffect(() => {
    if (activeTab === 'list') {
      void fetchAllSessions();
    }
  }, [activeTab, fetchAllSessions]);

  const handleDateRangeChange = useCallback(
    (startDate: Date, endDate: Date) => {
      void fetchSessionsByRange(startDate, endDate);
    },
    [fetchSessionsByRange]
  );

  const handleRefresh = useCallback(() => {
    invalidateCache('/api/schedule-overview');
    invalidateCache('/api/dashboard');
    invalidateCache('session-detail:');
    if (activeTab === 'list') {
      void fetchAllSessions();
    } else if (currentRangeRef.current) {
      void fetchSessionsByRange(
        currentRangeRef.current.start,
        currentRangeRef.current.end
      );
    }
  }, [activeTab, fetchAllSessions, fetchSessionsByRange]);

  useEffect(() => {
    const handler = () => handleRefresh();
    window.addEventListener('semester-changed', handler);
    return () => {
      window.removeEventListener('semester-changed', handler);
    };
  }, [handleRefresh]);

  // Filtered datasets for Week & Month views (memoized for instant filtering)
  const filteredRangeSessions = useMemo(() => {
    if (selectedCourseId === 'all' && selectedStatus === 'all') return sessions;
    return sessions.filter((s) => {
      if (selectedCourseId !== 'all' && s.courseId !== selectedCourseId) {
        return false;
      }
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'makeup') {
          return s.type === 'makeup' || s.type === 'moved';
        }
        return s.status === selectedStatus;
      }
      return true;
    });
  }, [sessions, selectedCourseId, selectedStatus]);

  const filteredAssignments = useMemo(() => {
    if (selectedCourseId === 'all') return assignments;
    return assignments.filter((a) => a.courseId === selectedCourseId);
  }, [assignments, selectedCourseId]);

  const filteredExams = useMemo(() => {
    if (selectedCourseId === 'all') return exams;
    return exams.filter((e) => e.courseId === selectedCourseId);
  }, [exams, selectedCourseId]);

  const activeFilterCount =
    (selectedCourseId !== 'all' ? 1 : 0) + (selectedStatus !== 'all' ? 1 : 0);

  const clearSharedFilters = useCallback(() => {
    setSelectedCourseId('all');
    setSelectedStatus('all');
  }, []);

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
        const conflictName = data.conflicts[0].course?.name || 'môn khác';
        toast.warning(`Đã dời lịch, nhưng bị trùng với ${conflictName}`);
      } else {
        toast.success('Đã điều chỉnh lịch học');
      }
      handleRefresh();
    },
    [handleRefresh]
  );

  const clearImageSelection = useCallback(() => {
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageFileName('');
    setImageRows([]);
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
        toast.error('Vui lòng chọn hoặc dán tệp ảnh (PNG, JPEG, WebP).');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Ảnh vượt quá 5 MB. Hãy chọn ảnh dung lượng nhỏ hơn.');
        return;
      }
      setImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setImageFileName(file.name || 'anh-dan-tu-clipboard.png');
      setImageBusy(true);
      setImageRows([]);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mode', 'schedule');
        const res = await fetch('/api/import/image', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không thể đọc ảnh');
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
            return {
              ...withPeriod,
              firstWeek:
                withPeriod.lastWeek > 0 && withPeriod.firstWeek > 0
                  ? withPeriod.firstWeek
                  : startWeek,
              lastWeek:
                withPeriod.lastWeek > 0 ? withPeriod.lastWeek : endWeek,
            };
          }
        );
        setImageRows(nextRows);
        const missingCount = nextRows.filter(
          (r) => r.dayOfWeek < 0 || !isValidTime24(r.startTime) || !isValidTime24(r.endTime)
        ).length;
        if (missingCount > 0) {
          toast.warning(
            `Đã nhận diện ${nextRows.length} học phần, trong đó ${missingCount} dòng thiếu Thứ hoặc Giờ học. Hãy bổ sung bên dưới trước khi lưu.`
          );
        } else {
          toast.success(
            `Đã nhận diện ${nextRows.length} học phần. Hãy kiểm tra trước khi lưu.`
          );
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Nhận diện ảnh thất bại');
      } finally {
        setImageBusy(false);
      }
    },
    [classPeriods]
  );

  useEffect(() => {
    if (!importOpen) return;
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
  }, [importOpen, imageBusy, handleImageRecognize]);

  const updateImageRow = (index: number, key: string, value: string) => {
    setImageRows((previous) =>
      previous.map((row, i) => {
        if (i !== index) return row;
        if (key === 'ca') {
          const next = applyPeriod({ ...row, ca: Number(value) }, classPeriods);
          return {
            ...next,
            needsSchedule:
              next.dayOfWeek < 0 ||
              !isValidTime24(next.startTime) ||
              !isValidTime24(next.endTime),
          };
        }
        const updated = {
          ...row,
          [key]: ['credits', 'dayOfWeek', 'firstWeek', 'lastWeek'].includes(key)
            ? Number(value)
            : value,
        };
        if (
          (key === 'startDate' || key === 'endDate' || ((key === 'dayOfWeek' || key === 'ca') && updated.lastWeek <= 0)) &&
          isValidIsoDate(updated.startDate) &&
          isValidIsoDate(updated.endDate) &&
          isValidDateRange(updated.startDate, updated.endDate)
        ) {
          const startWeek = getISOWeek(new Date(updated.startDate + 'T12:00:00'));
          const endWeek = getISOWeek(new Date(updated.endDate + 'T12:00:00'));
          updated.firstWeek = startWeek;
          updated.lastWeek = Math.max(startWeek, endWeek);
        }
        return {
          ...updated,
          needsSchedule:
            updated.dayOfWeek < 0 ||
            !isValidTime24(updated.startTime) ||
            !isValidTime24(updated.endTime),
        };
      })
    );
  };

  const getRowValidationError = (row: RecognizedImageRow): string | null => {
    if (!row.name.trim()) return 'Thiếu tên môn học';
    if (!row.courseCode.trim()) return 'Thiếu mã học phần';
    if (!Number.isInteger(row.dayOfWeek) || row.dayOfWeek < 0 || row.dayOfWeek > 6) {
      return 'Chưa chọn Thứ học';
    }
    if (!isValidTime24(row.startTime) || !isValidTime24(row.endTime)) {
      return 'Giờ học phải đúng định dạng HH:mm';
    }
    if (!isValidTimeRange(row.startTime, row.endTime)) {
      return 'Giờ kết thúc phải sau giờ bắt đầu';
    }
    if (!isValidIsoDate(row.startDate) || !isValidIsoDate(row.endDate)) {
      return 'Ngày bắt đầu / kết thúc phải đúng dd/MM/yyyy';
    }
    if (!isValidDateRange(row.startDate, row.endDate)) {
      return 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu';
    }
    return null;
  };

  const saveImageRows = async () => {
    if (!imageRows.length) return;
    for (let i = 0; i < imageRows.length; i++) {
      const err = getRowValidationError(imageRows[i]);
      if (err) {
        toast.error(`Học phần ${i + 1}: ${err}.`);
        return;
      }
    }
    const headers = [
      'Tên môn học',
      'Mã học phần',
      'Số tín chỉ',
      'Thứ',
      'Giờ bắt đầu',
      'Giờ kết thúc',
      'Phòng học',
      'Từ ngày',
      'Đến ngày',
    ];
    const csvEscape = (value: unknown) =>
      '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const lines = [headers.map(csvEscape).join(',')];
    for (const row of imageRows) {
      const base = new Date(row.startDate + 'T12:00:00');
      const baseWeek = getISOWeek(base);
      const startOffset = row.firstWeek > 0 ? row.firstWeek - baseWeek : 0;
      const start = new Date(base);
      start.setDate(start.getDate() + startOffset * 7);
      const end = new Date(base);
      const endOffset =
        row.lastWeek > 0 ? Math.max(startOffset, row.lastWeek - baseWeek) : startOffset;
      end.setDate(end.getDate() + endOffset * 7 + 6);
      const iso = (date: Date) => format(date, 'yyyy-MM-dd');
      const endIso = row.lastWeek > 0 ? (iso(end) < row.endDate ? iso(end) : row.endDate) : row.endDate;
      lines.push(
        [
          row.name,
          row.courseCode,
          row.credits,
          row.dayOfWeek,
          row.startTime,
          row.endTime,
          row.room,
          iso(start),
          endIso,
        ]
          .map(csvEscape)
          .join(',')
      );
    }
    const csvFile = new File([lines.join('\n')], 'lich-tu-anh.csv', {
      type: 'text/csv',
    });
    setImportFile(csvFile);
    setImportBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể lưu');
      setImportResult(
        `Đã lưu ${data.createdCourses} môn, ${data.createdSchedules} lịch. ${(data.warnings || []).join('; ')}`
      );
      toast.success('Đã lưu thời khóa biểu từ ảnh');
      clearImageSelection();
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
      setImportResult(
        message +
          (data.warnings?.length
            ? ` Cảnh báo: ${data.warnings.slice(0, 5).join('; ')}`
            : '')
      );
      toast.success(message);
      handleRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nhập lịch thất bại');
    } finally {
      setImportBusy(false);
    }
  };

  const isRefreshing = loadingSessions || loadingListSessions;

  return (
    <div className="space-y-4">
      {/* Page Header + Action Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">Thời khóa biểu</h1>
            {courses.length > 0 && (
              <Badge variant="secondary" className="text-xs font-medium">
                {courses.length} học phần
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Quản lý lịch học theo tuần, tháng, danh sách và ghi chép riêng cho từng buổi học
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            size="sm"
            onClick={() => setMakeupOpen(true)}
            className="gap-1.5 shadow-sm"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>Học bù / Đổi lịch</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="gap-1.5"
          >
            <Upload className="w-4 h-4" />
            <span>Nhập lịch</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="w-4 h-4" />
                <span>Xuất & In</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  window.location.href = '/api/export/excel';
                }}
                className="gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Xuất file Excel (.xlsx)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  window.location.href = '/api/export/ics';
                }}
                className="gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-blue-600" />
                <span>Xuất iCalendar (.ics)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  exportWeekScheduleToPng(
                    filteredRangeSessions,
                    currentRangeRef.current?.start
                  )
                }
                className="gap-2 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-purple-600" />
                <span>Xuất ảnh TKB (.png)</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => window.print()}
                className="gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4 text-muted-foreground" />
                <span>In / Xuất PDF</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setGuideOpen(true)}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Chỉ dẫn</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Làm mới thời khóa biểu"
            aria-label="Làm mới thời khóa biểu"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Unified View Switcher + Course/Status Filter Bar */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 rounded-xl border bg-card/70 p-2 shadow-sm print:hidden">
          <TabsList className="grid w-full md:w-auto grid-cols-3">
            <TabsTrigger value="week" className="gap-1.5 text-xs sm:text-sm">
              <CalendarRange className="w-4 h-4" />
              <span>Tuần</span>
            </TabsTrigger>
            <TabsTrigger value="month" className="gap-1.5 text-xs sm:text-sm">
              <CalendarDays className="w-4 h-4" />
              <span>Tháng</span>
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5 text-xs sm:text-sm">
              <List className="w-4 h-4" />
              <span>Danh sách</span>
            </TabsTrigger>
          </TabsList>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <div className="hidden lg:inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground pl-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Lọc:</span>
            </div>

            <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
              <SelectTrigger
                aria-label="Lọc theo môn học"
                className="h-9 w-full sm:w-[200px] bg-background text-xs sm:text-sm"
              >
                <SelectValue placeholder="Tất cả môn học" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả môn học</SelectItem>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: course.color || '#3b82f6' }}
                      />
                      <span className="truncate">{course.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger
                aria-label="Lọc theo trạng thái buổi học"
                className="h-9 w-full sm:w-[165px] bg-background text-xs sm:text-sm"
              >
                <SelectValue placeholder="Tất cả trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="upcoming">
                  {SESSION_STATUS_LABELS.upcoming}
                </SelectItem>
                <SelectItem value="completed">
                  {SESSION_STATUS_LABELS.completed}
                </SelectItem>
                <SelectItem value="cancelled">
                  {SESSION_STATUS_LABELS.cancelled}
                </SelectItem>
                <SelectItem value="makeup">Học bù / Đổi lịch</SelectItem>
              </SelectContent>
            </Select>

            {activeFilterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSharedFilters}
                className="col-span-2 sm:col-span-1 h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>Xóa lọc ({activeFilterCount})</span>
              </Button>
            )}
          </div>
        </div>

        {/* Lazy-mounted Tab Panels (kept alive once visited for 0ms switching) */}
        {visitedTabs.week && (
          <div className={activeTab === 'week' ? 'block' : 'hidden'}>
            <WeekView
              sessions={filteredRangeSessions}
              loading={loadingSessions}
              active={activeTab === 'week'}
              hasActiveFilter={activeFilterCount > 0}
              onClearFilter={clearSharedFilters}
              onOpenMakeup={() => setMakeupOpen(true)}
              onOpenImport={() => setImportOpen(true)}
              onSelectSession={setSelectedSessionId}
              onDateRangeChange={handleDateRangeChange}
              onSessionReschedule={handleSessionReschedule}
            />
          </div>
        )}

        {visitedTabs.month && (
          <div className={activeTab === 'month' ? 'block' : 'hidden'}>
            <MonthView
              sessions={filteredRangeSessions}
              assignments={filteredAssignments}
              exams={filteredExams}
              loading={loadingSessions}
              active={activeTab === 'month'}
              hasActiveFilter={activeFilterCount > 0}
              onClearFilter={clearSharedFilters}
              onSelectSession={setSelectedSessionId}
              onDateRangeChange={handleDateRangeChange}
            />
          </div>
        )}

        {visitedTabs.list && (
          <div className={activeTab === 'list' ? 'block' : 'hidden'}>
            <ListView
              sessions={allSessions}
              courses={courses}
              loading={loadingListSessions}
              onSelectSession={setSelectedSessionId}
              selectedCourseId={selectedCourseId}
              onCourseChange={setSelectedCourseId}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              hideCourseStatusFilters={true}
            />
          </div>
        )}
      </Tabs>

      {/* Import Schedule Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent
          className={cn(
            'max-h-[92vh] overflow-y-auto transition-[max-width] duration-200',
            imageRows.length > 0 ? 'w-[95vw] max-w-5xl' : 'max-w-lg'
          )}
        >
          <DialogHeader>
            <DialogTitle>Tạo &amp; Nhập thời khóa biểu</DialogTitle>
            <DialogDescription>
              Chọn phương thức phù hợp: nhận diện ảnh TKB (OCR), nhập tệp Excel/CSV hoặc thêm buổi học thủ công.
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
              <div className="space-y-3">
                {/* Step indicator */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 border">
                  <span className={cn('font-semibold', imageRows.length === 0 ? 'text-primary' : 'text-emerald-600 dark:text-emerald-400')}>
                    1. Tải ảnh TKB
                  </span>
                  <span>→</span>
                  <span className={cn('font-semibold', imageRows.length > 0 ? 'text-primary' : '')}>
                    2. Kiểm tra &amp; chỉnh sửa
                  </span>
                  <span>→</span>
                  <span>3. Lưu lịch học</span>
                </div>

                <div className="space-y-2.5 rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      Nhận diện từ ảnh chụp TKB (PNG / JPEG / WebP)
                    </p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <ClipboardPaste className="h-3 w-3" />
                      Hỗ trợ Ctrl+V
                    </span>
                  </div>

                  {imageBusy && (
                    <div className="flex items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-primary">
                      <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                      <span>Đang phân tích ảnh thời khóa biểu bằng AI OCR, vui lòng đợi...</span>
                    </div>
                  )}

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
                  'rounded-lg border-2 border-dashed p-3 text-center transition-colors',
                  isDraggingImage
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 bg-background/80 hover:border-primary/50'
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
                  <div className="space-y-2">
                    <div className="relative mx-auto max-h-40 overflow-hidden rounded-md border bg-muted/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreviewUrl}
                        alt="Ảnh thời khóa biểu đã chọn"
                        className="mx-auto max-h-40 w-auto object-contain"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">{imageFileName}</span>
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
                  <div className="flex flex-col items-center gap-2 py-2">
                    <ImageIcon className="h-7 w-7 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium">
                        Dán ảnh trực tiếp bằng <kbd className="rounded border bg-muted px-1 py-0.5 text-[11px]">Ctrl+V</kbd>, kéo thả vào đây hoặc chọn tệp
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Hỗ trợ cả bảng TKB đầy đủ và bảng danh sách đăng ký học phần (PNG/JPEG/WebP &lt; 5MB)
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={imageBusy}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      Chọn ảnh từ máy
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-2 rounded-lg border bg-background p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">
                    Giờ học theo ca (tùy chỉnh theo trường)
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setPeriodEditorOpen((value) => !value)}
                  >
                    {periodEditorOpen ? 'Đóng' : 'Chỉnh giờ ca'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[1, 2, 3, 4]
                    .map((ca) => `Ca ${ca}: ${classPeriods[ca].start}–${classPeriods[ca].end}`)
                    .join(' · ')}
                </p>
                {periodEditorOpen && (
                  <div className="space-y-2 pt-1">
                    {[1, 2, 3, 4].map((ca) => (
                      <div
                        key={ca}
                        className="grid grid-cols-[48px_1fr_1fr] items-center gap-2"
                      >
                        <span className="text-xs font-medium">Ca {ca}</span>
                        <input
                          aria-label={`Ca ${ca} bắt đầu`}
                          type="time"
                          className="w-full rounded-md border bg-background p-1.5 text-xs"
                          value={classPeriods[ca].start}
                          onChange={(event) =>
                            updateClassPeriod(ca, 'start', event.target.value)
                          }
                        />
                        <input
                          aria-label={`Ca ${ca} kết thúc`}
                          type="time"
                          className="w-full rounded-md border bg-background p-1.5 text-xs"
                          value={classPeriods[ca].end}
                          onChange={(event) =>
                            updateClassPeriod(ca, 'end', event.target.value)
                          }
                        />
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={saveClassPeriods}>
                        Lưu giờ học
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setClassPeriods(DEFAULT_CLASS_PERIODS)}
                      >
                        Khôi phục mặc định
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {imageBusy && (
                <p className="text-xs text-primary font-medium animate-pulse">
                  Đang nhận diện thời khóa biểu từ ảnh...
                </p>
              )}

              {imageRows.length > 0 && (
                <div className="space-y-3">
                  {imageRows.some((r) => Boolean(getRowValidationError(r))) && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/80 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <span>
                        Một số dòng chưa có Thứ hoặc Giờ học (hoặc ngày/giờ chưa đúng định dạng). Hãy bổ sung trực tiếp trên từng dòng trước khi lưu.
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Đã nhận diện <strong>{imageRows.length}</strong> học phần. Kiểm tra và chỉnh sửa thông tin trước khi lưu:
                  </p>
                  <div className="max-h-[60vh] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {imageRows.map((row, index) => {
                    const rowError = getRowValidationError(row);
                    return (
                      <div
                        key={index}
                        className={cn(
                          'space-y-2 rounded-lg border bg-background p-2.5',
                          rowError && 'border-amber-400/80 bg-amber-50/20 dark:bg-amber-950/10'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-semibold">Học phần {index + 1}</p>
                            {rowError && (
                              <span className="truncate rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                {rowError}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                setImageRows((previous) => {
                                  const clone: RecognizedImageRow = {
                                    ...row,
                                    dayOfWeek: -1,
                                    needsSchedule: true,
                                  };
                                  return [
                                    ...previous.slice(0, index + 1),
                                    clone,
                                    ...previous.slice(index + 1),
                                  ];
                                })
                              }
                            >
                              + Thêm ngày học
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() =>
                                setImageRows((previous) =>
                                  previous.filter((_, i) => i !== index)
                                )
                              }
                            >
                              Bỏ dòng này
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-xs">
                            Tên môn
                            <input
                              className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                              type="text"
                              value={row.name}
                              onChange={(event) =>
                                updateImageRow(index, 'name', event.target.value)
                              }
                            />
                          </label>
                          <label className="block text-xs">
                            Mã học phần
                            <input
                              className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                              type="text"
                              value={row.courseCode}
                              onChange={(event) =>
                                updateImageRow(index, 'courseCode', event.target.value)
                              }
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <label className="block text-xs">
                            Thứ học
                            <select
                              aria-label={`Thứ học phần ${index + 1}`}
                              className={cn(
                                'mt-1 w-full rounded-md border bg-background p-2 text-sm',
                                row.dayOfWeek < 0 && 'border-amber-500'
                              )}
                              value={row.dayOfWeek}
                              onChange={(event) =>
                                updateImageRow(index, 'dayOfWeek', event.target.value)
                              }
                            >
                              {DAY_OF_WEEK_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-xs">
                            Ca học
                            <select
                              aria-label={`Ca học phần ${index + 1}`}
                              className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                              value={row.ca}
                              onChange={(event) =>
                                updateImageRow(index, 'ca', event.target.value)
                              }
                            >
                              <option value={0}>-- Tự nhập giờ --</option>
                              {[1, 2, 3, 4].map((ca) => (
                                <option key={ca} value={ca}>
                                  Ca {ca} ({classPeriods[ca].start}–{classPeriods[ca].end})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-xs col-span-2 sm:col-span-1">
                            Phòng
                            <input
                              className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                              type="text"
                              value={row.room}
                              onChange={(event) =>
                                updateImageRow(index, 'room', event.target.value)
                              }
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-xs">
                            Giờ bắt đầu (HH:mm)
                            <input
                              className={cn(
                                'mt-1 w-full rounded-md border bg-background p-2 text-sm',
                                !isValidTime24(row.startTime) && 'border-amber-500'
                              )}
                              type="text"
                              placeholder="07:00"
                              value={row.startTime}
                              onChange={(event) =>
                                updateImageRow(index, 'startTime', event.target.value)
                              }
                            />
                          </label>
                          <label className="block text-xs">
                            Giờ kết thúc (HH:mm)
                            <input
                              className={cn(
                                'mt-1 w-full rounded-md border bg-background p-2 text-sm',
                                (!isValidTime24(row.endTime) ||
                                  (isValidTime24(row.startTime) &&
                                    !isValidTimeRange(row.startTime, row.endTime))) &&
                                  'border-amber-500'
                              )}
                              type="text"
                              placeholder="09:25"
                              value={row.endTime}
                              onChange={(event) =>
                                updateImageRow(index, 'endTime', event.target.value)
                              }
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-xs">
                            Ngày bắt đầu (dd/MM/yyyy)
                            <VietnameseDateInput
                              value={row.startDate}
                              invalid={!isValidIsoDate(row.startDate)}
                              onChange={(value) => updateImageRow(index, 'startDate', value)}
                            />
                          </label>
                          <label className="block text-xs">
                            Ngày kết thúc (dd/MM/yyyy)
                            <VietnameseDateInput
                              value={row.endDate}
                              invalid={
                                !isValidIsoDate(row.endDate) ||
                                (isValidIsoDate(row.startDate) &&
                                  !isValidDateRange(row.startDate, row.endDate))
                              }
                              onChange={(value) => updateImageRow(index, 'endDate', value)}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {(['credits', 'firstWeek', 'lastWeek'] as const).map((key) => (
                            <label key={key} className="text-xs">
                              {
                                {
                                  credits: 'Tín chỉ',
                                  firstWeek: 'Tuần đầu',
                                  lastWeek: 'Tuần cuối',
                                }[key]
                              }
                              <input
                                type="number"
                                min={0}
                                className="mt-1 w-full rounded-md border bg-background p-1.5 text-sm"
                                value={row[key]}
                                onChange={(event) =>
                                  updateImageRow(index, key, event.target.value)
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                    </div>
                  </div>
                  <Button
                    disabled={
                      importBusy ||
                      imageRows.some((row) => Boolean(getRowValidationError(row)))
                    }
                    onClick={saveImageRows}
                    className="w-full"
                  >
                    {importBusy ? 'Đang lưu...' : 'Xác nhận lưu lịch từ ảnh'}
                  </Button>
                </div>
              )}
            </div>
              </div>
            )}

            {importModalTab === 'excel' && (
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    Nhập từ tệp Excel (.xlsx, .xls) hoặc CSV
                  </p>
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
                  onClick={handleImport}
                  className="w-full"
                >
                  {importBusy ? 'Đang nhập...' : 'Xác nhận nhập tệp'}
                </Button>
              </div>
            )}

            {importModalTab === 'manual' && (
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    Thêm buổi học thủ công / Học bù
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Thêm nhanh một buổi học mới, buổi học bù hoặc đổi lịch cho môn học đã có.
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full gap-2"
                  onClick={() => {
                    setImportOpen(false);
                    setMakeupOpen(true);
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

      {/* Makeup Session Dialog */}
      {makeupOpen && (
        <MakeupSessionDialog
          open={makeupOpen}
          onOpenChange={setMakeupOpen}
          courses={courses}
          onSaved={handleRefresh}
        />
      )}

      {/* Quick Schedule Guide Dialog */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chỉ dẫn sử dụng Thời khóa biểu</DialogTitle>
            <DialogDescription>
              Quy trình nhanh để thiết lập lịch học và đồng bộ ra màn hình chính điện thoại.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border p-3 space-y-1">
              <p className="font-semibold">1. Tạo môn học & Lịch lặp hàng tuần</p>
              <p className="text-xs text-muted-foreground">
                Vào mục <strong>Môn học → Thêm môn học</strong> hoặc nhấn <strong>Nhập lịch</strong> để tải lên tệp Excel/CSV hoặc ảnh chụp TKB.
              </p>
            </div>
            <div className="rounded-xl border p-3 space-y-1">
              <p className="font-semibold">2. Ghi chú từng buổi & Kéo thả đổi lịch</p>
              <p className="text-xs text-muted-foreground">
                Nhấn vào bất kỳ buổi học nào để mở bảng ghi chú Markdown, checklist tiến độ, tài liệu và bài tập. Trên lịch Tuần, kéo thả khối buổi học để dời ngày/giờ nhanh.
              </p>
            </div>
            <div className="rounded-xl border p-3 space-y-1">
              <p className="font-semibold">3. Đồng bộ Widget lên iPhone / Android</p>
              <p className="text-xs text-muted-foreground">
                Vào <strong>Cài đặt → Widget lịch học</strong> để lấy liên kết iCalendar (.ics) hoặc mở trang Widget gọn nhẹ ngoài màn hình chính.
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
