import assert from 'node:assert/strict';
import { parseImportedDay, parseImportedDate, parseImportedTime, parseOcrDay } from '../src/lib/schedule-import';

const cases: Array<[string, unknown, unknown]> = [
  ['ocr: Monday', parseOcrDay('Thứ 2'), 1],
  ['ocr: Tuesday', parseOcrDay('Thứ 3'), 2],
  ['ocr: Saturday', parseOcrDay('Thứ 7'), 6],
  ['ocr: Sunday', parseOcrDay('CN'), 0],
  ['ocr: reject numeric', parseOcrDay('3'), null],
  ['import: numeric internal index', parseImportedDay('3'), 3],
  ['import: weekday text', parseImportedDay('Thứ 3'), 2],
  ['import: reject numeric 7', parseImportedDay('7'), null],
  ['import: Sunday', parseImportedDay('CN'), 0],
  ['date: Jan 4', parseImportedDate('04/01/2027'), '2027-01-04'],
  ['date: May 16', parseImportedDate('16/05/2027'), '2027-05-16'],
  ['date: April 4', parseImportedDate('04/04/2027'), '2027-04-04'],
  ['date: ISO', parseImportedDate('2027-01-04'), '2027-01-04'],
  ['date: year end', parseImportedDate('31/12/2026'), '2026-12-31'],
  ['date: new year', parseImportedDate('01/01/2027'), '2027-01-01'],
  ['date: leap year', parseImportedDate('29/02/2028'), '2028-02-29'],
  ['date: non leap year', parseImportedDate('29/02/2027'), null],
  ['date: invalid April', parseImportedDate('31/04/2027'), null],
  ['date: invalid ISO', parseImportedDate('2027-04-31'), null],
  ['date: invalid month', parseImportedDate('01/13/2027'), null],
  ['date: short year', parseImportedDate('04-01-27'), null],
  ['time: normalize hour', parseImportedTime('7:00'), '07:00'],
  ['time: last minute', parseImportedTime('23:59'), '23:59'],
  ['time: invalid hour', parseImportedTime('24:00'), null],
  ['time: invalid minute', parseImportedTime('12:70'), null],
];

for (const [name, actual, expected] of cases) {
  assert.equal(actual, expected, name);
}
console.log(`PASS ${cases.length} timetable import tests`);
