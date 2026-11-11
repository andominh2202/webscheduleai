import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/api-helpers';
import { getVnDayBounds, getVnNowHHMM, toVnDateString } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token')?.trim();

    let user: { id: string; name: string | null; email: string } | null = null;
    if (token) {
      user = await prisma.user.findUnique({
        where: { calendarToken: token },
        select: { id: true, name: true, email: true },
      });
    } else {
      const authId = await getAuthUserId();
      if (authId) {
        user = await prisma.user.findUnique({
          where: { id: authId },
          select: { id: true, name: true, email: true },
        });
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Token hoặc phiên đăng nhập không hợp lệ' }, { status: 401 });
    }

    const now = new Date();
    const todayKey = toVnDateString(now);
    const nowHHMM = getVnNowHHMM(now);
    const todayBounds = getVnDayBounds(todayKey);

    const [todaySessions, upcomingSessions, pendingAssignments, upcomingExams] =
      await Promise.all([
        prisma.courseSession.findMany({
          where: {
            course: { userId: user.id },
            status: { not: 'cancelled' },
            date: { gte: todayBounds.start, lte: todayBounds.end },
          },
          include: {
            course: {
              select: { name: true, courseCode: true, color: true, examFormat: true },
            },
          },
          orderBy: { startTime: 'asc' },
        }),
        prisma.courseSession.findMany({
          where: {
            course: { userId: user.id },
            status: { not: 'cancelled' },
            date: { gte: todayBounds.start },
          },
          include: {
            course: {
              select: { name: true, courseCode: true, color: true },
            },
          },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
          take: 15,
        }),
        prisma.assignment.findMany({
          where: { userId: user.id, completed: false },
          include: { course: { select: { name: true, color: true } } },
          orderBy: { dueDate: 'asc' },
          take: 4,
        }),
        prisma.exam.findMany({
          where: { userId: user.id, date: { gte: todayBounds.start } },
          include: { course: { select: { name: true, color: true } } },
          orderBy: { date: 'asc' },
          take: 3,
        }),
      ]);

    const nextSession =
      upcomingSessions.find((s) => {
        const sKey = toVnDateString(s.date);
        if (sKey > todayKey) return true;
        if (sKey === todayKey) return s.endTime.padStart(5, '0') >= nowHHMM;
        return false;
      }) || null;

    return NextResponse.json({
      userName: user.name || user.email,
      today: todayKey,
      todaySessions,
      nextSession,
      pendingAssignments,
      upcomingExams,
    });
  } catch (error) {
    console.error('[Widget API Error]', error);
    return NextResponse.json({ error: 'Lỗi máy chủ' }, { status: 500 });
  }
}

