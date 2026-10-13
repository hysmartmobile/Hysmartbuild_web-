const ELEVATED_PROJECT_ROLES = new Set(['SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','CEO','DIRECTOR','MANAGEMENT']);
const safe = value => typeof value === 'string' ? value.slice(0, 240) : value;

export class AiIntelligenceService {
  constructor({ truthEngineService, operatingSystemService, supabase, localModel = null, localModelEnabled = false }) {
    Object.assign(this, { truthEngineService, operatingSystemService, supabase, localModel, localModelEnabled });
  }

  async assertProjectAccess({ companyId, userId, projectId, role }) {
    const { data: project, error } = await this.supabase.from('projects')
      .select('id,name,status,expected_end_date,company_id')
      .eq('company_id', companyId).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
    if (!ELEVATED_PROJECT_ROLES.has(role)) {
      const { data: member, error: memberError } = await this.supabase.from('project_members')
        .select('id').eq('company_id', companyId).eq('project_id', projectId)
        .eq('user_id', userId).eq('status', 'ACTIVE').maybeSingle();
      if (memberError) throw memberError;
      if (!member) throw Object.assign(new Error('You do not have access to this project'), { status: 403, code: 'PROJECT_ACCESS_DENIED' });
    }
    return project;
  }

  async explainProject({ companyId, userId, projectId, permissions = null, role = null }) {
    // Legacy project-intelligence endpoint keeps its original aggregation contract.
    // The new assistant path fetches only functional domains authorised for this role.
    let truth;
    if (!Array.isArray(permissions)) {
      truth = await this.truthEngineService.project({ companyId, userId, projectId });
    } else {
      await this.assertProjectAccess({ companyId, userId, projectId, role });
      const has = (...keys) => keys.some(key => permissions.includes(key));
      const canSchedule = has('schedule:read','schedule:manage','milestone:read','task:read','construction-truth:read');
      const canFinance = has('dashboard:finance','finance:read','accounting:read','financial-intelligence:read','revenue-margin:read');
      const canProcurement = has('procurement:read','material:read','procurement-intelligence:read');
      const canContract = has('contract-intelligence:read','claims:read');
      const canExecution = has('production:read','execution:read','workfront:read','construction-truth:read');
      const canBoq = has('boq:read','boq:manage');
      const [scheduleResult, financeResult, procurementResult, contractResult, executionResult, boqResult] = await Promise.all([
        canSchedule ? this.supabase.from('project_schedule_activities').select('id,name,planned_finish,forecast_finish,total_float_days,is_critical').eq('company_id',companyId).eq('project_id',projectId).neq('status','COMPLETED') : Promise.resolve({data:[],error:null}),
        canFinance ? this.truthEngineService.revenueMarginService.analyze({companyId,projectId}) : Promise.resolve(null),
        canProcurement ? this.truthEngineService.procurementRiskService.analyze({companyId,projectId}) : Promise.resolve(null),
        canContract ? this.truthEngineService.claimsIntelligenceService.analyze({companyId,projectId}) : Promise.resolve(null),
        canExecution ? this.truthEngineService.workfrontProductionService.dashboard(companyId,projectId) : Promise.resolve(null),
        canBoq ? this.truthEngineService.operatingSystemService.boq({companyId,projectId}) : Promise.resolve(null)
      ]);
      if (scheduleResult?.error) throw scheduleResult.error;
      const activities = scheduleResult?.data || [];
      const delayed = activities.filter(x => x.forecast_finish && x.planned_finish && new Date(x.forecast_finish) > new Date(x.planned_finish));
      const delayDays = delayed.reduce((sum,x) => sum + Math.max(0,Math.ceil((new Date(x.forecast_finish)-new Date(x.planned_finish))/86400000)),0);
      const {data:project,error:projectError}=await this.supabase.from('projects').select('id,name,status,expected_end_date,daily_preliminaries,daily_preliminaries_cost').eq('company_id',companyId).eq('id',projectId).maybeSingle();
      if(projectError)throw projectError;if(!project)throw Object.assign(new Error('Project not found'),{status:404});
      const money = financeResult ? { revenueRecoveryOpportunity:Number(financeResult.summary?.revenueRecoveryOpportunity||0), marginLeakage:Number(financeResult.summary?.marginLeakage||0), forecastMargin:Number(financeResult.summary?.forecastMargin||0) } : null;
      const cash = financeResult ? { outstandingAr:Number(financeResult.summary?.outstandingAr||0), overdueAr:Number(financeResult.summary?.overdueAr||0) } : null;
      const procurement = procurementResult ? { summary:procurementResult.summary||{}, risks:procurementResult.risks||[], recommendations:procurementResult.recommendations||[] } : null;
      const contract = contractResult ? { summary:contractResult.summary||{}, recommendations:contractResult.recommendations||[] } : null;
      const execution = executionResult ? { workfronts:executionResult.summary||{}, productionRecommendations:executionResult.recommendations||[] } : null;
      const dailyPreliminaries = canFinance && canSchedule ? Number(project.daily_preliminaries||project.daily_preliminaries_cost||0) : null;
      const authorisedDomains = [canSchedule,canFinance,canProcurement,canContract,canExecution,canBoq].filter(Boolean).length;
      const availableDomains = [canSchedule && activities.length > 0,canFinance && Boolean(financeResult?.summary),canProcurement && Boolean(procurementResult?.summary),canContract && Boolean(contractResult?.summary),canExecution && Boolean(executionResult?.summary),canBoq && Boolean(boqResult)].filter(Boolean).length;
      truth = {
        generatedAt:new Date().toISOString(), project,
        time:canSchedule ? { forecastFinish:project.expected_end_date||null, scheduleVariance:null, delayedActivities:delayed.length, estimatedDelayDays:delayDays, estimatedAdditionalPreliminaries:dailyPreliminaries==null?null:delayDays*dailyPreliminaries } : null,
        money, cash, execution, boq:boqResult, procurement, contract,
        consequences:{ estimatedAdditionalPreliminaries:dailyPreliminaries==null?null:delayDays*dailyPreliminaries, estimatedDelayDays:canSchedule?delayDays:null },
        evidence:{ delayedActivities:delayed.slice(0,20), boqItems:boqResult?.items?.slice(0,100)||[] },
        truthConfidence:authorisedDomains ? Math.round((availableDomains/authorisedDomains)*100) : null,
        sourceModules:[canSchedule?'SCHEDULE':null,canFinance?'COMMERCIAL':'',canProcurement?'PROCUREMENT':'',canContract?'CONTRACT':'',canExecution?'PRODUCTION':'',canBoq?'BOQ':''].filter(Boolean)
      };
    }
    const items = [];
    if (truth.money && truth.money.marginLeakage > 0) items.push({ priority: 'NOW', type: 'MONEY', statement: `Margin leakage is ${truth.money.marginLeakage}.`, action: 'Open Revenue & Margin and review the highest-value leakage.', evidence: ['commercial'] });
    if (truth.procurement && Number(truth.procurement.summary?.critical||0) > 0) items.push({ priority: 'NOW', type: 'MATERIAL', statement: `${truth.procurement.summary.critical} material risks are critical.`, action: 'Verify supply exposure and the affected workfronts.', evidence: ['procurement'] });
    if (truth.contract && Number(truth.contract.summary?.potentialEntitlements||0) > 0) items.push({ priority: 'NOW', type: 'CONTRACT', statement: `${truth.contract.summary.potentialEntitlements} potential entitlement signals need review.`, action: 'Preserve notices and evidence for authorised commercial review.', evidence: ['contract'] });
    if (truth.execution && Number(truth.execution.workfronts?.blocked||0) > 0) items.push({ priority: 'NOW', type: 'EXECUTION', statement: `${truth.execution.workfronts.blocked} workfronts are blocked.`, action: 'Resolve readiness blockers and assign accountable owners.', evidence: ['production'] });
    const predictions = [];
    if (truth.time) predictions.push({ type: 'SCHEDULE_DELAY', label: 'Schedule exposure', value: truth.time.estimatedDelayDays, unit: 'estimated delayed activity-days', method: 'RULE_BASED_BASELINE', confidence: truth.truthConfidence, uncertainty: 'Not a trained ML forecast; depends on recorded planned and forecast finish dates.', sourceModules: ['SCHEDULE'] });
    if (truth.money && truth.consequences.estimatedAdditionalPreliminaries != null) predictions.push({ type: 'COST_EXPOSURE', label: 'Potential additional preliminaries', value: truth.consequences.estimatedAdditionalPreliminaries, unit: 'project currency', method: 'RULE_BASED_BASELINE', confidence: truth.truthConfidence, uncertainty: 'Illustrative schedule-derived exposure; verify daily preliminaries and source dates before decisions.', sourceModules: ['SCHEDULE', 'PROJECT_COSTS'] });
    return { generatedAt: new Date().toISOString(), model: 'HYSMART_RULE_BASED_INTELLIGENCE_V2', humanReviewRequired: true, confidence: truth.truthConfidence, summary: items.length ? items.map(x => x.statement).join(' ') : 'No material intervention signal detected in the currently available authorised project records.', recommendations: items, predictions, truth };
  }

