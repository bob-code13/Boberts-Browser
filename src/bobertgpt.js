// Gemini free-tier integration. No paid fallback.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_BYTES = 12 * 1024 * 1024;
const allowed = new Set(["image/png","image/jpeg","image/webp","application/pdf","text/plain"]);
export function installBobertGPT(fastify) {
  fastify.post("/api/bobertgpt", { bodyLimit: MAX_BYTES }, async (req, reply) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return reply.code(503).send({ error: "BobertGPT isn't configured yet. The administrator must set GEMINI_API_KEY in Azure." });
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 24) return reply.code(400).send({error:"Send 1–24 messages."});
    let size = 0;
    const contents = [];
    for (const message of messages) {
      if (!["user","model"].includes(message?.role) || !Array.isArray(message.parts) || message.parts.length > 6) return reply.code(400).send({error:"Invalid conversation."});
      const parts = [];
      for (const part of message.parts) {
        if (typeof part.text === "string" && part.text.length <= 12000) {
          size += part.text.length; parts.push({text:part.text});
        } else if (part.inlineData && message.role === "user" && allowed.has(part.inlineData.mimeType) && typeof part.inlineData.data === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(part.inlineData.data) && part.inlineData.data.length <= 8_000_000) {
          size += part.inlineData.data.length; parts.push({inlineData:{mimeType:part.inlineData.mimeType,data:part.inlineData.data}});
        } else return reply.code(400).send({error:"Unsupported attachment or message."});
      }
      if (!parts.length) return reply.code(400).send({error:"Empty message."});
      contents.push({role:message.role,parts});
    }
    if (size > 10_000_000) return reply.code(413).send({error:"Conversation is too large. Start a new chat or use smaller files."});
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      let response;
      try {
        response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(MODEL) + ":generateContent", {
          method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
          body:JSON.stringify({contents,generationConfig:{maxOutputTokens:2048}}),signal:controller.signal
        });
      } finally { clearTimeout(timeout); }
      const result = await response.json();
      if (!response.ok) return reply.code(response.status === 429 ? 429 : 502).send({error:response.status === 429 ? "Free AI usage limit reached. Please try again later." : "AI provider error: " + String(result.error?.message || response.status).slice(0,180)});
      const answer = (result.candidates?.[0]?.content?.parts || []).map(p=>p.text || "").join("").trim();
      return {answer:answer || "No text response was generated."};
    } catch { return reply.code(502).send({error:"Could not reach the AI service. Try again."}); }
  });
}
