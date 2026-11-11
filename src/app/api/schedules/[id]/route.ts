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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const schedule = await prisma.schedule.findFirst({
      where: { id, course: { userId } },
      include: { course: true },
    });

    if (!schedule) {
      return NextResponse.json({ error: 'Không tìm thấy lịch học' }, { status: 404 });
    }

    return NextResponse.json(schedule);
  } catch (error) {
    return handleApiError(error, 'Không thể tải lịch học');
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.schedule.findFirst({
      where: { id, course: { userId } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy lịch học' }, { status: 404 });
    }

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

    const conflicts = await checkScheduleConflicts({
      userId,
      dayOfWeek: parsed.dayOfWeek,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      startDate,
      endDate,
      weekType: parsed.weekType,
      excludeScheduleId: id,
    });

    const updated = await prisma.schedule.update({
      where: { id },
      data: {
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

    const sessionsCount = await generateSessions(updated.id);

    return NextResponse.json({
      ...updated,
      schedule: updated,
      conflicts,
      sessionsCount,
    });
  } catch (error) {
    return handleApiError(error, 'Không thể cập nhật lịch học');
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.schedule.findFirst({
      where: { id, course: { userId } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy lịch học' }, { status: 404 });
    }

    // Xóa các buổi regular chưa có nội dung ghi chú/tài liệu/checklist thuộc schedule này
    await prisma.courseSession.deleteMany({
      where: {
        scheduleId: id,
        type: 'regular',
        content: null,
        personalNote: null,
        checklist: { none: {} },
        resources: { none: {} },
        assignments: { none: {} },
      },
    });

    await prisma.schedule.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Không thể xóa lịch học');
  }
}

