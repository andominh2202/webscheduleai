import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    if (!q) {
      return NextResponse.json({ courses: [], notes: [], assignments: [], exams: [] });
    }

    const [courses, sessions, assignments, exams] = await Promise.all([
      prisma.course.findMany({
        where: { userId },
        select: { id: true, name: true, courseCode: true, instructor: true, color: true },
      }),
      prisma.courseSession.findMany({
        where: {
          course: { userId },
          OR: [
            { AND: [{ content: { not: null } }, { content: { not: '' } }] },
            { AND: [{ personalNote: { not: null } }, { personalNote: { not: '' } }] },
          ],
        },
        include: {
          course: { select: { id: true, name: true, courseCode: true, color: true } },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.assignment.findMany({
        where: { userId },
        include: {
          course: { select: { id: true, name: true, color: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.exam.findMany({
        where: { userId },
        include: {
          course: { select: { id: true, name: true, color: true } },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    const matchedCourses = courses
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.courseCode.toLowerCase().includes(q) ||
          (c.instructor && c.instructor.toLowerCase().includes(q))
      )
      .slice(0, 5);

    const matchedNotes = sessions
      .filter((s) => {
        const plainContent = (s.content || '').replace(/<[^>]*>/g, ' ').toLowerCase();
        const plainNote = (s.personalNote || '').replace(/<[^>]*>/g, ' ').toLowerCase();
        return (
          plainContent.includes(q) ||
          plainNote.includes(q) ||
          s.course.name.toLowerCase().includes(q)
        );
      })
      .slice(0, 5);

    const matchedAssignments = assignments
      .filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)) ||
          a.course.name.toLowerCase().includes(q)
      )
      .slice(0, 5);

    const matchedExams = exams
      .filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.room && e.room.toLowerCase().includes(q)) ||
          e.course.name.toLowerCase().includes(q)
      )
      .slice(0, 5);

    return NextResponse.json({
      courses: matchedCourses,
      notes: matchedNotes,
      assignments: matchedAssignments,
      exams: matchedExams,
    });
  } catch (error) {
    return handleApiError(error, 'Lỗi tìm kiếm');
  }
}

