import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveSemester, requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import {
  getVnDayBounds,
  getVnNowHHMM,
  getVnWeekBounds,
  toVnDateString,
} from '@/lib/timezone';

export async function GET() {
  try {
    const userId = await requireAuth();
    const activeSemester = await getActiveSemester(userId);
    const courseWhere = {
      userId,
      ...(activeSemester ? { semesterId: activeSemester.id } : {}),
    };

    const now = new Date();
    const todayKey = toVnDateString(now);
    const nowHHMM = getVnNowHHMM(now);
    const todayBounds = getVnDayBounds(todayKey);
    const weekBounds = getVnWeekBounds(now);

    const [
      coursesCount,
      weeklySessionsCount,
      todaySessions,
      candidateUpcomingSessions,
      pendingAssignments,
      upcomingExamsCount,
      notedSessions,
      totalSessionsCount,
      completedSessionsCount,
    ] = await Promise.all([
      prisma.course.count({ where: courseWhere }),
      prisma.courseSession.count({
        where: {
          course: courseWhere,
          status: { not: 'cancelled' },
          date: { gte: weekBounds.start, lte: weekBounds.end },
        },
      }),
      prisma.courseSession.findMany({
        where: {
          course: courseWhere,
          date: { gte: todayBounds.start, lte: todayBounds.end },
        },
        include: {
          course: {
            select: { id: true, name: true, courseCode: true, color: true, instructor: true },
          },
        },
        orderBy: { startTime: 'asc' },
      }),
      prisma.courseSession.findMany({
        where: {
          course: courseWhere,
          status: { not: 'cancelled' },
          date: { gte: todayBounds.start },
        },
        include: {
          course: {
            select: { id: true, name: true, courseCode: true, color: true, instructor: true },
          },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 25,
      }),
      prisma.assignment.findMany({
        where: {
          userId,
          completed: false,
          ...(activeSemester ? { course: { semesterId: activeSemester.id } } : {}),
        },
        include: {
          course: {
            select: { id: true, name: true, courseCode: true, color: true },
          },
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.exam.count({
        where: {
          userId,
          date: { gte: todayBounds.start },
          ...(activeSemester ? { course: { semesterId: activeSemester.id } } : {}),
        },
      }),
      prisma.courseSession.findMany({
        where: {
          course: courseWhere,
          OR: [
            { AND: [{ content: { not: null } }, { content: { not: '' } }] },
            { AND: [{ personalNote: { not: null } }, { personalNote: { not: '' } }] },
          ],
        },
        include: {
          course: {
            select: { id: true, name: true, courseCode: true, color: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.courseSession.count({
        where: {
          course: courseWhere,
          status: { not: 'cancelled' },
        },
      }),
      prisma.courseSession.count({
        where: {
          course: courseWhere,
          status: 'completed',
        },
      }),
    ]);

    const nextSession =
      candidateUpcomingSessions.find((s) => {
        const sKey = toVnDateString(s.date);
        if (sKey > todayKey) return true;
        if (sKey === todayKey) {
          return s.endTime.padStart(5, '0') >= nowHHMM;
        }
        return false;
      }) || null;

    const recentNotes = notedSessions
      .filter((s) => {
        const strippedContent = (s.content || '').replace(/<[^>]*>/g, '').trim();
        const strippedNote = (s.personalNote || '').replace(/<[^>]*>/g, '').trim();
        return strippedContent.length > 0 || strippedNote.length > 0;
      })
      .slice(0, 5);

    return NextResponse.json({
      activeSemester,
      coursesCount,
      weeklySessionsCount,
      pendingAssignmentsCount: pendingAssignments.length,
      upcomingExamsCount,
      todaySessions,
      nextSession,
      nearestDeadlines: pendingAssignments.slice(0, 5),
      recentNotes,
      completedSessionsCount,
      totalSessionsCount,
    });
  } catch (error) {
    return handleApiError(error, 'Không thể tải dữ liệu bảng điều khiển');
  }
}

