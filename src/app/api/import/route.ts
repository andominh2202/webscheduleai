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
import { parseImportedDate, parseImportedDay, parseImportedTime } from '@/lib/schedule-import';

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

    // Validate every imported row before any database write.
    // Refuse malformed dates/times/weekday rather than silently creating incorrect sessions.
    const preparedRows = rows.map((row, index) => {
      const name = getField(row, ['Tên môn học', 'Ten mon hoc', 'name', 'CourseName']);
      const courseCode = getField(row, ['Mã học phần', 'Ma hoc phan', 'courseCode', 'Code']);
      if (!name || !courseCode) throw new Error(`Dòng ${index + 2}: Thiếu tên môn hoặc mã học phần.`);
      const dayRaw = getField(row, ['Thứ', 'Thu', 'dayOfWeek', 'Tên thứ']);
      const day = parseImportedDay(dayRaw);
      if (day === null) throw new Error(`Dòng ${index + 2}: Thứ học không hợp lệ (${dayRaw}). Dùng Thứ 2–Thứ 7, CN hoặc số nội bộ 0–6.`);
      const startTime = parseImportedTime(getField(row, ['Giờ bắt đầu', 'Gio bat dau', 'startTime']));
      const endTime = parseImportedTime(getField(row, ['Giờ kết thúc', 'Gio ket thuc', 'endTime']));
      if (!startTime || !endTime || startTime >= endTime) throw new Error(`Dòng ${index + 2}: Giờ học không hợp lệ, dùng HH:mm và giờ kết thúc sau giờ bắt đầu.`);
      const startRaw = getField(row, ['Từ ngày', 'Tu ngay', 'startDate']);
      const endRaw = getField(row, ['Đến ngày', 'Den ngay', 'endDate']);
      const from = startRaw ? parseImportedDate(startRaw) : null;
      const to = endRaw ? parseImportedDate(endRaw) : null;
      if ((startRaw && !from) || (endRaw && !to) || (from && to && from > to)) {
        throw new Error(`Dòng ${index + 2}: Ngày không hợp lệ. Dùng DD/MM/YYYY hoặc YYYY-MM-DD.`);
      }
      return { row, name, courseCode, day, startTime, endTime, from, to };
    });

    let createdCourses = 0;
    let createdSchedules = 0;
    let createdSessions = 0;
    const warnings: string[] = [];

    const existingCourses = await prisma.course.findMany({
      where: { userId, semesterId: semester.id },
    });
    const courseByCode = new Map(existingCourses.map((c) => [c.courseCode.toLowerCase(), c]));

    for (let i = 0; i < preparedRows.length; i++) {
      const { row, name, courseCode, day, startTime, endTime, from, to } = preparedRows[i];

      const instructor = getField(row, ['Giảng viên', 'Giang vien', 'instructor']);
      const creditsRaw = getField(row, ['Số tín chỉ', 'So tin chi', 'credits']);
      const colorRaw = getField(row, ['Màu sắc', 'Mau sac', 'color']);
      const startPeriodRaw = getField(row, ['Tiết bắt đầu', 'Tiet bat dau', 'startPeriod']);
      const numPeriodsRaw = getField(row, ['Số tiết', 'So tiet', 'numPeriods']);
      const room = getField(row, ['Phòng học', 'Phong hoc', 'room']);
      const location = getField(row, ['Địa điểm', 'Dia diem', 'location']);
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

      const dayOfWeek = day;
      const startDate = from ? parseVnDate(from) : semester.startDate;
      const endDate = to ? parseVnDate(to) : semester.endDate;
      const weekType = ['all', 'even', 'odd'].includes(weekTypeRaw) ? weekTypeRaw : 'all';

      // Idempotent sequential imports: do not create the same recurring schedule twice.
      // Keep existing sessions and their notes/checklists untouched.
      const duplicate = await prisma.schedule.findFirst({
        where: {
          courseId: course.id,
          dayOfWeek,
          startTime,
          endTime,
          startDate,
          endDate,
          weekType,
          room: room || null,
          location: location || null,
        },
        select: { id: true },
      });
      if (duplicate) {
        warnings.push(`Dòng ${i + 2} (${name}): Lịch đã tồn tại, đã bỏ qua để tránh trùng.`);
        continue;
      }

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
    if (error instanceof Error && /^Dòng \d+:/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error, 'Không thể nhập file thời khóa biểu');
  }
}

