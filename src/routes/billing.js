
import { Router } from "express";
import { z } from "zod";

const PROVIDERS = ["PAYSTACK", "FLUTTERWAVE", "STRIPE"];

const checkoutSchema = z.object({
  planCode: z.string().trim().min(2).max(40),
  billingInterval: z.enum(["MONTHLY", "YEARLY"]),
  provider: z.enum(PROVIDERS).optional(),
  name: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
});

const verifySchema = z
  .object({
    provider: z.enum(PROVIDERS).optional().default("PAYSTACK"),
    reference: z.string().trim().min(3).max(180),
    transactionId: z.string().trim().min(1).max(180).optional(),
    sessionId: z.string().trim().min(1).max(180).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.provider === "FLUTTERWAVE" && !input.transactionId) {
      ctx.addIssue({
        code: "custom",
        path: ["transactionId"],
        message: "Flutterwave transactionId is required",
      });
    }

    if (input.provider === "STRIPE" && !input.sessionId) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionId"],
        message: "Stripe sessionId is required",
      });
    }
  });

const cancelSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export function createBillingRouter({
  billingService,
  authMiddleware,
  authorize,
}) {
  const r = Router();

  // Available billing countries
  r.get(
    "/billing/countries",
    authMiddleware,
    asyncRoute(async (_req, res) => {
      const data = await billingService.countries();

      res.json({
        success: true,
        data,
      });
    }),
  );

  // Payment gateways enabled for the selected billing country and currency
  r.get(
    "/billing/providers",
    authMiddleware,
    asyncRoute(async (req, res) => {
      const data = await billingService.providers({ countryCode: req.query.countryCode });
      res.json({ success: true, data });
    }),
  );

  // Available subscription plans and localized prices
  r.get(
    "/billing/plans",
    authMiddleware,
    asyncRoute(async (req, res) => {
      const data = await billingService.plans({
        countryCode: req.query.countryCode,
      });

      res.json({
        success: true,
        data,
      });
    }),
  );

  // Company billing overview
  r.get(
    "/companies/:companyId/billing",
    authMiddleware,
    authorize("billing:read"),
    asyncRoute(async (req, res) => {
      const data = await billingService.overview({
        companyId: req.params.companyId,
      });

      res.json({
        success: true,
        data,
      });
    }),
  );

  // Billing status available to a company member
  r.get(
    "/companies/:companyId/billing/status",
    authMiddleware,
    asyncRoute(async (req, res) => {
      const data = await billingService.memberStatus({
        companyId: req.params.companyId,
        userId: req.user.id,
      });

      res.json({
        success: true,
        data,
      });
    }),
  );

  // Start a free trial
  r.post(
    "/companies/:companyId/billing/trial",
    authMiddleware,
    authorize("billing:manage"),
    asyncRoute(async (req, res) => {
      const data = await billingService.startTrial({
        companyId: req.params.companyId,
        userId: req.user.id,
      });

      res.status(201).json({
        success: true,
        data,
        message: "Your 14-day free trial is now active",
      });
    }),
  );

  // Initialize a paid subscription checkout
  r.post(
    "/companies/:companyId/billing/checkout",
    authMiddleware,
    authorize("billing:checkout"),
    asyncRoute(async (req, res) => {
      const input = checkoutSchema.parse(req.body);

      const data = await billingService.checkout({
        companyId: req.params.companyId,
        userId: req.user.id,
        email: req.user.email,
        name:
          input.name ||
          req.user.user_metadata?.full_name ||
          req.user.email,
        phone: input.phone || req.user.phone,
        planCode: input.planCode,
        billingInterval: input.billingInterval,
        providerName: input.provider,
      });

      res.status(201).json({
        success: true,
        data,
        message: "Checkout initialized",
      });
    }),
  );

  // Subscription usage
  r.get(
    "/companies/:companyId/billing/usage",
    authMiddleware,
    authorize("billing:read"),
    asyncRoute(async (req, res) => {
      const data = await billingService.usage({
        companyId: req.params.companyId,
      });

      res.json({
        success: true,
        data,
      });
    }),
  );

  // Cancel subscription renewal
  r.post(
    "/companies/:companyId/billing/cancel",
    authMiddleware,
    authorize("billing:manage"),
    asyncRoute(async (req, res) => {
      const input = cancelSchema.parse(req.body);

      const data = await billingService.cancel({
        companyId: req.params.companyId,
        userId: req.user.id,
        reason: input.reason,
      });

      res.json({
        success: true,
        data,
        message: "Subscription cancellation scheduled",
      });
    }),
  );

  // Resume subscription renewal
  r.post(
    "/companies/:companyId/billing/resume",
    authMiddleware,
    authorize("billing:manage"),
    asyncRoute(async (req, res) => {
      const data = await billingService.resume({
        companyId: req.params.companyId,
        userId: req.user.id,
      });

      res.json({
        success: true,
        data,
        message: "Subscription renewal restored",
      });
    }),
  );

  // Verify a payment with its actual provider
  r.post(
    "/companies/:companyId/billing/verify",
    authMiddleware,
    authorize("billing:checkout"),
    asyncRoute(async (req, res) => {
      const input = verifySchema.parse(req.body);

      // IMPORTANT:
      // BillingService.verify() expects "providerName",
      // while the HTTP request schema uses "provider".
      // Map the fields explicitly to avoid passing an
      // undefined provider into the transaction lookup.
      const result = await billingService.verify({
        companyId: req.params.companyId,
        userId: req.user.id,
        providerName: input.provider,
        reference: input.reference,
        transactionId: input.transactionId,
        sessionId: input.sessionId,
      });

      res.json({
        success: true,
        data: result,
        message:
          result.status === "SUCCESS"
            ? "Payment verified and subscription activated"
            : "Payment not completed",
      });
    }),
  );

  // Paystack webhook
  r.post(
    "/billing/webhooks/paystack",
    asyncRoute(async (req, res) => {
      const result = await billingService.webhook({
        providerName: "PAYSTACK",
        rawBody: req.rawBody || Buffer.from(JSON.stringify(req.body)),
        payload: req.body,
        signature: req.headers["x-paystack-signature"],
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    }),
  );

  // Stripe webhook
  r.post(
    "/billing/webhooks/stripe",
    asyncRoute(async (req, res) => {
      const result = await billingService.webhook({
        providerName: "STRIPE",
        rawBody: req.rawBody || Buffer.from(JSON.stringify(req.body)),
        payload: req.body,
        signature: req.headers["stripe-signature"],
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    }),
  );

  // Flutterwave webhook
  r.post(
    "/billing/webhooks/flutterwave",
    asyncRoute(async (req, res) => {
      const result = await billingService.webhook({
        providerName: "FLUTTERWAVE",
        rawBody: req.rawBody || Buffer.from(JSON.stringify(req.body)),
        payload: req.body,
        signature:
          req.headers["flutterwave-signature"] ||
          req.headers["verif-hash"],
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    }),
  );

  return r;
}
