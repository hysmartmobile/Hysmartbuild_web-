import { randomUUID } from 'node:crypto';

const clean = (v) => typeof v === 'string' ? v.trim() : v;
const today = () => new Date().toISOString().slice(0, 10);
const TABLES = new Set([
  'project_estimates','project_estimate_items','project_budget_baselines','project_budget_baseline_items',
  'project_progress_measurements','project_work_certificates','project_client_ipcs','project_ipc_items','project_retention_transactions',
  'project_subcontractors','project_subcontracts','project_subcontract_items','project_subcontract_valuations','project_subcontract_payments','project_subcontract_variations',
  'project_quality_inspections','project_quality_check_items','project_ncrs','project_quality_records',
  'project_safety_incidents','project_toolbox_talks','project_safety_inspections','project_permits','project_safety_actions',
  'project_equipment','project_equipment_allocations','project_equipment_logs','project_equipment_maintenance',
  'project_document_versions','project_transmittals','project_transmittal_items','project_rfis','project_closeout_items','project_dlp_defects'
]);
const PROJECT_DIRECT = new Set([
  'project_estimates','project_budget_baselines','project_progress_measurements','project_work_certificates','project_client_ipcs','project_retention_transactions',
  'project_subcontracts','project_quality_inspections','project_ncrs','project_quality_records',
  'project_safety_incidents','project_toolbox_talks','project_safety_inspections','project_permits','project_safety_actions',
  'project_equipment_allocations','project_equipment_logs','project_document_versions','project_transmittals','project_rfis','project_closeout_items','project_dlp_defects'
]);
const COMPANY_GLOBAL = new Set(['project_subcontractors','project_equipment']);
const VIA_SUBCONTRACT = new Set(['project_subcontract_items','project_subcontract_valuations','project_subcontract_variations']);
const VIA_VALUATION = new Set(['project_subcontract_payments']);
const VIA_EQUIPMENT = new Set(['project_equipment_maintenance']);
const CHILD_ONLY = new Set(['project_estimate_items','project_budget_baseline_items','project_ipc_items','project_quality_check_items','project_transmittal_items']);
const protectedFields = new Set(['id','company_id','created_at','updated_at','created_by','approved_by','approved_at','user_id','owner_user_id']);
const SEARCH_COLUMNS = {
  project_budget_baselines:['baseline_no','notes'], project_progress_measurements:['location','notes'], project_work_certificates:['certificate_no','notes'], project_client_ipcs:['ipc_no','notes'], project_retention_transactions:['reference','notes'],
  project_subcontractors:['name','email','phone'], project_subcontracts:['contract_no','notes'], project_subcontract_items:['item_no','description'], project_subcontract_valuations:['valuation_no'], project_subcontract_payments:['payment_no','reference'], project_subcontract_variations:['variation_no','title','reason'],
  project_quality_inspections:['inspection_no','title','notes'], project_quality_check_items:['description','notes'], project_ncrs:['ncr_no','title','description'], project_quality_records:['record_type','title','reference','notes'],
  project_safety_incidents:['incident_no','title','description'], project_toolbox_talks:['topic','notes'], project_safety_inspections:['title','result','notes'], project_permits:['permit_no','permit_type','authority'], project_safety_actions:['source_type','title','notes'],
  project_equipment:['asset_no','name','category','serial_no'], project_equipment_allocations:['notes'], project_equipment_logs:['notes'], project_equipment_maintenance:['maintenance_type','notes'],
  project_document_versions:['document_no','title','revision'], project_transmittals:['transmittal_no','recipient','subject','notes'], project_rfis:['rfi_no','subject','question','response'], project_closeout_items:['category','title','description'], project_dlp_defects:['defect_no','title','description']
};


export class ConstructionErpService {
  constructor({ supabase, procurementAccountingService = null }) { this.supabase = supabase; this.accounting = procurementAccountingService; }

  async assertProject(companyId, projectId) {
    const { data, error } = await this.supabase.from('projects').select('id,company_id,name,code,currency,budget,contract_value,progress,status,client_name').eq('company_id', companyId).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Project not found'); e.code = 'PROJECT_NOT_FOUND'; e.status = 404; throw e; }
    return data;
  }