  buildPermittedContext({ project, intelligence, permissions = [] }) {
    const has = (...keys) => keys.some(key => permissions.includes(key));
    const context = { project: { id: project.id, name: project.name, status: project.status, expectedEndDate: project.expected_end_date }, generatedAt: intelligence.generatedAt, recommendations: [] };
    if (intelligence.truth.time && has('schedule:read', 'milestone:read', 'task:read', 'construction-truth:read')) context.schedule = { ...intelligence.truth.time };
    if (intelligence.truth.money && has('dashboard:finance', 'finance:read', 'accounting:read', 'financial-intelligence:read', 'revenue-margin:read')) context.financial = { ...intelligence.truth.money, cash: { ...(intelligence.truth.cash||{}) } };
    if (intelligence.truth.procurement && has('procurement:read', 'material:read', 'procurement-intelligence:read')) context.procurement = { summary: intelligence.truth.procurement.summary, risks: (intelligence.truth.procurement.risks || []).slice(0, 10) };
    if (intelligence.truth.contract && has('contract-intelligence:read', 'claims:read')) context.contract = { summary: intelligence.truth.contract.summary };
    if (intelligence.truth.execution && has('production:read', 'execution:read', 'workfront:read', 'construction-truth:read')) context.execution = { workfronts: intelligence.truth.execution.workfronts, recommendations: (intelligence.truth.execution.productionRecommendations || []).slice(0, 8) };
    const canSee = { MONEY: has('dashboard:finance', 'finance:read', 'accounting:read', 'financial-intelligence:read', 'revenue-margin:read'), MATERIAL: has('procurement:read', 'material:read', 'procurement-intelligence:read'), CONTRACT: has('contract-intelligence:read', 'claims:read'), EXECUTION: has('production:read', 'workfront:read', 'construction-truth:read') };
    context.recommendations = intelligence.recommendations.filter(item => canSee[item.type] || (item.type === 'EXECUTION' && has('construction-truth:read'))).map(item => ({ priority: item.priority, type: item.type, statement: item.statement, action: item.action, evidence: item.evidence }));
    return context;
  }

