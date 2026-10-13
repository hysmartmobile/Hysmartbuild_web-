import { randomUUID } from 'node:crypto';

const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const sum = xs => xs.reduce((a, b) => a + b, 0);
const money = v => round(v);
const ELEVATED_PROJECT_ROLES = new Set(['SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','CEO','DIRECTOR','MANAGEMENT']);

function normalizeInputs(raw = {}) {
  const fields = ['contractValue','materialsCost','labourCost','plantEquipmentCost','subcontractCost','otherDirectCost','overheads','durationMonths','contingencyPct','annualEscalationPct','mobilisationPct','materialsAdvancePct','clientPaymentDelayDays','supplierCreditDays','targetMarginPct','taxAllowancePct'];
  const out = Object.fromEntries(fields.map(k => [k, num(raw[k])]));
  out.currency = String(raw.currency || 'NGN').toUpperCase().slice(0, 3);
  out.projectType = String(raw.projectType || 'BUILDING').slice(0, 80);
  out.startDate = raw.startDate || null;
  out.notes = String(raw.notes || '').slice(0, 2000);
  const nonnegative = fields.filter(k => !['targetMarginPct'].includes(k));
  for (const k of nonnegative) if (out[k] < 0) throw Object.assign(new Error(`${k} cannot be negative`), { status: 400, code: 'INVALID_COST_PLAN_INPUT' });
  for (const k of ['contingencyPct','annualEscalationPct','mobilisationPct','materialsAdvancePct','taxAllowancePct']) if (out[k] > 100) throw Object.assign(new Error(`${k} cannot exceed 100%`), { status: 400, code: 'INVALID_COST_PLAN_INPUT' });
  if (out.targetMarginPct < -100 || out.targetMarginPct > 90) throw Object.assign(new Error('Target margin must be between -100% and 90%'), { status: 400, code: 'INVALID_COST_PLAN_INPUT' });
  if (out.durationMonths > 1200 || out.clientPaymentDelayDays > 3650 || out.supplierCreditDays > 3650) throw Object.assign(new Error('Duration or payment terms are outside supported limits'), { status: 400, code: 'INVALID_COST_PLAN_INPUT' });
  return out;
}

