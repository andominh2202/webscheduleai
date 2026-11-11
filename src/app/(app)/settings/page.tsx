'use client';

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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import {
  SemesterFormDialog,
  SemesterItem,
} from '@/components/semesters/semester-form-dialog';

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
  const [editingSemester, setEditingSemester] = React.useState<SemesterItem | null>(null);

  const [deletingSemester, setDeletingSemester] = React.useState<SemesterItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Import/Export & Backup states
  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  const restoreInputRef = React.useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importSummary, setImportSummary] = React.useState<string | null>(null);
  const [restoring, setRestoring] = React.useState(false);
  const [pendingRestoreJson, setPendingRestoreJson] = React.useState<unknown | null>(null);

  // Google Calendar state
  const [googleStatus, setGoogleStatus] = React.useState<GoogleStatus | null>(null);
  const [syncingGoogle, setSyncingGoogle] = React.useState(false);

  // Account & iPhone Widget states
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

  const fetchSemesters = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/semesters', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSemesters(Array.isArray(data) ? data : []);
      } else {
        toast.error('Không thể tải danh sách học kỳ');
      }
    } catch {
      toast.error('Lỗi kết nối khi tải học kỳ');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGoogleStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/google-calendar', { cache: 'no-store' });
      if (res.ok) {
        setGoogleStatus(await res.json());
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchAccount = React.useCallback(async () => {
    try {
      const res = await fetch('/api/account', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setAccountName(data.name || '');
        setCalendarToken(data.calendarToken || '');
      }
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    fetchSemesters();
    fetchGoogleStatus();
    fetchAccount();
  }, [fetchSemesters, fetchGoogleStatus, fetchAccount]);

  const notifySemesterChanged = () => {
    window.dispatchEvent(new CustomEvent('semesters-updated'));
    window.dispatchEvent(new CustomEvent('semester-changed'));
    router.refresh();
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

  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      toast.error(err instanceof Error ? err.message : 'Đồng bộ Google Calendar thất bại');
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

  const feedHttpUrl = originUrl && calendarToken
    ? `${originUrl}/api/calendar-feed/${calendarToken}.ics`
    : '';
  const feedWebcalUrl = feedHttpUrl.replace(/^https?:\/\//i, 'webcal://');
  const widgetPageUrl = originUrl && calendarToken
    ? `${originUrl}/widget?token=${calendarToken}`
    : '';
  const scriptableSnippet = originUrl && calendarToken
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý học kỳ, nhập/xuất thời khóa biểu, đồng bộ lịch, sao lưu dữ liệu và giao diện.
        </p>
      </div>

      {/* Semester Management */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-primary" />
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
                <div key={idx} className="h-16 rounded-lg border bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : semesters.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center space-y-2">
              <p className="text-sm font-medium">Chưa có dữ liệu</p>
              <p className="text-xs text-muted-foreground">
                Hãy tạo học kỳ đầu tiên để bắt đầu thêm môn học và thời khóa biểu.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {semesters.map((sem) => (
                <div
                  key={sem.id}
                  className={cn(
                    'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3.5 transition-colors',
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
                    <p className="text-xs text-muted-foreground">
                      Thời gian: {formatShortDate(sem.startDate)} – {formatShortDate(sem.endDate)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!sem.isActive && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={activatingId === sem.id}
                        onClick={() => handleActivate(sem.id)}
                      >
                        {activatingId === sem.id ? 'Đang kích hoạt...' : 'Đặt làm hiện tại'}
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
                      aria-label="Sửa học kỳ"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeletingSemester(sem)}
                      aria-label="Xóa học kỳ"
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

      {/* Import / Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
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
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
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
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-foreground">
              {importSummary}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Calendar Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
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
            Đồng bộ các buổi học sắp tới trực tiếp lên Google Calendar qua OAuth khi đã cấu hình, hoặc xuất file .ics để nhập thủ công.
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
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground space-y-2">
              <p>
                Để bật đồng bộ trực tiếp qua Google OAuth, hãy thêm <code>AUTH_GOOGLE_ID</code> và{' '}
                <code>AUTH_GOOGLE_SECRET</code> vào file <code>.env</code> và khởi động lại ứng dụng.
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
                Tải file .ics để nhập vào Google Calendar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backup & Restore */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5 text-primary" />
            Sao lưu & Khôi phục dữ liệu
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
            Tùy chỉnh chế độ sáng, tối hoặc tự động theo hệ thống.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <Button
              type="button"
              variant={mounted && theme === 'light' ? 'default' : 'outline'}
              className="gap-2"
              onClick={() => setTheme('light')}
            >
              <Sun className="h-4 w-4" />
              Sáng
            </Button>
            <Button
              type="button"
              variant={mounted && theme === 'dark' ? 'default' : 'outline'}
              className="gap-2"
              onClick={() => setTheme('dark')}
            >
              <Moon className="h-4 w-4" />
              Tối
            </Button>
            <Button
              type="button"
              variant={mounted && theme === 'system' ? 'default' : 'outline'}
              className="gap-2"
              onClick={() => setTheme('system')}
            >
              <Monitor className="h-4 w-4" />
              Hệ thống
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* iPhone Widget & Apple Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Widget lịch học trên iPhone (iOS)
          </CardTitle>
          <CardDescription>
            Hiển thị lịch học trực tiếp như Widget trên màn hình chính / màn hình khóa iPhone qua Lịch Apple hoặc Scriptable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cách 1: Apple Calendar Widget */}
          <div className="rounded-lg border p-3.5 space-y-2.5 bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                Cách 1 (Khuyên dùng): Đồng bộ vào Widget Lịch gốc của iPhone
              </p>
              <Badge variant="secondary" className="text-[11px]">Tự cập nhật</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Trên iPhone, nhấn nút bên dưới (hoặc mở <strong>Cài đặt → Lịch → Tài khoản → Thêm tài khoản → Khác → Thêm Lịch đã đăng ký</strong> rồi dán link). Sau đó thêm Widget <strong>Lịch (Calendar)</strong> ra Màn hình chính iPhone!
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

          {/* Cách 2: Widget View & Scriptable */}
          <div className="rounded-lg border p-3.5 space-y-2.5 bg-muted/20">
            <p className="text-sm font-semibold">
              Cách 2: Màn hình Widget nhanh & App Scriptable (iOS)
            </p>
            <p className="text-xs text-muted-foreground">
              Mở trang Widget bằng Safari trên iPhone rồi chọn <strong>Chia sẻ → Thêm vào MH chính</strong>, hoặc dán script vào app <strong>Scriptable</strong> (miễn phí trên App Store) để tạo Widget tùy biến trên màn hình chính.
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

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Thông tin tài khoản
          </CardTitle>
          <CardDescription>
            Cập nhật họ tên, mật khẩu hoặc đăng xuất khỏi tài khoản.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

          <form onSubmit={handleSaveAccount} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
            <div className="space-y-1">
              <Label className="text-xs">Họ và tên</Label>
              <Input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="VD: Đỗ Minh An"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mật khẩu hiện tại (nếu đổi MK)</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Mật khẩu cũ"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mật khẩu mới</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="h-9 text-sm"
                />
                <Button type="submit" size="sm" className="h-9 shrink-0" disabled={savingAccount}>
                  {savingAccount ? 'Đang lưu...' : 'Lưu'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

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
        <DialogContent className="max-w-md">
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
          <DialogFooter className="gap-2">
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận khôi phục dữ liệu</DialogTitle>
            <DialogDescription>
              Khôi phục từ file sao lưu sẽ thay thế toàn bộ dữ liệu học kỳ, môn học, ghi chú và bài tập hiện tại của tài khoản này. Bạn có muốn tiếp tục?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
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
