export type GradeLetter = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D+' | 'D' | 'F+' | 'F';

export interface GradeScaleEntry {
  min: number;
  max: number;
  letter: GradeLetter;
  gpa4: number;
}

export const GRADE_SCALE: readonly GradeScaleEntry[] = [
  { min: 9.5, max: 10.0, letter: 'A+', gpa4: 4.0 },
  { min: 8.5, max: 9.4, letter: 'A', gpa4: 3.8 },
  { min: 8.0, max: 8.4, letter: 'B+', gpa4: 3.5 },
  { min: 7.0, max: 7.9, letter: 'B', gpa4: 3.0 },
  { min: 6.0, max: 6.9, letter: 'C+', gpa4: 2.5 },
  { min: 5.5, max: 5.9, letter: 'C', gpa4: 2.0 },
  { min: 4.5, max: 5.4, letter: 'D+', gpa4: 1.5 },
  { min: 4.0, max: 4.4, letter: 'D', gpa4: 1.0 },
  { min: 2.0, max: 3.9, letter: 'F+', gpa4: 0.5 },
  { min: 0.0, max: 1.9, letter: 'F', gpa4: 0.0 },
] as const;

export const GPA_STORAGE_KEY = 'cpa_data';

export interface DegreeTargetOption {
  value: number;
  label: string;
  shortLabel: string;
}

export const DEGREE_TARGETS: readonly DegreeTargetOption[] = [
  { value: 3.6, label: 'Xuất sắc (≥ 3.6)', shortLabel: 'Xuất sắc' },
  { value: 3.2, label: 'Giỏi (≥ 3.2)', shortLabel: 'Giỏi' },
  { value: 2.5, label: 'Khá (≥ 2.5)', shortLabel: 'Khá' },
  { value: 2.0, label: 'Trung bình (≥ 2.0)', shortLabel: 'Trung bình' },
] as const;

export type GpaSemesterMode = 'subject' | 'summary';

export interface GpaSubject {
  id: string | number;
  name: string;
  credits: number | string;
  grade10: string | number;
  improvedGrade10: string | number | null;
  isImproving: boolean;
}

export interface GpaSemester {
  id: string | number;
  semesterName: string;
  mode: GpaSemesterMode;
  summaryCredits: string | number;
  summaryGPA: string | number;
  subjects: GpaSubject[];
}

export type GpaTargetStatus = 'achieved' | 'impossible' | 'need_credits' | 'in_progress';

export interface SemesterGpaMetric {
  id: string | number;
  semesterName: string;
  mode: GpaSemesterMode;
  credits: number;
  unstudiedCredits: number;
  gpa4: number | null;
}

export interface GpaMetrics {
  totalCredits: number;
  totalPoints: number;
  currentCPA: number;
  unstudiedCredits: number;
  requiredGPA: number | null;
  status: GpaTargetStatus;
  semesterMetrics: SemesterGpaMetric[];
}

export type ImprovementActionType = 'retake' | 'improve' | null;

/**
 * Convert a 10-point score to its 4-point scale entry using half-up rounding to 1 decimal place
 * (`Math.floor(s * 10 + 0.5) / 10`), matching TinhGPA-master.
 */
export function getGradeInfo(
  score10: string | number | null | undefined
): GradeScaleEntry | null {
  if (score10 === null || score10 === undefined) return null;
  if (typeof score10 === 'string' && score10.trim() === '') return null;

  const parsed = typeof score10 === 'number' ? score10 : parseFloat(score10);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
    return null;
  }

  const rounded = Math.floor(parsed * 10 + 0.5) / 10;
  return (
    GRADE_SCALE.find((g) => rounded >= g.min && rounded <= g.max) ??
    GRADE_SCALE[GRADE_SCALE.length - 1]
  );
}

/**
 * Determine whether a subject grade is eligible for retake (F/F+) or grade improvement (C+ or below).
 */
export function canImproveGrade(info: GradeScaleEntry | null): ImprovementActionType {
  if (!info) return null;
  if (info.letter === 'F' || info.letter === 'F+') return 'retake';
  if (info.letter === 'D' || info.letter === 'D+' || info.letter === 'C' || info.letter === 'C+') {
    return 'improve';
  }
  return null;
}