export function calculateProjectCostPlan(raw, context = {}) {
  const i = normalizeInputs(raw);
  const directCost = sum([i.materialsCost, i.labourCost, i.plantEquipmentCost, i.subcontractCost, i.otherDirectCost]);
  const baseCost = directCost + i.overheads;
  const escalationFactor = i.durationMonths > 0 ? Math.pow(1 + i.annualEscalationPct / 100, i.durationMonths / 12) - 1 : 0;
  const escalationAllowance = baseCost * escalationFactor;
  const contingency = (baseCost + escalationAllowance) * i.contingencyPct / 100;
  const taxAllowance = (baseCost + escalationAllowance + contingency) * i.taxAllowancePct / 100;
  const expectedCost = money(baseCost + escalationAllowance + contingency + taxAllowance);
  // Low/high ranges are transparent sensitivity bounds, not statistical confidence intervals.
  const lowCost = money(baseCost + escalationAllowance * 0.5 + (baseCost + escalationAllowance * 0.5) * Math.max(0, i.contingencyPct * 0.5) / 100 + taxAllowance * 0.5);
  const highCost = money(baseCost + escalationAllowance * 1.5 + (baseCost + escalationAllowance * 1.5) * (i.contingencyPct * 1.5) / 100 + taxAllowance * 1.5);
  const contract = i.contractValue;
  const forecastProfit = money(contract - expectedCost);
  const forecastMarginPct = contract > 0 ? round(forecastProfit / contract * 100) : null;
  const breakEvenContractValue = expectedCost;
  const targetMarginContractValue = i.targetMarginPct < 100 ? money(expectedCost / (1 - i.targetMarginPct / 100)) : null;
  const upfrontMobilisation = contract * i.mobilisationPct / 100;
  const materialsAdvance = i.materialsCost * i.materialsAdvancePct / 100;
  const recommendedAdvance = money(Math.min(contract, upfrontMobilisation + materialsAdvance));
  const estimatedDailyBurn = i.durationMonths > 0 ? expectedCost / (i.durationMonths * 30.4375) : 0;
  const earlyCashNeed = money(Math.min(expectedCost, Math.max(upfrontMobilisation + materialsAdvance, estimatedDailyBurn * (Math.min(i.clientPaymentDelayDays, 180) + 30))));
  const advanceGap = money(Math.max(0, earlyCashNeed - recommendedAdvance));
  const clientPaymentDelayCost = money(estimatedDailyBurn * i.clientPaymentDelayDays * 0.0004); // simple working-capital charge proxy, disclosed below
  const netProfitAfterDelayProxy = money(forecastProfit - clientPaymentDelayCost);
  const dataChecks = [
    ['contractValue', contract > 0, 'Contract value / tender price is missing; profit and advance guidance are incomplete.'],
    ['materialsCost', i.materialsCost > 0, 'Material take-off and current supplier quotations are needed.'],
    ['labourCost', i.labourCost > 0, 'Labour productivity, wage rates and crew plan are needed.'],
    ['durationMonths', i.durationMonths > 0, 'A realistic programme duration is needed to price time-related overhead and escalation.'],
    ['overheads', i.overheads > 0, 'Site preliminaries and company overhead allocation should be included.'],
    ['clientPaymentDelayDays', i.clientPaymentDelayDays > 0, 'Confirm client valuation and payment terms to improve the working-capital forecast.']
  ];
  const completed = dataChecks.filter(x => x[1]).length;
  const dataCompletenessPct = Math.round(completed / dataChecks.length * 100);
  const quality = dataCompletenessPct >= 85 && i.contingencyPct > 0 ? 'MODERATE' : dataCompletenessPct >= 50 ? 'LOW' : 'VERY_LOW';
  const risks = [];
  if (contract <= 0) risks.push({ severity: 'CRITICAL', code: 'NO_CONTRACT_PRICE', title: 'Contract value is not entered', impact: 'Profit, margin and client advance cannot be relied on until the selling price is confirmed.' });
  if (forecastProfit < 0) risks.push({ severity: 'CRITICAL', code: 'FORECAST_LOSS', title: 'Expected project cost exceeds contract value', impact: `Forecast loss ${money(-forecastProfit)} ${i.currency}; reprice, reduce scope/cost, or do not commit without approval.` });
  else if (forecastMarginPct !== null && forecastMarginPct < i.targetMarginPct) risks.push({ severity: 'HIGH', code: 'MARGIN_BELOW_TARGET', title: 'Forecast margin is below target', impact: `Forecast margin ${forecastMarginPct}% versus target ${i.targetMarginPct}%.` });
  if (advanceGap > 0) risks.push({ severity: advanceGap > expectedCost * 0.15 ? 'CRITICAL' : 'HIGH', code: 'UPFRONT_FUNDING_GAP', title: 'Client advance may not cover early cash demand', impact: `Indicative gap ${advanceGap} ${i.currency}. Negotiate advance/milestones or secure approved working capital.` });
  if (i.clientPaymentDelayDays > 45) risks.push({ severity: 'HIGH', code: 'SLOW_CLIENT_PAYMENT', title: 'Long client payment cycle increases cash pressure', impact: `${i.clientPaymentDelayDays} days assumed before client cash arrives.` });
  if (i.contingencyPct < 5) risks.push({ severity: 'MEDIUM', code: 'LOW_CONTINGENCY', title: 'Contingency may be insufficient', impact: 'Consider design maturity, ground conditions, price volatility and scope uncertainty before reducing contingency.' });
  if (i.durationMonths > 0 && i.annualEscalationPct === 0) risks.push({ severity: 'MEDIUM', code: 'NO_ESCALATION', title: 'No price escalation allowance', impact: 'Confirm whether supplier quotes are fixed for the full project duration.' });
  const durationPeriods = Math.max(1, Math.ceil(i.durationMonths));
  const delayPeriods = Math.ceil(i.clientPaymentDelayDays / 30);
  const cashPlanPeriods = Math.min(120, durationPeriods + delayPeriods);
  const monthlyCashPlan = Array.from({ length: cashPlanPeriods }, (_, idx) => {
    const month = idx + 1;
    const spend = i.durationMonths > 0 && month <= durationPeriods ? money(expectedCost / durationPeriods) : 0;
    const collected = month === 1 ? recommendedAdvance : (month > delayPeriods ? money(Math.max(0, contract - recommendedAdvance) / durationPeriods) : 0);
    return { month, forecastSpend: spend, forecastClientCollections: collected, netCashFlow: money(collected - spend) };
  });
  return {
    generatedAt: new Date().toISOString(), project: context.project || null,
    inputs: i,
    estimate: { directCost: money(directCost), overheads: money(i.overheads), escalationAllowance: money(escalationAllowance), contingency: money(contingency), taxAllowance: money(taxAllowance), expectedFinalCost: expectedCost, lowCostRange: lowCost, highCostRange: highCost, rangeMethod: 'Transparent sensitivity scenario; not a statistical confidence interval.' },
    commercial: { contractValue: money(contract), breakEvenContractValue, targetMarginPct: i.targetMarginPct, targetMarginContractValue, forecastProfit, forecastMarginPct, netProfitAfterDelayProxy, clientPaymentDelayCostProxy: clientPaymentDelayCost },
    funding: { recommendedClientAdvance: recommendedAdvance, mobilisationComponent: money(upfrontMobilisation), materialsAdvanceComponent: money(materialsAdvance), earlyCashNeed, upfrontFundingGap: advanceGap, estimatedDailyBurn: money(estimatedDailyBurn), clientPaymentDelayDays: i.clientPaymentDelayDays, supplierCreditDays: i.supplierCreditDays, monthlyCashPlan },
    quality: { dataCompletenessPct, confidenceLabel: quality, completedInputs: completed, totalChecks: dataChecks.length, missingData: dataChecks.filter(x => !x[1]).map(x => x[2]) },
    risks: risks.sort((a,b) => ({ CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3 }[a.severity] - ({ CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3 }[b.severity]))),
    decisionChecks: [
      'Validate quantities and rates against a priced BOQ, drawings, specifications and current supplier quotations.',
      'Confirm taxes, duties, insurance, bonds, retention, financing costs and contract-specific obligations with the commercial/finance team.',
      'Use a milestone-based cashflow with actual supplier credit terms and client certification/payment dates before signing.',
      'This is a decision-support estimate, not a guarantee. The result is only as reliable as the inputs and evidence provided.'
    ],
    sourceStatus: { historicalCalibration: 'NOT_YET_CALIBRATED', liveMarketRates: 'NOT_CONNECTED', note: 'No unsupported market prices or historical company cost averages were invented.' }
  };
}

