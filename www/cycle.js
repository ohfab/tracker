/*
 * Cycle math for the period tracker.
 * Pure functions, no DOM access. Works in the browser (window.Cycle)
 * and in Node (module.exports) so it can be unit-tested.
 *
 * Dates are handled as "YYYY-MM-DD" strings and converted to UTC day
 * numbers for arithmetic, which avoids daylight-saving off-by-one bugs.
 */
(function (root) {
  'use strict';

  var DAY_MS = 86400000;
  var FLOW_LEVELS = ['spotting', 'light', 'medium', 'heavy'];

  // Cycles outside this range are treated as data-entry gaps or outliers
  // and are left out of averages.
  var MIN_CYCLE = 15;
  var MAX_CYCLE = 90;
  // How many recent cycles feed the average used for predictions.
  var RECENT_CYCLES = 6;
  // Flow days separated by at most this many days belong to one period.
  var MAX_GAP_IN_PERIOD = 2;

  var DEFAULT_SETTINGS = {
    cycleLength: 28,
    periodLength: 5,
    lutealLength: 14
  };

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function isISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = parse(s);
    return toISO(d) === s;
  }

  // "YYYY-MM-DD" -> UTC day number
  function parse(s) {
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }

  // UTC day number -> "YYYY-MM-DD"
  function toISO(dayNum) {
    var d = new Date(dayNum * DAY_MS);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function addDays(iso, n) {
    return toISO(parse(iso) + n);
  }

  function diffDays(a, b) {
    return parse(b) - parse(a);
  }

  // Local calendar date of a JS Date as "YYYY-MM-DD".
  function localISO(date) {
    date = date || new Date();
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function isFlowDay(entry) {
    return !!(entry && entry.flow && entry.flow !== 'spotting');
  }

  /**
   * Group logged flow days into periods.
   * Spotting alone does not start or extend a period.
   * @param {Object} days map of ISO date -> entry
   * @returns {Array<{start:string,end:string,length:number}>} oldest first
   */
  function getPeriods(days) {
    var dates = Object.keys(days || {})
      .filter(function (k) { return isISODate(k) && isFlowDay(days[k]); })
      .sort();
    var periods = [];
    var cur = null;
    dates.forEach(function (d) {
      if (cur && diffDays(cur.end, d) <= MAX_GAP_IN_PERIOD) {
        cur.end = d;
      } else {
        if (cur) periods.push(cur);
        cur = { start: d, end: d };
      }
    });
    if (cur) periods.push(cur);
    periods.forEach(function (p) { p.length = diffDays(p.start, p.end) + 1; });
    return periods;
  }

  /**
   * Completed cycles: from one period start to the day before the next.
   * @returns {Array<{start:string,end:string,length:number,periodLength:number,valid:boolean}>}
   */
  function getCycles(periods) {
    var cycles = [];
    for (var i = 0; i < periods.length - 1; i++) {
      var len = diffDays(periods[i].start, periods[i + 1].start);
      cycles.push({
        start: periods[i].start,
        end: addDays(periods[i + 1].start, -1),
        length: len,
        periodLength: periods[i].length,
        valid: len >= MIN_CYCLE && len <= MAX_CYCLE
      });
    }
    return cycles;
  }

  function mean(nums) {
    if (!nums.length) return null;
    return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
  }

  function stdDev(nums) {
    if (nums.length < 2) return null;
    var m = mean(nums);
    return Math.sqrt(mean(nums.map(function (n) { return (n - m) * (n - m); })));
  }

  function normalizeSettings(settings) {
    var s = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      var v = settings && Number(settings[k]);
      s[k] = v && isFinite(v) && v > 0 ? Math.round(v) : DEFAULT_SETTINGS[k];
    });
    return s;
  }

  /**
   * Summary statistics over the logged history.
   */
  function getStats(days, settings) {
    var s = normalizeSettings(settings);
    var periods = getPeriods(days);
    var cycles = getCycles(periods);
    var valid = cycles.filter(function (c) { return c.valid; });
    var recent = valid.slice(-RECENT_CYCLES);
    var lengths = valid.map(function (c) { return c.length; });
    // Only periods that are over count toward the average period length.
    // The latest one may still be in progress, so it is left out.
    var donePeriods = periods.slice(0, -1);
    var periodLens = donePeriods.slice(-RECENT_CYCLES).map(function (p) { return p.length; });

    var avgCycle = recent.length ? mean(recent.map(function (c) { return c.length; })) : null;
    var avgPeriod = periodLens.length ? mean(periodLens) : null;

    return {
      periods: periods,
      cycles: cycles,
      cycleCount: valid.length,
      averageCycle: avgCycle,
      averagePeriod: avgPeriod,
      shortestCycle: lengths.length ? Math.min.apply(null, lengths) : null,
      longestCycle: lengths.length ? Math.max.apply(null, lengths) : null,
      variation: stdDev(recent.map(function (c) { return c.length; })),
      // Values actually used for predictions
      cycleLength: avgCycle ? Math.round(avgCycle) : s.cycleLength,
      periodLength: avgPeriod ? Math.round(avgPeriod) : s.periodLength,
      lutealLength: s.lutealLength,
      usingDefaults: !avgCycle
    };
  }

  /**
   * Predict upcoming periods and fertile windows.
   * @param {Object} days logged entries
   * @param {Object} settings user defaults
   * @param {string} today ISO date
   * @param {number} [count=3] how many future cycles to predict
   */
  function predict(days, settings, today, count) {
    count = count || 3;
    var stats = getStats(days, settings);
    var periods = stats.periods;
    var result = {
      stats: stats,
      today: today,
      lastPeriod: null,
      cycleDay: null,
      onPeriod: false,
      nextPeriod: null,
      daysUntilNext: null,
      daysLate: 0,
      phase: null,
      upcoming: [],
      currentFertile: null
    };
    if (!periods.length) return result;

    var cycleLen = stats.cycleLength;
    var periodLen = stats.periodLength;
    var luteal = Math.min(stats.lutealLength, cycleLen - 1);

    // Only consider periods that started on or before today.
    var past = periods.filter(function (p) { return p.start <= today; });
    if (!past.length) return result;
    var last = past[past.length - 1];
    result.lastPeriod = last;
    result.cycleDay = diffDays(last.start, today) + 1;
    // Still on the period if today is a logged day, or if it falls inside
    // the expected length (people often log only the first day).
    result.onPeriod = today <= last.end || result.cycleDay <= periodLen;

    function fertileFor(nextStart) {
      var ovulation = addDays(nextStart, -luteal);
      return {
        start: addDays(ovulation, -5),
        end: addDays(ovulation, 1),
        ovulation: ovulation
      };
    }

    // Fertile window for the cycle currently running.
    var expectedNext = addDays(last.start, cycleLen);
    result.currentFertile = fertileFor(expectedNext);

    // If the expected date has passed, the period is late; predictions
    // roll forward from today rather than showing dates in the past.
    var next = expectedNext;
    if (next <= today && !result.onPeriod) {
      result.daysLate = diffDays(next, today);
      next = today;
    } else if (next <= today) {
      // On a period that started long after the last one: just roll on.
      while (next <= today) next = addDays(next, cycleLen);
    }
    result.nextPeriod = next;
    result.daysUntilNext = diffDays(today, next);

    for (var i = 0; i < count; i++) {
      var start = i === 0 ? next : addDays(next, cycleLen * i);
      result.upcoming.push({
        start: start,
        end: addDays(start, periodLen - 1),
        fertile: fertileFor(start)
      });
    }

    // Phase of the current cycle, for the dashboard.
    var f = result.currentFertile;
    if (result.onPeriod) result.phase = 'period';
    else if (result.daysLate > 0) result.phase = 'late';
    else if (today === f.ovulation) result.phase = 'ovulation';
    else if (today >= f.start && today <= f.end) result.phase = 'fertile';
    else if (today < f.start) result.phase = 'follicular';
    else result.phase = 'luteal';

    return result;
  }

  /**
   * Classify every date in [from, to] for calendar rendering.
   * @returns {Object} map ISO -> {logged, period, predicted, fertile, ovulation}
   */
  function calendarMarks(days, prediction, from, to) {
    var marks = {};
    function mark(iso, key) {
      if (iso < from || iso > to) return;
      (marks[iso] = marks[iso] || {})[key] = true;
    }
    function markRange(a, b, key) {
      for (var d = a; d <= b; d = addDays(d, 1)) mark(d, key);
    }

    Object.keys(days || {}).forEach(function (iso) {
      var e = days[iso];
      if (!e) return;
      if (isFlowDay(e)) mark(iso, 'period');
      else if (e.flow === 'spotting') mark(iso, 'spotting');
      if (e.flow || (e.symptoms && e.symptoms.length) || e.mood || e.note) mark(iso, 'logged');
    });

    if (prediction && prediction.upcoming) {
      if (prediction.currentFertile && prediction.lastPeriod) {
        var cf = prediction.currentFertile;
        markRange(cf.start, cf.end, 'fertile');
        mark(cf.ovulation, 'ovulation');
      }
      prediction.upcoming.forEach(function (u) {
        markRange(u.start, u.end, 'predicted');
        markRange(u.fertile.start, u.fertile.end, 'fertile');
        mark(u.fertile.ovulation, 'ovulation');
      });
    }

    // Logged period days take priority over predictions.
    Object.keys(marks).forEach(function (iso) {
      var m = marks[iso];
      if (m.period) { delete m.predicted; delete m.fertile; delete m.ovulation; }
    });
    return marks;
  }

  /**
   * Validate and clean imported data. Throws on unusable input.
   */
  function sanitizeData(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('File does not contain tracker data.');
    var days = raw.days;
    if (!days || typeof days !== 'object' || Array.isArray(days)) {
      throw new Error('File is missing the "days" section.');
    }
    var clean = {};
    Object.keys(days).forEach(function (iso) {
      if (!isISODate(iso)) return;
      var e = days[iso] || {};
      var out = {};
      if (FLOW_LEVELS.indexOf(e.flow) !== -1) out.flow = e.flow;
      if (Array.isArray(e.symptoms)) {
        out.symptoms = e.symptoms.filter(function (x) { return typeof x === 'string'; }).slice(0, 50);
        if (!out.symptoms.length) delete out.symptoms;
      }
      if (typeof e.mood === 'string' && e.mood) out.mood = e.mood.slice(0, 40);
      if (typeof e.note === 'string' && e.note.trim()) out.note = e.note.slice(0, 2000);
      if (Object.keys(out).length) clean[iso] = out;
    });
    return {
      version: 1,
      days: clean,
      settings: normalizeSettings(raw.settings)
    };
  }

  var api = {
    FLOW_LEVELS: FLOW_LEVELS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    isISODate: isISODate,
    addDays: addDays,
    diffDays: diffDays,
    localISO: localISO,
    getPeriods: getPeriods,
    getCycles: getCycles,
    getStats: getStats,
    predict: predict,
    calendarMarks: calendarMarks,
    sanitizeData: sanitizeData,
    normalizeSettings: normalizeSettings
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cycle = api;
})(typeof self !== 'undefined' ? self : this);