/**
 * Human-readable Vietnamese academic standing for a 4-point CPA.
 */
export function getDegreeClassification(cpa: number, totalCredits: number): string {
  if (totalCredits <= 0) return 'Chưa có dữ liệu';
  if (cpa >= 3.6) return 'Xuất sắc';
  if (cpa >= 3.2) return 'Giỏi';
  if (cpa >= 2.5) return 'Khá';
  if (cpa >= 2.0) return 'Trung bình';
  if (cpa >= 1.0) return 'Yếu';
  return 'Kém';
}

function parsePositiveNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string' && value.trim() === '') return 0;
  const num = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function parseNonNegativeNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function hasGradeValue(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return Number.isFinite(value);
}

/**
 * Calculate cumulative CPA, per-semester GPA, unstudied credits, and required GPA for target CPA.
 */
export function calculateGpaMetrics(
  semesters: readonly GpaSemester[],
  targetCPA: number
): GpaMetrics {
  let totalPoints = 0;
  let totalCredits = 0;
  let unstudiedCredits = 0;
  const semesterMetrics: SemesterGpaMetric[] = [];

  for (const sem of semesters) {
    if (sem.mode === 'summary') {
      const cred = parsePositiveNumber(sem.summaryCredits);
      const gpa = parseNonNegativeNumber(sem.summaryGPA);

      if (gpa !== null && gpa <= 4.0) {
        totalCredits += cred;
        totalPoints += cred * gpa;
        semesterMetrics.push({
          id: sem.id,
          semesterName: sem.semesterName,
          mode: sem.mode,
          credits: cred,
          unstudiedCredits: 0,
          gpa4: cred > 0 ? gpa : null,
        });
      } else if (cred > 0) {
        unstudiedCredits += cred;
        semesterMetrics.push({
          id: sem.id,
          semesterName: sem.semesterName,
          mode: sem.mode,
          credits: 0,
          unstudiedCredits: cred,
          gpa4: null,
        });
      } else {
        semesterMetrics.push({
          id: sem.id,
          semesterName: sem.semesterName,
          mode: sem.mode,
          credits: 0,
          unstudiedCredits: 0,
          gpa4: null,
        });
      }
    } else {
      let semCredits = 0;
      let semPoints = 0;

      for (const sub of sem.subjects) {
        const cred = parsePositiveNumber(sub.credits);
        const activeGrade10 =
          sub.isImproving && hasGradeValue(sub.improvedGrade10)
            ? sub.improvedGrade10
            : sub.grade10;
        const info = getGradeInfo(activeGrade10);

        if (info && cred > 0) {
          semCredits += cred;
          semPoints += cred * info.gpa4;
          totalCredits += cred;
          totalPoints += cred * info.gpa4;
        }
      }

      semesterMetrics.push({
        id: sem.id,
        semesterName: sem.semesterName,
        mode: sem.mode,
        credits: semCredits,
        unstudiedCredits: 0,
        gpa4: semCredits > 0 ? semPoints / semCredits : null,
      });
    }
  }

  const currentCPA = totalCredits > 0 ? totalPoints / totalCredits : 0;
  const EPSILON = 1e-9;

  let requiredGPA: number | null = null;
  let status: GpaTargetStatus;

  if (unstudiedCredits > 0) {
    const rawReq = (targetCPA * (totalCredits + unstudiedCredits) - totalPoints) / unstudiedCredits;
    if (rawReq > 4 + EPSILON) {
      status = 'impossible';
      requiredGPA = rawReq;
    } else if (rawReq <= EPSILON) {
      status = 'achieved';
      requiredGPA = 0;
    } else {
      status = 'in_progress';
      requiredGPA = rawReq;
    }
  } else {
    requiredGPA = null;
    if (totalCredits > 0 && currentCPA + EPSILON >= targetCPA) {
      status = 'achieved';
    } else {
      status = 'need_credits';
    }
  }

  return {
    totalCredits,
    totalPoints,
    currentCPA,
    unstudiedCredits,
    requiredGPA,
    status,
    semesterMetrics,
  };
}

