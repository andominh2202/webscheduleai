import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { prisma } from '@/lib/prisma';
import { getActiveSemester, requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { toVnDateString } from '@/lib/timezone';
import { getDayName } from '@/lib/utils';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(req.url);
    const formatType = searchParams.get('format') || 'xlsx';
    const semesterIdParam = searchParams.get('semesterId');

    let semesterId: string | undefined;
    if (semesterIdParam && semesterIdParam !== 'all') {
      semesterId = semesterIdParam;
    } else if (!semesterIdParam) {
      const active = await getActiveSemester(userId);
      if (active) semesterId = active.id;
    }

    const schedules = await prisma.schedule.findMany({
      where: {
        course: {
          userId,
          ...(semesterId ? { semesterId } : {}),
        },
      },
      include: {
        course: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    const rows = schedules.map((s) => ({
      'Tên môn học': s.course.name,
      'Mã học phần': s.course.courseCode,
      'Giảng viên': s.course.instructor || '',
      'Số tín chỉ': s.course.credits ?? '',
      'Thứ': s.dayOfWeek,
      'Tên thứ': getDayName(s.dayOfWeek),
      'Giờ bắt đầu': s.startTime,
      'Giờ kết thúc': s.endTime,
      'Tiết bắt đầu': s.startPeriod ?? '',
      'Số tiết': s.numPeriods ?? '',
      'Phòng học': s.room || '',
      'Địa điểm': s.location || '',
      'Từ ngày': toVnDateString(s.startDate),
      'Đến ngày': toVnDateString(s.endDate),
      'Loại tuần': s.weekType,
      'Màu sắc': s.course.color,
    }));

    if (formatType === 'csv') {
      const csv = '\uFEFF' + Papa.unparse(rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="thoikhoabieu.csv"',
        },
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ThoiKhoaBieu');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="thoikhoabieu.xlsx"',
      },
    });
  } catch (error) {
    return handleApiError(error, 'Không thể xuất thời khóa biểu');
  }
}

