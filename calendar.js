const CalendarView = (() => {
  const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  const mockEvents = {
    1: [{ title: '9:00 — Team Standup', type: 'filled' }],
    3: [{ title: '2:00 — Client Call', type: 'filled' }, { title: '4:30 — Review', type: 'outline' }],
    5: [{ title: '10:00 — Planning', type: 'filled' }],
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
    const today = new Date(); today.setHours(0,0,0,0);

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return d;
    });

    const start = days[0], end = days[6];
    const weekLabel = `${MONTHS[start.getMonth()]} ${start.getDate()} — ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;

    const dayCols = days.map((d, i) => {
      const isToday = d.getTime() === today.getTime();
      const events = mockEvents[i] || [];
      const evHTML = events.map(ev =>
        `<div class="cal-event${ev.type === 'outline' ? ' outline' : ''}">${ev.title}</div>`
      ).join('');
      return `
        <div class="cal-day${isToday ? ' today' : ''}">
          <div class="cal-day-header">
            <div class="cal-day-name">${DAYS[i]}</div>
            <div class="cal-day-num">${d.getDate()}</div>
          </div>
          <div class="cal-day-events">${evHTML}</div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="cal-header">
        <span class="cal-week-label">${weekLabel}</span>
        <div class="cal-nav">
          <button class="cal-nav-btn" id="cal-prev">&#8592; PREV</button>
          <button class="cal-nav-btn" id="cal-today">TODAY</button>
          <button class="cal-nav-btn" id="cal-next">NEXT &#8594;</button>
        </div>
      </div>
      <div class="cal-grid">${dayCols}</div>
    `;

    container.querySelector('#cal-prev').addEventListener('click', () => { weekOffset--; render(container); });
    container.querySelector('#cal-next').addEventListener('click', () => { weekOffset++; render(container); });
    container.querySelector('#cal-today').addEventListener('click', () => { weekOffset = 0; render(container); });
  }

  function init() {
    render(document.getElementById('view-calendar'));
  }

  return { init };
})();
