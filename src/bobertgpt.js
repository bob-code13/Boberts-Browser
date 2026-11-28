import { currentUser } from "./accounts.js";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
const historyDir=join(dirname(process.env.ACCOUNT_DATA_FILE || "/home/boberts-browser/accounts.json"),"gpt-history");
function historyFile(req){return join(historyDir,currentUser(req).id+".json");}
// Gemini free-tier integration. No paid fallback.
const MODEL = process.env.GEMINI_MODEL || "";
let discoveredModel = "";
async function selectModel(key, signal) {
  if (MODEL) return MODEL.replace(/^models\//, "");
  if (discoveredModel) return discoveredModel;
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {headers:{"x-goog-api-key":key},signal});
  if (!response.ok) throw Object.assign(new Error("Model discovery failed"),{status:response.status});
  const result = await response.json();
  const available = (result.models || []).filter(model => model.supportedGenerationMethods?.includes("generateContent")).map(model => model.name.replace(/^models\//, ""));
  const preferred = ["gemini-3.8-flash","gemini-3-flash","gemini-2.5-flash","gemini-2.0-flash"];
  const selected = preferred.find(name => available.includes(name)) || available.find(name => /flash/i.test(name)) || available[0];
  if (!selected) throw Object.assign(new Error("No compatible Gemini models are available for this API key"),{status:404});
  discoveredModel = selected;
  return selected;
}
const MAX_BYTES = 12 * 1024 * 1024;
const allowed = new Set(["image/png","image/jpeg","image/webp","application/pdf","text/plain"]);
export function installBobertGPT(fastify) {
  fastify.get("/api/bobertgpt/history", async (req,reply)=>{
    if(!currentUser(req)) return reply.code(401).send({error:"Sign in required"});
    try{return JSON.parse(readFileSync(historyFile(req),"utf8"));}catch(e){if(e.code==="ENOENT")return {chats:[],memory:""};throw e;}
  });
  fastify.put("/api/bobertgpt/history",{bodyLimit:2000000},async(req,reply)=>{
    if(!currentUser(req))return reply.code(401).send({error:"Sign in required"});
    if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return reply.code(403).send({error:"Invalid origin"});
    const {chats,memory}=req.body||{};
    if(!Array.isArray(chats)||chats.length>50||typeof memory!=="string"||memory.length>4000)return reply.code(400).send({error:"Invalid history"});
    mkdirSync(historyDir,{recursive:true,mode:0o700});
    const file=historyFile(req);writeFileSync(file+".tmp",JSON.stringify({chats,memory}),{mode:0o600});renameSync(file+".tmp",file);
    return {ok:true};
  });
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
      const timeout = setTimeout(() => controller.abort(), 90000);
      let response;
      try {
        const model = await selectModel(key, controller.signal);
        response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
          method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
          body:JSON.stringify({contents,generationConfig:{maxOutputTokens:2048}}),signal:controller.signal
        });
      } finally { clearTimeout(timeout); }
      const result = await response.json();
      if (!response.ok) return reply.code(response.status === 429 ? 429 : 502).send({error:response.status === 429 ? "Free AI usage limit reached. Please try again later." : "AI provider error: " + String(result.error?.message || response.status).slice(0,180)});
      const answer = (result.candidates?.[0]?.content?.parts || []).map(p=>p.text || "").join("").trim();
      return {answer:answer || "No text response was generated."};
    } catch (err) {
      fastify.log.warn({name:err?.name,code:err?.cause?.code,status:err?.status}, "BobertGPT Gemini request failed");
      if (err?.name === "AbortError") return reply.code(504).send({error:"Gemini did not respond within 90 seconds. Try a shorter message or smaller file."});
      if (err?.status === 401 || err?.status === 403) return reply.code(502).send({error:"Google rejected the API key or model access. Check GEMINI_API_KEY in Azure."});
      if (err?.status === 404) return reply.code(502).send({error:"No compatible Gemini model was found for this API key."});
      return reply.code(502).send({error:"Gemini connection failed (" + String(err?.cause?.code || err?.code || err?.name || "unknown").slice(0,40) + "). Check Azure outbound connectivity and logs."});
    }
  });
}
