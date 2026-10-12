# Tidalis — Auth UX Patch: Optional MFA for Buyer / Required MFA for Seller & Admin

> Applies to Phase 5.7.1 **or** Phase 5.8. These auth source files are unchanged between those baselines. Does **not** include migrations or modifications to Supabase Auth settings.

## What changes

- New Buyer: sign up with email/password → verify email OTP → `/account`, without MFA enrollment.
- Password/Email OTP login retains existing behavior; buyers can access `/account` with AAL1.
- New `/account/security`: shows current MFA session state (`aal1`/`aal2`) and allows **optional** enrollment by opening `/mfa`. Do not mistake this voluntary enrollment for a platform-wide requirement.
- Seller/Admin: existing server route guards still require role + AAL2, with Supabase TOTP challenge at `/mfa` when needed. DB/RLS authorization is **unchanged**.
- Password reset: if an MFA factor is already enrolled, redirect a signed-in AAL1 user to `/mfa?next=%2Freset-password` before `auth.updateUser({password})`. This also applies to a Buyer who voluntarily enabled MFA. Email OTP is not TOTP.
- Help text on login, email verification, MFA screen and workspaces clarified in Thai.

## Apply in VS Code

Download `tidalis-auth-optional-buyer-mfa.patch` into `~/Downloads`.

```bash
cd ~/Downloads/tidalis-marketplace
git status
# Ensure prior changes are committed before creating a feature branch.
git switch -c feat/auth-optional-buyer-mfa
git apply --check ~/Downloads/tidalis-auth-optional-buyer-mfa.patch
git apply ~/Downloads/tidalis-auth-optional-buyer-mfa.patch

npm install
node scripts/test-auth-optional-mfa.cjs
npm run test:phase3
npm run test:phase5-7-1
# Only if Phase 5.8 is already installed:
# npm run test:phase5-8
npm run typecheck
npm run build
```

If `git apply --check` fails, stop and share the error—do not use `--force`. If a branch already exists, switch to it instead of recreating it.

After tests and review:

```bash
git add .
git diff --cached --check
git commit -m "fix(auth): make buyer MFA optional and guide account recovery"
git push -u origin feat/auth-optional-buyer-mfa
```

Create a pull request and test on a Vercel Preview connected to a separate Supabase **Staging** project. Check that the preview environment variables refer to Staging before signing up or changing passwords.

## Manual staging checks

1. Register a **new Buyer** using email/password; verify email via OTP; arrive at `/account` without ever opening `/mfa`.
2. Log out and back in via password; verify `/account` and `/workspace` work without MFA.
3. Open `/account/security` and verify it reports MFA not enabled. The Buyer can **choose** to open `/mfa` but should not be redirected there by normal login.
4. Try `/admin` and `/seller` with a Buyer-only account; role gates deny access (no ability to bypass with `next` query strings).
5. Use Seller/Admin staging accounts with verified TOTP; sign in with AAL1, open Seller/Admin pages, verify redirect to `/mfa`; finish TOTP challenge and verify access to authorized pages only.
6. Use an MFA-enrolled account with Email OTP AAL1; open `/reset-password`, attempt update, and verify redirect to `/mfa?next=%2Freset-password`; after TOTP verify, password update succeeds, then log back in with the new password.
7. With a Buyer who never enrolled MFA, valid recovery session should permit password change **without** an AAL2 detour (Supabase may still enforce extra verification depending on auth settings).
8. Confirm no new MFA factor is auto-enrolled for newly created Buyers; check Auth logs, redirect behavior, and RLS errors.

## Important security boundaries

- Supabase enforces AAL2 for changing password/email on MFA-enrolled accounts; this patch does **not** bypass that rule.
- Avoid disabling MFA in Supabase for the whole project; it would weaken existing seller/admin accounts.
- This patch does not change `lib/auth.ts`, SQL functions, RLS, or database data.
- Structural tests only check source contracts. Run complete Next.js build, preview and Supabase staging end-to-end tests.
- An MFA-enrolled Buyer is still asked for MFA before sensitive operations even if Buyer login uses AAL1.
- If the old recovery email template still sends links while UI expects a six-digit OTP, separately update Supabase **Reset Password** email template to `{{ .Token }}` after review; this patch does not change email templates.