  async overviewProject({ companyId, userId, role, permissions = [], projectId }) {
    const project = await this.assertProjectAccess({ companyId, userId, projectId, role });
    const intelligence = await this.explainProject({ companyId, userId, projectId, permissions, role });
    const context = this.buildPermittedContext({ project, intelligence, permissions });
    let alerts = [];
    const canReadAlerts = permissions.includes('intelligence-alerts:read') && role !== 'CLIENT';
    const { data: events, error } = canReadAlerts ? await this.supabase.from('construction_intelligence_events')
      .select('id,project_id,event_type,severity,title,explanation,recommendation,source_modules,evidence,confidence,status,owner_user_id,created_at')
      .eq('company_id', companyId).eq('project_id', projectId).in('status', ['OPEN','ACKNOWLEDGED'])
      .order('created_at', { ascending: false }).limit(30) : { data: [], error: null };
    if (!error) {
      const can = { finance: ['dashboard:finance','finance:read','accounting:read','financial-intelligence:read','revenue-margin:read'], procurement: ['procurement:read','material:read','procurement-intelligence:read'], contract: ['contract-intelligence:read','claims:read'], safety: ['safety:read','safety:manage'], quality: ['quality:read','quality:manage'] };
      alerts = (events || []).filter(event => {
        const modules = (event.source_modules || []).map(x => String(x).toLowerCase());
        const text = `${event.event_type} ${event.title} ${event.explanation || ''} ${modules.join(' ')}`.toLowerCase();
        if (/payroll|invoice|payment|finance|cash|margin|cost|commercial/.test(text) && !can.finance.some(p => permissions.includes(p))) return false;
        if (/procurement|material|supplier|stock|delivery/.test(text) && !can.procurement.some(p => permissions.includes(p))) return false;
        if (/contract|claim|entitlement|variation/.test(text) && !can.contract.some(p => permissions.includes(p))) return false;
        if (/safety|hazard|incident/.test(text) && !can.safety.some(p => permissions.includes(p)) && event.owner_user_id !== userId) return false;
        if (/quality|defect|ncr|inspection/.test(text) && !can.quality.some(p => permissions.includes(p)) && event.owner_user_id !== userId) return false;
        return true;
      }).map(event => ({ id: event.id, type: event.event_type, severity: event.severity, title: event.title, explanation: safe(event.explanation), recommendation: safe(event.recommendation), status: event.status, createdAt: event.created_at, confidence: event.confidence, evidence: event.evidence || [] }));
    }
    return { project: context.project, generatedAt: intelligence.generatedAt, summary: context.recommendations.map(x => x.statement).join(' ') || `No material intervention signal detected in the authorised project context for ${project.name}.`, recommendations: context.recommendations, predictions: permissions.includes('intelligence-predictions:read') ? intelligence.predictions.filter(p => p.type === 'SCHEDULE_DELAY' ? Boolean(context.schedule) : Boolean(context.financial)) : [], alerts, confidence: intelligence.confidence, mode: 'RULE_BASED_BASELINE', humanReviewRequired: true, contextCategories: Object.keys(context).filter(key => !['project','generatedAt','recommendations'].includes(key)), disclaimer: 'Forecasts are rule-based baselines, not trained ML predictions. Verify source records before acting.' };
  }

