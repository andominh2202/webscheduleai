import assert from 'node:assert/strict';
import {
  GRADE_SCALE,
  calculateGpaMetrics,
  canImproveGrade,
  getDegreeClassification,
  getGradeInfo,
  mergeImportedGpaSemesters,
  mergeWebScheduleCourses,
  type GpaSemester,
} from '../src/lib/gpa';

let passed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    throw err;
  }
}

console.log('Running GPA/CPA logic verification...\n');

// 1. Grade scale & conversion tests
runTest('GRADE_SCALE has 10 levels in descending order', () => {
  assert.equal(GRADE_SCALE.length, 10);
  assert.equal(GRADE_SCALE[0].letter, 'A+');
  assert.equal(GRADE_SCALE[0].gpa4, 4.0);
  assert.equal(GRADE_SCALE[GRADE_SCALE.length - 1].letter, 'F');
  assert.equal(GRADE_SCALE[GRADE_SCALE.length - 1].gpa4, 0.0);
});

runTest('getGradeInfo converts all 10 grade tiers accurately', () => {
  const cases: Array<[number | string, string, number]> = [
    [10, 'A+', 4.0],
    [9.5, 'A+', 4.0],
    [9.4, 'A', 3.8],
    [8.5, 'A', 3.8],
    [8.4, 'B+', 3.5],
    [8.0, 'B+', 3.5],
    [7.9, 'B', 3.0],
    [7.0, 'B', 3.0],
    [6.9, 'C+', 2.5],
    [6.0, 'C+', 2.5],
    [5.9, 'C', 2.0],
    [5.5, 'C', 2.0],
    [5.4, 'D+', 1.5],
    [4.5, 'D+', 1.5],
    [4.4, 'D', 1.0],
    [4.0, 'D', 1.0],
    [3.9, 'F+', 0.5],
    [2.0, 'F+', 0.5],
    [1.9, 'F', 0.0],
    ['0', 'F', 0.0],
  ];

  for (const [score, expectedLetter, expectedGpa4] of cases) {
    const info = getGradeInfo(score);
    assert.ok(info, `Expected grade info for ${score}`);
    assert.equal(info.letter, expectedLetter, `Score ${score} letter mismatch`);
    assert.equal(info.gpa4, expectedGpa4, `Score ${score} gpa4 mismatch`);
  }
});

runTest('getGradeInfo applies half-up 1-decimal rounding like TinhGPA-master', () => {
  assert.equal(getGradeInfo(9.45)?.letter, 'A+');
  assert.equal(getGradeInfo(9.44)?.letter, 'A');
  assert.equal(getGradeInfo(8.45)?.letter, 'A');
  assert.equal(getGradeInfo(8.44)?.letter, 'B+');
  assert.equal(getGradeInfo(5.95)?.letter, 'C+');
  assert.equal(getGradeInfo(3.95)?.letter, 'D');
});

runTest('getGradeInfo returns null for empty or out-of-range scores', () => {
  assert.equal(getGradeInfo(''), null);
  assert.equal(getGradeInfo('   '), null);
  assert.equal(getGradeInfo(null), null);
  assert.equal(getGradeInfo(undefined), null);
  assert.equal(getGradeInfo(-0.1), null);
  assert.equal(getGradeInfo(10.1), null);
  assert.equal(getGradeInfo('abc'), null);
});

runTest('canImproveGrade distinguishes retake, improve, and good grades', () => {
  assert.equal(canImproveGrade(getGradeInfo(1.5)), 'retake');
  assert.equal(canImproveGrade(getGradeInfo(3.0)), 'retake');
  assert.equal(canImproveGrade(getGradeInfo(4.2)), 'improve');
  assert.equal(canImproveGrade(getGradeInfo(5.0)), 'improve');
  assert.equal(canImproveGrade(getGradeInfo(5.7)), 'improve');
  assert.equal(canImproveGrade(getGradeInfo(6.5)), 'improve');
  assert.equal(canImproveGrade(getGradeInfo(7.0)), null);
  assert.equal(canImproveGrade(getGradeInfo(9.5)), null);
  assert.equal(canImproveGrade(null), null);
});

// 2. CPA calculation & retake/improvement tests
runTest('calculateGpaMetrics computes subject-mode CPA and per-semester GPA', () => {
  const semesters: GpaSemester[] = [
    {
      id: 1,
      semesterName: 'HK1',
      mode: 'subject',
      summaryCredits: '',
      summaryGPA: '',
      subjects: [
        { id: 1, name: 'Giải tích', credits: 3, grade10: 8.5, improvedGrade10: null, isImproving: false },
        { id: 2, name: 'Lập trình', credits: 4, grade10: 9.5, improvedGrade10: null, isImproving: false },
        { id: 3, name: 'Chưa có điểm', credits: 3, grade10: '', improvedGrade10: null, isImproving: false },
      ],
    },
  ];

  const metrics = calculateGpaMetrics(semesters, 3.6);
  assert.equal(metrics.totalCredits, 7);
  assert.ok(Math.abs(metrics.currentCPA - 27.4 / 7) < 1e-9);
  assert.equal(metrics.unstudiedCredits, 0);
  assert.equal(metrics.status, 'achieved');
  assert.equal(metrics.requiredGPA, null);
  assert.equal(metrics.semesterMetrics[0].credits, 7);
  assert.ok(Math.abs((metrics.semesterMetrics[0].gpa4 ?? 0) - 27.4 / 7) < 1e-9);
  assert.equal(getDegreeClassification(metrics.currentCPA, metrics.totalCredits), 'Xuất sắc');
});

