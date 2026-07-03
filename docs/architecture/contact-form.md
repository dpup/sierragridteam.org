# Contact-form backend — spec & handoff

**Status:** waiting on infrastructure. This document is the handoff spec for the
`terraform/project-hub` repo, which owns the AWS side. Once the Function URL below
exists, this repo wires the form to it (see "What the website does after" at the end).

## Goal

Replace the `mailto:`-based contact form on `/contact` with a real submission path,
with **no server to run and effectively zero cost**: a Lambda Function URL that
validates the POST and forwards it to `info@sierragridteam.org` via SES, staying
inside the SES **sandbox** forever (the only recipient is our own verified address,
so production access is never needed).

Budget reality-check: Lambda's always-free tier (1M requests/mo) covers the traffic;
SES is $0.10 per 1,000 mails. At a few submissions a week this rounds to $0.

## What needs to exist (Terraform)

1. **SES email identity** — `aws_ses_email_identity` for `info@sierragridteam.org`.
   Applying it sends a confirmation link to that inbox; someone must click it once.
   No domain/DKIM records are required for this design (nice-to-have later for
   deliverability polish, but From == To == our own inbox, so it works without).

2. **Lambda function** — suggested name `sierra-contact-form`.
   - Runtime `nodejs22.x`, no dependencies (reference implementation below —
     the AWS SDK v3 SES client is preinstalled in the runtime).
   - Env vars: `CONTACT_EMAIL=info@sierragridteam.org`,
     `SITE_ORIGIN=https://sierragridteam.org`.
   - Memory 128 MB, timeout 10 s.
   - **Reserved concurrency 2** — caps the blast radius of any flood at
     ~2 concurrent sends.
   - CloudWatch log group with **short retention (30 days)**; the code below
     deliberately logs no form contents (submissions are resident PII).

3. **IAM role** — basic execution role + `ses:SendEmail` scoped to the identity ARN,
   with a condition pinning `ses:FromAddress` to `info@sierragridteam.org`.

4. **Function URL** — `aws_lambda_function_url`, `authorization_type = "NONE"`,
   no CORS config needed (see "Why no CORS" below).

5. **Output** — the Function URL. Hand it back to the website repo
   (`sierragridteam.org`); everything there keys off that one string.

## The HTTP contract (what the website sends / expects)

The form does a **native HTML POST** (top-level navigation, works without JS):

- `POST`, `Content-Type: application/x-www-form-urlencoded`
- Fields: `name` (required), `email` (required), `callsign` (optional),
  `role` (optional), `message` (required), `_gotcha` (honeypot — humans never
  see or fill it).

Responses are **redirects**, not JSON (the browser is navigating):

| Case                                   | Response                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Valid submission                       | `303` → `{SITE_ORIGIN}/contact/thanks`                                                     |
| Honeypot filled (bot)                  | `303` → `{SITE_ORIGIN}/contact/thanks` — silent, never tip off the bot                     |
| Missing/invalid fields, oversized body | `303` → `{SITE_ORIGIN}/contact?error=1`                                                    |
| Any non-POST method                    | `405`                                                                                      |
| SES failure                            | `303` → `{SITE_ORIGIN}/contact?error=1` (the page keeps the direct-email fallback visible) |

**Why no CORS:** a native form POST is a top-level navigation, which is exempt from
CORS. Nothing on the site `fetch()`es this endpoint. (If we ever add a JS-enhanced
submit, we'd add `Accept: application/json` handling + CORS then — out of scope now.)

**Email shape** (mirrors what the old mailto built, so the inbox workflow is unchanged):

- From: `info@sierragridteam.org` · To: same · **Reply-To: the visitor's email**
  (so a volunteer just hits reply)
- Subject: `Volunteer interest — {name}`
- Plain-text body: `Name:` / `Email:` / `Ham call sign:` / `Area of interest:` /
  blank line / message.

Hardening required in the handler (all in the reference code):

- Strictly validate the `email` field (it lands in the `Reply-To` header — reject
  anything with whitespace/newlines to close header injection).
- Cap the body at 10 KB and each field at sane lengths; strip control characters.
- Never place visitor input in the `From` header.

## Reference implementation

```js
// sierra-contact-form — validates a native form POST and forwards it to the
// org inbox via SES. No dependencies; SDK v3 ships with the nodejs22.x runtime.
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({});
const EMAIL = process.env.CONTACT_EMAIL;
const ORIGIN = process.env.SITE_ORIGIN;

const redirect = (path) => ({ statusCode: 303, headers: { Location: `${ORIGIN}${path}` } });
const clean = (s, max) =>
  String(s ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, max);
// Conservative: no whitespace/commas (header-injection guard), one @, a dot after it.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export const handler = async (event) => {
  if (event.requestContext?.http?.method !== 'POST') return { statusCode: 405 };

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString()
    : (event.body ?? '');
  if (raw.length > 10_000) return redirect('/contact?error=1');
  const p = new URLSearchParams(raw);

  if (p.get('_gotcha')) return redirect('/contact/thanks'); // bot — accept silently

  const name = clean(p.get('name'), 200);
  const email = clean(p.get('email'), 254);
  const callsign = clean(p.get('callsign'), 20);
  const role = clean(p.get('role'), 100);
  const message = clean(p.get('message'), 5000);
  if (!name || !message || !EMAIL_RE.test(email)) return redirect('/contact?error=1');

  const body = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Ham call sign: ${callsign || '—'}`,
    `Area of interest: ${role || 'No preference'}`,
    '',
    message,
  ].join('\n');

  try {
    await ses.send(
      new SendEmailCommand({
        Source: EMAIL,
        Destination: { ToAddresses: [EMAIL] },
        ReplyToAddresses: [email],
        Message: {
          Subject: { Data: `Volunteer interest — ${name}` },
          Body: { Text: { Data: body } },
        },
      })
    );
    console.log('contact form: forwarded 1 submission'); // no PII in logs
    return redirect('/contact/thanks');
  } catch (err) {
    console.error('contact form: SES send failed', err?.name);
    return redirect('/contact?error=1');
  }
};
```

## Spam posture

Honeypot + validation only, by design — proportionate to a low-traffic rural
non-profit. If real spam arrives later: add Cloudflare Turnstile (free, host-agnostic)
on the website side and verify its token in this Lambda. Reserved concurrency and the
10 KB cap bound the damage in the meantime.

## What the website does after (this repo, once the URL exists)

1. Point the form `action` at the Function URL, `method="post"` (drop the mailto
   action + the JS mailto builder; keep the "email us directly" fallback line).
2. Add the hidden `_gotcha` honeypot field (visually hidden, `tabindex="-1"`,
   `autocomplete="off"`).
3. Add `/contact/thanks` (calm confirmation, link back) and render a gentle
   "something went wrong — email us directly" note when `?error=1` is present.
4. Add a one-line privacy note under the form ("this form sends your message to our
   inbox; we don't share it") — trust posture.
5. Tests: thanks page in the a11y/smoke/screenshot lists; unit-test nothing (no
   logic lives client-side anymore).

The endpoint URL will live in `src/config/site.ts` so it stays editable data.
