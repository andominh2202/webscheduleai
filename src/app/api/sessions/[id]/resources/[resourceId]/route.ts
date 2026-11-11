import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';

type RouteContext = { params: Promise<{ id: string; resourceId: string }> };

const updateResourceSchema = z.object({
  title: z.string().min(1).optional(),
  url: z.string().nullable().optional(),
  type: z.enum(['link', 'file', 'note']).optional(),
});

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id, resourceId } = await context.params;

    const existing = await prisma.resource.findFirst({
      where: { id: resourceId, sessionId: id, session: { course: { userId } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy tài liệu' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateResourceSchema.parse(body);

    const updated = await prisma.resource.update({
      where: { id: resourceId },
      data: {
        ...(parsed.title !== undefined ? { title: parsed.title.trim() } : {}),
        ...(parsed.url !== undefined ? { url: parsed.url?.trim() || null } : {}),
        ...(parsed.type !== undefined ? { type: parsed.type } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Không thể cập nhật tài liệu');
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id, resourceId } = await context.params;

    const existing = await prisma.resource.findFirst({
      where: { id: resourceId, sessionId: id, session: { course: { userId } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy tài liệu' }, { status: 404 });
    }

    await prisma.resource.delete({ where: { id: resourceId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Không thể xóa tài liệu');
  }
}

