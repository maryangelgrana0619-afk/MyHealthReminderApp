/* ============================================
   MyHealth Reminder — Data Layer v6
   Pure ES5 — works on MIT App Inventor WebView
   NO Object.assign, NO arrow functions,
   NO template literals, NO const/let
   ============================================ */

var MH = (function () {
  'use strict';

  /* ══════════════════════════════
     STORAGE HELPERS
  ══════════════════════════════ */
  function load(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* ── Shallow clone a plain object without Object.assign ── */
  function clone(obj) {
    var result = {};
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) result[k] = obj[k];
    }
    return result;
  }

  /* ── Clone and override one field ── */
  function cloneWith(obj, key, val) {
    var result = clone(obj);
    result[key] = val;
    return result;
  }

  /* ── Per-user storage key ── */
  function uk(base) {
    var sess = load('mh_session');
    if (!sess || !sess.id) return base;
    return base + '_' + sess.id;
  }

  /* ── Today's date string: YYYY-M-D ── */
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  /* ══════════════════════════════
     DEFAULT DATA
  ══════════════════════════════ */
  var DEFAULT_CHECKLIST = [
    { id: 'c1', label: 'Drink 8 glasses of water', done: false },
    { id: 'c2', label: 'Take morning medication',  done: false },
    { id: 'c3', label: '30-minute walk',            done: false },
    { id: 'c4', label: 'Meditate for 10 minutes',   done: false }
  ];

  function cloneDefaultChecklist() {
    var result = [];
    for (var i = 0; i < DEFAULT_CHECKLIST.length; i++) {
      result.push(clone(DEFAULT_CHECKLIST[i]));
    }
    return result;
  }

  /* ══════════════════════════════
     WEEKLY HISTORY  (declared FIRST to avoid hoisting issues)
  ══════════════════════════════ */
  var weeklyHistory = {
    _key: function () { return uk('mh_weekly'); },

    _dateKey: function (d) {
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    },

    /* Save a past day's score (called during checklist day-reset) */
    savePastDay: function (dateKey, pct) {
      if (!dateKey) return;
      var data = load(this._key()) || {};
      data[dateKey] = (pct === undefined || pct === null) ? 0 : pct;
      /* Keep only last 30 days */
      var keys = [];
      for (var k in data) { if (data.hasOwnProperty(k)) keys.push(k); }
      keys.sort();
      if (keys.length > 30) {
        var trimmed = {};
        for (var i = keys.length - 30; i < keys.length; i++) {
          trimmed[keys[i]] = data[keys[i]];
        }
        data = trimmed;
      }
      save(this._key(), data);
    },

    /* Save today's live progress */
    saveToday: function (pct) {
      var data = load(this._key()) || {};
      data[this._dateKey(new Date())] = pct;
      save(this._key(), data);
    },

    /* Returns [{day, val, isToday, isFuture}] for Mon–Sun of current week */
    getThisWeek: function () {
      var data = load(this._key()) || {};
      var today = new Date();
      var todayIdx = (today.getDay() + 6) % 7; /* 0=Mon … 6=Sun */
      var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      var result = [];
      for (var i = 0; i < 7; i++) {
        var diff = i - todayIdx;
        var d = new Date(today.getTime());
        d.setDate(d.getDate() + diff);
        var key = this._dateKey(d);
        var val = (data[key] !== undefined && data[key] !== null) ? data[key] : 0;
        result.push({
          day:      days[i],
          val:      val,
          isToday:  (i === todayIdx),
          isFuture: (i > todayIdx)
        });
      }
      return result;
    }
  };

  /* ══════════════════════════════
     AUTH
  ══════════════════════════════ */
  var auth = {
    getUsers: function () {
      return load('mh_users') || [];
    },

    getSession: function () {
      return load('mh_session') || null;
    },

    isLoggedIn: function () {
      var sess = this.getSession();
      return !!(sess && sess.id);
    },

    requireAuth: function () {
      if (!this.isLoggedIn()) {
        window.location.href = 'login.html';
      }
    },

    register: function (name, email, password) {
      var users = this.getUsers();
      var emailLower = email.toLowerCase();
      for (var i = 0; i < users.length; i++) {
        if (users[i].email === emailLower) {
          return { ok: false, msg: 'Email already registered.' };
        }
      }
      var user = {
        id:       'u' + Date.now(),
        name:     name,
        email:    emailLower,
        password: password
      };
      users.push(user);
      save('mh_users', users);
      save('mh_session', { id: user.id, name: user.name, email: user.email });
      return { ok: true, user: user };
    },

    login: function (email, password) {
      var users = this.getUsers();
      var emailLower = email.toLowerCase();
      var found = null;
      for (var i = 0; i < users.length; i++) {
        if (users[i].email === emailLower && users[i].password === password) {
          found = users[i];
          break;
        }
      }
      if (!found) {
        return { ok: false, msg: 'Incorrect email or password.' };
      }
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
      var users = this.getUsers();
      for (var i = 0; i < users.length; i++) {
        if (users[i].id === sess.id) {
          users[i].name = name;
          break;
        }
      }
      save('mh_users', users);
      var newSess = { id: sess.id, name: name, email: sess.email };
      save('mh_session', newSess);
    }
  };

  /* ══════════════════════════════
     REMINDERS  (per user, starts empty)
  ══════════════════════════════ */
  var reminders = {
    getAll: function () {
      return load(uk('mh_reminders')) || [];
    },

    add: function (r) {
      var list = this.getAll();
      r.id = 'r' + Date.now();
      list.push(r);
      save(uk('mh_reminders'), list);
      return r;
    },

    update: function (r) {
      var list = this.getAll();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === r.id) { list[i] = r; break; }
      }
      save(uk('mh_reminders'), list);
    },

    delete: function (id) {
      var list = this.getAll();
      var newList = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== id) newList.push(list[i]);
      }
      save(uk('mh_reminders'), newList);
    }
  };

  /* ══════════════════════════════
     CHECKLIST  (auto-resets each calendar day)
  ══════════════════════════════ */
  function progressRaw(list) {
    if (!list || list.length === 0) return { done: 0, total: 0, pct: 0 };
    var done = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].done) done++;
    }
    return {
      done:  done,
      total: list.length,
      pct:   Math.round((done / list.length) * 100)
    };
  }

  var checklist = {
    /* Ensure a day-reset has happened if the date changed */
    _ensureReset: function () {
      var today   = todayKey();
      var lastDay = load(uk('mh_checklist_day'));
      if (lastDay === today) return; /* same day — nothing to reset */

      /* Different day — save yesterday's score then reset */
      var existing = load(uk('mh_checklist_items'));
      if (existing && existing.length > 0 && lastDay) {
        var prog = progressRaw(existing);
        weeklyHistory.savePastDay(lastDay, prog.pct);
      }

      /* Reset all done flags */
      var items = existing || cloneDefaultChecklist();
      var reset = [];
      for (var i = 0; i < items.length; i++) {
        reset.push(cloneWith(items[i], 'done', false));
      }
      save(uk('mh_checklist_items'), reset);
      save(uk('mh_checklist_day'), today);
    },

    get: function () {
      this._ensureReset();
      var items = load(uk('mh_checklist_items'));
      if (!items || items.length === 0) {
        items = cloneDefaultChecklist();
        save(uk('mh_checklist_items'), items);
        save(uk('mh_checklist_day'),   todayKey());
      }
      return items;
    },

    toggle: function (id) {
      this._ensureReset();
      var list = this.get();
      var toggled = null;
      var newList = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          var updated = cloneWith(list[i], 'done', !list[i].done);
          newList.push(updated);
          toggled = updated;
        } else {
          newList.push(list[i]);
        }
      }
      save(uk('mh_checklist_items'), newList);
      if (toggled && toggled.done) {
        history.log(toggled.label);
      }
      return newList;
    },

    reset: function () {
      var items = load(uk('mh_checklist_items')) || cloneDefaultChecklist();
      var reset = [];
      for (var i = 0; i < items.length; i++) {
        reset.push(cloneWith(items[i], 'done', false));
      }
      save(uk('mh_checklist_items'), reset);
    },

    progress: function () {
      return progressRaw(this.get());
    },

    addItem: function (label) {
      this._ensureReset();
      var list = this.get();
      list.push({ id: 'c' + Date.now(), label: label, done: false });
      save(uk('mh_checklist_items'), list);
    },

    deleteItem: function (id) {
      this._ensureReset();
      var list = this.get();
      var newList = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== id) newList.push(list[i]);
      }
      save(uk('mh_checklist_items'), newList);
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
      if (list.length > 40) list = list.slice(0, 40);
      save(uk('mh_history'), list);
    },

    clear: function () { save(uk('mh_history'), []); }
  };

  /* ══════════════════════════════
     STREAK
  ══════════════════════════════ */
  var streak = {
    get: function () {
      return load(uk('mh_streak')) || { days: 0, lastDate: null };
    },

    update: function () {
      var s = this.get();
      var today = new Date().toDateString();
      if (s.lastDate === today) return s.days;
      var yesterday = new Date(Date.now() - 86400000).toDateString();
      var days = (s.lastDate === yesterday) ? s.days + 1 : 1;
      save(uk('mh_streak'), { days: days, lastDate: today });
      return days;
    }
  };

  /* ══════════════════════════════
     SETTINGS
  ══════════════════════════════ */
  var settings = {
    get: function () {
      return load(uk('mh_settings')) || {
        push: true, sound: true, vibrate: false, report: true, quotes: true
      };
    },

    set: function (key, val) {
      var s = this.get();
      s[key] = val;
      save(uk('mh_settings'), s);
    }
  };

  /* ══════════════════════════════
     DAILY ROTATING QUOTES (31 quotes — one per day-of-year index)
  ══════════════════════════════ */
  var ALL_QUOTES = [
    '"Consistency is more important than perfection. Every small step counts!"',
    '"Your health is an investment, not an expense."',
    '"Small daily improvements lead to stunning results."',
    '"Take care of your body. It\'s the only place you have to live."',
    '"Wellness is not a destination, it\'s a daily practice."',
    '"Progress, not perfection. You\'re doing great!"',
    '"Every healthy choice brings you closer to your best self."',
    '"A journey of a thousand miles begins with a single step."',
    '"Invest in your health today for a better tomorrow."',
    '"The groundwork for all happiness is good health."',
    '"He who has health has hope, and he who has hope has everything."',
    '"Healthy habits are learned the same way as unhealthy ones — through practice."',
    '"An apple a day keeps the doctor away — start simple!"',
    '"Your body hears everything your mind says. Stay positive!"',
    '"Taking care of yourself is productivity."',
    '"Rest when you\'re weary. Refresh and renew yourself."',
    '"Health is not about the weight you lose, but about the life you gain."',
    '"You don\'t have to be great to start, but you have to start to be great."',
    '"Believe you can and you\'re halfway there."',
    '"Small steps every day lead to big changes over time."',
    '"Drink more water. Sleep more. Move more. Stress less."',
    '"Your future self will thank you for the healthy choices you make today."',
    '"Every day is a new opportunity to improve your health."',
    '"Strive for progress, not perfection."',
    '"Take it one day at a time. You\'re doing better than you think."',
    '"Wellness is the complete integration of body, mind, and spirit."',
    '"The secret to a healthy life is no secret — just daily action."',
    '"Be patient with yourself. Nothing in nature blooms all year."',
    '"You are one workout away from a better mood."',
    '"Start where you are. Use what you have. Do what you can."',
    '"Nourish your body, calm your mind, and move with purpose."'
  ];

  /* 7 sets of 4 tips — one set per weekday (0=Mon … 6=Sun) */
  var ALL_TIPS = [
    /* Monday */
    [
      'Start your week strong — drink a full glass of water before your morning coffee.',
      'A 10-minute walk after lunch improves digestion and boosts afternoon energy.',
      'Write down one wellness goal for the week and review it each morning.',
      'Prep healthy snacks for the week so you always have good options ready.'
    ],
    /* Tuesday */
    [
      'Stretch for 5 minutes after waking up to loosen joints and improve circulation.',
      'Add one extra serving of vegetables to at least one meal today.',
      'Practice the 20-20-20 rule: every 20 minutes, look 20 feet away for 20 seconds.',
      'Take the stairs instead of the elevator whenever you get the chance.'
    ],
    /* Wednesday */
    [
      'Midweek check-in: review your progress on this week\'s wellness goal.',
      'Deep breathing for 5 minutes can significantly reduce stress and anxiety.',
      'Drink water before every meal — it aids digestion and helps portion control.',
      'Swap a sugary snack for a piece of fruit or a handful of nuts today.'
    ],
    /* Thursday */
    [
      'Getting 7-9 hours of sleep is one of the best things you can do for your health.',
      'Try a 2-minute mindfulness pause between tasks to reset your focus.',
      'Posture check! Sit up straight, relax your shoulders, and unclench your jaw.',
      'Reach out to a friend or family member — social connection boosts wellbeing.'
    ],
    /* Friday */
    [
      'End your week by celebrating one healthy habit you kept this week.',
      'Plan your weekend meals in advance to avoid unhealthy impulse choices.',
      'A 30-minute evening walk is a great way to wind down after a busy week.',
      'Limit screen time one hour before bed to improve sleep quality tonight.'
    ],
    /* Saturday */
    [
      'Use your weekend to try a new physical activity — hiking, cycling, or yoga.',
      'Cook a nutritious meal at home — you control every ingredient.',
      'Spend time outdoors today. Natural light and fresh air do wonders for your mood.',
      'Practice gratitude: write down three things you are thankful for today.'
    ],
    /* Sunday */
    [
      'Use Sunday to set your intentions for a healthy week ahead.',
      'Prepare your checklist and reminders for tomorrow so you start strong.',
      'Get to bed at a consistent time tonight — your body clock will thank you.',
      'Reflect on last week: what healthy habit are you most proud of?'
    ]
  ];

  function getDailyQuote() {
    var now   = new Date();
    var start = new Date(now.getFullYear(), 0, 0);
    var diff  = now - start;
    var dayOfYear = Math.floor(diff / 86400000);
    return ALL_QUOTES[dayOfYear % ALL_QUOTES.length];
  }

  function getDailyTips() {
    var dayOfWeek = (new Date().getDay() + 6) % 7; /* 0=Mon … 6=Sun */
    return ALL_TIPS[dayOfWeek];
  }

  /* ══════════════════════════════
     UTILITIES
  ══════════════════════════════ */
  function go(page) { window.location.href = page; }

  function fmtTime(t) {
    if (!t) return '';
    var parts = t.split(':');
    var hr = parseInt(parts[0], 10);
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
    if (hours < 24) return 'Today, '     + fmtTime(new Date(ts).toTimeString().slice(0, 5));
    if (days === 1) return 'Yesterday, ' + fmtTime(new Date(ts).toTimeString().slice(0, 5));
    var d = new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short' }) + ', ' +
           fmtTime(d.toTimeString().slice(0, 5));
  }

  function ripple(btn, e) {
    var old = btn.querySelector('.ripple');
    if (old) old.parentNode.removeChild(old);
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var sp   = document.createElement('span');
    sp.className = 'ripple';
    sp.style.width  = size + 'px';
    sp.style.height = size + 'px';
    sp.style.left   = (e.clientX - rect.left - size / 2) + 'px';
    sp.style.top    = (e.clientY - rect.top  - size / 2) + 'px';
    btn.appendChild(sp);
    sp.addEventListener('animationend', function () {
      if (sp.parentNode) sp.parentNode.removeChild(sp);
    });
  }

  function toast(msg, duration) {
    duration = duration || 2500;
    var el = document.getElementById('_toast');
    if (!el) {
      el = document.createElement('div');
      el.id        = '_toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className   = 'toast show';
    if (el._t) clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = 'toast'; }, duration);
  }

  /* ── Public API ── */
  return {
    auth:          auth,
    reminders:     reminders,
    checklist:     checklist,
    weeklyHistory: weeklyHistory,
    history:       history,
    streak:        streak,
    settings:      settings,
    getDailyQuote: getDailyQuote,
    getDailyTips:  getDailyTips,
    go:            go,
    fmtTime:       fmtTime,
    fmtRelative:   fmtRelative,
    ripple:        ripple,
    toast:         toast
  };
}());