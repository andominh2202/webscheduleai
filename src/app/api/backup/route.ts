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

