import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  checkScheduleConflicts,
  generateSessions,
  requireAuth,
} from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseVnDate } from '@/lib/timezone';
import { scheduleSchema } from '@/lib/validations';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');

    const schedules = await prisma.schedule.findMany({
      where: {
        course: { userId },
        ...(courseId ? { courseId } : {}),
      },
      include: {
        course: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return NextResponse.json(schedules);
  } catch (error) {
    return handleApiError(error, 'Không thể tải danh sách lịch học');
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await req.json();
    const parsed = scheduleSchema.parse(body);

    if (parsed.startTime >= parsed.endTime) {
      return NextResponse.json(
        { error: 'Giờ kết thúc phải sau giờ bắt đầu' },
        { status: 400 }
      );
    }

    const startDate = parseVnDate(parsed.startDate);
    const endDate = parseVnDate(parsed.endDate);
    if (endDate < startDate) {
      return NextResponse.json(
        { error: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu' },
        { status: 400 }
      );
    }

    const course = await prisma.course.findFirst({
      where: { id: parsed.courseId, userId },
    });
    if (!course) {
      return NextResponse.json({ error: 'Môn học không tồn tại' }, { status: 404 });
    }

    const conflicts = await checkScheduleConflicts({
      userId,
      dayOfWeek: parsed.dayOfWeek,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      startDate,
      endDate,
      weekType: parsed.weekType,
    });

    const schedule = await prisma.schedule.create({
      data: {
        courseId: parsed.courseId,
        dayOfWeek: parsed.dayOfWeek,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        startPeriod: parsed.startPeriod ?? null,
        numPeriods: parsed.numPeriods ?? null,
        room: parsed.room?.trim() || null,
        location: parsed.location?.trim() || null,
        startDate,
        endDate,
        weekType: parsed.weekType,
      },
      include: { course: true },
    });

    const sessionsCreated = await generateSessions(schedule.id);

    return NextResponse.json(
      {
        ...schedule,
        schedule,
        conflicts,
        sessionsCreated,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, 'Không thể tạo lịch học');
  }
}

