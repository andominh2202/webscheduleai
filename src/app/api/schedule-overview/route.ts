import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { getVnDayBounds } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const allSessions = searchParams.get('allSessions') === 'true';
    if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) || (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
      return NextResponse.json({ error: 'Ngày phải theo YYYY-MM-DD' }, { status: 400 });
    }
    const dateFilter = {
      ...(startDate ? { gte: getVnDayBounds(startDate).start } : {}),
      ...(endDate ? { lte: getVnDayBounds(endDate).end } : {}),
    };
    const [courses, assignments, exams, sessions] = await Promise.all([
      prisma.course.findMany({
        where: { userId },
        include: {
          semester: { select: { id: true, name: true, isActive: true } },
          schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
          _count: { select: { schedules: true, sessions: true, assignments: true, exams: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.assignment.findMany({
        where: { userId },
        include: {
          course: { select: { id: true, name: true, courseCode: true, color: true, semesterId: true } },
          session: { select: { id: true, date: true, startTime: true, endTime: true } },
        },
        orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }],
      }),
      prisma.exam.findMany({
        where: { userId },
        include: { course: { select: { id: true, name: true, courseCode: true, color: true, semesterId: true } } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.courseSession.findMany({
        where: {
          course: { userId },
          ...(!allSessions && (startDate || endDate) ? { date: dateFilter } : {}),
        },
        include: {
          course: { select: { id: true, name: true, courseCode: true, color: true, instructor: true, semesterId: true } },
          _count: { select: { checklist: true, resources: true, assignments: true } },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
    ]);
    return NextResponse.json({ courses, assignments, exams, sessions });
  } catch (error) {
    return handleApiError(error, 'Không thể tải dữ liệu thời khóa biểu');
  }
}
