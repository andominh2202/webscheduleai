import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseVnDate } from '@/lib/timezone';
import { assignmentSchema } from '@/lib/validations';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');
    const completedParam = searchParams.get('completed');
    const priority = searchParams.get('priority');
    const semesterId = searchParams.get('semesterId');

    const assignments = await prisma.assignment.findMany({
      where: {
        userId,
        ...(courseId && courseId !== 'all' ? { courseId } : {}),
        ...(completedParam === 'true'
          ? { completed: true }
          : completedParam === 'false'
            ? { completed: false }
            : {}),
        ...(priority && priority !== 'all' ? { priority } : {}),
        ...(semesterId && semesterId !== 'all' ? { course: { semesterId } } : {}),
      },
      include: {
        course: {
          select: { id: true, name: true, courseCode: true, color: true, semesterId: true },
        },
        session: {
          select: { id: true, date: true, startTime: true, endTime: true },
        },
      },
      orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }],
    });

    return NextResponse.json(assignments);
  } catch (error) {
    return handleApiError(error, 'Không thể tải danh sách bài tập');
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await req.json();
    const parsed = assignmentSchema.parse(body);

    const course = await prisma.course.findFirst({
      where: { id: parsed.courseId, userId },
    });
    if (!course) {
      return NextResponse.json({ error: 'Môn học không tồn tại' }, { status: 404 });
    }

    if (parsed.sessionId) {
      const sess = await prisma.courseSession.findFirst({
        where: { id: parsed.sessionId, course: { userId } },
      });
      if (!sess) {
        return NextResponse.json({ error: 'Buổi học không tồn tại' }, { status: 404 });
      }
    }

    const assignment = await prisma.assignment.create({
      data: {
        title: parsed.title.trim(),
        description: parsed.description?.trim() || null,
        dueDate: parseVnDate(parsed.dueDate),
        priority: parsed.priority,
        courseId: parsed.courseId,
        sessionId: parsed.sessionId || null,
        userId,
      },
      include: {
        course: {
          select: { id: true, name: true, courseCode: true, color: true },
        },
      },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Không thể tạo bài tập');
  }
}

