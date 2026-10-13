
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CreditCard,
  Check,
  ShieldCheck,
  Receipt,
  RefreshCw,
  Clock3,
} from 'lucide-react';

import { PageHeader, Card, Button } from '../components/UI';
import { api } from '../lib/api';

const normalizeCode = (value) =>
  String(value ?? '').trim().toUpperCase();

const fmt = (currency, amount) => {
  const code = normalizeCode(currency);
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) return '—';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: code === 'NGN' ? 0 : 2,
    }).format(numericAmount);
  } catch {
    return `${code || '—'} ${numericAmount.toLocaleString()}`;
  }
};

const formatDate = (value) => {
  if (!value) return '—';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString();
};

const getErrorMessage = (error, fallback) => {
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
};

const getProviderCurrency = (provider, fallbackCurrency = '') =>
  normalizeCode(provider?.currencyCode || provider?.currency_code || fallbackCurrency);

/**
 * Apply a defensive frontend filter.
 * The backend remains responsible for authoritative provider validation.
 */
const normalizeProviders = (items, fallbackCurrency = '', countryCode = '') => {
  if (!Array.isArray(items)) return [];

  const seen = new Set();

  return items.filter((item) => {
    const provider = normalizeCode(item?.provider);
    const currency = getProviderCurrency(item, fallbackCurrency);

    if (!provider) return false;
    if (seen.has(provider)) return false;

    const country = normalizeCode(countryCode);

    // Keep the UI consistent with the authoritative backend route rules.
    if (provider === 'PAYSTACK' && (country !== 'NG' || currency !== 'NGN')) return false;
    if (provider === 'STRIPE' && (country === 'NG' || currency !== 'USD')) return false;

    seen.add(provider);
    return true;
  });
};

/**
 * Stripe is preferred for USD.
 * Else preserve a valid existing selection, or use the first available gateway.
 */
const chooseProvider = (providers, currency, current = '') => {
  const list = Array.isArray(providers) ? providers : [];
  const code = normalizeCode(currency);

  if (code === 'USD') {
    const stripe = list.find(
      (item) => normalizeCode(item?.provider) === 'STRIPE'
    );

    if (stripe) return normalizeCode(stripe.provider);
  }

  if (code === 'NGN') {
    const paystack = list.find(
      (item) => normalizeCode(item?.provider) === 'PAYSTACK'
    );

    if (paystack) return normalizeCode(paystack.provider);
  }

  const existing = list.find(
    (item) => normalizeCode(item?.provider) === normalizeCode(current)
  );

  if (existing) return normalizeCode(existing.provider);

  return normalizeCode(list[0]?.provider || '');
};

