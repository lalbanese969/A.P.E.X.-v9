const EmailView = (() => {
  let _container = null;
  let _source    = 'gmail';
  let _days      = '3';
  let _emails    = [];
  let _scanning  = false;
  let _settingsOpen = false;

  // ── STORAGE ────────────────────────────────────────────────────────────────
  function getUrgencyInstr(src)  { return localStorage.getItem(`apex_${src}_urgency`) || ''; }
  function getReplyInstr(src)    { return localStorage.getItem(`apex_${src}_reply`)   || ''; }

  // ── API ────────────────────────────────────────────────────────────────────
  function parseJSON(raw) {
    return JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim());
  }

  async function gmailGet(path, token) {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`,{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok) throw new Error(`Gmail ${r.status}`);
    return r.json();
  }
  async function graphGet(path, token) {
    const r = await fetch(`https://graph.microsoft.com/v1.0${path}`,{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok) throw new Error(`Graph ${r.status}`);
    return r.json();
  }

  // ── LOAD EMAILS ────────────────────────────────────────────────────────────
  async function loadGmail(days) {
    const token = await Auth.Google.getToken();
    const [label, list] = await Promise.all([
      gmailGet('/users/me/labels/INBOX', token),
      gmailGet(`/users/me/messages?maxResults=20&q=${encodeURIComponent(`in:inbox newer_than:${days}d`)}`,token)
    ]);
    const stats = {unread: label.messagesUnread||0};
    if(!list.messages?.length) return {stats, emails:[]};
    const details = await Promise.all(list.messages.slice(0,15).map(m=>
      gmailGet(`/users/me/messages/${m.id}?format=metadata&metadataHeaders=From,Subject`,token)
    ));
    const emails = details.map(msg=>{
      const hdr = n=>(msg.payload?.headers||[]).find(h=>h.name.toLowerCase()===n.toLowerCase())?.value||'';
      return {
        id:msg.id, source:'gmail',
        from: hdr('From').replace(/<[^>]+>/,'').replace(/"/g,'').trim()||hdr('From'),
        subject: hdr('Subject')||'(no subject)',
        preview: msg.snippet||'',
        unread: !!(msg.labelIds?.includes('UNREAD')),
        status: 'routine'
      };
    });
    return {stats, emails};
  }

  async function loadOutlook(days) {
    const token = await Auth.Microsoft.getToken();
    const since = new Date(); since.setDate(since.getDate()-parseInt(days));
    const [folder,list] = await Promise.all([
      graphGet('/me/mailFolders/inbox?$select=unreadItemCount',token),
      graphGet(`/me/mailFolders/inbox/messages?$top=15&$select=from,subject,bodyPreview,isRead&$filter=receivedDateTime ge ${since.toISOString()}&$orderby=receivedDateTime desc`,token)
    ]);
    const stats = {unread: folder.unreadItemCount||0};
    const emails = (list.value||[]).map(msg=>({
      id:msg.id, source:'outlook',
      from: msg.from?.emailAddress?.name||msg.from?.emailAddress?.address||'Unknown',
      subject: msg.subject||'(no subject)',
      preview: msg.bodyPreview||'',
      unread: !msg.isRead,
      status: 'routine'
    }));
    return {stats, emails};
  }

  // ── AI SCAN ────────────────────────────────────────────────────────────────
  async function runAiScan(container) {
    if(_scanning||!_emails.length) return;
    _scanning = true;
    const btn = container.querySelector('.email-scan-btn');
    if(btn){btn.textContent='◈ SCANNING...';btn.disabled=true;}

    const urgInstr = getUrgencyInstr(_source);
    const repInstr = getReplyInstr(_source);
    const srcLabel = _source==='gmail'?'Gmail':'Outlook';

    const prompt = `Analyze these emails from Luke's ${srcLabel} inbox.

${urgInstr?`URGENT if: ${urgInstr}`:'URGENT if: time-sensitive, from a client/contact, needs immediate attention.'}
${repInstr?`NEEDS REPLY if: ${repInstr}`:'NEEDS REPLY if: contains a question, request, or is waiting for a response.'}

EMAILS:
${_emails.slice(0,15).map((e,i)=>`${i+1}. From: ${e.from} | Subject: ${e.subject} | ${e.preview.slice(0,80)}`).join('\n')}

Reply ONLY with JSON array. Only include emails needing action:
[{"index":1,"status":"urgent","reason":"client waiting on proposal"},{"index":3,"status":"needs_reply","reason":"question about timeline"}]
status must be "urgent" or "needs_reply". No markdown.`;

    try {
      const raw    = await AI.sendToGemini([{role:'user',text:prompt}]);
      const parsed = parseJSON(raw);
      _emails.forEach(e=>{ e.status='routine'; e.aiReason=''; });
      parsed.forEach(item=>{
        const em = _emails[item.index-1];
        if(em){ em.status=item.status||'routine'; em.aiReason=item.reason||''; }
      });
      renderList(container);
      renderStats(container, _emails.filter(e=>e.unread).length);
    } catch(e){ console.warn('[APEX Email] AI scan:',e.message); }

    _scanning=false;
    if(btn){btn.textContent='◈ AI SCAN';btn.disabled=false;}
  }

  // ── FETCH EMAIL BODY ───────────────────────────────────────────────────────
  async function fetchBody(email) {
    if(email.source==='gmail'){
      const token=await Auth.Google.getToken();
      const msg=await gmailGet(`/users/me/messages/${email.id}?format=full`,token);
      const parts=msg.payload?.parts||[msg.payload];
      for(const p of parts) if(p?.mimeType==='text/plain'&&p?.body?.data)
        return atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/')).slice(0,1000);
      return msg.snippet||'';
    } else {
      const token=await Auth.Microsoft.getToken();
      const msg=await graphGet(`/me/messages/${email.id}?$select=body`,token);
      return (msg.body?.content||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,1000);
    }
  }

  // ── SETTINGS PANEL ─────────────────────────────────────────────────────────
  function buildSettingsPanel(src) {
    const label = src==='gmail'?'GMAIL':'OUTLOOK';
    const urgVal = getUrgencyInstr(src);
    const repVal = getReplyInstr(src);

    const panel = document.createElement('div');
    panel.className = 'email-settings-panel';
    panel.id = 'email-settings-panel';
    panel.innerHTML = `
      <div class="email-sp-header">
        <span>${label} SETTINGS</span>
        <button class="email-sp-close" id="email-sp-close">✕</button>
      </div>
      <div class="email-sp-body">
        <label class="email-sp-label">URGENT — mark an email as urgent if...</label>
        <textarea class="email-sp-textarea" id="email-urgency-ta" placeholder="e.g. it's from a client or prospect, it mentions a deadline, or uses words like ASAP or urgent.">${urgVal}</textarea>
        <label class="email-sp-label" style="margin-top:14px">NEEDS REPLY — mark as needs reply if...</label>
        <textarea class="email-sp-textarea" id="email-reply-ta" placeholder="e.g. it contains a question, asks me to confirm something, or is waiting on my response.">${repVal}</textarea>
        <button class="email-sp-save" id="email-sp-save">SAVE</button>
        <div class="email-sp-hint">These instructions are sent to APEX when you click AI SCAN. Each email account has its own settings.</div>
      </div>`;

    panel.querySelector('#email-sp-close').addEventListener('click',()=>closeSettings());
    panel.querySelector('#email-sp-save').addEventListener('click',()=>{
      localStorage.setItem(`apex_${src}_urgency`, panel.querySelector('#email-urgency-ta').value.trim());
      localStorage.setItem(`apex_${src}_reply`,   panel.querySelector('#email-reply-ta').value.trim());
      const btn = panel.querySelector('#email-sp-save');
      btn.textContent='SAVED ✓';
      setTimeout(()=>{btn.textContent='SAVE';},1500);
    });
    return panel;
  }

  function openSettings(container) {
    _settingsOpen=true;
    let panel=container.querySelector('#email-settings-panel');
    if(panel) panel.remove();
    panel=buildSettingsPanel(_source);
    container.querySelector('.email-dash').appendChild(panel);
    requestAnimationFrame(()=>panel.classList.add('open'));
  }
  function closeSettings() {
    _settingsOpen=false;
    const panel=_container?.querySelector('#email-settings-panel');
    if(panel){panel.classList.remove('open');setTimeout(()=>panel.remove(),280);}
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function emailCard(e) {
    const isUrgent = e.status==='urgent';
    const isReply  = e.status==='needs_reply';
    const badge    = e.aiReason?`<span class="email-ai-badge ${isUrgent?'urgent':''}" title="${esc(e.aiReason)}">${isUrgent?'URGENT':'REPLY'}</span>`:'';
    return `
      <div class="email-item${e.unread?' unread':''}${isUrgent?' urgent-item':isReply?' reply-item':''}" data-id="${e.id}" data-src="${e.source}">
        <div class="email-item-top">
          <div class="email-from">${esc(e.from)}</div>
          ${badge}
          ${e.unread?'<div class="email-unread-dot"></div>':''}
        </div>
        <div class="email-subject">${esc(e.subject)}</div>
        <div class="email-preview">${esc(e.preview.slice(0,110))}</div>
        <div class="email-item-actions">
          <button class="email-action-btn" data-action="summarize">SUMMARIZE</button>
          <button class="email-action-btn" data-action="reply">DRAFT REPLY</button>
        </div>
      </div>`;
  }

  function renderList(container) {
    const urgent   = _emails.filter(e=>e.status==='urgent');
    const needsRep = _emails.filter(e=>e.status==='needs_reply');
    const rest     = _emails.filter(e=>e.status==='routine');
    const listEl   = container.querySelector('#email-list-body');
    if(!listEl) return;

    listEl.innerHTML = [
      urgent.length   ? `<div class="email-section-label urgent-label">⚠ URGENT (${urgent.length})</div>${urgent.map(emailCard).join('')}` : '',
      needsRep.length ? `<div class="email-section-label reply-label">↩ NEEDS REPLY (${needsRep.length})</div>${needsRep.map(emailCard).join('')}` : '',
      (urgent.length||needsRep.length) ? '<div class="email-section-label">INBOX</div>' : '<div class="email-section-label">INBOX</div>',
      rest.length ? rest.map(emailCard).join('') : '<div class="email-empty">All clear, Sir.</div>'
    ].join('');

    listEl.querySelectorAll('.email-action-btn').forEach(btn=>{
      btn.addEventListener('click', async e=>{
        e.stopPropagation();
        const card = btn.closest('.email-item');
        const email= _emails.find(m=>m.id===card.dataset.id&&m.source===card.dataset.src);
        if(!email) return;
        btn.textContent='...'; btn.disabled=true;
        try {
          const body   = await fetchBody(email);
          const action = btn.dataset.action;
          const prompt = action==='summarize'
            ? `Summarize this email in 2 sentences:\n\n${body}`
            : `Draft a concise, professional reply to this email:\n\n${body}`;
          const reply  = await AI.sendToGemini([{role:'user',text:prompt}]);
          document.querySelector('[data-view="chat"]')?.click();
          setTimeout(()=>{const r=document.getElementById('focus-response');if(r)r.textContent=reply;},60);
        } catch(err){
          btn.textContent='✕';
          setTimeout(()=>{btn.textContent=btn.dataset.action==='summarize'?'SUMMARIZE':'DRAFT REPLY';btn.disabled=false;},2000);
          return;
        }
        btn.textContent=btn.dataset.action==='summarize'?'SUMMARIZE':'DRAFT REPLY';
        btn.disabled=false;
      });
    });
  }

  function renderStats(container, unread) {
    const urgent   = _emails.filter(e=>e.status==='urgent').length;
    const needsRep = _emails.filter(e=>e.status==='needs_reply').length;
    const bar = container.querySelector('#email-stat-bar');
    if(!bar) return;
    bar.innerHTML = `
      <div class="email-stat-pill unread-pill">${unread} UNREAD</div>
      ${urgent   ? `<div class="email-stat-pill urgent-pill">${urgent} URGENT</div>` : ''}
      ${needsRep ? `<div class="email-stat-pill reply-pill">${needsRep} NEEDS REPLY</div>` : ''}
      <button class="email-scan-btn" id="email-scan-btn">◈ AI SCAN</button>
      <button class="email-gear-btn" id="email-gear-btn" title="Email settings">&#9881;</button>`;
    bar.querySelector('#email-scan-btn').addEventListener('click',()=>runAiScan(container));
    bar.querySelector('#email-gear-btn').addEventListener('click',()=>{
      _settingsOpen?closeSettings():openSettings(container);
    });
  }

  async function loadAndRender(container) {
    const googleOk = typeof Auth!=='undefined'&&Auth.Google.isConnected();
    const msOk     = typeof Auth!=='undefined'&&Auth.Microsoft.isConnected();
    _emails = [];
    let unread = 0;

    const listEl = container.querySelector('#email-list-body');
    if(listEl) listEl.innerHTML='<div class="email-loading">SCANNING INBOX...</div>';

    try {
      if(_source==='gmail'&&googleOk){
        const {stats,emails}=await loadGmail(_days);
        unread=stats.unread; _emails=emails;
      } else if(_source==='outlook'&&msOk){
        const {stats,emails}=await loadOutlook(_days);
        unread=stats.unread; _emails=emails;
      }
    } catch(e){
      if(listEl) listEl.innerHTML=`<div class="email-loading" style="opacity:.5">⚠ ${e.message}</div>`;
    }
    renderStats(container, unread);
    renderList(container);
  }

  function render(container) {
    const googleOk = typeof Auth!=='undefined'&&Auth.Google.isConnected();
    const msOk     = typeof Auth!=='undefined'&&Auth.Microsoft.isConnected();

    if(!googleOk&&msOk)  _source='outlook';
    if(googleOk&&!msOk)  _source='gmail';

    container.innerHTML = `
      <div class="email-dash">
        <div class="email-top-bar">
          <div class="email-source-toggle">
            ${googleOk?`<button class="email-src-btn${_source==='gmail'?' active':''}" data-src="gmail">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
              GMAIL</button>`:''}
            ${msOk?`<button class="email-src-btn${_source==='outlook'?' active':''}" data-src="outlook">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 5.6L5 7l1.4 1.4L8.8 7zm9 0l-1.4 1.4L17.5 8 19 7zm-4.5.9C9.8 6.5 7 9.3 7 12.8c0 3.6 2.7 6.5 6 6.5s6-2.9 6-6.5c0-3.5-2.7-6.3-6-6.3zm0 1.5c2.5 0 4.5 2.2 4.5 4.8s-2 4.8-4.5 4.8S7.5 15 7.5 12.8s2-4.8 4.5-4.8zM5 11.5H2v1.5h3zm17 0h-3v1.5h3z"/></svg>
              OUTLOOK</button>`:''}
            ${!googleOk&&!msOk?`<span class="email-not-connected-label">NOT CONNECTED</span><button class="action-btn primary" id="email-go-settings">OPEN SETTINGS</button>`:''}
          </div>
          <div class="day-filter">
            <button class="day-btn${_days==='3'?' active':''}" data-days="3">3D</button>
            <button class="day-btn${_days==='7'?' active':''}" data-days="7">7D</button>
            <button class="day-btn${_days==='30'?' active':''}" data-days="30">30D</button>
          </div>
        </div>
        <div id="email-stat-bar" class="email-stat-bar">
          <div class="email-loading" style="padding:6px 0;font-size:.68rem">LOADING...</div>
        </div>
        <div id="email-list-body" class="email-list-body">
          ${googleOk||msOk?'<div class="email-loading">FETCHING INBOX...</div>':''}
        </div>
      </div>`;

    container.querySelectorAll('.email-src-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        _source=btn.dataset.src;
        container.querySelectorAll('.email-src-btn').forEach(b=>b.classList.toggle('active',b.dataset.src===_source));
        if(_settingsOpen){ closeSettings(); setTimeout(()=>openSettings(container),300); }
        loadAndRender(container);
      });
    });
    container.querySelectorAll('.day-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        _days=btn.dataset.days;
        container.querySelectorAll('.day-btn').forEach(b=>b.classList.toggle('active',b.dataset.days===_days));
        loadAndRender(container);
      });
    });
    container.querySelector('#email-go-settings')?.addEventListener('click',()=>{
      document.querySelector('[data-view="settings"]')?.click();
    });

    if(googleOk||msOk) loadAndRender(container);
  }

  function init()    { _container=document.getElementById('view-email'); render(_container); }
  function refresh() { if(_container) render(_container); }

  return {init, refresh};
})();
