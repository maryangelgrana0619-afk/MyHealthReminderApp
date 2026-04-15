/* ============================================
   MyHealth Reminder — Data Layer v3
   data.js
   ============================================ */

const MH = (() => {
  'use strict';

  const KEYS = {
    users:     'mh_users',
    session:   'mh_session',
    reminders: 'mh_reminders',
    checklist: 'mh_checklist',
    history:   'mh_history',
    streak:    'mh_streak',
    onboarded: 'mh_onboarded',
  };

  function load(key)      { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
  function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  /* ── Default data ── */
  const DEFAULT_REMINDERS = [
    { id:'r1', title:'Hydration Check',     type:'hydration',  time:'09:00', freq:'Daily', tone:'Chime', enabled:true },
    { id:'r2', title:'Morning Medication',  type:'medication', time:'09:30', freq:'Daily', tone:'Bell',  enabled:true },
    { id:'r3', title:'Evening Exercise',    type:'exercise',   time:'18:00', freq:'Daily', tone:'Alert', enabled:true },
  ];
  const DEFAULT_CHECKLIST = [
    { id:'c1', label:'Drink 8 glasses of water',  done:false },
    { id:'c2', label:'Take morning medication',    done:false },
    { id:'c3', label:'30-minute walk',             done:false },
    { id:'c4', label:'Meditate for 10 minutes',    done:false },
  ];

  /* ── Auth ── */
  const auth = {
    getUsers()  { return load(KEYS.users)   || []; },
    getSession(){ return load(KEYS.session) || null; },

    register(name, email, password) {
      const users = this.getUsers();
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
        return { ok: false, msg: 'Email already registered.' };
      const user = { id: 'u'+Date.now(), name, email: email.toLowerCase(), password };
      users.push(user);
      save(KEYS.users, users);
      save(KEYS.session, { id: user.id, name: user.name, email: user.email });
      return { ok: true, user };
    },

    login(email, password) {
      const users = this.getUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
      if (!user) return { ok: false, msg: 'Incorrect email or password.' };
      save(KEYS.session, { id: user.id, name: user.name, email: user.email });
      return { ok: true, user };
    },

    logout() {
      localStorage.removeItem(KEYS.session);
      window.location.href = 'login.html';
    },

    isLoggedIn() { return !!this.getSession(); },

    requireAuth() {
      if (!this.isLoggedIn()) { window.location.href = 'login.html'; }
    },

    updateProfile(name) {
      const sess = this.getSession();
      if (!sess) return;
      const users = this.getUsers().map(u => u.id === sess.id ? { ...u, name } : u);
      save(KEYS.users, users);
      save(KEYS.session, { ...sess, name });
    },
  };

  /* ── Reminders ── */
  const reminders = {
    getAll()   { return load(KEYS.reminders) || DEFAULT_REMINDERS; },
    saveAll(a) { save(KEYS.reminders, a); },
    add(r) {
      const list = this.getAll(); r.id = 'r'+Date.now(); list.push(r);
      save(KEYS.reminders, list); return r;
    },
    update(r) { save(KEYS.reminders, this.getAll().map(x => x.id===r.id ? r : x)); },
    delete(id) { save(KEYS.reminders, this.getAll().filter(x => x.id!==id)); },
  };

  /* ── Checklist ── */
  const checklist = {
    get()   { return load(KEYS.checklist) || DEFAULT_CHECKLIST; },
    toggle(id) {
      const list = this.get().map(x => x.id===id ? {...x, done:!x.done} : x);
      save(KEYS.checklist, list);
      // log completion to history
      const item = list.find(x => x.id===id);
      if (item && item.done) history.log(item.label);
      return list;
    },
    reset() { save(KEYS.checklist, DEFAULT_CHECKLIST.map(x=>({...x,done:false}))); },
    progress() {
      const list = this.get();
      const done = list.filter(x=>x.done).length;
      return { done, total:list.length, pct: list.length ? Math.round((done/list.length)*100) : 0 };
    },
  };

  /* ── History (recent completions) ── */
  const history = {
    get() { return load(KEYS.history) || []; },
    log(label) {
      const list = this.get();
      list.unshift({ label, ts: Date.now() });
      save(KEYS.history, list.slice(0, 30)); // keep last 30
    },
    clear() { save(KEYS.history, []); },
  };

  /* ── Streak ── */
  const streak = {
    get() { return load(KEYS.streak) || { days:0, lastDate:null }; },
    update() {
      const s = this.get();
      const today = new Date().toDateString();
      if (s.lastDate === today) return s.days;
      const yesterday = new Date(Date.now()-86400000).toDateString();
      const days = s.lastDate === yesterday ? s.days + 1 : 1;
      save(KEYS.streak, { days, lastDate: today });
      return days;
    },
  };

  /* ── Motivation quotes ── */
  const QUOTES = [
    '"Consistency is more important than perfection. Every small step counts!"',
    '"Your health is an investment, not an expense."',
    '"Small daily improvements lead to stunning results."',
    '"Take care of your body. It\'s the only place you have to live."',
    '"Wellness is not a destination, it\'s a daily practice."',
    '"Progress, not perfection. You\'re doing great!"',
    '"Every healthy choice brings you closer to your best self."',
  ];
  function getQuote() { return QUOTES[Math.floor(Math.random()*QUOTES.length)]; }

  /* ── Utilities ── */
  function ripple(btn, e) {
    const old = btn.querySelector('.ripple'); if (old) old.remove();
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const sp = document.createElement('span');
    sp.className = 'ripple';
    sp.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
    btn.appendChild(sp);
    sp.addEventListener('animationend', () => sp.remove());
  }

  function toast(msg, duration=2500) {
    let el = document.getElementById('_toast');
    if (!el) { el = document.createElement('div'); el.id='_toast'; el.className='toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), duration);
  }

  function go(page)       { window.location.href = page; }
  function fmtTime(t) {
    if (!t) return '';
    const [h,m] = t.split(':'); const hr = parseInt(h);
    return `${hr%12||12}:${m} ${hr<12?'AM':'PM'}`;
  }
  function fmtRelative(ts) {
    const diff = Date.now() - ts;
    const mins  = Math.floor(diff/60000);
    const hours = Math.floor(diff/3600000);
    const days  = Math.floor(diff/86400000);
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `Today, ${fmtTime(new Date(ts).toTimeString().slice(0,5))}`;
    if (days === 1) return `Yesterday, ${fmtTime(new Date(ts).toTimeString().slice(0,5))}`;
    const d = new Date(ts);
    return `${d.toLocaleDateString('en-US',{weekday:'short'})}, ${fmtTime(d.toTimeString().slice(0,5))}`;
  }

  /* ── Weekly bar data (mock based on streak) ── */
  function getWeeklyData() {
    const p = checklist.progress();
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const todayIdx = (new Date().getDay()+6)%7; // 0=Mon
    return days.map((d,i) => ({
      day: d,
      val: i < todayIdx ? Math.floor(Math.random()*60+40) : i===todayIdx ? p.pct : 0,
      isToday: i===todayIdx,
    }));
  }

  return { auth, reminders, checklist, history, streak, getQuote, getWeeklyData, ripple, toast, go, fmtTime, fmtRelative };
})();