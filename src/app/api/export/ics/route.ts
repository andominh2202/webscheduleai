import { NextRequest, NextResponse } from 'next/server';
import ical from 'ical-generator';
import { prisma } from '@/lib/prisma';
import { getActiveSemester, requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { toVnDateString, VN_TIMEZONE } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const semesterIdParam = searchParams.get('semesterId');

    let semesterId: string | undefined;
    if (semesterIdParam && semesterIdParam !== 'all') {
      semesterId = semesterIdParam;
    } else if (!semesterIdParam) {
      const active = await getActiveSemester(userId);
      if (active) semesterId = active.id;
    }

    const [sessions, exams] = await Promise.all([
      prisma.courseSession.findMany({
        where: {
          status: { not: 'cancelled' },
          course: {
            userId,
            ...(semesterId ? { semesterId } : {}),
          },
        },
        include: {
          course: true,
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.exam.findMany({
        where: {
          userId,
          ...(semesterId ? { course: { semesterId } } : {}),
        },
        include: {
          course: true,
        },
      }),
    ]);

    const calendar = ical({
      name: 'WebSchedule - Lịch học cá nhân',
      timezone: VN_TIMEZONE,
    });

    for (const s of sessions) {
      const dateStr = toVnDateString(s.date);
      const start = new Date(`${dateStr}T${s.startTime.padStart(5, '0')}:00+07:00`);
      const end = new Date(`${dateStr}T${s.endTime.padStart(5, '0')}:00+07:00`);

      calendar.createEvent({
        id: `session-${s.id}@webschedule`,
        start,
        end,
        summary: `${s.course.name} (${s.course.courseCode})`,
        location: [s.room ? `Phòng ${s.room}` : null, s.location].filter(Boolean).join(' - ') || undefined,
        description: [
          s.course.instructor ? `Giảng viên: ${s.course.instructor}` : null,
          s.type === 'makeup' ? 'Buổi học bù' : null,
        ]
          .filter(Boolean)
          .join('\n'),
      });
    }

    for (const e of exams) {
      const dateStr = toVnDateString(e.date);
      const startTime = (e.startTime || '07:30').padStart(5, '0');
      const endTime = (e.endTime || '09:30').padStart(5, '0');
      const start = new Date(`${dateStr}T${startTime}:00+07:00`);
      const end = new Date(`${dateStr}T${endTime}:00+07:00`);

      calendar.createEvent({
        id: `exam-${e.id}@webschedule`,
        start,
        end,
        summary: `[THI] ${e.title} - ${e.course.name}`,
        location: [e.room ? `Phòng ${e.room}` : null, e.location].filter(Boolean).join(' - ') || undefined,
        description: e.notes || undefined,
      });
    }

    const icsContent = calendar.toString();

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="thoikhoabieu.ics"',
      },
    });
  } catch (error) {
    return handleApiError(error, 'Không thể xuất file lịch .ics');
  }
}

