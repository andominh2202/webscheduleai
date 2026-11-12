import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';

export async function GET() {
  try {
    const userId = await requireAuth();

    const [semesters, courses, schedules, sessions, assignments, exams] =
      await Promise.all([
        prisma.semester.findMany({ where: { userId } }),
        prisma.course.findMany({ where: { userId } }),
        prisma.schedule.findMany({ where: { course: { userId } } }),
        prisma.courseSession.findMany({
          where: { course: { userId } },
          include: { checklist: true, resources: true },
        }),
        prisma.assignment.findMany({ where: { userId } }),
        prisma.exam.findMany({ where: { userId } }),
      ]);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { semesters, courses, schedules, sessions, assignments, exams },
    };

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="webschedule-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Không thể tạo bản sao lưu');
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await req.json();
    const data = body?.data;

    if (!data || !Array.isArray(data.semesters) || !Array.isArray(data.courses)) {
      return NextResponse.json(
        { error: 'File sao lưu không đúng định dạng WebSchedule' },
        { status: 400 }
      );
    }

    // Fail closed before deleting anything: a partial or malformed backup must never
    // silently replace a user's complete dataset with only a subset.
    const sections = ['semesters', 'courses', 'schedules', 'sessions', 'assignments', 'exams'] as const;
    if (body?.version !== 1 || sections.some((key) => !Array.isArray(data[key]))) {
      return NextResponse.json({ error: 'Bản sao lưu thiếu dữ liệu hoặc phiên bản không hỗ trợ. Không thay đổi dữ liệu hiện tại.' }, { status: 400 });
    }
    if (sections.some((key) => data[key].length > 20000)) {
      return NextResponse.json({ error: 'Bản sao lưu quá lớn, đã từ chối để bảo vệ dữ liệu.' }, { status: 413 });
    }
    const hasUniqueIds = (items: unknown[]): boolean =>
      items.every((item) => typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string' && Boolean((item as { id: string }).id)) &&
      new Set(items.map((item) => (item as { id: string }).id)).size === items.length;
    if (sections.some((key) => !hasUniqueIds(data[key]))) {
      return NextResponse.json({ error: 'Bản sao lưu có ID trống hoặc trùng. Không thay đổi dữ liệu.' }, { status: 400 });
    }
    const semesterIds = new Set<string>(data.semesters.map((item: { id: string }) => item.id));
    const courseIds = new Set<string>(data.courses.map((item: { id: string }) => item.id));
    const scheduleIds = new Set<string>(data.schedules.map((item: { id: string }) => item.id));
    const sessionIds = new Set<string>(data.sessions.map((item: { id: string }) => item.id));
    const validDate = (input: unknown) => typeof input === 'string' && !Number.isNaN(new Date(input).getTime());
    const invalid =
      data.semesters.some((item: { name?: unknown; startDate?: unknown; endDate?: unknown }) => !item.name || !validDate(item.startDate) || !validDate(item.endDate)) ||
      data.courses.some((item: { name?: unknown; courseCode?: unknown; semesterId: string }) => !item.name || !item.courseCode || !semesterIds.has(item.semesterId)) ||
      data.schedules.some((item: { courseId: string; dayOfWeek: number; startTime: string; endTime: string; startDate: string; endDate: string }) =>
        !courseIds.has(item.courseId) || !Number.isInteger(item.dayOfWeek) || item.dayOfWeek < 0 || item.dayOfWeek > 6 ||
        !validDate(item.startDate) || !validDate(item.endDate) || item.startDate > item.endDate || !item.startTime || !item.endTime || item.startTime >= item.endTime) ||
      data.sessions.some((item: { courseId: string; scheduleId?: string | null; date?: string; startTime?: string; endTime?: string }) =>
        !courseIds.has(item.courseId) || (item.scheduleId != null && !scheduleIds.has(item.scheduleId)) ||
        !validDate(item.date) || !item.startTime || !item.endTime || item.startTime >= item.endTime) ||
      data.assignments.some((item: { courseId: string; sessionId?: string | null; dueDate?: string }) =>
        !courseIds.has(item.courseId) || (item.sessionId != null && !sessionIds.has(item.sessionId)) || !validDate(item.dueDate)) ||
      data.exams.some((item: { courseId: string; date?: string }) => !courseIds.has(item.courseId) || !validDate(item.date));
    if (invalid) {
      return NextResponse.json({ error: 'Bản sao lưu không nhất quán hoặc có ngày sai. Dữ liệu hiện tại vẫn được giữ nguyên.' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.exam.deleteMany({ where: { userId } });
      await tx.assignment.deleteMany({ where: { userId } });
      await tx.course.deleteMany({ where: { userId } });
      await tx.semester.deleteMany({ where: { userId } });

      const semesterIdMap = new Map<string, string>();
      for (const sem of data.semesters) {
        const created = await tx.semester.create({
          data: {
            name: String(sem.name),
            startDate: new Date(sem.startDate),
            endDate: new Date(sem.endDate),
            isActive: Boolean(sem.isActive),
            userId,
          },
        });
        semesterIdMap.set(sem.id, created.id);
      }

      const courseIdMap = new Map<string, string>();
      for (const c of data.courses) {
        const newSemId = semesterIdMap.get(c.semesterId);
        if (!newSemId) continue;
        const created = await tx.course.create({
          data: {
            name: String(c.name),
            courseCode: String(c.courseCode),
            instructor: c.instructor || null,
            color: c.color || '#3b82f6',
            notes: c.notes || null,
            credits: c.credits ?? null,
            semesterId: newSemId,
            userId,
          },
        });
        courseIdMap.set(c.id, created.id);
      }

      const scheduleIdMap = new Map<string, string>();
      for (const sch of data.schedules || []) {
        const newCourseId = courseIdMap.get(sch.courseId);
        if (!newCourseId) continue;
        const created = await tx.schedule.create({
          data: {
            courseId: newCourseId,
            dayOfWeek: Number(sch.dayOfWeek),
            startTime: String(sch.startTime),
            endTime: String(sch.endTime),
            startPeriod: sch.startPeriod ?? null,
            numPeriods: sch.numPeriods ?? null,
            room: sch.room || null,
            location: sch.location || null,
            startDate: new Date(sch.startDate),
            endDate: new Date(sch.endDate),
            weekType: sch.weekType || 'all',
          },
        });
        scheduleIdMap.set(sch.id, created.id);
      }

      const sessionIdMap = new Map<string, string>();
      for (const sess of data.sessions || []) {
        const newCourseId = courseIdMap.get(sess.courseId);
        if (!newCourseId) continue;
        const created = await tx.courseSession.create({
          data: {
            date: new Date(sess.date),
            startTime: String(sess.startTime),
            endTime: String(sess.endTime),
            room: sess.room || null,
            location: sess.location || null,
            status: sess.status || 'upcoming',
            type: sess.type || 'regular',
            content: sess.content || null,
            personalNote: sess.personalNote || null,
            courseId: newCourseId,
            scheduleId: sess.scheduleId ? scheduleIdMap.get(sess.scheduleId) || null : null,
          },
        });
        sessionIdMap.set(sess.id, created.id);

        if (Array.isArray(sess.checklist) && sess.checklist.length > 0) {
          await tx.checklistItem.createMany({
            data: sess.checklist.map((item: { text: string; completed: boolean; order: number }) => ({
              text: String(item.text),
              completed: Boolean(item.completed),
              order: Number(item.order || 0),
              sessionId: created.id,
            })),
          });
        }

        if (Array.isArray(sess.resources) && sess.resources.length > 0) {
          await tx.resource.createMany({
            data: sess.resources.map((res: { title: string; url?: string; type?: string }) => ({
              title: String(res.title),
              url: res.url || null,
              type: res.type || 'link',
              sessionId: created.id,
            })),
          });
        }
      }

      for (const a of data.assignments || []) {
        const newCourseId = courseIdMap.get(a.courseId);
        if (!newCourseId) continue;
        await tx.assignment.create({
          data: {
            title: String(a.title),
            description: a.description || null,
            dueDate: new Date(a.dueDate),
            completed: Boolean(a.completed),
            priority: a.priority || 'medium',
            courseId: newCourseId,
            sessionId: a.sessionId ? sessionIdMap.get(a.sessionId) || null : null,
            userId,
          },
        });
      }

      for (const ex of data.exams || []) {
        const newCourseId = courseIdMap.get(ex.courseId);
        if (!newCourseId) continue;
        await tx.exam.create({
          data: {
            title: String(ex.title),
            type: ex.type || 'midterm',
            date: new Date(ex.date),
            startTime: ex.startTime || null,
            endTime: ex.endTime || null,
            room: ex.room || null,
            location: ex.location || null,
            notes: ex.notes || null,
            courseId: newCourseId,
            userId,
          },
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Khôi phục dữ liệu thành công' });
  } catch (error) {
    return handleApiError(error, 'Không thể khôi phục dữ liệu');
  }
}

