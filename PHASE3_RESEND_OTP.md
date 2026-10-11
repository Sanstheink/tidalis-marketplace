# Marketplace Tidalis · Phase 3.1 — Resend email OTP + Midnight Violet UI

This change builds on **Phase 3**. It is not a standalone release. The code has not connected to your actual Resend account, Supabase project, or Vercel environment. Do not use live credentials in Git.

## 1. Architecture

- **Authentication**: Supabase Auth creates, expires, rate-limits, and verifies email OTP. It issues the session when verified. Do not generate OTP in the frontend or send one from a public Next.js API route.
- **Email delivery**: Resend via Supabase **Custom SMTP** sends confirmation, sign-in OTP, password recovery, invites, email changes, and enabled security alerts (the latter depend on Supabase project settings).
- **Application emails**: server-only `lib/email/resend.ts` is the adapter for upcoming notifications, invoices, receipts, order updates, commission updates and refund emails. The adapter exists but is **not wired into incomplete business flows**; there is no working orders email notification yet. Require server authorization, immutable order events, outbox/idempotency, retry handling, and consent where applicable before enabling each workflow.
- **MFA for Seller/Admin** remains authenticator-based **TOTP** and Supabase AAL2 enforcement. Email OTP for passwordless sign-in is **not a substitute** for a separate MFA factor. The TOTP page now uses the same six-cell UI.

## 2. Setup Resend SMTP in Supabase Auth (the critical step)

1. In [Resend](https://resend.com/domains), verify a **sender domain you control** and add exactly the SPF/DKIM (and recommended DMARC) DNS records shown. A website domain doesn't automatically qualify as a verified email sender domain.
2. Create a **Resend API key** restricted appropriately for SMTP sending. Store it only in **Supabase Auth → SMTP Settings**, not in browser code or GitHub.
3. In your **Supabase STAGING project**, go to Authentication → SMTP Settings (Dashboard wording varies) and enable **Custom SMTP**:

   | Setting | Value |
   | --- | --- |
   | Host | `smtp.resend.com` |
   | Port | `465` (TLS/SSL; use an option supported by your Supabase dashboard) |
   | Username | `resend` |
   | Password | Your Resend API Key (secret; paste only in Supabase dashboard) |
   | Sender email | `auth@YOUR_VERIFIED_DOMAIN` |
   | Sender name | `Tidalis Marketplace` |

   Alternatively use the official [Resend ↔ Supabase integration](https://supabase.com/partners/resend) if it is available to your account.

4. Enable **Confirm email** under Supabase Auth providers. Set **email OTP length to 6** (if configurable) and expiry around **10 minutes**. Set appropriate rate limits for requests/verification; the UI's 60-second resend cooldown does **not** replace backend abuse controls.
5. In Supabase → Authentication → Email Templates, replace these templates with HTML from this repo:

   | Supabase email template | File |
   | --- | --- |
   | Confirm signup | `supabase/email-templates/confirm-signup.html` |
   | Magic Link / OTP sign-in | `supabase/email-templates/magic-link.html` |
   | Reset Password | `supabase/email-templates/recovery.html` |

   **Critical:** preserve `{{ .Token }}` exactly. This variable is rendered by Supabase when it sends an email. Do NOT send these templates directly from Next.js, and do NOT hardcode OTPs. If you need email invitations, email-address changes, or reauthentication codes, configure the appropriate Supabase templates too; they will use the same SMTP transport. Do not enable Supabase security notifications unless their templates and policy are configured.

6. Configure Supabase **Site URL / Redirect URLs** with a controlled/stable Vercel staging URL, e.g. `https://YOUR-STAGING.vercel.app/auth/callback` and `.../auth/confirm`. Confirm your OAuth and Google callback configuration separately. Keep email link tracking OFF in Resend if links are included in templates.
7. Test from a **real recipient inbox** (Inbox and Spam). Verify delivery logs in Resend Dashboard and Supabase Auth logs. The six-digit token must match the code actually received.

## 3. App transactional emails (future order/refund/invoice workflows)

`lib/email/resend.ts` contains a server-only `sendTransactionalEmail()` helper. It deliberately has **no public HTTP endpoint**. When a trusted server action/worker is implemented, configure these in Vercel's server-only environment variables:

```ini
RESEND_API_KEY=re_...             # Secret in Vercel, never prefix NEXT_PUBLIC_
RESEND_FROM_EMAIL=Tidalis Marketplace <notifications@YOUR_VERIFIED_DOMAIN>
```

You **do not need Vercel `RESEND_API_KEY` for Auth OTP** if your Supabase custom SMTP is connected to Resend: Supabase sends those emails. Only configure Vercel's key once a real server-side notification flow is connected.

## 4. UI / flows to test

- `/register` → Supabase `signUp` → `/verify-email?flow=signup` → 6-digit OTP → `/account` (or other safe destination).
- `/login` → **Email OTP** tab → `signInWithOtp({shouldCreateUser:false})` → `/verify-email?flow=login` → `/workspace` or requested destination. This must not create an account for arbitrary addresses.
- `/forgot-password` → Supabase recovery email → `/verify-email?flow=recovery` → `/reset-password` → update password. A matching Supabase recovery session is required to reset it.
- `/mfa` → QR / authenticator TOTP → same 6-box UI → Supabase AAL2 check to access Seller/Admin. Authenticator codes are **not emailed**.
- Check focus, paste 6 digits, Backspace, arrow navigation, wrong/expired code feedback, resend cooldown, narrow screens and `prefers-reduced-motion`.

Important limits: the UI countdown is not the true token expiry timer; the real expiry and rate limits live on Supabase. Email verification must remain server-validated. A Preview URL is not a guarantee of a working SMTP connection.

## 5. Apply the patch in the existing VS Code + GitHub repo

From a **clean, committed Phase 3 source**:

```bash
cd ~/Downloads/tidalis-marketplace
git status
git switch -c feat/resend-otp-ui
git apply --check ~/Downloads/tidalis-resend-otp.patch
git apply ~/Downloads/tidalis-resend-otp.patch
npm install
npm run check:source
npm run test:phase3
npm run test:otp-email
npm run typecheck
npm run build
git add .
git diff --cached --stat
git commit -m "feat: Resend auth email OTP and animated verification UI"
git push -u origin feat/resend-otp-ui
```

If your Phase 3 branch has not yet been merged into `main`, branch **from the Phase 3 branch** (`feat/phase3-auth`) instead of `main`. If `git apply --check` fails, stop; inspect local changes instead of forcing the patch. Vercel should build a Preview Deployment from your new branch when GitHub integration is active. This patch does not automatically configure Resend/Supabase or deploy anything.

## 6. Security checklist

- Never commit OTPs, sender/API credentials, SMTP passwords, or `service_role` keys.
- Rate-limit at Supabase server level, add CAPTCHA to public flows if abused, and monitor delivery/failures.
- Restrict recipients of sensitive transactional emails to addresses derived from authenticated backend events.
- Do not expose arbitrary “send email” endpoints.
- Real Sender domain identity and Return-Path must be verified and aligned in DNS.
- In production verify sensitive authorization and TOTP step-up remain required for Seller/Admin even if a user logged in with email OTP.
