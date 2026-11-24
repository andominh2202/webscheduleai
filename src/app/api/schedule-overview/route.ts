import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { getVnDayBounds } from '@/lib/timezone';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = req.nextUrl;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const allSessions = searchParams.get('allSessions') === 'true';

    if ((startDate && !DATE_RE.test(startDate)) || (endDate && !DATE_RE.test(endDate))) {
      return NextResponse.json({ error: 'Ngày phải theo YYYY-MM-DD' }, { status: 400 });
    }

    const dateFilter = {
      ...(startDate ? { gte: getVnDayBounds(startDate).start } : {}),
      ...(endDate ? { lte: getVnDayBounds(endDate).end } : {}),
    };

    const [courses, assignments, exams, sessions] = await Promise.all([
      prisma.course.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          courseCode: true,
          instructor: true,
          color: true,
          notes: true,
          credits: true,
          semesterId: true,
          hasMajorAssignment: true,
          majorAssignmentNote: true,
          examFormat: true,
          examNotes: true,
          gradingBreakdown: true,
          semester: { select: { id: true, name: true, isActive: true } },
          schedules: {
            select: {
              id: true,
              courseId: true,
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              startPeriod: true,
              numPeriods: true,
              room: true,
              location: true,
              startDate: true,
              endDate: true,
              weekType: true,
            },
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
          },
          _count: {
            select: { schedules: true, sessions: true, assignments: true, exams: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.assignment.findMany({
        where: { userId },
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
            select: { id: true, name: true, courseCode: true, color: true, semesterId: true },
          },
          session: {
            select: { id: true, date: true, startTime: true, endTime: true },
          },
        },
        orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }],
      }),
      prisma.exam.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          type: true,
          date: true,
          startTime: true,
          endTime: true,
          room: true,
          location: true,
          notes: true,
          courseId: true,
          course: {
            select: { id: true, name: true, courseCode: true, color: true, semesterId: true },
          },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.courseSession.findMany({
        where: {
          course: { userId },
          ...(!allSessions && (startDate || endDate) ? { date: dateFilter } : {}),
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
          courseId: true,
          scheduleId: true,
          course: {
            select: {
              id: true,
              name: true,
              courseCode: true,
              color: true,
              instructor: true,
              semesterId: true,
            },
          },
          _count: {
            select: { checklist: true, resources: true, assignments: true },
          },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
    ]);

    return NextResponse.json({ courses, assignments, exams, sessions });
  } catch (error) {
    return handleApiError(error, 'Không thể tải dữ liệu thời khóa biểu');
  }
}
