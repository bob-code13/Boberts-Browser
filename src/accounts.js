import { createHmac, timingSafeEqual, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ADMIN_EMAIL = "rilanjia0001@mymail.lausd.net";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const configured = ADMIN_PASSWORD.length >= 12 && SESSION_SECRET.length >= 32;
const cookieName = "bb_session";
const attempts = new Map();
const sessionLifetime = 4 * 60 * 60 * 1000; // Require sign-in again after four hours.\nconst idleTimeout = 30 * 60 * 1000; // Expire inactive sessions after 30 minutes.\nconst presenceWindow = 2 * 60 * 1000; // Active browser heartbeat window.\nconst maxConcurrentPeople = 5;\nconst activeSessions = new Map(); // One in-memory entry per signed-in browser session.
const dataFile = process.env.ACCOUNT_DATA_FILE || "/home/boberts-browser/accounts.json";
let db = { users: [], usage: {} };
try {
  db = JSON.parse(readFileSync(dataFile, "utf8"));
  if (!Array.isArray(db.users) || typeof db.usage !== "object" || !db.usage) throw new Error("Invalid account data");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
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
function currentUser(req) {
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
  const value = String(Date.now() + sessionLifetime) + "." + id + "." + randomBytes(16).toString("hex");
  return cookieName + "=" + value + "." + signed(value) + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200";
}
function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString("hex");
}
function validOrigin(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
function loginPage(message = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in — Bobert's Browser</title><link rel="icon" type="image/png" href="/boberts-logo.png?v=2"><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f9fc;font:16px system-ui,Arial,sans-serif;color:#202124}main{width:min(410px,calc(100% - 36px));background:white;padding:36px;border:1px solid #e3e7ef;border-radius:18px;box-shadow:0 12px 36px #20212410;text-align:center}h1{font-size:26px;margin:0 0 8px}.sub{color:#5f6368;margin:0 0 24px}label{display:block;text-align:left;font-size:14px;font-weight:600;margin:16px 0 7px}input{width:100%;padding:13px;border:1px solid #ccd1d9;border-radius:9px;font:inherit}button{margin-top:24px;width:100%;background:#1967d2;border:0;color:white;padding:14px;border-radius:9px;font:inherit;font-weight:600;cursor:pointer}.error{color:#b3261e;font-size:14px}.logo{width:80px;height:80px;object-fit:contain;margin:0 auto 14px}</style></head><body><main><img class="logo" src="/boberts-logo.png" alt="BB logo"><h1>Bobert's Browser</h1><p class="sub">Sign in to continue</p>${message ? '<p class="error" role="alert">' + escapeHtml(message) + '</p>' : ''}<form method="post" action="/login"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in</button></form></main></body></html>`;
}
function isOnline(id) {
  const last = db.usage[id]?.last || 0;
  return last > 0 && Date.now() - last >= 0 && Date.now() - last < 90000;
}
function dashboard(message = "") {
  const rows = db.users.map((u) => `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td><span class="status" data-user-id="${u.id}"><span class="status-dot ${isOnline(u.id) ? "online" : ""}"></span><span class="status-text">${isOnline(u.id) ? "Online" : "Offline"}</span></span></td><td class="usage-hours" data-user-id="${u.id}">${((db.usage[u.id]?.seconds || 0) / 3600).toFixed(2)} hours</td><td><form method="post" action="/admin/delete" onsubmit="return confirm('Delete this account?')"><input type="hidden" name="id" value="${u.id}"><button class="danger">Delete</button></form></td></tr>`).join("");
  const adminHours = ((db.usage.admin?.seconds || 0) / 3600).toFixed(2);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Dashboard — Bobert's Browser</title><link rel="icon" type="image/png" href="/boberts-logo.png?v=2"><style>
  *{box-sizing:border-box}body{margin:0;background:#f6f8fc;color:#202124;font:15px system-ui,Arial,sans-serif}main{max-width:1050px;margin:40px auto;padding:0 20px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}h1{font-size:30px}h2{font-size:20px}section{background:white;padding:24px;border-radius:16px;border:1px solid #e2e5ed;margin:22px 0;overflow:auto}input{display:block;width:100%;padding:12px;border:1px solid #cbd0db;border-radius:8px;margin:6px 0 16px;font:inherit}label{font-weight:600}button,.button{display:inline-block;background:#1967d2;color:white;border:0;border-radius:8px;padding:11px 16px;text-decoration:none;font:inherit;cursor:pointer}.danger{background:#b3261e}table{width:100%;border-collapse:collapse;min-width:560px}td,th{text-align:left;padding:12px;border-bottom:1px solid #e8ebf1}.status{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:#657182;white-space:nowrap}.status-dot{width:10px;height:10px;display:inline-block;border-radius:50%;background:#9ca3af;box-shadow:0 0 0 3px #f1f3f5}.status-dot.online{background:#20a451;box-shadow:0 0 0 3px #dcfce7}.status:has(.online){color:#15803d}p{color:#5f6368}.message{color:#b3261e}.logo{width:45px;vertical-align:middle;margin-right:12px}</style></head><body><main><header><h1><img class="logo" src="/boberts-logo.png" alt="">Admin Dashboard</h1><a class="button" href="/">Back to Browser</a></header><p>Manage who can use Bobert's Browser and see active browsing time. Your admin usage: <strong id="admin-usage">${adminHours} hours</strong>. <span id="online-count">${activePeople().size} / 5 people online</span>.</p>${message ? '<p class="message">' + escapeHtml(message) + '</p>' : ''}<section><h2>Add account</h2><form action="/admin/add" method="post"><label for="name">Full name</label><input id="name" name="name" maxlength="80" required><label for="email">Email</label><input id="email" type="email" name="email" maxlength="200" required><label for="password">Password (8+ characters)</label><input id="password" type="password" name="password" minlength="8" maxlength="256" autocomplete="new-password" required><button type="submit">Create account</button></form></section><section><h2>Account holders (${db.users.length})</h2><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Usage</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No accounts yet.</td></tr>'}</tbody></table></section></main><script>
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
      document.getElementById("online-count").textContent = data.onlineCount + " / 5 people online";
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
    pruneSessions();
    const user = currentUser(req);
    if (!user) {
      if (req.method === "GET" && !path.startsWith("/api/")) return reply.redirect("/login");
      return reply.code(401).send({ error: "Authentication required" });
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
    reply.header("Set-Cookie", cookieFor(adminValid ? "admin" : user.id));
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
    const now = Date.now();
    const entry = db.usage[user.id] || { seconds: 0, last: 0 };
    if (entry.last && now - entry.last <= 90000 && now >= entry.last) entry.seconds += Math.min((now - entry.last) / 1000, 60);
    entry.last = now;
    db.usage[user.id] = entry;
    saveDb();
    return { ok: true, hours: Number((entry.seconds / 3600).toFixed(2)) };
  });
  fastify.get("/admin/status", async () => ({
    online: Object.fromEntries(db.users.map((u) => [u.id, isOnline(u.id)])),
    hours: Object.fromEntries(db.users.map((u) => [u.id, (db.usage[u.id]?.seconds || 0) / 3600])),
    adminHours: (db.usage.admin?.seconds || 0) / 3600,
    onlineCount: activePeople().size
  }));
  fastify.get("/admin", async (req, reply) => reply.type("text/html; charset=utf-8").send(dashboard()));
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
  fastify.post("/admin/delete", async (req, reply) => {
    if (!validOrigin(req)) return reply.code(403).send("Invalid origin");
    const id = String(req.body?.id || "");
    db.users = db.users.filter((u) => u.id !== id);
    delete db.usage[id];
    saveDb();
    return reply.redirect("/admin");
  });
}
