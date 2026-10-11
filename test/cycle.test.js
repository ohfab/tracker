'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../www/cycle.js');

// Log `len` days of medium flow starting at `start`.
function logPeriod(days, start, len) {
  for (let i = 0; i < len; i++) days[C.addDays(start, i)] = { flow: 'medium' };
  return days;
}

test('date helpers handle month/year boundaries and DST', () => {
  assert.equal(C.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(C.addDays('2023-12-31', 1), '2024-01-01');
  assert.equal(C.addDays('2024-03-10', 1), '2024-03-11'); // US DST start
  assert.equal(C.diffDays('2024-01-01', '2025-01-01'), 366);
  assert.equal(C.isISODate('2024-02-30'), false);
  assert.equal(C.isISODate('2024-2-3'), false);
  assert.equal(C.isISODate('2024-02-29'), true);
});

test('groups consecutive flow days into periods, ignoring spotting', () => {
  const days = logPeriod({}, '2024-01-01', 5);
  days['2024-01-15'] = { flow: 'spotting' };
  logPeriod(days, '2024-01-29', 4);
  const periods = C.getPeriods(days);
  assert.deepEqual(periods.map(p => [p.start, p.end, p.length]), [
    ['2024-01-01', '2024-01-05', 5],
    ['2024-01-29', '2024-02-01', 4]
  ]);
});

test('a one-day gap inside a period does not split it', () => {
  const days = { '2024-01-01': { flow: 'heavy' }, '2024-01-03': { flow: 'light' } };
  assert.equal(C.getPeriods(days).length, 1);
  days['2024-01-06'] = { flow: 'light' };
  assert.equal(C.getPeriods(days).length, 2);
});

test('stats average recent cycles and skip outliers', () => {
  const days = {};
  logPeriod(days, '2024-01-01', 5);
  logPeriod(days, '2024-01-29', 5); // 28
  logPeriod(days, '2024-02-28', 5); // 30
  logPeriod(days, '2024-07-01', 5); // 124 -> outlier (missed logging)
  logPeriod(days, '2024-07-27', 5); // 26
  const s = C.getStats(days);
  assert.equal(s.cycles.length, 4);
  assert.equal(s.cycleCount, 3);
  assert.equal(s.averageCycle, 28);
  assert.equal(s.shortestCycle, 26);
  assert.equal(s.longestCycle, 30);
  assert.equal(s.cycleLength, 28);
  assert.equal(s.periodLength, 5);
  assert.equal(s.usingDefaults, false);
});

test('falls back to settings when there is not enough history', () => {
  const days = logPeriod({}, '2024-01-01', 3);
  const s = C.getStats(days, { cycleLength: 32, periodLength: 6, lutealLength: 13 });
  assert.equal(s.usingDefaults, true);
  assert.equal(s.cycleLength, 32);
  assert.equal(s.periodLength, 6); // latest period may be ongoing, so it is ignored
  assert.equal(s.lutealLength, 13);
});

test('predicts next period, cycle day and fertile window', () => {
  const days = {};
  logPeriod(days, '2024-01-01', 5);
  logPeriod(days, '2024-01-29', 5);
  const p = C.predict(days, {}, '2024-02-10');
  assert.equal(p.cycleDay, 13);
  assert.equal(p.onPeriod, false);
  assert.equal(p.nextPeriod, '2024-02-26');
  assert.equal(p.daysUntilNext, 16);
  assert.equal(p.currentFertile.ovulation, '2024-02-12');
  assert.equal(p.currentFertile.start, '2024-02-07');
  assert.equal(p.currentFertile.end, '2024-02-13');
  assert.equal(p.phase, 'fertile');
  assert.equal(p.upcoming.length, 3);
  assert.equal(p.upcoming[1].start, '2024-03-25');
  assert.equal(p.upcoming[0].end, '2024-03-01');
});

test('reports a late period and rolls the prediction to today', () => {
  const days = logPeriod({}, '2024-01-01', 5);
  const p = C.predict(days, { cycleLength: 28 }, '2024-02-02');
  assert.equal(p.daysLate, 4);
  assert.equal(p.nextPeriod, '2024-02-02');
  assert.equal(p.daysUntilNext, 0);
  assert.equal(p.phase, 'late');
});

test('treats the first days after a logged start as on-period', () => {
  const days = { '2024-03-01': { flow: 'heavy' } };
  const p = C.predict(days, { periodLength: 5 }, '2024-03-03');
  assert.equal(p.onPeriod, true);
  assert.equal(p.phase, 'period');
  assert.equal(C.predict(days, { periodLength: 5 }, '2024-03-07').onPeriod, false);
});

test('no data means no prediction', () => {
  const p = C.predict({}, {}, '2024-01-01');
  assert.equal(p.nextPeriod, null);
  assert.equal(p.upcoming.length, 0);
});

test('calendar marks keep logged periods over predictions', () => {
  const days = logPeriod({}, '2024-01-01', 5);
  days['2024-01-10'] = { note: 'headache', flow: null };
  const pred = C.predict(days, {}, '2024-01-10');
  const marks = C.calendarMarks(days, pred, '2024-01-01', '2024-02-29');
  assert.ok(marks['2024-01-01'].period);
  assert.ok(marks['2024-01-10'].logged);
  assert.ok(marks['2024-01-15'].ovulation);
  assert.ok(marks['2024-01-29'].predicted);
  assert.equal(marks['2024-03-01'], undefined);
});

test('sanitizeData keeps valid entries and drops junk', () => {
  const out = C.sanitizeData({
    days: {
      '2024-01-01': { flow: 'heavy', symptoms: ['cramps', 4], note: ' ok ' },
      '2024-13-01': { flow: 'heavy' },
      '2024-01-02': { flow: 'gushing' },
      '2024-01-03': { mood: 'happy' }
    },
    settings: { cycleLength: '30', periodLength: -1 }
  });
  assert.deepEqual(Object.keys(out.days), ['2024-01-01', '2024-01-03']);
  assert.deepEqual(out.days['2024-01-01'].symptoms, ['cramps']);
  assert.equal(out.settings.cycleLength, 30);
  assert.equal(out.settings.periodLength, 5);
  assert.throws(() => C.sanitizeData({}), /days/);
  assert.throws(() => C.sanitizeData(null));
});
