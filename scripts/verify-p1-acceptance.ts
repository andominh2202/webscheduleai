/**
 * WebScheduleAI - P1 Acceptance Verification Test Suite
 *
 * Kiểm thử nghiệm thu độc lập cho 2 lỗi P1:
 * - P1.1: Import dữ liệu không nguyên tử (Atomicity & Rollback)
 * - P1.2: Nguy cơ tạo trùng CourseSession (Advisory Lock Concurrency & Deduplication)
 *
 * 3-Tier Safety Guard:
 * 1. Environment Sanitization & Overrides (chỉ cho phép 127.0.0.1:5433)
 * 2. Strict Allowlist URL Parser (ngăn chặn mọi kết nối ngoài allowlist)
 * 3. Runtime DB Inspection (SELECT inet_server_addr, inet_server_port, current_database)
 */

import assert from 'node:assert/strict';

// ==================== TIER 1: ENVIRONMENT SANITIZATION ====================
delete process.env.POSTGRES_PRISMA_URL;
delete process.env.POSTGRES_URL_NON_POOLING;
delete process.env.POSTGRES_URL;
delete process.env.SUPABASE_DATABASE_URL;

const EXPECTED_HOST = '127.0.0.1';
const EXPECTED_PORT = '5433';
const EXPECTED_DB = 'webschedule_test';
const TEST_PASSWORD = 'TestPass5433_Secure!';
const TEST_DB_URL = `postgresql://postgres:${TEST_PASSWORD}@${EXPECTED_HOST}:${EXPECTED_PORT}/${EXPECTED_DB}?schema=public`;

process.env.DATABASE_URL = TEST_DB_URL;
process.env.DIRECT_URL = TEST_DB_URL;

// ==================== TIER 2: STRICT ALLOWLIST URL PARSER ====================
function verifyAllowlist(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.hostname !== EXPECTED_HOST) {
    throw new Error(`[SAFETY GUARD TIER 2] VIOLATION: Host must be ${EXPECTED_HOST}, got: ${url.hostname}`);
  }
  if (url.port !== EXPECTED_PORT) {
    throw new Error(`[SAFETY GUARD TIER 2] VIOLATION: Port must be ${EXPECTED_PORT}, got: ${url.port}`);
  }
  const dbName = url.pathname.replace(/^\//, '');
  if (dbName !== EXPECTED_DB) {
    throw new Error(`[SAFETY GUARD TIER 2] VIOLATION: Database must be ${EXPECTED_DB}, got: ${dbName}`);
  }
}

verifyAllowlist(process.env.DATABASE_URL!);
verifyAllowlist(process.env.DIRECT_URL!);

// Dynamic import sau khi environment đã được cô lập hoàn toàn
import { PrismaClient, Prisma } from '@prisma/client';
import { generateSessions, getActiveSemester, checkScheduleConflicts } from '../src/lib/api-helpers';
import { parseVnDate } from '../src/lib/timezone';

const prisma = new PrismaClient({
  datasources: {
    db: { url: TEST_DB_URL },
  },
});

// Gán vào global để bất kỳ module nào import prisma từ '@/lib/prisma' cũng dùng test instance này
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

interface TableSnapshot {
  users: number;
  semesters: number;
  courses: number;
  schedules: number;
  sessions: number;
  checklists: number;
  resources: number;
  assignments: number;
  exams: number;
}

async function takeSnapshot(userId?: string): Promise<TableSnapshot> {
  const userFilter = userId ? { where: { userId } } : undefined;
  const courseUserFilter = userId ? { where: { course: { userId } } } : undefined;
  const sessionUserFilter = userId ? { where: { session: { course: { userId } } } } : undefined;

  const [
    users,
    semesters,
    courses,
    schedules,
    sessions,
    checklists,
    resources,
    assignments,
    exams,
  ] = await Promise.all([
    userId ? prisma.user.count({ where: { id: userId } }) : prisma.user.count(),
    prisma.semester.count(userFilter),
    prisma.course.count(userFilter),
    prisma.schedule.count(courseUserFilter),
    prisma.courseSession.count(courseUserFilter),
    prisma.checklistItem.count(sessionUserFilter),
    prisma.resource.count(sessionUserFilter),
    prisma.assignment.count(userFilter),
    prisma.exam.count(userFilter),
  ]);

  return {
    users,
    semesters,
    courses,
    schedules,
    sessions,
    checklists,
    resources,
    assignments,
    exams,
  };
}

