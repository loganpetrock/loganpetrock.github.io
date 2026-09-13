import test from "node:test";
import assert from "node:assert/strict";
import worker, { classifyMessage } from "../contact-worker/worker.mjs";

const valid = { name: "Test Person", email: "person@example.com", topic: "project", message: "I would love to discuss an engineering project with you.", token: "valid-token", website: "" };
function request(body = valid, { origin = "https://petrock.dev", method = "POST", contentType = "application/json", path = "/contact" } = {}) {
  return new Request(`https://worker.example${path}`, { method, headers: { Origin: origin, "Content-Type": contentType, "CF-Connecting-IP": "192.0.2.1" }, ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
}
function env() { return { ALLOWED_ORIGINS: "https://petrock.dev,https://www.petrock.dev", TURNSTILE_SECRET: "test-secret", RESEND_API_KEY: "test-key", FROM_EMAIL: "Contact <contact@notify.petrock.dev>", CONTACT_RATE_LIMITER: { limit: async () => ({ success: true }) } }; }

test("contact security and delivery paths (mocked providers; no real email)", async t => {
  await t.test("CORS denies untrusted and missing origins", async () => {
    for (const origin of ["https://attacker.example", "null", ""]) assert.equal((await worker.fetch(request(valid, { origin }), env())).status, 403);
  });
  await t.test("preflight permits only configured origin", async () => {
    const res = await worker.fetch(request(valid, { method: "OPTIONS" }), env());
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://petrock.dev");
    assert.equal(res.headers.get("Access-Control-Allow-Methods"), "POST");
  });
  await t.test("fails closed without configuration or rate-limit binding", async () => {
    for (const key of ["TURNSTILE_SECRET", "RESEND_API_KEY", "FROM_EMAIL", "CONTACT_RATE_LIMITER"]) {
      const config = env(); delete config[key];
      assert.equal((await worker.fetch(request(), config)).status, 503);
    }
  });
  await t.test("rejects invalid method, path, and content type", async () => {
    assert.equal((await worker.fetch(request(valid, { method: "GET" }), env())).status, 405);
    assert.equal((await worker.fetch(request(valid, { path: "/other" }), env())).status, 404);
    assert.equal((await worker.fetch(request(valid, { contentType: "text/plain" }), env())).status, 415);
  });
  await t.test("rate limit returns retry guidance", async () => {
    const config = env(); config.CONTACT_RATE_LIMITER.limit = async () => ({ success: false });
    const res = await worker.fetch(request(), config);
    assert.equal(res.status, 429); assert.equal(res.headers.get("Retry-After"), "60");
  });
  await t.test("rejects malformed, oversized, honeypot and invalid field submissions", async () => {
    for (const body of ["{bad", null, [], { ...valid, website: "bot" }, { ...valid, name: "X" }, { ...valid, name: "A\r\nB" }, { ...valid, email: "wrong" }, { ...valid, topic: "toString" }, { ...valid, message: "short" }, { ...valid, token: "" }]) {
      assert.equal((await worker.fetch(request(body), env())).status, 400);
    }
    assert.equal((await worker.fetch(request({ ...valid, message: "x".repeat(25000) }), env())).status, 413);
  });
  await t.test("spam filter identifies pitches while allowing engineering discussion", () => {
    assert.equal(classifyMessage("We offer SEO services to improve your website."), true);
    assert.equal(classifyMessage("Our agency can revamp your website. Schedule a call."), true);
    assert.equal(classifyMessage("I built an SEO analysis tool for a class project and would love to compare engineering notes."), false);
    assert.equal(classifyMessage(valid.message), false);
  });
  await t.test("verification failures never reach email delivery", async () => {
    const original = globalThis.fetch;
    try {
      for (const result of [{ success: false }, { success: true, action: "wrong", hostname: "petrock.dev" }, { success: true, action: "contact", hostname: "attacker.example" }]) {
        let calls = 0;
        globalThis.fetch = async () => { calls++; return Response.json(result); };
        assert.equal((await worker.fetch(request(), env())).status, 400); assert.equal(calls, 1);
      }
    } finally { globalThis.fetch = original; }
  });
  await t.test("verified messages go only to Logan with review routing and safe text", async () => {
    const original = globalThis.fetch;
    try {
      for (const [message, review] of [[valid.message, false], ["We offer SEO services to improve your website.", true]]) {
        const calls = [];
        globalThis.fetch = async (url, options) => {
          calls.push({ url, body: JSON.parse(options.body) });
          return Response.json(calls.length === 1 ? { success: true, action: "contact", hostname: "petrock.dev" } : { id: "test-email" });
        };
        const res = await worker.fetch(request({ ...valid, message, to: "attacker@example.com" }), env());
        assert.deepEqual(await res.json(), { ok: true });
        assert.equal(calls.length, 2);
        assert.deepEqual(calls[1].body.to, ["logan@petrock.dev"]);
        assert.equal(calls[1].body.reply_to, valid.email);
        assert.equal(calls[1].body.subject.includes("review"), review);
        assert.equal(calls[1].body.html, undefined);
        assert.ok(calls[1].body.text.includes(message));
      }
    } finally { globalThis.fetch = original; }
  });
  await t.test("provider failures do not claim successful delivery", async () => {
    const original = globalThis.fetch;
    try {
      let calls = 0;
      globalThis.fetch = async () => ++calls === 1 ? Response.json({ success: true, action: "contact", hostname: "petrock.dev" }) : new Response("unavailable", { status: 503 });
      assert.equal((await worker.fetch(request(), env())).status, 502);
      globalThis.fetch = async () => { throw new Error("network"); };
      assert.equal((await worker.fetch(request(), env())).status, 503);
    } finally { globalThis.fetch = original; }
  });
});
