import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkSessionConflicts, requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseVnDate } from '@/lib/timezone';

type RouteContext = { params: Promise<{ id: string }> };

const updateSessionPayloadSchema = z.object({
  status: z.enum(['upcoming', 'completed', 'cancelled']).optional(),
  content: z.string().nullable().optional(),
  personalNote: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  type: z.enum(['regular', 'makeup', 'moved']).optional(),
});

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const session = await prisma.courseSession.findFirst({
      where: { id, course: { userId } },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            courseCode: true,
            color: true,
            instructor: true,
            semesterId: true,
            hasMajorAssignment: true,
            majorAssignmentNote: true,
            examFormat: true,
            examNotes: true,
            gradingBreakdown: true,
          },
        },
        checklist: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        },
        resources: {
          orderBy: { createdAt: 'asc' },
        },
        assignments: {
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi học' }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    return handleApiError(error, 'Không thể tải chi tiết buổi học');
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.courseSession.findFirst({
      where: { id, course: { userId } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy buổi học' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateSessionPayloadSchema.parse(body);

    const nextDate = parsed.date ? parseVnDate(parsed.date) : existing.date;
    const nextStartTime = parsed.startTime ?? existing.startTime;
    const nextEndTime = parsed.endTime ?? existing.endTime;

    if (nextStartTime >= nextEndTime) {
      return NextResponse.json(
        { error: 'Giờ kết thúc phải sau giờ bắt đầu' },
        { status: 400 }
      );
    }

    let conflicts: Awaited<ReturnType<typeof checkSessionConflicts>> = [];
    if (parsed.date !== undefined || parsed.startTime !== undefined || parsed.endTime !== undefined) {
      conflicts = await checkSessionConflicts(
        userId,
        nextDate,
        nextStartTime,
        nextEndTime,
        id
      );
    }

    const updated = await prisma.courseSession.update({
      where: { id },
      data: {
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
        ...(parsed.content !== undefined ? { content: parsed.content } : {}),
        ...(parsed.personalNote !== undefined ? { personalNote: parsed.personalNote } : {}),
        ...(parsed.room !== undefined ? { room: parsed.room?.trim() || null } : {}),
        ...(parsed.location !== undefined ? { location: parsed.location?.trim() || null } : {}),
        ...(parsed.date !== undefined ? { date: nextDate } : {}),
        ...(parsed.startTime !== undefined ? { startTime: parsed.startTime } : {}),
        ...(parsed.endTime !== undefined ? { endTime: parsed.endTime } : {}),
        ...(parsed.type !== undefined ? { type: parsed.type } : {}),
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            courseCode: true,
            color: true,
            instructor: true,
          },
        },
        checklist: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
        resources: { orderBy: { createdAt: 'asc' } },
        assignments: { orderBy: { dueDate: 'asc' } },
      },
    });

    return NextResponse.json({ ...updated, conflicts });
  } catch (error) {
    return handleApiError(error, 'Không thể cập nhật buổi học');
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.courseSession.findFirst({
      where: { id, course: { userId } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy buổi học' }, { status: 404 });
    }

    await prisma.courseSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Không thể xóa buổi học');
  }
}

