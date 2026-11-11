import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { toVnDateString, VN_TIMEZONE } from '@/lib/timezone';

export async function GET() {
  try {
    const userId = await requireAuth();
    const configured = Boolean(
      process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    );
    const googleAccount = await prisma.account.findFirst({
      where: { userId, provider: 'google' },
      select: { providerAccountId: true, scope: true, expires_at: true },
    });

    return NextResponse.json({
      configured,
      connected: Boolean(googleAccount),
      scope: googleAccount?.scope || null,
    });
  } catch (error) {
    return handleApiError(error, 'Không thể kiểm tra cấu hình Google Calendar');
  }
}

export async function POST() {
  try {
    const userId = await requireAuth();

    if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
      return NextResponse.json(
        {
          error:
            'Google OAuth chưa được cấu hình (thiếu AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET trong .env)',
        },
        { status: 400 }
      );
    }

    const googleAccount = await prisma.account.findFirst({
      where: { userId, provider: 'google' },
    });

    if (!googleAccount?.access_token) {
      return NextResponse.json(
        { error: 'Tài khoản chưa liên kết với Google Calendar' },
        { status: 400 }
      );
    }

    const sessions = await prisma.courseSession.findMany({
      where: {
        course: { userId },
        status: 'upcoming',
        date: { gte: new Date() },
      },
      include: { course: true },
      take: 50,
    });

    let syncedCount = 0;
    for (const s of sessions) {
      const dateStr = toVnDateString(s.date);
      const start = `${dateStr}T${s.startTime.padStart(5, '0')}:00+07:00`;
      const end = `${dateStr}T${s.endTime.padStart(5, '0')}:00+07:00`;

      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${googleAccount.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: `${s.course.name} (${s.course.courseCode})`,
            location: [s.room ? `Phòng ${s.room}` : null, s.location].filter(Boolean).join(' - '),
            start: { dateTime: start, timeZone: VN_TIMEZONE },
            end: { dateTime: end, timeZone: VN_TIMEZONE },
          }),
        }
      );

      if (res.ok) syncedCount++;
    }

    return NextResponse.json({ success: true, syncedCount });
  } catch (error) {
    return handleApiError(error, 'Lỗi đồng bộ Google Calendar');
  }
}

