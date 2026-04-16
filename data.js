/* ============================================
   MyHealth Reminder — Data Layer v4
   data.js  — loaded by every page
   ============================================ */

var MH = (function () {
  'use strict';

  /* ── Storage helpers ── */
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }

  /* ── Per-user key builder ── */
  function uk(base) {
    var sess = load('mh_session');
    if (!sess) return base;
    return base + '_' + sess.id;
  }

  /* ── Default checklist items (no reminders by default for new users) ── */
  var DEFAULT_CHECKLIST = [
    { id: 'c1', label: 'Drink 8 glasses of water', done: false },
    { id: 'c2', label: 'Take morning medication',  done: false },
    { id: 'c3', label: '30-minute walk',            done: false },
    { id: 'c4', label: 'Meditate for 10 minutes',   done: false }
  ];

  /* ══════════════════════════════
     AUTH
  ══════════════════════════════ */
  var auth = {
    getUsers: function () { return load('mh_users') || []; },
    getSession: function () { return load('mh_session') || null; },
    isLoggedIn: function () { return !!this.getSession(); },

    requireAuth: function () {
      if (!this.isLoggedIn()) {
        window.location.href = 'login.html';
      }
    },

    register: function (name, email, password) {
      var users = this.getUsers();
      var exists = users.filter(function (u) {
        return u.email.toLowerCase() === email.toLowerCase();
      });
      if (exists.length > 0) return { ok: false, msg: 'Email already registered.' };
      var user = { id: 'u' + Date.now(), name: name, email: email.toLowerCase(), password: password };
      users.push(user);
      save('mh_users', users);
      save('mh_session', { id: user.id, name: user.name, email: user.email });
      return { ok: true, user: user };
    },

    login: function (email, password) {
      var users = this.getUsers();
      var found = null;
      for (var i = 0; i < users.length; i++) {
        if (users[i].email.toLowerCase() === email.toLowerCase() && users[i].password === password) {
          found = users[i]; break;
        }
      }
      if (!found) return { ok: false, msg: 'Incorrect email or password.' };
      save('mh_session', { id: found.id, name: found.name, email: found.email });
      return { ok: true, user: found };
    },

    logout: function () {
      localStorage.removeItem('mh_session');
      window.location.href = 'login.html';
    },

    updateProfile: function (name) {
      var sess = this.getSession();
      if (!sess) return;
      var users = this.getUsers().map(function (u) {
        return u.id === sess.id ? Object.assign({}, u, { name: name }) : u;
      });
      save('mh_users', users);
      save('mh_session', Object.assign({}, sess, { name: name }));
    }
  };

  /* ══════════════════════════════
     REMINDERS  (per user, empty for new users)
  ══════════════════════════════ */
  var reminders = {
    getAll: function () { return load(uk('mh_reminders')) || []; },
    saveAll: function (arr) { save(uk('mh_reminders'), arr); },
    add: function (r) {
      var list = this.getAll();
      r.id = 'r' + Date.now();
      list.push(r);
      save(uk('mh_reminders'), list);
      return r;
    },
    update: function (r) {
      var list = this.getAll().map(function (x) { return x.id === r.id ? r : x; });
      save(uk('mh_reminders'), list);
    },
    delete: function (id) {
      var list = this.getAll().filter(function (x) { return x.id !== id; });
      save(uk('mh_reminders'), list);
    }
  };

  /* ══════════════════════════════
     CHECKLIST  — auto-resets each new calendar day
  ══════════════════════════════ */
  var checklist = {
    _todayKey: function () {
      var d = new Date();
      return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
    },

    _ensureReset: function () {
      var today = this._todayKey();
      var lastDay = load(uk('mh_checklist_day'));
      if (lastDay !== today) {
        /* New day — reset all done flags */
        var existing = load(uk('mh_checklist_items')) || DEFAULT_CHECKLIST.map(function(x){ return Object.assign({},x); });
        var reset = existing.map(function (x) { return Object.assign({}, x, { done: false }); });
        save(uk('mh_checklist_items'), reset);
        save(uk('mh_checklist_day'), today);
        /* Save today's score to weekly history before reset */
        weeklyHistory._saveYesterday(lastDay, checklist_progress_raw(load(uk('mh_checklist_items'))));
      }
    },

    get: function () {
      this._ensureReset();
      var items = load(uk('mh_checklist_items'));
      if (!items || items.length === 0) {
        items = DEFAULT_CHECKLIST.map(function(x){ return Object.assign({},x); });
        save(uk('mh_checklist_items'), items);
      }
      return items;
    },

    toggle: function (id) {
      this._ensureReset();
      var list = this.get().map(function (x) {
        return x.id === id ? Object.assign({}, x, { done: !x.done }) : x;
      });
      save(uk('mh_checklist_items'), list);
      var item = list.filter(function(x){ return x.id===id; })[0];
      if (item && item.done) history.log(item.label);
      return list;
    },

    reset: function () {
      var items = (load(uk('mh_checklist_items')) || DEFAULT_CHECKLIST).map(function(x){
        return Object.assign({},x,{done:false});
      });
      save(uk('mh_checklist_items'), items);
    },

    progress: function () {
      var list = this.get();
      return checklist_progress_raw(list);
    },

    addItem: function (label) {
      this._ensureReset();
      var list = this.get();
      list.push({ id: 'c' + Date.now(), label: label, done: false });
      save(uk('mh_checklist_items'), list);
    },

    deleteItem: function (id) {
      this._ensureReset();
      var list = this.get().filter(function(x){ return x.id !== id; });
      save(uk('mh_checklist_items'), list);
    }
  };

  function checklist_progress_raw(list) {
    if (!list || list.length === 0) return { done:0, total:0, pct:0 };
    var done = list.filter(function(x){ return x.done; }).length;
    return { done: done, total: list.length, pct: Math.round((done / list.length) * 100) };
  }

  /* ══════════════════════════════
     WEEKLY HISTORY  — stores real daily % per user
  ══════════════════════════════ */
  var weeklyHistory = {
    _key: function () { return uk('mh_weekly'); },

    /* Called on day-reset to persist yesterday's score */
    _saveYesterday: function (dateKey, prog) {
      if (!dateKey) return;
      var data = load(this._key()) || {};
      data[dateKey] = prog ? prog.pct : 0;
      /* Keep only last 30 days */
      var keys = Object.keys(data).sort();
      if (keys.length > 30) {
        var trimmed = {};
        keys.slice(-30).forEach(function(k){ trimmed[k] = data[k]; });
        data = trimmed;
      }
      save(this._key(), data);
    },

    /* Save today's current progress live */
    saveToday: function (pct) {
      var data = load(this._key()) || {};
      data[new Date().getFullYear() + '-' + (new Date().getMonth()+1) + '-' + new Date().getDate()] = pct;
      save(this._key(), data);
    },

    /* Returns array of {day, val, isToday} for Mon–Sun of current week */
    getThisWeek: function () {
      var data = load(this._key()) || {};
      var today = new Date();
      var todayIdx = (today.getDay() + 6) % 7; /* 0=Mon */
      var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      var result = [];
      for (var i = 0; i < 7; i++) {
        var diff = i - todayIdx;
        var d = new Date(today);
        d.setDate(d.getDate() + diff);
        var key = d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
        result.push({
          day: days[i],
          val: data[key] !== undefined ? data[key] : 0,
          isToday: i === todayIdx
        });
      }
      return result;
    }
  };

  /* ══════════════════════════════
     HISTORY  (recent task completions)
  ══════════════════════════════ */
  var history = {
    get: function () { return load(uk('mh_history')) || []; },
    log: function (label) {
      var list = this.get();
      list.unshift({ label: label, ts: Date.now() });
      save(uk('mh_history'), list.slice(0, 40));
    },
    clear: function () { save(uk('mh_history'), []); }
  };

  /* ══════════════════════════════
     STREAK
  ══════════════════════════════ */
  var streak = {
    get: function () { return load(uk('mh_streak')) || { days: 0, lastDate: null }; },
    update: function () {
      var s = this.get();
      var today = new Date().toDateString();
      if (s.lastDate === today) return s.days;
      var yesterday = new Date(Date.now() - 86400000).toDateString();
      var days = s.lastDate === yesterday ? s.days + 1 : 1;
      save(uk('mh_streak'), { days: days, lastDate: today });
      return days;
    }
  };

  /* ══════════════════════════════
     SETTINGS
  ══════════════════════════════ */
  var settings = {
    get: function () { return load(uk('mh_settings')) || { push:true, sound:true, vibrate:false, report:true, quotes:true }; },
    set: function (key, val) {
      var s = this.get();
      s[key] = val;
      save(uk('mh_settings'), s);
    }
  };

  /* ══════════════════════════════
     QUOTES
  ══════════════════════════════ */
  var QUOTES = [
    '"Consistency is more important than perfection. Every small step counts!"',
    '"Your health is an investment, not an expense."',
    '"Small daily improvements lead to stunning results."',
    '"Take care of your body. It\'s the only place you have to live."',
    '"Wellness is not a destination, it\'s a daily practice."',
    '"Progress, not perfection. You\'re doing great!"',
    '"Every healthy choice brings you closer to your best self."',
    '"A journey of a thousand miles begins with a single step."',
    '"Invest in your health today for a better tomorrow."'
  ];
  function getQuote() { return QUOTES[Math.floor(Math.random() * QUOTES.length)]; }

  /* ══════════════════════════════
     UTILITIES
  ══════════════════════════════ */
  function go(page) { window.location.href = page; }

  function fmtTime(t) {
    if (!t) return '';
    var parts = t.split(':');
    var hr = parseInt(parts[0]);
    var mn = parts[1];
    return (hr % 12 || 12) + ':' + mn + ' ' + (hr < 12 ? 'AM' : 'PM');
  }

  function fmtRelative(ts) {
    var diff  = Date.now() - ts;
    var mins  = Math.floor(diff / 60000);
    var hours = Math.floor(diff / 3600000);
    var days  = Math.floor(diff / 86400000);
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return mins + 'm ago';
    if (hours < 24) return 'Today, ' + fmtTime(new Date(ts).toTimeString().slice(0,5));
    if (days === 1) return 'Yesterday, ' + fmtTime(new Date(ts).toTimeString().slice(0,5));
    var d = new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short' }) + ', ' + fmtTime(d.toTimeString().slice(0,5));
  }

  function ripple(btn, e) {
    var old = btn.querySelector('.ripple');
    if (old) old.remove();
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var sp = document.createElement('span');
    sp.className = 'ripple';
    sp.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (e.clientX - rect.left - size/2) + 'px;top:' + (e.clientY - rect.top - size/2) + 'px';
    btn.appendChild(sp);
    sp.addEventListener('animationend', function () { sp.remove(); });
  }

  function toast(msg, duration) {
    duration = duration || 2500;
    var el = document.getElementById('_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = '_toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, duration);
  }

  /* Public API */
  return {
    auth: auth,
    reminders: reminders,
    checklist: checklist,
    weeklyHistory: weeklyHistory,
    history: history,
    streak: streak,
    settings: settings,
    getQuote: getQuote,
    go: go,
    fmtTime: fmtTime,
    fmtRelative: fmtRelative,
    ripple: ripple,
    toast: toast
  };
}());