/* Period Tracker UI. All data lives in localStorage on this device. */
(function () {
  'use strict';

  var C = window.Cycle;
  var STORAGE_KEY = 'period-tracker:v1';

  // Running inside the Android/iOS app (Capacitor) rather than a browser.
  var Cap = window.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());

  function nativePlugin(name) {
    if (!isNative) return null;
    return (Cap.Plugins && Cap.Plugins[name]) || Cap.registerPlugin(name);
  }

  var FLOWS = [
    { id: '', label: 'None' },
    { id: 'spotting', label: 'Spotting' },
    { id: 'light', label: 'Light' },
    { id: 'medium', label: 'Medium' },
    { id: 'heavy', label: 'Heavy' }
  ];
  var MOODS = ['Happy', 'Calm', 'Energetic', 'Sensitive', 'Sad', 'Anxious', 'Irritable'];
  var MOOD_EMOJI = {
    Happy: '😊', Calm: '😌', Energetic: '⚡', Sensitive: '🥺', Sad: '😢', Anxious: '😟', Irritable: '😤'
  };

  var PHASE_INFO = {
    menstruation: {
      name: 'Menstruation',
      desc: 'Your period. Energy is often lower, so go easy on yourself.'
    },
    follicular: {
      name: 'Follicular phase',
      desc: 'Estrogen rises after your period. Energy and mood often lift.'
    },
    ovulation: {
      name: 'Ovulation',
      desc: 'An egg is released around mid-cycle. Many people feel their most energetic now.'
    },
    luteal: {
      name: 'Luteal phase',
      desc: 'Progesterone rises. PMS signs like bloating or mood changes can show up near the end.'
    }
  };
  var LATE_TEXT = 'Your period is later than predicted. Cycles vary, and stress, travel or illness can shift them.';

  // ---------- State ----------

  var state = load();
  var storageOK = true;
  var viewMonth = monthOf(today());
  var editingDate = null;
  var currentView = 'today';

  function emptyState() {
    return { version: 1, days: {}, settings: C.normalizeSettings({}), symptoms: C.DEFAULT_SYMPTOMS.slice() };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return C.sanitizeData(JSON.parse(raw));
    } catch (e) {
      return emptyState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOK = true;
    } catch (e) {
      storageOK = false;
      setMsg('Could not save. Your browser may be blocking storage. Export a backup to keep your data.');
    }
  }

  // ---------- Helpers ----------

  function today() { return C.localISO(new Date()); }

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style') node.setAttribute('style', v);
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function toDate(iso) {
    return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  }

  var fmtShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  var fmtLong = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  var fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  var fmtWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
  var fmtWeekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

  function short(iso) { return fmtShort.format(toDate(iso)); }
  function range(a, b) { return a === b ? short(a) : short(a) + ' – ' + short(b); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function relative(n) {
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? 'in ' + plural(n, 'day') : plural(-n, 'day') + ' ago';
  }

  // "today", "tomorrow" or a short weekday name, for dates in the next week.
  function dayName(iso) {
    var n = C.diffDays(today(), iso);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    return fmtWeekdayShort.format(toDate(iso));
  }

  function monthOf(iso) { return { y: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1 }; }

  function firstOfMonth(v) {
    return v.y + '-' + (v.m < 9 ? '0' : '') + (v.m + 1) + '-01';
  }

  function setMsg(text) { $('data-msg').textContent = text; }

  function tagLabel(tag) {
    if (tag.indexOf('mood:') === 0) {
      var m = tag.slice(5);
      return (MOOD_EMOJI[m] ? MOOD_EMOJI[m] + ' ' : '') + m;
    }
    return tag;
  }

  function hasSymptom(list, name) {
    var key = name.toLowerCase();
    return list.some(function (s) { return s.toLowerCase() === key; });
  }

  // ---------- Today ----------

  function renderToday() {
    var t = today();
    var tl = C.cycleTimeline(state.days, state.settings, t, 3);
    var p = tl.prediction;
    var luteal = p.stats.lutealLength;
    var current = tl.cycles.filter(function (c) { return c.kind === 'current'; })[0];
    var cd = p.cycleDay;
    var late = p.daysLate > 0;

    var ranges, length;
    if (current) {
      length = current.length;
      ranges = C.phaseRanges(current.start, length, current.periodLength, luteal);
    } else {
      length = p.stats.cycleLength;
      ranges = C.phaseRanges(t, length, p.stats.periodLength, luteal);
    }

    // Ring: one colored arc per phase, a marker on today.
    var circ = 2 * Math.PI * 52;
    var segs = $('ring-segments');
    segs.textContent = '';
    ranges.forEach(function (r) {
      var a = (r.startDay - 1) / length;
      var b = r.endDay / length;
      var seg = svgEl('circle', {
        cx: 60, cy: 60, r: 52,
        class: 'ring-seg' + (current && !late && r.startDay > cd ? ' future' : ''),
        stroke: 'var(--' + r.phase + ')',
        'stroke-dasharray': Math.max(0, (b - a) * circ - 1.5) + ' ' + circ,
        'stroke-dashoffset': String(-a * circ)
      });
      segs.appendChild(seg);
    });
    var marker = $('ring-marker');
    if (current) {
      var pos = late ? 1 : (cd - 0.5) / length;
      var ang = pos * 2 * Math.PI;
      marker.setAttribute('cx', String(60 + 52 * Math.cos(ang)));
      marker.setAttribute('cy', String(60 + 52 * Math.sin(ang)));
      marker.hidden = false;
    } else {
      marker.hidden = true;
    }

    var label = 'Welcome', big = '—', sub = '';
    var phase = null;
    if (current) {
      if (late) {
        label = 'Period is';
        big = String(p.daysLate);
        sub = (p.daysLate === 1 ? 'day' : 'days') + ' late';
      } else {
        phase = C.phaseOfDay(cd, length, current.periodLength, luteal);
        label = 'Cycle day';
        big = String(cd);
        sub = p.onPeriod ? 'On your period'
          : p.daysUntilNext === 0 ? 'Period expected today'
          : 'Period in ' + plural(p.daysUntilNext, 'day');
      }
    }
    $('ring-label').textContent = label;
    $('ring-big').textContent = big;
    $('ring-sub').textContent = sub;
    $('ring').setAttribute('aria-label', current ? [label, big, sub].join(' ') : 'No periods logged yet');

    var chip = $('phase-chip');
    if (phase || late) {
      var ph = phase || 'luteal';
      chip.hidden = false;
      chip.dataset.phase = ph;
      chip.style.background = 'var(--' + ph + ')';
      chip.textContent = late ? 'Period late' : PHASE_INFO[ph].name;
    } else {
      chip.hidden = true;
    }
    $('phase-text').textContent = !current
      ? 'Log the first day of your last period to get started. Use the calendar to add earlier periods.'
      : late ? LATE_TEXT : PHASE_INFO[phase].desc;

    var todayEntry = state.days[t];
    var hasFlow = todayEntry && todayEntry.flow && todayEntry.flow !== 'spotting';
    var btn = $('btn-period-today');
    btn.textContent = hasFlow ? 'Period logged today ✓' : (p.onPeriod ? 'Log period today' : 'Period started today');
    btn.dataset.mode = hasFlow ? 'edit' : 'log';

    renderPhaseList(ranges, current ? t : null, late);
    $('defaults-hint').hidden = !(current && p.stats.usingDefaults);
    renderForecast(p);

    // Next periods
    var list = $('upcoming');
    list.textContent = '';
    if (!p.upcoming.length) {
      list.appendChild(el('li', { class: 'empty', text: 'Predictions appear once you log a period.' }));
    }
    p.upcoming.forEach(function (u, i) {
      list.appendChild(el('li', null, [
        el('span', { class: 'dot', 'aria-hidden': 'true' }),
        el('span', { class: 'what' }, [
          el('strong', { text: i === 0 ? 'Next period' : 'Period' }), el('br'),
          el('span', { class: 'hint', text: range(u.start, u.end) })
        ]),
        el('span', { class: 'when', text: relative(C.diffDays(t, u.start)) })
      ]));
    });
  }

  function renderPhaseList(ranges, t, late) {
    var list = $('phases');
    list.textContent = '';
    C.PHASES.forEach(function (ph) {
      var r = ranges.filter(function (x) { return x.phase === ph; })[0];
      var info = PHASE_INFO[ph];
      var when = '', isNow = false;
      if (r && t) {
        isNow = !late && r.start <= t && r.end >= t;
        when = range(r.start, r.end);
      } else if (r) {
        when = r.startDay === r.endDay ? 'Day ' + r.startDay : 'Days ' + r.startDay + '–' + r.endDay;
      } else {
        when = 'Skipped in this cycle';
      }
      var status = '';
      if (r && t && !isNow) {
        status = r.end < t ? 'done' : relative(C.diffDays(t, r.start));
      }
      list.appendChild(el('li', { 'data-phase': ph, class: isNow ? 'now' : null }, [
        el('span', { class: 'dot', 'aria-hidden': 'true' }),
        el('span', { class: 'name' }, [info.name, isNow ? el('span', { class: 'now-tag', text: 'now' }) : null]),
        el('span', { class: 'when' }, [when, status ? el('br') : null, status || null]),
        el('span', { class: 'desc', text: info.desc })
      ]));
    });
  }

  function renderForecast(p) {
    var t = today();
    var list = $('forecast');
    list.textContent = '';
    var items = C.patternForecast(state.days, state.settings, t, 7);
    if (!items.length) {
      list.appendChild(el('li', {
        class: 'empty',
        text: p.stats.cycleCount < 2
          ? 'Log symptoms and moods over a few cycles. When something keeps coming back at the same point in your cycle, you will get a heads-up here.'
          : 'Nothing from your past cycles stands out for the next 7 days.'
      }));
      return;
    }
    var marks = C.calendarMarks(state.days, state.settings, t, t, C.addDays(t, 7));
    items.slice(0, 6).forEach(function (f) {
      var first = f.days[0], last = f.days[f.days.length - 1];
      var when = first === last ? dayName(first) : dayName(first) + ' – ' + dayName(last);
      var title = f.kind === 'mood'
        ? 'You might feel ' + f.label.toLowerCase() + ' ' + when
        : f.label + ' might show up ' + when;
      var ph = marks[first] && marks[first].phase;
      list.appendChild(el('li', { 'data-phase': ph || null }, [
        el('span', { class: 'badge', 'aria-hidden': 'true', text: f.kind === 'mood' ? (MOOD_EMOJI[f.label] || '💭') : '🌸' }),
        el('span', { class: 'title', text: title.charAt(0).toUpperCase() + title.slice(1) }),
        el('span', { class: 'detail', text: 'You logged this around this point in ' + f.cycles + ' of your last ' + f.of + ' cycles.' })
      ]));
    });
  }

  // ---------- Calendar ----------

  function renderCalendar() {
    var t = today();
    var first = firstOfMonth(viewMonth);
    var startOffset = toDate(first).getDay();
    var gridStart = C.addDays(first, -startOffset);
    var gridEnd = C.addDays(gridStart, 41);
    var marks = C.calendarMarks(state.days, state.settings, t, gridStart, gridEnd);

    $('cal-title').textContent = fmtMonth.format(toDate(first));

    var wd = $('cal-weekdays');
    if (!wd.childNodes.length) {
      for (var w = 0; w < 7; w++) wd.appendChild(el('div', { text: fmtWeekday.format(toDate(C.addDays(gridStart, w))) }));
    }

    var grid = $('cal-grid');
    grid.textContent = '';
    var row;
    for (var i = 0; i < 42; i++) {
      if (i % 7 === 0) { row = el('div', { role: 'row', style: 'display:contents' }); grid.appendChild(row); }
      var iso = C.addDays(gridStart, i);
      var m = marks[iso] || {};
      var classes = ['day'];
      var desc = [];
      if (+iso.slice(5, 7) - 1 !== viewMonth.m) classes.push('out');
      if (iso === t) { classes.push('today'); desc.push('today'); }
      if (m.period) { classes.push('period'); desc.push('period'); }
      else if (m.phase) desc.push((m.predicted ? 'predicted ' : '') + PHASE_INFO[m.phase].name.toLowerCase());
      if (m.predicted) classes.push('predicted');
      if (m.spotting) { classes.push('spotting'); desc.push('spotting'); }
      if (m.logged) { classes.push('logged'); desc.push('has entries'); }
      row.appendChild(el('button', {
        type: 'button',
        role: 'gridcell',
        class: classes.join(' '),
        'data-date': iso,
        'data-phase': m.phase || null,
        'aria-label': fmtLong.format(toDate(iso)) + (desc.length ? ', ' + desc.join(', ') : ''),
        'aria-current': iso === t ? 'date' : null,
        text: String(+iso.slice(8, 10))
      }));
    }
  }

  function shiftMonth(delta) {
    var m = viewMonth.m + delta;
    viewMonth = { y: viewMonth.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    renderCalendar();
  }

  // ---------- Insights ----------

  function renderInsights() {
    var t = today();
    var tl = C.cycleTimeline(state.days, state.settings, t, 1);
    var p = tl.prediction;
    var s = p.stats;
    var luteal = s.lutealLength;
    var tiles = $('tiles');
    tiles.textContent = '';

    function fmt(n) { return n === null ? '—' : String(Math.round(n * 10) / 10); }
    function tile(k, v, unit) {
      tiles.appendChild(el('div', { class: 'tile' }, [
        el('div', { class: 'k', text: k }),
        el('div', { class: 'v' }, [v, unit ? el('small', { text: ' ' + unit }) : null])
      ]));
    }
    var regularity = '—';
    if (s.variation !== null) {
      regularity = s.variation <= 2 ? 'Regular' : s.variation <= 4 ? 'Fairly regular' : 'Irregular';
    }
    tile('Average cycle', fmt(s.averageCycle), s.averageCycle !== null ? 'days' : '');
    tile('Average period', fmt(s.averagePeriod), s.averagePeriod !== null ? 'days' : '');
    tile('Cycle range', s.shortestCycle === null ? '—' : s.shortestCycle + '–' + s.longestCycle, s.shortestCycle === null ? '' : 'days');
    tile('Regularity', regularity, s.variation !== null ? '±' + fmt(s.variation) + 'd' : '');

    // History: each cycle as a bar split into its phases.
    var hist = $('history');
    hist.textContent = '';
    var rows = tl.cycles.filter(function (c) { return c.kind !== 'predicted'; }).reverse().slice(0, 12);
    if (!rows.length) {
      hist.appendChild(el('p', { class: 'empty-state', text: 'Your cycles will show here once you log periods.' }));
    } else {
      var scale = Math.max(40, s.longestCycle || 0, rows[0].length, p.cycleDay || 0);
      var wrap = el('div', { class: 'history' });
      rows.forEach(function (c) {
        var isCur = c.kind === 'current';
        var len = Math.min(c.length, scale);
        var parts = c.valid
          ? C.phaseRanges(c.start, len, c.periodLength, luteal)
          : [{ phase: 'menstruation', startDay: 1, endDay: Math.min(c.periodLength, len) }];
        var bar = el('div', {
          class: 'bar' + (isCur ? ' current' : ''),
          role: 'img',
          'aria-label': isCur
            ? 'Current cycle, day ' + p.cycleDay + ' of about ' + c.length
            : 'Cycle of ' + c.length + ' days, period ' + c.periodLength + ' days'
        });
        parts.forEach(function (r) {
          var pieces = [[r.startDay, r.endDay, false]];
          if (isCur && p.cycleDay >= r.startDay && p.cycleDay < r.endDay) {
            pieces = [[r.startDay, p.cycleDay, false], [p.cycleDay + 1, r.endDay, true]];
          } else if (isCur && r.startDay > p.cycleDay) {
            pieces = [[r.startDay, r.endDay, true]];
          }
          pieces.forEach(function (pc) {
            bar.appendChild(el('span', {
              class: 'seg' + (pc[2] ? ' future' : ''),
              'data-phase': r.phase,
              style: 'width:' + ((pc[1] - pc[0] + 1) / scale * 100) + '%'
            }));
          });
        });
        wrap.appendChild(el('div', { class: 'hrow' }, [
          el('span', { class: 'date', text: isCur ? 'Current' : short(c.start) }),
          bar,
          el('span', {
            class: 'len' + (c.valid ? '' : ' flag'),
            title: c.valid ? null : 'Unusual length. Left out of averages, possibly a gap in logging.',
            text: isCur ? p.cycleDay + 'd' : c.length + 'd'
          })
        ]));
      });
      hist.appendChild(wrap);
    }

    // What shows up in each phase
    var counts = C.phaseTagCounts(state.days, state.settings, t);
    var box = $('phase-patterns');
    box.textContent = '';
    var anyTags = C.PHASES.some(function (ph) { return Object.keys(counts[ph]).length; });
    if (!anyTags) {
      box.appendChild(el('p', { class: 'empty-state', text: 'Log symptoms and moods to see which ones belong to which phase.' }));
    } else {
      var wrapP = el('div', { class: 'ph-pattern' });
      C.PHASES.forEach(function (ph) {
        var c = counts[ph];
        var top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 5);
        wrapP.appendChild(el('div', { class: 'ph-row', 'data-phase': ph }, [
          el('span', { class: 'dot', 'aria-hidden': 'true' }),
          el('span', { class: 'name', text: PHASE_INFO[ph].name }),
          el('div', { class: 'tags' }, top.length
            ? top.map(function (tag) { return el('span', { class: 'tag' }, [tagLabel(tag) + ' ', el('b', { text: '×' + c[tag] })]); })
            : [el('span', { class: 'hint', style: 'margin:0', text: 'Nothing logged yet' })])
        ]));
      });
      box.appendChild(wrapP);
    }

    // Symptoms overall
    var totals = {};
    Object.keys(state.days).forEach(function (d) {
      (state.days[d].symptoms || []).forEach(function (sym) { totals[sym] = (totals[sym] || 0) + 1; });
    });
    var topSym = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; }).slice(0, 8);
    var symBox = $('symptom-stats');
    symBox.textContent = '';
    if (!topSym.length) {
      symBox.appendChild(el('p', { class: 'empty-state', text: 'Log symptoms on any day to see them here.' }));
    } else {
      var max = totals[topSym[0]];
      topSym.forEach(function (sym, i) {
        symBox.appendChild(el('div', { class: 'sym-row', 'data-phase': C.PHASES[i % 4] }, [
          el('span', { text: sym }),
          el('div', { class: 'bar', 'aria-hidden': 'true' }, [el('span', { class: 'seg', style: 'width:' + (totals[sym] / max * 100) + '%' })]),
          el('span', { class: 'n', text: String(totals[sym]) })
        ]));
      });
    }
  }

  // ---------- Settings ----------

  var LIMITS = { cycleLength: [15, 90], periodLength: [1, 15], lutealLength: [7, 20] };

  function renderSettings() {
    var f = $('settings-form');
    Object.keys(LIMITS).forEach(function (k) { f.elements[k].value = state.settings[k]; });
    renderSymptomList();
  }

  function renderSymptomList() {
    var list = $('symptom-list');
    list.textContent = '';
    if (!state.symptoms.length) {
      list.appendChild(el('li', { class: 'hint', style: 'background:none;border:0;padding:0', text: 'No symptoms in your list.' }));
    }
    state.symptoms.forEach(function (sym) {
      list.appendChild(el('li', null, [
        el('span', { text: sym }),
        el('button', { type: 'button', 'aria-label': 'Remove ' + sym, 'data-remove': sym, text: '×' })
      ]));
    });
  }

  // Adds a symptom to the list. Returns the stored name, or null if empty.
  function addSymptom(raw) {
    var name = C.cleanSymptomList([raw])[0];
    if (!name) return null;
    var existing = state.symptoms.filter(function (s) { return s.toLowerCase() === name.toLowerCase(); })[0];
    if (existing) return existing;
    state.symptoms.push(name);
    save();
    renderSymptomList();
    return name;
  }

  // ---------- Day editor ----------

  function buildChips(container, name, type, options, extraClass, checked) {
    container.textContent = '';
    options.forEach(function (o) {
      var value = typeof o === 'string' ? o : o.id;
      var label = typeof o === 'string' ? o : o.label;
      if (name === 'mood' && MOOD_EMOJI[value]) label = MOOD_EMOJI[value] + ' ' + label;
      container.appendChild(el('label', { class: 'chip' + (extraClass ? ' ' + extraClass : '') }, [
        el('input', { type: type, name: name, value: value, checked: checked ? checked.indexOf(value) !== -1 : null }),
        el('span', { text: label })
      ]));
    });
  }

  // Your list, plus anything logged on this day that is no longer in it.
  function buildSymptomChips(checked) {
    var options = state.symptoms.slice();
    checked.forEach(function (s) { if (!hasSymptom(options, s)) options.push(s); });
    buildChips($('symptom-chips'), 'symptom', 'checkbox', options, null, checked);
  }

  function checkedSymptoms() {
    return Array.prototype.filter.call($('day-form').querySelectorAll('input[name="symptom"]'), function (c) { return c.checked; })
      .map(function (c) { return c.value; });
  }

  function openEditor(iso) {
    editingDate = iso;
    var e = state.days[iso] || {};
    var form = $('day-form');
    var t = today();
    $('day-title').textContent = (iso === t ? 'Today, ' : '') + fmtLong.format(toDate(iso));
    Array.prototype.forEach.call(form.elements.flow, function (r) { r.checked = r.value === (e.flow || ''); });
    buildSymptomChips(e.symptoms || []);
    Array.prototype.forEach.call(form.elements.mood, function (r) { r.checked = r.value === e.mood; });
    $('day-note').value = e.note || '';
    $('day-symptom-input').value = '';
    Array.prototype.forEach.call(form.elements.mood, function (r) { r.dataset.wasChecked = String(r.checked); });
    var dlg = $('day-dialog');
    dlg.returnValue = '';
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function addSymptomInEditor() {
    var input = $('day-symptom-input');
    var name = addSymptom(input.value);
    if (!name) return;
    var checked = checkedSymptoms();
    if (checked.indexOf(name) === -1) checked.push(name);
    buildSymptomChips(checked);
    input.value = '';
    input.focus();
  }

  function saveEditor() {
    var form = $('day-form');
    var entry = {};
    var flow = form.querySelector('input[name="flow"]:checked');
    if (flow && flow.value) entry.flow = flow.value;
    var syms = checkedSymptoms();
    if (syms.length) entry.symptoms = syms;
    var mood = form.querySelector('input[name="mood"]:checked');
    if (mood) entry.mood = mood.value;
    var note = $('day-note').value.trim();
    if (note) entry.note = note;
    setDay(editingDate, entry);
  }

  function setDay(iso, entry) {
    if (entry && Object.keys(entry).length) state.days[iso] = entry;
    else delete state.days[iso];
    save();
    renderAll();
  }

  // In the app a download link does nothing, so the backup is written to the
  // app's cache and handed to the system share sheet (Drive, email, Files...).
  function exportNative() {
    var Filesystem = nativePlugin('Filesystem');
    var Share = nativePlugin('Share');
    var name = 'period-tracker-' + today() + '.json';
    setMsg('Preparing backup…');
    Filesystem.writeFile({
      path: name,
      data: JSON.stringify(state, null, 2),
      directory: 'CACHE',
      encoding: 'utf8'
    }).then(function (res) {
      return Share.share({ title: 'Period Tracker backup', files: [res.uri], dialogTitle: 'Save backup to…' });
    }).then(function () {
      setMsg('Backup shared. Keep it somewhere private.');
    }).catch(function (e) {
      var msg = (e && e.message) || '';
      setMsg(/cancel/i.test(msg) ? 'Export cancelled.' : 'Could not export: ' + (msg || 'unknown error'));
    });
  }

  function initNative() {
    var App = nativePlugin('App');
    if (!App) return;
    // Android back button: close the editor, then go back to Today, then leave.
    App.addListener('backButton', function () {
      var dlg = $('day-dialog');
      if (dlg.open) dlg.close('cancel');
      else if (currentView !== 'today') showView('today');
      else App.exitApp();
    });
    // The app may sit in the background for days; refresh on return.
    App.addListener('resume', function () { renderAll(); });
  }

  // ---------- Tabs ----------

  function showView(name) {
    currentView = name;
    ['today', 'calendar', 'insights', 'settings'].forEach(function (v) {
      $('view-' + v).hidden = v !== name;
      var tab = $('tab-' + v);
      tab.setAttribute('aria-selected', String(v === name));
      tab.tabIndex = v === name ? 0 : -1;
    });
    try { sessionStorage.setItem('period-tracker:view', name); } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
  }

  function renderAll() {
    renderToday();
    renderCalendar();
    renderInsights();
  }

  // ---------- Wiring ----------

  function init() {
    buildChips($('flow-chips'), 'flow', 'radio', FLOWS, 'flow');
    buildChips($('mood-chips'), 'mood', 'radio', MOODS, 'mood');

    // Let a selected mood be tapped again to clear it.
    $('mood-chips').addEventListener('click', function (ev) {
      var input = ev.target.closest('label') && ev.target.closest('label').querySelector('input');
      if (!input || ev.target !== input) return;
      if (input.dataset.wasChecked === 'true') input.checked = false;
      Array.prototype.forEach.call($('day-form').elements.mood, function (r) { r.dataset.wasChecked = String(r.checked); });
    });
    $('mood-chips').addEventListener('pointerdown', function () {
      Array.prototype.forEach.call($('day-form').elements.mood, function (r) { r.dataset.wasChecked = String(r.checked); });
    });

    document.querySelectorAll('.tabs [role="tab"]').forEach(function (tab) {
      tab.addEventListener('click', function () { showView(tab.dataset.view); });
      tab.addEventListener('keydown', function (ev) {
        var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs [role="tab"]'));
        var i = tabs.indexOf(tab);
        var next = ev.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
          : ev.key === 'ArrowLeft' ? tabs[(i + tabs.length - 1) % tabs.length] : null;
        if (next) { ev.preventDefault(); showView(next.dataset.view); next.focus(); }
      });
    });

    $('btn-period-today').addEventListener('click', function () {
      var t = today();
      if (this.dataset.mode === 'edit') return openEditor(t);
      var entry = Object.assign({}, state.days[t] || {});
      entry.flow = 'medium';
      setDay(t, entry);
    });
    $('btn-log-today').addEventListener('click', function () { openEditor(today()); });

    $('cal-prev').addEventListener('click', function () { shiftMonth(-1); });
    $('cal-next').addEventListener('click', function () { shiftMonth(1); });
    $('cal-today').addEventListener('click', function () { viewMonth = monthOf(today()); renderCalendar(); });
    $('cal-grid').addEventListener('click', function (ev) {
      var btn = ev.target.closest('.day');
      if (btn) openEditor(btn.dataset.date);
    });

    $('day-dialog').addEventListener('close', function () {
      if (this.returnValue === 'save' && editingDate) saveEditor();
      editingDate = null;
    });
    $('day-clear').addEventListener('click', function () {
      var iso = editingDate;
      editingDate = null;
      $('day-dialog').close('cancel');
      if (iso) setDay(iso, null);
    });
    $('day-dialog').addEventListener('click', function (ev) {
      if (ev.target === this) this.close('cancel');
    });
    $('day-symptom-add').addEventListener('click', addSymptomInEditor);
    // Enter in this field would otherwise submit (and close) the dialog.
    $('day-symptom-input').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); addSymptomInEditor(); }
    });

    $('symptom-add-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var input = $('symptom-add-input');
      if (addSymptom(input.value)) input.value = '';
      input.focus();
    });
    $('symptom-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-remove]');
      if (!btn) return;
      var name = btn.dataset.remove;
      state.symptoms = state.symptoms.filter(function (s) { return s !== name; });
      save();
      renderSymptomList();
    });
    $('symptom-reset').addEventListener('click', function () {
      if (!confirm('Replace your symptom list with the default list? Your logged days are not changed.')) return;
      state.symptoms = C.DEFAULT_SYMPTOMS.slice();
      save();
      renderSymptomList();
    });

    $('settings-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = this;
      var next = {};
      Object.keys(LIMITS).forEach(function (k) {
        var v = Math.round(Number(f.elements[k].value));
        next[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v || state.settings[k]));
      });
      state.settings = C.normalizeSettings(next);
      save();
      renderSettings();
      renderAll();
      $('settings-saved').textContent = storageOK ? 'Saved' : '';
      setTimeout(function () { $('settings-saved').textContent = ''; }, 2000);
    });

    $('btn-export').addEventListener('click', function () {
      if (isNative) return exportNative();
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'period-tracker-' + today() + '.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      setMsg('Backup downloaded. Keep it somewhere private.');
    });

    $('import-file').addEventListener('change', function () {
      var file = this.files && this.files[0];
      var input = this;
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = C.sanitizeData(JSON.parse(reader.result));
          var n = Object.keys(data.days).length;
          if (!confirm('Replace your current data with ' + plural(n, 'logged day') + ' from this backup?')) {
            setMsg('Import cancelled.');
            return;
          }
          state = data;
          save();
          renderSettings();
          renderAll();
          setMsg('Imported ' + plural(n, 'logged day') + '.');
        } catch (e) {
          setMsg('Could not import: ' + (e && e.message ? e.message : 'the file is not valid JSON.'));
        } finally {
          input.value = '';
        }
      };
      reader.onerror = function () { setMsg('Could not read that file.'); input.value = ''; };
      reader.readAsText(file);
    });

    $('btn-delete').addEventListener('click', function () {
      if (!confirm('Delete all logged days and settings from this device? This cannot be undone.')) return;
      state = emptyState();
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      renderSettings();
      renderAll();
      setMsg('All data deleted.');
    });

    // Re-render when the app comes back after midnight.
    var lastDay = today();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && today() !== lastDay) {
        lastDay = today();
        renderAll();
      }
    });
    // Keep tabs in sync if the app is open in two windows.
    window.addEventListener('storage', function (ev) {
      if (ev.key !== STORAGE_KEY) return;
      state = load();
      renderSettings();
      renderAll();
    });

    var startView = 'today';
    try { startView = sessionStorage.getItem('period-tracker:view') || 'today'; } catch (e) { /* ignore */ }
    if (!$('view-' + startView)) startView = 'today';

    renderSettings();
    renderAll();
    showView(startView);
    initNative();

    if (!isNative && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
    }
  }

  init();
})();
