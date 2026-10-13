import { randomUUID } from 'node:crypto';

const clean = v => typeof v === 'string' ? v.trim() : '';
const iso = () => new Date().toISOString();
const asArray = v => Array.isArray(v) ? v : [];

export class EvidenceEngineService {
  constructor({ supabase }) { this.supabase = supabase; }

  async assertProject({ companyId, projectId }) {
    const { data, error } = await this.supabase.from('projects').select('id,company_id,name,status,start_date,end_date').eq('company_id', companyId).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Project not found'); e.status = 404; e.code = 'PROJECT_NOT_FOUND'; throw e; }
    return data;
  }

  async evidence({ companyId, projectId, limit = 100 }) {
    await this.assertProject({ companyId, projectId });
    const [docs, captures, events, rfis, instructions, progress, comments, drawingRevisions] = await Promise.all([
      this.supabase.from('documents').select('id,project_id,name,mime_type,size_bytes,category,visibility,description,uploaded_by,created_at').eq('company_id', companyId).eq('project_id', projectId).is('deleted_at', null).order('created_at', { ascending: false }).limit(limit),
      this.supabase.from('construction_field_captures').select('id,project_id,captured_by,channel,source_text,parsed,metadata,status,captured_at,created_at').eq('company_id', companyId).eq('project_id', projectId).order('captured_at', { ascending: false }).limit(limit),
      this.supabase.from('construction_intelligence_events').select('id,project_id,event_type,severity,title,explanation,recommendation,evidence,source_modules,confidence,status,created_at').eq('company_id', companyId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit),
      this.supabase.from('collaboration_rfis').select('id,project_id,subject,status,due_date,created_at').eq('company_id', companyId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit),
      this.supabase.from('collaboration_site_instructions').select('id,project_id,instruction_no,subject,instruction,priority,status,due_date,evidence,created_at,updated_at').eq('company_id', companyId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit),
      this.supabase.from('project_progress_measurements').select('id,project_id,estimate_item_id,measurement_date,quantity_completed,percent_complete,measured_value,location,notes,status,created_at').eq('company_id', companyId).eq('project_id', projectId).order('measurement_date', { ascending: false }).limit(limit),
      this.supabase.from('collaboration_comments').select('id,project_id,entity_type,entity_id,body,author_user_id,parent_id,created_at').eq('company_id', companyId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit),
      this.supabase.from('collaboration_drawing_revisions').select('id,drawing_id,revision,revision_date,description,status,document_id,created_at').eq('company_id', companyId).order('revision_date', { ascending: false }).limit(limit)
    ]);
    for (const r of [docs,captures,events,rfis,instructions,progress,comments,drawingRevisions]) if (r.error) throw r.error;

    const evidence = [];
    const add = (kind, id, occurredAt, title, detail, refs = [], confidence = 100) => evidence.push({ id: `${kind}:${id}`, kind, sourceId: id, occurredAt, title, detail, refs, confidence });
    for (const d of docs.data || []) add('DOCUMENT', d.id, d.created_at, d.name, d.description || `${d.category} evidence`, [], 96);
    for (const c of captures.data || []) add('FIELD_CAPTURE', c.id, c.captured_at || c.created_at, `${c.channel} field capture`, c.source_text, asArray(c.parsed?.categories).map(x => `${x}`), 90);
    for (const e of events.data || []) add('INTELLIGENCE', e.id, e.created_at, e.title, e.explanation, asArray(e.evidence).map(x => x.id || x), e.confidence || 80);
    for (const r of rfis.data || []) add('RFI', r.id, r.created_at, r.subject, `RFI status: ${r.status}`, [], 94);
    for (const i of instructions.data || []) add('SITE_INSTRUCTION', i.id, i.created_at, `${i.instruction_no}: ${i.subject}`, i.instruction, asArray(i.evidence).map(x => x.id || x), 95);
    for (const p of progress.data || []) add('PROGRESS', p.id, p.measurement_date, 'Progress measurement', `${p.quantity_completed} completed; ${p.percent_complete}% complete; value ${p.measured_value}`, [p.estimate_item_id].filter(Boolean), p.status === 'APPROVED' ? 98 : 82);
    for (const c of comments.data || []) add('COMMENT', c.id, c.created_at, `${c.entity_type} communication`, c.body, [c.entity_id], 86);
    for (const d of drawingRevisions.data || []) add('DRAWING_REVISION', d.id, d.revision_date || d.created_at, `Drawing revision ${d.revision}`, d.description || `Revision ${d.revision}`, [d.drawing_id, d.document_id].filter(Boolean), 97);
    evidence.sort((a,b) => new Date(b.occurredAt) - new Date(a.occurredAt));

    const categories = evidence.reduce((m, x) => { m[x.kind] = (m[x.kind] || 0) + 1; return m; }, {});
    return { project: { id: projectId }, generatedAt: iso(), total: evidence.length, categories, evidence: evidence.slice(0, limit) };
  }

