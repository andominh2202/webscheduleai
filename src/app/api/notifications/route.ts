import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { addVnDays, getVnDayBounds, toVnDateString } from '@/lib/timezone';

export interface NotificationItem {
  id: string;
  kind: 'session' | 'assignment_overdue' | 'assignment_upcoming' | 'exam';
  title: string;
  subtitle: string;
  href: string;
  time: string;
  urgent: boolean;
  color?: string;
}

export async function GET() {
  try {
    const userId = await requireAuth();
    const now = new Date();
    const todayKey = toVnDateString(now);
    const todayStart = getVnDayBounds(todayKey).start;
    const tomorrowEnd = getVnDayBounds(toVnDateString(addVnDays(now, 1))).end;
    const threeDaysEnd = getVnDayBounds(toVnDateString(addVnDays(now, 3))).end;
    const sevenDaysEnd = getVnDayBounds(toVnDateString(addVnDays(now, 7))).end;

    const [upcomingSessions, pendingAssignments, upcomingExams] = await Promise.all([
      prisma.courseSession.findMany({
        where: {
          course: { userId },
          status: 'upcoming',
          date: { gte: todayStart, lte: tomorrowEnd },
        },
        include: {
          course: { select: { name: true, color: true } },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 10,
      }),
      prisma.assignment.findMany({
        where: {
          userId,
          completed: false,
          dueDate: { lte: threeDaysEnd },
        },
        include: {
          course: { select: { name: true, color: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      prisma.exam.findMany({
        where: {
          userId,
          date: { gte: todayStart, lte: sevenDaysEnd },
        },
        include: {
          course: { select: { name: true, color: true } },
        },
        orderBy: { date: 'asc' },
        take: 5,
      }),
    ]);

    const items: NotificationItem[] = [];

    for (const a of pendingAssignments) {
      const dueKey = toVnDateString(a.dueDate);
      const isOverdue = dueKey < todayKey;
      const isToday = dueKey === todayKey;
      items.push({
        id: `assign-${a.id}`,
        kind: isOverdue ? 'assignment_overdue' : 'assignment_upcoming',
        title: isOverdue ? `Quá hạn: ${a.title}` : `Hạn nộp: ${a.title}`,
        subtitle: `${a.course.name} • ${dueKey.split('-').reverse().join('/')}`,
        href: '/assignments',
        time: a.dueDate.toISOString(),
        urgent: isOverdue || isToday,
        color: a.course.color,
      });
    }

    for (const e of upcomingExams) {
      const dateKey = toVnDateString(e.date);
      items.push({
        id: `exam-${e.id}`,
        kind: 'exam',
        title: `Lịch thi: ${e.title}`,
        subtitle: `${e.course.name} • ${dateKey.split('-').reverse().join('/')}${e.startTime ? ` (${e.startTime})` : ''}${e.room ? ` • P.${e.room}` : ''}`,
        href: '/exams',
        time: e.date.toISOString(),
        urgent: dateKey === todayKey,
        color: e.course.color,
      });
    }

    for (const s of upcomingSessions) {
      const dateKey = toVnDateString(s.date);
      const isToday = dateKey === todayKey;
      items.push({
        id: `sess-${s.id}`,
        kind: 'session',
        title: `${isToday ? 'Hôm nay' : 'Ngày mai'}: ${s.course.name}`,
        subtitle: `${s.startTime} - ${s.endTime}${s.room ? ` • Phòng ${s.room}` : ''}`,
        href: `/schedule`,
        time: `${dateKey}T${s.startTime}:00+07:00`,
        urgent: isToday,
        color: s.course.color,
      });
    }

    return NextResponse.json({
      count: items.length,
      urgentCount: items.filter((i) => i.urgent).length,
      items,
    });
  } catch (error) {
    return handleApiError(error, 'Không thể tải thông báo');
  }
}

