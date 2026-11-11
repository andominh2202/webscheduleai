import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  addVnDays,
  getVnDayOfWeek,
  parseVnDate,
  toVnDateString,
} from '@/lib/timezone';

export class AuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

export async function getAuthUserId(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function requireAuth(): Promise<string> {
  const userId = await getAuthUserId();
  if (!userId) {
    throw new AuthError('Unauthorized');
  }
  return userId;
}

export async function getActiveSemester(userId: string) {
  let semester = await prisma.semester.findFirst({
    where: { userId, isActive: true },
  });

  if (!semester) {
    semester = await prisma.semester.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  return semester;
}

function getWeekNumberFromStart(date: Date, startDate: Date): number {
  const d1 = parseVnDate(toVnDateString(startDate));
  const d2 = parseVnDate(toVnDateString(date));
  const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
  return Math.floor(diffDays / 7) + 1;
}

function hasSessionUserData(sess: {
  content: string | null;
  personalNote: string | null;
  _count: { checklist: number; resources: number; assignments: number };
}) {
  return Boolean(
    sess.content?.trim() ||
      sess.personalNote?.trim() ||
      sess._count.checklist > 0 ||
      sess._count.resources > 0 ||
      sess._count.assignments > 0
  );
}

/**
 * Sinh các buổi học (CourseSession) cho lịch lặp (Schedule) theo múi giờ Asia/Ho_Chi_Minh.
 * - Không tạo bản ghi trùng ngày cho cùng một schedule.
 * - Bảo toàn ghi chú, checklist, tài liệu, bài tập và trạng thái của các buổi đã có.
 */
export async function generateSessions(scheduleId: string) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { course: true },
  });

  if (!schedule) return 0;

  const startDate = parseVnDate(schedule.startDate);
  const endDate = parseVnDate(schedule.endDate);

  const targetDates: Date[] = [];
  let current = parseVnDate(startDate);

  while (getVnDayOfWeek(current) !== schedule.dayOfWeek && current <= endDate) {
    current = addVnDays(current, 1);
  }

  const seenDateKeys = new Set<string>();
  while (current <= endDate) {
    const weekNumber = getWeekNumberFromStart(current, startDate);
    let shouldAdd = true;
    if (schedule.weekType === 'even' && weekNumber % 2 !== 0) shouldAdd = false;
    if (schedule.weekType === 'odd' && weekNumber % 2 === 0) shouldAdd = false;

    const dateKey = toVnDateString(current);
    if (shouldAdd && !seenDateKeys.has(dateKey)) {
      seenDateKeys.add(dateKey);
      targetDates.push(parseVnDate(dateKey));
    }

    current = addVnDays(current, 7);
  }

  const existingSessions = await prisma.courseSession.findMany({
    where: { scheduleId },
    include: {
      _count: {
        select: { checklist: true, resources: true, assignments: true },
      },
    },
  });

  const existingByDate = new Map<string, (typeof existingSessions)[number]>();
  const duplicateIdsToDelete: string[] = [];

  for (const sess of existingSessions) {
    const key = toVnDateString(sess.date);
    if (existingByDate.has(key)) {
      const existing = existingByDate.get(key)!;
      if (!hasSessionUserData(existing) && hasSessionUserData(sess)) {
        duplicateIdsToDelete.push(existing.id);
        existingByDate.set(key, sess);
      } else {
        duplicateIdsToDelete.push(sess.id);
      }
    } else {
      existingByDate.set(key, sess);
    }
  }

  const todayKey = toVnDateString(new Date());
  const toCreate: {
    date: Date;
    startTime: string;
    endTime: string;
    room: string | null;
    location: string | null;
    courseId: string;
    scheduleId: string;
    type: string;
    status: string;
  }[] = [];

  const toUpdateIds: string[] = [];

  for (const targetDate of targetDates) {
    const key = toVnDateString(targetDate);
    const existing = existingByDate.get(key);
    if (existing) {
      if (existing.type === 'regular') {
        toUpdateIds.push(existing.id);
      }
      existingByDate.delete(key);
    } else {
      toCreate.push({
        date: targetDate,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        room: schedule.room,
        location: schedule.location,
        courseId: schedule.courseId,
        scheduleId: schedule.id,
        type: 'regular',
        status: key < todayKey ? 'completed' : 'upcoming',
      });
    }
  }

  const idsToDelete = [...duplicateIdsToDelete];
  const idsToDetach: string[] = [];

  for (const sess of Array.from(existingByDate.values())) {
    if (sess.type === 'regular' && !hasSessionUserData(sess) && sess.status === 'upcoming') {
      idsToDelete.push(sess.id);
    } else {
      idsToDetach.push(sess.id);
    }
  }

  await prisma.$transaction(async (tx) => {
    if (idsToDelete.length > 0) {
      await tx.courseSession.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }
    if (idsToDetach.length > 0) {
      await tx.courseSession.updateMany({
        where: { id: { in: idsToDetach } },
        data: { scheduleId: null },
      });
    }
    if (toUpdateIds.length > 0) {
      await tx.courseSession.updateMany({
        where: { id: { in: toUpdateIds } },
        data: {
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          room: schedule.room,
          location: schedule.location,
        },
      });
    }
    if (toCreate.length > 0) {
      await tx.courseSession.createMany({
        data: toCreate,
      });
    }
  });

  return targetDates.length;
}

