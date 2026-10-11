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

  var DEFAULT_SYMPTOMS = [
    'Cramps', 'Headache', 'Bloating', 'Back pain', 'Tender breasts', 'Acne',
    'Fatigue', 'Nausea', 'Cravings', 'Insomnia', 'Discharge', 'Dizziness'
  ];

  /**
   * Clean a user-defined symptom list: trimmed, unique (ignoring case),
   * at most 40 characters each and 60 entries.
   */
  function cleanSymptomList(list) {
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (x) {
      if (typeof x !== 'string') return;
      var v = x.replace(/\s+/g, ' ').trim().slice(0, 40);
      var key = v.toLowerCase();
      if (!v || seen[key] || key.indexOf('mood:') === 0) return;
      seen[key] = true;
      out.push(v);
    });
    return out.slice(0, 60);
  }

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

  // ---------- Cycle phases ----------

  var PHASES = ['menstruation', 'follicular', 'ovulation', 'luteal'];

  /**
   * Phase of a given cycle day (1-based).
   * Ovulation is placed `luteal` days before the next period and shown as a
   * three-day phase around that day. Menstruation always wins.
   */
  function phaseOfDay(cycleDay, cycleLength, periodLength, lutealLength) {
    var ov = cycleLength - Math.min(lutealLength, cycleLength - 1);
    if (cycleDay <= periodLength) return 'menstruation';
    if (Math.abs(cycleDay - ov) <= 1) return 'ovulation';
    if (cycleDay < ov) return 'follicular';
    return 'luteal';
  }

  /**
   * Contiguous phase ranges for one cycle.
   * @returns {Array<{phase,start,end,startDay,endDay}>}
   */
  function phaseRanges(start, cycleLength, periodLength, lutealLength) {
    var out = [];
    for (var cd = 1; cd <= cycleLength; cd++) {
      var ph = phaseOfDay(cd, cycleLength, periodLength, lutealLength);
      var last = out[out.length - 1];
      if (last && last.phase === ph) {
        last.endDay = cd;
        last.end = addDays(start, cd - 1);
      } else {
        out.push({ phase: ph, startDay: cd, endDay: cd, start: addDays(start, cd - 1), end: addDays(start, cd - 1) });
      }
    }
    return out;
  }

  /**
   * Every cycle from the first logged period into the predicted future.
   * kind: 'past' (completed), 'current' or 'predicted'.
   */
  function cycleTimeline(days, settings, today, count) {
    var p = predict(days, settings, today, count || 3);
    var stats = p.stats;
    var list = [];
    if (!p.lastPeriod) return { prediction: p, cycles: list };
    stats.cycles.forEach(function (c) {
      if (c.start >= p.lastPeriod.start) return;
      list.push({ kind: 'past', start: c.start, length: c.length, periodLength: c.periodLength, valid: c.valid });
    });
    var last = p.lastPeriod;
    var curPeriod = p.onPeriod ? Math.max(last.length, stats.periodLength) : last.length;
    list.push({
      kind: 'current',
      start: last.start,
      length: Math.max(1, diffDays(last.start, p.nextPeriod)),
      periodLength: curPeriod,
      valid: true
    });
    p.upcoming.forEach(function (u) {
      list.push({ kind: 'predicted', start: u.start, length: stats.cycleLength, periodLength: stats.periodLength, valid: true });
    });
    return { prediction: p, cycles: list };
  }

  function tagsOf(entry) {
    if (!entry) return [];
    var t = (entry.symptoms || []).slice();
    if (entry.mood) t.push('mood:' + entry.mood);
    return t;
  }

  /**
   * Classify every date in [from, to] for calendar rendering.
   * @returns {Object} map ISO -> {phase, cycleDay, predicted, period, spotting, logged}
   */
  function calendarMarks(days, settings, today, from, to) {
    var count = 3;
    var s = getStats(days, settings);
    if (to > today) count = Math.min(60, Math.max(3, Math.ceil(diffDays(today, to) / s.cycleLength) + 1));
    var tl = cycleTimeline(days, settings, today, count);
    var luteal = tl.prediction.stats.lutealLength;
    var marks = {};
    function get(iso) { return (marks[iso] = marks[iso] || {}); }

    tl.cycles.forEach(function (c) {
      var end = addDays(c.start, c.length - 1);
      if (end < from || c.start > to) return;
      for (var cd = 1; cd <= c.length; cd++) {
        var iso = addDays(c.start, cd - 1);
        if (iso < from) continue;
        if (iso > to) break;
        var ph = phaseOfDay(cd, c.length, c.periodLength, luteal);
        // A gap in logging: only the period itself is meaningful.
        if (!c.valid && ph !== 'menstruation') continue;
        var m = get(iso);
        m.phase = ph;
        m.cycleDay = cd;
        m.predicted = c.kind === 'predicted' || (c.kind === 'current' && iso > today);
      }
    });

    Object.keys(days || {}).forEach(function (iso) {
      if (iso < from || iso > to) return;
      var e = days[iso];
      if (!e) return;
      var m = get(iso);
      if (isFlowDay(e)) { m.period = true; m.phase = 'menstruation'; m.predicted = false; }
      else if (e.flow === 'spotting') m.spotting = true;
      if (e.flow || tagsOf(e).length || e.note) m.logged = true;
    });
    return marks;
  }

  // ---------- Symptom and mood patterns ----------

  // Where a day sits in its cycle. Days before ovulation are counted from the
  // period start; later days are counted back from the next period, because
  // PMS-type changes line up with the coming period, not the last one.
  function cyclePosition(cycleDay, cycleLength, lutealLength) {
    var ov = cycleLength - Math.min(lutealLength, cycleLength - 1);
    if (cycleDay < ov - 1) return { r: 's', v: cycleDay };
    return { r: 'e', v: cycleLength - cycleDay + 1 };
  }

  function samePosition(a, b) {
    return a.r === b.r && Math.abs(a.v - b.v) <= 1;
  }

  /**
   * Symptoms and moods that showed up at this point of the cycle before.
   * Looks at the most recent completed cycles that have any logs, and flags a
   * tag for a coming day when it appeared around the same cycle position in
   * at least two of them and at least half of them.
   * @returns {Array<{tag,label,kind,days:string[],cycles:number,of:number}>}
   */
  function patternForecast(days, settings, today, horizon) {
    horizon = horizon || 7;
    var tl = cycleTimeline(days, settings, today, 3);
    var p = tl.prediction;
    var luteal = p.stats.lutealLength;
    if (!p.lastPeriod) return [];

    var refs = [];
    tl.cycles.forEach(function (c) {
      if (c.kind !== 'past' || !c.valid) return;
      var byTag = {};
      var any = false;
      for (var cd = 1; cd <= c.length; cd++) {
        var tags = tagsOf(days[addDays(c.start, cd - 1)]);
        if (!tags.length) continue;
        any = true;
        var pos = cyclePosition(cd, c.length, luteal);
        tags.forEach(function (t) { (byTag[t] = byTag[t] || []).push(pos); });
      }
      if (any) refs.push(byTag);
    });
    refs = refs.slice(-RECENT_CYCLES);
    if (refs.length < 2) return [];

    var future = [];
    for (var i = 0; i < horizon; i++) {
      var d = addDays(today, i);
      for (var k = tl.cycles.length - 1; k >= 0; k--) {
        var c = tl.cycles[k];
        if (c.kind !== 'past' && c.start <= d) {
          future.push({ iso: d, pos: cyclePosition(diffDays(c.start, d) + 1, c.length, luteal) });
          break;
        }
      }
    }

    var allTags = {};
    refs.forEach(function (r) { Object.keys(r).forEach(function (t) { allTags[t] = true; }); });
    var need = Math.max(2, Math.ceil(refs.length / 2));
    var out = [];
    Object.keys(allTags).forEach(function (tag) {
      var hitDays = [];
      var best = 0;
      future.forEach(function (f) {
        var n = refs.filter(function (r) {
          return (r[tag] || []).some(function (q) { return samePosition(q, f.pos); });
        }).length;
        if (n >= need) { hitDays.push(f.iso); best = Math.max(best, n); }
      });
      if (!hitDays.length) return;
      var isMood = tag.indexOf('mood:') === 0;
      out.push({
        tag: tag,
        label: isMood ? tag.slice(5) : tag,
        kind: isMood ? 'mood' : 'symptom',
        days: hitDays,
        cycles: best,
        of: refs.length
      });
    });
    out.sort(function (a, b) {
      return a.days[0] < b.days[0] ? -1 : a.days[0] > b.days[0] ? 1 : b.cycles / b.of - a.cycles / a.of;
    });
    return out;
  }

  /**
   * How often each symptom and mood was logged in each phase.
   * @returns {Object} phase -> {tag: count}
   */
  function phaseTagCounts(days, settings, today) {
    var dates = Object.keys(days || {}).filter(function (k) { return tagsOf(days[k]).length; }).sort();
    var out = { menstruation: {}, follicular: {}, ovulation: {}, luteal: {} };
    if (!dates.length) return out;
    var marks = calendarMarks(days, settings, today, dates[0], dates[dates.length - 1]);
    dates.forEach(function (iso) {
      var ph = marks[iso] && marks[iso].phase;
      if (!ph) return;
      tagsOf(days[iso]).forEach(function (t) { out[ph][t] = (out[ph][t] || 0) + 1; });
    });
    return out;
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
      settings: normalizeSettings(raw.settings),
      symptoms: Array.isArray(raw.symptoms) ? cleanSymptomList(raw.symptoms) : DEFAULT_SYMPTOMS.slice()
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
    PHASES: PHASES,
    DEFAULT_SYMPTOMS: DEFAULT_SYMPTOMS,
    cleanSymptomList: cleanSymptomList,
    phaseOfDay: phaseOfDay,
    phaseRanges: phaseRanges,
    cycleTimeline: cycleTimeline,
    patternForecast: patternForecast,
    phaseTagCounts: phaseTagCounts,
    sanitizeData: sanitizeData,
    normalizeSettings: normalizeSettings
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cycle = api;
})(typeof self !== 'undefined' ? self : this);