  async assertProject(companyId, projectId) {
    const { data, error } = await this.supabase.from('projects').select('id,company_id,name,code,currency,budget,contract_value,progress,status,client_name').eq('company_id', companyId).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Project not found'); e.code = 'PROJECT_NOT_FOUND'; e.status = 404; throw e; }
    return data;
  }

  resourceScope(table) {
    if (!TABLES.has(table)) throw new Error('Unsupported construction ERP resource');
    if (PROJECT_DIRECT.has(table)) return 'project';
    if (VIA_SUBCONTRACT.has(table)) return 'subcontract';
    if (VIA_VALUATION.has(table)) return 'valuation';
    if (VIA_EQUIPMENT.has(table)) return 'equipment';
    if (CHILD_ONLY.has(table)) return 'child';
    return 'company';
  }

  sanitizeMutation(input = {}) {
    const bad = Object.keys(input).filter((key) => protectedFields.has(key));
    if (bad.length) { const e = new Error(`Protected fields cannot be modified: ${bad.join(', ')}`); e.code = 'PROTECTED_FIELD'; e.status = 400; throw e; }
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      if (key !== 'projectId') out[key] = value;
    }
    return out;
  }

  async assertScopedParent(companyId, table, input, projectId) {
    const scope = this.resourceScope(table);
    if (scope === 'project') {
      if (!projectId) { const e = new Error('project_id is required for this resource'); e.code = 'PROJECT_REQUIRED'; e.status = 400; throw e; }
      await this.assertProject(companyId, projectId);
      return;
    }
    if (scope === 'subcontract') {
      const subcontractId = input.subcontract_id || input.subcontractId;
      if (!subcontractId) { const e = new Error('subcontract_id is required'); e.code = 'SUBCONTRACT_REQUIRED'; e.status = 400; throw e; }
      let q = this.supabase.from('project_subcontracts').select('id,project_id').eq('company_id', companyId).eq('id', subcontractId);
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) { const e = new Error('Subcontract not found for this company/project'); e.code = 'SUBCONTRACT_SCOPE_ERROR'; e.status = 400; throw e; }
      return data;
    }
    if (scope === 'valuation') {
      const valuationId = input.valuation_id || input.valuationId;
      if (!valuationId) { const e = new Error('valuation_id is required'); e.code = 'VALUATION_REQUIRED'; e.status = 400; throw e; }
      const { data, error } = await this.supabase.from('project_subcontract_valuations').select('id,subcontract_id').eq('company_id', companyId).eq('id', valuationId).maybeSingle();
      if (error) throw error;
      if (!data) { const e = new Error('Valuation not found'); e.code = 'VALUATION_NOT_FOUND'; e.status = 404; throw e; }
      if (projectId) {
        const { data: sub, error: se } = await this.supabase.from('project_subcontracts').select('id,project_id').eq('company_id', companyId).eq('id', data.subcontract_id).maybeSingle();
        if (se) throw se;
        if (!sub || sub.project_id !== projectId) { const e = new Error('Valuation is not linked to this project'); e.code = 'PROJECT_SCOPE_ERROR'; e.status = 400; throw e; }
      }
      return data;
    }
    if (scope === 'equipment') {
      const equipmentId = input.equipment_id || input.equipmentId;
      if (!equipmentId) { const e = new Error('equipment_id is required'); e.code = 'EQUIPMENT_REQUIRED'; e.status = 400; throw e; }
      const { data, error } = await this.supabase.from('project_equipment').select('id').eq('company_id', companyId).eq('id', equipmentId).maybeSingle();
      if (error) throw error;
      if (!data) { const e = new Error('Equipment not found'); e.code = 'EQUIPMENT_NOT_FOUND'; e.status = 404; throw e; }
      return data;
    }
    return null;
  }

  async list(table, { companyId, projectId, status, search, page = 1, pageSize = 50, order = 'created_at' }) {
    const scope = this.resourceScope(table);
    let query = this.supabase.from(table).select('*', { count: 'exact' }).eq('company_id', companyId);
    if (scope === 'project' && projectId) query = query.eq('project_id', projectId);
    if (scope === 'subcontract' && projectId) query = query.in('subcontract_id', (await this.supabase.from('project_subcontracts').select('id').eq('company_id', companyId).eq('project_id', projectId)).data?.map(x => x.id) || ['00000000-0000-0000-0000-000000000000']);
    if (scope === 'valuation' && projectId) {
      const { data: subs, error: se } = await this.supabase.from('project_subcontracts').select('id').eq('company_id', companyId).eq('project_id', projectId);
      if (se) throw se;
      const { data: vals, error: ve } = await this.supabase.from('project_subcontract_valuations').select('id').eq('company_id', companyId).in('subcontract_id', (subs || []).map(x => x.id));
      if (ve) throw ve;
      query = query.in('valuation_id', (vals || []).map(x => x.id).length ? (vals || []).map(x => x.id) : ['00000000-0000-0000-0000-000000000000']);
    }
    if (status) query = query.eq('status', status);
    if (search) {
      const safe = search.replace(/[,%()]/g, ' ');
      const columns = SEARCH_COLUMNS[table] || [];
      if (columns.length) query = query.or(columns.map(column => `${column}.ilike.%${safe}%`).join(','));
    }
    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order(order, { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    return { items: data || [], page, pageSize, total: count || 0 };
  }

  async create(table, { companyId, projectId, userId, input }) {
    const scope = this.resourceScope(table);
    const cleanInput = this.sanitizeMutation(input);
    await this.assertScopedParent(companyId, table, cleanInput, projectId);
    const row = { ...cleanInput, id: randomUUID(), company_id: companyId };
    if (scope === 'project') row.project_id = projectId;
    if (this.columnHints(table).created_by) row.created_by = userId;
    const { data, error } = await this.supabase.from(table).insert(row).select().single();
    if (error) throw error;
    return data;
  }

  columnHints(table) {
    const withCreatedBy = new Set(['project_estimates','project_budget_baselines','project_progress_measurements','project_work_certificates','project_client_ipcs','project_subcontractors','project_subcontracts','project_subcontract_valuations','project_subcontract_payments','project_subcontract_variations','project_quality_records','project_document_versions','project_transmittals','project_safety_actions','project_equipment_logs']);
    return withCreatedBy.has(table) ? { created_by: true } : {};
  }

  async update(table, { companyId, id, input }) {
    if (!TABLES.has(table)) throw new Error('Unsupported construction ERP resource');
    const patch = this.sanitizeMutation(input);
    const { data: existing, error: ee } = await this.supabase.from(table).select('*').eq('company_id', companyId).eq('id', id).maybeSingle();
    if (ee) throw ee;
    if (!existing) { const e = new Error('Construction ERP record not found'); e.code = 'NOT_FOUND'; e.status = 404; throw e; }
    const scope = this.resourceScope(table);
    if (scope === 'project') await this.assertProject(companyId, existing.project_id);
    if (scope === 'subcontract') await this.assertScopedParent(companyId, table, { subcontract_id: existing.subcontract_id }, null);
    if (scope === 'valuation') await this.assertScopedParent(companyId, table, { valuation_id: existing.valuation_id }, null);
    if (scope === 'equipment') await this.assertScopedParent(companyId, table, { equipment_id: existing.equipment_id }, null);
    const { data, error } = await this.supabase.from(table).update(patch).eq('company_id', companyId).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async createEstimate({ companyId, projectId, userId, input }) {
    await this.assertProject(companyId, projectId);
    const items = input.items || [];
    const subtotal = items.reduce((s, x) => s + Number(x.quantity || 0) * Number(x.unitRate || 0), 0);
    const markup = subtotal * Number(input.markupPercent || 0) / 100;
    const tax = items.reduce((s, x) => s + (Number(x.quantity || 0) * Number(x.unitRate || 0) * Number(x.taxRate || 0) / 100), 0);
    const total = subtotal + markup + tax;
    const estimateId = randomUUID();
    const estimate = { id: estimateId, company_id: companyId, project_id: projectId, estimate_no: clean(input.estimateNo) || `EST-${Date.now()}`, version_no: Number(input.versionNo || 1), status: 'DRAFT', currency: clean(input.currency) || 'NGN', markup_percent: Number(input.markupPercent || 0), subtotal, markup_amount: markup, tax_amount: tax, total_amount: total, notes: clean(input.notes) || null, created_by: userId };
    const { data, error } = await this.supabase.from('project_estimates').insert(estimate).select().single();
    if (error) throw error;
    if (items.length) {
      const rows = items.map((x, i) => ({ id: randomUUID(), company_id: companyId, estimate_id: estimateId, item_no: clean(x.itemNo) || String(i + 1).padStart(3, '0'), section: clean(x.section) || null, description: clean(x.description), category: x.category || 'OTHER', quantity: Number(x.quantity || 0), unit: clean(x.unit), unit_rate: Number(x.unitRate || 0), tax_rate: Number(x.taxRate || 0), line_total: Number(x.quantity || 0) * Number(x.unitRate || 0) }));
      const r = await this.supabase.from('project_estimate_items').insert(rows);
      if (r.error) throw r.error;
    }
    return this.getEstimate({ companyId, id: estimateId });
  }

  async getEstimate({ companyId, id }) {
    const { data, error } = await this.supabase.from('project_estimates').select('*').eq('company_id', companyId).eq('id', id).single();
    if (error) throw error;
    const { data: items, error: ie } = await this.supabase.from('project_estimate_items').select('*').eq('company_id', companyId).eq('estimate_id', id).order('item_no');
    if (ie) throw ie;
    return { ...data, items: items || [] };
  }

  async approveEstimate({ companyId, id, userId }) {
    const estimate = await this.getEstimate({ companyId, id });
    if (!['DRAFT','SUBMITTED','APPROVED'].includes(estimate.status)) { const e = new Error('Only draft, submitted or recoverable approved estimates can be approved'); e.status = 409; throw e; }
    if (estimate.status !== 'APPROVED') await this.supabase.from('project_estimates').update({ status: 'SUPERSEDED' }).eq('company_id', companyId).eq('project_id', estimate.project_id).eq('status','APPROVED').neq('id',id);
    await this.supabase.from('project_budget_baselines').update({ status: 'SUPERSEDED' }).eq('company_id', companyId).eq('project_id', estimate.project_id).eq('status','APPROVED');
    let approval = { data: estimate, error: null };
    if (estimate.status !== 'APPROVED') {
      approval = await this.supabase.from('project_estimates').update({ status: 'APPROVED', approved_by: userId, approved_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', id).select().single();
      if (approval.error) throw approval.error;
    }
    const baselineNo = `BL-${estimate.estimate_no}-V${estimate.version_no}`;
    let { data: baseline, error } = await this.supabase.from('project_budget_baselines').select('*').eq('company_id',companyId).eq('estimate_id',id).maybeSingle();
    if (error) throw error;
    if (!baseline) {
      const created = await this.supabase.from('project_budget_baselines').insert({ id: randomUUID(), company_id: companyId, project_id: estimate.project_id, estimate_id: id, baseline_no: baselineNo, status: 'APPROVED', currency: estimate.currency, total_budget: estimate.total_amount, approved_by: userId, approved_at: new Date().toISOString(), created_by: userId }).select().single();
      if (created.error) throw created.error;
      baseline = created.data;
    }
    const rows = estimate.items.map(x => ({ id: randomUUID(), company_id: companyId, baseline_id: baseline.id, estimate_item_id: x.id, category: x.category, description: x.description, quantity: x.quantity, unit: x.unit, budget_rate: x.unit_rate, budget_amount: x.line_total }));
    if (rows.length) { const r = await this.supabase.from('project_budget_baseline_items').insert(rows); if (r.error) throw r.error; }
    await this.supabase.from('projects').update({ budget: estimate.total_amount, currency: estimate.currency }).eq('company_id', companyId).eq('id', estimate.project_id);
    return this.getEstimate({ companyId, id });
  }

  async approveProgress({ companyId, id }) {
    const { data: measurement, error } = await this.supabase.from('project_progress_measurements').select('*').eq('company_id', companyId).eq('id', id).single();
    if (error) throw error;
    const up = await this.supabase.from('project_progress_measurements').update({ status:'APPROVED' }).eq('company_id',companyId).eq('id',id).select().single();
    if (up.error) throw up.error;
    const { data: rows, error: re } = await this.supabase.from('project_progress_measurements').select('percent_complete,status').eq('company_id',companyId).eq('project_id',measurement.project_id).eq('status','APPROVED');
    if (re) throw re;
    const progress = Math.min(100, Math.max(0, (rows||[]).reduce((m,x)=>Math.max(m,Number(x.percent_complete||0)),0)));
    await this.supabase.from('projects').update({ progress }).eq('company_id',companyId).eq('id',measurement.project_id);
    return { ...up.data, projectProgress: progress };
  }

  async approveIpc({ companyId, id, userId }) {
    const { data: ipc, error } = await this.supabase.from('project_client_ipcs').select('*').eq('company_id', companyId).eq('id', id).single();
    if (error) throw error;
    if (!['DRAFT','SUBMITTED'].includes(ipc.status)) { const e = new Error('IPC cannot be approved in its current state'); e.status = 409; throw e; }
    const approved = await this.supabase.from('project_client_ipcs').update({ status: 'APPROVED', approved_by: userId, approved_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', id).select().single();
    if (approved.error) throw approved.error;
    if (Number(ipc.retention_amount) > 0) {
      const existingRetention = await this.supabase.from('project_retention_transactions').select('id').eq('company_id',companyId).eq('ipc_id',ipc.id).eq('transaction_type','WITHHELD').maybeSingle();
      if (existingRetention.error) throw existingRetention.error;
      if (!existingRetention.data) {
        const r = await this.supabase.from('project_retention_transactions').insert({ id: randomUUID(), company_id: companyId, project_id: ipc.project_id, ipc_id: ipc.id, transaction_type: 'WITHHELD', amount: ipc.retention_amount, transaction_date: today(), reference: ipc.ipc_no, notes: 'Client retention withheld from approved IPC', created_by: userId });
        if (r.error && r.error.code !== '23505') throw r.error;
      }
    }
    return approved.data;
  }

  async invoiceIpc({ companyId, id, userId }) {
    const { data: ipc, error } = await this.supabase.from('project_client_ipcs').select('*').eq('company_id', companyId).eq('id', id).single();
    if (error) throw error;
    if (ipc.status !== 'APPROVED') { const e = new Error('Only approved IPCs can be invoiced'); e.status = 409; throw e; }
    if (ipc.invoice_id) return this.getIpc({ companyId, id });
    const { data: project, error: pe } = await this.supabase.from('projects').select('client_name,currency').eq('company_id', companyId).eq('id', ipc.project_id).single();
    if (pe) throw pe;
    let invoice;
    if (this.accounting?.createAR) {
      try {
        invoice = await this.accounting.createAR({ companyId, userId, input: { customerName: project.client_name || 'Project Client', projectId: ipc.project_id, invoiceNo: `INV-${ipc.ipc_no}`, invoiceDate: today(), currency: ipc.currency || project.currency || 'NGN', subtotal: Math.max(0, Number(ipc.net_amount) - Number(ipc.tax_amount)), tax: Number(ipc.tax_amount), total: Number(ipc.net_amount), notes: `Generated from IPC ${ipc.ipc_no}` } });
      } catch (e) {
        if (!String(e?.message||'').toLowerCase().includes('duplicate') && e?.code !== '23505') throw e;
        const existing = await this.supabase.from('accounts_receivable_invoices').select('*').eq('company_id',companyId).eq('invoice_no',`INV-${ipc.ipc_no}`).maybeSingle();
        if (existing.error) throw existing.error;
        if (!existing.data) throw e;
        invoice = existing.data;
      }
    } else {
      const ar = await this.supabase.from('accounts_receivable_invoices').insert({ id: randomUUID(), company_id: companyId, customer_name: project.client_name || 'Project Client', project_id: ipc.project_id, invoice_no: `INV-${ipc.ipc_no}`, invoice_date: today(), currency: ipc.currency || project.currency || 'NGN', status: 'ISSUED', subtotal: Math.max(0, Number(ipc.net_amount) - Number(ipc.tax_amount)), tax: Number(ipc.tax_amount), total: Number(ipc.net_amount), amount_paid: 0, notes: `Generated from IPC ${ipc.ipc_no}`, created_by: userId }).select().single();
      if (ar.error) throw ar.error; invoice = ar.data;
    }
    const up = await this.supabase.from('project_client_ipcs').update({ status: 'INVOICED', invoice_id: invoice.id }).eq('company_id', companyId).eq('id', id).select().single();
    if (up.error) throw up.error;
    return { ipc: up.data, invoice };
  }

  async projectProfitability({ companyId, projectId }) {
    const project = await this.assertProject(companyId, projectId);
    const [variations, baselines, invoices, payments, progress, ledger] = await Promise.all([
      this.supabase.from('project_change_orders').select('amount,status').eq('company_id', companyId).eq('project_id', projectId),
      this.supabase.from('project_budget_baselines').select('total_budget,status').eq('company_id', companyId).eq('project_id', projectId),
      this.supabase.from('accounts_receivable_invoices').select('total,status,amount_paid').eq('company_id', companyId).eq('project_id', projectId),
      this.supabase.from('accounts_receivable_payments').select('amount,status,invoice_id').eq('company_id', companyId),
      this.supabase.from('project_progress_measurements').select('percent_complete,status').eq('company_id', companyId).eq('project_id', projectId),
      this.supabase.from('project_cost_ledger_v').select('entry_type,amount,currency,source_type,source_id').eq('company_id', companyId).eq('project_id', projectId)
    ]);
    for (const x of [variations,baselines,invoices,payments,progress]) if (x.error) throw x.error;
    const approvedVariations = (variations.data || []).filter(x => x.status === 'APPROVED').reduce((s,x) => s + Number(x.amount || 0), 0);
    const revisedContract = Number(project.contract_value || 0) + approvedVariations;
    const budget = (baselines.data || []).find(x => x.status === 'APPROVED')?.total_budget || Number(project.budget || 0);
    let committed = 0;
    let actual = 0;
    if (!ledger.error) {
      committed = (ledger.data || []).filter(x => x.entry_type === 'COMMITMENT').reduce((sum,x) => sum + Number(x.amount || 0), 0);
      actual = (ledger.data || []).filter(x => x.entry_type === 'ACTUAL').reduce((sum,x) => sum + Number(x.amount || 0), 0);
    } else {
      const [pos, expenses, supplierInvoices, subcontracts] = await Promise.all([
        this.supabase.from('purchase_orders').select('total,status').eq('company_id', companyId).eq('project_id', projectId),
        this.supabase.from('expenses').select('amount,status').eq('company_id', companyId).eq('project_id', projectId),
        this.supabase.from('supplier_invoices').select('total,status,purchase_order_id,purchase_orders!supplier_invoices_po_tenant_fk!inner(project_id)').eq('company_id', companyId).in('status',['APPROVED','PARTIALLY_PAID','PAID']).eq('purchase_orders.project_id', projectId),
        this.supabase.from('project_subcontracts').select('contract_value,status').eq('company_id', companyId).eq('project_id', projectId)
      ]);
      for (const x of [pos,expenses,supplierInvoices,subcontracts]) if (x.error) throw x.error;
      committed = (pos.data || []).filter(x => x.status !== 'CANCELLED').reduce((sum,x) => sum + Number(x.total || 0), 0) + (subcontracts.data || []).filter(x => x.status !== 'CANCELLED').reduce((sum,x) => sum + Number(x.contract_value || 0), 0);
      actual = (expenses.data || []).filter(x => !['REJECTED','CANCELLED'].includes(x.status)).reduce((sum,x) => sum + Number(x.amount || 0), 0) + (supplierInvoices.data || []).reduce((sum,x) => sum + Number(x.total || 0), 0);
    }
    const invoicedRevenue = (invoices.data || []).filter(x => x.status !== 'VOID').reduce((s,x) => s + Number(x.total || 0), 0);
    const collectedRevenue = (invoices.data || []).reduce((s,x) => s + Number(x.amount_paid || 0), 0);
    const pct = Math.max(0, Math.min(100, Number(project.progress || 0)));
    const forecastFinalCost = pct > 1 ? actual / (pct / 100) : Math.max(actual, committed, Number(budget || 0));
    const forecastProfit = revisedContract - forecastFinalCost;
    const margin = revisedContract > 0 ? forecastProfit / revisedContract * 100 : 0;
    return { project, contractValue: Number(project.contract_value || 0), approvedVariations, revisedContract, budget: Number(budget || 0), committed, actual, invoicedRevenue, collectedRevenue, forecastFinalCost, forecastProfit, marginPercent: margin };
  }

  async executive({ companyId }) {
    const { data: projects, error } = await this.supabase.from('projects').select('id,name,status,progress,budget,contract_value,health_status,expected_end_date').eq('company_id', companyId);
    if (error) throw error;
    const rows = projects || [];
    const profitability = [];
    for (const p of rows) profitability.push(await this.projectProfitability({ companyId, projectId: p.id }));
    const openRfis = await this.supabase.from('project_rfis').select('id,status,due_date,project_id').eq('company_id', companyId).not('status','in','("CLOSED","APPROVED")');
    const openNcr = await this.supabase.from('project_ncrs').select('id,status,project_id').eq('company_id', companyId).not('status','eq','CLOSED');
    const incidents = await this.supabase.from('project_safety_incidents').select('id,status,lost_time,project_id').eq('company_id', companyId).not('status','eq','CLOSED');
    const ap = await this.supabase.from('supplier_invoices').select('total,amount_paid,status').eq('company_id', companyId).not('status','eq','VOID');
    const overdueTasks = await this.supabase.from('tasks').select('id').eq('company_id', companyId).lt('due_date', today()).not('status','in','(COMPLETED,CANCELLED)');
    const materialAlerts = await this.supabase.from('inventory_balances').select('quantity,material_id,site_id,materials!inner(reorder_level,active)').eq('company_id', companyId).eq('materials.active', true);
    if (openRfis.error || openNcr.error || incidents.error || ap.error || overdueTasks.error || materialAlerts.error) throw (openRfis.error || openNcr.error || incidents.error || ap.error || overdueTasks.error || materialAlerts.error);
    const receivables = (await this.supabase.from('accounts_receivable_invoices').select('total,amount_paid,status').eq('company_id',companyId).in('status',['ISSUED','PARTIALLY_PAID'])).data?.reduce((s,x)=>s+Math.max(0,Number(x.total||0)-Number(x.amount_paid||0)),0) || 0;
    const payables = (ap.data||[]).reduce((s,x)=>s+Math.max(0,Number(x.total||0)-Number(x.amount_paid||0)),0);
    const materialAlertRows=(materialAlerts.data||[]).filter(x=>Number(x.quantity||0)<=Number(x.materials?.reorder_level||0));
    return { projects: rows, profitability, metrics: { totalProjects: rows.length, activeProjects: rows.filter(x=>x.status==='ACTIVE').length, atRiskProjects: rows.filter(x=>x.health_status==='RED').length, receivables, payables, openRfis: (openRfis.data||[]).length, openNcrs: (openNcr.data||[]).length, openSafetyIncidents: (incidents.data||[]).length, overdueTasks: (overdueTasks.data||[]).length, materialAlerts: materialAlertRows.length, portfolioContractValue: profitability.reduce((s,x)=>s+x.revisedContract,0), portfolioForecastProfit: profitability.reduce((s,x)=>s+x.forecastProfit,0) } };
  }

  async aiInsights({ companyId }) {
    const executive = await this.executive({ companyId });
    const insights = [];
    for (const p of executive.profitability || []) {
      if (p.revisedContract > 0 && p.marginPercent < 10) insights.push({ severity: 'CRITICAL', projectId: p.project.id, projectName: p.project.name, title: 'Low forecast margin', message: `Forecast margin is ${p.marginPercent.toFixed(1)}%. Review committed and forecast final costs.` });
      if (p.budget > 0 && p.committed > p.budget) insights.push({ severity: 'CRITICAL', projectId: p.project.id, projectName: p.project.name, title: 'Commitments exceed budget', message: `${((p.committed / p.budget - 1) * 100).toFixed(1)}% of the approved budget has been committed.` });
      if (p.invoicedRevenue > p.revisedContract && p.revisedContract > 0) insights.push({ severity: 'HIGH', projectId: p.project.id, projectName: p.project.name, title: 'Billing exceeds contract value', message: 'Review approved variations and client billing before issuing additional invoices.' });
    }
    if (executive.metrics.overdueTasks > 0) insights.push({ severity: 'HIGH', title: 'Overdue work detected', message: `${executive.metrics.overdueTasks} task(s) are past their due date and not completed.` });
    if (executive.metrics.materialAlerts > 0) insights.push({ severity: 'HIGH', title: 'Material stock alerts', message: `${executive.metrics.materialAlerts} material stock position(s) are at or below reorder level.` });
    if (executive.metrics.openRfis > 0) insights.push({ severity: executive.metrics.openRfis >= 5 ? 'HIGH' : 'MEDIUM', title: 'Technical decisions pending', message: `${executive.metrics.openRfis} RFI(s) remain open. Review those approaching due dates.` });
    if (executive.metrics.openNcrs > 0) insights.push({ severity: executive.metrics.openNcrs >= 3 ? 'HIGH' : 'MEDIUM', title: 'Quality actions pending', message: `${executive.metrics.openNcrs} NCR(s) remain open.` });
    if (executive.metrics.openSafetyIncidents > 0) insights.push({ severity: 'CRITICAL', title: 'Safety incidents require attention', message: `${executive.metrics.openSafetyIncidents} safety incident(s) remain open.` });
    if (!insights.length) insights.push({ severity: 'INFO', title: 'Portfolio looks stable', message: 'No high-priority commercial, delivery, material, quality or safety signals were detected from current HySmart records.' });
    return { generatedAt: new Date().toISOString(), insights: insights.slice(0, 20), metrics: executive.metrics };
  }


  async commercialSummary({ companyId, projectId }) {
    await this.assertProject(companyId, projectId);
    const { data, error } = await this.supabase.from('project_commercial_summary_v').select('*').eq('company_id', companyId).eq('project_id', projectId).maybeSingle();
    if (error) throw error;
    if (data) return data;
    return { company_id: companyId, project_id: projectId, approved_estimate: 0, approved_budget: 0, approved_variations: 0, certified_value: 0, invoiced_certified_value: 0, committed_cost: 0, actual_cost: 0 };
  }

  async listCostCodes({ companyId, active = true }) {
    let q = this.supabase.from('project_cost_codes').select('*').eq('company_id', companyId);
    if (active !== undefined) q = q.eq('active', active);
    const { data, error } = await q.order('code');
    if (error) throw error;
    return data || [];
  }

  async createCostCode({ companyId, userId, input }) {
    const { data, error } = await this.supabase.from('project_cost_codes').insert({ id: randomUUID(), company_id: companyId, code: clean(input.code), name: clean(input.name), category: clean(input.category) || null, active: input.active !== false }).select().single();
    if (error) throw error;
    return data;
  }

  async transitionChangeOrder({ companyId, projectId, changeOrderId, userId, status, approvalNotes, clientApproved }) {
    const { data: current, error } = await this.supabase.from('project_change_orders').select('*').eq('company_id', companyId).eq('project_id', projectId).eq('id', changeOrderId).single();
    if (error) throw error;
    const allowed = { DRAFT:['SUBMITTED','CANCELLED'], SUBMITTED:['APPROVED','REJECTED','CANCELLED'], APPROVED:['CANCELLED'], REJECTED:['DRAFT'], CANCELLED:[] };
    if (!allowed[current.status]?.includes(status)) { const e=new Error(`Invalid change-order transition: ${current.status} -> ${status}`); e.status=409; e.code='INVALID_CHANGE_ORDER_TRANSITION'; throw e; }
    const patch = { status };
    if (status === 'APPROVED') { patch.approved_by=userId; patch.approved_date=today(); patch.approval_notes=clean(approvalNotes)||null; }
    if (clientApproved !== undefined) { patch.client_approved=Boolean(clientApproved); if (clientApproved) patch.client_approved_date=today(); }
    const { data, error: ue } = await this.supabase.from('project_change_orders').update(patch).eq('company_id',companyId).eq('project_id',projectId).eq('id',changeOrderId).select().single();
    if (ue) throw ue;
    return data;
  }

  async importEstimateItems({ companyId, projectId, userId, input }) {
    const estimateInput = { ...input, items: (input.items || []).map((x,i)=>({ itemNo:x.itemNo||String(i+1).padStart(3,'0'), section:x.section||null, description:x.description, category:x.category||'OTHER', quantity:Number(x.quantity||0), unit:x.unit||'unit', unitRate:Number(x.unitRate||0), taxRate:Number(x.taxRate||0) })) };
    return this.createEstimate({ companyId, projectId, userId, input: estimateInput });
  }

  async getIpc({ companyId, id }) {
    const { data, error } = await this.supabase.from('project_client_ipcs').select('*').eq('company_id', companyId).eq('id', id).single();
    if (error) throw error;
    const { data: items, error: ie } = await this.supabase.from('project_ipc_items').select('*').eq('company_id', companyId).eq('ipc_id', id);
    if (ie) throw ie;
    return { ...data, items: items || [] };
  }
}
