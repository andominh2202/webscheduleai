import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseVnDate } from '@/lib/timezone';
import { examSchema } from '@/lib/validations';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');
    const type = searchParams.get('type');
    const semesterId = searchParams.get('semesterId');

    const exams = await prisma.exam.findMany({
      where: {
        userId,
        ...(courseId && courseId !== 'all' ? { courseId } : {}),
        ...(type && type !== 'all' ? { type } : {}),
        ...(semesterId && semesterId !== 'all' ? { course: { semesterId } } : {}),
      },
      include: {
        course: {
          select: { id: true, name: true, courseCode: true, color: true, semesterId: true },
        },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    return NextResponse.json(exams);
  } catch (error) {
    return handleApiError(error, 'Không thể tải danh sách lịch thi');
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await req.json();
    const parsed = examSchema.parse(body);

    const course = await prisma.course.findFirst({
      where: { id: parsed.courseId, userId },
    });
    if (!course) {
      return NextResponse.json({ error: 'Môn học không tồn tại' }, { status: 404 });
    }

    const exam = await prisma.exam.create({
      data: {
        title: parsed.title.trim(),
        type: parsed.type,
        date: parseVnDate(parsed.date),
        startTime: parsed.startTime?.trim() || null,
        endTime: parsed.endTime?.trim() || null,
        room: parsed.room?.trim() || null,
        location: parsed.location?.trim() || null,
        notes: parsed.notes?.trim() || null,
        courseId: parsed.courseId,
        userId,
      },
      include: {
        course: {
          select: { id: true, name: true, courseCode: true, color: true },
        },
      },
    });

    return NextResponse.json(exam, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Không thể tạo lịch thi');
  }
}

