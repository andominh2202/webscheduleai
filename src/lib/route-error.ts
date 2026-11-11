import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from '@/lib/api-helpers';

export function handleApiError(error: unknown, fallbackMessage = 'Lỗi hệ thống') {
  if (error instanceof AuthError || (error instanceof Error && error.message === 'Unauthorized')) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    return NextResponse.json(
      { error: firstIssue?.message || 'Dữ liệu không hợp lệ', issues: error.issues },
      { status: 400 }
    );
  }
  console.error('[API Error]', error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

