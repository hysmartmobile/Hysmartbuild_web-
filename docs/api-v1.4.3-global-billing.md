# V1.4.3 Global Billing API

## Country catalog
`GET /api/v1/billing/countries`

Returns active billing countries with ISO country code, default currency, locale, timezone and unit system.

## Localized plans
`GET /api/v1/billing/plans?countryCode=NG`

The server returns plan metadata plus the configured country/currency price. The browser must not calculate or submit a payable amount.

## Company billing
`GET /api/v1/companies/:companyId/billing`

Returns company billing identity, subscription state, transactions and invoices.

## Checkout
`POST /api/v1/companies/:companyId/billing/checkout`

```json
{
  "planCode": "STARTER",
  "billingInterval": "MONTHLY"
}
```

`provider` is optional. If omitted, the backend selects the highest-priority configured provider for the company's billing country/currency. If supplied, it must be an enabled route for that country/currency.

## Verification
`POST /api/v1/companies/:companyId/billing/verify`

For Paystack/Flutterwave, provide the provider reference and transaction ID when required. For Stripe, provide the checkout session ID and the original HySmart reference.

## Webhooks
- `POST /api/v1/billing/webhooks/paystack`
- `POST /api/v1/billing/webhooks/flutterwave`
- `POST /api/v1/billing/webhooks/stripe`

Webhook signatures are verified server-side. Successful provider events are reconciled against the HySmart transaction and server-derived amount/currency before subscription activation.