  async record({ companyId, userId, projectId, input }) {
    await this.assertProject({ companyId, projectId });
    const sourceType = clean(input.sourceType).toUpperCase();
    const allowed = ['DOCUMENT','FIELD_CAPTURE','RFI','SITE_INSTRUCTION','PROGRESS','DRAWING_REVISION','INTELLIGENCE','COMMENT'];
    if (!allowed.includes(sourceType)) { const e = new Error('Unsupported evidence source type'); e.status = 400; e.code = 'EVIDENCE_SOURCE_TYPE_INVALID'; throw e; }
    const row = { id: randomUUID(), company_id: companyId, project_id: projectId, source_type: sourceType, source_id: input.sourceId || null, title: clean(input.title) || 'Evidence item', description: clean(input.description) || null, evidence_type: clean(input.evidenceType).toUpperCase() || sourceType, tags: asArray(input.tags), captured_by: userId, occurred_at: input.occurredAt || iso(), metadata: input.metadata || {}, created_at: iso() };
    const { data, error } = await this.supabase.from('construction_evidence_items').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async projectChronology({ companyId, projectId, limit = 200 }) {
    const result = await this.evidence({ companyId, projectId, limit });
    return { ...result, chronology: result.evidence.map((x, index) => ({ sequence: index + 1, ...x })) };
  }

  async claimPack({ companyId, projectId, userId, title = 'Construction evidence pack' }) {
    const result = await this.evidence({ companyId, projectId, limit: 500 });
    const relevantKinds = new Set(['SITE_INSTRUCTION','RFI','DRAWING_REVISION','FIELD_CAPTURE','DOCUMENT','PROGRESS','INTELLIGENCE','COMMENT']);
    const items = result.evidence.filter(x => relevantKinds.has(x.kind)).sort((a,b) => new Date(a.occurredAt) - new Date(b.occurredAt));
    const eventGroups = {};
    for (const x of items) { eventGroups[x.kind] = (eventGroups[x.kind] || 0) + 1; }
    const pack = { generatedAt: iso(), humanReviewRequired: true, title, projectId, generatedBy: userId, evidenceCount: items.length, sourceBreakdown: eventGroups, chronology: items, contractualNote: 'This pack is an evidence-organising aid. It does not determine contractual entitlement, certify delay, approve a claim, or submit notice automatically.' };
    const row = { id: randomUUID(), company_id: companyId, project_id: projectId, pack_type: 'CLAIM_EVIDENCE', title: clean(title) || 'Construction evidence pack', status: 'DRAFT', generated_by: userId, payload: pack, created_at: iso() };
    const { data, error } = await this.supabase.from('construction_evidence_packs').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async packs({ companyId, projectId, limit = 50 }) {
    let q = this.supabase.from('construction_evidence_packs').select('id,company_id,project_id,pack_type,title,status,generated_by,payload,created_at,updated_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(limit);
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q; if (error) throw error; return data || [];
  }
}
