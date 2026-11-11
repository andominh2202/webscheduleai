import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { checklistItemSchema } from '@/lib/validations';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const session = await prisma.courseSession.findFirst({
      where: { id, course: { userId } },
    });
    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi học' }, { status: 404 });
    }

    const items = await prisma.checklistItem.findMany({
      where: { sessionId: id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json(items);
  } catch (error) {
    return handleApiError(error, 'Không thể tải danh sách checklist');
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const session = await prisma.courseSession.findFirst({
      where: { id, course: { userId } },
    });
    if (!session) {
      return NextResponse.json({ error: 'Không tìm thấy buổi học' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = checklistItemSchema.parse({ ...body, sessionId: id });

    const item = await prisma.checklistItem.create({
      data: {
        text: parsed.text.trim(),
        completed: parsed.completed,
        order: parsed.order,
        sessionId: id,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Không thể thêm mục checklist');
  }
}