  fallbackAnswer(question, context) {
    const q = question.toLowerCase();
    const recs = context.recommendations || [];
    if (recs.length) return { answer: `For ${context.project.name}, the current records show: ${recs.map(x => x.statement).join(' ')} Recommended next steps: ${recs.map(x => x.action).join(' ')}`, source: 'PROJECT_RECORDS_AND_RULES' };
    if (context.schedule) return { answer: `For ${context.project.name}, the available schedule estimate is ${context.schedule.estimatedDelayDays ?? 'not available'} delayed activity-days. This is a rule-based signal, not a trained ML prediction. Check the linked schedule and current site progress before acting.`, source: 'PROJECT_RECORDS_AND_RULES' };
    if (q.includes('help') || q.includes('what can') || q.includes('how')) return { answer: 'I can help summarise authorised project information, explain visible intelligence signals, and identify next steps. Ask about your assigned project, schedule, workfront blockers, procurement or costs where your role permits access.', source: 'HYSMART_ASSISTANT_GUIDANCE' };
    return { answer: `I can help with ${context.project.name}, but the current authorised context does not contain enough evidence to answer that question confidently. Open the relevant project record or ask about a specific schedule, blocker or alert.`, source: 'INSUFFICIENT_CONTEXT' };
  }

  async askProject({ companyId, userId, role, permissions = [], projectId, question }) {
    const project = await this.assertProjectAccess({ companyId, userId, projectId, role });
    const intelligence = await this.explainProject({ companyId, userId, projectId, permissions, role });
    const context = this.buildPermittedContext({ project, intelligence, permissions });
    let answer = null;
    let mode = 'GROUNDED_RULE_BASED_ASSISTANT';
    if (this.localModelEnabled && this.localModel && typeof this.localModel.answerProjectContext === 'function') {
      try {
        const result = await this.localModel.answerProjectContext(question, context);
        if (result?.answer) { answer = { answer: result.answer, source: 'SELF_HOSTED_MODEL' }; mode = 'HYSMART_SELF_HOSTED_AI'; }
      } catch { /* Safe fallback keeps core project operations available when local inference is offline. */ }
    }
    if (!answer) answer = this.fallbackAnswer(question, context);
    try {
      await this.supabase.from('audit_logs').insert({ company_id: companyId, actor_user_id: userId, action: 'INTELLIGENCE_QUESTION', entity_type: 'PROJECT_INTELLIGENCE', entity_id: projectId, metadata: { projectId, mode, questionLength: question.length, source: answer.source, model: mode } });
    } catch { /* Audit middleware also records the request; never block read-only assistance on secondary audit failure. */ }
    return { project: { id: project.id, name: project.name }, answer: answer.answer, source: answer.source, mode, generatedAt: new Date().toISOString(), humanReviewRequired: true, contextCategories: Object.keys(context).filter(key => !['project', 'generatedAt', 'recommendations'].includes(key)), recommendations: context.recommendations, predictions: permissions.includes('intelligence-predictions:read') ? intelligence.predictions.filter(p => p.type === 'SCHEDULE_DELAY' ? Boolean(context.schedule) : Boolean(context.financial)) : [], disclaimer: 'Decision support only. Verify source records; this response does not approve, certify or execute a business action.' };
  }
}
