import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { generateSessions } from '../src/lib/api-helpers';
import { addVnDays, parseVnDate, toVnDateString } from '../src/lib/timezone';

const prisma = new PrismaClient();

async function seedForUser(email: string, name: string, password: string) {
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        password,
        calendarToken: crypto.randomBytes(16).toString('hex'),
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        calendarToken: user.calendarToken || crypto.randomBytes(16).toString('hex'),
      },
    });
  }

  // Xóa dữ liệu cũ của user để seed sạch, tránh trùng
  await prisma.exam.deleteMany({ where: { userId: user.id } });
  await prisma.assignment.deleteMany({ where: { userId: user.id } });
  await prisma.course.deleteMany({ where: { userId: user.id } });
  await prisma.semester.deleteMany({ where: { userId: user.id } });

  const now = new Date();
  const semStart = addVnDays(now, -45);
  const semEnd = addVnDays(now, 60);

  const activeSemester = await prisma.semester.create({
    data: {
      name: 'Học kỳ 1 - 2026-2027',
      startDate: parseVnDate(semStart),
      endDate: parseVnDate(semEnd),
      isActive: true,
      userId: user.id,
    },
  });

  await prisma.semester.create({
    data: {
      name: 'Học kỳ hè - 2025-2026',
      startDate: parseVnDate('2026-06-01'),
      endDate: parseVnDate('2026-08-15'),
      isActive: false,
      userId: user.id,
    },
  });

  const c1 = await prisma.course.create({
    data: {
      name: 'Cấu trúc dữ liệu & Giải thuật',
      courseCode: 'IT3011',
      instructor: 'TS. Trần Văn Hùng',
      color: '#3b82f6',
      credits: 3,
      notes: 'Làm bài tập lập trình hàng tuần.',
      hasMajorAssignment: false,
      examFormat: 'Tự luận',
      examNotes: 'Thi viết 90 phút, đề đóng, không sử dụng tài liệu.',
      gradingBreakdown: JSON.stringify([
        { label: 'Chuyên cần', weight: 10 },
        { label: 'Giữa kỳ', weight: 20 },
        { label: 'Cuối kỳ', weight: 70 },
      ]),
      semesterId: activeSemester.id,
      userId: user.id,
    },
  });

  const c2 = await prisma.course.create({
    data: {
      name: 'Lập trình Web nâng cao',
      courseCode: 'IT4409',
      instructor: 'ThS. Phạm Ngọc Linh',
      color: '#10b981',
      credits: 3,
      notes: 'Xây dựng ứng dụng Full-stack bằng Next.js & Prisma.',
      hasMajorAssignment: true,
      majorAssignmentNote: 'Đồ án nhóm 2-3 người, nộp code & bảo vệ tuần cuối kỳ.',
      examFormat: 'Bảo vệ đồ án / Tiểu luận',
      examNotes: 'Demo trực tiếp sản phẩm trên máy + hỏi đáp vấn đáp 15 phút/nhóm.',
      gradingBreakdown: JSON.stringify([
        { label: 'Chuyên cần', weight: 10 },
        { label: 'Bài tập lớn', weight: 30 },
        { label: 'Giữa kỳ', weight: 20 },
        { label: 'Cuối kỳ', weight: 40 },
      ]),
      semesterId: activeSemester.id,
      userId: user.id,
    },
  });

  const c3 = await prisma.course.create({
    data: {
      name: 'Cơ sở dữ liệu',
      courseCode: 'IT3090',
      instructor: 'PGS.TS. Lê Thị Mai',
      color: '#8b5cf6',
      credits: 3,
      notes: 'Lịch thực hành xen kẽ tuần chẵn / tuần lẻ tại phòng máy.',
      hasMajorAssignment: true,
      majorAssignmentNote: 'Thiết kế CSDL quản lý thư viện/bệnh viện và viết câu truy vấn SQL.',
      examFormat: 'Tự luận + Trắc nghiệm',
      examNotes: 'Thi 90 phút (30 câu trắc nghiệm + 2 câu vẽ ERD & viết SQL), không tài liệu.',
      gradingBreakdown: JSON.stringify([
        { label: 'Chuyên cần', weight: 10 },
        { label: 'Bài tập lớn', weight: 20 },
        { label: 'Giữa kỳ', weight: 20 },
        { label: 'Cuối kỳ', weight: 50 },
      ]),
      semesterId: activeSemester.id,
      userId: user.id,
    },
  });

  const c4 = await prisma.course.create({
    data: {
      name: 'Trí tuệ nhân tạo',
      courseCode: 'IT3160',
      instructor: 'TS. Nguyễn Hoàng Nam',
      color: '#f59e0b',
      credits: 3,
      notes: 'Cần cài đặt Python 3.11 và Jupyter Notebook.',
      hasMajorAssignment: true,
      majorAssignmentNote: 'Cài đặt thuật toán tìm kiếm/học máy bằng Python.',
      examFormat: 'Tự luận',
      examNotes: 'Được mang 1 tờ giấy A4 viết tay công thức vào phòng thi.',
      gradingBreakdown: JSON.stringify([
        { label: 'Quá trình & BTL', weight: 30 },
        { label: 'Cuối kỳ', weight: 70 },
      ]),
      semesterId: activeSemester.id,
      userId: user.id,
    },
  });

  const c5 = await prisma.course.create({
    data: {
      name: 'Tiếng Anh chuyên ngành CNTT',
      courseCode: 'FL2020',
      instructor: 'Cô Đặng Thu Hà',
      color: '#ec4899',
      credits: 2,
      notes: 'Thuyết trình nhóm vào tuần 10.',
      hasMajorAssignment: false,
      examFormat: 'Vấn đáp',
      examNotes: 'Thi nói 1-1 với giảng viên về chủ đề công nghệ + đọc hiểu thuật ngữ.',
      gradingBreakdown: JSON.stringify([
        { label: 'Chuyên cần', weight: 10 },
        { label: 'Thuyết trình', weight: 30 },
        { label: 'Cuối kỳ', weight: 60 },
      ]),
      semesterId: activeSemester.id,
      userId: user.id,
    },
  });

  const schedulesData = [
    {
      courseId: c1.id,
      dayOfWeek: 1,
      startTime: '07:30',
      endTime: '09:30',
      startPeriod: 1,
      numPeriods: 2,
      room: 'B1-203',
      location: 'Cơ sở 1',
      weekType: 'all',
    },
    {
      courseId: c1.id,
      dayOfWeek: 4,
      startTime: '07:30',
      endTime: '09:30',
      startPeriod: 1,
      numPeriods: 2,
      room: 'B1-203',
      location: 'Cơ sở 1',
      weekType: 'all',
    },
    {
      courseId: c2.id,
      dayOfWeek: 2,
      startTime: '09:45',
      endTime: '11:45',
      startPeriod: 4,
      numPeriods: 2,
      room: 'TC-305',
      location: 'Tòa Công nghệ',
      weekType: 'all',
    },
    {
      courseId: c3.id,
      dayOfWeek: 3,
      startTime: '13:30',
      endTime: '15:30',
      startPeriod: 6,
      numPeriods: 2,
      room: 'PM-401',
      location: 'Phòng máy B2',
      weekType: 'odd',
    },
    {
      courseId: c3.id,
      dayOfWeek: 5,
      startTime: '13:30',
      endTime: '15:30',
      startPeriod: 6,
      numPeriods: 2,
      room: 'PM-402',
      location: 'Phòng máy B2',
      weekType: 'even',
    },
    {
      courseId: c4.id,
      dayOfWeek: 4,
      startTime: '13:30',
      endTime: '16:00',
      startPeriod: 6,
      numPeriods: 3,
      room: 'D3-102',
      location: 'Cơ sở 1',
      weekType: 'all',
    },
    {
      courseId: c5.id,
      dayOfWeek: 6,
      startTime: '08:00',
      endTime: '10:00',
      startPeriod: 1,
      numPeriods: 2,
      room: 'A2-304',
      location: 'Nhà A2',
      weekType: 'all',
    },
  ];

  for (const s of schedulesData) {
    const created = await prisma.schedule.create({
      data: {
        ...s,
        startDate: parseVnDate(semStart),
        endDate: parseVnDate(semEnd),
      },
    });
    await generateSessions(created.id);
  }

  const makeupSession = await prisma.courseSession.create({
    data: {
      courseId: c2.id,
      date: parseVnDate(addVnDays(now, 2)),
      startTime: '18:00',
      endTime: '20:00',
      room: 'TC-308',
      location: 'Tòa Công nghệ',
      status: 'upcoming',
      type: 'makeup',
      content: '<h2>Học bù: Server Actions & Prisma ORM</h2><p>Chuẩn bị sẵn project Next.js trước khi lên lớp.</p>',
      personalNote: '<p>Nhớ hỏi cô phần tối ưu truy vấn N+1.</p>',
    },
  });

  const c1Sessions = await prisma.courseSession.findMany({
    where: { courseId: c1.id },
    orderBy: { date: 'asc' },
  });

  if (c1Sessions.length >= 2) {
    const first = c1Sessions[0];
    await prisma.courseSession.update({
      where: { id: first.id },
      data: {
        status: 'completed',
        content:
          '<h2>Chương 1: Độ phức tạp thuật toán (Big-O)</h2><ul><li>Phân tích độ phức tạp thời gian và không gian</li><li>Đệ quy và phương trình truy hồi</li></ul>',
        personalNote: '<p>Cần ôn lại định lý Thợ (Master Theorem) cho bài kiểm tra.</p>',
      },
    });

    await prisma.checklistItem.createMany({
      data: [
        { sessionId: first.id, text: 'Đọc lại slide chương 1', completed: true, order: 0 },
        { sessionId: first.id, text: 'Làm 5 bài tập Big-O', completed: false, order: 1 },
      ],
    });

    await prisma.resource.create({
      data: {
        sessionId: first.id,
        title: 'Slide Chương 1 - Phân tích thuật toán',
        url: 'https://visualgo.net/en',
        type: 'link',
      },
    });

    const second = c1Sessions[1];
    await prisma.courseSession.update({
      where: { id: second.id },
      data: {
        status: 'completed',
        content:
          '<h2>Chương 2: Danh sách liên kết & Ngăn xếp</h2><p>Cài đặt Linked List, Stack và Queue bằng con trỏ.</p>',
        personalNote: '<p>Ghi chú riêng buổi 2 — không ghi đè buổi 1!</p>',
      },
    });
  }

  const c4Sessions = await prisma.courseSession.findMany({
    where: { courseId: c4.id },
    orderBy: { date: 'asc' },
  });
  if (c4Sessions.length > 0) {
    const sess = c4Sessions[Math.min(3, c4Sessions.length - 1)];
    await prisma.courseSession.update({
      where: { id: sess.id },
      data: {
        content:
          '<h2>Thuật toán tìm kiếm A* (A-Star)</h2><p>Hàm đánh giá f(n) = g(n) + h(n) với heuristic chấp nhận được.</p>',
        personalNote: '<p>Thử nghiệm heuristic Manhattan vs Euclidean cho bài toán 8-puzzle.</p>',
      },
    });
  }

  await prisma.assignment.createMany({
    data: [
      {
        title: 'Bài tập lớn 1: Cài đặt cây AVL',
        description: 'Viết chương trình C++/TypeScript minh họa phép xoay trái/phải.',
        dueDate: parseVnDate(addVnDays(now, -2)),
        completed: false,
        priority: 'urgent',
        courseId: c1.id,
        sessionId: c1Sessions[0]?.id || null,
        userId: user.id,
      },
      {
        title: 'Thiết kế Schema Prisma cho WebSchedule',
        description: 'Chuẩn hóa bảng Semester, Course, Schedule, CourseSession.',
        dueDate: parseVnDate(now),
        completed: false,
        priority: 'high',
        courseId: c2.id,
        sessionId: makeupSession.id,
        userId: user.id,
      },
      {
        title: 'Thực hành SQL: Truy vấn lồng & Index',
        description: 'Hoàn thành 10 câu SQL trong sheet thực hành tuần 5.',
        dueDate: parseVnDate(addVnDays(now, 3)),
        completed: false,
        priority: 'medium',
        courseId: c3.id,
        userId: user.id,
      },
      {
        title: 'Cài đặt thuật toán tìm kiếm A* cho 8-Puzzle',
        description: 'Nộp file Jupyter Notebook kèm báo cáo so sánh số bước duyệt.',
        dueDate: parseVnDate(addVnDays(now, 6)),
        completed: false,
        priority: 'high',
        courseId: c4.id,
        userId: user.id,
      },
      {
        title: 'Chuẩn bị slide thuyết trình chủ đề Cloud Computing',
        description: 'Nhóm 3 người, thời lượng 10 phút bằng tiếng Anh.',
        dueDate: parseVnDate(addVnDays(now, -5)),
        completed: true,
        priority: 'low',
        courseId: c5.id,
        userId: user.id,
      },
    ],
  });

  await prisma.exam.createMany({
    data: [
      {
        title: 'Kiểm tra 1 tiết: Cây & Đồ thị',
        type: 'quiz',
        date: parseVnDate(addVnDays(now, 5)),
        startTime: '07:30',
        endTime: '08:30',
        room: 'B1-203',
        location: 'Cơ sở 1',
        notes: 'Được mang 1 tờ giấy A4 ghi công thức.',
        courseId: c1.id,
        userId: user.id,
      },
      {
        title: 'Thi giữa kỳ Cơ sở dữ liệu',
        type: 'midterm',
        date: parseVnDate(addVnDays(now, 12)),
        startTime: '13:30',
        endTime: '15:00',
        room: 'Hội trường A2',
        location: 'Cơ sở 1',
        notes: 'Thi tự luận vẽ ERD và viết SQL, không dùng tài liệu.',
        courseId: c3.id,
        userId: user.id,
      },
      {
        title: 'Bảo vệ đồ án Lập trình Web',
        type: 'final',
        date: parseVnDate(addVnDays(now, 45)),
        startTime: '08:00',
        endTime: '11:30',
        room: 'TC-305',
        location: 'Tòa Công nghệ',
        notes: 'Demo sản phẩm trực tiếp và trả lời câu hỏi hội đồng.',
        courseId: c2.id,
        userId: user.id,
      },
    ],
  });

  console.log(`Đã khởi tạo dữ liệu mẫu cho ${name} (${email})`);
}

async function main() {
  console.log('Bắt đầu khởi tạo dữ liệu mẫu...');
  await seedForUser('dominhan0612@gmail.com', 'Đỗ Minh An', '123456');
  await seedForUser('student@webschedule.vn', 'Nguyễn Minh Anh', '123456');
  console.log(`Ngày tham chiếu (VN): ${toVnDateString(new Date())}`);
}

main()
  .catch((e) => {
    console.error('Lỗi khi chạy seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
