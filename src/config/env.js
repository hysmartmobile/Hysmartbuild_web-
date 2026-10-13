import "dotenv/config";
import { z } from "zod";

const isHttpsUrl = (value) => { try { return new URL(value).protocol === "https:"; } catch { return false; } };

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  TRUST_PROXY: z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return false;
    if (typeof value === "boolean") return value;
    return String(value).trim().toLowerCase() === "true";
  }, z.boolean()),
  API_PREFIX: z.string().default("/api/v1"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
  FLW_SECRET_KEY: z.string().min(1).optional(),
  FLW_SECRET_HASH: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  CUSTOMER_CARE_LOCAL_MODEL_URL: z.string().url().default('http://127.0.0.1:11434'),
  CUSTOMER_CARE_LOCAL_MODEL_NAME: z.string().min(1).default('qwen2.5:7b'),
  HYSMART_PROJECT_AI_ENABLED: z.preprocess((value) => value === true || String(value || '').trim().toLowerCase() === 'true', z.boolean()).default(false),
  BILLING_CALLBACK_URL: z.string().url().default("http://localhost:5173/billing/callback"),
  WEB_APP_URL: z.string().url().default("http://localhost:5173")
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production') {
    if (value.CORS_ORIGIN.split(',').some((origin) => /localhost|127\.0\.0\.1/i.test(origin))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CORS_ORIGIN'], message: 'Production CORS_ORIGIN must not contain localhost or 127.0.0.1' });
    if (/localhost|127\.0\.0\.1/i.test(value.WEB_APP_URL)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['WEB_APP_URL'], message: 'Production WEB_APP_URL must not point to localhost or 127.0.0.1' });
    if (/localhost|127\.0\.0\.1/i.test(value.BILLING_CALLBACK_URL)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['BILLING_CALLBACK_URL'], message: 'Production BILLING_CALLBACK_URL must not point to localhost or 127.0.0.1' });
    if (value.CORS_ORIGIN.split(',').some((origin) => { try { return new URL(origin.trim()).protocol !== 'https:'; } catch { return true; } })) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CORS_ORIGIN'], message: 'Production CORS_ORIGIN entries must be valid HTTPS origins' });
    if (!isHttpsUrl(value.WEB_APP_URL)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['WEB_APP_URL'], message: 'Production WEB_APP_URL must use HTTPS' });
    if (!isHttpsUrl(value.BILLING_CALLBACK_URL)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['BILLING_CALLBACK_URL'], message: 'Production BILLING_CALLBACK_URL must use HTTPS' });
  }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  trustProxy: parsed.data.TRUST_PROXY,
  apiPrefix: parsed.data.API_PREFIX,
  corsOrigin: parsed.data.CORS_ORIGIN,
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseAnonKey: parsed.data.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  paystackSecretKey: parsed.data.PAYSTACK_SECRET_KEY,
  flutterwaveSecretKey: parsed.data.FLW_SECRET_KEY,
  flutterwaveSecretHash: parsed.data.FLW_SECRET_HASH,
  stripeSecretKey: parsed.data.STRIPE_SECRET_KEY,
  stripeWebhookSecret: parsed.data.STRIPE_WEBHOOK_SECRET,
  customerCareLocalModelUrl: parsed.data.CUSTOMER_CARE_LOCAL_MODEL_URL,
  customerCareLocalModelName: parsed.data.CUSTOMER_CARE_LOCAL_MODEL_NAME,
  projectAiEnabled: parsed.data.HYSMART_PROJECT_AI_ENABLED,
  billingCallbackUrl: parsed.data.BILLING_CALLBACK_URL,
  webAppUrl: parsed.data.WEB_APP_URL
};
