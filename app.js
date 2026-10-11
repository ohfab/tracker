/* Period Tracker UI. All data lives in localStorage on this device. */
(function () {
  'use strict';

  var C = window.Cycle;
  var STORAGE_KEY = 'period-tracker:v1';

  var FLOWS = [
    { id: '', label: 'None' },
    { id: 'spotting', label: 'Spotting' },
    { id: 'light', label: 'Light' },
    { id: 'medium', label: 'Medium' },
    { id: 'heavy', label: 'Heavy' }
  ];
  var SYMPTOMS = [
    'Cramps', 'Headache', 'Bloating', 'Back pain', 'Tender breasts', 'Acne',
    'Fatigue', 'Nausea', 'Cravings', 'Insomnia', 'Discharge', 'Dizziness'
  ];
  var MOODS = ['Happy', 'Calm', 'Energetic', 'Sensitive', 'Sad', 'Anxious', 'Irritable'];

  var PHASE_TEXT = {
    period: 'You are on your period. Rest up and stay hydrated.',
    follicular: 'Follicular phase. Energy often rises as estrogen climbs.',
    fertile: 'You are in your estimated fertile window.',
    ovulation: 'Estimated ovulation day. This is the peak of the fertile window.',
    luteal: 'Luteal phase. Some people notice PMS symptoms in the days before a period.',
    late: 'Your period is later than predicted. Cycles vary, and stress, travel or illness can shift them.'
  };

  // ---------- State ----------

  var state = load();
  var storageOK = true;
  var viewMonth = monthOf(today());
  var editingDate = null;

  function emptyState() {
    return { version: 1, days: {}, settings: C.normalizeSettings({}) };
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

  function toDate(iso) {
    return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  }

  var fmtShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  var fmtLong = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  var fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  var fmtWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

  function short(iso) { return fmtShort.format(toDate(iso)); }
  function range(a, b) { return a === b ? short(a) : short(a) + ' – ' + short(b); }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function relative(n) {
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? 'in ' + plural(n, 'day') : plural(-n, 'day') + ' ago';
  }

  function monthOf(iso) { return { y: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1 }; }

  function firstOfMonth(v) {
    return v.y + '-' + (v.m < 9 ? '0' : '') + (v.m + 1) + '-01';
  }

  function setMsg(text) { $('data-msg').textContent = text; }

  function predictionFor(untilISO) {
    var t = today();
    var stats = C.getStats(state.days, state.settings);
    var count = 3;
    if (untilISO && untilISO > t) {
      count = Math.max(3, Math.ceil(C.diffDays(t, untilISO) / stats.cycleLength) + 1);
    }
    return C.predict(state.days, state.settings, t, Math.min(count, 60));
  }

  // ---------- Today ----------

  function renderToday() {
    var t = today();
    var p = predictionFor();
    var ring = $('ring');
    var fill = $('ring-fill');
    var circumference = 2 * Math.PI * 52;
    var label = 'Welcome', big = '—', sub = '', progress = 0, color = '';

    if (p.lastPeriod) {
      progress = Math.min(1, p.cycleDay / p.stats.cycleLength);
      if (p.onPeriod) {
        label = 'Period';
        big = 'Day ' + p.cycleDay;
        sub = 'Cycle day ' + p.cycleDay;
        color = 'var(--period)';
      } else if (p.daysLate > 0) {
        label = 'Period is';
        big = plural(p.daysLate, 'day');
        sub = 'late';
        progress = 1;
        color = 'var(--muted)';
      } else if (p.daysUntilNext === 0) {
        label = 'Period expected';
        big = 'Today';
        sub = 'Cycle day ' + p.cycleDay;
      } else {
        label = 'Period in';
        big = String(p.daysUntilNext);
        sub = (p.daysUntilNext === 1 ? 'day' : 'days') + ' · cycle day ' + p.cycleDay;
        if (p.phase === 'fertile' || p.phase === 'ovulation') color = 'var(--ovulation)';
      }
    }

    $('ring-label').textContent = label;
    $('ring-big').textContent = big;
    $('ring-sub').textContent = sub;
    ring.setAttribute('aria-label', p.lastPeriod ? [label, big, sub].join(' ') : 'No periods logged yet');
    fill.style.strokeDashoffset = String(circumference * (1 - progress));
    fill.style.stroke = color;
    fill.style.opacity = progress > 0 ? '1' : '0';

    $('phase-text').textContent = p.lastPeriod
      ? (p.daysUntilNext === 0 && !p.onPeriod ? 'Your period is expected today.' : PHASE_TEXT[p.phase])
      : 'Log the first day of your last period to get started. Use the calendar to add earlier periods.';

    var todayEntry = state.days[t];
    var hasFlow = todayEntry && todayEntry.flow && todayEntry.flow !== 'spotting';
    var btn = $('btn-period-today');
    btn.textContent = hasFlow ? 'Period logged today ✓' : (p.onPeriod ? 'Log period today' : 'Period started today');
    btn.dataset.mode = hasFlow ? 'edit' : 'log';

    // Upcoming events
    var list = $('upcoming');
    list.textContent = '';
    var items = [];
    if (p.lastPeriod) {
      var fertile = p.currentFertile && p.currentFertile.end >= t && !p.daysLate
        ? p.currentFertile
        : (p.upcoming[0] && p.upcoming[0].fertile);
      if (fertile) {
        items.push({ type: 'fertile', what: 'Fertile window', start: fertile.start, end: fertile.end });
        if (fertile.ovulation >= t) {
          items.push({ type: 'fertile', what: 'Ovulation', start: fertile.ovulation, end: fertile.ovulation });
        }
      }
      p.upcoming.forEach(function (u, i) {
        items.push({ type: 'period', what: i === 0 ? 'Next period' : 'Period', start: u.start, end: u.end });
      });
      items.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    }
    if (!items.length) {
      list.appendChild(el('li', { class: 'empty', text: 'Predictions appear once you log a period.' }));
    }
    items.forEach(function (it) {
      var startIn = C.diffDays(t, it.start);
      var when = it.start <= t && it.end >= t ? 'now' : relative(startIn);
      list.appendChild(el('li', null, [
        el('span', { class: 'dot ' + it.type, 'aria-hidden': 'true' }),
        el('span', { class: 'what' }, [el('strong', { text: it.what }), el('br'), el('span', { class: 'hint', text: range(it.start, it.end) })]),
        el('span', { class: 'when', text: when })
      ]));
    });
    $('defaults-hint').hidden = !(p.lastPeriod && p.stats.usingDefaults);
  }

  // ---------- Calendar ----------

  function renderCalendar() {
    var t = today();
    var first = firstOfMonth(viewMonth);
    var startOffset = toDate(first).getDay();
    var gridStart = C.addDays(first, -startOffset);
    var gridEnd = C.addDays(gridStart, 41);
    var p = predictionFor(gridEnd);
    var marks = C.calendarMarks(state.days, p, gridStart, gridEnd);

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
      else if (m.predicted) { classes.push('predicted'); desc.push('predicted period'); }
      else if (m.fertile) { classes.push('fertile'); desc.push(m.ovulation ? 'estimated ovulation' : 'fertile window'); }
      if (m.ovulation && !m.period) classes.push('ovulation');
      if (m.spotting) { classes.push('spotting'); desc.push('spotting'); }
      if (m.logged) { classes.push('logged'); desc.push('has entries'); }
      var label = fmtLong.format(toDate(iso)) + (desc.length ? ', ' + desc.join(', ') : '');
      row.appendChild(el('button', {
        type: 'button',
        role: 'gridcell',
        class: classes.join(' '),
        'data-date': iso,
        'aria-label': label,
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
    var p = predictionFor();
    var s = p.stats;
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

    // History
    var hist = $('history');
    hist.textContent = '';
    var rows = s.cycles.slice().reverse().slice(0, 12).map(function (c) {
      return { start: c.start, length: c.length, period: c.periodLength, valid: c.valid, current: false };
    });
    if (p.lastPeriod) {
      rows.unshift({ start: p.lastPeriod.start, length: p.cycleDay, period: p.lastPeriod.length, valid: true, current: true });
    }
    if (!rows.length) {
      hist.appendChild(el('p', { class: 'empty-state', text: 'Your cycles will show here once you log periods.' }));
    } else {
      var scale = Math.max(40, s.longestCycle || 0, rows[0].length);
      var wrap = el('div', { class: 'history' });
      rows.forEach(function (r) {
        var len = Math.min(r.length, scale);
        var pLen = Math.min(r.period, len);
        wrap.appendChild(el('div', { class: 'hrow' }, [
          el('span', { class: 'date', text: r.current ? 'Current' : short(r.start) }),
          el('div', {
            class: 'bar' + (r.current ? ' current' : ''),
            role: 'img',
            'aria-label': (r.current ? 'Current cycle, day ' : 'Cycle of ') + r.length + (r.current ? '' : ' days') + ', period ' + r.period + ' days'
          }, [
            el('span', { class: 'p', style: 'width:' + (pLen / scale * 100) + '%' }),
            el('span', { class: 'r', style: 'width:' + ((len - pLen) / scale * 100) + '%' })
          ]),
          el('span', {
            class: 'len' + (r.valid ? '' : ' flag'),
            title: r.valid ? null : 'Unusual length. Left out of averages, possibly a gap in logging.',
            text: r.length + 'd'
          })
        ]));
      });
      hist.appendChild(wrap);
    }

    // Symptoms
    var counts = {};
    Object.keys(state.days).forEach(function (d) {
      (state.days[d].symptoms || []).forEach(function (sym) { counts[sym] = (counts[sym] || 0) + 1; });
    });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 8);
    var box = $('symptom-stats');
    box.textContent = '';
    if (!top.length) {
      box.appendChild(el('p', { class: 'empty-state', text: 'Log symptoms on any day to see patterns here.' }));
    } else {
      var max = counts[top[0]];
      top.forEach(function (sym) {
        box.appendChild(el('div', { class: 'sym-row' }, [
          el('span', { text: sym }),
          el('div', { class: 'bar', 'aria-hidden': 'true' }, [el('span', { class: 'p', style: 'width:' + (counts[sym] / max * 100) + '%' })]),
          el('span', { class: 'n', text: String(counts[sym]) })
        ]));
      });
    }
  }

  // ---------- Settings ----------

  var LIMITS = { cycleLength: [15, 90], periodLength: [1, 15], lutealLength: [7, 20] };

  function renderSettings() {
    var f = $('settings-form');
    Object.keys(LIMITS).forEach(function (k) { f.elements[k].value = state.settings[k]; });
  }

  // ---------- Day editor ----------

  function buildChips(container, name, type, options, extraClass) {
    options.forEach(function (o) {
      var value = typeof o === 'string' ? o : o.id;
      var label = typeof o === 'string' ? o : o.label;
      container.appendChild(el('label', { class: 'chip' + (extraClass ? ' ' + extraClass : '') }, [
        el('input', { type: type, name: name, value: value }),
        el('span', { text: label })
      ]));
    });
  }

  function openEditor(iso) {
    editingDate = iso;
    var e = state.days[iso] || {};
    var form = $('day-form');
    var t = today();
    $('day-title').textContent = (iso === t ? 'Today, ' : '') + fmtLong.format(toDate(iso));
    Array.prototype.forEach.call(form.elements.flow, function (r) { r.checked = r.value === (e.flow || ''); });
    Array.prototype.forEach.call(form.elements.symptom, function (c) { c.checked = (e.symptoms || []).indexOf(c.value) !== -1; });
    Array.prototype.forEach.call(form.elements.mood, function (r) { r.checked = r.value === e.mood; });
    $('day-note').value = e.note || '';
    Array.prototype.forEach.call(form.elements.mood, function (r) { r.dataset.wasChecked = String(r.checked); });
    var dlg = $('day-dialog');
    dlg.returnValue = '';
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function saveEditor() {
    var form = $('day-form');
    var entry = {};
    var flow = form.querySelector('input[name="flow"]:checked');
    if (flow && flow.value) entry.flow = flow.value;
    var syms = Array.prototype.filter.call(form.elements.symptom, function (c) { return c.checked; })
      .map(function (c) { return c.value; });
    if (syms.length) entry.symptoms = syms;
    var mood = form.querySelector('input[name="mood"]:checked');
    if (mood) entry.mood = mood.value;
    var note = $('day-note').value.trim();
    if (note) entry.note = note;
    // Keep symptoms that came from an import but are not in the chip list.
    var prev = state.days[editingDate];
    if (prev && prev.symptoms) {
      prev.symptoms.forEach(function (sym) {
        if (SYMPTOMS.indexOf(sym) === -1) (entry.symptoms = entry.symptoms || []).push(sym);
      });
    }
    setDay(editingDate, entry);
  }

  function setDay(iso, entry) {
    if (entry && Object.keys(entry).length) state.days[iso] = entry;
    else delete state.days[iso];
    save();
    renderAll();
  }

  // ---------- Tabs ----------

  var currentView = 'today';

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
    buildChips($('symptom-chips'), 'symptom', 'checkbox', SYMPTOMS);
    buildChips($('mood-chips'), 'mood', 'radio', MOODS);

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
    // Close when tapping the backdrop.
    $('day-dialog').addEventListener('click', function (ev) {
      if (ev.target === this) this.close('cancel');
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

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
    }
  }

  init();
})();
