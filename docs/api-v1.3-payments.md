# V1.3 Subscription Payments

## Payment lifecycle

1. Company owner/admin opens Billing.
2. Web app requests active plans and current tenant billing state.
3. User selects plan, monthly/yearly interval, and Paystack or Flutterwave.
4. Backend derives the exact price from `subscription_plans`.
5. Backend creates or reuses the provider recurring plan for that HySmart plan/interval.
6. Backend initializes the gateway checkout and stores a `PENDING` tenant billing transaction.
7. Customer completes the hosted gateway checkout.
8. Gateway redirects to the HySmart billing callback for user experience only.
9. Gateway webhook is signature-validated and the transaction is re-queried with the provider.
10. The database reconciliation RPC checks tenant transaction reference, amount and currency, then atomically activates/extends the subscription and creates a paid invoice.
11. Duplicate webhook deliveries are idempotent through `billing_webhook_events`.
12. Provider-generated recurring charges can be reconciled against the stored provider customer ID.

## API

### Plans

`GET /api/v1/billing/plans`

### Company billing overview

`GET /api/v1/companies/:companyId/billing`

Requires `billing:read`.

### Start checkout

`POST /api/v1/companies/:companyId/billing/checkout`

```json
{
  "planCode": "GROWTH",
  "billingInterval": "MONTHLY",
  "provider": "PAYSTACK"
}
```

Requires `billing:checkout`.

### Verify a completed checkout

`POST /api/v1/companies/:companyId/billing/verify`

Paystack:

```json
{
  "provider": "PAYSTACK",
  "reference": "HS-..."
}
```

Flutterwave:

```json
{
  "provider": "FLUTTERWAVE",
  "reference": "HS-...",
  "transactionId": "123456"
}
```

### Webhooks

- `POST /api/v1/billing/webhooks/paystack`
- `POST /api/v1/billing/webhooks/flutterwave`

Webhooks are public endpoints and must be configured in the respective gateway dashboards. They do not accept tenant IDs from the caller. Tenant identity is recovered from the stored billing transaction or provider customer mapping.

## Environment

Server-only credentials:

- `PAYSTACK_SECRET_KEY`
- `FLW_SECRET_KEY`
- `FLW_SECRET_HASH`
- `BILLING_CALLBACK_URL`

Never expose gateway secret keys to React or React Native.

## Production configuration

Use the same environment mode for provider plans and credentials. Paystack plan codes are environment-specific; Flutterwave payment-plan IDs are also tied to the configured provider account/environment. The application creates and caches these provider plans when a HySmart plan is first purchased through that gateway.
