import { createHmac, timingSafeEqual, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ADMIN_EMAIL = "rilanjia0001@mymail.lausd.net";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const configured = ADMIN_PASSWORD.length >= 12 && SESSION_SECRET.length >= 32;
const cookieName = "bb_session";
const attempts = new Map();
const sessionLifetime = 4 * 60 * 60 * 1000; // Require sign-in again after four hours.
const idleTimeout = 30 * 60 * 1000; // Expire inactive sessions after 30 minutes.
const presenceWindow = 2 * 60 * 1000; // Active browser heartbeat window.
let maxConcurrentPeople = 5;
const activeSessions = new Map(); // One in-memory entry per signed-in browser session.
const dataFile = process.env.ACCOUNT_DATA_FILE || "/home/boberts-browser/accounts.json";
let db = { users: [], usage: {}, activity: [] };
try {
  db = JSON.parse(readFileSync(dataFile, "utf8"));
  if (!Array.isArray(db.users) || typeof db.usage !== "object" || !db.usage) throw new Error("Invalid account data");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!Array.isArray(db.activity)) db.activity = [];
if(Number.isInteger(db.maxConcurrentPeople)&&db.maxConcurrentPeople>=1&&db.maxConcurrentPeople<=10)maxConcurrentPeople=db.maxConcurrentPeople;
function saveDb() {
  mkdirSync(dirname(dataFile), { recursive: true });
  const temp = dataFile + ".tmp";
  writeFileSync(temp, JSON.stringify(db), { mode: 0o600 });
  renameSync(temp, dataFile);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function cookies(header = "") {
  return Object.fromEntries(header.split(";").map((piece) => {
    const index = piece.indexOf("=");
    return index < 0 ? ["", ""] : [piece.slice(0, index).trim(), piece.slice(index + 1).trim()];
  }));
}
function signed(value) {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}
export function currentUser(req) {
  if (!configured) return null;
  const token = cookies(req.headers.cookie)[cookieName];
  if (!token) return null;
  const [expiry, id, nonce, signature] = token.split(".");
  if (!expiry || !id || !nonce || !signature || !/^\d+$/.test(expiry) || !/^(admin|[a-f0-9]{32})$/.test(id) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  if (Number(expiry) <= Date.now()) return null;
  const expected = Buffer.from(signed(expiry + "." + id + "." + nonce), "hex");
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null;
  const session = activeSessions.get(nonce);
  if (!session || session.id !== id || session.expires !== Number(expiry) || Date.now() - session.lastSeen > idleTimeout) {
    activeSessions.delete(nonce);
    return null;
  }
  if (id === "admin") return { id, name: "Robert Ilanjian", email: ADMIN_EMAIL, admin: true };
  const user = db.users.find((item) => item.id === id);
  return user ? { id, name: user.name, email: user.email, admin: false } : null;
}
export function authenticated(req) { return !!currentUser(req); }
function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}
function cookieFor(id) {
  const expires = Date.now() + sessionLifetime;
  const nonce = randomBytes(16).toString("hex");
  const value = expires + "." + id + "." + nonce;
  activeSessions.set(nonce, { id, expires, lastSeen: Date.now() });
  return cookieName + "=" + value + "." + signed(value) + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=14400";
}
function sessionNonce(req) {
  return cookies(req.headers.cookie)[cookieName]?.split(".")[2];
}
function pruneSessions() {
  const now = Date.now();
  for (const [nonce, session] of activeSessions) {
    if (session.expires <= now || now - session.lastSeen > idleTimeout ||
        (session.id !== "admin" && !db.users.some((user) => user.id === session.id))) {
      activeSessions.delete(nonce);
    }
  }
}
function activePeople() {
  pruneSessions();
  const now = Date.now();
  return new Set([...activeSessions.values()]
    .filter((session) => now - session.lastSeen < presenceWindow)
    .map((session) => session.id));
}
function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString("hex");
}
function validOrigin(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
function loginPage(message = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bobert's Browser — Web Browsing &amp; AI Assistant</title><meta name="description" content="Explore Bobert's Browser, a web-based browser featuring tabbed browsing, bookmarks, and BobertGPT AI assistance. Sign in to access your account."><link rel="canonical" href="https://boberts-browser-bfdecmemfbfaf8aw.canadacentral-01.azurewebsites.net/login"><meta property="og:type" content="website"><meta property="og:site_name" content="Bobert's Browser"><meta property="og:title" content="Bobert's Browser — Web Browsing &amp; AI Assistant"><meta property="og:description" content="Explore Bobert's Browser, a web-based browser featuring tabbed browsing, bookmarks, and BobertGPT AI assistance. Sign in to access your account."><meta property="og:url" content="https://boberts-browser-bfdecmemfbfaf8aw.canadacentral-01.azurewebsites.net/login"><meta property="og:image" content="https://boberts-browser-bfdecmemfbfaf8aw.canadacentral-01.azurewebsites.net/boberts-logo.png"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="Bobert's Browser — Web Browsing &amp; AI Assistant"><meta name="twitter:description" content="Explore Bobert's Browser, a web-based browser featuring tabbed browsing, bookmarks, and BobertGPT AI assistance. Sign in to access your account."><meta name="twitter:image" content="https://boberts-browser-bfdecmemfbfaf8aw.canadacentral-01.azurewebsites.net/boberts-logo.png"><link rel="icon" type="image/png" href="/boberts-logo.png?v=2"><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px 18px;background:#f7f9fc;font:16px system-ui,Arial,sans-serif;color:#202124}main{width:min(410px,100%);margin:auto;background:white;padding:36px;border:1px solid #e3e7ef;border-radius:18px;box-shadow:0 12px 36px #20212410;text-align:center}h1{font-size:26px;margin:0 0 8px}.sub{color:#5f6368;margin:0 0 24px}label{display:block;text-align:left;font-size:14px;font-weight:600;margin:16px 0 7px}input{width:100%;padding:13px;border:1px solid #ccd1d9;border-radius:9px;font:inherit}button{margin-top:24px;width:100%;background:#1967d2;border:0;color:white;padding:14px;border-radius:9px;font:inherit;font-weight:600;cursor:pointer}.error{color:#b3261e;font-size:14px}.logo{width:80px;height:80px;object-fit:contain;margin:0 auto 14px}</style></head><body><main><img class="logo" src="/boberts-logo.png" alt="BB logo"><h1>Bobert's Browser</h1><p class="sub">Sign in to continue</p>${message ? '<p class="error" role="alert">' + escapeHtml(message) + '</p>' : ''}<form method="post" action="/login"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in</button></form></main></body></html>`;
}
function isOnline(id) {
  const last = db.usage[id]?.last || 0;
  return last > 0 && Date.now() - last >= 0 && Date.now() - last < 90000;
}
function dashboard(message = "") {
  const rows = db.users.map((u) => `<tr><td><button type="button" class="user-history" data-user-id="${u.id}" data-user-name="${escapeHtml(u.name)}">${escapeHtml(u.name)}</button></td><td>${escapeHtml(u.email)}</td><td><span class="status" data-user-id="${u.id}"><span class="status-dot ${isOnline(u.id) ? "online" : ""}"></span><span class="status-text">${isOnline(u.id) ? "Online" : "Offline"}</span></span></td><td class="usage-hours" data-user-id="${u.id}">${((db.usage[u.id]?.seconds || 0) / 3600).toFixed(2)} hours</td><td><form method="post" action="/admin/delete" onsubmit="return confirm('Delete this account?')"><input type="hidden" name="id" value="${u.id}"><button class="danger">Delete</button></form><button type="button" class="danger reset-trigger" data-reset-id="${u.id}" data-reset-name="${escapeHtml(u.name)}">Reset password</button></td></tr>`).join("");
  const adminHours = ((db.usage.admin?.seconds || 0) / 3600).toFixed(2);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Dashboard — Bobert's Browser</title><link rel="icon" type="image/png" href="/boberts-logo.png?v=2"><style>
  *{box-sizing:border-box}body{margin:0;background:#f6f8fc;color:#202124;font:15px system-ui,Arial,sans-serif}main{max-width:1050px;margin:40px auto;padding:0 20px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}h1{font-size:30px}h2{font-size:20px}section{background:white;padding:24px;border-radius:16px;border:1px solid #e2e5ed;margin:22px 0;overflow:auto}input{display:block;width:100%;padding:12px;border:1px solid #cbd0db;border-radius:8px;margin:6px 0 16px;font:inherit}label{font-weight:600}button,.button{display:inline-block;background:#1967d2;color:white;border:0;border-radius:8px;padding:11px 16px;text-decoration:none;font:inherit;cursor:pointer}.danger{background:#b3261e}table{width:100%;border-collapse:collapse;min-width:560px}td,th{text-align:left;padding:12px;border-bottom:1px solid #e8ebf1}.status{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:#657182;white-space:nowrap}.status-dot{width:10px;height:10px;display:inline-block;border-radius:50%;background:#9ca3af;box-shadow:0 0 0 3px #f1f3f5}.status-dot.online{background:#20a451;box-shadow:0 0 0 3px #dcfce7}.status:has(.online){color:#15803d}p{color:#5f6368}.message{color:#b3261e}.logo{width:45px;vertical-align:middle;margin-right:12px}.summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:22px 0 12px}.metric{background:#fff;border:1px solid #e2e5ed;border-radius:16px;padding:19px 22px}.metric-label{display:block;color:#647084;font-size:13px;font-weight:600;margin-bottom:10px}.metric-value{font-size:27px;font-weight:750;color:#182b49;line-height:1.2}.metric-note{display:block;color:#647084;font-size:12px;margin-top:8px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.reset-trigger{display:block;margin-top:7px;font-size:13px;font-weight:600}.user-history{background:transparent;color:#1967d2;padding:4px 0;text-align:left;font-weight:650}.user-history:hover{text-decoration:underline}.history-value{max-width:440px;overflow-wrap:anywhere}.history-dialog{border:1px solid #d8dfeb;border-radius:16px;padding:26px;width:min(850px,calc(100vw - 32px));max-height:80vh;overflow:auto;box-shadow:0 20px 70px #172a4b35}.history-dialog::backdrop{background:#152a4670}.history-dialog table{min-width:480px}.history-dialog .close-history{float:right;background:#e8edf5;color:#24354e}.history-value{max-width:440px;overflow-wrap:anywhere}.reset-dialog{border:1px solid #d8dfeb;border-radius:16px;padding:26px;width:min(440px,calc(100vw - 32px));box-shadow:0 20px 70px #172a4b35}.reset-dialog::backdrop{background:#152a4670}.reset-dialog form{margin-top:15px}.reset-dialog .cancel{background:#e8edf5;color:#24354e;margin-left:8px}.add-account-panel{padding:0;overflow:hidden}.add-account-panel summary{list-style:none;cursor:pointer;padding:19px 24px;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:space-between}.add-account-panel summary::-webkit-details-marker{display:none}.add-account-panel summary:after{content:"+";font-size:24px;color:#1967d2}.add-account-panel[open] summary:after{content:"−"}.add-account-panel form{padding:0 24px 24px}.add-account-panel input{max-width:680px}.add-account-panel label{display:block;margin-top:10px}@media(max-width:700px){main{margin:20px auto}.summary-grid{grid-template-columns:1fr}.metric{padding:16px 18px}section{padding:18px}.add-account-panel summary{padding:18px}.add-account-panel form{padding:0 18px 18px}}</style></head><body><main><header><h1><img class="logo" src="/boberts-logo.png" alt="">Admin Dashboard</h1><a class="button" href="/">Back to Browser</a></header><p>Monitor account activity and manage access to Bobert's Browser.</p>${message ? '<p class="message">' + escapeHtml(message) + '</p>' : ''}
<div class="summary-grid" aria-label="Browser usage overview">
  <div class="metric"><span class="metric-label">People online</span><div class="metric-value" id="online-count">${activePeople().size} / ${maxConcurrentPeople}</div><span class="metric-note">Maximum ${maxConcurrentPeople} active accounts</span></div>
  <div class="metric"><span class="metric-label">Your usage</span><div class="metric-value" id="admin-usage">${adminHours} hours</div><span class="metric-note">Admin browsing time</span></div>
  <div class="metric"><span class="metric-label">Registered accounts</span><div class="metric-value">${db.users.length}</div><span class="metric-note">People with browser access</span></div>
</div>
<section><h2>Capacity</h2><form method="post" action="/admin/capacity"><label>Concurrent accounts (1–10)<input type="number" name="limit" min="1" max="10" value="${maxConcurrentPeople}" required></label><button>Save limit</button></form><p>Server process memory: ${Math.round(process.memoryUsage().rss/1048576)} MB</p></section><section><div class="section-heading"><h2>Account activity</h2><span class="metric-note">Automatically updates every 30 seconds</span></div><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Usage</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No accounts yet.</td></tr>'}</tbody></table></section>
<dialog id="history-dialog" class="history-dialog"><button type="button" class="close-history" id="history-close">Close</button><h2 id="history-title">Account history</h2><p>Searches entered in the browser and websites opened through its navigation controls. In-page clicks and searches inside external websites may not appear.</p><table><thead><tr><th>Time</th><th>Type</th><th>Search or website</th></tr></thead><tbody id="history-body"></tbody></table></dialog><dialog id="reset-dialog" class="reset-dialog"><h2>Reset password</h2><p id="reset-name"></p><form method="post" action="/admin/reset-password"><input type="hidden" id="reset-id" name="id"><label for="reset-new-password">New password (8–256 characters)</label><input id="reset-new-password" type="password" name="password" minlength="8" maxlength="256" autocomplete="new-password" required><button type="submit">Save password</button><button type="button" class="cancel" id="reset-cancel">Cancel</button></form></dialog><section class="add-account-panel"><details><summary>Add an account</summary><form action="/admin/add" method="post"><label for="name">Full name</label><input id="name" name="name" maxlength="80" required><label for="email">Email</label><input id="email" type="email" name="email" maxlength="200" required><label for="password">Password (8+ characters)</label><input id="password" type="password" name="password" minlength="8" maxlength="256" autocomplete="new-password" required><button type="submit">Create account</button></form></details></section></main><script>
  const historyDialog = document.getElementById("history-dialog");
  document.getElementById("history-close").addEventListener("click", () => historyDialog.close());
  document.querySelectorAll(".user-history").forEach(button => button.addEventListener("click", async () => {
    document.getElementById("history-title").textContent = button.dataset.userName + " — Activity history";
    const body = document.getElementById("history-body");
    body.replaceChildren();
    const loading = document.createElement("tr"); loading.innerHTML = '<td colspan="3">Loading...</td>'; body.append(loading);
    historyDialog.showModal();
    try {
      const response = await fetch("/admin/history?id=" + encodeURIComponent(button.dataset.userId), {cache:"no-store"});
      if (!response.ok) throw new Error("Could not load history.");
      const events = await response.json();
      body.replaceChildren();
      if (!events.length) { const tr=document.createElement("tr");const td=document.createElement("td");td.colSpan=3;td.textContent="No activity recorded for this user yet.";tr.append(td);body.append(tr); }
      for (const event of events) {
        const tr=document.createElement("tr");
        for (const value of [new Date(event.at).toLocaleString(),event.type === "search" ? "Search" : "Website",event.value]) {
          const td=document.createElement("td");td.textContent=value;tr.append(td);
        }
        body.append(tr);
      }
    } catch(error) {body.replaceChildren();const tr=document.createElement("tr");const td=document.createElement("td");td.colSpan=3;td.textContent=error.message;tr.append(td);body.append(tr);}
  }));
  const resetDialog = document.getElementById("reset-dialog");
  document.querySelectorAll(".reset-trigger").forEach(button => button.addEventListener("click", () => {
    document.getElementById("reset-id").value = button.dataset.resetId;
    document.getElementById("reset-name").textContent = "Set a new password for " + button.dataset.resetName;
    resetDialog.showModal();
  }));
  document.getElementById("reset-cancel").addEventListener("click", () => resetDialog.close());
  async function refreshStatuses() {
    try {
      const response = await fetch("/admin/status", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      for (const element of document.querySelectorAll(".status[data-user-id]")) {
        const online = data.online[element.dataset.userId] === true;
        const usage = document.querySelector('.usage-hours[data-user-id="' + element.dataset.userId + '"]');
        if (usage && data.hours[element.dataset.userId] !== undefined) usage.textContent = Number(data.hours[element.dataset.userId]).toFixed(2) + " hours";
        element.querySelector(".status-dot").classList.toggle("online", online);
        element.querySelector(".status-text").textContent = online ? "Online" : "Offline";
        element.style.color = online ? "#15803d" : "#657182";
      }
      document.getElementById("admin-usage").textContent = Number(data.adminHours).toFixed(2) + " hours";
      document.getElementById("online-count").textContent = data.onlineCount + " / " + data.limit;
    } catch { /* Keep previous status if network is unavailable. */ }
  }
  setInterval(refreshStatuses, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshStatuses();
  });
</script></body></html>`;
}
export function installAuth(fastify) {
  fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 2048 }, (req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body)));
  });
  fastify.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const path = req.url.split("?")[0];
    if (path === "/login" || path === "/boberts-logo.png" || path === "/favicon.ico") return;
    if ((req.method === "GET" || req.method === "HEAD") && (path === "/robots.txt" || path === "/sitemap.xml")) return;
    if ((req.method === "GET" || req.method === "HEAD") && path === "/google547bdb0c7bb6872b.html") return;
    pruneSessions();
    const user = currentUser(req);
    if (!user) {
      if (req.method === "GET" && !path.startsWith("/api/")) return reply.redirect("/login");
      return reply.code(401).send({ error: "Authentication required" });
    }
    if (path === "/api/bobertgpt" || path === "/api/bobertgpt/history") {
      const session = activeSessions.get(sessionNonce(req));
      if (session) session.lastSeen = Date.now();
    }
    if (path.startsWith("/admin") && !user.admin) return reply.code(403).send("Administrator only");
  });
  fastify.get("/login", async (req, reply) => {
    if (authenticated(req)) return reply.redirect("/");
    return reply.type("text/html; charset=utf-8").send(loginPage(configured ? "" : "Administrator login is not configured yet."));
  });
  fastify.post("/login", async (req, reply) => {
    if (!validOrigin(req)) return reply.code(403).send("Invalid origin");
    if (!configured) return reply.code(503).type("text/html").send(loginPage("Administrator login is not configured yet."));
    const ip = req.ip;
    const state = attempts.get(ip) || { count: 0, until: 0 };
    if (state.until > Date.now()) return reply.code(429).type("text/html").send(loginPage("Too many attempts. Try again in 15 minutes."));
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = db.users.find((u) => u.email === email);
    const adminValid = email === ADMIN_EMAIL && timingSafeEqual(scryptSync(ADMIN_PASSWORD, "boberts-browser-admin-v1", 32), scryptSync(password.slice(0, 256), "boberts-browser-admin-v1", 32));
    const userValid = user && timingSafeEqual(Buffer.from(user.hash, "hex"), Buffer.from(hashPassword(password.slice(0, 256), user.salt), "hex"));
    if (!adminValid && !userValid) {
      state.count++;
      if (state.count >= 8) { state.until = Date.now() + 15 * 60 * 1000; state.count = 0; }
      attempts.set(ip, state);
      return reply.code(401).type("text/html").send(loginPage("Incorrect email or password."));
    }
    attempts.delete(ip);
    const signingInId = adminValid ? "admin" : user.id;
    const people = activePeople();
    if (!people.has(signingInId) && people.size >= maxConcurrentPeople) {
      return reply.code(503).type("text/html; charset=utf-8")
        .send(loginPage("Too many people are using Bobert's Browser right now (maximum " + maxConcurrentPeople + "). Please try again in a few minutes."));
    }
    reply.header("Set-Cookie", cookieFor(signingInId));
    return reply.redirect("/");
  });
  fastify.post("/logout", async (req, reply) => {
    if (!validOrigin(req)) return reply.code(403).send("Invalid origin");
    activeSessions.delete(sessionNonce(req));
    reply.header("Set-Cookie", cookieName + "=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
    return reply.redirect("/login");
  });
  fastify.get("/api/me", async (req) => {
    const user = currentUser(req);
    return { name: user.name, email: user.email, initials: initials(user.name), admin: user.admin, hours: Number(((db.usage[user.id]?.seconds || 0) / 3600).toFixed(2)) };
  });
  fastify.post("/api/heartbeat", async (req, reply) => {
    if (!validOrigin(req)) return reply.code(403).send("Invalid origin");
    const user = currentUser(req);
    const session = activeSessions.get(sessionNonce(req));
    if (session) session.lastSeen = Date.now();
    const now = Date.now();
    const entry = db.usage[user.id] || { seconds: 0, last: 0 };
    if (entry.last && now - entry.last <= 90000 && now >= entry.last) entry.seconds += Math.min((now - entry.last) / 1000, 60);
    entry.last = now;
    db.usage[user.id] = entry;
    saveDb();
    return { ok: true, hours: Number((entry.seconds / 3600).toFixed(2)) };
  });
  fastify.post("/api/activity", { bodyLimit: 4096 }, async (req, reply) => {
    if (!validOrigin(req)) return reply.code(403).send({error:"Invalid origin"});
    const user = currentUser(req);
    const type = req.body?.type;
    const value = String(req.body?.value || "").trim();
    if (!["search","visit"].includes(type) || !value || value.length > 500) return reply.code(400).send({error:"Invalid activity"});
    let stored = value;
    if (type === "visit") {
      try {
        const url = new URL(value);
        if (!["http:","https:"].includes(url.protocol)) throw Error("Invalid URL");
        stored = url.origin + url.pathname.slice(0,180);
      } catch { return reply.code(400).send({error:"Invalid URL"}); }
    }
    const cutoff = Date.now() - 30 * 86400000;
    db.activity = db.activity.filter((event) => event.at >= cutoff).slice(-4999);
    db.activity.push({at:Date.now(),id:user.id,name:user.name,type,value:stored});
    saveDb();
    return {ok:true};
  });
  fastify.get("/admin/history", async (req, reply) => {
    const id = String(req.query?.id || "");
    if (!db.users.some(user => user.id === id)) return reply.code(404).send({error:"Account not found"});
    const cutoff = Date.now() - 30 * 86400000;
    return db.activity.filter(event => event.id === id && event.at >= cutoff).slice(-150).reverse().map(({at,type,value}) => ({at,type,value}));
  });
  fastify.get("/admin/status", async () => ({
    online: Object.fromEntries(db.users.map((u) => [u.id, isOnline(u.id)])),
    hours: Object.fromEntries(db.users.map((u) => [u.id, (db.usage[u.id]?.seconds || 0) / 3600])),
    adminHours: (db.usage.admin?.seconds || 0) / 3600,
    onlineCount: activePeople().size, limit:maxConcurrentPeople, rssMB:Math.round(process.memoryUsage().rss/1048576)
  }));
  fastify.get("/admin", async (req, reply) => reply.type("text/html; charset=utf-8").send(dashboard()));
  fastify.post("/admin/capacity",async(req,reply)=>{if(!validOrigin(req))return reply.code(403).send("Invalid origin");const n=Number(req.body?.limit);if(!Number.isInteger(n)||n<1||n>10)return reply.code(400).send("Invalid limit");maxConcurrentPeople=n;db.maxConcurrentPeople=n;saveDb();return reply.redirect("/admin");});


  const groupRooms=new Map();
  const personName=id=>id==="admin"?"Administrator":db.users.find(u=>u.id===id)?.name;
  const groups=()=>db.groups||(db.groups=[]);
  fastify.get("/api/groups",async req=>{const id=currentUser(req).id;return groups().filter(g=>g.members.includes(id)).map(g=>({...g,members:g.members.map(id=>({id,name:personName(id)||"Former member"}))}));});
  fastify.post("/api/groups",async(req,reply)=>{
    if(!validOrigin(req))return reply.code(403).send({error:"Invalid origin"});
    const me=currentUser(req).id,q=req.body||{};
    if(q.action==="create"){
      const name=String(q.name||"").trim(),members=[...new Set([me,...(Array.isArray(q.members)?q.members:[])])];
      if(!name||name.length>80)return reply.code(400).send({error:"Enter a group name of 1–80 characters."});if(members.length<2||members.length>10)return reply.code(400).send({error:"Select 1–9 other members."});if(members.some(id=>!personName(id)))return reply.code(400).send({error:"A selected member is no longer available."});if(groups().length>=100)return reply.code(400).send({error:"Group limit reached."});
      const g={id:randomBytes(16).toString("hex"),name,members,owner:me};groups().push(g);saveDb();return g;
    }
    const g=groups().find(g=>g.id===q.id&&g.members.includes(me));if(!g)return reply.code(404).send({error:"Group unavailable"});
    if(q.action==="manage"&&g.owner===me){const name=String(q.name||"").trim(),members=[...new Set([me,...(Array.isArray(q.members)?q.members:[])])];if(!name||name.length>80||members.length>10||members.some(id=>!personName(id)))return reply.code(400).send({error:"Invalid group"});g.name=name;g.members=members;const room=groupRooms.get(g.id);if(room){for(const id of Object.keys(room.joined))if(!members.includes(id))delete room.joined[id];room.signals=room.signals.filter(s=>members.includes(s.from)&&members.includes(s.to));}saveDb();return {ok:true};}if(q.action==="leave"){const room=groupRooms.get(g.id);if(room){delete room.joined[me];room.signals=room.signals.filter(s=>s.from!==me&&s.to!==me);}g.members=g.members.filter(id=>id!==me);if(g.owner===me)g.owner=g.members[0];saveDb();return {ok:true};}
    return reply.code(400).send({error:"Invalid action"});
  });
  fastify.get("/api/group-messages",async(req,reply)=>{const me=currentUser(req).id,g=groups().find(g=>g.id===req.query.id&&g.members.includes(me));if(!g)return reply.code(404).send({error:"Group unavailable"});return (db.groupMessages||[]).filter(m=>m.group===g.id).slice(-100);});
  fastify.post("/api/group-messages",{bodyLimit:8192},async(req,reply)=>{if(!validOrigin(req))return reply.code(403).send({error:"Invalid origin"});const me=currentUser(req),q=req.body||{},g=groups().find(g=>g.id===q.id&&g.members.includes(me.id)),body=String(q.text||"").trim();if(!g||!body||body.length>2000)return reply.code(400).send({error:"Invalid message"});const rows=db.groupMessages||(db.groupMessages=[]);if(rows.filter(m=>m.from===me.id&&m.at>Date.now()-10000).length>=10)return reply.code(429).send({error:"Slow down"});rows.push({group:g.id,from:me.id,name:me.name,text:body,at:Date.now(),id:randomBytes(16).toString("hex")});db.groupMessages=rows.slice(-5000);saveDb();return {ok:true};});
  function pruneRooms(){for(const [id,r] of groupRooms){for(const [p,t] of Object.entries(r.joined))if(Date.now()-t>45000)delete r.joined[p];if(!Object.keys(r.joined).length)groupRooms.delete(id);}}
  fastify.get("/api/group-calls",async req=>{pruneRooms();const me=currentUser(req).id;return [...groupRooms.values()].filter(r=>groups().some(g=>g.id===r.group&&g.members.includes(me))).map(r=>({id:r.id,group:r.group,mode:r.mode,joined:Object.keys(r.joined),signals:r.joined[me]?r.signals.filter(s=>s.to===me):[]}));});
  fastify.post("/api/group-calls",{bodyLimit:65536},async(req,reply)=>{
    if(!validOrigin(req))return reply.code(403).send({error:"Invalid origin"});pruneRooms();const me=currentUser(req).id,q=req.body||{},g=groups().find(g=>g.id===q.group&&g.members.includes(me));if(!g)return reply.code(404).send({error:"Group unavailable"});
    let r=groupRooms.get(g.id);
    if(q.action==="join"){if(!r){if(!["voice","video"].includes(q.mode))return reply.code(400).send({error:"Invalid mode"});r={id:randomBytes(16).toString("hex"),group:g.id,mode:q.mode,joined:Object.create(null),signals:[]};groupRooms.set(g.id,r);}if(!r.joined[me]&&Object.keys(r.joined).length>=4)return reply.code(409).send({error:"Call is full"});r.joined[me]=Date.now();return {id:r.id,mode:r.mode};}
    if(!r||r.id!==q.id||!r.joined[me])return reply.code(404).send({error:"Call unavailable"});
    if(q.action==="leave"){delete r.joined[me];r.signals=r.signals.filter(s=>s.from!==me&&s.to!==me);}
    else if(q.action==="keep")r.joined[me]=Date.now();
    else if(q.action==="signal"){if(!r.joined[q.to]||!g.members.includes(q.to)||q.to===me||!["offer","answer","ice","camera"].includes(q.kind)||(JSON.stringify(q.data)||"").length>50000)return reply.code(400).send({error:"Invalid signal"});r.signals.push({id:randomBytes(12).toString("hex"),from:me,to:q.to,kind:q.kind,data:q.data});r.signals=r.signals.slice(-300);}
    else if(q.action==="ack")r.signals=r.signals.filter(s=>!(s.to===me&&s.id===q.signal));
    else return reply.code(400).send({error:"Invalid action"});return {ok:true};
  });
  fastify.get("/api/group-unread",async req=>{const me=currentUser(req).id;return groups().filter(g=>g.members.includes(me)).map(g=>({id:g.id,name:g.name,count:(db.groupMessages||[]).filter(m=>m.group===g.id&&m.from!==me&&m.at>(g.read?.[me]||0)).length}));});
  fastify.post("/api/group-read",async(req,reply)=>{if(!validOrigin(req))return reply.code(403).send({error:"Invalid origin"});const me=currentUser(req).id,g=groups().find(g=>g.id===req.body?.id&&g.members.includes(me));if(!g)return reply.code(404).send({error:"Group unavailable"});(g.read||(g.read={}))[me]=Math.min(Date.now(),Number(req.body.at)||0);saveDb();return {ok:true};});
  function recordCall(c){if(c.logged)return;c.logged=true;const rows=db.callHistory||(db.callHistory=[]);rows.push({id:c.id,from:c.from,to:c.to,fromName:c.fromName,toName:c.toName,mode:c.mode,at:c.created||c.updated,answered:!!c.answer});db.callHistory=rows.slice(-500);saveDb();}
  fastify.get("/api/call-history",async req=>{const me=currentUser(req).id;return (db.callHistory||[]).filter(c=>c.from===me||c.to===me).slice(-30).reverse().map(c=>({name:c.from===me?c.toName:c.fromName,mode:c.mode,at:c.at,direction:c.from===me?"Outgoing":"Incoming",answered:c.answered}));});
  const calls=new Map();
  function pruneCalls(){const now=Date.now();for(const [id,c] of calls)if(now-c.updated>(c.state==="ringing"?60000:120000)){recordCall(c);calls.delete(id);}}
  fastify.get("/api/calls",async(req)=>{pruneCalls();const me=currentUser(req).id;return [...calls.values()].filter(c=>c.from===me||c.to===me).map(c=>({...c,name:c.from===me?c.toName:c.fromName}));});
  fastify.post("/api/calls",{bodyLimit:65536},async(req,reply)=>{
    if(!validOrigin(req))return reply.code(403).send({error:"Invalid origin"});
    pruneCalls();const me=currentUser(req),q=req.body||{},now=Date.now();
    const fail=(code,error)=>reply.code(code).send({error});
    if(q.action==="start"){
      const to=String(q.to||""),person=to==="admin"?{name:"Administrator"}:db.users.find(u=>u.id===to);
      if(!person||to===me.id||!["voice","video"].includes(q.mode)||typeof q.sdp!=="string"||q.sdp.length>50000)return fail(400,"Invalid call");
      if([...calls.values()].some(c=>[c.from,c.to].some(id=>id===me.id||id===to)&&c.state!=="ended"))return fail(409,"Someone is already in a call");
      const c={id:randomBytes(16).toString("hex"),from:me.id,to,fromName:me.name||"Contact",toName:person.name,mode:q.mode,fromCamera:q.mode==="video",toCamera:q.mode==="video",offer:q.sdp,answer:null,state:"ringing",created:now,updated:now};calls.set(c.id,c);return c;
    }
    const c=calls.get(String(q.id||""));if(!c||![c.from,c.to].includes(me.id))return fail(404,"Call unavailable");
    if(q.action==="camera"){if(c.from===me.id)c.fromCamera=q.on===true;else c.toCamera=q.on===true;return {ok:true};}if(q.action==="end"){recordCall(c);c.state="ended";c.updated=now;return {ok:true};}
    if(q.action==="answer"&&c.to===me.id&&c.state==="ringing"&&typeof q.sdp==="string"&&q.sdp.length<=50000){c.answer=q.sdp;c.state="connected";c.updated=now;return {ok:true};}
    if(q.action==="keep"&&c.state==="connected"){c.updated=now;return {ok:true};}
    return fail(409,"Call no longer available");
  });
  fastify.get("/api/messages/unread",async(req)=>{const me=currentUser(req);const names=new Map([["admin","Administrator"],...db.users.map(u=>[u.id,u.name])]);const rows=(db.messages||[]).filter(m=>m.to===me.id&&!m.readAt);const counts=Object.create(null);for(const m of rows)counts[m.from]=(counts[m.from]||0)+1;return {me:me.id,total:rows.length,counts,latest:rows.slice(-20).map(m=>({id:m.id,from:m.from,name:names.get(m.from)||"Contact",at:m.at}))};});
  fastify.post("/api/messages/read",{bodyLimit:8192},async(req,reply)=>{if(!validOrigin(req))return reply.code(403).send({error:"Invalid origin"});const me=currentUser(req),peer=String(req.body?.peer||""),ids=new Set(Array.isArray(req.body?.ids)?req.body.ids.slice(0,100):[]);let changed=false;for(const m of db.messages||[])if(m.to===me.id&&m.from===peer&&ids.has(m.id)&&!m.readAt){m.readAt=Date.now();changed=true;}if(changed)saveDb();return {ok:true};});
  fastify.get("/api/messages/people",async(req)=>{const me=currentUser(req);const online=activePeople();return {me:me.id,people:[{id:"admin",name:"Administrator"},...db.users.map(({id,name})=>({id,name}))].filter(u=>u.id!==me.id).map(u=>({...u,online:online.has(u.id)}))};});
  fastify.get("/api/messages",async(req,reply)=>{const me=currentUser(req),peer=String(req.query?.peer||"");if(peer===me.id||!(peer==="admin"||db.users.some(u=>u.id===peer)))return reply.code(400).send({error:"Invalid recipient"});return (db.messages||[]).filter(m=>(m.from===me.id&&m.to===peer)||(m.from===peer&&m.to===me.id)).slice(-100);});
  fastify.post("/api/messages",{bodyLimit:8192},async(req,reply)=>{if(!validOrigin(req))return reply.code(403).send({error:"Invalid origin"});const me=currentUser(req),to=String(req.body?.to||""),body=String(req.body?.text||"").trim();if(to===me.id||!(to==="admin"||db.users.some(u=>u.id===to))||!body||body.length>2000)return reply.code(400).send({error:"Invalid message"});const now=Date.now();db.messages=Array.isArray(db.messages)?db.messages:[];if(db.messages.filter(m=>m.from===me.id&&m.at>now-10000).length>=10)return reply.code(429).send({error:"Slow down"});const m={id:randomBytes(16).toString("hex"),from:me.id,to,text:body,at:now};db.messages.push(m);db.messages=db.messages.slice(-5000);saveDb();return m;});
  fastify.post("/admin/add", async (req, reply) => {
    if (!validOrigin(req)) return reply.code(403).send("Invalid origin");
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!name || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || password.length < 8 || password.length > 256) return reply.code(400).type("text/html").send(dashboard("Enter a valid name, email, and password (8–256 characters)."));
    if (email === ADMIN_EMAIL || db.users.some((u) => u.email === email)) return reply.code(409).type("text/html").send(dashboard("This email already has an account."));
    const salt = randomBytes(16).toString("hex");
    db.users.push({ id: randomBytes(16).toString("hex"), name, email, salt, hash: hashPassword(password, salt) });
    saveDb();
    return reply.redirect("/admin");
  });
  fastify.post("/admin/reset-password", async (req, reply) => {
    if (!validOrigin(req)) return reply.code(403).send("Invalid origin");
    const id = String(req.body?.id || "");
    const password = String(req.body?.password || "");
    const user = db.users.find((item) => item.id === id);
    if (!user || password.length < 8 || password.length > 256) {
      return reply.code(400).type("text/html; charset=utf-8").send(dashboard("Select an existing account and a new password (8–256 characters)."));
    }
    const salt = randomBytes(16).toString("hex");
    user.salt = salt;
    user.hash = hashPassword(password, salt);
    for (const [nonce, session] of activeSessions) {
      if (session.id === id) activeSessions.delete(nonce);
    }
    saveDb();
    return reply.redirect("/admin");
  });
  fastify.post("/admin/delete", async (req, reply) => {
    if (!validOrigin(req)) return reply.code(403).send("Invalid origin");
    const id = String(req.body?.id || "");
    db.users = db.users.filter((u) => u.id !== id);
    delete db.usage[id];for(const g of groups()){g.members=g.members.filter(x=>x!==id);if(g.owner===id)g.owner=g.members[0];}for(const room of groupRooms.values()){delete room.joined[id];room.signals=room.signals.filter(s=>s.from!==id&&s.to!==id);}
    if(Array.isArray(db.messages))db.messages=db.messages.filter(m=>m.from!==id&&m.to!==id);
    for (const [nonce, session] of activeSessions) {
      if (session.id === id) activeSessions.delete(nonce);
    }
    saveDb();
    return reply.redirect("/admin");
  });
}