export default function Billing({
  canStartTrial = false,
  canManageBilling = canStartTrial,
}) {
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState(null);
  const [countries, setCountries] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [countryLoading, setCountryLoading] = useState(false);
  const [interval, setInterval] = useState('MONTHLY');
  const [loadingPlanCode, setLoadingPlanCode] = useState('');
  const [trialLoading, setTrialLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(true);

  const checkoutLockRef = useRef(false);
  const trialLockRef = useRef(false);
  const countryLockRef = useRef(false);
  const loadRequestRef = useRef(0);
  const mountedRef = useRef(false);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;

    setLoadingPlans(true);
    setError('');

    try {
      const response = canManageBilling
        ? await api.billing()
        : await api.billingStatus();

      const billingData = response?.data ?? null;

      const company = billingData?.company;

      const country = normalizeCode(
        company?.billing_country ||
        company?.billing_country_code ||
        company?.country_code ||
        'NG'
      );

      const [
        countriesResponse,
        plansResponse,
        providersResponse,
      ] = await Promise.all([
        api.billingCountries(),
        api.billingPlans(country),
        api.billingProviders(country),
      ]);

      // Ignore an outdated response if a newer refresh has started.
      if (requestId !== loadRequestRef.current) return;

      const nextCountries = Array.isArray(countriesResponse?.data)
        ? countriesResponse.data
        : [];

      const nextPlans = Array.isArray(plansResponse?.data)
        ? plansResponse.data
        : [];

      const countryInfo = nextCountries.find(
        (item) => normalizeCode(item?.country_code) === country
      );

      const resolvedCurrency = normalizeCode(
        countryInfo?.currency_code ||
        nextPlans.find((plan) => plan?.price?.currency)?.price?.currency ||
        company?.currency_code ||
        'NGN'
      );

      const nextProviders = normalizeProviders(
        providersResponse?.data,
        resolvedCurrency,
        country
      );

      setBilling(billingData);
      setCountries(nextCountries);
      setSelectedCountry(country);
      setPlans(nextPlans);
      setProviders(nextProviders);
      setSelectedProvider(
        chooseProvider(nextProviders, resolvedCurrency)
      );
    } catch (e) {
      if (requestId === loadRequestRef.current) {
        setError(
          getErrorMessage(
            e,
            'Unable to load subscription information.'
          )
        );
      }
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoadingPlans(false);
      }
    }
  }, [canManageBilling]);

  useEffect(() => {
    mountedRef.current = true;
    void load();

    return () => {
      mountedRef.current = false;
      // Invalidate any outstanding load when this component unmounts.
      loadRequestRef.current += 1;
    };
  }, [load]);

  const selectedCountryInfo = countries.find(
    (country) =>
      normalizeCode(country?.country_code) === selectedCountry
  );

  const currency = normalizeCode(
    selectedCountryInfo?.currency_code ||
    plans.find((plan) => plan?.price?.currency)?.price?.currency ||
    billing?.company?.currency_code ||
    'NGN'
  );

  const subscription = billing?.subscription || null;

  const status =
    billing?.subscriptionStatus ||
    subscription?.status ||
    'NONE';

  const trialEnd = subscription?.trial_ends_at;
  const hasSubscription = Boolean(subscription);

  const periodEnd =
    trialEnd || subscription?.current_period_end;

  async function startTrial() {
    if (
      trialLockRef.current ||
      checkoutLockRef.current ||
      countryLockRef.current ||
      loadingPlans ||
      !canStartTrial
    ) {
      return;
    }

    trialLockRef.current = true;
    setTrialLoading(true);
    setError('');

    try {
      await api.startTrial();

      // Let the application route guard re-check server-verified status.
      window.location.assign('/');
    } catch (e) {
      const message = getErrorMessage(
        e,
        'Unable to start your free trial.'
      );

      try {
        await load();
      } finally {
        setError(message);
        trialLockRef.current = false;
        setTrialLoading(false);
      }
    }
  }

  async function changeBillingCountry(countryCode) {
    const nextCountry = normalizeCode(countryCode);

    if (
      !nextCountry ||
      nextCountry === selectedCountry ||
      countryLockRef.current ||
      checkoutLockRef.current ||
      trialLockRef.current ||
      !canManageBilling
    ) {
      return;
    }

    countryLockRef.current = true;
    setCountryLoading(true);
    setError('');

    try {
      // Keep the existing company billing-country update API.
      await api.updateCompany({
        billingCountryCode: nextCountry,
      });

      const [
        plansResponse,
        providersResponse,
      ] = await Promise.all([
        api.billingPlans(nextCountry),
        api.billingProviders(nextCountry),
      ]);

      const nextPlans = Array.isArray(plansResponse?.data)
        ? plansResponse.data
        : [];

      const countryInfo = countries.find(
        (item) =>
          normalizeCode(item?.country_code) === nextCountry
      );

      const nextCurrency = normalizeCode(
        countryInfo?.currency_code ||
        nextPlans.find((plan) => plan?.price?.currency)?.price?.currency ||
        ''
      );

      const nextProviders = normalizeProviders(
        providersResponse?.data,
        nextCurrency,
        nextCountry
      );

      setSelectedCountry(nextCountry);
      setPlans(nextPlans);
      setProviders(nextProviders);

      // Set the gateway once. Never overwrite this selection later in
      // the same country-change operation.
      setSelectedProvider(
        chooseProvider(nextProviders, nextCurrency)
      );

      setBilling((current) => {
        if (!current) return current;

        return {
          ...current,
          company: {
            ...current.company,
            billing_country: nextCountry,
            billing_country_code: nextCountry,
            country_code: nextCountry,
            currency_code:
              nextCurrency || current.company?.currency_code,
          },
        };
      });
    } catch (e) {
      setError(
        getErrorMessage(
          e,
          'Unable to update the billing country and localized pricing.'
        )
      );
    } finally {
      countryLockRef.current = false;
      setCountryLoading(false);
    }
  }

  async function pay(plan) {
    if (
      !plan?.code ||
      !plan?.price ||
      !canManageBilling ||
      checkoutLockRef.current ||
      trialLockRef.current ||
      countryLockRef.current ||
      trialLoading ||
      countryLoading
    ) {
      return;
    }

    const requestedProvider = normalizeCode(selectedProvider);

    const selectedProviderRecord = providers.find(
      (item) =>
        normalizeCode(item?.provider) === requestedProvider
    );

    if (!selectedProviderRecord) {
      setError(
        'The selected payment gateway is no longer available. Refresh pricing and select an available gateway.'
      );
      return;
    }

    const providerCurrency = getProviderCurrency(
      selectedProviderRecord,
      currency
    );

    if (
      requestedProvider === 'PAYSTACK' &&
      (selectedCountry !== 'NG' || providerCurrency !== 'NGN')
    ) {
      setError('Paystack is available only for Nigerian subscriptions billed in NGN.');
      return;
    }

    if (
      requestedProvider === 'STRIPE' &&
      (selectedCountry === 'NG' || providerCurrency !== 'USD')
    ) {
      setError('Stripe is available for USD subscriptions outside Nigeria.');
      return;
    }

    checkoutLockRef.current = true;
    setLoadingPlanCode(plan.code);
    setError('');

    try {
      const response = await api.checkout({
        billingInterval: interval,
        planCode: plan.code,
        provider: requestedProvider,
      });

      const checkoutUrl = response?.data?.checkoutUrl;

      if (
        typeof checkoutUrl !== 'string' ||
        !checkoutUrl.trim()
      ) {
        throw new Error(
          'The payment gateway did not return a checkout URL.'
        );
      }

      // The backend must validate the provider, currency, price and
      // subscription before creating the checkout session.
      window.location.assign(checkoutUrl);
    } catch (e) {
      setError(
        getErrorMessage(e, 'Unable to start checkout.')
      );

      checkoutLockRef.current = false;
      setLoadingPlanCode('');
    }
  }

  const gatewayLabel = (provider) => {
    switch (normalizeCode(provider)) {
      case 'PAYSTACK':
        return 'Paystack';
      case 'FLUTTERWAVE':
        return 'Flutterwave';
      case 'STRIPE':
        return 'Stripe';
      default:
        return String(provider || 'Payment gateway');
    }
  };

  return (
    <>
      <PageHeader
        title="Billing & subscription"
        subtitle="Choose how your company will use HySmart Build. Workspace access is enabled only while a trial or paid subscription is valid."
      />

      <div className="billingnote">
        <ShieldCheck />
        <span>
          Payment credentials stay on the backend. Paid plans
          activate only after the payment gateway has been verified
          by HySmart Build. Only the company creator/owner can start,
          upgrade, or renew the subscription; all company members
          regain their existing role-based access once payment is
          verified.
        </span>
      </div>

      {!canManageBilling && (
        <div className="notice" role="status">
          Your company subscription is managed by its creator/owner.
          Please ask them to upgrade or renew; your role and
          permissions will be restored automatically when the
          company subscription becomes active.
        </div>
      )}

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}

      {!hasSubscription && canStartTrial && (
        <Card>
          <div className="cardtitle">
            <div>
              <h3>Start with a 14-day free trial</h3>
              <span>
                No payment is required to begin. The trial will not
                renew automatically.
              </span>
            </div>
            <Clock3 />
          </div>

          <p className="lead">
            Explore HySmart Build for your construction company for
            14 days. When the trial ends, workspace access is locked
            until the company owner upgrades to a paid plan.
          </p>

          <Button
            primary
            onClick={startTrial}
            disabled={
              trialLoading ||
              loadingPlans ||
              Boolean(loadingPlanCode) ||
              countryLoading ||
              !canStartTrial
            }
          >
            <Clock3 size={16} />
            {trialLoading
              ? 'Activating trial…'
              : 'Start 14-day free trial'}
          </Button>
        </Card>
      )}

      <Card>
        <div className="minirow">
          <div>
            <span>Billing country</span>
            <select
              value={selectedCountry}
              onChange={(event) =>
                void changeBillingCountry(event.target.value)
              }
              aria-label="Billing country"
              disabled={
                !canManageBilling ||
                countryLoading ||
                Boolean(loadingPlanCode) ||
                trialLoading ||
                loadingPlans
              }
            >
              {countries.map((country) => (
                <option
                  key={country.country_code}
                  value={country.country_code}
                >
                  {country.name} ({country.country_code})
                </option>
              ))}
            </select>
            {countryLoading && (
              <small>Updating country and prices…</small>
            )}
          </div>

          <div>
            <span>Currency</span>
            <b>{currency}</b>
          </div>

          <div>
            <span>Status</span>
            <b>{String(status).replaceAll('_', ' ')}</b>
          </div>

          <div>
            <span>
              {status === 'TRIAL' ? 'Trial ends' : 'Period ends'}
            </span>
            <b>{formatDate(periodEnd)}</b>
          </div>
        </div>

        <div className="toolbar">
          <label className="billing-gateway-control">
            <span>Payment gateway</span>
            <select
              value={selectedProvider}
              onChange={(event) =>
                setSelectedProvider(normalizeCode(event.target.value))
              }
              aria-label="Payment gateway"
              disabled={
                !canManageBilling ||
                countryLoading ||
                loadingPlans ||
                Boolean(loadingPlanCode) ||
                trialLoading ||
                providers.length === 0
              }
            >
              {providers.map((provider) => (
                <option
                  key={normalizeCode(provider.provider)}
                  value={normalizeCode(provider.provider)}
                >
                  {gatewayLabel(provider.provider)}
                </option>
              ))}
            </select>
          </label>

          <select
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
            aria-label="Billing interval"
            disabled={
              Boolean(loadingPlanCode) ||
              trialLoading ||
              countryLoading
            }
          >
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly · 2 months saved</option>
          </select>

          <Button
            onClick={load}
            disabled={
              loadingPlans ||
              Boolean(loadingPlanCode) ||
              trialLoading ||
              countryLoading
            }
          >
            <RefreshCw size={15} />
            {loadingPlans ? 'Refreshing…' : 'Refresh pricing'}
          </Button>
        </div>
      </Card>

      {providers.length === 0 && !loadingPlans && (
        <div className="notice" role="status">
          No payment gateway is enabled for {selectedCountry || 'this country'} ({currency}). The company can keep using an active subscription, but a new checkout is unavailable until a supported gateway is configured.
        </div>
      )}

      <div className="plans">
        {plans.map((plan) => {
          const amount =
            interval === 'YEARLY'
              ? plan.price?.yearlyAmount
              : plan.price?.monthlyAmount;

          const priceCurrency = normalizeCode(
            plan.price?.currency || currency
          );

          const isSelectedPlan = loadingPlanCode === plan.code;

          const isPriceAvailable =
            amount !== null &&
            amount !== undefined &&
            amount !== '' &&
            Number.isFinite(Number(amount));

          const isRenewal =
            status === 'EXPIRED' ||
            status === 'SUSPENDED';

          return (
            <Card className="plan" key={plan.id || plan.code}>
              <span className="eyebrow">{plan.name}</span>

              <h2>
                {isPriceAvailable
                  ? fmt(priceCurrency, amount)
                  : 'Price unavailable'}
                <small>
                  /{interval === 'YEARLY' ? 'year' : 'month'}
                </small>
              </h2>

              <p>{plan.description}</p>

              {plan.price?.source === 'EXCHANGE_RATE_ESTIMATE' && (
                <p className="notice" role="note">
                  Estimated using the latest available exchange rate
                  from {plan.price.baseCurrency} to {priceCurrency}.
                  {plan.price.exchangeRateAsOf
                    ? ` Rate checked ${formatDate(plan.price.exchangeRateAsOf)}. `
                    : ' '}
                  Country-specific pricing takes priority when configured.
                </p>
              )}

              {!plan.price && plan.pricingUnavailableReason && (
                <p className="notice" role="status">
                  {plan.pricingUnavailableReason}
                </p>
              )}

              <div className="feature">
                <Check size={15} />
                {' '}Up to {plan.max_users} users
              </div>

              <div className="feature">
                <Check size={15} />
                {' '}Up to {plan.max_projects} projects
              </div>

              <div className="feature">
                <Check size={15} />
                {' '}{plan.max_storage_mb} MB document storage
              </div>

              <Button
                primary
                onClick={() => pay(plan)}
                disabled={
                  Boolean(loadingPlanCode) ||
                  trialLoading ||
                  loadingPlans ||
                  countryLoading ||
                  !isPriceAvailable ||
                  !plan.code ||
                  !canManageBilling ||
                  !selectedProvider ||
                  !providers.some(
                    (item) =>
                      normalizeCode(item.provider) ===
                      normalizeCode(selectedProvider)
                  )
                }
              >
                <CreditCard size={16} />
                {isSelectedPlan
                  ? 'Opening checkout…'
                  : isRenewal
                    ? 'Upgrade / renew'
                    : 'Choose plan'}
              </Button>
            </Card>
          );
        })}
      </div>

      {loadingPlans && (
        <Card>
          <div className="empty">
            Loading localized pricing…
          </div>
        </Card>
      )}

      {!loadingPlans && plans.length === 0 && !error && (
        <Card>
          <div className="empty">
            No paid plans are currently configured for this billing
            country. Please contact support.
          </div>
        </Card>
      )}

      <Card>
        <div className="cardtitle">
          <div>
            <h3>Invoices</h3>
            <span>Verified billing history</span>
          </div>
          <Receipt />
        </div>

        {(billing?.invoices || []).length > 0 ? (
          billing.invoices.map((invoice) => (
            <div className="activityitem" key={invoice.id}>
              <i />
              <div>
                <b>{invoice.invoice_number}</b>
                <span>
                  {fmt(invoice.currency, invoice.amount)}
                  {' · '}
                  {invoice.status}
                  {' · '}
                  {formatDate(invoice.paid_at)}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">
            <Receipt className="emptyicon" />
            <h3>No invoices yet</h3>
            <p>
              Your free trial does not create a paid invoice.
            </p>
          </div>
        )}
      </Card>
    </>
  );
}
