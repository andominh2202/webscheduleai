import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

const updateChecklistSchema = z.object({
  text: z.string().min(1).optional(),
  completed: z.boolean().optional(),
  order: z.number().int().optional(),
});

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id, itemId } = await context.params;

    const existing = await prisma.checklistItem.findFirst({
      where: { id: itemId, sessionId: id, session: { course: { userId } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy mục checklist' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateChecklistSchema.parse(body);

    const updated = await prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        ...(parsed.text !== undefined ? { text: parsed.text.trim() } : {}),
        ...(parsed.completed !== undefined ? { completed: parsed.completed } : {}),
        ...(parsed.order !== undefined ? { order: parsed.order } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Không thể cập nhật mục checklist');
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id, itemId } = await context.params;

    const existing = await prisma.checklistItem.findFirst({
      where: { id: itemId, sessionId: id, session: { course: { userId } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy mục checklist' }, { status: 404 });
    }

    await prisma.checklistItem.delete({ where: { id: itemId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Không thể xóa mục checklist');
  }
}

