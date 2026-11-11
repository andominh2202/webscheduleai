import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { getVnDayBounds } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const semesterId = searchParams.get('semesterId');

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (startDate) {
      dateFilter.gte = getVnDayBounds(startDate).start;
    }
    if (endDate) {
      dateFilter.lte = getVnDayBounds(endDate).end;
    }

    const sessions = await prisma.courseSession.findMany({
      where: {
        course: {
          userId,
          ...(semesterId && semesterId !== 'all' ? { semesterId } : {}),
        },
        ...(courseId && courseId !== 'all' ? { courseId } : {}),
        ...(status && status !== 'all' ? { status } : {}),
        ...(startDate || endDate ? { date: dateFilter } : {}),
      },
      include: {
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
    });

    return NextResponse.json(sessions);
  } catch (error) {
    return handleApiError(error, 'Không thể tải danh sách buổi học');
  }
}

