'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  GraduationCap,
  MapPin,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { dedupeRequest } from '@/lib/client-cache';
import { getVnNowHHMM } from '@/lib/timezone';
import { cn, formatDate, formatShortDate } from '@/lib/utils';

interface WidgetData {
  userName: string;
  today: string;
  todaySessions: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    room?: string | null;
    course: { name: string; courseCode: string; color: string; examFormat?: string | null };
  }[];
  nextSession: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    room?: string | null;
    course: { name: string; color: string };
  } | null;
  pendingAssignments: {
    id: string;
    title: string;
    dueDate: string;
    course: { name: string; color: string };
  }[];
  upcomingExams: {
    id: string;
    title: string;
    date: string;
    startTime?: string | null;
    room?: string | null;
    course: { name: string; color: string };
  }[];
}

function normalizeClock(t: string): string {
  const [h = '00', m = '00'] = t.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function WidgetSkeleton() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4"
      aria-busy="true"
      aria-label="Đang tải Widget lịch học"
    >
      <div className="w-full max-w-md rounded-3xl border bg-card p-5 shadow-xl animate-pulse space-y-4">
        <div className="space-y-2">
          <div className="h-3.5 w-32 rounded bg-muted" />
          <div className="h-6 w-52 rounded bg-muted" />
        </div>
        <div className="space-y-2.5">
          <div className="h-16 rounded-2xl bg-muted/80" />
          <div className="h-16 rounded-2xl bg-muted/60" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="h-20 rounded-2xl bg-muted/60" />
          <div className="h-20 rounded-2xl bg-muted/60" />
        </div>
      </div>
    </div>
  );
}

function WidgetViewContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [data, setData] = useState<WidgetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nowHHMM, setNowHHMM] = useState<string>(() => getVnNowHHMM());
  const mountedRef = useRef(true);

  const loadData = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading((prev) => (data ? prev : true));
      setError(null);

      const url = token
        ? `/api/widget?token=${encodeURIComponent(token)}`
        : '/api/widget';

      try {
        const json = await dedupeRequest<WidgetData>(`widget:${url}`, async () => {
          const res = await fetch(url, { cache: 'no-store' });
          const body = await res.json();
          if (!res.ok) {
            throw new Error(body?.error || 'Không thể tải dữ liệu widget');
          }
          return body as WidgetData;
        });
        if (!mountedRef.current) return;
        setData(json);
        setNowHHMM(getVnNowHHMM());
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Lỗi tải widget');
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [token, data]
  );

  useEffect(() => {
    mountedRef.current = true;
    void loadData(false);

    const timer = window.setInterval(() => {
      setNowHHMM(getVnNowHHMM());
      if (document.visibilityState === 'visible') {
        void loadData(false);
      }
    }, 120_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setNowHHMM(getVnNowHHMM());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const allTodayFinished = useMemo(() => {
    if (!data || data.todaySessions.length === 0) return true;
    return data.todaySessions.every((s) => normalizeClock(s.endTime) < nowHHMM);
  }, [data, nowHHMM]);

  if (loading && !data) {
    return <WidgetSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl text-center space-y-3">
          <p className="text-sm font-medium text-destructive">
            {error || 'Chưa đăng nhập'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void loadData(true)}
              className="rounded-xl border px-3.5 py-2 text-xs font-medium hover:bg-accent transition-colors"
            >
              Thử lại
            </button>
            <Link
              href="/login"
              className="inline-block rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm hover:opacity-95"
            >
              Đăng nhập WebSchedule
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 p-4 flex items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        {/* Main iOS-style Widget Card */}
        <div className="rounded-3xl bg-card border shadow-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                {formatDate(new Date())}
              </p>
              <h1 className="text-lg font-bold tracking-tight text-foreground mt-0.5">
                Lịch học của {data.userName}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="p-2 rounded-full border bg-background hover:bg-accent transition-colors disabled:opacity-60"
              aria-label="Làm mới dữ liệu Widget"
            >
              <RefreshCw
                className={cn(
                  'w-4 h-4 text-muted-foreground',
                  refreshing && 'animate-spin text-primary'
                )}
              />
            </button>
          </div>

          {/* Today Sessions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <p className="font-semibold text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Hôm nay ({data.todaySessions.length} buổi)
              </p>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {nowHHMM}
              </span>
            </div>

            {data.todaySessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-xs text-muted-foreground text-center">
                Hôm nay bạn không có ca học nào
              </div>
            ) : (
              <div className="space-y-2">
                {data.todaySessions.map((s) => {
                  const startNorm = normalizeClock(s.startTime);
                  const endNorm = normalizeClock(s.endTime);
                  const isOngoing = nowHHMM >= startNorm && nowHHMM <= endNorm;
                  const isPast = nowHHMM > endNorm;

                  return (
                    <div
                      key={s.id}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-2xl border border-l-4 p-3 transition-all',
                        isOngoing
                          ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30'
                          : isPast
                            ? 'bg-muted/25 opacity-70'
                            : 'bg-muted/40'
                      )}
                      style={{ borderLeftColor: s.course.color || '#3b82f6' }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {s.course.name}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                          <span className="inline-flex items-center gap-1 tabular-nums font-medium text-foreground/80">
                            <Clock className="w-3 h-3" />
                            {startNorm} – {endNorm}
                          </span>
                          {s.room && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              P.{s.room}
                            </span>
                          )}
                        </div>
                      </div>

                      {isOngoing ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                          Đang học
                        </span>
                      ) : isPast ? (
                        <CheckCircle2
                          className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0"
                          aria-label="Đã qua"
                        />
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground shrink-0">
                          Sắp tới
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Next Session if none today or today's classes finished */}
          {allTodayFinished && data.nextSession && (
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3.5 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Buổi học tiếp theo
              </p>
              <p className="font-semibold text-sm text-foreground">
                {data.nextSession.course.name}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatShortDate(data.nextSession.date)} •{' '}
                {normalizeClock(data.nextSession.startTime)} –{' '}
                {normalizeClock(data.nextSession.endTime)}
                {data.nextSession.room ? ` • P.${data.nextSession.room}` : ''}
              </p>
            </div>
          )}

          {/* Mini 2-col Deadlines & Exams */}
          <div className="grid grid-cols-2 gap-2.5 pt-0.5">
            <div className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                Deadline ({data.pendingAssignments.length})
              </p>
              {data.pendingAssignments.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Không có bài tập</p>
              ) : (
                data.pendingAssignments.slice(0, 2).map((a) => (
                  <p
                    key={a.id}
                    className="text-[11px] truncate font-medium text-foreground/90"
                  >
                    • {a.title} ({formatShortDate(a.dueDate)})
                  </p>
                ))
              )}
            </div>

            <div className="rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/50 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                Lịch thi ({data.upcomingExams.length})
              </p>
              {data.upcomingExams.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Chưa có lịch thi</p>
              ) : (
                data.upcomingExams.slice(0, 2).map((ex) => (
                  <p
                    key={ex.id}
                    className="text-[11px] truncate font-medium text-foreground/90"
                  >
                    • {ex.course.name} ({formatShortDate(ex.date)})
                  </p>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-3 text-xs">
            <Link
              href="/schedule"
              className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"
            >
              Mở Thời khóa biểu đầy đủ
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              Cài đặt
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={<WidgetSkeleton />}>
      <WidgetViewContent />
    </Suspense>
  );
}
