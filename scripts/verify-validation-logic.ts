import assert from 'node:assert/strict';
import {
  compareDateRange,
  compareTimeRange,
  formatIsoToVnDate,
  isValidDateRange,
  isValidIsoDate,
  isValidTime24,
  isValidTimeRange,
  isValidVnDate,
  normalizeTime24,
  parseDateToIso,
  parseVnOrIsoDate,
} from '../src/lib/date-time-validation';
import {
  assignmentSchema,
  examSchema,
  scheduleSchema,
  semesterSchema,
  sessionUpdateSchema,
} from '../src/lib/validations';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
}

// 1. Strict Vietnamese date dd/MM/yyyy
test('vn date: valid standard dates', () => {
  assert.equal(isValidVnDate('01/01/2026'), true);
  assert.equal(isValidVnDate('31/12/2026'), true);
  assert.equal(isValidVnDate('04/01/2027'), true);
});

test('vn date: leap year vs non-leap year', () => {
  assert.equal(isValidVnDate('29/02/2024'), true);
  assert.equal(isValidVnDate('29/02/2000'), true);
  assert.equal(isValidVnDate('29/02/2028'), true);
  assert.equal(isValidVnDate('29/02/2026'), false);
  assert.equal(isValidVnDate('29/02/1900'), false);
});

test('vn date: reject impossible calendar dates & wrong format', () => {
  assert.equal(isValidVnDate('31/02/2026'), false);
  assert.equal(isValidVnDate('31/04/2026'), false);
  assert.equal(isValidVnDate('32/01/2026'), false);
  assert.equal(isValidVnDate('00/01/2026'), false);
  assert.equal(isValidVnDate('01/13/2026'), false);
  assert.equal(isValidVnDate('4/1/2026'), false);
  assert.equal(isValidVnDate('2026-01-04'), false);
  assert.equal(isValidVnDate('04-01-2026'), false);
});

