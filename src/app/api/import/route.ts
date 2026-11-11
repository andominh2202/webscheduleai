import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { prisma } from '@/lib/prisma';
import {
  checkScheduleConflicts,
  generateSessions,
  getActiveSemester,
  requireAuth,
} from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseVnDate } from '@/lib/timezone';
import { COURSE_COLORS } from '@/lib/utils';

interface RawRow {
  [key: string]: unknown;
}

function getField(row: RawRow, keys: string[]): string {
  for (const k of keys) {
    const val = row[k];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function parseDayOfWeek(val: string): number {
  const num = Number(val);
  if (!Number.isNaN(num) && num >= 0 && num <= 6) return num;
  if (num === 8) return 0; // Nhiều trường ở VN ghi CN = 8 hoặc 0
  const lower = val.toLowerCase();
  if (lower.includes('chủ nhật') || lower === 'cn') return 0;
  if (lower.includes('2')) return 1;
  if (lower.includes('3')) return 2;
  if (lower.includes('4')) return 3;
  if (lower.includes('5')) return 4;
  if (lower.includes('6')) return 5;
  if (lower.includes('7')) return 6;
  return 1;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const semesterIdInput = (formData.get('semesterId') as string | null) || '';

    if (!file) {
      return NextResponse.json({ error: 'Vui lòng chọn file Excel hoặc CSV' }, { status: 400 });
    }

    let semester = semesterIdInput
      ? await prisma.semester.findFirst({ where: { id: semesterIdInput, userId } })
      : await getActiveSemester(userId);

    if (!semester) {
      const now = new Date();
      const end = new Date(now.getTime() + 120 * 86400000);
      semester = await prisma.semester.create({
        data: {
          name: 'Học kỳ mặc định',
          startDate: parseVnDate(now),
          endDate: parseVnDate(end),
          isActive: true,
          userId,
        },
      });
    }

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    let rows: RawRow[] = [];

    if (fileName.endsWith('.csv')) {
      const text = new TextDecoder('utf-8').decode(arrayBuffer);
      const parsed = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
      rows = parsed.data;
    } else {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (firstSheet) {
        rows = XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[firstSheet]);
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File không có dữ liệu hợp lệ' }, { status: 400 });
    }

    let createdCourses = 0;
    let createdSchedules = 0;
    let createdSessions = 0;
    const warnings: string[] = [];

    const existingCourses = await prisma.course.findMany({
      where: { userId, semesterId: semester.id },
    });
    const courseByCode = new Map(existingCourses.map((c) => [c.courseCode.toLowerCase(), c]));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = getField(row, ['Tên môn học', 'Ten mon hoc', 'name', 'CourseName']);
      const courseCode = getField(row, ['Mã học phần', 'Ma hoc phan', 'courseCode', 'Code']);
      if (!name || !courseCode) {
        warnings.push(`Dòng ${i + 2}: Thiếu tên môn hoặc mã học phần, đã bỏ qua.`);
        continue;
      }

      const instructor = getField(row, ['Giảng viên', 'Giang vien', 'instructor']);
      const creditsRaw = getField(row, ['Số tín chỉ', 'So tin chi', 'credits']);
      const colorRaw = getField(row, ['Màu sắc', 'Mau sac', 'color']);
      const dayRaw = getField(row, ['Thứ', 'Thu', 'dayOfWeek', 'Tên thứ']);
      const startTime = getField(row, ['Giờ bắt đầu', 'Gio bat dau', 'startTime']) || '07:30';
      const endTime = getField(row, ['Giờ kết thúc', 'Gio ket thuc', 'endTime']) || '09:30';
      const startPeriodRaw = getField(row, ['Tiết bắt đầu', 'Tiet bat dau', 'startPeriod']);
      const numPeriodsRaw = getField(row, ['Số tiết', 'So tiet', 'numPeriods']);
      const room = getField(row, ['Phòng học', 'Phong hoc', 'room']);
      const location = getField(row, ['Địa điểm', 'Dia diem', 'location']);
      const startDateRaw = getField(row, ['Từ ngày', 'Tu ngay', 'startDate']);
      const endDateRaw = getField(row, ['Đến ngày', 'Den ngay', 'endDate']);
      const weekTypeRaw = getField(row, ['Loại tuần', 'Loai tuan', 'weekType']) || 'all';

      let course = courseByCode.get(courseCode.toLowerCase());
      if (!course) {
        const color = colorRaw || COURSE_COLORS[createdCourses % COURSE_COLORS.length];
        course = await prisma.course.create({
          data: {
            name,
            courseCode,
            instructor: instructor || null,
            credits: creditsRaw ? Number(creditsRaw) || null : null,
            color,
            semesterId: semester.id,
            userId,
          },
        });
        courseByCode.set(courseCode.toLowerCase(), course);
        createdCourses++;
      }

      const dayOfWeek = parseDayOfWeek(dayRaw || '1');
      const startDate = startDateRaw ? parseVnDate(startDateRaw) : semester.startDate;
      const endDate = endDateRaw ? parseVnDate(endDateRaw) : semester.endDate;
      const weekType = ['all', 'even', 'odd'].includes(weekTypeRaw) ? weekTypeRaw : 'all';

      const conflicts = await checkScheduleConflicts({
        userId,
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate,
        weekType,
      });

      if (conflicts.length > 0) {
        warnings.push(
          `Dòng ${i + 2} (${name}): Trùng giờ với "${conflicts[0].course.name}".`
        );
      }

      const schedule = await prisma.schedule.create({
        data: {
          courseId: course.id,
          dayOfWeek,
          startTime,
          endTime,
          startPeriod: startPeriodRaw ? Number(startPeriodRaw) || null : null,
          numPeriods: numPeriodsRaw ? Number(numPeriodsRaw) || null : null,
          room: room || null,
          location: location || null,
          startDate,
          endDate,
          weekType,
        },
      });
      createdSchedules++;

      const count = await generateSessions(schedule.id);
      if (count) createdSessions += count;
    }

    return NextResponse.json({
      success: true,
      createdCourses,
      createdSchedules,
      createdSessions,
      warnings,
    });
  } catch (error) {
    return handleApiError(error, 'Không thể nhập file thời khóa biểu');
  }
}

