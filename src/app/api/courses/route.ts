import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveSemester, requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { courseSchema } from '@/lib/validations';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const semesterIdParam = searchParams.get('semesterId');

    let semesterFilter: string | undefined;
    if (semesterIdParam === 'active') {
      const active = await getActiveSemester(userId);
      if (active) semesterFilter = active.id;
    } else if (semesterIdParam && semesterIdParam !== 'all') {
      semesterFilter = semesterIdParam;
    }

    const courses = await prisma.course.findMany({
      where: {
        userId,
        ...(semesterFilter ? { semesterId: semesterFilter } : {}),
      },
      include: {
        semester: {
          select: { id: true, name: true, isActive: true },
        },
        schedules: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        _count: {
          select: { schedules: true, sessions: true, assignments: true, exams: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(courses);
  } catch (error) {
    return handleApiError(error, 'Không thể tải danh sách môn học');
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await req.json();
    const parsed = courseSchema.parse(body);

    const semester = await prisma.semester.findFirst({
      where: { id: parsed.semesterId, userId },
    });
    if (!semester) {
      return NextResponse.json({ error: 'Học kỳ không tồn tại' }, { status: 404 });
    }

    const course = await prisma.course.create({
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
        userId,
      },
      include: {
        schedules: true,
        _count: {
          select: { schedules: true, sessions: true, assignments: true },
        },
      },
    });

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Không thể tạo môn học');
  }
}