interface RawSubjectLike {
  id?: unknown;
  name?: unknown;
  credits?: unknown;
  grade10?: unknown;
  improvedGrade10?: unknown;
  isImproving?: unknown;
}

interface RawSemesterLike {
  id?: unknown;
  semesterName?: unknown;
  mode?: unknown;
  summaryCredits?: unknown;
  summaryGPA?: unknown;
  subjects?: unknown;
}

function normalizeId(rawId: unknown, fallback: string | number): string | number {
  if (typeof rawId === 'string' && rawId.trim() !== '') return rawId;
  if (typeof rawId === 'number' && Number.isFinite(rawId)) return rawId;
  return fallback;
}

function normalizePrimitiveField(raw: unknown): string | number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') return raw;
  return '';
}

function normalizeSubject(raw: unknown, fallbackId: string): GpaSubject {
  const obj: RawSubjectLike =
    raw && typeof raw === 'object' ? (raw as RawSubjectLike) : {};

  const creditsRaw = obj.credits;
  let credits: number | string = 2;
  if (typeof creditsRaw === 'number' && Number.isFinite(creditsRaw) && creditsRaw > 0) {
    credits = creditsRaw;
  } else if (typeof creditsRaw === 'string' && creditsRaw.trim() !== '') {
    credits = creditsRaw;
  }

  const improvedRaw = obj.improvedGrade10;
  let improvedGrade10: string | number | null = null;
  if (typeof improvedRaw === 'number' && Number.isFinite(improvedRaw)) {
    improvedGrade10 = improvedRaw;
  } else if (typeof improvedRaw === 'string' && improvedRaw.trim() !== '') {
    improvedGrade10 = improvedRaw;
  }

  return {
    id: normalizeId(obj.id, fallbackId),
    name: typeof obj.name === 'string' ? obj.name : '',
    credits,
    grade10: normalizePrimitiveField(obj.grade10),
    improvedGrade10,
    isImproving: Boolean(obj.isImproving),
  };
}

/**
 * Normalize and merge imported JSON semester data, 100% compatible with TinhGPA-master `cpa_data.json`.
 * Throws an Error if `rawData` is not an array.
 */
export function mergeImportedGpaSemesters(rawData: unknown): GpaSemester[] {
  if (!Array.isArray(rawData)) {
    throw new Error('Định dạng tệp JSON không hợp lệ (Phải là một mảng).');
  }

  const now = Date.now();
  const semesterMap = new Map<string, RawSemesterLike>();

  rawData.forEach((item, index) => {
    const sem: RawSemesterLike =
      item && typeof item === 'object' ? (item as RawSemesterLike) : {};
    const name =
      typeof sem.semesterName === 'string' && sem.semesterName.trim() !== ''
        ? sem.semesterName.trim()
        : `Học kỳ ${index + 1}`;

    const existing = semesterMap.get(name);
    if (existing) {
      const existingIsSummary = existing.mode === 'summary';
      const incomingIsSummary = sem.mode === 'summary';

      if (existingIsSummary && !incomingIsSummary) {
        semesterMap.set(name, { ...sem, semesterName: name });
      } else if (!existingIsSummary && !incomingIsSummary) {
        const existingSubjects = Array.isArray(existing.subjects) ? existing.subjects : [];
        const incomingSubjects = Array.isArray(sem.subjects) ? sem.subjects : [];
        semesterMap.set(name, {
          ...existing,
          subjects: [...existingSubjects, ...incomingSubjects],
        });
      }
    } else {
      semesterMap.set(name, { ...sem, semesterName: name });
    }
  });

  return Array.from(semesterMap.values()).map((sem, semIndex) => {
    const mode: GpaSemesterMode = sem.mode === 'summary' ? 'summary' : 'subject';
    const rawSubjects = Array.isArray(sem.subjects) ? sem.subjects : [];

    return {
      id: normalizeId(sem.id, now + semIndex),
      semesterName:
        typeof sem.semesterName === 'string' && sem.semesterName.trim() !== ''
          ? sem.semesterName.trim()
          : `Học kỳ ${semIndex + 1}`,
      mode,
      summaryCredits: normalizePrimitiveField(sem.summaryCredits),
      summaryGPA: normalizePrimitiveField(sem.summaryGPA),
      subjects: rawSubjects.map((sub, subIndex) =>
        normalizeSubject(sub, `sub-${now}-${semIndex}-${subIndex}`)
      ),
    };
  });
}

