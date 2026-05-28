const EmailView = (() => {
  let _container  = null;
  let _source     = 'gmail';   // 'gmail' | 'outlook'
  let _days       = '3';
  let _emails     = [];
  let _scanning   = false;

  // ── API HELPERS ────────────────────────────────────────────────────────────
  function parseJSON(raw) {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(clean);
  }

  async function gmailGet(path, token) {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) throw new Error(`Gmail ${r.status}`);
    return r.json();
  }

  async function graphGet(path, token) {
    const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) throw new Error(`Graph ${r.status}`);
    return r.json();
  }

  // ── URGENCY HEURISTIC ─────────────────────────────────────────────────────
  function isUrgent(email) {
    if (!email.unread) return false;
    const from = (email.from || '').toLowerCase();
    const sub  = (email.subject || '').toLowerCase();
    const skip = ['noreply','no-reply','donotreply','newsletter','notifications','alerts','automated',
                  'github.com','linkedin.com','twitter.com','youtube.com','google.com','microsoft.com',
                  'apple.com','amazon.com','paypal.com','support@','info@','hello@'];
    if (skip.some(s => from.includes(s))) return false;
    const kw = ['urgent','asap','action required','follow up','following up','please reply',
                'need your','proposal','invoice','contract','quote','deadline','overdue',
                'checking in','can we','are you available','when can you'];
    return kw.some(k => sub.includes(k)) || (sub.includes('?') && !sub.startsWith('re:'));
  }

  // ── GMAIL LOAD ─────────────────────────────────────────────────────────────
  async function loadGmail(days) {
    const token = await Auth.Google.getToken();
    const [label, list] = await Promise.all([
      gmailGet('/users/me/labels/INBOX', token),
      gmailGet(`/users/me/messages?maxResults=20&q=${encodeURIComponent(`in:inbox newer_than:${days}d`)}`, token)
    ]);

    const stats = { unread: label.messagesUnread || 0 };
    if (!(list.messages?.length)) return { stats, emails: [] };

    const details = await Promise.all(
      list.messages.slice(0, 15).map(m =>
        gmailGet(`/users/me/messages/${m.id}?format=metadata&metadataHeaders=From,Subject,Date`, token)
      )
    );

    const emails = details.map(msg => {
      const hdr  = n => (msg.payload?.headers || []).find(h => h.name.toLowerCase() === n.toLowerCase())?.value || '';
      const from = hdr('From').replace(/<[^>]+>/, '').replace(/"/g, '').trim() || hdr('From');
      return {
        id:      msg.id,
        from,
        subject: hdr('Subject') || '(no subject)',
        preview: msg.snippet || '',
        unread:  !!(msg.labelIds?.includes('UNREAD')),
        source:  'gmail',
        raw:     msg
      };
    });

    return { stats, emails };
  }

  // ── OUTLOOK LOAD ──────────────────────────────────────────────────────────
  async function loadOutlook(days) {
    const token = await Auth.Microsoft.getToken();
    const since = new Date(); since.setDate(since.getDate() - parseInt(days));

    const [folder, list] = await Promise.all([
      graphGet('/me/mailFolders/inbox?$select=unreadItemCount,totalItemCount', token),
      graphGet(`/me/mailFolders/inbox/messages?$top=15&$select=from,subject,bodyPreview,isRead,receivedDateTime&$filter=receivedDateTime ge ${since.toISOString()}&$orderby=receivedDateTime desc`, token)
    ]);

    const stats  = { unread: folder.unreadItemCount || 0 };
    const emails = (list.value || []).map(msg => ({
      id:      msg.id,
      from:    msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Unknown',
      subject: msg.subject || '(no subject)',
      preview: msg.bodyPreview || '',
      unread:  !msg.isRead,
      source:  'outlook'
    }));

    return { stats, emails };
  }

  // ── AI SCAN ───────────────────────────────────────────────────────────────
  async function runAiScan(container) {
    if (_scanning || !_emails.length) return;
    _scanning = true;
    const btn = container.querySelector('.email-scan-btn');
    if (btn) { btn.textContent = '◈ SCANNING...'; btn.disabled = true; }

    try {
      const list = _emails.slice(0, 15).map((e, i) =>
        `${i+1}. From: ${e.from} | Subject: ${e.subject} | ${e.preview.slice(0, 80)}`
      ).join('\n');

      const raw = await AI.sendToGemini([{
        role: 'user',
        text: `Analyze these emails from Luke's inbox. Identify which need a reply or action.\n\n${list}\n\nReply ONLY with JSON: [{"index":1,"urgent":true,"reason":"client waiting on quote"},...]\nOnly include ones needing action. No markdown.`
      }]);

      const parsed = parseJSON(raw);
      parsed.forEach(item => {
        const em = _emails[item.index - 1];
        if (em && item.urgent) { em.aiUrgent = true; em.aiReason = item.reason; }
      });
      renderList(container);
    } catch(e) {
      console.warn('[APEX Email] AI scan:', e.message);
    }

    _scanning = false;
    if (btn) { btn.textContent = '◈ AI SCAN'; btn.disabled = false; }
  }

  // ── FULL EMAIL BODY FETCH (for AI actions) ────────────────────────────────
  async function fetchBody(email) {
    if (email.source === 'gmail') {
      const token = await Auth.Google.getToken();
      const msg = await gmailGet(`/users/me/messages/${email.id}?format=full`, token);
      const parts = msg.payload?.parts || [msg.payload];
      for (const p of parts) {
        if (p?.mimeType === 'text/plain' && p?.body?.data) {
          return atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/')).slice(0, 1000);
        }
      }
      return msg.snippet || '';
    } else {
      const token = await Auth.Microsoft.getToken();
      const msg = await graphGet(`/me/messages/${email.id}?$select=body`, token);
      return (msg.body?.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
    }
  }

  // ── RENDER HELPERS ────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function emailCard(e, urgent) {
    const badge = e.aiReason ? `<span class="email-ai-badge" title="${escHtml(e.aiReason)}">AI FLAG</span>` : '';
    return `
      <div class="email-item${e.unread ? ' unread' : ''}${urgent ? ' urgent-item' : ''}" data-id="${e.id}" data-src="${e.source}">
        <div class="email-item-top">
          <div class="email-from">${escHtml(e.from)}</div>
          ${badge}
          ${e.unread ? '<div class="email-unread-dot"></div>' : ''}
        </div>
        <div class="email-subject">${escHtml(e.subject)}</div>
        <div class="email-preview">${escHtml(e.preview.slice(0, 110))}</div>
        <div class="email-item-actions">
          <button class="email-action-btn" data-action="summarize">SUMMARIZE</button>
          <button class="email-action-btn" data-action="reply">DRAFT REPLY</button>
        </div>
      </div>`;
  }

  function renderList(container) {
    const urgent  = _emails.filter(e => e.aiUrgent || isUrgent(e));
    const rest    = _emails.filter(e => !e.aiUrgent && !isUrgent(e));
    const listEl  = container.querySelector('#email-list-body');
    if (!listEl) return;

    listEl.innerHTML = (urgent.length ? `
      <div class="email-section-label urgent-label">⚠ NEEDS ATTENTION (${urgent.length})</div>
      ${urgent.map(e => emailCard(e, true)).join('')}
      <div class="email-section-label" style="margin-top:12px">INBOX</div>
    ` : '<div class="email-section-label">INBOX</div>') +
    (rest.length ? rest.map(e => emailCard(e, false)).join('') : '<div class="email-empty">All clear, Sir.</div>');

    // Bind AI action buttons
    listEl.querySelectorAll('.email-action-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const card  = btn.closest('.email-item');
        const id    = card.dataset.id;
        const src   = card.dataset.src;
        const email = _emails.find(m => m.id === id && m.source === src);
        if (!email) return;

        btn.textContent = '...';
        btn.disabled = true;

        try {
          const body   = await fetchBody(email);
          const action = btn.dataset.action;
          const prompt = action === 'summarize'
            ? `Summarize this email in 2 sentences:\n\n${body}`
            : `Draft a concise, professional reply to this email:\n\n${body}`;
          const reply  = await AI.sendToGemini([{ role: 'user', text: prompt }]);
          document.querySelector('[data-view="chat"]')?.click();
          setTimeout(() => {
            const r = document.getElementById('focus-response');
            if (r) r.textContent = reply;
          }, 60);
        } catch(err) {
          btn.textContent = '✕';
          setTimeout(() => { btn.textContent = action === 'summarize' ? 'SUMMARIZE' : 'DRAFT REPLY'; btn.disabled = false; }, 2000);
          return;
        }
        btn.textContent = action === 'summarize' ? 'SUMMARIZE' : 'DRAFT REPLY';
        btn.disabled = false;
      });
    });
  }

  function renderStats(container, unreadCount) {
    const urgent  = _emails.filter(e => e.aiUrgent || isUrgent(e)).length;
    const statBar = container.querySelector('#email-stat-bar');
    if (!statBar) return;
    statBar.innerHTML = `
      <div class="email-stat-pill unread">${unreadCount} UNREAD</div>
      ${urgent ? `<div class="email-stat-pill urgent">${urgent} URGENT</div>` : ''}
      <button class="email-scan-btn" id="email-scan-btn">◈ AI SCAN</button>`;
    container.querySelector('#email-scan-btn')?.addEventListener('click', () => runAiScan(container));
  }

  // ── MAIN RENDER ───────────────────────────────────────────────────────────
  async function render(container) {
    const googleOk = typeof Auth !== 'undefined' && Auth.Google.isConnected();
    const msOk     = typeof Auth !== 'undefined' && Auth.Microsoft.isConnected();

    // Source toggle
    const hasBoth  = googleOk && msOk;
    if (!googleOk && msOk) _source = 'outlook';
    if (googleOk && !msOk) _source = 'gmail';

    container.innerHTML = `
      <div class="email-dash">
        <div class="email-top-bar">
          <div class="email-source-toggle">
            ${googleOk ? `<button class="email-src-btn${_source==='gmail'?' active':''}" data-src="gmail">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
              GMAIL
            </button>` : ''}
            ${msOk ? `<button class="email-src-btn${_source==='outlook'?' active':''}" data-src="outlook">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
              OUTLOOK
            </button>` : ''}
            ${!googleOk && !msOk ? `<div class="email-not-connected"><span>NOT CONNECTED</span><button class="action-btn primary" id="email-go-settings">OPEN SETTINGS</button></div>` : ''}
          </div>
          <div class="day-filter">
            <button class="day-btn${_days==='3'?' active':''}" data-days="3">3D</button>
            <button class="day-btn${_days==='7'?' active':''}" data-days="7">7D</button>
            <button class="day-btn${_days==='30'?' active':''}" data-days="30">30D</button>
          </div>
        </div>
        <div id="email-stat-bar" class="email-stat-bar">
          <div class="email-loading" style="padding:8px 16px;font-size:0.7rem">LOADING...</div>
        </div>
        <div id="email-list-body" class="email-list-body">
          ${(googleOk || msOk) ? '<div class="email-loading">SCANNING INBOX...</div>' : ''}
        </div>
      </div>`;

    // Bind source toggle
    container.querySelectorAll('.email-src-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _source = btn.dataset.src;
        container.querySelectorAll('.email-src-btn').forEach(b => b.classList.toggle('active', b.dataset.src === _source));
        _emails = [];
        loadEmails(container);
      });
    });

    // Bind day filter
    container.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _days = btn.dataset.days;
        container.querySelectorAll('.day-btn').forEach(b => b.classList.toggle('active', b.dataset.days === _days));
        _emails = [];
        loadEmails(container);
      });
    });

    container.querySelector('#email-go-settings')?.addEventListener('click', () => {
      document.querySelector('[data-view="settings"]')?.click();
    });

    if (googleOk || msOk) loadEmails(container);
  }

  async function loadEmails(container) {
    const googleOk = typeof Auth !== 'undefined' && Auth.Google.isConnected();
    const msOk     = typeof Auth !== 'undefined' && Auth.Microsoft.isConnected();
    let unread = 0;
    _emails = [];

    try {
      if (_source === 'gmail' && googleOk) {
        const { stats, emails } = await loadGmail(_days);
        unread = stats.unread;
        _emails = emails;
      } else if (_source === 'outlook' && msOk) {
        const { stats, emails } = await loadOutlook(_days);
        unread = stats.unread;
        _emails = emails;
      }
    } catch(e) {
      const listEl = container.querySelector('#email-list-body');
      if (listEl) listEl.innerHTML = `<div class="email-loading" style="opacity:0.5">⚠ ${e.message}</div>`;
    }

    renderStats(container, unread);
    renderList(container);
  }

  function init()    { _container = document.getElementById('view-email'); render(_container); }
  function refresh() { if (_container) render(_container); }

  return { init, refresh };
})();
