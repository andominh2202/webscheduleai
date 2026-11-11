import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkSessionConflicts, requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseVnDate } from '@/lib/timezone';

const makeupSessionSchema = z.object({
  courseId: z.string().min(1, 'Chọn môn học'),
  date: z.string().min(1, 'Chọn ngày học'),
  startTime: z.string().min(1, 'Nhập giờ bắt đầu'),
  endTime: z.string().min(1, 'Nhập giờ kết thúc'),
  room: z.string().optional(),
  location: z.string().optional(),
  type: z.enum(['makeup', 'moved', 'regular']).default('makeup'),
  content: z.string().optional(),
  personalNote: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await req.json();
    const parsed = makeupSessionSchema.parse(body);

    if (parsed.startTime >= parsed.endTime) {
      return NextResponse.json(
        { error: 'Giờ kết thúc phải sau giờ bắt đầu' },
        { status: 400 }
      );
    }

    const course = await prisma.course.findFirst({
      where: { id: parsed.courseId, userId },
    });
    if (!course) {
      return NextResponse.json({ error: 'Môn học không tồn tại' }, { status: 404 });
    }

    const date = parseVnDate(parsed.date);
    const conflicts = await checkSessionConflicts(
      userId,
      date,
      parsed.startTime,
      parsed.endTime
    );

    const session = await prisma.courseSession.create({
      data: {
        courseId: parsed.courseId,
        date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        room: parsed.room?.trim() || null,
        location: parsed.location?.trim() || null,
        type: parsed.type,
        status: 'upcoming',
        content: parsed.content?.trim() || null,
        personalNote: parsed.personalNote?.trim() || null,
      },
      include: {
        course: {
          select: { id: true, name: true, courseCode: true, color: true },
        },
      },
    });

    return NextResponse.json({ ...session, conflicts }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Không thể tạo buổi học bù');
  }
}