export function timeOverlaps(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  };

  const s1 = toMinutes(start1);
  const e1 = toMinutes(end1);
  const s2 = toMinutes(start2);
  const e2 = toMinutes(end2);

  return s1 < e2 && s2 < e1;
}

function weekTypesOverlap(type1: string, type2: string): boolean {
  if (type1 === 'all' || type2 === 'all') return true;
  return type1 === type2;
}

function dateRangesOverlap(s1: Date, e1: Date, s2: Date, e2: Date): boolean {
  return s1.getTime() <= e2.getTime() && s2.getTime() <= e1.getTime();
}

export interface ConflictCheckOptions {
  userId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: Date;
  endDate?: Date;
  weekType?: string;
  excludeScheduleId?: string;
}

export async function checkScheduleConflicts(
  userIdOrOpts: string | ConflictCheckOptions,
  dayOfWeekArg?: number,
  startTimeArg?: string,
  endTimeArg?: string,
  excludeScheduleIdArg?: string
) {
  const opts: ConflictCheckOptions =
    typeof userIdOrOpts === 'string'
      ? {
          userId: userIdOrOpts,
          dayOfWeek: dayOfWeekArg!,
          startTime: startTimeArg!,
          endTime: endTimeArg!,
          excludeScheduleId: excludeScheduleIdArg,
        }
      : userIdOrOpts;

  const existingSchedules = await prisma.schedule.findMany({
    where: {
      course: { userId: opts.userId },
      dayOfWeek: opts.dayOfWeek,
      ...(opts.excludeScheduleId ? { id: { not: opts.excludeScheduleId } } : {}),
    },
    include: { course: true },
  });

  return existingSchedules.filter((s) => {
    if (!timeOverlaps(opts.startTime, opts.endTime, s.startTime, s.endTime)) {
      return false;
    }
    if (opts.weekType && !weekTypesOverlap(opts.weekType, s.weekType)) {
      return false;
    }
    if (opts.startDate && opts.endDate) {
      const sStart = parseVnDate(s.startDate);
      const sEnd = parseVnDate(s.endDate);
      if (!dateRangesOverlap(opts.startDate, opts.endDate, sStart, sEnd)) {
        return false;
      }
    }
    return true;
  });
}

export async function checkSessionConflicts(
  userId: string,
  date: Date,
  startTime: string,
  endTime: string,
  excludeSessionId?: string
) {
  const dateKey = toVnDateString(date);
  const startBound = new Date(`${dateKey}T00:00:00.000+07:00`);
  const endBound = new Date(`${dateKey}T23:59:59.999+07:00`);

  const sameDaySessions = await prisma.courseSession.findMany({
    where: {
      course: { userId },
      status: { not: 'cancelled' },
      date: { gte: startBound, lte: endBound },
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
    },
    include: { course: true },
  });

  return sameDaySessions.filter((s) =>
    timeOverlaps(startTime, endTime, s.startTime, s.endTime)
  );
}
