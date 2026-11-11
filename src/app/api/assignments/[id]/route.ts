import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseVnDate } from '@/lib/timezone';

type RouteContext = { params: Promise<{ id: string }> };

const updateAssignmentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  dueDate: z.string().optional(),
  completed: z.boolean().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  courseId: z.string().min(1).optional(),
  sessionId: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const assignment = await prisma.assignment.findFirst({
      where: { id, userId },
      include: {
        course: {
          select: { id: true, name: true, courseCode: true, color: true },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Không tìm thấy bài tập' }, { status: 404 });
    }

    return NextResponse.json(assignment);
  } catch (error) {
    return handleApiError(error, 'Không thể tải thông tin bài tập');
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.assignment.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy bài tập' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateAssignmentSchema.parse(body);

    if (parsed.courseId) {
      const course = await prisma.course.findFirst({
        where: { id: parsed.courseId, userId },
      });
      if (!course) {
        return NextResponse.json({ error: 'Môn học không tồn tại' }, { status: 404 });
      }
    }

    const updated = await prisma.assignment.update({
      where: { id },
      data: {
        ...(parsed.title !== undefined ? { title: parsed.title.trim() } : {}),
        ...(parsed.description !== undefined
          ? { description: parsed.description?.trim() || null }
          : {}),
        ...(parsed.dueDate !== undefined ? { dueDate: parseVnDate(parsed.dueDate) } : {}),
        ...(parsed.completed !== undefined ? { completed: parsed.completed } : {}),
        ...(parsed.priority !== undefined ? { priority: parsed.priority } : {}),
        ...(parsed.courseId !== undefined ? { courseId: parsed.courseId } : {}),
        ...(parsed.sessionId !== undefined ? { sessionId: parsed.sessionId } : {}),
      },
      include: {
        course: {
          select: { id: true, name: true, courseCode: true, color: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Không thể cập nhật bài tập');
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.assignment.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy bài tập' }, { status: 404 });
    }

    await prisma.assignment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Không thể xóa bài tập');
  }
}