export interface WebScheduleSemesterInput {
  id: string;
  name: string;
}

export interface WebScheduleCourseInput {
  id: string;
  name: string;
  courseCode?: string | null;
  credits?: number | null;
  semesterId: string;
  semester?: { id: string; name: string } | null;
}

export interface MergeWebScheduleResult {
  semesters: GpaSemester[];
  addedSemesters: number;
  addedSubjects: number;
}

/**
 * Merge courses from WebScheduleAI (`/api/semesters` + `/api/courses`) into existing GPA semesters
 * without overwriting or removing existing user grades.
 */
export function mergeWebScheduleCourses(
  existingSemesters: readonly GpaSemester[],
  apiSemesters: readonly WebScheduleSemesterInput[],
  apiCourses: readonly WebScheduleCourseInput[]
): MergeWebScheduleResult {
  const semesterNameById = new Map<string, string>();
  for (const s of apiSemesters) {
    semesterNameById.set(s.id, s.name.trim());
  }

  const coursesBySemName = new Map<string, WebScheduleCourseInput[]>();
  for (const course of apiCourses) {
    const semName =
      course.semester?.name?.trim() ||
      semesterNameById.get(course.semesterId) ||
      'Học kỳ WebSchedule';
    const list = coursesBySemName.get(semName) ?? [];
    list.push(course);
    coursesBySemName.set(semName, list);
  }

  const nextSemesters: GpaSemester[] = existingSemesters.map((sem) => ({
    ...sem,
    subjects: sem.subjects.map((sub) => ({ ...sub })),
  }));

  let addedSemesters = 0;
  let addedSubjects = 0;
  const now = Date.now();
  let seq = 0;

  coursesBySemName.forEach((courses, semName) => {
    const normalizedSemKey = semName.toLowerCase();
    const existingIndex = nextSemesters.findIndex(
      (s) => s.semesterName.trim().toLowerCase() === normalizedSemKey
    );

    if (existingIndex >= 0) {
      const target = nextSemesters[existingIndex];
      if (target.mode === 'summary') {
        return;
      }

      const existingSubjectNames = new Set(
        target.subjects.map((sub) => sub.name.trim().toLowerCase()).filter(Boolean)
      );

      for (const course of courses) {
        const courseName = course.name.trim();
        if (!courseName) continue;
        if (existingSubjectNames.has(courseName.toLowerCase())) continue;

        existingSubjectNames.add(courseName.toLowerCase());
        target.subjects.push({
          id: `ws-${course.id}-${now}-${seq++}`,
          name: courseName,
          credits: course.credits && course.credits > 0 ? course.credits : 2,
          grade10: '',
          improvedGrade10: null,
          isImproving: false,
        });
        addedSubjects += 1;
      }
    } else {
      const subjects: GpaSubject[] = courses
        .filter((c) => c.name.trim() !== '')
        .map((course) => {
          addedSubjects += 1;
          return {
            id: `ws-${course.id}-${now}-${seq++}`,
            name: course.name.trim(),
            credits: course.credits && course.credits > 0 ? course.credits : 2,
            grade10: '',
            improvedGrade10: null,
            isImproving: false,
          };
        });

      if (subjects.length > 0) {
        nextSemesters.push({
          id: `ws-sem-${now}-${seq++}`,
          semesterName: semName,
          mode: 'subject',
          summaryCredits: '',
          summaryGPA: '',
          subjects,
        });
        addedSemesters += 1;
      }
    }
  });

  return {
    semesters: nextSemesters,
    addedSemesters,
    addedSubjects,
  };
}
