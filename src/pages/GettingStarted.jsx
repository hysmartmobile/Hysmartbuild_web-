import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, RefreshCw, CheckCircle2, Circle, Building2, WalletCards, ShoppingCart, FileText, BarChart3, Clock3, ShieldCheck, FlaskConical, LockKeyhole, AlertTriangle, CalendarClock, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, Card, Button, LoadingSpinner } from '../components/UI';

const rows = (result) => {
  const value = result?.data ?? result;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const projectIdOf = (project) => project?.id || project?.project_id || '';
const sumField = (items, field, excludedStatuses = []) => items.reduce((sum, item) => excludedStatuses.includes(String(item?.status || '').toUpperCase()) ? sum : sum + Math.max(0, number(item?.[field])), 0);

// Deliberately local-only sample data. This is never submitted to the API or persisted.
const DEMO_PROJECT = {
  id: 'hysmart-local-demo-project', name: 'Sample: Riverside Apartments', project_code: 'DEMO-RA-001',
  status: 'IN_PROGRESS', currency: 'NGN', budget: 250000000, progress: 42,
};
const DEMO_EVIDENCE = {
  budgetLines: [
    { id: 'demo-budget-1', description: 'Substructure', amount: 48000000 },
    { id: 'demo-budget-2', description: 'Concrete frame', amount: 72000000 },
    { id: 'demo-budget-3', description: 'Blockwork and finishes', amount: 65000000 },
    { id: 'demo-budget-4', description: 'MEP and external works', amount: 65000000 },
  ],
  purchaseOrders: [
    { id: 'demo-po-1', po_no: 'DEMO-PO-001', total: 12800000, status: 'APPROVED' },
    { id: 'demo-po-2', po_no: 'DEMO-PO-002', total: 8400000, status: 'RECEIVED' },
    { id: 'demo-po-3', po_no: 'DEMO-PO-003', total: 5600000, status: 'SENT' },
  ],
  reports: Array.from({ length: 12 }, (_, index) => ({ id: `demo-report-${index + 1}`, report_date: `2026-10-${String(index + 1).padStart(2, '0')}` })),
  expenses: [
    { id: 'demo-exp-1', amount: 1250000, status: 'APPROVED', currency: 'NGN' },
    { id: 'demo-exp-2', amount: 870000, status: 'PAID', currency: 'NGN' },
    { id: 'demo-exp-3', amount: 465000, status: 'PENDING', currency: 'NGN' },
    { id: 'demo-exp-4', amount: 315000, status: 'PAID', currency: 'NGN' },
    { id: 'demo-exp-5', amount: 590000, status: 'APPROVED', currency: 'NGN' },
    { id: 'demo-exp-6', amount: 210000, status: 'PAID', currency: 'NGN' },
  ],
};

export default function GettingStarted() {
  const workspace = useOutletContext() || {};
  const companyId = workspace.companyId || '';
  const permissions = new Set(workspace.permissions || []);
  const subscription = workspace.subscription || null;
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [evidence, setEvidence] = useState({ budgetLines: [], reports: [], purchaseOrders: [], expenses: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [partialWarnings, setPartialWarnings] = useState([]);
  const [demoMode, setDemoMode] = useState(false);

  const liveProject = useMemo(() => projects.find((item) => projectIdOf(item) === projectId) || projects[0] || null, [projects, projectId]);
  const project = demoMode ? DEMO_PROJECT : liveProject;
  const currentEvidence = demoMode ? DEMO_EVIDENCE : evidence;

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    setError('');
    setPartialWarnings([]);
    try {
      const projectResult = await api.projects({ page: 1, pageSize: 100 });
      const projectRows = rows(projectResult);
      setProjects(projectRows);
      const nextId = projectRows.some((item) => projectIdOf(item) === projectId) ? projectId : projectIdOf(projectRows[0]);
      setProjectId(nextId || '');
      setEvidence({ budgetLines: [], reports: [], purchaseOrders: [], expenses: [] });
    } catch (err) {
      setError(err?.message || 'Unable to load the project setup guide.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, projectId]);

  useEffect(() => { load(); }, [companyId]);

  useEffect(() => {
    if (demoMode || !projectId || !projects.some((item) => projectIdOf(item) === projectId)) return undefined;
    let active = true;
    const fetchEvidence = async () => {
      setRefreshing(true);
      const requests = await Promise.allSettled([
        api.projectBudgetLines(projectId),
        api.reports(projectId, { page: 1, pageSize: 100 }),
        api.purchaseOrders({ projectId, page: 1, pageSize: 100 }),
        api.expenses({ projectId, page: 1, pageSize: 100 }),
      ]);
      if (!active) return;
      const keys = ['budgetLines', 'reports', 'purchaseOrders', 'expenses'];
      const nextEvidence = { budgetLines: [], reports: [], purchaseOrders: [], expenses: [] };
      const warnings = [];
      requests.forEach((result, index) => {
        if (result.status === 'fulfilled') nextEvidence[keys[index]] = rows(result.value);
        else warnings.push(`${keys[index]} could not be loaded: ${result.reason?.message || 'request failed'}`);
      });
      setEvidence(nextEvidence);
      setPartialWarnings(warnings);
      setRefreshing(false);
    };
    fetchEvidence();
    return () => { active = false; };
  }, [demoMode, projectId, projects]);

  const budget = number(project?.budget ?? project?.approved_budget);
  const hasBudget = budget > 0 || currentEvidence.budgetLines.length > 0;
  const hasProcurement = currentEvidence.purchaseOrders.length > 0;
  const hasReports = currentEvidence.reports.length > 0;
  const hasExpenses = currentEvidence.expenses.length > 0;
  const hasAnyOperationalRecord = hasProcurement || hasReports || hasExpenses;
  const steps = [
    { title: 'Choose one active project', description: 'Start with one project the company is already delivering. Confirm the project identity and delivery status.', done: !!project, icon: Building2, action: project ? 'Open project' : 'Create first project', to: project ? `/projects/${projectId}` : '/projects?new=1', allowed: permissions.has('project:read'), blocked: !permissions.has('project:read') },
    { title: 'Record the approved budget', description: 'Confirm the approved project budget or enter budget lines. An entered amount is not the same as formal approval.', done: hasBudget, icon: WalletCards, action: hasBudget ? 'Review cost plan' : 'Add budget', to: permissions.has('project-cost-plan:read') ? '/project-cost-planning' : '/boq-control', allowed: permissions.has('project-cost-plan:read') || permissions.has('boq:read'), blocked: !permissions.has('project-cost-plan:read') && !permissions.has('boq:read') },
    { title: 'Record a real procurement item', description: 'Use a genuine requisition or purchase order and follow your company’s normal approval process.', done: hasProcurement, icon: ShoppingCart, action: hasProcurement ? 'Review procurement' : 'Open procurement', to: '/procurement', allowed: permissions.has('procurement:read'), blocked: !permissions.has('procurement:read') },
    { title: 'Submit a daily site report', description: 'Record actual site progress, work completed, materials used and any issues that need follow-up.', done: hasReports, icon: FileText, action: hasReports ? 'Review site reports' : 'Create site report', to: '/reports', allowed: permissions.has('report:read'), blocked: !permissions.has('report:read') },
    { title: 'Review project evidence and next actions', description: 'Discuss the recorded budget, procurement, site activity and expenses with the project manager.', done: hasBudget && hasAnyOperationalRecord, icon: BarChart3, action: 'Review management dashboard', to: '/today', allowed: permissions.has('operating-system:read') || permissions.has('my-work:read'), blocked: !permissions.has('operating-system:read') && !permissions.has('my-work:read') },
  ];
  const completed = steps.filter((step) => step.done).length;
  const blocked = steps.filter((step) => !step.done && step.blocked).length;
  const pending = steps.filter((step) => !step.done && !step.blocked).length;
  const currency = project?.currency || 'NGN';
  const formatMoney = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  const expenseTotal = sumField(currentEvidence.expenses, 'amount', ['REJECTED', 'CANCELLED']);
  const procurementTotal = sumField(currentEvidence.purchaseOrders, 'total', ['CANCELLED']);
  const budgetCoverage = budget > 0 && expenseTotal > 0 ? Math.min(100, Math.round((expenseTotal / budget) * 100)) : null;

  const trialEndsAt = subscription?.trial_ends_at || null;
  const subscriptionStatus = String(subscription?.status || '').toUpperCase();
  const isTrial = subscriptionStatus === 'TRIAL' || (!!trialEndsAt && !['ACTIVE', 'PAID', 'CANCELLED', 'SUSPENDED'].includes(subscriptionStatus));
  const trialEndDate = trialEndsAt ? new Date(trialEndsAt) : null;
  const trialDaysLeft = trialEndDate && !Number.isNaN(trialEndDate.getTime()) ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / 86400000)) : null;
  const trialDay = trialDaysLeft == null ? null : Math.min(14, Math.max(1, 15 - trialDaysLeft));
  const trialPercent = trialDaysLeft == null ? 0 : Math.min(100, Math.max(0, ((14 - trialDaysLeft) / 14) * 100));
  const trialTasks = [!!project, hasBudget, hasProcurement || hasReports, hasBudget && hasAnyOperationalRecord];
  const trialTasksComplete = trialTasks.filter(Boolean).length;

  if (loading) return <LoadingSpinner label="Preparing your first-project guide…" />;

  return <>
    <PageHeader title="Get Your First Project Running" subtitle="A practical guide to exploring HySmart Build, setting up one real project and reviewing value from recorded evidence." action={<Button onClick={() => load({ quiet: true })} disabled={refreshing || demoMode}><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh progress'}</Button>} />
    {error && <div className="notice error" role="alert">{error}</div>}

    <Card>
      <div className="cardtitle"><div><h3>Explore before changing live data</h3><span>Try the sample project to see how the guide and value review work. Demo figures are fictional and stored only in this page’s memory.</span></div><FlaskConical /></div>
      <div className="getting-started-demo-actions">
        <button type="button" className={`btn ${demoMode ? 'primary' : ''}`} onClick={() => setDemoMode(true)} aria-pressed={demoMode}><Sparkles size={16}/> Explore sample project</button>
        <button type="button" className="btn" onClick={() => setDemoMode(false)} disabled={!demoMode}><LockKeyhole size={16}/> Return to live workspace</button>
      </div>
      {demoMode && <div className="notice getting-started-demo-notice"><ShieldCheck size={16}/><span><strong>Demo mode is on.</strong> No project, budget, purchase order, report or expense is created, edited or sent to the backend. Leave demo mode to return to your company’s real records.</span></div>}
    </Card>

    {!demoMode && projects.length > 0 && <Card>
      <div className="cardtitle"><div><h3>Your pilot project</h3><span>Use one active project for the first 14 days. Progress below comes from your existing project records.</span></div><Building2 /></div>
      <label className="getting-started-project-select">Selected project
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {projects.map((item) => <option key={projectIdOf(item)} value={projectIdOf(item)}>{item.name || item.project_name || 'Untitled project'}</option>)}
        </select>
      </label>
      {project && <div className="getting-started-summary">
        <div><span>Project status</span><strong>{String(project.status || 'Not set').replaceAll('_', ' ')}</strong></div>
        <div><span>Project budget (entered)</span><strong>{budget > 0 ? formatMoney(budget) : hasBudget ? 'Budget lines entered' : 'Not recorded yet'}</strong></div>
        <div><span>Current progress</span><strong>{project.progress == null ? 'Not recorded' : `${number(project.progress)}%`}</strong></div>
      </div>}
    </Card>}
    {!demoMode && !projects.length && <Card><div className="getting-started-empty"><div className="onboard-icon"><Building2 size={25}/></div><h3>Start with one real project</h3><p>Create a project using the company’s real project details. You can add the approved budget and activity after creation, or explore the sample project first.</p>{permissions.has('project:create') && <Link className="btn primary" to="/projects?new=1">Create your first project <ArrowRight size={16}/></Link>}</div></Card>}
    {demoMode && <Card><div className="cardtitle"><div><h3>{DEMO_PROJECT.name}</h3><span>Illustrative construction project · not company data</span></div><Building2 /></div><div className="getting-started-summary"><div><span>Project status</span><strong>In progress</strong></div><div><span>Illustrative budget</span><strong>{formatMoney(budget)}</strong></div><div><span>Reported progress</span><strong>{DEMO_PROJECT.progress}%</strong></div></div></Card>}

    <Card>
      <div className="cardtitle"><div><h3>First-project checklist</h3><span>{demoMode ? 'Sample statuses show how a complete onboarding journey looks.' : 'Status reflects project records and your current access permissions.'}</span></div><ShieldCheck /></div>
      <div className="getting-started-status-summary"><span className="getting-started-status-pill done"><CheckCircle2 size={14}/>{completed} completed</span><span className="getting-started-status-pill pending"><Clock3 size={14}/>{pending} pending</span><span className="getting-started-status-pill blocked"><AlertTriangle size={14}/>{blocked} blocked by permissions</span></div>
      <div className="getting-started-progress-head"><strong>{completed} of {steps.length} steps evidenced</strong><span>{Math.round(completed / steps.length * 100)}%</span></div>
      <div className="getting-started-progress"><span style={{ width: `${completed / steps.length * 100}%` }}/></div>
      <div className="getting-started-steps">{steps.map((step, index) => {
        const Icon = step.icon;
        const status = step.done ? 'complete' : step.blocked ? 'blocked' : 'pending';
        const statusLabel = step.done ? 'Completed' : step.blocked ? 'Blocked — permission required' : 'Pending';
        return <div className={`getting-started-step status-${status}`} key={step.title}>
          <div className={`getting-started-step-icon ${step.done ? 'complete' : ''}`}>{step.done ? <CheckCircle2 size={21}/> : step.blocked ? <LockKeyhole size={20}/> : <Icon size={20}/>}</div>
          <div className="getting-started-step-copy"><div className="getting-started-step-heading"><strong>{index + 1}. {step.title}</strong><span className={`getting-started-status-label ${status}`}>{statusLabel}</span></div><p>{step.description}</p>{step.allowed && <Link to={demoMode ? '/getting-started' : step.to} onClick={demoMode ? (event) => { event.preventDefault(); setDemoMode(false); } : undefined} className="getting-started-link">{demoMode ? 'Return to live project to open this screen' : step.action}<ArrowRight size={15}/></Link>}{step.blocked && <small className="getting-started-blocked-help">Ask your company administrator to grant the required role permission.</small>}</div>
          {!step.done && !step.blocked && <Circle className="getting-started-pending" size={18}/>}
        </div>;
      })}</div>
    </Card>

    <Card>
      <div className="cardtitle"><div><h3>Evidence-based value demonstration</h3><span>{demoMode ? 'Fictional example figures — for demonstration only.' : 'Live metrics are calculated from the selected project’s records available to your account.'}</span></div><BarChart3 /></div>
      {project ? <div className="getting-started-value-grid">
        <div><span>Budget lines recorded</span><strong>{currentEvidence.budgetLines.length}</strong><small>{hasBudget ? 'Budget information is present; verify approval status separately' : 'No budget amount or lines found'}</small></div>
        <div><span>Purchase orders</span><strong>{currentEvidence.purchaseOrders.length}</strong><small>{hasProcurement ? 'Procurement records found' : 'No purchase orders found for this project'}</small></div>
        <div><span>Daily reports</span><strong>{currentEvidence.reports.length}</strong><small>{hasReports ? 'Site activity has been recorded' : 'No daily reports found for this project'}</small></div>
        <div><span>Expense records</span><strong>{currentEvidence.expenses.length}</strong><small>{hasExpenses ? 'Expenses recorded; review approval and payment status' : 'No expense records found for this project'}</small></div>
        <div><span>Recorded expense value</span><strong>{expenseTotal > 0 ? formatMoney(expenseTotal) : '—'}</strong><small>Sum of recorded amounts, excluding rejected and cancelled expenses</small></div>
        <div><span>Purchase-order value</span><strong>{procurementTotal > 0 ? formatMoney(procurementTotal) : '—'}</strong><small>Sum of order totals excluding cancelled orders; not necessarily paid</small></div>
        <div><span>Budget recorded</span><strong>{budget > 0 ? formatMoney(budget) : '—'}</strong><small>Entered project budget; approval should be verified</small></div>
        <div><span>Record coverage</span><strong>{Math.round(([hasBudget, hasProcurement, hasReports, hasExpenses].filter(Boolean).length / 4) * 100)}%</strong><small>4 evidence categories present: budget, POs, reports and expenses</small></div>
      </div> : <p>Select or create a project to review its records.</p>}
      {budgetCoverage != null && <div className="getting-started-coverage-note"><strong>Expense-to-budget context: {budgetCoverage}%</strong><span>This compares recorded expense amounts with the entered budget only. It is not a forecast, approved cost variance or proof of savings.</span></div>}
      <div className="notice getting-started-truth-note"><Clock3 size={16}/><span><strong>No invented savings.</strong> HySmart shows recorded activity and transparent comparisons only. These figures do not by themselves prove cost savings, losses avoided, productivity gains or final project cost. Reconcile against approved budgets, invoices and source documents before making financial decisions.</span></div>
      {partialWarnings.length > 0 && !demoMode && <div className="notice" role="status">Some project evidence could not be loaded: {partialWarnings.join(' · ')}. Metrics may be incomplete until those sources are available.</div>}
    </Card>

    <Card>
      <div className="cardtitle"><div><h3>Your 14-day trial progress</h3><span>Use the trial to complete a small, real workflow and decide based on evidence whether HySmart fits your team.</span></div><CalendarClock /></div>
      {isTrial && trialDaysLeft != null ? <>
        <div className="getting-started-trial-topline"><div><span>Trial day</span><strong>{trialDay} of 14</strong></div><div><span>Time remaining</span><strong>{trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'}</strong></div><div><span>Setup milestones</span><strong>{trialTasksComplete} of {trialTasks.length}</strong></div></div>
        <div className="getting-started-progress-head"><strong>Trial time elapsed</strong><span>{Math.round(trialPercent)}%</span></div><div className="getting-started-progress"><span style={{ width: `${trialPercent}%` }}/></div>
        <div className="getting-started-trial-tasks">{[
          ['Select one pilot project', trialTasks[0]], ['Record budget information', trialTasks[1]], ['Record a purchase order or daily report', trialTasks[2]], ['Review evidence with the project manager', trialTasks[3]],
        ].map(([label, done]) => <div key={label} className={done ? 'done' : ''}>{done ? <CheckCircle2 size={17}/> : <Circle size={17}/>}<span>{label}</span><strong>{done ? 'Done' : 'To do'}</strong></div>)}</div>
        <p className="getting-started-trial-date">Trial end date: {trialEndDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}. Confirm billing status on the billing page.</p>
      </> : subscription && ['ACTIVE', 'PAID'].includes(subscriptionStatus) ? <div className="getting-started-trial-active"><CheckCircle2 size={21}/><div><strong>Your company subscription is active.</strong><p>The 14-day trial tracker is no longer applicable. Continue using the checklist to improve project adoption.</p></div></div> : <div className="getting-started-trial-unavailable"><CalendarClock size={20}/><div><strong>Trial timing could not be verified from the current subscription details.</strong><p>Open Billing to check whether your company has started a trial and confirm its end date. This guide will not guess the remaining time.</p><Link to="/billing" className="getting-started-link">Open billing <ArrowRight size={15}/></Link></div></div>}
      <div className="getting-started-days"><div><strong>Days 1–2 · Set up</strong><p>Choose one project, confirm the project owner and enter the approved budget.</p></div><div><strong>Days 3–7 · Record work</strong><p>Use actual procurement, expenses and daily reports. Avoid entering duplicate records just to complete the checklist.</p></div><div><strong>Days 8–11 · Review evidence</strong><p>Compare records with source documents and agree on concrete follow-up actions.</p></div><div><strong>Days 12–14 · Decide</strong><p>Review adoption, reporting completeness and whether the measured workflow value justifies continuing.</p></div></div>
      <div className="getting-started-billing-link"><Link to="/billing" className="getting-started-link">Review subscription and billing <ArrowRight size={15}/></Link></div>
    </Card>
  </>;
}