runTest('calculateGpaMetrics replaces old grade when isImproving + improvedGrade10 is set', () => {
  const semesters: GpaSemester[] = [
    {
      id: 1,
      semesterName: 'HK1',
      mode: 'subject',
      summaryCredits: '',
      summaryGPA: '',
      subjects: [
        {
          id: 1,
          name: 'Cấu trúc dữ liệu',
          credits: 3,
          grade10: 3.0,
          improvedGrade10: 8.5,
          isImproving: true,
        },
        {
          id: 2,
          name: 'Mạng máy tính',
          credits: 3,
          grade10: 5.5,
          improvedGrade10: '',
          isImproving: true,
        },
      ],
    },
  ];

  const metrics = calculateGpaMetrics(semesters, 3.2);
  assert.equal(metrics.totalCredits, 6);
  assert.ok(Math.abs(metrics.currentCPA - 2.9) < 1e-9);
  assert.equal(metrics.status, 'need_credits');
});

// 3. Summary mode & Target GPA status tests
runTest('calculateGpaMetrics handles summary mode (studied + unstudied) and target statuses', () => {
  const semesters: GpaSemester[] = [
    {
      id: 1,
      semesterName: 'Năm 1-3',
      mode: 'summary',
      summaryCredits: 100,
      summaryGPA: 3.0,
      subjects: [],
    },
    {
      id: 2,
      semesterName: 'Năm 4 (chưa học)',
      mode: 'summary',
      summaryCredits: 20,
      summaryGPA: '',
      subjects: [],
    },
  ];

  const mInProgress = calculateGpaMetrics(semesters, 3.1);
  assert.equal(mInProgress.totalCredits, 100);
  assert.equal(mInProgress.unstudiedCredits, 20);
  assert.equal(mInProgress.status, 'in_progress');
  assert.ok(Math.abs((mInProgress.requiredGPA ?? 0) - 3.6) < 1e-9);

  const mImpossible = calculateGpaMetrics(semesters, 3.6);
  assert.equal(mImpossible.status, 'impossible');
  assert.ok((mImpossible.requiredGPA ?? 0) > 4.0);

  const mAchieved = calculateGpaMetrics(semesters, 2.0);
  assert.equal(mAchieved.status, 'achieved');
  assert.equal(mAchieved.requiredGPA, 0);
});

// 4. Import / Merge JSON tests
runTest('mergeImportedGpaSemesters merges duplicate semesters and preserves TinhGPA format', () => {
  const rawJson = [
    {
      id: 101,
      semesterName: 'HK1',
      mode: 'summary',
      summaryCredits: '15',
      summaryGPA: '3.2',
      subjects: [],
    },
    {
      id: 102,
      semesterName: 'HK1',
      mode: 'subject',
      summaryCredits: '',
      summaryGPA: '',
      subjects: [
        { id: 1, name: 'Toán', credits: 3, grade10: '8.5', improvedGrade10: null, isImproving: false },
      ],
    },
    {
      id: 103,
      semesterName: 'HK1',
      mode: 'subject',
      subjects: [
        { id: 2, name: 'Lý', credits: 2, grade10: '7.5', improvedGrade10: null, isImproving: false },
      ],
    },
    {
      semesterName: 'HK2',
      mode: 'summary',
      summaryCredits: 18,
      summaryGPA: '',
    },
  ];

  const merged = mergeImportedGpaSemesters(rawJson);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].semesterName, 'HK1');
  assert.equal(merged[0].mode, 'subject');
  assert.equal(merged[0].subjects.length, 2);
  assert.equal(merged[0].subjects[0].name, 'Toán');
  assert.equal(merged[0].subjects[1].name, 'Lý');

  assert.equal(merged[1].semesterName, 'HK2');
  assert.equal(merged[1].mode, 'summary');
  assert.equal(merged[1].summaryCredits, 18);
  assert.equal(merged[1].summaryGPA, '');
});

runTest('mergeImportedGpaSemesters throws on non-array input', () => {
  assert.throws(() => mergeImportedGpaSemesters({ invalid: true }), /không hợp lệ/);
});

// 5. Merge WebSchedule courses test
runTest('mergeWebScheduleCourses appends new courses without overwriting existing grades', () => {
  const existing: GpaSemester[] = [
    {
      id: 'existing-1',
      semesterName: 'HK1 2025-2026',
      mode: 'subject',
      summaryCredits: '',
      summaryGPA: '',
      subjects: [
        { id: 's1', name: 'Giải tích 1', credits: 3, grade10: '9.0', improvedGrade10: null, isImproving: false },
      ],
    },
  ];

  const result = mergeWebScheduleCourses(
    existing,
    [
      { id: 'sem1', name: 'HK1 2025-2026' },
      { id: 'sem2', name: 'HK2 2025-2026' },
    ],
    [
      { id: 'c1', name: 'Giải tích 1', credits: 3, semesterId: 'sem1' },
      { id: 'c2', name: 'Đại số tuyến tính', credits: 3, semesterId: 'sem1' },
      { id: 'c3', name: 'Cơ sở dữ liệu', credits: 4, semesterId: 'sem2' },
    ]
  );

  assert.equal(result.addedSemesters, 1);
  assert.equal(result.addedSubjects, 2);
  assert.equal(result.semesters.length, 2);
  assert.equal(result.semesters[0].subjects.length, 2);
  assert.equal(result.semesters[0].subjects[0].grade10, '9.0');
  assert.equal(result.semesters[0].subjects[1].name, 'Đại số tuyến tính');
  assert.equal(result.semesters[1].semesterName, 'HK2 2025-2026');
  assert.equal(result.semesters[1].subjects[0].credits, 4);
});

console.log(`\nAll ${passed} GPA/CPA tests passed!`);
