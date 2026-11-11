import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { resourceSchema } from '@/lib/validations';

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

    const resources = await prisma.resource.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(resources);
  } catch (error) {
    return handleApiError(error, 'Không thể tải danh sách tài liệu');
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
    const parsed = resourceSchema.parse({ ...body, sessionId: id });

    const resource = await prisma.resource.create({
      data: {
        title: parsed.title.trim(),
        url: parsed.url?.trim() || null,
        type: parsed.type,
        sessionId: id,
      },
    });

    return NextResponse.json(resource, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Không thể thêm tài liệu');
  }
}

