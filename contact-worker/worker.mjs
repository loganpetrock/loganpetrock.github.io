// Runs on Cloudflare Workers, never in the browser or on GitHub Pages.
const TOPICS = { project: "Project or collaboration", opportunity: "Career opportunity", photography: "Photography", hello: "Just saying hello" };
const MAX_BYTES = 24000;

export function classifyMessage(message) {
  const text = message.normalize("NFKC").toLowerCase();
  const services = /\b(seo|search engine optimi[sz]ation|backlinks?|link building|website (?:redesign|revamp)|redesign (?:your|the) (?:web)?site|revamp (?:your|the) (?:web)?site|web design services|organic traffic|google rankings?)\b/;
  const pitches = /\b(we (?:can|offer|help|provide)|our (?:services|team|agency)|i (?:can help|offer|provide)|free (?:audit|consultation)|increase your|improve your|boost your|grow your|noticed your|your (?:web)?site|your business|guaranteed|first page|our portfolio|schedule a call)\b/;
  const links = (text.match(/https?:\/\//g) || []).length;
  return (services.test(text) && pitches.test(text)) || links >= 5;
}

async function readBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BYTES) throw new Error("size");
  if (!request.body) throw new Error("json");
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BYTES) { await reader.cancel(); throw new Error("size"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const origins = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const allowed = origins.includes(origin);
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" };
    if (allowed) headers["Access-Control-Allow-Origin"] = origin;
    const reply = (status, data, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, ...extra } });
    if (new URL(request.url).pathname !== "/contact") return reply(404, { error: "Not found." });
    if (!allowed) return reply(403, { error: "This origin is not allowed." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } });
    if (request.method !== "POST") return reply(405, { error: "Use POST." }, { Allow: "POST, OPTIONS" });
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return reply(415, { error: "Use JSON." });
    if (!env.TURNSTILE_SECRET || !env.RESEND_API_KEY || !env.FROM_EMAIL || !env.CONTACT_RATE_LIMITER) return reply(503, { error: "The contact form is temporarily unavailable. Please try again later." });
    try {
      // Coarse anonymous-abuse protection; limits are per Cloudflare location.
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip) return reply(400, { error: "Unable to verify this request." });
      const limit = await env.CONTACT_RATE_LIMITER.limit({ key: `contact:${ip}` });
      if (!limit.success) return reply(429, { error: "Too many attempts. Please wait a minute and try again." }, { "Retry-After": "60" });
      let body;
      try { body = await readBody(request); }
      catch (error) { return reply(error.message === "size" ? 413 : 400, { error: "The message is too large or invalid." }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, { error: "Invalid message." });
      if (body.website) return reply(400, { error: "Unable to accept this submission." });
      const { name, email, topic, message, token } = body;
      if (typeof name !== "string" || name.trim().length < 2 || name.length > 100 || /[\r\n\x00-\x1f]/.test(name) ||
          typeof email !== "string" || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
          typeof topic !== "string" || !Object.hasOwn(TOPICS, topic) ||
          typeof message !== "string" || message.trim().length < 20 || message.length > 5000 ||
          typeof token !== "string" || !token || token.length > 2048) {
        return reply(400, { error: "Check your name, email, topic, and message (20–5,000 characters), then complete bot verification." });
      }
      const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(8000),
      });
      if (!verification.ok) return reply(503, { error: "Bot verification is temporarily unavailable. Please try again." });
      const result = await verification.json();
      if (!result.success || result.action !== "contact" || result.hostname !== new URL(origin).hostname) return reply(400, { error: "Bot verification failed or expired. Please complete it again." });
      const review = classifyMessage(message);
      const prefix = review ? "[petrock.dev review]" : "[petrock.dev contact]";
      // The recipient and sender are trusted configuration, never user input.
      // Plain text avoids rendering submitted HTML in the recipient's email.
      const delivery = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.FROM_EMAIL, to: ["logan@petrock.dev"], reply_to: email.trim(),
          subject: `${prefix} ${TOPICS[topic]}`,
          text: `${review ? "Flagged for review: possible unsolicited promotion.\n\n" : ""}Name: ${name.trim()}\nEmail: ${email.trim()}\nTopic: ${TOPICS[topic]}\n\n${message.trim()}`,
        }), signal: AbortSignal.timeout(10000),
      });
      if (!delivery.ok) return reply(502, { error: "Your message couldn’t be delivered. Please try again later." });
      return reply(200, { ok: true });
    } catch {
      // Never log messages, visitor email addresses, IPs, tokens, or secrets.
      return reply(503, { error: "The contact service is temporarily unavailable. Please try again later." });
    }
  },
};
