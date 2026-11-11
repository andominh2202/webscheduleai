import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const target = await prisma.semester.findFirst({
      where: { id, userId },
    });
    if (!target) {
      return NextResponse.json({ error: 'Không tìm thấy học kỳ' }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.semester.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });

      return tx.semester.update({
        where: { id },
        data: { isActive: true },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Không thể kích hoạt học kỳ');
  }
}

