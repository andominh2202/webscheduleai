import { NextRequest, NextResponse } from 'next/server';
import ical from 'ical-generator';
import { prisma } from '@/lib/prisma';
import { toVnDateString, VN_TIMEZONE } from '@/lib/timezone';
import { parseGradingBreakdown } from '@/lib/utils';

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const cleanToken = token.replace(/\.ics$/i, '').trim();

    if (!cleanToken) {
      return new NextResponse('Token không hợp lệ', { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { calendarToken: cleanToken },
      select: { id: true, name: true },
    });

    if (!user) {
      return new NextResponse('Không tìm thấy lịch', { status: 404 });
    }

    const [sessions, exams] = await Promise.all([
      prisma.courseSession.findMany({
        where: {
          status: { not: 'cancelled' },
          course: { userId: user.id },
        },
        include: { course: true },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.exam.findMany({
        where: { userId: user.id },
        include: { course: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const calendar = ical({
      name: `Lịch học - ${user.name || 'WebSchedule'}`,
      timezone: VN_TIMEZONE,
      ttl: 3600,
    });

    for (const s of sessions) {
      const dateStr = toVnDateString(s.date);
      const start = new Date(`${dateStr}T${s.startTime.padStart(5, '0')}:00+07:00`);
      const end = new Date(`${dateStr}T${s.endTime.padStart(5, '0')}:00+07:00`);

      const grades = parseGradingBreakdown(s.course.gradingBreakdown);
      const descParts = [
        s.course.instructor ? `Giảng viên: ${s.course.instructor}` : null,
        s.course.examFormat ? `Hình thức thi: ${s.course.examFormat}` : null,
        s.course.hasMajorAssignment ? 'Có Bài tập lớn' : null,
        grades.length > 0
          ? `Chia điểm: ${grades.map((g) => `${g.weight}% ${g.label}`).join(' / ')}`
          : null,
        s.type === 'makeup' ? 'Buổi học bù' : null,
      ].filter(Boolean);

      calendar.createEvent({
        id: `session-${s.id}@webschedule`,
        start,
        end,
        summary: `${s.course.name}${s.room ? ` (${s.room})` : ''}`,
        location: [s.room ? `Phòng ${s.room}` : null, s.location].filter(Boolean).join(' - ') || undefined,
        description: descParts.join('\n') || undefined,
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

    return new NextResponse(calendar.toString(), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('[Calendar Feed Error]', error);
    return new NextResponse('Lỗi máy chủ', { status: 500 });
  }
}

