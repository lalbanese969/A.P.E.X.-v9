const AI = (() => {
  const DEFAULT_MODEL = 'gemini-2.0-flash';

  const BASE_SYSTEM = `You are A.P.E.X. — Automated Personal Executive Assistant. You are a sharp, efficient AI secretary built into a personal dashboard. Be direct and concise. No markdown formatting unless the user asks for it. Get straight to the point.`;

  const geminiKey   = () => localStorage.getItem('apex_gemini_key')   || '';
  const geminiModel = () => localStorage.getItem('apex_gemini_model') || DEFAULT_MODEL;
  const ollamaUrl   = () => localStorage.getItem('apex_ollama_url')   || 'http://localhost:11434';
  const ollamaModel = () => localStorage.getItem('apex_ollama_model') || 'llama3';

  // Build the system prompt — injects people block + any retrieved memory context
  function buildSystem(memoryContext) {
    const people = (typeof Memory !== 'undefined') ? '\n\n' + Memory.buildPeopleBlock() : '';
    const mem    = memoryContext ? `\n\nRELEVANT MEMORIES:\n${memoryContext}` : '';
    return BASE_SYSTEM + people + mem;
  }

  function toGeminiContents(msgs) {
    const out = msgs
      .filter(m => m.text && m.text.trim())
      .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
    while (out.length && out[0].role === 'model') out.shift();
    return out.filter((m, i) => i === 0 || m.role !== out[i - 1].role);
  }

  async function sendToGemini(msgs, systemOverride) {
    const k = geminiKey();
    if (!k) throw new Error('No Gemini API key set — go to Settings to add one.');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent?key=${k}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemOverride || buildSystem() }] },
          contents: toGeminiContents(msgs)
        })
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini.');
    return text;
  }

  // Lightweight single-shot call — used by memory router and listener
  // Always uses Flash (fastest/cheapest); ignores custom model setting
  async function callUtility(promptText) {
    const k = geminiKey();
    if (!k) throw new Error('No Gemini API key.');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${k}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0.1 }
        })
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gemini utility error ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty utility response.');
    return text;
  }

  async function sendToOllama(msgs) {
    const res = await fetch(`${ollamaUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel(),
        messages: [
          { role: 'system', content: buildSystem() },
          ...msgs.filter(m => m.text).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text
          }))
        ],
        stream: false
      })
    });

    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    const data = await res.json();
    return data.message?.content || '[No response from Ollama]';
  }

  // Main entry — passes memory context into the system prompt
  async function send(msgs, memoryContext) {
    return sendToGemini(msgs, buildSystem(memoryContext));
  }

  return { send, sendToGemini, sendToOllama, callUtility };
})();
