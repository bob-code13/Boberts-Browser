import { createServer } from "node:http";
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const ADMIN_EMAIL = "rilanjia0001@mymail.lausd.net";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const configured = ADMIN_PASSWORD.length >= 12 && SESSION_SECRET.length >= 32;
const cookieName = "bb_session";
const attempts = new Map();
const sessionLifetime = 12 * 60 * 60 * 1000;

function cookies(header = "") {
  return Object.fromEntries(header.split(";").map((piece) => {
    const index = piece.indexOf("=");
    return index < 0 ? ["", ""] : [piece.slice(0, index).trim(), piece.slice(index + 1).trim()];
  }));
}
function signed(value) {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}
function authenticated(req) {
  if (!configured) return false;
  const token = cookies(req.headers.cookie)[cookieName];
  if (!token) return false;
  const [expiry, nonce, signature] = token.split(".");
  if (!expiry || !nonce || !signature || !/^\d+$/.test(expiry) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Number(expiry) <= Date.now()) return false;
  const expected = Buffer.from(signed(expiry + "." + nonce), "hex");
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
function loginPage(message = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in — Bobert's Browser</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f9fc;font:16px system-ui,Arial,sans-serif;color:#202124}main{width:min(410px,calc(100% - 36px));background:white;padding:36px;border:1px solid #e3e7ef;border-radius:18px;box-shadow:0 12px 36px #20212410}h1{font-size:26px;margin:0 0 8px}.sub{color:#5f6368;margin:0 0 24px}label{display:block;font-size:14px;font-weight:600;margin:16px 0 7px}input{width:100%;padding:13px;border:1px solid #ccd1d9;border-radius:9px;font:inherit}button{margin-top:24px;width:100%;background:#1967d2;border:0;color:white;padding:14px;border-radius:9px;font:inherit;font-weight:600;cursor:pointer}.error{color:#b3261e;font-size:14px}.bb{font-weight:900;color:#1967d2;font-size:40px;margin-bottom:12px}</style></head><body><main><div class="bb">BB</div><h1>Bobert's Browser</h1><p class="sub">Sign in to continue</p>${message ? '<p class="error" role="alert">' + message + '</p>' : ''}<form method="post" action="/login"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in</button></form></main></body></html>`;
}
const publicPath = fileURLToPath(new URL("../public/", import.meta.url));

// Wisp Configuration: Refer to the documentation at https://www.npmjs.com/package/@mercuryworkshop/wisp-js

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
	allow_udp_streams: false,
	hostname_blacklist: [/example\.com/],
	dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const fastify = Fastify({
	serverFactory: (handler) => {
		return createServer()
			.on("request", (req, res) => {
				res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
				res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
				handler(req, res);
			})
			.on("upgrade", (req, socket, head) => {
				if (req.url.split("?")[0].endsWith("/wisp/") && authenticated(req)) wisp.routeRequest(req, socket, head);
				else socket.end();
			});
	},
});


fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 2048 }, (req, body, done) => {
  done(null, Object.fromEntries(new URLSearchParams(body)));
});
fastify.addHook("onRequest", async (req, reply) => {
  reply.header("Cache-Control", "no-store");
  if (req.url.split("?")[0] === "/login") return;
  if (!authenticated(req)) {
    if (req.method === "GET") return reply.redirect("/login");
    return reply.code(401).send({ error: "Authentication required" });
  }
});
fastify.get("/login", async (req, reply) => {
  if (authenticated(req)) return reply.redirect("/");
  return reply.type("text/html; charset=utf-8").send(loginPage(configured ? "" : "Administrator login is not configured yet."));
});
fastify.post("/login", async (req, reply) => {
  if (!configured) return reply.code(503).type("text/html").send(loginPage("Administrator login is not configured yet."));
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && new URL(origin).host !== host) return reply.code(403).send("Invalid origin");
  const ip = req.ip;
  const state = attempts.get(ip) || { count: 0, until: 0 };
  if (state.until > Date.now()) return reply.code(429).type("text/html").send(loginPage("Too many attempts. Try again in 15 minutes."));
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const salt = "boberts-browser-admin-v1";
  const expected = scryptSync(ADMIN_PASSWORD, salt, 32);
  const provided = scryptSync(password.slice(0, 256), salt, 32);
  if (email !== ADMIN_EMAIL || !timingSafeEqual(expected, provided)) {
    state.count += 1;
    if (state.count >= 8) { state.until = Date.now() + 15 * 60 * 1000; state.count = 0; }
    attempts.set(ip, state);
    return reply.code(401).type("text/html").send(loginPage("Incorrect email or password."));
  }
  attempts.delete(ip);
  const value = String(Date.now() + sessionLifetime) + "." + randomBytes(16).toString("hex");
  reply.header("Set-Cookie", cookieName + "=" + value + "." + signed(value) + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200");
  return reply.redirect("/");
});
fastify.post("/logout", async (req, reply) => {
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return reply.code(403).send("Invalid origin");
  reply.header("Set-Cookie", cookieName + "=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  return reply.redirect("/login");
});

fastify.register(fastifyStatic, {
	root: publicPath,
	decorateReply: true,
});

fastify.register(fastifyStatic, {
	root: scramjetPath,
	prefix: "/scram/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: libcurlPath,
	prefix: "/libcurl/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false,
});

fastify.setNotFoundHandler((res, reply) => {
	return reply.code(404).type("text/html").sendFile("404.html");
});

fastify.server.on("listening", () => {
	const address = fastify.server.address();

	// by default we are listening on 0.0.0.0 (every interface)
	// we just need to list a few
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${
			address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	fastify.close();
	process.exit(0);
}

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

fastify.listen({
	port: port,
	host: "0.0.0.0",
});
