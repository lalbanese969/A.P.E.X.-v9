const Memory = (() => {
  const STORE = {
    general: 'apex_brain_general',
    people:  'apex_brain_people',
    user:    'apex_brain_user',
    config:  'apex_brain_config'
  };

  // ── HARDCODED IDENTITY DEFAULTS ──────────────────────────────────────────
  const DEFAULT_USER = {
    name:       'Luke Albanese',
    school:     'RIT — Rochester Institute of Technology, junior',
    location:   'New York, EST timezone',
    health:     'ADHD — compensate by being proactive about reminders and important info',
    address_as: 'Sir'
  };

  const DEFAULT_CONFIG = {
    humor:     8,
    formality: 2,
    traits:    ['witty', 'sharp', 'loyal', 'perceptive', 'a bit sarcastic'],
    notes:     ''
  };

  // ── STORAGE ──────────────────────────────────────────────────────────────
  function load(key)          { return JSON.parse(localStorage.getItem(STORE[key]) || 'null'); }
  function persist(key, data) { localStorage.setItem(STORE[key], JSON.stringify(data)); }

  // Merge stored values with defaults so Luke's profile is always present
  function getGeneral() { return load('general') || []; }
  function getPeople()  { return load('people')  || []; }
  function getUser()    { return { ...DEFAULT_USER,   ...(load('user')   || {}) }; }
  function getConfig()  { return { ...DEFAULT_CONFIG, ...(load('config') || {}) }; }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ── JSON PARSING ─────────────────────────────────────────────────────────
  function parseJSON(raw) {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(clean);
  }

  // ── BIRTHDAY CHECK ───────────────────────────────────────────────────────
  function checkBirthdays() {
    const today = new Date();
    const m = today.getMonth() + 1, d = today.getDate();
    return getPeople()
      .filter(p => { const bd = p.birthdate; return bd && bd.month === m && bd.day === d; })
      .map(p => [p.name.first, p.name.last].filter(Boolean).join(' ') || 'Someone');
  }

  // ── MEMORY SUMMARIES ─────────────────────────────────────────────────────
  function getGeneralSummary() {
    const facts = getGeneral();
    if (!facts.length) return 'None.';
    return facts.slice(-20)
      .map(f => `id:${f.id} [${(f.tags||[]).join(',')||'general'}] ${(f.content||'').slice(0,120)}`)
      .join('\n');
  }

  function getRecentFacts() {
    const facts = getGeneral();
    if (!facts.length) return '';
    return facts.slice(-30).map(f => `- ${f.content}`).join('\n');
  }

  function getPeopleSummary() {
    const people = getPeople();
    if (!people.length) return 'None on file — do NOT invent anyone.';
    return people.map(p => {
      const n = [p.name.first, p.name.last].filter(Boolean).join(' ');
      return `id:${p.id} name:"${n}" rel:${p.relation||'?'}`;
    }).join('\n');
  }

  // ── PEOPLE BLOCK ─────────────────────────────────────────────────────────
  function buildPeopleBlock() {
    const people = getPeople();
    if (!people.length) return 'PEOPLE ON FILE:\nNone on file — do NOT invent anyone.';
    const lines = people.map(p => {
      const n = [p.name.first, p.name.last].filter(Boolean).join(' ');
      const parts = [`${n} (${p.relation||'unknown'})`];
      const bd = p.birthdate;
      if (bd && bd.month && bd.day)
        parts.push(`bday:${String(bd.month).padStart(2,'0')}-${String(bd.day).padStart(2,'0')}`);
      if (p.notes) parts.push(String(p.notes).slice(0, 100));
      return parts.join(' | ');
    });
    return 'PEOPLE ON FILE:\n' + lines.join('\n');
  }

  // ── PERSONA BLOCK ─────────────────────────────────────────────────────────
  function buildPersonaBlock() {
    const cfg = getConfig();
    const h = cfg.humor, f = cfg.formality;
    const humorLine =
      h >= 8 ? 'high — banter freely, sarcasm welcome, make it fun' :
      h >= 5 ? 'moderate — natural wit, read the room' :
               'low — minimal jokes, keep it on-task';
    const formalLine =
      f <= 3 ? 'casual — punchy, direct, conversational' :
      f <= 6 ? 'balanced — professional but approachable' :
               'formal — polished and structured';

    return `APEX IDENTITY:
You are A.P.E.X. (Automated Personal Executive Assistant) — Jarvis for real life.
Always address the user as "${getUser().address_as}".
Humor: ${h}/10 — ${humorLine}.
Formality: ${f}/10 — ${formalLine}.
Core traits: ${(cfg.traits || []).join(', ')}.
Style: Short and punchy. Never over-explain. Never waste words. No unsolicited bullet points or lists. No "Certainly!" or "Of course!" or "Great question!" — just answer. No markdown unless explicitly asked.${cfg.notes ? '\nCurrent directive: ' + cfg.notes : ''}
Personality update: if the user asks you to change your tone or style, naturally comply AND append [APEX_CONFIG:{"humor":N,"formality":N}] at the very end of your reply (it will be stripped before display).`;
  }

  // ── USER PROFILE BLOCK ────────────────────────────────────────────────────
  function buildUserBlock() {
    const u = getUser();
    return `ABOUT ${(u.name || 'YOUR USER').toUpperCase().split(' ')[0]}:
Full name: ${u.name}
School: ${u.school}
Location: ${u.location}
Health note: ${u.health}`;
  }

  // ── FULL SYSTEM PROMPT ────────────────────────────────────────────────────
  // Called by AI.buildSystem() — builds every prompt fresh with full context.
  function buildFullSystem(memoryContext) {
    const parts = [
      buildPersonaBlock(),
      buildUserBlock(),
      buildPeopleBlock(),
    ];
    const recent = getRecentFacts();
    if (recent) parts.push(`WHAT I REMEMBER:\n${recent}`);
    if (memoryContext) parts.push(`RELEVANT CONTEXT:\n${memoryContext}`);
    return parts.join('\n\n');
  }

  // ── PERSONA TAG PROCESSOR ─────────────────────────────────────────────────
  // Call this on every APEX reply before displaying. Strips hidden config tags
  // and applies any personality update APEX embedded.
  function processReply(text) {
    const match = text.match(/\[APEX_CONFIG:(\{[^}]*\})\]/);
    if (match) {
      try {
        const update = JSON.parse(match[1]);
        const cfg = getConfig();
        if (typeof update.humor === 'number')
          cfg.humor = Math.min(10, Math.max(1, Math.round(update.humor)));
        if (typeof update.formality === 'number')
          cfg.formality = Math.min(10, Math.max(1, Math.round(update.formality)));
        persist('config', cfg);
      } catch {}
      return text.replace(/\[APEX_CONFIG:\{[^}]*\}\]\s*/g, '').trim();
    }
    return text;
  }

  // ── TODAY CONTEXT (for startup briefing) ─────────────────────────────────
  async function fetchTodayContext() {
    if (typeof Auth === 'undefined') return '';
    const parts = [];
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);

    if (Auth.Google.isConnected()) {
      try {
        const token = await Auth.Google.getToken();
        const [calRes, labelRes, listRes] = await Promise.all([
          fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${todayStart.toISOString()}&timeMax=${todayEnd.toISOString()}&orderBy=startTime&singleEvents=true&maxResults=10`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread+in:inbox', { headers: { Authorization: `Bearer ${token}` } })
        ]);

        if (calRes.ok) {
          const calData = await calRes.json();
          const evs = (calData.items || []).filter(e => e.status !== 'cancelled');
          if (evs.length) {
            const list = evs.map(e => {
              const t = e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}) : 'all day';
              return `${t} ${e.summary}`;
            }).join(', ');
            parts.push(`TODAY'S EVENTS: ${list}`);
          } else {
            parts.push('TODAY\'S EVENTS: nothing scheduled');
          }
        }

        if (labelRes.ok) {
          const lData = await labelRes.json();
          parts.push(`UNREAD EMAILS: ${lData.messagesUnread || 0}`);
        }

        if (listRes.ok) {
          const lRes = await listRes.json();
          if (lRes.messages?.length) {
            const details = await Promise.all(lRes.messages.slice(0,4).map(m =>
              fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From,Subject`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
            ));
            const summaries = details.map(msg => {
              const hdr = n => (msg.payload?.headers||[]).find(h=>h.name===n)?.value||'';
              return `"${hdr('Subject')}" from ${hdr('From').replace(/<[^>]+>/,'').trim()}`;
            }).join('; ');
            parts.push(`TOP UNREAD: ${summaries}`);
          }
        }
      } catch {}
    }

    return parts.join('\n');
  }

  // ── STARTUP BRIEFING ──────────────────────────────────────────────────────
  // Fired immediately on app load — scans calendar + email for a real briefing.
  let _greetingPromise = null;

  function prewarmGreeting() {
    if (_greetingPromise) return _greetingPromise;

    const hour   = new Date().getHours();
    const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const name   = getUser().address_as;
    const bdays  = checkBirthdays();
    const bdNote = bdays.length ? `\nNOTE: Today is ${bdays.join(' and ')}'s birthday.` : '';

    _greetingPromise = fetchTodayContext().catch(() => '').then(context => {
      const hasContext = !!context.trim();

      // No data available — skip briefing, just give a plain greeting
      if (!hasContext && !bdays.length) {
        const plain = `Generate a brief ${period} greeting for ${name}.
Rules: 1-2 sentences. Jarvis-style opener + offer to help. Do NOT mention any events, emails, or specific data — you have none. Address as "${name}". No markdown.`;
        return AI.sendToGemini([{ role: 'user', text: plain }], buildPersonaBlock())
          .then(t => processReply(t));
      }

      // Real data available — brief strictly on what's in it
      const prompt = `You are APEX, Luke's personal secretary. Generate his ${period} briefing.
${hasContext ? `\nTODAY'S DATA (the ONLY source of facts — do NOT invent anything not listed here):\n${context}` : ''}${bdNote}

Rules:
- NEVER invent events, emails, names, or times that are not in TODAY'S DATA above.
- If TODAY'S DATA is empty or missing, do NOT mention any events or emails at all.
- Max 2-3 sentences. Be specific only with data shown above.
- Jarvis-style, punchy. Address as "${name}". No markdown.`;

      return AI.sendToGemini([{ role: 'user', text: prompt }], buildPersonaBlock())
        .then(t => processReply(t));
    }).catch(() => {
      const f = { morning: `Morning, ${name}. What are we dealing with today?`, afternoon: `Afternoon, ${name}. What do you need?`, evening: `Evening, ${name}. Ready when you are.` };
      return f[period];
    });

    return _greetingPromise;
  }

  // ── SCHEMA HELPERS ───────────────────────────────────────────────────────
  function parseBirthdate(bd) {
    if (!bd) return { month: null, day: null, year: null };
    if (typeof bd === 'string') {
      const p = bd.split('-');
      return { month: parseInt(p[0])||null, day: parseInt(p[1])||null, year: parseInt(p[2])||null };
    }
    return bd;
  }

  // ── APPLY MEMORY OPERATIONS ──────────────────────────────────────────────
  function applyOps(ops) {
    const general = getGeneral();
    const people  = getPeople();
    let gDirty = false, pDirty = false;
    const now = Date.now();

    for (const op of ops) {
      if (!op.type) continue;

      if (op.type === 'general' && op.content) {
        general.push({ id: uid(), content: op.content, tags: op.tags||[], type: 'learned', created: now, updated: now });
        if (general.length > 500) general.splice(0, general.length - 500);
        gDirty = true;

      } else if (op.type === 'person_new' && op.name) {
        const parts = op.name.split(' ');
        people.push({
          id: uid(),
          name: { first: parts[0]||'', last: parts.slice(1).join(' ')||'' },
          nicknames: [],
          relation: op.relation || op.relationship || '',
          relational_aliases: [],
          emails: [],
          birthdate: parseBirthdate(op.birthday || null),
          hobbies: [], interests: [], gift_ideas: [],
          notes: op.notes || '',
          created: now, updated: now
        });
        pDirty = true;

      } else if (op.type === 'person_update' && op.id) {
        const p = people.find(x => x.id === op.id);
        if (p && op.updates) {
          for (const [k, v] of Object.entries(op.updates)) {
            p[k] = (Array.isArray(p[k]) && Array.isArray(v))
              ? [...new Set([...p[k], ...v])]
              : v;
          }
          p.updated = now;
          pDirty = true;
        }
      }
    }

    if (gDirty) persist('general', general);
    if (pDirty) persist('people', people);
  }

  // ── ROUTER PROMPT ────────────────────────────────────────────────────────
  function buildRouterPrompt(msg) {
    return `You are a memory router for APEX, an AI assistant.

EXISTING MEMORIES:
${getGeneralSummary()}

KNOWN PEOPLE:
${getPeopleSummary()}

USER MESSAGE: "${msg.replace(/"/g, "'")}"

Reply with ONLY valid JSON, no markdown:
{"relevant":[],"save":[],"people":{"matched":[],"ambiguous":[],"new":[]}}

- "relevant": IDs of existing memories useful for answering this. Empty if none.
- "save": facts explicitly stated by the user worth saving [{content,tags}]. Empty if none.
- "people.matched": IDs of known people clearly referenced.
- "people.ambiguous": names where 2+ people could match.
- "people.new": names of people never seen before.
If nothing applies return the empty template exactly.`;
  }

  // ── LISTENER PROMPT ──────────────────────────────────────────────────────
  function buildListenerPrompt(userMsg, apexMsg) {
    return `You are a memory extractor for APEX.

USER: ${userMsg.replace(/\n/g, ' ')}
APEX: ${apexMsg.replace(/\n/g, ' ')}

EXISTING PEOPLE:
${getPeopleSummary()}

Reply with ONLY a valid JSON array, no markdown.
Each element: one of these types:
  {"type":"general","content":"concise fact under 200 chars","tags":["tag"]}
  {"type":"person_new","name":"Full Name","relation":"friend","birthday":"MM-DD or null","notes":"detail"}
  {"type":"person_update","id":"existingId","updates":{"notes":"new note","hobbies":["hobby"]}}

Rules:
- Only extract facts Luke stated about himself, his preferences, plans, or named people.
- Do NOT extract what APEX said, general knowledge, or transient conversation.
- Arrays in updates are unioned, never replaced.
- If nothing worth saving: []`;
  }

  // ── ROUTER (Step 1 — runs before main AI reply) ──────────────────────────
  async function router(userMessage) {
    try {
      const raw    = await AI.callUtility(buildRouterPrompt(userMessage));
      const result = parseJSON(raw);

      if (Array.isArray(result.save) && result.save.length) {
        const general = getGeneral();
        const now = Date.now();
        result.save.forEach(item => {
          if (item.content) general.push({
            id: uid(), content: item.content, tags: item.tags||[],
            type: 'saved', created: now, updated: now
          });
        });
        persist('general', general);
      }
      return result;
    } catch {
      return null;
    }
  }

  // ── LISTENER (Step 3 — fire-and-forget after reply) ──────────────────────
  async function _listener(userMessage, apexReply) {
    try {
      const raw = await AI.callUtility(buildListenerPrompt(userMessage, apexReply));
      const ops = parseJSON(raw);
      if (Array.isArray(ops) && ops.length) applyOps(ops);
    } catch { /* silent */ }
  }

  function runListener(userMessage, apexReply) {
    _listener(userMessage, apexReply).catch(() => {});
  }

  // ── RETRIEVAL ─────────────────────────────────────────────────────────────
  function getFactsById(ids) {
    return getGeneral().filter(f => ids.includes(f.id));
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  function init() {
    return checkBirthdays();
  }

  return {
    init, router, runListener, processReply, prewarmGreeting, parseJSON,
    buildFullSystem, buildPersonaBlock, buildPeopleBlock,
    getRecentFacts, getFactsById,
    getGeneral, getPeople, getUser, getConfig, applyOps
  };
})();
