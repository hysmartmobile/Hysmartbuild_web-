# HySmart Build Backend v1.6.2 — Invitation Link Flow

## Invitation workflow

Owner → Create invitation → Copy secure link → Share through any channel → Invitee clicks link → Sign in/Create account → Accept invitation → Company membership created.

This release removes the mandatory Resend/email-sender dependency. HySmart Build does not send the invitation itself. The owner may share the generated link by email, WhatsApp, SMS, Telegram, or another channel.

## Security retained
- Cryptographically random invitation token.
- Only SHA-256 token hash is stored in the database.
- Invitation expires automatically.
- Invitation is single-use.
- Re-inviting the same email/company revokes the prior pending invitation.
- Invitee email must match the invitation email at acceptance.
- Company membership creation re-checks the subscription user limit atomically.
- Invitation acceptance remains authenticated.

## Configuration
Only `WEB_APP_URL` is needed for generated invitation links. No external email-sender configuration is required for company invitations.
