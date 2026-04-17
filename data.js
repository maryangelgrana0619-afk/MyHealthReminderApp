/* ============================================
   MyHealth Reminder — Data Layer v5
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
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    },

    _ensureReset: function () {
      var today = this._todayKey();
      var lastDay = load(uk('mh_checklist_day'));
      if (lastDay !== today) {
        var existing = load(uk('mh_checklist_items')) || DEFAULT_CHECKLIST.map(function (x) { return Object.assign({}, x); });
        /* Save yesterday's score before resetting */
        weeklyHistory._saveYesterday(lastDay, checklist_progress_raw(existing));
        var reset = existing.map(function (x) { return Object.assign({}, x, { done: false }); });
        save(uk('mh_checklist_items'), reset);
        save(uk('mh_checklist_day'), today);
      }
    },

    get: function () {
      this._ensureReset();
      var items = load(uk('mh_checklist_items'));
      if (!items || items.length === 0) {
        items = DEFAULT_CHECKLIST.map(function (x) { return Object.assign({}, x); });
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
      var item = null;
      for (var i = 0; i < list.length; i++) { if (list[i].id === id) { item = list[i]; break; } }
      if (item && item.done) history.log(item.label);
      return list;
    },

    reset: function () {
      var items = (load(uk('mh_checklist_items')) || DEFAULT_CHECKLIST).map(function (x) {
        return Object.assign({}, x, { done: false });
      });
      save(uk('mh_checklist_items'), items);
    },

    progress: function () {
      return checklist_progress_raw(this.get());
    },

    addItem: function (label) {
      this._ensureReset();
      var list = this.get();
      list.push({ id: 'c' + Date.now(), label: label, done: false });
      save(uk('mh_checklist_items'), list);
    },

    deleteItem: function (id) {
      this._ensureReset();
      var list = this.get().filter(function (x) { return x.id !== id; });
      save(uk('mh_checklist_items'), list);
    }
  };

  function checklist_progress_raw(list) {
    if (!list || list.length === 0) return { done: 0, total: 0, pct: 0 };
    var done = list.filter(function (x) { return x.done; }).length;
    return { done: done, total: list.length, pct: Math.round((done / list.length) * 100) };
  }

  /* ══════════════════════════════
     WEEKLY HISTORY  — stores real daily % per user
  ══════════════════════════════ */
  var weeklyHistory = {
    _key: function () { return uk('mh_weekly'); },

    _dateKey: function (d) {
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    },

    _saveYesterday: function (dateKey, prog) {
      if (!dateKey) return;
      var data = load(this._key()) || {};
      data[dateKey] = prog ? prog.pct : 0;
      var keys = Object.keys(data).sort();
      if (keys.length > 30) {
        var trimmed = {};
        for (var i = keys.length - 30; i < keys.length; i++) { trimmed[keys[i]] = data[keys[i]]; }
        data = trimmed;
      }
      save(this._key(), data);
    },

    saveToday: function (pct) {
      var data = load(this._key()) || {};
      data[this._dateKey(new Date())] = pct;
      save(this._key(), data);
    },

    getThisWeek: function () {
      var data = load(this._key()) || {};
      var today = new Date();
      var todayIdx = (today.getDay() + 6) % 7; /* 0=Mon…6=Sun */
      var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      var result = [];
      for (var i = 0; i < 7; i++) {
        var diff = i - todayIdx;
        var d = new Date(today.getTime());
        d.setDate(d.getDate() + diff);
        var key = this._dateKey(d);
        result.push({
          day: days[i],
          val: (data[key] !== undefined) ? data[key] : 0,
          isToday: i === todayIdx,
          isFuture: i > todayIdx
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
    get: function () {
      return load(uk('mh_settings')) || { push: true, sound: true, vibrate: false, report: true, quotes: true };
    },
    set: function (key, val) {
      var s = this.get();
      s[key] = val;
      save(uk('mh_settings'), s);
    }
  };

  /* ══════════════════════════════
     DAILY-ROTATING QUOTES
     Rotates by day-of-year so every day has a new quote
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
    '"To keep the body in good health is a duty — otherwise we shall not be able to keep our mind strong."',
    '"Healthy habits are learned in the same way as unhealthy ones — through practice."',
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
    '"You are one workout, one glass of water, one good night\'s sleep away from a better mood."',
    '"Start where you are. Use what you have. Do what you can."'
  ];

  /* ── Daily-rotating wellness tips (7 unique sets, one per weekday) ── */
  var ALL_TIPS = [
    /* 0 = Monday */
    [
      'Start your week strong — drink a full glass of water before your morning coffee.',
      'A 10-minute walk after lunch improves digestion and boosts afternoon energy.',
      'Write down one wellness goal for the week and review it each morning.',
      'Prep healthy snacks for the week so you always have good options ready.'
    ],
    /* 1 = Tuesday */
    [
      'Stretch for 5 minutes after waking up to loosen joints and improve circulation.',
      'Add one extra serving of vegetables to at least one meal today.',
      'Practice the 20-20-20 rule: every 20 minutes, look 20 feet away for 20 seconds.',
      'Take the stairs instead of the elevator whenever you get the chance.'
    ],
    /* 2 = Wednesday */
    [
      'Midweek check-in: review your progress on this week\'s wellness goal.',
      'Deep breathing for 5 minutes can significantly reduce stress and anxiety.',
      'Drink water before every meal — it aids digestion and helps portion control.',
      'Swap a sugary snack for a piece of fruit or a handful of nuts today.'
    ],
    /* 3 = Thursday */
    [
      'Getting 7–9 hours of sleep is one of the best things you can do for your health.',
      'Try a 2-minute mindfulness pause between tasks to reset your focus.',
      'Posture check! Sit up straight, relax your shoulders, and unclench your jaw.',
      'Reach out to a friend or family member — social connection boosts wellbeing.'
    ],
    /* 4 = Friday */
    [
      'End your week by celebrating one healthy habit you kept this week.',
      'Plan your weekend meals in advance to avoid unhealthy impulse choices.',
      'A 30-minute evening walk is a great way to wind down after a busy week.',
      'Limit screen time one hour before bed to improve sleep quality tonight.'
    ],
    /* 5 = Saturday */
    [
      'Use your weekend to try a new physical activity — hiking, cycling, or yoga.',
      'Cook a nutritious meal at home instead of ordering out — you control the ingredients.',
      'Spend time outdoors today. Natural light and fresh air do wonders for mood.',
      'Practice gratitude: write down three things you are thankful for today.'
    ],
    /* 6 = Sunday */
    [
      'Use Sunday to set intentions for a healthy week ahead.',
      'Prepare your checklist and reminders for tomorrow so you start strong.',
      'Get to bed at a consistent time tonight — your body clock will thank you.',
      'Reflect on last week: what healthy habit are you most proud of?'
    ]
  ];

  /* Returns today's quote (changes each calendar day) */
  function getDailyQuote() {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 0);
    var diff = now - start;
    var oneDay = 1000 * 60 * 60 * 24;
    var dayOfYear = Math.floor(diff / oneDay); /* 1–365 */
    return ALL_QUOTES[dayOfYear % ALL_QUOTES.length];
  }

  /* Returns today's tips array (changes each weekday: Mon=0 … Sun=6) */
  function getDailyTips() {
    var dayOfWeek = (new Date().getDay() + 6) % 7; /* 0=Mon…6=Sun */
    return ALL_TIPS[dayOfWeek];
  }

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
    if (hours < 24) return 'Today, ' + fmtTime(new Date(ts).toTimeString().slice(0, 5));
    if (days === 1) return 'Yesterday, ' + fmtTime(new Date(ts).toTimeString().slice(0, 5));
    var d = new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'short' }) + ', ' + fmtTime(d.toTimeString().slice(0, 5));
  }

  function ripple(btn, e) {
    var old = btn.querySelector('.ripple');
    if (old) old.remove();
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var sp = document.createElement('span');
    sp.className = 'ripple';
    sp.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' +
      (e.clientX - rect.left - size / 2) + 'px;top:' + (e.clientY - rect.top - size / 2) + 'px';
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