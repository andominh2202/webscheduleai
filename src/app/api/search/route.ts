import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';

const HTML_TAG_RE = /<[^>]*>/g;
const MAX_HITS_PER_GROUP = 5;

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();

    if (!q) {
      return NextResponse.json({ courses: [], notes: [], assignments: [], exams: [] });
    }

    const [courses, sessions, assignments, exams] = await Promise.all([
      prisma.course.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          courseCode: true,
          instructor: true,
          color: true,
        },
      }),
      prisma.courseSession.findMany({
        where: {
          course: { userId },
          OR: [
            { AND: [{ content: { not: null } }, { content: { not: '' } }] },
            { AND: [{ personalNote: { not: null } }, { personalNote: { not: '' } }] },
          ],
        },
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          status: true,
          content: true,
          personalNote: true,
          courseId: true,
          course: {
            select: { id: true, name: true, courseCode: true, color: true },
          },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.assignment.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          description: true,
          dueDate: true,
          completed: true,
          priority: true,
          courseId: true,
          course: {
            select: { id: true, name: true, color: true },
          },
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.exam.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          type: true,
          date: true,
          startTime: true,
          endTime: true,
          room: true,
          location: true,
          courseId: true,
          course: {
            select: { id: true, name: true, color: true },
          },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    const matchedCourses: typeof courses = [];
    for (const c of courses) {
      if (matchedCourses.length >= MAX_HITS_PER_GROUP) break;
      if (
        c.name.toLowerCase().includes(q) ||
        c.courseCode.toLowerCase().includes(q) ||
        (c.instructor && c.instructor.toLowerCase().includes(q))
      ) {
        matchedCourses.push(c);
      }
    }

    const matchedNotes: typeof sessions = [];
    for (const s of sessions) {
      if (matchedNotes.length >= MAX_HITS_PER_GROUP) break;
      if (s.course.name.toLowerCase().includes(q)) {
        matchedNotes.push(s);
        continue;
      }
      const plainContent = s.content ? s.content.replace(HTML_TAG_RE, ' ').toLowerCase() : '';
      if (plainContent.includes(q)) {
        matchedNotes.push(s);
        continue;
      }
      const plainNote = s.personalNote
        ? s.personalNote.replace(HTML_TAG_RE, ' ').toLowerCase()
        : '';
      if (plainNote.includes(q)) {
        matchedNotes.push(s);
      }
    }

    const matchedAssignments: typeof assignments = [];
    for (const a of assignments) {
      if (matchedAssignments.length >= MAX_HITS_PER_GROUP) break;
      if (
        a.title.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q)) ||
        a.course.name.toLowerCase().includes(q)
      ) {
        matchedAssignments.push(a);
      }
    }

    const matchedExams: typeof exams = [];
    for (const e of exams) {
      if (matchedExams.length >= MAX_HITS_PER_GROUP) break;
      if (
        e.title.toLowerCase().includes(q) ||
        (e.room && e.room.toLowerCase().includes(q)) ||
        e.course.name.toLowerCase().includes(q)
      ) {
        matchedExams.push(e);
      }
    }

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
