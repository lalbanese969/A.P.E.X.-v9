const CalendarView = (() => {
  const DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAYS_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const mockEvents = {
    1: [{ title: '9:00 AM  Team Standup', type: 'filled' }],
    3: [{ title: '2:00 PM  Client Call', type: 'filled' }, { title: '4:30 PM  Code Review', type: 'outline' }],
    5: [{ title: '10:00 AM  Sprint Planning', type: 'filled' }],
    6: [{ title: '1:00 PM  Lunch', type: 'outline' }],
  };

  let weekOffset = 0;

  function getSunday(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + offset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function render(container) {
    const sunday = getSunday(weekOffset);
    const today  = new Date(); today.setHours(0,0,0,0);

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday); d.setDate(sunday.getDate() + i); return d;
    });

    const start = days[0], end = days[6];
    const sameMonth = start.getMonth() === end.getMonth();
    const weekLabel = sameMonth
      ? `${MONTHS[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
      : `${MONTHS[start.getMonth()]} ${start.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;

    const dayNames = DAYS_SHORT.map((d, i) => `
      <div class="cal-day-name-cell">${d}</div>
    `).join('');

    const dayCols = days.map((d, i) => {
      const isToday = d.getTime() === today.getTime();
      const events  = mockEvents[i] || [];
      const evHTML  = events.map(ev =>
        `<div class="cal-event${ev.type === 'outline' ? ' outline' : ''}">${ev.title}</div>`
      ).join('');
      return `
        <div class="cal-day${isToday ? ' today' : ''}">
          <div class="cal-date-num">${d.getDate()}</div>
          <div class="cal-day-events">${evHTML}</div>
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
      <div class="cal-grid">${dayCols}</div>
    `;

    container.querySelector('#cal-prev').addEventListener('click',  () => { weekOffset--; render(container); });
    container.querySelector('#cal-next').addEventListener('click',  () => { weekOffset++; render(container); });
    container.querySelector('#cal-today').addEventListener('click', () => { weekOffset = 0; render(container); });
  }

  function init() { render(document.getElementById('view-calendar')); }
  return { init };
})();
