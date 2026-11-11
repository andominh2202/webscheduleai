import { PrismaClient } from '@prisma/client';
import {
  checkScheduleConflicts,
  generateSessions,
} from '../src/lib/api-helpers';
import { parseVnDate, toVnDateString } from '../src/lib/timezone';

const prisma = new PrismaClient();

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`✓ ${message}`);
}

async function runTests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ LOGIC LỊCH HỌC & GHI CHÚ ===');

  const testEmail = `test-verify-${Date.now()}@webschedule.vn`;
  const user = await prisma.user.create({
    data: { email: testEmail, name: 'Test Verify', password: 'test' },
  });

  try {
    const semester = await prisma.semester.create({
      data: {
        name: 'HK Test',
        startDate: parseVnDate('2026-09-07'),
        endDate: parseVnDate('2026-10-18'), // 6 tuần
        isActive: true,
        userId: user.id,
      },
    });

    const courseA = await prisma.course.create({
      data: {
        name: 'Môn A',
        courseCode: 'TEST101',
        semesterId: semester.id,
        userId: user.id,
      },
    });

    const courseB = await prisma.course.create({
      data: {
        name: 'Môn B',
        courseCode: 'TEST102',
        semesterId: semester.id,
        userId: user.id,
      },
    });

    // 1. Tạo lịch tuần lẻ cho Môn A (Thứ 2, 07:30-09:30)
    const schedOdd = await prisma.schedule.create({
      data: {
        courseId: courseA.id,
        dayOfWeek: 1,
        startTime: '07:30',
        endTime: '09:30',
        startDate: parseVnDate('2026-09-07'),
        endDate: parseVnDate('2026-10-18'),
        weekType: 'odd',
      },
    });

    const countOdd = await generateSessions(schedOdd.id);
    assert(countOdd === 3, `Lịch tuần lẻ 6 tuần tạo đúng 3 buổi (thực tế: ${countOdd})`);

    // Chạy lại generateSessions không được tạo bản ghi trùng
    await generateSessions(schedOdd.id);
    const sessionsOdd = await prisma.courseSession.findMany({
      where: { scheduleId: schedOdd.id },
      orderBy: { date: 'asc' },
    });
    assert(
      sessionsOdd.length === 3,
      `Gọi lại generateSessions không tạo bản ghi trùng (vẫn ${sessionsOdd.length} buổi)`
    );

    // Kiểm tra múi giờ VN: mọi buổi sinh ra đều phải là Thứ 2 (2026-09-07, 2026-09-21, 2026-10-05)
    const dateStrings = sessionsOdd.map((s) => toVnDateString(s.date));
    assert(
      dateStrings.join(',') === '2026-09-07,2026-09-21,2026-10-05',
      `Ngày theo múi giờ Asia/Ho_Chi_Minh chính xác: ${dateStrings.join(', ')}`
    );

    // 2. Kiểm tra phát hiện trùng lịch:
    // - Môn B tuần chẵn cùng Thứ 2 07:30-09:30 -> KHÔNG trùng với tuần lẻ
    const conflictsEven = await checkScheduleConflicts({
      userId: user.id,
      dayOfWeek: 1,
      startTime: '07:30',
      endTime: '09:30',
      startDate: parseVnDate('2026-09-07'),
      endDate: parseVnDate('2026-10-18'),
      weekType: 'even',
    });
    assert(
      conflictsEven.length === 0,
      'Tuần chẵn cùng giờ thứ với tuần lẻ không bị báo trùng nhầm'
    );

    // - Môn B tuần all hoặc odd 08:30-10:30 -> BỊ phát hiện trùng
    const conflictsOverlap = await checkScheduleConflicts({
      userId: user.id,
      dayOfWeek: 1,
      startTime: '08:30',
      endTime: '10:30',
      startDate: parseVnDate('2026-09-07'),
      endDate: parseVnDate('2026-10-18'),
      weekType: 'all',
    });
    assert(
      conflictsOverlap.length === 1 && conflictsOverlap[0].courseId === courseA.id,
      'Phát hiện chính xác trùng lịch khi giao thời gian'
    );

    // 3. Kiểm tra ghi chú riêng cho từng buổi không ghi đè nhau và được bảo toàn khi update schedule
    await prisma.courseSession.update({
      where: { id: sessionsOdd[0].id },
      data: {
        content: '<p>Ghi chú buổi 1</p>',
        personalNote: '<p>Note riêng 1</p>',
        status: 'completed',
      },
    });
    await prisma.courseSession.update({
      where: { id: sessionsOdd[1].id },
      data: {
        content: '<p>Ghi chú buổi 2</p>',
      },
    });

    // Cập nhật phòng học của schedule -> regenerate phải giữ nguyên ghi chú buổi 1 và buổi 2
    await prisma.schedule.update({
      where: { id: schedOdd.id },
      data: { room: 'P.999' },
    });
    await generateSessions(schedOdd.id);

    const [b1, b2, b3] = await prisma.courseSession.findMany({
      where: { scheduleId: schedOdd.id },
      orderBy: { date: 'asc' },
    });

    assert(
      b1.content === '<p>Ghi chú buổi 1</p>' && b1.personalNote === '<p>Note riêng 1</p>',
      'Ghi chú buổi 1 được giữ nguyên và bảo toàn sau khi cập nhật lịch lặp'
    );
    assert(
      b2.content === '<p>Ghi chú buổi 2</p>' && b3.content === null,
      'Ghi chú buổi 2 và buổi 3 độc lập hoàn toàn, không ghi đè lẫn nhau'
    );
    assert(
      b1.room === 'P.999' && b2.room === 'P.999',
      'Phòng học mới được đồng bộ cho các buổi học'
    );

    console.log('=== TẤT CẢ KIỂM THỬ LOGIC ĐÃ ĐẠT 100% ===');
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

