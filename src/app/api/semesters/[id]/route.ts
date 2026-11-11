import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseVnDate } from '@/lib/timezone';
import { semesterSchema } from '@/lib/validations';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const semester = await prisma.semester.findFirst({
      where: { id, userId },
      include: {
        _count: { select: { courses: true } },
      },
    });

    if (!semester) {
      return NextResponse.json({ error: 'Không tìm thấy học kỳ' }, { status: 404 });
    }

    return NextResponse.json(semester);
  } catch (error) {
    return handleApiError(error, 'Không thể tải thông tin học kỳ');
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.semester.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy học kỳ' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = semesterSchema.parse(body);

    const startDate = parseVnDate(parsed.startDate);
    const endDate = parseVnDate(parsed.endDate);

    if (endDate < startDate) {
      return NextResponse.json(
        { error: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu' },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (parsed.isActive) {
        await tx.semester.updateMany({
          where: { userId, isActive: true, id: { not: id } },
          data: { isActive: false },
        });
      }

      return tx.semester.update({
        where: { id },
        data: {
          name: parsed.name.trim(),
          startDate,
          endDate,
          isActive: parsed.isActive,
        },
        include: {
          _count: { select: { courses: true } },
        },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Không thể cập nhật học kỳ');
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const userId = await requireAuth();
    const { id } = await context.params;

    const existing = await prisma.semester.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy học kỳ' }, { status: 404 });
    }

    await prisma.semester.delete({ where: { id } });

    if (existing.isActive) {
      const nextSem = await prisma.semester.findFirst({
        where: { userId },
        orderBy: { startDate: 'desc' },
      });
      if (nextSem) {
        await prisma.semester.update({
          where: { id: nextSem.id },
          data: { isActive: true },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Không thể xóa học kỳ');
  }
}

