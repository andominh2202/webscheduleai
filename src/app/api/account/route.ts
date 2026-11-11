import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from '@/lib/password';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';

const updateAccountSchema = z.object({
  name: z.string().trim().min(2, 'Tên phải có ít nhất 2 ký tự').optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'Mật khẩu mới ít nhất 6 ký tự').optional(),
  regenerateCalendarToken: z.boolean().optional(),
});

export async function GET() {
  try {
    const userId = await requireAuth();
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, calendarToken: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
    }

    if (!user.calendarToken) {
      const token = crypto.randomBytes(16).toString('hex');
      user = await prisma.user.update({
        where: { id: userId },
        data: { calendarToken: token },
        select: { id: true, name: true, email: true, calendarToken: true },
      });
    }

    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, 'Không thể tải thông tin tài khoản');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await req.json();
    const parsed = updateAccountSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
    }

    if (parsed.newPassword) {
      if (existing.password && !(await verifyPassword(parsed.currentPassword || '', existing.password)).valid) {
        return NextResponse.json(
          { error: 'Mật khẩu hiện tại không đúng' },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.newPassword ? { password: await hashPassword(parsed.newPassword) } : {}),
        ...(parsed.regenerateCalendarToken
          ? { calendarToken: crypto.randomBytes(16).toString('hex') }
          : {}),
      },
      select: { id: true, name: true, email: true, calendarToken: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Không thể cập nhật tài khoản');
  }
}

