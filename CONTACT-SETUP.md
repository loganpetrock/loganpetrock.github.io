# Activate the contact form

The website stays on GitHub Pages. A small Cloudflare Worker verifies submissions and calls Resend to deliver mail to **logan@petrock.dev**. You need a Cloudflare account and a Resend account; you do not need to move your website hosting or nameservers. The form deliberately remains unavailable until the public configuration is filled in.

## 1. Set up the sending address in Resend

1. Create/sign in to your account at https://resend.com/.
2. Add **notify.petrock.dev** as a sending domain. Add the DNS records Resend supplies at your existing DNS provider, and wait for verification. Use this dedicated subdomain; do not replace the MX records serving `logan@petrock.dev`.
3. Create an API key with sending permission for that domain. Keep it private.
4. The Worker uses `Petrock Contact <contact@notify.petrock.dev>` as its sender. You can change `FROM_EMAIL` in `contact-worker/wrangler.jsonc` if you verify a different sending domain.

Delivery uses Resend's [send-email API](https://resend.com/docs/api-reference/emails/send-email). Replies go to the visitor's submitted address. Review the service's current account limits before activation.

## 2. Create a Cloudflare Turnstile widget

1. In the Cloudflare dashboard, open **Turnstile → Add widget**.
2. Name it `petrock.dev contact`, choose **Managed**, and allow `petrock.dev` and `www.petrock.dev`.
3. Copy the **site key** (public) and **secret key** (private).

The backend checks success, the exact hostname, and the `contact` action. Turnstile tokens are single-use and require [server-side verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/); embedding the widget by itself is insufficient.

## 3. Deploy the Worker

With Node.js installed, open a terminal in `contact-worker` and run:

```sh
npx wrangler login
npx wrangler deploy
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put RESEND_API_KEY
```

The first deployment will reject submissions until both secrets are set. Enter the matching private key at each secret prompt. Do not put secrets in `contact-config.js`, `wrangler.jsonc`, GitHub, or chat. Secret uploads update the deployed Worker.

The config creates a rate limiter allowing five requests per minute per IP per Cloudflare location. If your Cloudflare account already uses rate-limit namespace `1001`, pick an unused positive integer for `namespace_id` first. These counters are local and approximate, not a strict global quota; shared networks can share the limit. See [Cloudflare's rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

Copy the `https://petrock-contact.YOUR-SUBDOMAIN.workers.dev` address reported by the deployment. No custom API domain is needed.

## 4. Connect the public page

Edit `contact-config.js`:

```js
window.CONTACT_CONFIG = {
  endpoint: "https://petrock-contact.YOUR-SUBDOMAIN.workers.dev/contact",
  siteKey: "YOUR_PUBLIC_TURNSTILE_SITE_KEY",
};
```

Publish the updated static files to GitHub Pages. Do not use Turnstile testing keys on the live site.

## 5. Keep sales pitches out of your inbox

The Worker blocks failed bot checks, honeypot submissions, invalid inputs, oversized requests, and excessive attempts. It flags likely SEO/redesign solicitations using phrase combinations and flags messages with five or more links. It does not delete suspected human messages, so you can recover false positives.

In the mailbox receiving `logan@petrock.dev`, create a rule:

- **From:** `contact@notify.petrock.dev`
- **Subject contains:** `[petrock.dev review]`
- **Action:** move to a folder named `Website review` and skip the inbox.

Ordinary submissions use `[petrock.dev contact]`. Create the mailbox rule to complete the filtering setup: the Worker labels suspicious messages, but cannot create folders or inbox rules. The filter is a heuristic, so some pitches may slip through and legitimate messages may be flagged. Adjust `classifyMessage()` in `contact-worker/worker.mjs` and redeploy to refine it. It only filters submissions through this form; emails sent directly to your existing address require your mailbox's own spam rules.

## 6. Verify activation

From the published site:

1. Send a normal message and confirm it arrives at `logan@petrock.dev`; reply and confirm the reply address is the sender's address.
2. Send a clearly labeled test message containing “We offer SEO services to improve your website.” Confirm it arrives in `Website review`.
3. Confirm a missing or expired verification token cannot submit and service failures preserve the typed message.
4. Check both `petrock.dev` and `www.petrock.dev` if both serve this site.

Local backend tests use mocked verification/email services and send no email. Live delivery cannot be verified until these accounts and keys are configured. A network interruption after acceptance may make delivery uncertain; check the inbox before resending.

## Privacy and maintenance

Cloudflare processes bot-verification and network data. Resend processes the submitted name, email, topic, and message to deliver the email. The Worker adds no database and does not log form contents. Provider logs and inbox retention follow your account settings. Keep API keys private, rotate them if exposed, and monitor service limits.
