const Memory = (() => {
  const STORE = {
    general: 'apex_brain_general',
    people:  'apex_brain_people',
    user:    'apex_brain_user',
    config:  'apex_brain_config'
  };

  // ── STORAGE ──────────────────────────────────────────────────────────────
  function load(key)         { return JSON.parse(localStorage.getItem(STORE[key]) || 'null'); }
  function persist(key, data){ localStorage.setItem(STORE[key], JSON.stringify(data)); }

  function getGeneral() { return load('general') || []; }
  function getPeople()  { return load('people')  || []; }
  function getUser()    { return load('user')     || {}; }
  function getConfig()  { return load('config')   || { humor: 5, formality: 5, traits: [], notes: '' }; }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ── JSON PARSING (handles ```json fences Gemini sometimes adds) ──────────
  function parseJSON(raw) {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();
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

  // ── COMPACT SUMMARIES for Gemini prompts ────────────────────────────────
  function getGeneralSummary() {
    const facts = getGeneral();
    if (!facts.length) return 'None.';
    return facts.slice(-20)
      .map(f => `[${(f.tags||[]).join(',')||'general'}] ${(f.content||'').slice(0,120)}`)
      .join('\n');
  }

  function getPeopleSummary() {
    const people = getPeople();
    if (!people.length) return 'None on file — do NOT invent anyone.';
    return people.map(p => {
      const n = [p.name.first, p.name.last].filter(Boolean).join(' ');
      return `id:${p.id} name:"${n}" rel:${p.relation||'?'}`;
    }).join('\n');
  }

  // ── PEOPLE BLOCK injected into every system prompt ───────────────────────
  function buildPeopleBlock() {
    const people = getPeople();
    if (!people.length) return 'PEOPLE ON FILE:\nNone on file — do NOT invent anyone.';
    const lines = people.map(p => {
      const n = [p.name.first, p.name.last].filter(Boolean).join(' ');
      const parts = [`${n} (${p.relation||'unknown'})`];
      const bd = p.birthdate;
      if (bd && bd.month && bd.day)
        parts.push(`bday:${String(bd.month).padStart(2,'0')}-${String(bd.day).padStart(2,'0')}`);
      if (p.notes) parts.push(String(p.notes).slice(0,100));
      return parts.join(' | ');
    });
    return 'PEOPLE ON FILE:\n' + lines.join('\n');
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
        general.push({ id: uid(), content: op.content, tags: op.tags||[], type:'learned', created:now, updated:now });
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
          birthdate: parseBirthdate(op.birthday||null),
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

  // ── PROMPT BUILDERS ──────────────────────────────────────────────────────
  function buildRouterPrompt(msg) {
    return `You are a memory router for an AI assistant. Analyze the user message.

EXISTING MEMORY SUMMARIES:
${getGeneralSummary()}

KNOWN PEOPLE:
${getPeopleSummary()}

USER MESSAGE: "${msg.replace(/"/g,"'")}"

Reply with ONLY valid JSON, no markdown, no explanation:
{"relevant":[],"save":[],"people":{"matched":[],"ambiguous":[],"new":[]}}

Rules:
- "relevant": IDs of existing memories useful for answering this. Empty array if none.
- "save": facts the user explicitly stated worth saving [{content,tags}]. Empty array if none.
- "people": only if a person is clearly mentioned. Empty arrays otherwise.
If nothing applies return the empty template above exactly.`;
  }

  function buildListenerPrompt(userMsg, apexMsg) {
    return `You are a memory extractor. Extract facts worth remembering from this exchange.

USER: ${userMsg.replace(/\n/g,' ')}
ASSISTANT: ${apexMsg.replace(/\n/g,' ')}

EXISTING PEOPLE:
${getPeopleSummary()}

Reply with ONLY a valid JSON array, no markdown.
Each element must be one of:
  {"type":"general","content":"concise fact under 200 chars","tags":["tag1"]}
  {"type":"person_new","name":"Full Name","relation":"friend","birthday":"MM-DD or null","notes":"detail"}
  {"type":"person_update","id":"existingId","updates":{"notes":"new note","hobbies":["hobby"]}}

Rules:
- Only extract facts the user stated about themselves, preferences, plans, or named people.
- Do NOT extract general knowledge or anything the assistant said.
- Arrays in person_update.updates are unioned, not replaced.
- If nothing worth saving: []`;
  }

  // ── PIPELINE STEP 1: ROUTER (blocks before main reply) ───────────────────
  async function router(userMessage) {
    try {
      const raw = await AI.callUtility(buildRouterPrompt(userMessage));
      const result = parseJSON(raw);

      // Immediately persist anything the router flagged as explicit saves
      if (Array.isArray(result.save) && result.save.length) {
        const general = getGeneral();
        const now = Date.now();
        result.save.forEach(item => {
          if (item.content) general.push({ id:uid(), content:item.content, tags:item.tags||[], type:'saved', created:now, updated:now });
        });
        persist('general', general);
      }
      return result;
    } catch {
      return null;
    }
  }

  // ── PIPELINE STEP 2: LISTENER (fire-and-forget after reply) ─────────────
  async function listener(userMessage, apexReply) {
    try {
      const raw = await AI.callUtility(buildListenerPrompt(userMessage, apexReply));
      const ops = parseJSON(raw);
      if (Array.isArray(ops) && ops.length) applyOps(ops);
    } catch { /* silent */ }
  }

  function runListener(userMessage, apexReply) {
    listener(userMessage, apexReply).catch(() => {});
  }

  // ── RETRIEVAL ────────────────────────────────────────────────────────────
  function getFactsById(ids) {
    return getGeneral().filter(f => ids.includes(f.id));
  }

  // ── INIT (called from app.js) ────────────────────────────────────────────
  function init() {
    return checkBirthdays(); // returns [] or string[] of names with birthdays today
  }

  return {
    init, router, runListener,
    buildPeopleBlock, getFactsById,
    getGeneral, getPeople, getUser, getConfig,
    applyOps
  };
})();
