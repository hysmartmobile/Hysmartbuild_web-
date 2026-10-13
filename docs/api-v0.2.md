# HySmart Build API V0.2

Base path: `/api/v1`

## Authentication

### POST `/auth/register`
Body: `{ email, password, fullName }`

Uses Supabase Auth. The application does not store passwords.

### POST `/auth/login`
Body: `{ email, password }`

Returns the Supabase user/session. The client stores the session using Supabase Auth.

### POST `/auth/password-reset`
Body: `{ email }`

Requests Supabase password-reset email. The response intentionally does not reveal whether an account exists.

### POST `/auth/logout`
Bearer token recommended. The client should also call Supabase `signOut()` to clear its local session.

## Authenticated account

### GET `/me`
Requires `Authorization: Bearer <supabase-access-token>`.

Returns the authenticated user's profile and only active company memberships belonging to that user.

## Companies

### GET `/companies`
Requires authentication. Returns only the authenticated user's active memberships.

### POST `/companies`
Requires authentication.

Body:
```json
{
  "name": "Example Construction Ltd",
  "legalName": "Example Construction Limited",
  "phone": "+234...",
  "email": "office@example.com"
}
```

The server takes the user ID from the verified Supabase access token. The request cannot supply a user ID or membership role. The authenticated user becomes `COMPANY_OWNER`.

### GET `/companies/:companyId/membership`
Requires authentication. Returns membership only if the authenticated user belongs to that company. A missing/unauthorized company returns the same `404` access-denied response to avoid exposing tenant membership information.
