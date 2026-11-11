import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseVnDate } from '@/lib/timezone';

type RouteContext = { params: Promise<{ id: string }> };

const updateExamSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(['quiz', 'midterm', 'final', 'other']).optional(),
  date: z.string().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  courseId: z.string().min(1).optional(),
});

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const exam = await prisma.exam.findFirst({
      where: { id, userId },
      include: {
        course: {
          select: { id: true, name: true, courseCode: true, color: true },
        },
      },
    });

    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy lịch thi' }, { status: 404 });
    }

    return NextResponse.json(exam);
  } catch (error) {
    return handleApiError(error, 'Không thể tải thông tin lịch thi');
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.exam.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy lịch thi' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateExamSchema.parse(body);

    if (parsed.courseId) {
      const course = await prisma.course.findFirst({
        where: { id: parsed.courseId, userId },
      });
      if (!course) {
        return NextResponse.json({ error: 'Môn học không tồn tại' }, { status: 404 });
      }
    }

    const updated = await prisma.exam.update({
      where: { id },
      data: {
        ...(parsed.title !== undefined ? { title: parsed.title.trim() } : {}),
        ...(parsed.type !== undefined ? { type: parsed.type } : {}),
        ...(parsed.date !== undefined ? { date: parseVnDate(parsed.date) } : {}),
        ...(parsed.startTime !== undefined ? { startTime: parsed.startTime?.trim() || null } : {}),
        ...(parsed.endTime !== undefined ? { endTime: parsed.endTime?.trim() || null } : {}),
        ...(parsed.room !== undefined ? { room: parsed.room?.trim() || null } : {}),
        ...(parsed.location !== undefined ? { location: parsed.location?.trim() || null } : {}),
        ...(parsed.notes !== undefined ? { notes: parsed.notes?.trim() || null } : {}),
        ...(parsed.courseId !== undefined ? { courseId: parsed.courseId } : {}),
      },
      include: {
        course: {
          select: { id: true, name: true, courseCode: true, color: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Không thể cập nhật lịch thi');
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.exam.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy lịch thi' }, { status: 404 });
    }

    await prisma.exam.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Không thể xóa lịch thi');
  }
}

