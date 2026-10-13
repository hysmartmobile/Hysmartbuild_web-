import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const migration=fs.readFileSync(new URL('../supabase/migrations/20261002180000_v1_4_3_global_billing_identity.sql',import.meta.url),'utf8');
const companyService=fs.readFileSync(new URL('../src/services/companyService.js',import.meta.url),'utf8');
const billingService=fs.readFileSync(new URL('../src/services/billingService.js',import.meta.url),'utf8');
const providers=fs.readFileSync(new URL('../src/services/paymentProviders.js',import.meta.url),'utf8');
const billingRoute=fs.readFileSync(new URL('../src/routes/billing.js',import.meta.url),'utf8');

test('V1.4.3 enforces one created company per user without deleting duplicates',()=>{assert.match(migration,/create unique index if not exists companies_one_created_company_per_user_idx/);assert.match(migration,/V1_4_3_COMPANY_OWNER_DUPLICATES_EXIST/);assert.match(companyService,/COMPANY_CREATION_LIMIT_REACHED/);});
test('V1.4.3 stores company billing identity and country catalog',()=>{assert.match(migration,/billing_countries/);assert.match(migration,/subscription_plan_prices/);assert.match(migration,/billing_country_code/);assert.match(companyService,/country_code/);});
test('V1.4.3 has requested pricing',()=>{assert.match(migration,/150000::numeric/);assert.match(migration,/350000::numeric/);assert.match(migration,/500000::numeric/);assert.match(migration,/149::numeric/);assert.match(migration,/349::numeric/);assert.match(migration,/499::numeric/);});
test('V1.4.3 supports provider routing and Stripe without trusting browser pricing',()=>{assert.match(billingService,/resolvePrice/);assert.match(billingService,/routeProvider/);assert.match(billingService,/stripe/);assert.match(providers,/class StripeProvider/);assert.match(billingRoute,/billing\/countries/);});
test('V1.4.3 supports invitation-based membership',()=>{assert.match(migration,/company_invitations/);assert.match(migration,/user:invite/);assert.match(companyService,/createInvitation/);assert.match(companyService,/acceptInvitation/);});
test('V1.4.3 originally defined the trial lifecycle; V5.7.2 changes activation to an explicit user choice',()=>{assert.match(migration,/interval '14 days'/);assert.match(migration,/initialize_company_subscription/);});