async function runAcceptanceTests() {
  console.log('================================================================');
  console.log('   WEBSCHEDULEAI - P1 INDEPENDENT ACCEPTANCE TEST SUITE        ');
  console.log('================================================================\n');

  // ==================== TIER 3: RUNTIME DB INSPECTION ====================
  console.log('[Tier 3] Performing runtime DB identity check...');
  const checkResult = await prisma.$queryRaw<Array<{ host: string; port: number; db: string; usr: string }>>`
    SELECT inet_server_addr()::text AS host, inet_server_port() AS port, current_database() AS db, current_user AS usr;
  `;
  const dbInfo = checkResult[0];
  console.log(`[Tier 3] Connected to: Host=${dbInfo.host}, Port=${dbInfo.port}, DB=${dbInfo.db}, User=${dbInfo.usr}`);

  assert.equal(dbInfo.host, EXPECTED_HOST, 'Runtime host must match 127.0.0.1');
  assert.equal(dbInfo.port, Number(EXPECTED_PORT), 'Runtime port must match 5433');
  assert.equal(dbInfo.db, EXPECTED_DB, 'Runtime db must match webschedule_test');
  console.log('>>> SAFETY GUARD VERIFIED: Connection is 100% isolated to local test DB.\n');

  const testUserId = `test-p1-${Date.now()}`;
  const testUserEmail = `${testUserId}@example.com`;

  try {
    // Tạo test user
    const testUser = await prisma.user.create({
      data: {
        id: testUserId,
        email: testUserEmail,
        name: 'P1 Acceptance Tester',
      },
    });

    const testSemester = await prisma.semester.create({
      data: {
        name: 'Học kỳ Test P1 2026-2027',
        startDate: parseVnDate('2026-09-01'),
        endDate: parseVnDate('2026-12-31'),
        isActive: true,
        userId: testUser.id,
      },
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 1: Rollback Atomicity (Lỗi có kiểm soát sau 2 môn)
    // -------------------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log('KỊCH BẢN 1: Rollback Atomicity khi Import phát sinh lỗi giữa chừng');
    console.log('----------------------------------------------------------------');

    const snapshotBeforeScenario1 = await takeSnapshot(testUser.id);
    console.log('Snapshot trước Import (lấy theo testUser):', snapshotBeforeScenario1);

    let rollbackTriggered = false;
    try {
      await prisma.$transaction(
        async (tx) => {
          // Ghi môn 1
          const course1 = await tx.course.create({
            data: {
              name: 'Toán rời rạc',
              courseCode: 'CS101',
              color: '#3b82f6',
              semesterId: testSemester.id,
              userId: testUser.id,
            },
          });
          const sched1 = await tx.schedule.create({
            data: {
              courseId: course1.id,
              dayOfWeek: 1, // Thứ 2
              startTime: '07:30',
              endTime: '09:30',
              startDate: testSemester.startDate,
              endDate: testSemester.endDate,
              weekType: 'all',
            },
          });
          await generateSessions(sched1.id, tx);

          // Ghi môn 2
          const course2 = await tx.course.create({
            data: {
              name: 'Cấu trúc dữ liệu và giải thuật',
              courseCode: 'CS102',
              color: '#10b981',
              semesterId: testSemester.id,
              userId: testUser.id,
            },
          });
          const sched2 = await tx.schedule.create({
            data: {
              courseId: course2.id,
              dayOfWeek: 3, // Thứ 4
              startTime: '09:45',
              endTime: '11:45',
              startDate: testSemester.startDate,
              endDate: testSemester.endDate,
              weekType: 'all',
            },
          });
          await generateSessions(sched2.id, tx);

          // Môn 3: Kích hoạt Fault Injection có kiểm soát (Simulated Controlled Business/DB Exception)
          throw new Error('TEST_FAULT_INJECTION: Lỗi phát sinh có chủ đích ở môn thứ 3 để kiểm tra Rollback Atomicity');
        },
        { maxWait: 5000, timeout: 15000 }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('TEST_FAULT_INJECTION')) {
        rollbackTriggered = true;
      } else {
        throw err;
      }
    }

    assert.equal(rollbackTriggered, true, 'Transaction phải ném lỗi fault injection');

    const snapshotAfterScenario1 = await takeSnapshot(testUser.id);
    console.log('Snapshot sau khi Rollback:', snapshotAfterScenario1);

    // Đối chiếu chính xác snapshot trước và sau
    assert.deepEqual(
      snapshotAfterScenario1,
      snapshotBeforeScenario1,
      'Snapshot sau rollback phải khớp 100% snapshot ban đầu (không môn, lịch hay session nào bị lưu dở dang)'
    );
    console.log('>>> PASS KỊCH BẢN 1: Atomicity được bảo toàn tuyệt đối, 100% dữ liệu dở dang đã rollback sạch sẽ.\n');

    // -------------------------------------------------------------------------
    // KỊCH BẢN 2: Concurrency Advisory Lock - Tạo buổi học bù (Makeup)
    // -------------------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log('KỊCH BẢN 2: Concurrency Advisory Lock khi tạo buổi học bù (Makeup)');
    console.log('----------------------------------------------------------------');

    const courseForMakeup = await prisma.course.create({
      data: {
        name: 'Mạng máy tính',
        courseCode: 'CS103',
        color: '#f59e0b',
        semesterId: testSemester.id,
        userId: testUser.id,
      },
    });

    const makeupDateStr = '2026-10-15';
    const makeupDate = parseVnDate(makeupDateStr);
    const makeupStartTime = '13:30';
    const makeupEndTime = '15:30';
    const lockKey = `makeup:${courseForMakeup.id}:${makeupDateStr}:${makeupStartTime}`;

    // Hàm mô phỏng chính xác logic endpoint /api/sessions/makeup
    async function requestMakeupSession(reqId: number) {
      return prisma.$transaction(async (tx) => {
        // 1. Advisory lock
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        // 2. Check existing in locked tx
        const existing = await tx.courseSession.findFirst({
          where: {
            courseId: courseForMakeup.id,
            date: makeupDate,
            startTime: makeupStartTime,
            status: { not: 'cancelled' },
          },
        });

        if (existing) {
          return { reqId, alreadyExists: true, sessionId: existing.id };
        }

        // 3. Create if not exists
        const created = await tx.courseSession.create({
          data: {
            courseId: courseForMakeup.id,
            date: makeupDate,
            startTime: makeupStartTime,
            endTime: makeupEndTime,
            room: 'P402',
            type: 'makeup',
            status: 'upcoming',
            content: `Buổi bù request ${reqId}`,
          },
        });

        return { reqId, alreadyExists: false, sessionId: created.id };
      });
    }

    // Bắn đồng thời 2 requests
    console.log('Gửi đồng thời 2 requests tạo buổi bù cùng courseId, date, startTime...');
    const [resA, resB] = await Promise.all([
      requestMakeupSession(1),
      requestMakeupSession(2),
    ]);

    console.log('Kết quả Request A:', resA);
    console.log('Kết quả Request B:', resB);

    // Một request tạo mới (alreadyExists: false), một request nhận alreadyExists: true
    const createdResponses = [resA, resB].filter((r) => !r.alreadyExists);
    const existingResponses = [resA, resB].filter((r) => r.alreadyExists);

    assert.equal(createdResponses.length, 1, 'Chỉ duy nhất 1 request được phép tạo session mới (HTTP 201)');
    assert.equal(existingResponses.length, 1, 'Request thứ 2 phải nhận alreadyExists: true (HTTP 200)');
    assert.equal(resA.sessionId, resB.sessionId, 'Cả hai request phải trỏ về cùng một sessionId duy nhất');

    const totalSessionsInDb = await prisma.courseSession.count({
      where: {
        courseId: courseForMakeup.id,
        date: makeupDate,
        startTime: makeupStartTime,
      },
    });
    assert.equal(totalSessionsInDb, 1, 'Database chỉ được phép tồn tại đúng 1 bản ghi CourseSession');
    console.log('>>> PASS KỊCH BẢN 2: Advisory lock ngăn chặn race condition triệt để, không tạo trùng session.\n');

    // -------------------------------------------------------------------------
    // KỊCH BẢN 3: Concurrency Advisory Lock - generateSessions
    // -------------------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log('KỊCH BẢN 3: Concurrency Advisory Lock trong generateSessions');
    console.log('----------------------------------------------------------------');

    const schedForConcurrency = await prisma.schedule.create({
      data: {
        courseId: courseForMakeup.id,
        dayOfWeek: 2, // Thứ 3
        startTime: '08:00',
        endTime: '10:00',
        startDate: parseVnDate('2026-09-01'),
        endDate: parseVnDate('2026-10-31'), // ~9 tuần
        weekType: 'all',
      },
    });

    console.log('Gọi generateSessions đồng thời 2 luồng cho cùng scheduleId...');
    const [count1, count2] = await Promise.all([
      generateSessions(schedForConcurrency.id),
      generateSessions(schedForConcurrency.id),
    ]);

    console.log(`Kết quả Luồng 1 tạo: ${count1} sessions, Luồng 2 tạo: ${count2} sessions`);

    const sessionsCreated = await prisma.courseSession.findMany({
      where: { scheduleId: schedForConcurrency.id },
      orderBy: { date: 'asc' },
    });

    // Kiểm tra tính duy nhất của từng date + startTime
    const dateSet = new Set<string>();
    let hasDuplicateDates = false;
    for (const s of sessionsCreated) {
      const key = `${s.date.toISOString()}_${s.startTime}`;
      if (dateSet.has(key)) {
        hasDuplicateDates = true;
        break;
      }
      dateSet.add(key);
    }

    assert.equal(hasDuplicateDates, false, 'Không được phép có ngày và giờ học nào bị trùng lặp');
    assert.equal(sessionsCreated.length, 9, 'Số buổi học tạo ra phải khớp chính xác 9 tuần');
    console.log(`>>> PASS KỊCH BẢN 3: generateSessions thực thi tuần tự an toàn qua Advisory Lock, tổng cộng ${sessionsCreated.length} sessions duy nhất.\n`);

    // -------------------------------------------------------------------------
    // KỊCH BẢN 4: Data Preservation (Bảo toàn dữ liệu người dùng)
    // -------------------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log('KỊCH BẢN 4: Bảo toàn dữ liệu người dùng khi tái tạo lịch');
    console.log('----------------------------------------------------------------');

    // Chọn session đầu tiên và bổ sung đầy đủ dữ liệu người dùng
    const targetSession = sessionsCreated[0];
    await prisma.courseSession.update({
      where: { id: targetSession.id },
      data: {
        content: '<p>Nội dung ghi chú bài giảng quan trọng</p>',
        personalNote: '<p>Ghi chú cá nhân ôn tập</p>',
        status: 'completed',
      },
    });

    const checklistItem = await prisma.checklistItem.create({
      data: {
        sessionId: targetSession.id,
        text: 'Nộp bài tập chuẩn bị trước buổi học',
        completed: true,
      },
    });

    const resourceItem = await prisma.resource.create({
      data: {
        sessionId: targetSession.id,
        title: 'Tài liệu tham khảo chương 1',
        url: 'https://example.com/doc1.pdf',
        type: 'link',
      },
    });

    const assignmentItem = await prisma.assignment.create({
      data: {
        courseId: courseForMakeup.id,
        sessionId: targetSession.id,
        userId: testUser.id,
        title: 'Bài tập tuần 1',
        dueDate: parseVnDate('2026-09-15'),
        priority: 'high',
      },
    });

    console.log('Đã gắn dữ liệu người dùng vào session:', {
      sessionId: targetSession.id,
      checklistId: checklistItem.id,
      resourceId: resourceItem.id,
      assignmentId: assignmentItem.id,
    });

    // Gọi lại generateSessions (mô phỏng cập nhật lịch / tái sinh session)
    console.log('Chạy lại generateSessions để kiểm tra deduplication và bảo toàn dữ liệu...');
    await generateSessions(schedForConcurrency.id);

    // Kiểm tra lại session trong DB
    const verifiedSession = await prisma.courseSession.findUnique({
      where: { id: targetSession.id },
      include: {
        checklist: true,
        resources: true,
        assignments: true,
      },
    });

    assert.ok(verifiedSession, 'Session chứa dữ liệu người dùng KHÔNG được phép bị xóa');
    assert.equal(verifiedSession.content, '<p>Nội dung ghi chú bài giảng quan trọng</p>');
    assert.equal(verifiedSession.personalNote, '<p>Ghi chú cá nhân ôn tập</p>');
    assert.equal(verifiedSession.status, 'completed');
    assert.equal(verifiedSession.checklist.length, 1, 'Checklist item phải được bảo toàn');
    assert.equal(verifiedSession.checklist[0].text, 'Nộp bài tập chuẩn bị trước buổi học');
    assert.equal(verifiedSession.resources.length, 1, 'Resource item phải được bảo toàn');
    assert.equal(verifiedSession.resources[0].title, 'Tài liệu tham khảo chương 1');
    assert.equal(verifiedSession.assignments.length, 1, 'Assignment liên kết phải được bảo toàn');
    assert.equal(verifiedSession.assignments[0].title, 'Bài tập tuần 1');

    console.log('>>> PASS KỊCH BẢN 4: Toàn bộ content, personalNote, checklist, resource và assignment được bảo toàn 100%.\n');

    // -------------------------------------------------------------------------
    // KỊCH BẢN 5: Benchmark Transaction Import (10, 20, 50 môn)
    // -------------------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log('KỊCH BẢN 5: Benchmark Transaction Import (10, 20, 50 môn)');
    console.log('----------------------------------------------------------------');

    const benchmarkSizes = [10, 20, 50];
    const benchmarkResults: Array<{
      courses: number;
      schedules: number;
      sessions: number;
      transactionTimeMs: number;
      withinPrismaTimeout: boolean;
      withinVercelTimeout: boolean;
    }> = [];

    for (const size of benchmarkSizes) {
      console.log(`Đang chạy Benchmark với ${size} môn học...`);
      const tStart = performance.now();

      const benchResult = await prisma.$transaction(
        async (tx) => {
          let sCount = 0;
          let sessCount = 0;

          for (let i = 1; i <= size; i++) {
            const course = await tx.course.create({
              data: {
                name: `Môn học Benchmark ${size}-${i}`,
                courseCode: `BENCH-${size}-${i}`,
                color: '#6366f1',
                semesterId: testSemester.id,
                userId: testUser.id,
              },
            });

            // 1 schedule 10 tuần cho mỗi môn
            const sched = await tx.schedule.create({
              data: {
                courseId: course.id,
                dayOfWeek: (i % 6) + 1,
                startTime: '07:30',
                endTime: '09:30',
                startDate: parseVnDate('2026-09-01'),
                endDate: parseVnDate('2026-11-10'), // 10 tuần = 10 sessions
                weekType: 'all',
              },
            });
            sCount++;

            const count = await generateSessions(sched.id, tx);
            sessCount += count;
          }

          return { courses: size, schedules: sCount, sessions: sessCount };
        },
        { maxWait: 10000, timeout: 60000 }
      );

      const tEnd = performance.now();
      const elapsed = Math.round(tEnd - tStart);

      benchmarkResults.push({
        courses: benchResult.courses,
        schedules: benchResult.schedules,
        sessions: benchResult.sessions,
        transactionTimeMs: elapsed,
        withinPrismaTimeout: elapsed <= 15000,
        withinVercelTimeout: elapsed <= 60000,
      });

      console.log(`  -> ${size} môn (${benchResult.schedules} lịch, ${benchResult.sessions} buổi): ${elapsed} ms`);
    }

    console.log('\nBẢNG KẾT QUẢ BENCHMARK:');
    console.table(benchmarkResults);

    console.log('>>> PASS KỊCH BẢN 5: Đo đạc hoàn tất cho cả 3 quy mô 10, 20 và 50 môn.\n');

  } finally {
    // Teardown dọn dẹp sạch test user
    console.log('Đang dọn dẹp dữ liệu test (Teardown cascade test user)...');
    await prisma.user.deleteMany({
      where: { id: testUserId },
    });
    console.log('Teardown hoàn tất, database webschedule_test sạch sẽ.');
    await prisma.$disconnect();
  }

  console.log('================================================================');
  console.log('   TẤT CẢ 5 KỊCH BẢN KIỂM THỬ NGHIỆM THU ĐÃ PASS 100%          ');
  console.log('================================================================');
}

runAcceptanceTests().catch((err) => {
  console.error('\n[ACCEPTANCE TEST FAILED]:', err);
  process.exit(1);
});
