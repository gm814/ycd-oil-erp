# Password recovery: email or WhatsApp

The login page links to `/forgot-password`. The employee enters their username or
account email and chooses email or WhatsApp. The destination is resolved on the
server from `User.email` or the administrator-enrolled `User.recoveryWhatsApp`; the request cannot
supply a new delivery address. Saudi local mobile numbers are normalized to E.164.
Other international numbers must already use E.164. No SMS option is exposed.

Both channels are disabled by default. The implementation uses an isolated Twilio
Verify service; **no external account was created, paid plan activated, message
sent or hosted environment changed as part of this code change**.

## Activation (deployment operator)

1. Apply the additive `20261012133000_password_recovery` migration with the usual
   deployment migration command. It adds challenge and rate-limit tables only.
2. Configure a **dedicated password-recovery** Verify service, never a service
   shared with login, signup or other verification purposes. Use 6-digit codes and
   a 10-minute expiry. Set up its email integration (SendGrid sender/domain and
   verification template) and approved WhatsApp authentication delivery. Configure
   the template to clearly identify YCD OIL and password recovery.
3. Privately set `RECOVERY_TWILIO_ACCOUNT_SID`, `RECOVERY_TWILIO_AUTH_TOKEN` and
   `RECOVERY_TWILIO_SERVICE_SID` in the deployment secret settings. Do not commit
   these values, send them in chat, or put them in `NEXT_PUBLIC_*` variables.
4. Ensure `AUTH_SECRET` and canonical `APP_ORIGIN` (or `RENDER_EXTERNAL_URL`) are
   set. Verify the ownership and accuracy of existing employee contacts before
   enabling them for recovery. Enroll WhatsApp recovery numbers in إدارة المستخدمين after verifying ownership. Recovery deliberately cannot enroll new contacts. HR contact phone numbers are never used automatically, so HR contact editing does not grant account recovery access. WhatsApp recovery numbers are unique per account; changing either recovery contact invalidates pending challenges.
5. On UAT only, enable `RECOVERY_CHANNELS=email,whatsapp` (or one channel), and
   confirm actual delivery and reset using an authorized test account. Check the
   display name, Arabic message, spam folder, WhatsApp receipt, old-session
   rejection, changed-contact rejection and the email-only/WhatsApp-only cases.
6. Enable production only after delivery/UAT approval. Clearing RECOVERY_CHANNELS
   disables both the form and reset endpoints without removing the login link.

## Controls and operational limits

- Generic accepted response and random 256-bit challenge handle for unknown,
  suspended, missing-contact, throttled or delivery-failed accounts. No destination
  preview, account existence or provider message is returned publicly.
- Request response waits at least 9 seconds to cover normal provider latency;
  provider calls time out at 8 seconds. Exceptional network/database latency can
  still vary; this is not a constant-time guarantee.
- Challenges are HMAC-hashed with AUTH_SECRET in storage; no plaintext OTP or new
  password is logged. The provider SID is never returned to the client.
- Same-origin JSON requests only; request bodies capped at 2 KiB while reading.
- Fixed-window database limits: 100 send attempts/hour globally, 5/identifier/hour,
  3/account/hour, 3/destination/hour, 1/account/minute across both choices. Completion
  checks capped at 600/hour globally and 5/challenge. Limits survive deploys and
  multiple application instances. Global budgets intentionally fail closed and
  can temporarily affect everyone under abuse; additionally set provider spending
  alerts and edge rate limits appropriate to the deployment.
- Verify approval is bound to the exact saved verification SID. Local challenge
  expires after 10 minutes. Consumption, password hash update, session-version
  increment, lockout clearing, sibling-challenge invalidation and audit record
  commit together. User/contact rows are locked and checked again before commit.
- Existing password policy is retained. Successful recovery signs the user out
  and requires normal login. It never changes roles or revives suspended users.
- Delivery failures are recorded as PASSWORD_RECOVERY_DELIVERY_FAILED without
  personal data. Records expired more than 24 hours ago are cleaned on subsequent
  accepted-budget requests. Inspect delivery failures on the provider dashboard.
- If verification succeeds at the provider but the database commit fails, the
  user must request a new code; no bypass or reusable approval is retained.

## Verification

`RECOVERY_TEST_DATABASE=disposable DATABASE_URL=<local-disposable-postgres-url> npm run verify:password-recovery`

The test refuses non-local hosts and requires explicit disposable mode. It clears
recovery limit/challenge tables, so never point it at a real operational database.
Provider calls are fakes: no paid messages, real accounts or credentials are used.
It checks channel routing, provider SID binding, disabled configuration, request
origin/body limits, expiry, retries, concurrent consumption, replay, contact and
session changes, suspended/missing accounts, aliases, limits and safe audit.

Development validation can run against PGlite/socket with connection_limit=1 and
all migration SQL applied to an empty database. This validates SQL and transaction
behavior but does not replace a multi-connection PostgreSQL UAT concurrency check.

Provider references:
- https://www.twilio.com/docs/verify/api/verification
- https://www.twilio.com/docs/verify/api/verification-check
- https://www.twilio.com/docs/verify/email
- https://www.twilio.com/docs/verify/whatsapp/byo
