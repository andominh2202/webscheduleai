import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { hashPassword } from '@/lib/password';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/route-error';
import { addVnDays, parseVnDate } from '@/lib/timezone';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Họ và tên phải có ít nhất 2 ký tự'),
  email: z.string().trim().email('Email không hợp lệ').toLowerCase(),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: parsed.email },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Email này đã được đăng ký. Vui lòng chuyển sang tab Đăng nhập.' },
        { status: 409 }
      );
    }

    const calendarToken = crypto.randomBytes(16).toString('hex');
    const now = new Date();

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: parsed.name,
          email: parsed.email,
          password: await hashPassword(parsed.password),
          calendarToken,
        },
        select: {
          id: true,
          name: true,
          email: true,
          calendarToken: true,
        },
      });

      // Tạo sẵn 1 học kỳ mặc định để người dùng mới dùng được ngay
      await tx.semester.create({
        data: {
          name: 'Học kỳ 1 - 2026-2027',
          startDate: parseVnDate(addVnDays(now, -30)),
          endDate: parseVnDate(addVnDays(now, 90)),
          isActive: true,
          userId: createdUser.id,
        },
      });

      return createdUser;
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Không thể tạo tài khoản');
  }
}

