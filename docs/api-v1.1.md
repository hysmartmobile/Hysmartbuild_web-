# HySmart Build V1.1 API — Notifications & Communication

## Messages
- `GET /api/v1/companies/:companyId/projects/:projectId/messages?page=1&pageSize=50`
- `POST /api/v1/companies/:companyId/messages`
  - body: `{ projectId, recipientUserId?, body }`
  - message creation and notification fan-out use the guarded `send_project_message` RPC atomically.

## Notifications
- `GET /api/v1/companies/:companyId/notifications?page=1&pageSize=50&unreadOnly=true`
- `GET /api/v1/companies/:companyId/notifications/unread-count`
- `POST /api/v1/companies/:companyId/notifications/:notificationId/read`
- `POST /api/v1/companies/:companyId/notifications/read-all`

All endpoints require authentication, company membership and the corresponding V1.1 permission. Notification reads are restricted to the authenticated recipient.
