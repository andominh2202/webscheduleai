import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { courseSchema } from '@/lib/validations';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const course = await prisma.course.findFirst({
      where: { id, userId },
      include: {
        semester: true,
        schedules: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        _count: {
          select: { schedules: true, sessions: true, assignments: true, exams: true },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: 'Không tìm thấy môn học' }, { status: 404 });
    }

    return NextResponse.json(course);
  } catch (error) {
    return handleApiError(error, 'Không thể tải thông tin môn học');
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.course.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy môn học' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = courseSchema.parse(body);

    const semester = await prisma.semester.findFirst({
      where: { id: parsed.semesterId, userId },
    });
    if (!semester) {
      return NextResponse.json({ error: 'Học kỳ không tồn tại' }, { status: 404 });
    }

    const updated = await prisma.course.update({
      where: { id },
      data: {
        name: parsed.name.trim(),
        courseCode: parsed.courseCode.trim(),
        instructor: parsed.instructor?.trim() || null,
        color: parsed.color || '#3b82f6',
        notes: parsed.notes?.trim() || null,
        credits: parsed.credits ?? null,
        semesterId: parsed.semesterId,
        hasMajorAssignment: Boolean(parsed.hasMajorAssignment),
        majorAssignmentNote: parsed.majorAssignmentNote?.trim() || null,
        examFormat: parsed.examFormat?.trim() || null,
        examNotes: parsed.examNotes?.trim() || null,
        gradingBreakdown: parsed.gradingBreakdown?.trim() || null,
      },
      include: {
        schedules: true,
        _count: {
          select: { schedules: true, sessions: true, assignments: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Không thể cập nhật môn học');
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.course.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy môn học' }, { status: 404 });
    }

    await prisma.course.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Không thể xóa môn học');
  }
}

