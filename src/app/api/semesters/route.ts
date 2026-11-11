import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseVnDate } from '@/lib/timezone';
import { semesterSchema } from '@/lib/validations';

export async function GET() {
  try {
    const userId = await requireAuth();
    const semesters = await prisma.semester.findMany({
      where: { userId },
      include: {
        _count: {
          select: { courses: true },
        },
      },
      orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
    });
    return NextResponse.json(semesters);
  } catch (error) {
    return handleApiError(error, 'Không thể tải danh sách học kỳ');
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
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

    const existingCount = await prisma.semester.count({ where: { userId } });
    const shouldBeActive = parsed.isActive || existingCount === 0;

    const semester = await prisma.$transaction(async (tx) => {
      if (shouldBeActive) {
        await tx.semester.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.semester.create({
        data: {
          name: parsed.name.trim(),
          startDate,
          endDate,
          isActive: shouldBeActive,
          userId,
        },
        include: {
          _count: { select: { courses: true } },
        },
      });
    });

    return NextResponse.json(semester, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Không thể tạo học kỳ');
  }
}

