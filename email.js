const EmailView = (() => {
  const mockData = {
    '3':  { unread: 47,  reply: 12, drafts: 5 },
    '7':  { unread: 124, reply: 38, drafts: 11 },
    '30': { unread: 512, reply: 87, drafts: 23 }
  };

  const mockEmails = [
    { from: 'team@company.com',   subject: 'Q2 Planning — Action Required', preview: 'Please review the attached deck before Thursday...', unread: true },
    { from: 'alerts@github.com',  subject: '[A.P.E.X. v9] PR #12 merged',   preview: 'Pull request merged by lalbanese969...', unread: true },
    { from: 'hr@company.com',     subject: 'Benefits enrollment closes Friday', preview: 'This is a reminder that open enrollment...', unread: false },
    { from: 'client@partner.co',  subject: 'Re: Proposal follow-up',        preview: 'Thanks for sending that over. We had a few...', unread: true },
  ];

  const mockDrafts = [
    { from: 'DRAFT', subject: 'Re: Q2 Planning', preview: 'Thanks for the meeting today. I wanted to follow up on...' },
    { from: 'DRAFT', subject: 'Client check-in', preview: 'Hi, just checking in on the proposal we sent last week...' },
  ];

  let activeDays = '3';

  function renderStats(days) {
    const d = mockData[days];
    return `
      <div class="email-stats">
        <div class="stat-card" title="Unread">
          <span class="stat-num">${d.unread}</span>
          <span class="stat-label">UNREAD</span>
        </div>
        <div class="stat-card" title="Need reply">
          <span class="stat-num">${d.reply}</span>
          <span class="stat-label">NEED REPLY</span>
        </div>
        <div class="stat-card" title="Drafts">
          <span class="stat-num">${d.drafts}</span>
          <span class="stat-label">DRAFTS</span>
        </div>
      </div>`;
  }

  function renderEmails() {
    const items = mockEmails.map(e => `
      <div class="email-item${e.unread ? ' unread' : ''}">
        <div class="email-from">${e.from}</div>
        <div class="email-subject">${e.subject}</div>
        <div class="email-preview">${e.preview}</div>
        <div class="email-item-actions">
          <button class="email-action-btn">SUMMARIZE</button>
          <button class="email-action-btn">DRAFT REPLY</button>
        </div>
      </div>`).join('');

    const drafts = mockDrafts.map(e => `
      <div class="email-item">
        <div class="email-from" style="color:#888">${e.from}</div>
        <div class="email-subject">${e.subject}</div>
        <div class="email-preview">${e.preview}</div>
        <div class="email-item-actions">
          <button class="email-action-btn">REVIEW</button>
          <button class="email-action-btn primary" style="background:#FF6B00;color:#0a0a0a;border:none;font-weight:700;">SEND DRAFT</button>
        </div>
      </div>`).join('');

    return `
      <div class="email-list-wrap">
        <div class="email-list-label">INBOX</div>
        ${items}
        <div class="email-list-label" style="margin-top:16px">DRAFTS</div>
        ${drafts}
      </div>`;
  }

  function render(container, days) {
    container.innerHTML = `
      <div class="view-header">
        <h2>EMAIL</h2>
        <div class="day-filter">
          <button class="day-btn${days === '3'  ? ' active' : ''}" data-days="3">3D</button>
          <button class="day-btn${days === '7'  ? ' active' : ''}" data-days="7">7D</button>
          <button class="day-btn${days === '30' ? ' active' : ''}" data-days="30">30D</button>
        </div>
      </div>
      ${renderStats(days)}
      <div class="email-actions">
        <button class="action-btn primary">&#9654; SCAN EMAILS</button>
        <button class="action-btn">SUMMARIZE ALL</button>
      </div>
      ${renderEmails()}
    `;

    container.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeDays = btn.dataset.days;
        render(container, activeDays);
      });
    });
  }

  function init() {
    const container = document.getElementById('view-email');
    render(container, activeDays);
  }

  return { init };
})();
