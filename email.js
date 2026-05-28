const EmailView = (() => {
  let activeDays = '3';
  let _container = null;

  // ── API HELPERS ────────────────────────────────────────────────────────────
  async function gmailGet(path, token) {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) throw new Error(`Gmail ${r.status}`);
    return r.json();
  }

  async function graphGet(path, token) {
    const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' }
    });
    if (!r.ok) throw new Error(`Graph ${r.status}`);
    return r.json();
  }

  // ── GMAIL FETCH ────────────────────────────────────────────────────────────
  async function loadGmail(days) {
    const token = await Auth.Google.getToken();
    const [label, listData] = await Promise.all([
      gmailGet('/users/me/labels/INBOX', token),
      gmailGet(`/users/me/messages?maxResults=12&q=${encodeURIComponent(`in:inbox newer_than:${days}d`)}`, token)
    ]);

    const stats = {
      unread: label.messagesUnread || 0,
      total:  label.messagesTotal  || 0
    };

    const ids = (listData.messages || []).slice(0, 10).map(m => m.id);
    const details = await Promise.all(ids.map(id =>
      gmailGet(`/users/me/messages/${id}?format=metadata&metadataHeaders=From,Subject`, token)
    ));

    const emails = details.map(msg => {
      const hdr = (n) => (msg.payload?.headers || []).find(h => h.name.toLowerCase() === n.toLowerCase())?.value || '';
      const rawFrom = hdr('From');
      const from = rawFrom.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || rawFrom;
      return {
        id:      msg.id,
        from:    from || 'Unknown',
        subject: hdr('Subject') || '(no subject)',
        preview: msg.snippet || '',
        unread:  !!(msg.labelIds?.includes('UNREAD')),
        source:  'gmail'
      };
    });

    return { stats, emails };
  }

  // ── OUTLOOK FETCH ──────────────────────────────────────────────────────────
  async function loadOutlook(days) {
    const token = await Auth.Microsoft.getToken();
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const [folder, listData] = await Promise.all([
      graphGet('/me/mailFolders/inbox?$select=unreadItemCount,totalItemCount', token),
      graphGet(`/me/mailFolders/inbox/messages?$top=10&$select=from,subject,bodyPreview,isRead&$filter=receivedDateTime ge ${since.toISOString()}&$orderby=receivedDateTime desc`, token)
    ]);

    const stats = {
      unread: folder.unreadItemCount || 0,
      total:  folder.totalItemCount  || 0
    };

    const emails = (listData.value || []).map(msg => ({
      id:      msg.id,
      from:    msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Unknown',
      subject: msg.subject || '(no subject)',
      preview: msg.bodyPreview || '',
      unread:  !msg.isRead,
      source:  'outlook'
    }));

    return { stats, emails };
  }

  // ── RENDER HELPERS ─────────────────────────────────────────────────────────
  function statCards(unread, drafts) {
    return `
      <div class="email-stats">
        <div class="stat-card"><span class="stat-num">${unread}</span><span class="stat-label">UNREAD</span></div>
        <div class="stat-card"><span class="stat-num">${drafts}</span><span class="stat-label">SHOWN</span></div>
      </div>`;
  }

  function emailItem(e) {
    return `
      <div class="email-item${e.unread ? ' unread' : ''}">
        <div class="email-from">${e.source === 'outlook' ? '&#9632; ' : ''}${escHtml(e.from)}</div>
        <div class="email-subject">${escHtml(e.subject)}</div>
        <div class="email-preview">${escHtml(e.preview.slice(0,120))}</div>
        <div class="email-item-actions">
          <button class="email-action-btn" data-action="summarize" data-id="${e.id}" data-src="${e.source}">SUMMARIZE</button>
          <button class="email-action-btn" data-action="reply" data-id="${e.id}" data-src="${e.source}">DRAFT REPLY</button>
        </div>
      </div>`;
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function notConnectedHTML() {
    return `
      <div class="email-not-connected">
        <div class="not-connected-icon">&#9993;</div>
        <div class="not-connected-msg">NO EMAIL CONNECTED</div>
        <div class="not-connected-sub">Connect Google or Microsoft in Settings</div>
        <button class="action-btn primary" id="email-go-settings">OPEN SETTINGS</button>
      </div>`;
  }

  function loadingHTML() {
    return `<div class="email-loading">SCANNING INBOX...</div>`;
  }

  function dayFilterHTML(days) {
    return `
      <div class="view-header">
        <h2>EMAIL</h2>
        <div class="day-filter">
          <button class="day-btn${days==='3'  ?' active':''}" data-days="3">3D</button>
          <button class="day-btn${days==='7'  ?' active':''}" data-days="7">7D</button>
          <button class="day-btn${days==='30' ?' active':''}" data-days="30">30D</button>
        </div>
      </div>`;
  }

  // ── MAIN RENDER ────────────────────────────────────────────────────────────
  async function render(container, days) {
    const googleOk    = typeof Auth !== 'undefined' && Auth.Google.isConnected();
    const microsoftOk = typeof Auth !== 'undefined' && Auth.Microsoft.isConnected();

    if (!googleOk && !microsoftOk) {
      container.innerHTML = dayFilterHTML(days) + notConnectedHTML();
      bindDayFilter(container);
      container.querySelector('#email-go-settings')?.addEventListener('click', () => {
        document.querySelector('[data-view="settings"]')?.click();
      });
      return;
    }

    // Show loading skeleton immediately so UI doesn't feel frozen
    container.innerHTML = dayFilterHTML(days) + loadingHTML();
    bindDayFilter(container);

    let allEmails = [], totalUnread = 0;
    const errors = [];

    if (googleOk) {
      try {
        const { stats, emails } = await loadGmail(days);
        totalUnread += stats.unread;
        allEmails.push(...emails);
      } catch(e) { errors.push('Gmail: ' + e.message); }
    }
    if (microsoftOk) {
      try {
        const { stats, emails } = await loadOutlook(days);
        totalUnread += stats.unread;
        allEmails.push(...emails);
      } catch(e) { errors.push('Outlook: ' + e.message); }
    }

    const listHTML = allEmails.length
      ? allEmails.map(emailItem).join('')
      : '<div class="email-loading" style="opacity:0.5">NO MESSAGES IN THIS PERIOD</div>';

    const errorBanner = errors.length
      ? `<div class="settings-status" style="margin:8px 0;width:100%">⚠ ${errors.join(' | ')}</div>`
      : '';

    container.innerHTML = `
      ${dayFilterHTML(days)}
      ${statCards(totalUnread, allEmails.length)}
      ${errorBanner}
      <div class="email-actions">
        <button class="action-btn primary" id="email-scan">&#9654; REFRESH</button>
      </div>
      <div class="email-list-wrap">
        <div class="email-list-label">INBOX</div>
        ${listHTML}
      </div>`;

    bindDayFilter(container);
    container.querySelector('#email-scan')?.addEventListener('click', () => render(container, activeDays));

    // AI actions
    container.querySelectorAll('.email-action-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const src    = btn.dataset.src;
        const id     = btn.dataset.id;
        btn.textContent = '...';
        btn.disabled = true;
        try {
          let body = '';
          if (src === 'gmail') {
            const token = await Auth.Google.getToken();
            const msg = await gmailGet(`/users/me/messages/${id}?format=full`, token);
            body = extractGmailBody(msg);
          } else {
            const token = await Auth.Microsoft.getToken();
            const msg = await graphGet(`/me/messages/${id}?$select=body,subject,from`, token);
            body = msg.body?.content?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,800) || '';
          }
          const prompt = action === 'summarize'
            ? `Summarize this email in 2-3 sentences:\n\n${body}`
            : `Draft a professional reply to this email in 3-4 sentences:\n\n${body}`;
          const reply = await AI.sendToGemini([{ role: 'user', text: prompt }]);
          // Show response in the chat view
          if (typeof Chat !== 'undefined') {
            document.querySelector('[data-view="chat"]')?.click();
            setTimeout(() => {
              document.getElementById('focus-response').textContent = reply;
            }, 50);
          }
        } catch(e) {
          btn.textContent = '✕ ERROR';
          setTimeout(() => {
            btn.textContent = action === 'summarize' ? 'SUMMARIZE' : 'DRAFT REPLY';
            btn.disabled = false;
          }, 2000);
          return;
        }
        btn.textContent = action === 'summarize' ? 'SUMMARIZE' : 'DRAFT REPLY';
        btn.disabled = false;
      });
    });
  }

  function extractGmailBody(msg) {
    const parts = msg.payload?.parts || [msg.payload];
    for (const p of parts) {
      if (p?.mimeType === 'text/plain' && p?.body?.data) {
        return atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/')).slice(0,800);
      }
    }
    return msg.snippet || '';
  }

  function bindDayFilter(container) {
    container.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeDays = btn.dataset.days;
        render(container, activeDays);
      });
    });
  }

  function init() {
    _container = document.getElementById('view-email');
    render(_container, activeDays);
  }

  function refresh() {
    if (_container) render(_container, activeDays);
  }

  return { init, refresh };
})();
