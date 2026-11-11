import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';

type RouteContext = { params: Promise<{ id: string }> };

const copyNotesSchema = z.object({
  targetSessionId: z.string().min(1, 'Vui lòng chọn buổi học đích'),
  mode: z.enum(['append', 'overwrite']).default('append'),
});

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const body = await req.json();
    const { targetSessionId, mode } = copyNotesSchema.parse(body);

    if (id === targetSessionId) {
      return NextResponse.json(
        { error: 'Buổi học đích phải khác buổi học nguồn' },
        { status: 400 }
      );
    }

    const [source, target] = await Promise.all([
      prisma.courseSession.findFirst({
        where: { id, course: { userId } },
        include: { checklist: true, resources: true },
      }),
      prisma.courseSession.findFirst({
        where: { id: targetSessionId, course: { userId } },
      }),
    ]);

    if (!source || !target) {
      return NextResponse.json({ error: 'Không tìm thấy buổi học' }, { status: 404 });
    }

    const mergeText = (existingText: string | null, incomingText: string | null) => {
      const inc = incomingText?.trim();
      if (!inc) return existingText;
      if (mode === 'overwrite' || !existingText?.trim()) return incomingText;
      return `${existingText.trim()}\n<hr />\n${inc}`;
    };

    const updatedTarget = await prisma.courseSession.update({
      where: { id: targetSessionId },
      data: {
        content: mergeText(target.content, source.content),
        personalNote: mergeText(target.personalNote, source.personalNote),
      },
    });

    return NextResponse.json(updatedTarget);
  } catch (error) {
    return handleApiError(error, 'Không thể sao chép ghi chú');
  }
}

