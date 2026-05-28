const CalendarView = (() => {
  const HOUR_H     = 64;
  const GRID_START = 6;
  const GRID_END   = 23;
  const HOURS      = GRID_END - GRID_START;

  const DAYS_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MONTHS     = ['January','February','March','April','May','June','July',
                      'August','September','October','November','December'];

  // Exact Google Calendar color palette
  const GCAL_COLORS = [
    { name:'Tomato',    hex:'#D50000' },
    { name:'Flamingo',  hex:'#E67C73' },
    { name:'Tangerine', hex:'#F4511E' },
    { name:'Banana',    hex:'#F6BF26' },
    { name:'Sage',      hex:'#33B679' },
    { name:'Basil',     hex:'#0F9D58' },
    { name:'Peacock',   hex:'#039BE5' },
    { name:'Blueberry', hex:'#3F51B5' },
    { name:'Lavender',  hex:'#7986CB' },
    { name:'Grape',     hex:'#8E24AA' },
    { name:'Graphite',  hex:'#616161' },
  ];
  const OTHER_COLOR = '#1A73E8'; // Google Calendar default — "Other"

  const DEFAULT_CATEGORIES = [
    { name:'Lunch / Dinner', keywords:['lunch','dinner','brunch','breakfast','food','restaurant'], color:'#0F9D58' },
    { name:'Client',         keywords:['client','prospect','sales','demo','pitch','deal'],          color:'#616161' },
    { name:'Meeting',        keywords:['meeting','sync','standup','sprint','review','planning','call','interview','1:1'], color:'#3F51B5' },
    { name:'Personal',       keywords:['personal','family','home','doctor','dentist','appointment'], color:'#7986CB' },
    { name:'Exercise',       keywords:['gym','workout','yoga','run','exercise','training','sport'],  color:'#E67C73' },
  ];

  let weekOffset = 0;
  let _container = null;
  let _cache     = {};
  let _nowTimer  = null;
  let _settingsOpen = false;

  // ── CATEGORIES ─────────────────────────────────────────────────────────────
  function getCategories() {
    try { return JSON.parse(localStorage.getItem('apex_categories') || 'null') || DEFAULT_CATEGORIES; }
    catch { return DEFAULT_CATEGORIES; }
  }
  function saveCategories(cats) {
    localStorage.setItem('apex_categories', JSON.stringify(cats));
  }
  function getEventColor(title) {
    const lower = (title || '').toLowerCase();
    for (const cat of getCategories()) {
      if ((cat.keywords || []).some(k => lower.includes(k.toLowerCase()))) return cat.color;
    }
    return OTHER_COLOR;
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function getSunday(off = 0) {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + off * 7);
    d.setHours(0,0,0,0); return d;
  }
  function fmt12(s) { return new Date(s).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}); }
  function topPx(s) {
    const d = new Date(s);
    return Math.max(0, ((d.getHours()-GRID_START)*60+d.getMinutes())/60*HOUR_H);
  }
  function heightPx(s,e) { return Math.max(22,(new Date(e)-new Date(s))/3600000*HOUR_H); }
  function nowTopPx()    {
    const d = new Date();
    return ((d.getHours()-GRID_START)*60+d.getMinutes())/60*HOUR_H;
  }

  // ── API FETCH ──────────────────────────────────────────────────────────────
  async function fetchGoogle(tMin,tMax) {
    const token = await Auth.Google.getToken();
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}&orderBy=startTime&singleEvents=true&maxResults=100`,
      {headers:{Authorization:`Bearer ${token}`}}
    );
    if (!r.ok) throw new Error(`GCal ${r.status}`);
    const d = await r.json();
    return (d.items||[]).filter(e=>e.status!=='cancelled');
  }

  async function fetchOutlook(tMin,tMax) {
    const token = await Auth.Microsoft.getToken();
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${tMin}&endDateTime=${tMax}&$orderby=start/dateTime&$select=subject,start,end,isAllDay,description,location&$top=100`,
      {headers:{Authorization:`Bearer ${token}`,Prefer:'outlook.timezone="UTC"'}}
    );
    if (!r.ok) throw new Error(`Graph ${r.status}`);
    const d = await r.json();
    return (d.value||[]).map(e=>({
      summary:    e.subject||'(no title)',
      start:{dateTime:e.isAllDay?null:e.start?.dateTime, date:e.isAllDay?e.start?.dateTime?.split('T')[0]:null},
      end:  {dateTime:e.isAllDay?null:e.end?.dateTime,   date:e.isAllDay?e.end?.dateTime?.split('T')[0]:null},
      description:(e.body?.content||'').replace(/<[^>]+>/g,'').slice(0,300),
      location:e.location?.displayName||''
    }));
  }

  async function loadWeek(sunday) {
    const key = sunday.toISOString();
    if (_cache[key]) return _cache[key];
    const tMin = sunday.toISOString();
    const tMax = new Date(sunday.getTime()+7*86400000).toISOString();
    let events = [];
    if (typeof Auth !== 'undefined') {
      if (Auth.Google.isConnected())    try{events.push(...await fetchGoogle(tMin,tMax));}  catch(e){console.warn('[Cal] Google:',e.message);}
      if (Auth.Microsoft.isConnected()) try{events.push(...await fetchOutlook(tMin,tMax));} catch(e){console.warn('[Cal] Outlook:',e.message);}
    }
    _cache[key] = events; return events;
  }

  // ── EVENT POPUP ────────────────────────────────────────────────────────────
  function showPopup(ev, rect) {
    document.querySelector('.gcal-popup')?.remove();
    const timeStr = ev.start?.dateTime ? `${fmt12(ev.start.dateTime)} – ${fmt12(ev.end.dateTime)}` : 'All day';
    const color   = getEventColor(ev.summary);
    const p = document.createElement('div');
    p.className = 'gcal-popup';
    p.innerHTML = `
      <button class="gcal-popup-x">✕</button>
      <div class="gcal-popup-stripe" style="background:${color}"></div>
      <div class="gcal-popup-title">${ev.summary||'(no title)'}</div>
      <div class="gcal-popup-meta">${timeStr}</div>
      ${ev.location?`<div class="gcal-popup-meta">📍 ${ev.location}</div>`:''}
      ${ev.description?.trim()?`<div class="gcal-popup-desc">${ev.description.slice(0,200)}</div>`:''}`;
    const W=264, vW=window.innerWidth, vH=window.innerHeight;
    const left = rect.right+12+W>vW ? Math.max(4,rect.left-W-12) : rect.right+12;
    p.style.cssText=`position:fixed;top:${Math.min(rect.top,vH-220)}px;left:${left}px;width:${W}px`;
    document.body.appendChild(p);
    p.querySelector('.gcal-popup-x').addEventListener('click',e=>{e.stopPropagation();p.remove();});
    setTimeout(()=>document.addEventListener('click',function h(e){
      if(!p.contains(e.target)){p.remove();document.removeEventListener('click',h);}
    }),50);
  }

  // ── SETTINGS PANEL ────────────────────────────────────────────────────────
  function buildColorPicker(currentHex, onSelect) {
    return `<div class="gcal-color-row">
      ${GCAL_COLORS.map(c=>`
        <div class="gcal-color-chip${c.hex===currentHex?' selected':''}"
             style="background:${c.hex}" data-hex="${c.hex}" title="${c.name}"></div>`).join('')}
    </div>`;
  }

  function renderSettingsPanel(panel) {
    const cats = getCategories();
    panel.querySelector('#gcal-cat-list').innerHTML = cats.map((c,i)=>`
      <div class="gcal-cat-row" data-idx="${i}">
        <div class="gcal-cat-color-btn" data-idx="${i}" style="background:${c.color}" title="Change color"></div>
        <div class="gcal-cat-color-picker" id="gcal-cp-${i}" style="display:none">
          ${buildColorPicker(c.color, null)}
        </div>
        <input class="gcal-cat-name-input" data-idx="${i}" value="${c.name}" placeholder="Category name"/>
        <input class="gcal-cat-kw-input"   data-idx="${i}" value="${(c.keywords||[]).join(', ')}" placeholder="keyword1, keyword2"/>
        <button class="gcal-cat-del" data-idx="${i}" title="Remove">✕</button>
      </div>`).join('');

    // Color button → toggle picker
    panel.querySelectorAll('.gcal-cat-color-btn').forEach(btn=>{
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        const idx = +btn.dataset.idx;
        const picker = panel.querySelector(`#gcal-cp-${idx}`);
        const isOpen = picker.style.display !== 'none';
        panel.querySelectorAll('.gcal-cat-color-picker').forEach(p=>p.style.display='none');
        if (!isOpen) picker.style.display = 'flex';
      });
    });

    // Color chip selection
    panel.querySelectorAll('.gcal-color-chip').forEach(chip=>{
      chip.addEventListener('click',e=>{
        e.stopPropagation();
        const row  = chip.closest('.gcal-cat-row');
        const idx  = +row.dataset.idx;
        const cats = getCategories();
        cats[idx].color = chip.dataset.hex;
        saveCategories(cats); _cache={};
        renderSettingsPanel(panel);
        if (_container) placeEventsOnly(_container);
      });
    });

    // Name edit
    panel.querySelectorAll('.gcal-cat-name-input').forEach(inp=>{
      inp.addEventListener('change',()=>{
        const cats=getCategories(); cats[+inp.dataset.idx].name=inp.value.trim();
        saveCategories(cats); _cache={};
      });
    });

    // Keywords edit
    panel.querySelectorAll('.gcal-cat-kw-input').forEach(inp=>{
      inp.addEventListener('change',()=>{
        const cats=getCategories();
        cats[+inp.dataset.idx].keywords=inp.value.split(',').map(k=>k.trim()).filter(Boolean);
        saveCategories(cats); _cache={};
        if (_container) placeEventsOnly(_container);
      });
    });

    // Delete
    panel.querySelectorAll('.gcal-cat-del').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const cats=getCategories(); cats.splice(+btn.dataset.idx,1);
        saveCategories(cats); _cache={};
        renderSettingsPanel(panel);
        if (_container) placeEventsOnly(_container);
      });
    });
  }

  function buildSettingsPanel() {
    const panel = document.createElement('div');
    panel.className = 'gcal-settings-panel';
    panel.id = 'gcal-settings-panel';
    panel.innerHTML = `
      <div class="gcal-sp-header">
        <span>GOOGLE CALENDAR</span>
        <button class="gcal-sp-close" id="gcal-sp-close">✕</button>
      </div>
      <div class="gcal-sp-body">
        <div class="gcal-sp-section-title">EVENT CATEGORIES</div>
        <div class="gcal-sp-hint">Keywords auto-color events. Anything else defaults to <span style="color:${OTHER_COLOR};font-weight:700">Other</span> (blue).</div>
        <div id="gcal-cat-list"></div>
        <button class="gcal-sp-add-btn" id="gcal-add-cat">+ ADD CATEGORY</button>
        <div class="gcal-other-row">
          <div class="gcal-cat-color-btn" style="background:${OTHER_COLOR};cursor:default"></div>
          <span class="gcal-cat-other-label">Other (default — uncategorized)</span>
        </div>
      </div>`;

    panel.querySelector('#gcal-sp-close').addEventListener('click',()=>closeSettings());
    panel.querySelector('#gcal-add-cat').addEventListener('click',()=>{
      const cats=getCategories();
      cats.push({name:'New Category',keywords:[],color:GCAL_COLORS[0].hex});
      saveCategories(cats);
      renderSettingsPanel(panel);
    });

    // Close picker when clicking outside
    panel.addEventListener('click',e=>{
      if (!e.target.closest('.gcal-cat-color-btn') && !e.target.closest('.gcal-cat-color-picker')) {
        panel.querySelectorAll('.gcal-cat-color-picker').forEach(p=>p.style.display='none');
      }
    });

    renderSettingsPanel(panel);
    return panel;
  }

  function openSettings(container) {
    _settingsOpen = true;
    let panel = container.querySelector('#gcal-settings-panel');
    if (!panel) { panel = buildSettingsPanel(); container.querySelector('.gcal-wrap').appendChild(panel); }
    else renderSettingsPanel(panel);
    requestAnimationFrame(()=>panel.classList.add('open'));
  }

  function closeSettings() {
    _settingsOpen = false;
    const panel = _container?.querySelector('#gcal-settings-panel');
    if (panel) { panel.classList.remove('open'); }
  }

  // ── SKELETON ───────────────────────────────────────────────────────────────
  function buildSkeleton(container, sunday) {
    const today = new Date(); today.setHours(0,0,0,0);
    const days  = Array.from({length:7},(_,i)=>{const d=new Date(sunday);d.setDate(sunday.getDate()+i);return d;});
    const s=days[0],e=days[6];
    const weekLabel = s.getMonth()===e.getMonth()
      ? `${MONTHS[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`
      : `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;

    const dayHeaders = days.map(d=>{
      const isToday=d.getTime()===today.getTime();
      return `<div class="gcal-day-hdr${isToday?' is-today':''}">
        <div class="gcal-hdr-name">${DAYS_SHORT[d.getDay()]}</div>
        <div class="gcal-hdr-num${isToday?' today-circle':''}">${d.getDate()}</div>
      </div>`;
    }).join('');

    const timeAxis = Array.from({length:HOURS},(_,i)=>{
      const h=GRID_START+i;
      if(h===GRID_START) return `<div class="gcal-hour-label"></div>`;
      return `<div class="gcal-hour-label">${h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`}</div>`;
    }).join('');

    const hourLines = Array.from({length:HOURS},()=>`<div class="gcal-hour-line"></div>`).join('');
    const dayCols   = days.map((d,i)=>{
      const isToday=d.getTime()===today.getTime();
      return `<div class="gcal-day-col${isToday?' is-today':''}${(d.getDay()===0||d.getDay()===6)?' is-weekend':''}" data-idx="${i}"></div>`;
    }).join('');
    const allDayCols= days.map(()=>`<div class="gcal-allday-col"></div>`).join('');

    // Legend from current categories
    const cats   = getCategories();
    const legend = cats.map(c=>`<div class="gcal-legend-item"><span class="gcal-legend-dot" style="background:${c.color}"></span>${c.name}</div>`).join('')
      + `<div class="gcal-legend-item"><span class="gcal-legend-dot" style="background:${OTHER_COLOR}"></span>Other</div>`;

    container.innerHTML = `
      <div class="gcal-wrap">
        <div class="gcal-top-nav">
          <button class="gcal-nav-btn" id="cal-prev">&#8592;</button>
          <span class="gcal-week-label">${weekLabel}</span>
          <button class="gcal-today-btn" id="cal-today">TODAY</button>
          <button class="gcal-nav-btn" id="cal-next">&#8594;</button>
          <div class="gcal-legend">${legend}</div>
          <button class="gcal-settings-btn" id="gcal-settings-btn" title="Calendar settings">&#9881;</button>
        </div>
        <div class="gcal-col-headers">
          <div class="gcal-gutter"></div>${dayHeaders}
        </div>
        <div class="gcal-allday-strip">
          <div class="gcal-gutter gcal-allday-lbl">all‑day</div>
          <div class="gcal-allday-cols" id="gcal-allday-cols">${allDayCols}</div>
        </div>
        <div class="gcal-body">
          <div class="gcal-time-axis">${timeAxis}</div>
          <div class="gcal-grid-scroll" id="gcal-scroll">
            <div class="gcal-grid-inner" id="gcal-inner">
              <div class="gcal-hour-lines">${hourLines}</div>
              <div class="gcal-day-cols" id="gcal-day-cols">${dayCols}</div>
            </div>
          </div>
        </div>
      </div>`;

    container.querySelector('#cal-prev').addEventListener('click',()=>{weekOffset--;_cache={};render(container);});
    container.querySelector('#cal-next').addEventListener('click',()=>{weekOffset++;_cache={};render(container);});
    container.querySelector('#cal-today').addEventListener('click',()=>{weekOffset=0;_cache={};render(container);});
    container.querySelector('#gcal-settings-btn').addEventListener('click',()=>{
      _settingsOpen ? closeSettings() : openSettings(container);
    });
  }

  // ── PLACE EVENTS ───────────────────────────────────────────────────────────
  function placeEventsOnly(container) {
    const sunday   = getSunday(weekOffset);
    const days     = Array.from({length:7},(_,i)=>{const d=new Date(sunday);d.setDate(sunday.getDate()+i);return d;});
    const cached   = _cache[sunday.toISOString()];
    if (!cached) return;

    // Clear existing events
    container.querySelectorAll('.gcal-event,.gcal-allday-event,.gcal-now-line').forEach(e=>e.remove());
    _placeEvents(container, cached, days);
  }

  function _placeEvents(container, events, days) {
    const allDayCols = container.querySelectorAll('.gcal-allday-col');
    const dayCols    = container.querySelectorAll('.gcal-day-col');

    events.forEach(ev=>{
      const color = getEventColor(ev.summary);
      if (!ev.start.dateTime) {
        const evS=new Date(ev.start.date), evE=new Date(ev.end.date);
        days.forEach((d,i)=>{
          if(d>=evS&&d<evE&&allDayCols[i]){
            const el=document.createElement('div');
            el.className='gcal-allday-event';
            el.style.background=color;
            el.textContent=ev.summary;
            el.addEventListener('click',e=>showPopup(ev,e.target.getBoundingClientRect()));
            allDayCols[i].appendChild(el);
          }
        });
      } else {
        const mid=new Date(ev.start.dateTime); mid.setHours(0,0,0,0);
        const idx=days.findIndex(d=>d.getTime()===mid.getTime());
        if(idx<0||!dayCols[idx]) return;
        const top=topPx(ev.start.dateTime), height=heightPx(ev.start.dateTime,ev.end.dateTime);
        if(top>=HOURS*HOUR_H) return;
        const el=document.createElement('div');
        el.className='gcal-event';
        el.style.cssText=`top:${top}px;height:${height}px;background:${color}`;
        el.innerHTML=`<div class="gcal-event-title">${ev.summary}</div>${height>30?`<div class="gcal-event-time">${fmt12(ev.start.dateTime)}</div>`:''}`;
        el.addEventListener('click',e=>{e.stopPropagation();showPopup(ev,el.getBoundingClientRect());});
        dayCols[idx].appendChild(el);
      }
    });

    // Now indicator
    const today=new Date();today.setHours(0,0,0,0);
    const todayIdx=days.findIndex(d=>d.getTime()===today.getTime());
    if(todayIdx>=0&&dayCols[todayIdx]){
      const inner=container.querySelector('#gcal-inner');
      const col=dayCols[todayIdx];
      const line=document.createElement('div');
      line.className='gcal-now-line'; line.id='gcal-now-line';
      line.innerHTML='<div class="gcal-now-dot"></div>';
      line.style.cssText=`top:${nowTopPx()}px;left:${col.offsetLeft}px;width:${col.offsetWidth}px`;
      inner.appendChild(line);
      if(_nowTimer) clearInterval(_nowTimer);
      _nowTimer=setInterval(()=>{const nl=document.getElementById('gcal-now-line');if(nl)nl.style.top=`${nowTopPx()}px`;},60000);
    }

    // Scroll to current time
    const scroll=container.querySelector('#gcal-scroll');
    if(scroll){
      const today2=new Date();today2.setHours(0,0,0,0);
      const target=days.findIndex(d=>d.getTime()===today2.getTime())>=0?Math.max(0,nowTopPx()-100):2*HOUR_H;
      setTimeout(()=>{scroll.scrollTop=target;},60);
    }
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  async function render(container) {
    const sunday = getSunday(weekOffset);
    buildSkeleton(container, sunday);
    if(_settingsOpen) openSettings(container);

    const connected = typeof Auth!=='undefined'&&(Auth.Google.isConnected()||Auth.Microsoft.isConnected());
    if(!connected){
      setTimeout(()=>{const s=container.querySelector('#gcal-scroll');if(s)s.scrollTop=2*HOUR_H;},60);
      return;
    }
    try {
      const events = await loadWeek(sunday);
      const days   = Array.from({length:7},(_,i)=>{const d=new Date(sunday);d.setDate(sunday.getDate()+i);return d;});
      _placeEvents(container,events,days);
    } catch(e){ console.warn('[APEX Cal]',e.message); }
  }

  function init()    { _container=document.getElementById('view-calendar'); render(_container); }
  function refresh() { _cache={}; if(_container) render(_container); }

  return { init, refresh, getCategories, DEFAULT_CATEGORIES, GCAL_COLORS, OTHER_COLOR };
})();
