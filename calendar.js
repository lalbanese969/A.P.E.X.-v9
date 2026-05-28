const CalendarView = (() => {
  const DAYS_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  let weekOffset = 0;
  let _container = null;
  let _eventsCache = {};  // key: weekStart ISO -> events map

  function getSunday(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + offset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function fmtTime(dateStr) {
    if (!dateStr) return 'All day';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // ── GOOGLE CALENDAR FETCH ─────────────────────────────────────────────────
  async function fetchGoogleEvents(timeMin, timeMax) {
    const token = await Auth.Google.getToken();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events`
      + `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
      + `&orderBy=startTime&singleEvents=true&maxResults=50`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Google Calendar ${r.status}`);
    const data = await r.json();
    return (data.items || []).map(ev => ({
      title: ev.summary || '(no title)',
      start: ev.start.dateTime || ev.start.date,
      allDay: !ev.start.dateTime
    }));
  }

  // ── MICROSOFT CALENDAR FETCH ──────────────────────────────────────────────
  async function fetchMsEvents(timeMin, timeMax) {
    const token = await Auth.Microsoft.getToken();
    const url = `https://graph.microsoft.com/v1.0/me/calendarView`
      + `?startDateTime=${timeMin}&endDateTime=${timeMax}`
      + `&$orderby=start/dateTime&$select=subject,start,end,isAllDay&$top=50`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' }
    });
    if (!r.ok) throw new Error(`Outlook Calendar ${r.status}`);
    const data = await r.json();
    return (data.value || []).map(ev => ({
      title: ev.subject || '(no title)',
      start: ev.start?.dateTime || ev.start?.date,
      allDay: !!ev.isAllDay
    }));
  }

  // ── BUILD EVENTS MAP ──────────────────────────────────────────────────────
  // Returns { 0: [{title,type}], 1: [...], ... } indexed by day of week (0=Sun)
  function buildDayMap(rawEvents, sunday) {
    const map = {};
    for (const ev of rawEvents) {
      if (!ev.start) continue;
      const start = new Date(ev.start);
      const startMid = new Date(start); startMid.setHours(0,0,0,0);
      const idx = Math.round((startMid - sunday) / 86400000);
      if (idx < 0 || idx > 6) continue;
      if (!map[idx]) map[idx] = [];
      const label = ev.allDay ? `All day  ${ev.title}` : `${fmtTime(ev.start)}  ${ev.title}`;
      map[idx].push({ title: label, type: 'filled' });
    }
    return map;
  }

  async function loadEvents(sunday) {
    const timeMin = sunday.toISOString();
    const timeMax = new Date(sunday.getTime() + 7 * 86400000).toISOString();
    const raw = [];

    const googleOk    = typeof Auth !== 'undefined' && Auth.Google.isConnected();
    const microsoftOk = typeof Auth !== 'undefined' && Auth.Microsoft.isConnected();

    if (googleOk) {
      try { raw.push(...(await fetchGoogleEvents(timeMin, timeMax))); }
      catch(e) { console.warn('[APEX Calendar] Google:', e.message); }
    }
    if (microsoftOk) {
      try { raw.push(...(await fetchMsEvents(timeMin, timeMax))); }
      catch(e) { console.warn('[APEX Calendar] Outlook:', e.message); }
    }

    return buildDayMap(raw, sunday);
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  function renderSkeleton(container, sunday) {
    const today = new Date(); today.setHours(0,0,0,0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday); d.setDate(sunday.getDate() + i); return d;
    });

    const start = days[0], end = days[6];
    const sameMonth = start.getMonth() === end.getMonth();
    const weekLabel = sameMonth
      ? `${MONTHS[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
      : `${MONTHS[start.getMonth()]} ${start.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;

    const dayNames = DAYS_SHORT.map(d => `<div class="cal-day-name-cell">${d}</div>`).join('');
    const dayCols = days.map((d, i) => {
      const isToday = d.getTime() === today.getTime();
      return `<div class="cal-day${isToday ? ' today' : ''}" data-idx="${i}">
        <div class="cal-date-num">${d.getDate()}</div>
        <div class="cal-day-events"></div>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="cal-header">
        <span class="cal-week-label">${weekLabel}</span>
        <div class="cal-nav">
          <button class="cal-nav-btn" id="cal-prev">&#8592;</button>
          <button class="cal-today-btn" id="cal-today">Today</button>
          <button class="cal-nav-btn" id="cal-next">&#8594;</button>
        </div>
      </div>
      <div class="cal-day-names">${dayNames}</div>
      <div class="cal-grid">${dayCols}</div>`;

    container.querySelector('#cal-prev').addEventListener('click', () => { weekOffset--; render(container); });
    container.querySelector('#cal-next').addEventListener('click', () => { weekOffset++; render(container); });
    container.querySelector('#cal-today').addEventListener('click', () => { weekOffset = 0; render(container); });
  }

  function injectEvents(container, evMap) {
    container.querySelectorAll('.cal-day').forEach(cell => {
      const idx = parseInt(cell.dataset.idx);
      const evEl = cell.querySelector('.cal-day-events');
      if (!evEl) return;
      const dayEvents = evMap[idx] || [];
      evEl.innerHTML = dayEvents.map(ev =>
        `<div class="cal-event${ev.type === 'outline' ? ' outline' : ''}">${ev.title}</div>`
      ).join('');
    });
  }

  async function render(container) {
    const sunday = getSunday(weekOffset);
    renderSkeleton(container, sunday);

    const googleOk    = typeof Auth !== 'undefined' && Auth.Google.isConnected();
    const microsoftOk = typeof Auth !== 'undefined' && Auth.Microsoft.isConnected();

    if (!googleOk && !microsoftOk) {
      // Show mock data when not connected
      const mockEvents = {
        1: [{ title: '9:00 AM  Team Standup', type: 'filled' }],
        3: [{ title: '2:00 PM  Client Call', type: 'filled' }],
        5: [{ title: '10:00 AM  Sprint Planning', type: 'filled' }],
      };
      injectEvents(container, mockEvents);
      const grid = container.querySelector('.cal-grid');
      if (grid) grid.insertAdjacentHTML('beforeend',
        `<div class="cal-not-connected">CONNECT GOOGLE OR MICROSOFT IN SETTINGS TO SEE REAL EVENTS</div>`);
      return;
    }

    const cacheKey = sunday.toISOString();
    if (_eventsCache[cacheKey]) {
      injectEvents(container, _eventsCache[cacheKey]);
      return;
    }

    const evMap = await loadEvents(sunday);
    _eventsCache[cacheKey] = evMap;
    injectEvents(container, evMap);
  }

  function init() {
    _container = document.getElementById('view-calendar');
    render(_container);
  }

  function refresh() {
    _eventsCache = {};
    if (_container) render(_container);
  }

  return { init, refresh };
})();
