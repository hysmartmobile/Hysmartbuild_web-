import { randomUUID } from 'node:crypto';

const n = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
const clean = (v) => typeof v === 'string' ? v.trim() : '';
const first = (arr) => arr.find(Boolean) || null;
const iso = () => new Date().toISOString();

const UNIT_PATTERN = '(?:m2|m²|sqm|m3|m³|cum|tons?|tonnes?|bags?|kg|pcs|pieces|lm|m|units?)';

export function parseFieldCapture(text = '') {
  const source = clean(text);
  const lower = source.toLowerCase();
  const quantities = [...source.matchAll(new RegExp(`(?:completed|installed|laid|cast|built|excavated|progress(?:ed)?|did)\\s*(?:about\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})`, 'gi'))]
    .map(m => ({ quantity: Number(String(m[1]).replace(',', '.')), unit: m[2].toLowerCase() }));
  const fallbackQuantity = source.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})`, 'i'));
  if (!quantities.length && fallbackQuantity) quantities.push({ quantity: Number(String(fallbackQuantity[1]).replace(',', '.')), unit: fallbackQuantity[2].toLowerCase() });

  const workerMatch = first([
    lower.match(/(?:with|using|crew of|team of|workforce of)\s+(\d+)\s+(?:workers?|men|people|operatives?)/i),
    lower.match(/(\d+)\s+(?:workers?|men|people|operatives?)\s+(?:worked|were on site|on site)/i)
  ]);

  const blockerWords = ['blocked', 'cannot continue', "can't continue", "couldn't continue", 'could not continue', 'unable to continue', 'waiting for', 'not ready', 'not available', 'shortage', 'delayed'];
  const safetyWords = ['unsafe', 'safety', 'near miss', 'incident', 'injury', 'ppe', 'hazard'];
  const materialWords = ['cement', 'concrete', 'steel', 'tiles', 'blocks', 'sand', 'aggregate', 'material', 'rebar', 'fuel', 'delivery', 'supplier'];
  const qualityWords = ['defect', 'rework', 'ncr', 'failed inspection', 'quality issue', 'crack', 'out of tolerance'];
  const delayWords = ['delay', 'late', 'behind', 'slipped', 'stopped', 'waiting', 'blocked', "couldn't continue"];

  const sentences = source.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const blocker = first(sentences.filter(s => blockerWords.some(w => s.toLowerCase().includes(w))));
  const safety = first(sentences.filter(s => safetyWords.some(w => s.toLowerCase().includes(w))));
  const material = first(sentences.filter(s => materialWords.some(w => s.toLowerCase().includes(w))));
  const quality = first(sentences.filter(s => qualityWords.some(w => s.toLowerCase().includes(w))));

  const signals = {
    progress: quantities[0] || null,
    workforceCount: workerMatch ? Number(workerMatch[1]) : null,
    blocker: blocker || null,
    material: material || null,
    safetyObservation: safety || null,
    qualityIssue: quality || null,
    delaySignal: delayWords.some(w => lower.includes(w)),
    sourceText: source
  };

  signals.categories = [
    signals.progress && 'PRODUCTION',
    signals.workforceCount != null && 'WORKFORCE',
    signals.blocker && 'BLOCKER',
    signals.material && 'MATERIAL',
    signals.safetyObservation && 'SAFETY',
    signals.qualityIssue && 'QUALITY',
    signals.delaySignal && 'DELAY'
  ].filter(Boolean);
  return signals;
}

export class ConstructionAutopilotService {
  constructor({ supabase, workflowService, truthEngineService }) {
    this.supabase = supabase;
    this.workflowService = workflowService;
    this.truthEngineService = truthEngineService;
  }

  async assertCompany({ companyId }) {
    const { data, error } = await this.supabase.from('companies').select('id,name').eq('id', companyId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Company not found'); e.status = 404; e.code = 'COMPANY_NOT_FOUND'; throw e; }
    return data;
  }

  async assertProject({ companyId, projectId }) {
    if (!projectId) return null;
    const { data, error } = await this.supabase.from('projects').select('id,company_id,name,status').eq('company_id', companyId).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Project not found'); e.status = 404; e.code = 'PROJECT_NOT_FOUND'; throw e; }
    return data;
  }

  buildActions({ companyId, projectId, captureId, signals, userId }) {
    const actions = [];
    if (signals.blocker || signals.delaySignal) actions.push({
      actionKey: `autopilot:capture:${captureId}:blocker`, sourceType: 'FIELD_CAPTURE', sourceId: captureId,
      title: 'Resolve field blocker before it becomes schedule loss',
      body: signals.blocker || 'Field update contains a delay/blocker signal.', severity: 'HIGH',
      dueAt: new Date(Date.now() + 24 * 3600000).toISOString(), assignedTo: userId,
      metadata: { category: 'BLOCKER', captureId }
    });
    if (signals.material) actions.push({
      actionKey: `autopilot:capture:${captureId}:material`, sourceType: 'FIELD_CAPTURE', sourceId: captureId,
      title: 'Check material/supply exposure from field update', body: signals.material, severity: 'HIGH',
      dueAt: new Date(Date.now() + 24 * 3600000).toISOString(), assignedTo: userId,
      metadata: { category: 'MATERIAL', captureId }
    });
    if (signals.safetyObservation) actions.push({
      actionKey: `autopilot:capture:${captureId}:safety`, sourceType: 'FIELD_CAPTURE', sourceId: captureId,
      title: 'Review safety observation from field capture', body: signals.safetyObservation, severity: 'CRITICAL',
      dueAt: new Date(Date.now() + 4 * 3600000).toISOString(), assignedTo: userId,
      metadata: { category: 'SAFETY', captureId }
    });
    if (signals.qualityIssue) actions.push({
      actionKey: `autopilot:capture:${captureId}:quality`, sourceType: 'FIELD_CAPTURE', sourceId: captureId,
      title: 'Review quality/rework signal from field capture', body: signals.qualityIssue, severity: 'HIGH',
      dueAt: new Date(Date.now() + 24 * 3600000).toISOString(), assignedTo: userId,
      metadata: { category: 'QUALITY', captureId }
    });
    return actions;
  }

  async capture({ companyId, userId, projectId, channel = 'WEB', text, metadata = {} }) {
    await this.assertCompany({ companyId });
    await this.assertProject({ companyId, projectId });
    const sourceText = clean(text);
    if (!sourceText) { const e = new Error('Field capture text is required'); e.status = 400; e.code = 'CAPTURE_TEXT_REQUIRED'; throw e; }
    const signals = parseFieldCapture(sourceText);
    const id = randomUUID();
    const row = {
      id, company_id: companyId, project_id: projectId || null, captured_by: userId,
      channel, source_text: sourceText, parsed: signals, metadata, status: 'PROCESSED', captured_at: iso()
    };
    const { data, error } = await this.supabase.from('construction_field_captures').insert(row).select().single();
    if (error) throw error;

    const actions = [];
    for (const a of this.buildActions({ companyId, projectId, captureId: id, signals, userId })) {
      const created = await this.workflowService.createAction({ companyId, projectId, ...a });
      if (created) actions.push(created);
    }

    const eventRows = [];
    const pushEvent = (eventType, severity, title, explanation, recommendation, evidence, sourceModules) => eventRows.push({
      id: randomUUID(), company_id: companyId, project_id: projectId || null, event_type: eventType,
      severity, title, explanation, recommendation, source_modules: sourceModules, evidence,
      confidence: 86, status: 'OPEN', owner_user_id: userId, metadata: { captureId: id }
    });
    if (signals.blocker || signals.delaySignal) pushEvent('FIELD_BLOCKER', 'HIGH', 'Field update indicates execution risk', signals.blocker || 'Delay language detected in field capture.', 'Resolve the blocker and connect it to the affected workfront/activity.', [{ type: 'FIELD_CAPTURE', id }], ['field']);
    if (signals.material) pushEvent('FIELD_MATERIAL_RISK', 'HIGH', 'Field update indicates material exposure', signals.material, 'Verify stock, PO/delivery status and affected workfront before the next shift.', [{ type: 'FIELD_CAPTURE', id }], ['field', 'procurement']);
    if (signals.qualityIssue) pushEvent('FIELD_QUALITY_RISK', 'HIGH', 'Field update indicates quality/rework exposure', signals.qualityIssue, 'Inspect, preserve evidence and prevent repeated work before production continues.', [{ type: 'FIELD_CAPTURE', id }], ['field', 'quality']);
    if (signals.safetyObservation) pushEvent('FIELD_SAFETY_RISK', 'CRITICAL', 'Field update contains a safety signal', signals.safetyObservation, 'Review the safety condition immediately and record the formal observation/incident.', [{ type: 'FIELD_CAPTURE', id }], ['field', 'safety']);
    if (signals.progress) pushEvent('FIELD_PROGRESS', 'INFO', 'Production quantity captured from field update', `${signals.progress.quantity} ${signals.progress.unit} reported as completed.`, 'Review and approve the quantity against the BOQ/workfront before it becomes certified progress.', [{ type: 'FIELD_CAPTURE', id, quantity: signals.progress.quantity, unit: signals.progress.unit }], ['field', 'production', 'boq']);
    if (eventRows.length) {
      const { error: eventError } = await this.supabase.from('construction_intelligence_events').insert(eventRows);
      if (eventError) throw eventError;
    }
    return { capture: data, signals, actions, intelligenceEvents: eventRows, nextStep: signals.progress ? 'Review captured progress in Production/BOQ before certification.' : 'Review the generated action(s) in Command Centre.' };
  }

  async inbox({ companyId, projectId, status = 'PROCESSED', limit = 50 }) {
    let q = this.supabase.from('construction_field_captures').select('id,project_id,captured_by,channel,source_text,parsed,metadata,status,captured_at,created_at').eq('company_id', companyId).order('captured_at', { ascending: false }).limit(limit);
    if (projectId) q = q.eq('project_id', projectId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async intelligence({ companyId, projectId, status = 'OPEN', limit = 50 }) {
    let q = this.supabase.from('construction_intelligence_events').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(limit);
    if (projectId) q = q.eq('project_id', projectId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async acknowledgeEvent({ companyId, userId, eventId, status }) {
    const allowed = ['ACKNOWLEDGED', 'ACTIONED', 'DISMISSED'];
    if (!allowed.includes(status)) { const e = new Error('Invalid intelligence event status'); e.status = 400; throw e; }
    const { data, error } = await this.supabase.from('construction_intelligence_events').update({ status, owner_user_id: userId, updated_at: iso() }).eq('company_id', companyId).eq('id', eventId).select().maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Intelligence event not found'); e.status = 404; e.code = 'INTELLIGENCE_EVENT_NOT_FOUND'; throw e; }
    return data;
  }

  async morningBrief({ companyId, userId, projectId }) {
    await this.assertCompany({ companyId });
    const [events, actions, truth] = await Promise.all([
      this.intelligence({ companyId, projectId, status: 'OPEN', limit: 30 }),
      this.workflowService.listActions({ companyId, projectId }),
      projectId && this.truthEngineService ? this.truthEngineService.project({ companyId, userId, projectId }) : null
    ]);
    const openActions = actions.filter(a => ['OPEN', 'ACKNOWLEDGED'].includes(a.status));
    const priorities = events.filter(e => ['CRITICAL', 'HIGH'].includes(e.severity)).slice(0, 10);
    const evidence = priorities.map(e => ({ title: e.title, why: e.explanation, consequence: e.target_value || null, recommendation: e.recommendation, evidence: e.evidence }));
    return {
      generatedAt: iso(), model: 'HYSMART_CONSTRUCTION_AUTOPILOT_V1', humanReviewRequired: true,
      summary: priorities.length ? `${priorities.length} construction intervention signal(s) require attention.` : 'No open high-priority field intelligence signals detected.',
      priorities, evidence, openActions: openActions.slice(0, 20), truthConfidence: truth?.truthConfidence ?? null, truth
    };
  }
}
