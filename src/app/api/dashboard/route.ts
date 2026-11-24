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

const HTML_TAG_RE = /<[^>]*>/g;

const sessionSummarySelect = {
  id: true,
  date: true,
  startTime: true,
  endTime: true,
  room: true,
  location: true,
  status: true,
  type: true,
  courseId: true,
  scheduleId: true,
  course: {
    select: {
      id: true,
      name: true,
      courseCode: true,
      color: true,
      instructor: true,
    },
  },
} as const;

export async function GET() {
  try {
    const userId = await requireAuth();
    const activeSemester = await getActiveSemester(userId);
    const courseWhere = {
      userId,
      ...(activeSemester ? { semesterId: activeSemester.id } : {}),
    };
    const assignmentWhere = {
      userId,
      completed: false,
      ...(activeSemester ? { course: { semesterId: activeSemester.id } } : {}),
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
      pendingAssignmentsCount,
      nearestDeadlines,
      upcomingExamsCount,
      notedSessions,
      sessionStatusCounts,
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
        select: sessionSummarySelect,
        orderBy: { startTime: 'asc' },
      }),
      prisma.courseSession.findMany({
        where: {
          course: courseWhere,
          status: { not: 'cancelled' },
          date: { gte: todayBounds.start },
        },
        select: sessionSummarySelect,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 25,
      }),
      prisma.assignment.count({
        where: assignmentWhere,
      }),
      prisma.assignment.findMany({
        where: assignmentWhere,
        select: {
          id: true,
          title: true,
          description: true,
          dueDate: true,
          completed: true,
          priority: true,
          courseId: true,
          sessionId: true,
          course: {
            select: { id: true, name: true, courseCode: true, color: true },
          },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
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
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          room: true,
          location: true,
          status: true,
          type: true,
          content: true,
          personalNote: true,
          courseId: true,
          course: {
            select: { id: true, name: true, courseCode: true, color: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.courseSession.groupBy({
        by: ['status'],
        where: {
          course: courseWhere,
          status: { not: 'cancelled' },
        },
        _count: { _all: true },
      }),
    ]);

    let totalSessionsCount = 0;
    let completedSessionsCount = 0;
    for (const group of sessionStatusCounts) {
      totalSessionsCount += group._count._all;
      if (group.status === 'completed') {
        completedSessionsCount += group._count._all;
      }
    }

    const nextSession =
      candidateUpcomingSessions.find((s) => {
        const sKey = toVnDateString(s.date);
        if (sKey > todayKey) return true;
        if (sKey === todayKey) {
          return s.endTime.padStart(5, '0') >= nowHHMM;
        }
        return false;
      }) || null;

    const recentNotes: typeof notedSessions = [];
    for (const s of notedSessions) {
      if (recentNotes.length >= 5) break;
      const strippedContent = (s.content || '').replace(HTML_TAG_RE, '').trim();
      const strippedNote = (s.personalNote || '').replace(HTML_TAG_RE, '').trim();
      if (strippedContent.length > 0 || strippedNote.length > 0) {
        recentNotes.push(s);
      }
    }

    return NextResponse.json({
      activeSemester,
      coursesCount,
      weeklySessionsCount,
      pendingAssignmentsCount,
      upcomingExamsCount,
      todaySessions,
      nextSession,
      nearestDeadlines,
      recentNotes,
      completedSessionsCount,
      totalSessionsCount,
    });
  } catch (error) {
    return handleApiError(error, 'Không thể tải dữ liệu bảng điều khiển');
  }
}
