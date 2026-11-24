'use client';

import dynamic from 'next/dynamic';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import {
  Calendar,
  CalendarRange,
  CheckCircle2,
  Copy,
  DatabaseBackup,
  Download,
  Edit,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatShortDate } from '@/lib/utils';
import { invalidateCache } from '@/lib/client-cache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import type { SemesterItem } from '@/components/semesters/semester-form-dialog';

const SemesterFormDialog = dynamic(
  () =>
    import('@/components/semesters/semester-form-dialog').then(
      (m) => m.SemesterFormDialog
    ),
  { ssr: false }
);

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  const [semesters, setSemesters] = React.useState<SemesterItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activatingId, setActivatingId] = React.useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingSemester, setEditingSemester] = React.useState<SemesterItem | null>(
    null
  );

  const [deletingSemester, setDeletingSemester] =
    React.useState<SemesterItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  const restoreInputRef = React.useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importSummary, setImportSummary] = React.useState<string | null>(null);
  const [restoring, setRestoring] = React.useState(false);
  const [pendingRestoreJson, setPendingRestoreJson] = React.useState<unknown | null>(
    null
  );

  const [googleStatus, setGoogleStatus] = React.useState<GoogleStatus | null>(null);
  const [syncingGoogle, setSyncingGoogle] = React.useState(false);

  const [calendarToken, setCalendarToken] = React.useState<string>('');
  const [accountName, setAccountName] = React.useState<string>('');
  const [currentPassword, setCurrentPassword] = React.useState<string>('');
  const [newPassword, setNewPassword] = React.useState<string>('');
  const [savingAccount, setSavingAccount] = React.useState(false);
  const [originUrl, setOriginUrl] = React.useState<string>('');

  React.useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setOriginUrl(window.location.origin);
    }
  }, []);

  const abortCtrlRef = React.useRef<AbortController | null>(null);

  const fetchSemesters = React.useCallback(async () => {
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setSemesters((prev) => {
      if (prev.length === 0) setLoading(true);
      return prev;
    });

    try {
      const res = await fetch('/api/semesters', { signal: ctrl.signal });
      if (res.ok) {
        const data = await res.json();
        setSemesters(Array.isArray(data) ? data : []);
      } else {
        toast.error('Không thể tải danh sách học kỳ');
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        toast.error('Lỗi kết nối khi tải học kỳ');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const initCtrl = new AbortController();
    fetchSemesters();

    Promise.all([
      fetch('/api/integrations/google-calendar', { signal: initCtrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch('/api/account', { signal: initCtrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([gStatus, accData]) => {
      if (gStatus) setGoogleStatus(gStatus);
      if (accData) {
        setAccountName(accData.name || '');
        setCalendarToken(accData.calendarToken || '');
      }
    });

    return () => {
      initCtrl.abort();
      abortCtrlRef.current?.abort();
    };
  }, [fetchSemesters]);

  const notifySemesterChanged = () => {
    invalidateCache();
    window.dispatchEvent(new CustomEvent('semesters-updated'));
    window.dispatchEvent(new CustomEvent('semester-changed'));
  };

  const handleActivate = async (semesterId: string) => {
    if (activatingId) return;
    setActivatingId(semesterId);
    try {
      const res = await fetch(`/api/semesters/${semesterId}/activate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error();
      toast.success('Đã chuyển học kỳ hiện tại');
      await fetchSemesters();
      notifySemesterChanged();
    } catch {
      toast.error('Không thể kích hoạt học kỳ');
    } finally {
      setActivatingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingSemester || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/semesters/${deletingSemester.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success(`Đã xóa học kỳ "${deletingSemester.name}"`);
      setDeletingSemester(null);
      await fetchSemesters();
      notifySemesterChanged();
    } catch {
      toast.error('Không thể xóa học kỳ');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const csvContent =
      '\uFEFF' +
      [
        'Tên môn học,Mã học phần,Giảng viên,Số tín chỉ,Thứ,Giờ bắt đầu,Giờ kết thúc,Tiết bắt đầu,Số tiết,Phòng học,Địa điểm,Loại tuần',
        'Lập trình Web nâng cao,IT4409,TS. Trần Minh Tuấn,3,2,07:30,09:30,1,2,B1-302,Cơ sở 1,all',
        'Trí tuệ nhân tạo,IT3160,PGS. Lê Thị Lan,3,4,13:30,16:00,6,3,D3-201,Cơ sở 1,odd',
      ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mau-thoikhoabieu.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setImportSummary(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const activeSem = semesters.find((s) => s.isActive);
      if (activeSem) formData.append('semesterId', activeSem.id);

      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể nhập file');
      }

      const summary = `Đã nhập ${data.createdCourses} môn học, ${data.createdSchedules} lịch học (${data.createdSessions} buổi học).`;
      setImportSummary(
        Array.isArray(data.warnings) && data.warnings.length > 0
          ? `${summary} Cảnh báo: ${data.warnings.join(' | ')}`
          : summary
      );
      toast.success('Nhập thời khóa biểu thành công!');
      await fetchSemesters();
      notifySemesterChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi khi nhập file');
    } finally {
      setImporting(false);
    }
  };

  const handleRestoreFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json?.data?.semesters || !json?.data?.courses) {
        toast.error('File sao lưu không đúng định dạng WebSchedule');
        return;
      }
      setPendingRestoreJson(json);
    } catch {
      toast.error('Không thể đọc file JSON sao lưu');
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreJson || restoring) return;
    setRestoring(true);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingRestoreJson),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Khôi phục thất bại');
      }
      toast.success('Đã khôi phục toàn bộ dữ liệu thành công');
      setPendingRestoreJson(null);
      await fetchSemesters();
      notifySemesterChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Khôi phục thất bại');
    } finally {
      setRestoring(false);
    }
  };

  const handleSyncGoogleCalendar = async () => {
    if (syncingGoogle) return;
    setSyncingGoogle(true);
    try {
      const res = await fetch('/api/integrations/google-calendar', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể đồng bộ');
      }
      toast.success(`Đã đồng bộ ${data.syncedCount} buổi học lên Google Calendar`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Đồng bộ Google Calendar thất bại'
      );
    } finally {
      setSyncingGoogle(false);
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingAccount) return;
    setSavingAccount(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: accountName.trim() || undefined,
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Không thể cập nhật tài khoản');
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Đã lưu thông tin tài khoản');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cập nhật thất bại');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleRegenerateToken = async () => {
    try {
      const res = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateCalendarToken: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setCalendarToken(data.calendarToken || '');
      toast.success('Đã tạo lại mã liên kết Widget iPhone');
    } catch {
      toast.error('Không thể tạo lại mã liên kết');
    }
  };

  const feedHttpUrl =
    originUrl && calendarToken
      ? `${originUrl}/api/calendar-feed/${calendarToken}.ics`
      : '';
  const feedWebcalUrl = feedHttpUrl.replace(/^https?:\/\//i, 'webcal://');
  const widgetPageUrl =
    originUrl && calendarToken
      ? `${originUrl}/widget?token=${calendarToken}`
      : '';
  const scriptableSnippet =
    originUrl && calendarToken
      ? `// Dán vào app Scriptable (iOS) để hiện Widget Lịch học
const url = "${originUrl}/api/widget?token=${calendarToken}";
const data = await new Request(url).loadJSON();
const w = new ListWidget();
w.backgroundColor = new Color("#0f172a");
const title = w.addText("📅 Hôm nay (" + data.todaySessions.length + " buổi)");
title.font = Font.boldSystemFont(13);
title.textColor = new Color("#38bdf8");
w.addSpacer(6);
if (data.todaySessions.length === 0) {
  const t = w.addText(data.nextSession ? "Tiếp: " + data.nextSession.course.name + " (" + data.nextSession.startTime + ")" : "Không có lịch học hôm nay");
  t.font = Font.systemFont(12);
  t.textColor = Color.white();
} else {
  for (const s of data.todaySessions.slice(0, 3)) {
    const line = w.addText(s.startTime + " " + s.course.name + (s.room ? " • " + s.room : ""));
    line.font = Font.mediumSystemFont(12);
    line.textColor = Color.white();
    w.addSpacer(3);
  }
}
Script.setWidget(w);
Script.complete();`
      : '';

  const userInitial =
    session?.user?.name?.[0]?.toUpperCase() ||
    session?.user?.email?.[0]?.toUpperCase() ||
    'U';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Cài đặt hệ thống</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý học kỳ, giao diện hiển thị, sao lưu dữ liệu, đồng bộ lịch và bảo mật tài khoản.
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-5">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex h-auto p-1 gap-1">
          <TabsTrigger value="general" className="text-xs sm:text-sm py-2">
            Học kỳ & Giao diện
          </TabsTrigger>
          <TabsTrigger value="data" className="text-xs sm:text-sm py-2">
            Dữ liệu & Đồng bộ
          </TabsTrigger>
          <TabsTrigger value="account" className="text-xs sm:text-sm py-2">
            Widget & Tài khoản
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Semester & Appearance */}
        <TabsContent value="general" className="space-y-6">
          {/* Semester Management */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarRange className="h-5 w-5 text-primary shrink-0" />
                  Quản lý học kỳ
                </CardTitle>
                <CardDescription>
                  Thiết lập các học kỳ và chọn học kỳ đang học để lọc dữ liệu mặc định.
                </CardDescription>
              </div>
              <Button
                size="sm"
                className="gap-1.5 self-start sm:self-auto"
                onClick={() => {
                  setEditingSemester(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Thêm học kỳ
              </Button>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-16 rounded-xl border bg-muted/40 animate-pulse"
                    />
                  ))}
                </div>
              ) : semesters.length === 0 ? (
                <div className="rounded-xl border border-dashed py-10 text-center space-y-2">
                  <p className="text-sm font-medium">Chưa có học kỳ nào</p>
                  <p className="text-xs text-muted-foreground">
                    Hãy tạo học kỳ đầu tiên để bắt đầu thêm môn học và thời khóa biểu.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {semesters.map((sem) => (
                    <div
                      key={sem.id}
                      className={cn(
                        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors',
                        sem.isActive && 'border-primary/50 bg-primary/5'
                      )}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm sm:text-base">
                            {sem.name}
                          </span>
                          {sem.isActive && (
                            <Badge className="gap-1 text-xs">
                              <CheckCircle2 className="h-3 w-3" />
                              Đang hoạt động
                            </Badge>
                          )}
                          {sem._count?.courses !== undefined && (
                            <Badge variant="outline" className="text-xs font-normal">
                              {sem._count.courses} môn học
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          Thời gian: {formatShortDate(sem.startDate)} –{' '}
                          {formatShortDate(sem.endDate)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {!sem.isActive && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={activatingId === sem.id}
                            onClick={() => handleActivate(sem.id)}
                          >
                            {activatingId === sem.id
                              ? 'Đang kích hoạt...'
                              : 'Đặt làm hiện tại'}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingSemester(sem);
                            setDialogOpen(true);
                          }}
                          aria-label={`Sửa học kỳ ${sem.name}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingSemester(sem)}
                          aria-label={`Xóa học kỳ ${sem.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Theme Toggle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {mounted && theme === 'dark' ? (
                  <Moon className="h-5 w-5 text-primary" />
                ) : (
                  <Sun className="h-5 w-5 text-primary" />
                )}
                Giao diện hiển thị
              </CardTitle>
              <CardDescription>
                Tùy chỉnh chế độ sáng, tối hoặc tự động đồng bộ theo thiết bị.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(
                  [
                    { id: 'light', label: 'Chế độ Sáng', icon: Sun },
                    { id: 'dark', label: 'Chế độ Tối', icon: Moon },
                    { id: 'system', label: 'Theo hệ thống', icon: Monitor },
                  ] as const
                ).map((mode) => {
                  const Icon = mode.icon;
                  const active = mounted && theme === mode.id;
                  return (
                    <Button
                      key={mode.id}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      aria-pressed={active}
                      className="gap-2 h-11"
                      onClick={() => setTheme(mode.id)}
                    >
                      <Icon className="h-4 w-4" />
                      {mode.label}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: Import/Export, Google Calendar & Backup */}
        <TabsContent value="data" className="space-y-6">
          {/* Import / Export */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                Nhập & Xuất thời khóa biểu
              </CardTitle>
              <CardDescription>
                Nhập danh sách môn học từ file Excel (.xlsx) / CSV hoặc xuất thời khóa biểu sang Excel, CSV, iCalendar (.ics).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImportFile}
              />
              <div className="flex flex-wrap gap-2.5">
                <Button
                  type="button"
                  variant="default"
                  className="gap-2"
                  disabled={importing}
                  onClick={() => importInputRef.current?.click()}
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Nhập từ Excel / CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={handleDownloadSampleCsv}
                >
                  <Download className="h-4 w-4" />
                  Tải file mẫu CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    window.location.href = '/api/export/excel?format=xlsx';
                  }}
                >
                  <Download className="h-4 w-4" />
                  Xuất Excel (.xlsx)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    window.location.href = '/api/export/excel?format=csv';
                  }}
                >
                  <Download className="h-4 w-4" />
                  Xuất CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    window.location.href = '/api/export/ics';
                  }}
                >
                  <Calendar className="h-4 w-4" />
                  Xuất iCalendar (.ics)
                </Button>
              </div>

              {importSummary && (
                <div
                  role="status"
                  className="rounded-xl border bg-muted/40 p-3 text-xs text-foreground"
                >
                  {importSummary}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Google Calendar Integration */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary shrink-0" />
                  Tích hợp Google Calendar
                </CardTitle>
                {googleStatus && (
                  <Badge variant={googleStatus.connected ? 'default' : 'secondary'}>
                    {googleStatus.connected
                      ? 'Đã kết nối'
                      : googleStatus.configured
                        ? 'Chưa liên kết'
                        : 'Chưa cấu hình OAuth'}
                  </Badge>
                )}
              </div>
              <CardDescription>
                Đồng bộ các buổi học sắp tới trực tiếp lên Google Calendar qua OAuth hoặc xuất file .ics để nhập thủ công.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {googleStatus?.configured ? (
                googleStatus.connected ? (
                  <Button
                    type="button"
                    onClick={handleSyncGoogleCalendar}
                    disabled={syncingGoogle}
                    className="gap-2"
                  >
                    {syncingGoogle ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Đồng bộ lịch học lên Google Calendar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => signIn('google', { callbackUrl: '/settings' })}
                    className="gap-2"
                  >
                    Kết nối tài khoản Google
                  </Button>
                )
              ) : (
                <div className="rounded-xl border border-dashed p-3.5 text-xs text-muted-foreground space-y-2.5">
                  <p>
                    Để bật đồng bộ trực tiếp qua Google OAuth, quản trị viên cần cấu hình{' '}
                    <code>AUTH_GOOGLE_ID</code> và <code>AUTH_GOOGLE_SECRET</code>. Bạn vẫn có thể xuất file <code>.ics</code> chuẩn để nhập vào Google Calendar bất cứ lúc nào.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.location.href = '/api/export/ics';
                    }}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải file .ics cho Google Calendar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Backup & Restore */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DatabaseBackup className="h-5 w-5 text-primary shrink-0" />
                Sao lưu & Khôi phục toàn diện
              </CardTitle>
              <CardDescription>
                Xuất toàn bộ học kỳ, môn học, buổi học, ghi chú, checklist, bài tập và lịch thi ra file JSON để lưu trữ an toàn.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <input
                ref={restoreInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleRestoreFileSelected}
              />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  window.location.href = '/api/backup';
                }}
              >
                <Download className="h-4 w-4" />
                Tải bản sao lưu (.json)
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => restoreInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Khôi phục từ file (.json)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: iOS Widget & Account */}
        <TabsContent value="account" className="space-y-6">
          {/* Account Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-primary shrink-0" />
                Thông tin tài khoản & Bảo mật
              </CardTitle>
              <CardDescription>
                Cập nhật họ tên hiển thị, đổi mật khẩu đăng nhập hoặc đăng xuất khỏi thiết bị.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-muted/20 p-3.5">
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="text-base font-semibold">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {accountName || session?.user?.name || 'Người dùng'}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {session?.user?.email || 'Chưa có email'}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 text-destructive hover:text-destructive self-start sm:self-auto"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </Button>
              </div>

              <form
                onSubmit={handleSaveAccount}
                className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="account-name" className="text-xs">
                    Họ và tên
                  </Label>
                  <Input
                    id="account-name"
                    autoComplete="name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="VD: Đỗ Minh An"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-current-password" className="text-xs">
                    Mật khẩu hiện tại (khi đổi MK)
                  </Label>
                  <Input
                    id="account-current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Nhập mật khẩu cũ"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-new-password" className="text-xs">
                    Mật khẩu mới
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="account-new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                      className="h-9 text-sm"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="h-9 shrink-0"
                      disabled={savingAccount}
                    >
                      {savingAccount ? 'Đang lưu...' : 'Lưu'}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* iPhone Widget & Apple Calendar */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary shrink-0" />
                Widget lịch học trên iPhone (iOS)
              </CardTitle>
              <CardDescription>
                Hiển thị lịch học trực tiếp trên màn hình chính / màn hình khóa iPhone qua Lịch Apple hoặc Scriptable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border p-3.5 space-y-2.5 bg-muted/25">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    Cách 1 (Khuyên dùng): Đăng ký vào Lịch gốc của iPhone
                  </p>
                  <Badge variant="secondary" className="text-[11px]">
                    Tự động cập nhật
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Trên iPhone, nhấn nút bên dưới (hoặc mở{' '}
                  <strong>
                    Cài đặt → Lịch → Tài khoản → Thêm tài khoản → Khác → Thêm Lịch đã đăng ký
                  </strong>{' '}
                  rồi dán link). Sau đó thêm Widget <strong>Lịch (Calendar)</strong> ra Màn hình chính.
                </p>
                {feedHttpUrl && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        window.location.href = feedWebcalUrl;
                      }}
                    >
                      <Calendar className="h-4 w-4" />
                      Đăng ký vào Lịch iPhone
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={async () => {
                        await navigator.clipboard.writeText(feedHttpUrl);
                        toast.success('Đã sao chép link lịch .ics');
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Sao chép link đăng ký
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-xl border p-3.5 space-y-2.5 bg-muted/25">
                <p className="text-sm font-semibold">
                  Cách 2: Màn hình Widget nhanh & App Scriptable (iOS)
                </p>
                <p className="text-xs text-muted-foreground">
                  Mở trang Widget bằng Safari trên iPhone rồi chọn{' '}
                  <strong>Chia sẻ → Thêm vào MH chính</strong>, hoặc dán script vào app{' '}
                  <strong>Scriptable</strong> để tạo Widget tùy biến.
                </p>
                <div className="flex flex-wrap gap-2">
                  {widgetPageUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => window.open(widgetPageUrl, '_blank')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Xem thử giao diện Widget
                    </Button>
                  )}
                  {scriptableSnippet && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={async () => {
                        await navigator.clipboard.writeText(scriptableSnippet);
                        toast.success('Đã sao chép code Scriptable cho iPhone');
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Sao chép code Scriptable (iOS)
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-muted-foreground"
                    onClick={handleRegenerateToken}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Đổi mã link bảo mật
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add / Edit Semester Dialog */}
      <SemesterFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        semester={editingSemester}
        onSaved={() => {
          fetchSemesters();
          notifySemesterChanged();
        }}
      />

      {/* Delete Semester Confirmation */}
      <Dialog
        open={Boolean(deletingSemester)}
        onOpenChange={(open) => !open && setDeletingSemester(null)}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa học kỳ</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa học kỳ{' '}
              <span className="font-semibold text-foreground">
                {deletingSemester?.name}
              </span>
              ? Tất cả môn học, lịch học và buổi học thuộc học kỳ này cũng sẽ bị xóa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingSemester(null)}
              disabled={deleting}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Đang xóa...' : 'Xóa học kỳ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Backup Confirmation */}
      <Dialog
        open={Boolean(pendingRestoreJson)}
        onOpenChange={(open) => !open && setPendingRestoreJson(null)}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận khôi phục dữ liệu</DialogTitle>
            <DialogDescription>
              Khôi phục từ file sao lưu sẽ thay thế toàn bộ dữ liệu học kỳ, môn học, ghi chú và bài tập hiện tại của tài khoản này. Bạn có muốn tiếp tục?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingRestoreJson(null)}
              disabled={restoring}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmRestore}
              disabled={restoring}
            >
              {restoring ? 'Đang khôi phục...' : 'Xác nhận khôi phục'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