// 2. Strict ISO date yyyy-MM-dd
test('iso date: valid & invalid cases', () => {
  assert.equal(isValidIsoDate('2024-02-29'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2026-04-31'), false);
  assert.equal(isValidIsoDate('04/01/2026'), false);
});

// 3. Bidirectional conversion dd/MM/yyyy <-> yyyy-MM-dd
test('parseDateToIso & parseVnOrIsoDate: accept dd/MM/yyyy and yyyy-MM-dd', () => {
  assert.equal(parseDateToIso('04/01/2027'), '2027-01-04');
  assert.equal(parseVnOrIsoDate('4/1/2027'), '2027-01-04');
  assert.equal(parseDateToIso('2027-01-04'), '2027-01-04');
  assert.equal(parseDateToIso('29/02/2024'), '2024-02-29');
  assert.equal(parseDateToIso('29/02/2026'), null);
  assert.equal(parseDateToIso('31/02/2026'), null);
  assert.equal(parseDateToIso('13/20/2026'), null); // never US MM/DD/YYYY
  assert.equal(parseDateToIso('04-01-27'), null);
});

test('formatIsoToVnDate: yyyy-MM-dd -> dd/MM/yyyy', () => {
  assert.equal(formatIsoToVnDate('2027-01-04'), '04/01/2027');
  assert.equal(formatIsoToVnDate('2024-02-29'), '29/02/2024');
  assert.equal(formatIsoToVnDate(''), '');
});

// 4. Time HH:mm strict validation & normalization
test('isValidTime24: boundaries 00:00..23:59', () => {
  assert.equal(isValidTime24('00:00'), true);
  assert.equal(isValidTime24('07:05'), true);
  assert.equal(isValidTime24('23:59'), true);
  assert.equal(isValidTime24('24:00'), false);
  assert.equal(isValidTime24('12:60'), false);
  assert.equal(isValidTime24('7:05'), false);
  assert.equal(isValidTime24('7:5'), false);
  assert.equal(isValidTime24('07:05:00'), false);
});

test('normalizeTime24: pads H:m and rejects invalid times', () => {
  assert.equal(normalizeTime24('7:5'), '07:05');
  assert.equal(normalizeTime24('7:00'), '07:00');
  assert.equal(normalizeTime24('00:00'), '00:00');
  assert.equal(normalizeTime24('23:59'), '23:59');
  assert.equal(normalizeTime24('09:30:00'), '09:30');
  assert.equal(normalizeTime24('24:00'), null);
  assert.equal(normalizeTime24('12:60'), null);
  assert.equal(normalizeTime24('09:30:15'), null);
});

// 5. Date & Time range comparisons
test('isValidDateRange / compareDateRange: start <= end', () => {
  assert.equal(isValidDateRange('01/09/2026', '01/09/2026'), true);
  assert.equal(compareDateRange('01/09/2026', '15/01/2027'), true);
  assert.equal(isValidDateRange('2026-09-01', '2027-01-15'), true);
  assert.equal(isValidDateRange('15/01/2027', '01/09/2026'), false);
  assert.equal(isValidDateRange('31/02/2026', '01/03/2026'), false);
});

test('isValidTimeRange / compareTimeRange: start < end', () => {
  assert.equal(isValidTimeRange('07:00', '09:25'), true);
  assert.equal(compareTimeRange('00:00', '23:59'), true);
  assert.equal(isValidTimeRange('09:00', '09:00'), false);
  assert.equal(isValidTimeRange('10:00', '09:00'), false);
  assert.equal(isValidTimeRange('7:00', '09:00'), false);
  assert.equal(isValidTimeRange('24:00', '25:00'), false);
});

// 6. Zod schemas in src/lib/validations.ts
test('semesterSchema: accepts dd/MM/yyyy & yyyy-MM-dd, normalizes to ISO, rejects start > end', () => {
  const okVn = semesterSchema.safeParse({
    name: 'HK1 2026-2027',
    startDate: '01/09/2026',
    endDate: '15/01/2027',
  });
  assert.equal(okVn.success, true);
  if (okVn.success) {
    assert.equal(okVn.data.startDate, '2026-09-01');
    assert.equal(okVn.data.endDate, '2027-01-15');
  }

  const badRange = semesterSchema.safeParse({
    name: 'HK1',
    startDate: '2027-01-15',
    endDate: '2026-09-01',
  });
  assert.equal(badRange.success, false);

  const badDate = semesterSchema.safeParse({
    name: 'HK1',
    startDate: '29/02/2026',
    endDate: '30/05/2026',
  });
  assert.equal(badDate.success, false);
});

test('scheduleSchema: validates HH:mm, startTime < endTime, startDate <= endDate', () => {
  const ok = scheduleSchema.safeParse({
    courseId: 'c1',
    dayOfWeek: 1,
    startTime: '07:00',
    endTime: '09:25',
    startDate: '01/09/2026',
    endDate: '31/12/2026',
  });
  assert.equal(ok.success, true);

  const badTimeEqual = scheduleSchema.safeParse({
    courseId: 'c1',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '09:00',
    startDate: '2026-09-01',
    endDate: '2026-12-31',
  });
  assert.equal(badTimeEqual.success, false);

  const badTimeFormat = scheduleSchema.safeParse({
    courseId: 'c1',
    dayOfWeek: 1,
    startTime: '7:00',
    endTime: '24:00',
    startDate: '2026-09-01',
    endDate: '2026-12-31',
  });
  assert.equal(badTimeFormat.success, false);
});

test('sessionUpdateSchema: allows empty/omitted times, rejects invalid range or format', () => {
  assert.equal(sessionUpdateSchema.safeParse({ status: 'completed' }).success, true);
  assert.equal(
    sessionUpdateSchema.safeParse({ startTime: '', endTime: '' }).success,
    true
  );
  assert.equal(
    sessionUpdateSchema.safeParse({ startTime: '08:00', endTime: '10:00' }).success,
    true
  );
  assert.equal(
    sessionUpdateSchema.safeParse({ startTime: '10:00', endTime: '08:00' }).success,
    false
  );
  assert.equal(
    sessionUpdateSchema.safeParse({ startTime: '25:00' }).success,
    false
  );
});

test('assignmentSchema: validates dueDate in dd/MM/yyyy and yyyy-MM-dd', () => {
  const ok = assignmentSchema.safeParse({
    title: 'Bài tập lớn',
    dueDate: '29/02/2024',
    courseId: 'c1',
  });
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.dueDate, '2024-02-29');

  const bad = assignmentSchema.safeParse({
    title: 'Bài tập lớn',
    dueDate: '31/04/2026',
    courseId: 'c1',
  });
  assert.equal(bad.success, false);
});

test('examSchema: validates date, optional HH:mm times, and startTime < endTime', () => {
  const okWithEmptyTimes = examSchema.safeParse({
    title: 'Thi cuối kỳ',
    type: 'final',
    date: '15/06/2026',
    startTime: '',
    endTime: '',
    courseId: 'c1',
  });
  assert.equal(okWithEmptyTimes.success, true);
  if (okWithEmptyTimes.success) assert.equal(okWithEmptyTimes.data.date, '2026-06-15');

  const badTimeRange = examSchema.safeParse({
    title: 'Thi cuối kỳ',
    type: 'final',
    date: '2026-06-15',
    startTime: '14:00',
    endTime: '14:00',
    courseId: 'c1',
  });
  assert.equal(badTimeRange.success, false);

  const badTimeFormat = examSchema.safeParse({
    title: 'Thi cuối kỳ',
    type: 'final',
    date: '2026-06-15',
    startTime: '12:60',
    courseId: 'c1',
  });
  assert.equal(badTimeFormat.success, false);
});

console.log(`PASS ${passed} date-time & schema validation tests`);
