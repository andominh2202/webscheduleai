'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Clock, MapPin, ClipboardList, GraduationCap, RefreshCw } from 'lucide-react';
import { formatDate, formatShortDate } from '@/lib/utils';

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

function WidgetViewContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [data, setData] = useState<WidgetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = token
        ? `/api/widget?token=${encodeURIComponent(token)}`
        : '/api/widget';
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Không thể tải dữ liệu widget');
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải widget');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 120000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl animate-pulse space-y-4">
          <div className="h-6 w-1/2 rounded bg-muted" />
          <div className="h-20 rounded-2xl bg-muted" />
          <div className="h-24 rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-xl text-center space-y-3">
          <p className="text-sm font-medium text-destructive">{error || 'Chưa đăng nhập'}</p>
          <Link
            href="/login"
            className="inline-block rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
          >
            Đăng nhập WebSchedule
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 p-4 flex items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        {/* Main iOS-style Widget Card */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border shadow-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                {formatDate(new Date())}
              </p>
              <h1 className="text-lg font-bold tracking-tight mt-0.5">
                Lịch học của {data.userName}
              </h1>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              aria-label="Làm mới"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Today Sessions */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              Hôm nay ({data.todaySessions.length} buổi)
            </p>

            {data.todaySessions.length === 0 ? (
              <div className="rounded-2xl bg-muted/50 p-3.5 text-xs text-muted-foreground text-center">
                Hôm nay không có lịch học
              </div>
            ) : (
              <div className="space-y-2">
                {data.todaySessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3 border-l-4"
                    style={{ borderLeftColor: s.course.color || '#3b82f6' }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{s.course.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {s.startTime} - {s.endTime}
                        </span>
                        {s.room && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            P.{s.room}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Next Session if none today */}
          {data.todaySessions.length === 0 && data.nextSession && (
            <div className="rounded-2xl bg-primary/10 p-3.5 space-y-1">
              <p className="text-[11px] font-semibold uppercase text-primary">
                Buổi học tiếp theo
              </p>
              <p className="font-semibold text-sm">{data.nextSession.course.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatShortDate(data.nextSession.date)} • {data.nextSession.startTime} -{' '}
                {data.nextSession.endTime}
                {data.nextSession.room ? ` • P.${data.nextSession.room}` : ''}
              </p>
            </div>
          )}

          {/* Mini 2-col Deadlines & Exams */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div className="rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                <ClipboardList className="w-3.5 h-3.5" />
                Deadline ({data.pendingAssignments.length})
              </p>
              {data.pendingAssignments.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Không có bài tập</p>
              ) : (
                data.pendingAssignments.slice(0, 2).map((a) => (
                  <p key={a.id} className="text-[11px] truncate font-medium">
                    • {a.title} ({formatShortDate(a.dueDate)})
                  </p>
                ))
              )}
            </div>

            <div className="rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" />
                Lịch thi ({data.upcomingExams.length})
              </p>
              {data.upcomingExams.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Chưa có lịch thi</p>
              ) : (
                data.upcomingExams.slice(0, 2).map((ex) => (
                  <p key={ex.id} className="text-[11px] truncate font-medium">
                    • {ex.course.name} ({formatShortDate(ex.date)})
                  </p>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-between items-center pt-1 text-xs">
            <Link href="/schedule" className="text-primary font-medium hover:underline">
              Mở Thời khóa biểu đầy đủ →
            </Link>
            <Link href="/settings" className="text-muted-foreground hover:underline">
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
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
          Đang tải Widget...
        </div>
      }
    >
      <WidgetViewContent />
    </Suspense>
  );
}