export class ProjectCostPlanningService {
  constructor({ supabase }) { this.supabase = supabase; }
  async assertProject({ companyId, projectId, userId, role }) {
    const { data, error } = await this.supabase.from('projects').select('id,company_id,name,code,currency,budget,contract_value,start_date,expected_end_date,status,construction_type').eq('company_id', companyId).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('Project not found in this company'), { status: 404, code: 'PROJECT_NOT_FOUND' });
    if (userId && !ELEVATED_PROJECT_ROLES.has(role)) {
      const { data: member, error: memberError } = await this.supabase.from('project_members').select('id').eq('company_id', companyId).eq('project_id', projectId).eq('user_id', userId).eq('status', 'ACTIVE').maybeSingle();
      if (memberError) throw memberError;
      if (!member) throw Object.assign(new Error('You do not have access to this project'), { status: 403, code: 'PROJECT_ACCESS_DENIED' });
    }
    return data;
  }
  async calculate({ companyId, projectId, userId, role, input, save = true }) {
    const project = await this.assertProject({ companyId, projectId, userId, role });
    const normalized = normalizeInputs({ currency: project.currency || 'NGN', contractValue: project.contract_value, durationMonths: project.start_date && project.expected_end_date ? Math.max(0, (new Date(project.expected_end_date) - new Date(project.start_date)) / (86400000 * 30.4375)) : 0, projectType: project.construction_type, ...input });
    const [baselineResult, ledgerResult] = await Promise.all([
      this.supabase.from('project_budget_baselines').select('id,baseline_no,currency,total_budget,status,approved_at').eq('company_id', companyId).eq('project_id', projectId).eq('status', 'APPROVED').order('approved_at', { ascending: false }).limit(1),
      this.supabase.from('project_cost_ledger_v').select('entry_type,amount,currency,entry_date').eq('company_id', companyId).eq('project_id', projectId).limit(10000)
    ]);
    if (baselineResult.error) throw baselineResult.error;
    if (ledgerResult.error) throw ledgerResult.error;
    const baseline = baselineResult.data?.[0] || null;
    const ledger = ledgerResult.data || [];
    const ledgerCurrency = x => String(x.currency || normalized.currency).toUpperCase();
    const matchingLedger = ledger.filter(x => ledgerCurrency(x) === normalized.currency);
    const unmatchedLedgerCurrencies = [...new Set(ledger.filter(x => ledgerCurrency(x) !== normalized.currency).map(ledgerCurrency))];
    const actualCostToDate = money(matchingLedger.filter(x => x.entry_type === 'ACTUAL').reduce((a, x) => a + num(x.amount), 0));
    const committedCost = money(matchingLedger.filter(x => x.entry_type === 'COMMITMENT').reduce((a, x) => a + num(x.amount), 0));
    const result = calculateProjectCostPlan(normalized, { project: { id: project.id, name: project.name, code: project.code, status: project.status } });
    result.sourceEvidence = {
      approvedBudgetBaseline: baseline ? { id: baseline.id, baselineNo: baseline.baseline_no, currency: baseline.currency, totalBudget: num(baseline.total_budget), approvedAt: baseline.approved_at, varianceAgainstExpectedCost: money(result.estimate.expectedFinalCost - num(baseline.total_budget)) } : null,
      actualCostToDate, committedCost, remainingForecastCost: money(Math.max(0, result.estimate.expectedFinalCost - actualCostToDate - committedCost)),
      currencyMatch: (!baseline || String(baseline.currency || '').toUpperCase() === normalized.currency) && unmatchedLedgerCurrencies.length === 0,
      excludedLedgerCurrencies: unmatchedLedgerCurrencies,
      notes: [!baseline ? 'No approved budget baseline was found; create/approve a BOQ budget for stronger evidence.' : null, baseline && String(baseline.currency || '').toUpperCase() !== normalized.currency ? 'Approved baseline uses a different currency; do not compare totals until finance reconciles the currencies.' : null, unmatchedLedgerCurrencies.length ? `Ledger entries in ${unmatchedLedgerCurrencies.join(', ')} were excluded to avoid mixing currencies.` : null].filter(Boolean)
    };
    if (!save) return result;
    const { data, error } = await this.supabase.from('project_cost_plans').insert({ id: randomUUID(), company_id: companyId, project_id: projectId, created_by: userId, currency: normalized.currency, inputs: result.inputs, forecast: result, created_at: new Date().toISOString() }).select('id,created_at').single();
    if (error) throw error;
    result.savedPlan = data;
    return result;
  }
  async history({ companyId, projectId, userId, role, limit = 20 }) {
    await this.assertProject({ companyId, projectId, userId, role });
    const { data, error } = await this.supabase.from('project_cost_plans').select('id,project_id,created_by,currency,inputs,forecast,created_at').eq('company_id', companyId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(Math.min(50, Math.max(1, Number(limit) || 20)));
    if (error) throw error;
    return data || [];
  }
}
