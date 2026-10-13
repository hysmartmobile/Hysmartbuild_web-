import { randomUUID } from "node:crypto";

const majorUnits=(minor,currency)=>new Set(["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]).has(String(currency).toUpperCase())?Number(minor):Number(minor)/100;
const minorUnits=(amount,currency)=>new Set(["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]).has(String(currency).toUpperCase())?Math.round(Number(amount)):Math.round(Number(amount)*100);

async function fetchCurrencyRates(baseCurrency) {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
  if (!response.ok) throw Object.assign(new Error("The exchange-rate service is temporarily unavailable."), { code: "EXCHANGE_RATE_UNAVAILABLE", status: 503 });
  const payload = await response.json();
  if (payload?.result !== "success" || !payload?.rates || !Number.isFinite(Number(payload.rates[baseCurrency]))) {
    throw Object.assign(new Error(`The exchange-rate service returned no usable rates for ${baseCurrency}.`), { code: "EXCHANGE_RATE_UNAVAILABLE", status: 503 });
  }
  // This provider publishes rates against USD. Return the rate table unchanged so
  // conversion can calculate source -> target without repeated network requests.
  return payload.rates;
}

export class BillingService {
  constructor({supabase,paystack,flutterwave,stripe,callbackUrl,exchangeRateFetcher}){this.supabase=supabase;this.paystack=paystack;this.flutterwave=flutterwave;this.stripe=stripe;this.callbackUrl=callbackUrl;this.exchangeRateFetcher=exchangeRateFetcher||fetchCurrencyRates;this.exchangeRateCache=new Map();this.dynamicProviderPlanCache=new Map();}
  provider(name){const key=String(name).toUpperCase();const map={PAYSTACK:this.paystack,FLUTTERWAVE:this.flutterwave,STRIPE:this.stripe};if(!map[key]){const e=new Error(`${key} is not configured`);e.code=`${key}_NOT_CONFIGURED`;e.status=503;throw e;}return map[key];}
  providerConfigured(name){try{const instance=this.provider(name);return typeof instance.secretKey==="string"&&instance.secretKey.trim().length>0;}catch{return false;}}
  async company({companyId}){const {data,error}=await this.supabase.from("companies").select("id,name,country_code,billing_country,currency_code,timezone,locale,unit_system").eq("id",companyId).single();if(error)throw error;return data;}
  async countries(){const {data,error}=await this.supabase.from("billing_countries").select("country_code,name,currency_code,locale,timezone,unit_system").eq("active",true).order("name");if(error)throw error;return data||[];}
  // Keep provider capability checks in application code so an incorrectly enabled
  // route cannot send an unsupported subscription currency to a gateway.
  supportsSubscriptionCurrency(providerName, currencyCode) {
    const provider = String(providerName || "").trim().toUpperCase();
    const currency = String(currencyCode || "").trim().toUpperCase();
    // Paystack subscription plans must use NGN for the Nigerian market.
    if (provider === "PAYSTACK") return currency === "NGN";
    // HySmart's Stripe subscription route is reserved for USD billing.
    if (provider === "STRIPE") return currency === "USD";
    // Flutterwave is allowed only where an explicit country/currency route
    // is enabled and its merchant account supports that route.
    return provider === "FLUTTERWAVE";
  }

  supportsProviderRoute(providerName, countryCode, currencyCode) {
    const provider = String(providerName || "").trim().toUpperCase();
    const country = String(countryCode || "").trim().toUpperCase();
    const currency = String(currencyCode || "").trim().toUpperCase();
    if (!this.supportsSubscriptionCurrency(provider, currency)) return false;
    if (provider === "PAYSTACK") return country === "NG" && currency === "NGN";
    if (provider === "STRIPE") return country !== "NG" && currency === "USD";
    return provider === "FLUTTERWAVE";
  }

  async providers({countryCode}){const country=String(countryCode||"").trim().toUpperCase();if(!country){const e=new Error("Billing country is required");e.code="BILLING_COUNTRY_REQUIRED";e.status=400;throw e;}const {data:catalog,error:catalogError}=await this.supabase.from("billing_countries").select("country_code,currency_code,active").eq("country_code",country).eq("active",true).maybeSingle();if(catalogError)throw catalogError;if(!catalog){const e=new Error("Unsupported billing country");e.code="COUNTRY_NOT_SUPPORTED";e.status=400;throw e;}const {data,error}=await this.supabase.from("payment_provider_routes").select("provider,priority").eq("country_code",country).eq("currency_code",catalog.currency_code).eq("enabled",true).order("priority",{ascending:true});if(error)throw error;return(data||[]).filter(row=>this.providerConfigured(row.provider)&&this.supportsProviderRoute(row.provider,country,catalog.currency_code)).map(row=>({provider:row.provider,countryCode:country,currencyCode:catalog.currency_code}));}
  async getExchangeRates(baseCurrency) {
    const base = String(baseCurrency || "").trim().toUpperCase();
    if (!base || !/^[A-Z]{3}$/.test(base)) throw Object.assign(new Error("A valid base currency is required for price conversion."), { code: "INVALID_BASE_CURRENCY", status: 400 });
    const cached = this.exchangeRateCache.get(base);
    if (cached && cached.expiresAt > Date.now()) return cached;
    const rates = await this.exchangeRateFetcher(base);
    if (!rates || typeof rates !== "object" || !Number.isFinite(Number(rates[base])) || Number(rates[base]) <= 0) {
      throw Object.assign(new Error(`Live exchange rates are unavailable for ${base}. Please configure a local subscription price or try again later.`), { code: "EXCHANGE_RATE_UNAVAILABLE", status: 503 });
    }
    const result = { rates, fetchedAt: new Date().toISOString(), expiresAt: Date.now() + 60 * 60 * 1000 };
    this.exchangeRateCache.set(base, result);
    return result;
  }

  async convertAmount(amount, fromCurrency, toCurrency) {
    const from = String(fromCurrency || "").toUpperCase();
    const to = String(toCurrency || "").toUpperCase();
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) throw Object.assign(new Error("Invalid subscription price."), { code: "INVALID_SUBSCRIPTION_PRICE", status: 500 });
    if (from === to) return { amount: value, rate: 1, fetchedAt: null };
    const { rates, fetchedAt } = await this.getExchangeRates("USD");
    const fromRate = from === "USD" ? 1 : Number(rates[from]);
    const toRate = to === "USD" ? 1 : Number(rates[to]);
    if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
      throw Object.assign(new Error(`The exchange-rate service does not support ${from} to ${to}. Configure a country-specific price for reliable checkout.`), { code: "EXCHANGE_RATE_UNAVAILABLE", status: 503 });
    }
    const amountInTarget = value / fromRate * toRate;
    const zeroDecimal = new Set(["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]);
    const digits = zeroDecimal.has(to) ? 0 : 2;
    return { amount: Number(amountInTarget.toFixed(digits)), rate: toRate / fromRate, fetchedAt };
  }

  async plans({countryCode}) {
    let country = String(countryCode || "NG").trim().toUpperCase();
    const { data: countryInfo, error: countryError } = await this.supabase.from("billing_countries").select("country_code,currency_code").eq("country_code", country).eq("active", true).maybeSingle();
    if (countryError) throw countryError;
    if (!countryInfo) throw Object.assign(new Error("Unsupported billing country."), { code: "COUNTRY_NOT_SUPPORTED", status: 400 });
    const { data: planRows, error: plansError } = await this.supabase.from("subscription_plans").select("id,code,name,description,max_users,max_projects,max_storage_mb").eq("active", true).order("name");
    if (plansError) throw plansError;
    const plans = planRows || [];
    if (!plans.length) return [];
    const ids = plans.map(plan => plan.id);
    const { data: priceRows, error: priceError } = await this.supabase.from("subscription_plan_prices").select("*").in("plan_id", ids).eq("active", true);
    if (priceError) throw priceError;
    const prices = priceRows || [];
    const localRates = prices.filter(price => price.country_code === country && price.currency_code === countryInfo.currency_code);
    let baseCurrencyRows = prices.filter(price => price.country_code === "US" && price.currency_code === "USD");
    if (!baseCurrencyRows.length) baseCurrencyRows = prices.filter(price => price.country_code === "NG" && price.currency_code === "NGN");
    if (!baseCurrencyRows.length) baseCurrencyRows = prices.filter(price => price.currency_code === "USD");
    if (!baseCurrencyRows.length) baseCurrencyRows = prices;
    const localByPlan = new Map(localRates.map(price => [price.plan_id, price]));
    const baseByPlan = new Map(baseCurrencyRows.map(price => [price.plan_id, price]));
    const output = [];
    for (const plan of plans) {
      const local = localByPlan.get(plan.id);
      if (local) {
        output.push({ ...plan, price: { countryCode: local.country_code, currency: local.currency_code, monthlyAmount: Number(local.monthly_amount), yearlyAmount: Number(local.yearly_amount), source: "COUNTRY_PRICE" } });
        continue;
      }
      const base = baseByPlan.get(plan.id);
      if (!base) { output.push({ ...plan, price: null }); continue; }
      try {
        const [monthly, yearly] = await Promise.all([
          this.convertAmount(base.monthly_amount, base.currency_code, countryInfo.currency_code),
          this.convertAmount(base.yearly_amount, base.currency_code, countryInfo.currency_code),
        ]);
        output.push({ ...plan, price: { countryCode: country, currency: countryInfo.currency_code, monthlyAmount: monthly.amount, yearlyAmount: yearly.amount, source: "EXCHANGE_RATE_ESTIMATE", baseCurrency: base.currency_code, exchangeRate: monthly.rate, exchangeRateAsOf: monthly.fetchedAt } });
      } catch (error) {
        // Keep plans visible, but do not fabricate a converted price if the rate service fails.
        output.push({ ...plan, price: null, pricingUnavailableReason: error.code === "EXCHANGE_RATE_UNAVAILABLE" ? error.message : "Localized pricing is temporarily unavailable." });
      }
    }
    return output;
  }
  async memberStatus({ companyId, userId }) {
    const { data: membership, error: membershipError } = await this.supabase
      .from("company_members")
      .select("role,status")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) {
      const e = new Error("You do not have access to this company.");
      e.code = "COMPANY_ACCESS_DENIED"; e.status = 403; throw e;
    }
    const [{ data: subscription, error: subscriptionError }, { data: company, error: companyError }] = await Promise.all([
      this.supabase.from("company_subscriptions").select("id,status,trial_ends_at,current_period_start,current_period_end,grace_period_ends_at,cancel_at_period_end,subscription_plans(name,code)").eq("company_id", companyId).maybeSingle(),
      this.supabase.from("companies").select("id,name,country_code,billing_country,currency_code").eq("id", companyId).single(),
    ]);
    if (subscriptionError) throw subscriptionError;
    if (companyError) throw companyError;
    return { company, subscription, subscriptionStatus: this.effectiveStatus(subscription), role: membership.role };
  }

  async overview({companyId}){const [{data:subscription,error:sErr},{data:transactions,error:tErr},{data:invoices,error:iErr},{data:company,error:cErr}]=await Promise.all([this.supabase.from("company_subscriptions").select("*,subscription_plans(*)").eq("company_id",companyId).maybeSingle(),this.supabase.from("billing_transactions").select("id,provider,reference,amount,currency,billing_interval,status,checkout_url,paid_at,created_at,subscription_plans(name,code)").eq("company_id",companyId).order("created_at",{ascending:false}).limit(20),this.supabase.from("billing_invoices").select("id,invoice_number,amount,currency,status,due_at,paid_at,created_at").eq("company_id",companyId).order("created_at",{ascending:false}).limit(20),this.company({companyId})]);if(sErr)throw sErr;if(tErr)throw tErr;if(iErr)throw iErr;if(cErr)throw cErr;const usage=await this.usage({companyId});return{company,subscription,subscriptionStatus:this.effectiveStatus(subscription),usage,transactions:transactions||[],invoices:invoices||[]};}
  async assertCompanyOwner({ companyId, userId }) {
    const { data: membership, error } = await this.supabase
      .from("company_members")
      .select("role,status")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) throw error;
    if (!membership || membership.role !== "COMPANY_OWNER") {
      const e = new Error("Only the company creator/owner can upgrade, renew, start a trial, or change the subscription.");
      e.code = "COMPANY_OWNER_REQUIRED";
      e.status = 403;
      throw e;
    }
    return membership;
  }

  async startTrial({ companyId, userId }) {
    // Only the company owner may claim the trial, and a company may have only
    // one subscription row. Existing/expired trials cannot be restarted.
    await this.assertCompanyOwner({ companyId, userId });

    const { data: existing, error: existingError } = await this.supabase
      .from("company_subscriptions")
      .select("id,status,trial_ends_at")
      .eq("company_id", companyId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const e = new Error("A trial or subscription has already been claimed for this company. Choose a paid plan to continue or renew.");
      e.code = "SUBSCRIPTION_ALREADY_EXISTS"; e.status = 409; throw e;
    }

    const { data: plan, error: planError } = await this.supabase
      .from("subscription_plans")
      .select("id,code,name")
      .eq("code", "STARTER")
      .eq("active", true)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan) {
      const e = new Error("The free trial is not configured. Please choose a paid plan or contact support.");
      e.code = "TRIAL_PLAN_UNAVAILABLE"; e.status = 503; throw e;
    }

    const start = new Date();
    const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
    const { data, error } = await this.supabase
      .from("company_subscriptions")
      .insert({
        company_id: companyId,
        plan_id: plan.id,
        status: "TRIAL",
        billing_interval: "MONTHLY",
        current_period_start: start.toISOString(),
        current_period_end: end.toISOString(),
        trial_ends_at: end.toISOString(),
      })
      .select("*,subscription_plans(*)")
      .single();
    if (error) {
      if (error.code === "23505") {
        const e = new Error("A trial or subscription has already been claimed for this company. Choose a paid plan to continue or renew.");
        e.code = "SUBSCRIPTION_ALREADY_EXISTS"; e.status = 409; throw e;
      }
      throw error;
    }
    return data;
  }

  async usage({companyId}) {
    const { data, error } = await this.supabase.rpc("get_company_usage", { p_company_id: companyId });
    if (error) throw error;
    return data || { users:0, projects:0, storage_mb:0 };
  }

  async cancel({ companyId, userId, reason }) {
    await this.assertCompanyOwner({ companyId, userId });
    const { data, error } = await this.supabase.from("company_subscriptions")
      .update({ cancel_at_period_end:true, cancellation_reason:reason || null, updated_at:new Date().toISOString() })
      .eq("company_id",companyId).in("status",["TRIAL","ACTIVE","PAST_DUE","GRACE_PERIOD"])
      .select().maybeSingle();
    if(error)throw error;
    if(!data){const e=new Error("No active subscription found");e.code="SUBSCRIPTION_NOT_FOUND";e.status=404;throw e;}
    return data;
  }

  async resume({ companyId, userId }) {
    await this.assertCompanyOwner({ companyId, userId });
    const { data, error } = await this.supabase.from("company_subscriptions")
      .update({ cancel_at_period_end:false, cancellation_reason:null, cancelled_at:null, updated_at:new Date().toISOString() })
      .eq("company_id",companyId).in("status",["TRIAL","ACTIVE","PAST_DUE","GRACE_PERIOD"])
      .select().maybeSingle();
    if(error)throw error;
    if(!data){const e=new Error("No active subscription found");e.code="SUBSCRIPTION_NOT_FOUND";e.status=404;throw e;}
    return data;
  }

  effectiveStatus(subscription) {
    if(!subscription) return "NONE";
    const now=Date.now();
    if(subscription.status==="TRIAL" && (!subscription.trial_ends_at || new Date(subscription.trial_ends_at).getTime()<=now)) return "EXPIRED";
    if(["ACTIVE","PAST_DUE","GRACE_PERIOD"].includes(subscription.status) && subscription.current_period_end && new Date(subscription.current_period_end).getTime()<=now) {
      if(subscription.grace_period_ends_at && new Date(subscription.grace_period_ends_at).getTime()>now) return "GRACE_PERIOD";
      return "EXPIRED";
    }
    return subscription.status;
  }

  async resolvePrice({company,planId,billingInterval}) {
    const country = String(company.billing_country || company.country_code || "NG").trim().toUpperCase();
    const { data: countryInfo, error: countryError } = await this.supabase.from("billing_countries").select("country_code,currency_code,active").eq("country_code", country).eq("active", true).maybeSingle();
    if (countryError) throw countryError;
    if (!countryInfo) throw Object.assign(new Error("Unsupported billing country."), { code: "COUNTRY_NOT_SUPPORTED", status: 400 });
    const currency = String(countryInfo.currency_code || company.currency_code || "").toUpperCase();
    const { data: localPrice, error: localError } = await this.supabase.from("subscription_plan_prices").select("*").eq("plan_id", planId).eq("country_code", country).eq("currency_code", currency).eq("active", true).maybeSingle();
    if (localError) throw localError;
    if (localPrice) return { ...localPrice, pricing_source: "COUNTRY_PRICE", is_converted: false };
    const { data: rows, error: rowsError } = await this.supabase.from("subscription_plan_prices").select("*").eq("plan_id", planId).eq("active", true);
    if (rowsError) throw rowsError;
    const available = rows || [];
    const basePrice = available.find(row => row.country_code === "US" && row.currency_code === "USD") || available.find(row => row.country_code === "NG" && row.currency_code === "NGN") || available.find(row => row.currency_code === "USD") || available[0];
    if (!basePrice) throw Object.assign(new Error("This plan has no active base price. Configure a subscription price before accepting payments."), { code: "COUNTRY_PRICE_UNAVAILABLE", status: 400 });
    const [monthly, yearly] = await Promise.all([
      this.convertAmount(basePrice.monthly_amount, basePrice.currency_code, currency),
      this.convertAmount(basePrice.yearly_amount, basePrice.currency_code, currency),
    ]);
    return { ...basePrice, country_code: country, currency_code: currency, monthly_amount: monthly.amount, yearly_amount: yearly.amount, pricing_source: "EXCHANGE_RATE_ESTIMATE", is_converted: true, base_currency_code: basePrice.currency_code, exchange_rate: monthly.rate, exchange_rate_as_of: monthly.fetchedAt, id: `converted:${basePrice.id}:${country}:${currency}` };
  }
  async routeProvider({ countryCode, currencyCode, requestedProvider }) {
    const country = String(countryCode || "").trim().toUpperCase();
    const currency = String(currencyCode || "").trim().toUpperCase();

    const { data: routes, error } = await this.supabase
      .from("payment_provider_routes")
      .select("provider,priority")
      .eq("country_code", country)
      .eq("currency_code", currency)
      .eq("enabled", true)
      .order("priority", { ascending: true });
    if (error) throw error;

    const available = (routes || []).filter(
      (route) =>
        this.providerConfigured(route.provider) &&
        this.supportsProviderRoute(route.provider, country, currency)
    );

    if (requestedProvider) {
      const requested = String(requestedProvider).trim().toUpperCase();
      const matching = (routes || []).find(
        (route) => String(route.provider).toUpperCase() === requested
      );

      // Ignore stale/incompatible frontend selections only when a compatible,
      // enabled, configured route is available for the resolved billing country.
      if (
        matching &&
        this.providerConfigured(matching.provider) &&
        this.supportsProviderRoute(matching.provider, country, currency)
      ) {
        return String(matching.provider).toUpperCase();
      }

      const fallback = available[0];
      if (fallback) return String(fallback.provider).toUpperCase();

      const e = new Error(
        `No configured payment provider supports subscription checkout in ${country}/${currency}. Use Paystack for Nigeria/NGN, Stripe for USD outside Nigeria, or enable a supported Flutterwave route.`
      );
      e.code = "PROVIDER_CURRENCY_UNSUPPORTED";
      e.status = 400;
      throw e;
    }

    const selected = available[0];
    if (selected) return String(selected.provider).toUpperCase();

    const e = new Error(
      `No configured payment provider supports subscription checkout in ${country}/${currency}`
    );
    e.code = "NO_PAYMENT_PROVIDER";
    e.status = 503;
    throw e;
  }
  async ensureProviderPlan({plan,price,providerName,billingInterval}) {
    const key = String(providerName).toUpperCase();
    const amount = billingInterval === "YEARLY" ? Number(price.yearly_amount) : Number(price.monthly_amount);
    const convertedKey = `${key}:${plan.id}:${price.country_code}:${price.currency_code}:${billingInterval}:${amount}`;
    if (price.is_converted && this.dynamicProviderPlanCache.has(convertedKey)) return this.dynamicProviderPlanCache.get(convertedKey);
    if (key === "STRIPE") {
      const field = billingInterval === "YEARLY" ? "stripe_yearly_price_id" : "stripe_monthly_price_id";
      if (!price.is_converted && price[field]) return price[field];
      const provider = this.provider(key);
      let productId = price.stripe_product_id;
      if (!productId) {
        const created = await provider.createProduct({ name: `HySmart ${plan.name}`, description: plan.description });
        productId = created.productId;
        if (!price.is_converted) await this.supabase.from("subscription_plan_prices").update({ stripe_product_id: productId, updated_at: new Date().toISOString() }).eq("id", price.id);
      }
      const created = await provider.createPrice({ productId, amount, currency: price.currency_code, interval: billingInterval });
      if (!price.is_converted) await this.supabase.from("subscription_plan_prices").update({ [field]: created.priceId, updated_at: new Date().toISOString() }).eq("id", price.id);
      if (price.is_converted) this.dynamicProviderPlanCache.set(convertedKey, created.priceId);
      return created.priceId;
    }
    const field = key === "PAYSTACK" ? (billingInterval === "YEARLY" ? "paystack_yearly_plan_code" : "paystack_monthly_plan_code") : (billingInterval === "YEARLY" ? "flutterwave_yearly_plan_id" : "flutterwave_monthly_plan_id");
    if (!price.is_converted && price[field]) return price[field];
    const provider = this.provider(key);
    const created = key === "PAYSTACK"
      ? await provider.createPlan({ name: `HySmart ${plan.name} ${price.country_code} ${billingInterval}`, amountMinor: minorUnits(amount, price.currency_code), currency: price.currency_code, interval: billingInterval === "YEARLY" ? "annually" : "monthly" })
      : await provider.createPlan({ name: `HySmart ${plan.name} ${price.country_code} ${billingInterval}`, amount, currency: price.currency_code, interval: billingInterval === "YEARLY" ? "yearly" : "monthly" });
    const value = key === "PAYSTACK" ? created.planCode : created.planId;
    if (!price.is_converted) await this.supabase.from("subscription_plan_prices").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", price.id);
    if (price.is_converted) this.dynamicProviderPlanCache.set(convertedKey, value);
    return value;
  }
  async checkout({companyId,userId,email,name,phone,planCode,billingInterval,providerName}){await this.assertCompanyOwner({companyId,userId});const company=await this.company({companyId});const {data:plan,error:pErr}=await this.supabase.from("subscription_plans").select("*").eq("code",planCode).eq("active",true).maybeSingle();if(pErr)throw pErr;if(!plan){const e=new Error("Subscription plan not found");e.code="PLAN_NOT_FOUND";e.status=404;throw e;}const interval=String(billingInterval).toUpperCase();const price=await this.resolvePrice({company,planId:plan.id,billingInterval:interval});const amount=interval==='YEARLY'?Number(price.yearly_amount):Number(price.monthly_amount);const providerNameUpper=await this.routeProvider({countryCode:price.country_code,currencyCode:price.currency_code,requestedProvider:providerName});const providerPlan=await this.ensureProviderPlan({plan,price,providerName:providerNameUpper,billingInterval:interval});const reference=`HS-${companyId.slice(0,8)}-${Date.now()}-${randomUUID().slice(0,8)}`;const metadata={companyId,planCode:plan.code,billingInterval:interval,countryCode:price.country_code,currency:price.currency_code,pricingSource:price.pricing_source||"COUNTRY_PRICE",...(price.is_converted?{baseCurrency:price.base_currency_code,exchangeRate:price.exchange_rate,exchangeRateAsOf:price.exchange_rate_as_of}:{}),source:"hysmart-build-v1.6.0"};let checkout;if(providerNameUpper==='PAYSTACK')checkout=await this.provider(providerNameUpper).initialize({email,amountMinor:minorUnits(amount,price.currency_code),currency:price.currency_code,reference,metadata,planCode:providerPlan});else if(providerNameUpper==='FLUTTERWAVE')checkout=await this.provider(providerNameUpper).initialize({email,amount,currency:price.currency_code,reference,name,phone,metadata,paymentPlan:providerPlan});else checkout=await this.provider('STRIPE').initialize({priceId:providerPlan,reference,companyId});const {data,error}=await this.supabase.from("billing_transactions").insert({company_id:companyId,plan_id:plan.id,provider:providerNameUpper,reference,amount,currency:price.currency_code,billing_interval:interval,checkout_url:checkout.checkoutUrl,metadata,status:"PENDING"}).select().single();if(error)throw error;return{transaction:data,checkoutUrl:checkout.checkoutUrl,reference,provider:providerNameUpper,countryCode:price.country_code,currency:price.currency_code};}
  async verify({companyId,userId,providerName,reference,transactionId,sessionId}){await this.assertCompanyOwner({companyId,userId});const key=String(providerName).toUpperCase();const expected=await this.findTransaction({companyId,provider:key,reference});if(!expected){const e=new Error("Billing transaction not found");e.code="BILLING_TRANSACTION_NOT_FOUND";e.status=404;throw e;}let data;if(key==='PAYSTACK')data=await this.provider(key).verify(reference);else if(key==='FLUTTERWAVE')data=await this.provider(key).verify(transactionId);else data=await this.provider(key).verifySession(sessionId);let successful=false,paidAmount,currency,returnedReference,providerCustomerId,providerTransactionId;if(key==='STRIPE'){currency=String(data.currency||'').toUpperCase();successful=data.payment_status==='paid'&&data.status==='complete'&&Number.isFinite(Number(data.amount_total))&&currency===String(expected.currency).toUpperCase()&&majorUnits(data.amount_total,currency)===Number(expected.amount);paidAmount=majorUnits(data.amount_total,currency);returnedReference=String(data.metadata?.reference||data.subscription_details?.metadata?.reference||'');if(String(data.metadata?.companyId||'')!==String(companyId)){const e=new Error('Stripe checkout company mismatch');e.code='PAYMENT_COMPANY_MISMATCH';e.status=400;throw e;}providerCustomerId=data.customer?.id?String(data.customer.id):null;providerTransactionId=String(data.id||'');}else{returnedReference=key==='PAYSTACK'?String(data.reference||''):String(data.tx_ref||'');successful=String(data.status).toLowerCase()===(key==='PAYSTACK'?'success':'successful');paidAmount=key==='PAYSTACK'?majorUnits(data.amount,data.currency||expected.currency):Number(data.amount);currency=String(data.currency||"").toUpperCase();providerCustomerId=data.customer?.customer_code?String(data.customer.customer_code):(data.customer?.id?String(data.customer.id):null);providerTransactionId=String(data.id||transactionId||"");}const expectedReference=String(reference);if (returnedReference !== expectedReference){const e=new Error('Payment reference mismatch');e.code='PAYMENT_REFERENCE_MISMATCH';e.status=400;throw e;}if(successful){const result=await this.reconcile({provider:key,reference,providerTransactionId,providerCustomerId,amount:paidAmount,currency,paidAt:data.paid_at||data.created_at||new Date().toISOString()});return{status:'SUCCESS',providerData:data,reconciliation:result};}await this.supabase.rpc('mark_billing_transaction_failed',{p_provider:key,p_reference:reference,p_status:'FAILED'});return{status:'FAILED',providerData:data};}
  async findTransactionByProviderReference({provider,reference}){const {data,error}=await this.supabase.from("billing_transactions").select("*").eq("provider",provider).eq("reference",reference).maybeSingle();if(error)throw error;return data;}
  async findTransaction({companyId,provider,reference}){const {data,error}=await this.supabase.from("billing_transactions").select("*").eq("company_id",companyId).eq("provider",provider).eq("reference",reference).maybeSingle();if(error)throw error;return data;}
  async reconcile({provider,reference,providerTransactionId,providerCustomerId,amount,currency,paidAt}){
    const {data,error}=await this.supabase.rpc("reconcile_billing_success",{p_provider:provider,p_reference:reference,p_provider_transaction_id:providerTransactionId,p_provider_customer_id:providerCustomerId,p_paid_amount:amount,p_paid_currency:currency,p_paid_at:paidAt||new Date().toISOString()});
    if(error)throw error;
    if(providerCustomerId){
      const tx=await this.supabase.from("billing_transactions").select("company_id").eq("provider",provider).eq("reference",reference).maybeSingle();
      if(tx.data){
        await this.supabase.from("billing_customers").upsert({
          company_id:tx.data.company_id,provider,provider_customer_id:String(providerCustomerId),
          currency_code:String(currency).toUpperCase(),updated_at:new Date().toISOString()
        },{onConflict:"company_id,provider"});
        await this.supabase.from("company_subscriptions").update({
          status:"ACTIVE",grace_period_ends_at:null,cancelled_at:null,cancellation_reason:null,updated_at:new Date().toISOString()
        }).eq("company_id",tx.data.company_id);
      }
    }
    return data;
  }
  async reconcileRecurringByCustomer({provider,providerCustomerId,reference,providerTransactionId,amount,currency,paidAt}){
    if(!providerCustomerId)return null;
    const {data:sub,error:subError}=await this.supabase.from("company_subscriptions").select("id,company_id,plan_id,billing_interval,provider_customer_id").eq("provider",provider).eq("provider_customer_id",providerCustomerId).maybeSingle();
    if(subError)throw subError;if(!sub)return null;
    const {data:existing,error:existingError}=await this.supabase.from("billing_transactions").select("id,status").eq("provider",provider).eq("reference",reference).maybeSingle();if(existingError)throw existingError;if(existing?.status==='SUCCESS')return {status:'already_processed'};
    if(!existing){const {error}=await this.supabase.from("billing_transactions").insert({company_id:sub.company_id,plan_id:sub.plan_id,provider,reference,provider_transaction_id:providerTransactionId,amount,currency,billing_interval:sub.billing_interval,status:'PENDING',provider_customer_id:providerCustomerId,metadata:{recurring:true}});if(error&&error.code!=='23505')throw error;}
    return this.reconcile({provider,reference,providerTransactionId,providerCustomerId,amount,currency,paidAt});
  }
  async updateSubscriptionLifecycle({provider,providerCustomerId,status}) {
    if(!providerCustomerId)return null;
    const {data,error}=await this.supabase.from("company_subscriptions")
      .update({status,updated_at:new Date().toISOString()})
      .eq("provider",provider).eq("provider_customer_id",providerCustomerId)
      .select().maybeSingle();
    if(error)throw error;return data;
  }

  async webhook({providerName,rawBody,payload,signature}){const key=String(providerName).toUpperCase();const provider=this.provider(key);if(!provider.verifyWebhook(rawBody,signature)){const e=new Error("Invalid webhook signature");e.code="INVALID_WEBHOOK_SIGNATURE";e.status=401;throw e;}const eventId=String(payload?.id||payload?.webhook_id||payload?.data?.id||"");if(!eventId){const e=new Error("Webhook event ID missing");e.code="INVALID_WEBHOOK";e.status=400;throw e;}const {data:existing}=await this.supabase.from("billing_webhook_events").select("id,processed").eq("provider",key).eq("provider_event_id",eventId).maybeSingle();if(existing?.processed)return{status:"already_processed"};const {data:stored,error:storeError}=await this.supabase.from("billing_webhook_events").upsert({provider:key,provider_event_id:eventId,event_type:payload?.event||payload?.type||null,payload,processed:false},{onConflict:"provider,provider_event_id"}).select().single();if(storeError)throw storeError;
    if(key==='STRIPE'){
      const event=payload;const object=event.data?.object||{};
      if(event.type==='checkout.session.completed'){
        const reference=object?.metadata?.reference;if(reference){const tx=await this.supabase.from('billing_transactions').select('company_id,amount,currency').eq('provider','STRIPE').eq('reference',reference).maybeSingle();if(tx.data){const verified=await provider.verifySession(object.id);const currency=String(verified.currency||'').toUpperCase();const amount=majorUnits(verified.amount_total,currency);const companyMatches=String(verified.metadata?.companyId||'')===String(tx.data.company_id);const referenceMatches=String(verified.metadata?.reference||'')===String(reference);if(verified.payment_status==='paid'&&verified.status==='complete'&&companyMatches&&referenceMatches&&currency===String(tx.data.currency).toUpperCase()&&Number.isFinite(amount)&&amount===Number(tx.data.amount))await this.reconcile({provider:key,reference,providerTransactionId:String(verified.id),providerCustomerId:verified.customer?.id?String(verified.customer.id):null,amount,currency,paidAt:new Date().toISOString()});else throw Object.assign(new Error('Stripe checkout payment does not match the expected transaction'),{code:'PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH',status:400});}}
      } else if(event.type==='invoice.paid'){
        const customerId=object.customer?String(object.customer):null;const invoiceId=object.id?String(object.id):null;
        if(customerId&&invoiceId){const currency=String(object.currency||'').toUpperCase();const amount=Number(object.amount_paid||0)/(new Set(['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf']).has(currency.toLowerCase())?1:100);await this.reconcileRecurringByCustomer({provider:key,providerCustomerId:customerId,reference:`STRIPE-${invoiceId}`,providerTransactionId:invoiceId,amount,currency,paidAt:new Date(object.status_transitions?.paid_at?object.status_transitions.paid_at*1000:Date.now()).toISOString()});}
      } else if(event.type==='invoice.payment_failed'){
        const customerId=object.customer?String(object.customer):null;
        if(customerId)await this.updateSubscriptionLifecycle({provider:key,providerCustomerId:customerId,status:'PAST_DUE'});
      } else if(event.type==='customer.subscription.deleted'){
        const customerId=object.customer?String(object.customer):null;if(customerId)await this.updateSubscriptionLifecycle({provider:key,providerCustomerId:customerId,status:'CANCELLED'});
      } else if(event.type==='customer.subscription.updated'){
        const customerId=object.customer?String(object.customer):null;
        if(customerId)await this.supabase.from('company_subscriptions').update({
          cancel_at_period_end:!!object.cancel_at_period_end,
          updated_at:new Date().toISOString()
        }).eq('provider',key).eq('provider_customer_id',customerId);
      }
      await this.supabase.from("billing_webhook_events").update({processed:true,processed_at:new Date().toISOString()}).eq("id",stored.id);return{status:"processed"};
    }
    const data=payload?.data||payload?.body||{};
    // Paystack and Flutterwave webhook payloads carry different reference fields.
    // Resolve the reference explicitly before verification; never trust webhook status alone.
    const reference=key==='PAYSTACK' ? String(data.reference||'') : String(data.tx_ref||data.reference||'');
    if(reference){
      if(key==='FLUTTERWAVE' && !data.id) throw Object.assign(new Error('Flutterwave webhook transaction ID missing'),{code:'INVALID_WEBHOOK',status:400});
      const verified=key==='PAYSTACK'?await provider.verify(reference):await provider.verify(String(data.id));
      const verifiedReference=key==='PAYSTACK'?String(verified.reference||''):String(verified.tx_ref||'');
      if(verifiedReference !== String(reference))throw Object.assign(new Error('Verified payment reference mismatch'),{code:'PAYMENT_REFERENCE_MISMATCH',status:400});
      const verifiedStatus=String(verified.status).toLowerCase();
      if(verifiedStatus===(key==='PAYSTACK'?'success':'successful')){
        const paidAmount=key==='PAYSTACK'?majorUnits(verified.amount,verified.currency):Number(verified.amount);
        const providerCustomerId=verified.customer?.customer_code?String(verified.customer.customer_code):(verified.customer?.id?String(verified.customer.id):null);
        const tx=await this.findTransactionByProviderReference({provider:key,reference});
        if(tx){
          await this.reconcile({provider:key,reference,providerTransactionId:String(verified.id),providerCustomerId,amount:paidAmount,currency:String(verified.currency),paidAt:verified.paid_at||verified.created_at});
        }else{
          await this.reconcileRecurringByCustomer({provider:key,providerCustomerId,reference,providerTransactionId:String(verified.id),amount:paidAmount,currency:String(verified.currency),paidAt:verified.paid_at||verified.created_at});
        }
      }else if(['failed','abandoned','cancelled','canceled'].includes(verifiedStatus)){
        await this.supabase.rpc("mark_billing_transaction_failed",{p_provider:key,p_reference:reference,p_status:verifiedStatus==='abandoned'?'ABANDONED':'FAILED'});
      }
    }
    await this.supabase.from("billing_webhook_events").update({processed:true,processed_at:new Date().toISOString()}).eq("id",stored.id);return{status:"processed"};}
}
