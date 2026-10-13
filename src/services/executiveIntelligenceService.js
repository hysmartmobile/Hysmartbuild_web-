import { randomUUID } from 'node:crypto';

const n = v => Number(v || 0);
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

export class ExecutiveIntelligenceService {
  constructor({ supabase }) { this.supabase = supabase; }

  async assertCompany(companyId) {
    const { data, error } = await this.supabase.from('companies').select('id,name').eq('id', companyId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Company not found'); e.status = 404; e.code = 'COMPANY_NOT_FOUND'; throw e; }
    return data;
  }

  async portfolio({ companyId, projectId }) {
    await this.assertCompany(companyId);
    let pq = this.supabase.from('projects').select('id,name,code,status,progress,budget,contract_value,health_status,start_date,expected_end_date,actual_end_date,client_name').eq('company_id', companyId);
    if (projectId) pq = pq.eq('id', projectId);
    const { data: projects, error: pe } = await pq.order('name');
    if (pe) throw pe;
    const rows = projects || [];
    if (!rows.length) return { generatedAt: new Date().toISOString(), summary: this.emptySummary(), projects: [], alerts: [], recommendations: [] };
    const ids = rows.map(x => x.id);
    const [costs, activities, risks, actions, ncrs, incidents, rfis, materials, productivity, snapshots] = await Promise.all([
      this.supabase.from('project_cost_ledger_v').select('project_id,entry_type,amount').eq('company_id', companyId).in('project_id', ids),
      this.supabase.from('project_schedule_activities').select('id,project_id,name,status,planned_finish,forecast_finish,schedule_variance_days,total_float_days,is_critical,percent_complete').eq('company_id', companyId).in('project_id', ids),
      this.supabase.from('project_risks').select('id,project_id,title,probability,impact,status,due_date').eq('company_id', companyId).in('project_id', ids).neq('status','CLOSED'),
      this.supabase.from('workflow_action_items').select('id,project_id,title,severity,status,due_at').eq('company_id', companyId).in('project_id', ids).in('status',['OPEN','ACKNOWLEDGED']),
      this.supabase.from('quality_ncrs').select('id,project_id,severity,status,due_date').eq('company_id', companyId).in('project_id', ids).neq('status','CLOSED'),
      this.supabase.from('project_safety_incidents').select('id,project_id,status,lost_time').eq('company_id', companyId).in('project_id', ids).neq('status','CLOSED'),
      this.supabase.from('collaboration_rfis').select('id,project_id,status,due_date').eq('company_id', companyId).in('project_id', ids).not('status','in','(CLOSED,CANCELLED)'),
      this.supabase.from('project_material_plans').select('id,project_id,status,required_by').eq('company_id', companyId).in('project_id', ids),
      this.supabase.from('project_productivity_records').select('id,project_id,work_date,quantity_completed,labour_hours').eq('company_id', companyId).in('project_id', ids).order('work_date',{ascending:false}),
      this.supabase.from('project_execution_snapshots').select('project_id,snapshot_date,schedule_index,cost_index,forecast_cost,forecast_finish,schedule_variance_days,progress_percent').eq('company_id', companyId).in('project_id', ids).order('snapshot_date',{ascending:false}).limit(1000)
    ]);
    for (const x of [costs, activities, risks, actions, ncrs, incidents, rfis, materials, productivity, snapshots]) if (x.error) throw x.error;
    const by = (items) => { const m = new Map(); for (const x of items || []) { if (!m.has(x.project_id)) m.set(x.project_id, []); m.get(x.project_id).push(x); } return m; };
    const cm=by(costs.data), am=by(activities.data), rm=by(risks.data), wm=by(actions.data), qm=by(ncrs.data), im=by(incidents.data), rfm=by(rfis.data), mm=by(materials.data), pm=by(productivity.data), sm=by(snapshots.data);
    const asOf = today();
    const projectRows = rows.map(p => this.scoreProject(p, { costs:cm.get(p.id)||[], activities:am.get(p.id)||[], risks:rm.get(p.id)||[], actions:wm.get(p.id)||[], ncrs:qm.get(p.id)||[], incidents:im.get(p.id)||[], rfis:rfm.get(p.id)||[], materials:mm.get(p.id)||[], productivity:pm.get(p.id)||[], snapshots:sm.get(p.id)||[] }, asOf));
    return this.buildPortfolio(projectRows, asOf);
  }

  scoreProject(p, d, asOf) {
    const committed=d.costs.filter(x=>x.entry_type==='COMMITMENT').reduce((s,x)=>s+n(x.amount),0);
    const actual=d.costs.filter(x=>x.entry_type==='ACTUAL').reduce((s,x)=>s+n(x.amount),0);
    const progress=clamp(n(p.progress));
    const forecastCost=progress>=5 ? Math.max(actual, committed, actual/(progress/100)) : Math.max(actual,committed,n(p.budget));
    const costVariance=n(p.budget)-forecastCost;
    const schedule=d.activities.filter(x=>x.status!=='COMPLETED');
    const overdue=schedule.filter(x=>x.planned_finish && x.planned_finish<asOf);
    const criticalOverdue=overdue.filter(x=>x.is_critical || n(x.total_float_days)<=0);
    const forecastDates=schedule.map(x=>x.forecast_finish||x.planned_finish).filter(Boolean);
    const forecastFinish=forecastDates.length?forecastDates.sort().at(-1):p.expected_end_date;
    const scheduleVariance=forecastFinish&&p.expected_end_date?daysBetween(p.expected_end_date,forecastFinish):0;
    const openRisks=d.risks.filter(x=>x.status!=='CLOSED');
    const highRisks=openRisks.filter(x=>n(x.probability)*n(x.impact)>=15);
    const openActions=d.actions;
    const overdueActions=openActions.filter(x=>x.due_at&&x.due_at.slice(0,10)<asOf);
    const quality=d.ncrs.length;
    const criticalQuality=d.ncrs.filter(x=>x.severity==='CRITICAL').length;
    const safety=d.incidents.length;
    const overdueRfis=d.rfis.filter(x=>x.due_date&&x.due_date<asOf).length;
    const materialRisk=d.materials.filter(x=>x.required_by&&x.required_by<asOf&&x.status!=='RECEIVED').length;
    const recent=d.productivity.filter(x=>x.labour_hours>0).slice(0,5);
    const productivityIndex=recent.length?recent.reduce((s,x)=>s+n(x.quantity_completed)/n(x.labour_hours),0)/recent.length:null;
    const snap=d.snapshots[0]; const prior=d.snapshots[1];
    const spi=snap?.schedule_index ?? (progress>0?1: null); const cpi=snap?.cost_index ?? (forecastCost>0?n(p.budget)/forecastCost:null);
    let score=100;
    if(costVariance<0) score-=clamp(Math.abs(costVariance)/(Math.max(n(p.budget),1))*35,0,35);
    if(scheduleVariance>0) score-=clamp(scheduleVariance*1.8,0,25);
    score-=Math.min(20,criticalOverdue.length*7 + overdue.length*2);
    score-=Math.min(15,highRisks.length*4);
    score-=Math.min(12,criticalQuality*5 + Math.max(0,quality-criticalQuality)*1.5);
    score-=Math.min(12,safety*5);
    score-=Math.min(8,overdueRfis*2 + overdueActions.length);
    score-=Math.min(5,materialRisk);
    const health=score>=80?'GREEN':score>=60?'AMBER':'RED';
    const confidence=clamp(55 + (d.snapshots.length?20:0) + (d.activities.length?10:0) + (n(p.budget)>0?10:0) + (progress>0?5:0));
    const trend=prior&&snap ? (n(snap.schedule_index)-n(prior.schedule_index)) + (n(snap.cost_index)-n(prior.cost_index)) : 0;
    return { id:p.id,name:p.name,code:p.code,status:p.status,clientName:p.client_name,progress,budget:n(p.budget),contractValue:n(p.contract_value),actualCost:actual,committedCost:committed,forecastCost,costVariance,forecastMargin:p.contract_value?((n(p.contract_value)-forecastCost)/n(p.contract_value))*100:null,forecastFinish,scheduleVarianceDays:scheduleVariance,spi,cpi,healthScore:Math.round(clamp(score)),healthStatus:health,confidence,criticalOverdue:criticalOverdue.length,overdueActivities:overdue.length,openRisks:openRisks.length,highRisks:highRisks.length,openNcrs:quality,criticalNcrs:criticalQuality,openSafetyIncidents:safety,overdueRfis,openActions:openActions.length,overdueActions:overdueActions.length,materialRisk,productivityIndex,trend,topRisks:highRisks.slice(0,3),topActions:openActions.slice(0,3),dataAsOf:asOf};
  }

  buildPortfolio(projects, asOf) {
    const sum=(key)=>projects.reduce((s,p)=>s+n(p[key]),0);
    const red=projects.filter(p=>p.healthStatus==='RED'), amber=projects.filter(p=>p.healthStatus==='AMBER');
    const alerts=[]; for(const p of projects){ if(p.healthStatus==='RED') alerts.push({severity:'CRITICAL',projectId:p.id,projectName:p.name,title:'Project health is RED',message:`Health score ${p.healthScore}/100. Review schedule, cost and risk drivers immediately.`}); if(p.criticalOverdue) alerts.push({severity:'HIGH',projectId:p.id,projectName:p.name,title:'Critical-path delay detected',message:`${p.criticalOverdue} critical activity/activities are overdue.`}); if(p.costVariance<0) alerts.push({severity:'HIGH',projectId:p.id,projectName:p.name,title:'Forecast cost exceeds budget',message:`Forecast is ${Math.abs(p.costVariance).toFixed(0)} over the approved budget.`}); if(p.highRisks) alerts.push({severity:'HIGH',projectId:p.id,projectName:p.name,title:'High project risks',message:`${p.highRisks} high-score open risk(s) require mitigation.`}); }
    const recommendations=[]; for(const p of [...projects].sort((a,b)=>a.healthScore-b.healthScore).slice(0,8)){ if(p.criticalOverdue) recommendations.push({projectId:p.id,priority:'NOW',action:'Run a recovery programme for critical activities and assign owners to the blockers.'}); else if(p.costVariance<0) recommendations.push({projectId:p.id,priority:'THIS_WEEK',action:'Review committed cost, remaining quantities and forecast final cost against budget.'}); else if(p.highRisks) recommendations.push({projectId:p.id,priority:'THIS_WEEK',action:'Review high-score risks and confirm mitigation owners and due dates.'}); else if(p.overdueRfis) recommendations.push({projectId:p.id,priority:'THIS_WEEK',action:'Close overdue technical decisions before they affect site production.'}); }
    const healthAvg=projects.length?Math.round(sum('healthScore')/projects.length):100;
    return {generatedAt:new Date().toISOString(),asOf,summary:{totalProjects:projects.length,activeProjects:projects.filter(x=>x.status==='ACTIVE').length,green:projects.filter(x=>x.healthStatus==='GREEN').length,amber:amber.length,red:red.length,healthScore:healthAvg,portfolioBudget:sum('budget'),forecastCost:sum('forecastCost'),costVariance:sum('costVariance'),contractValue:sum('contractValue'),progress:projects.length?projects.reduce((s,p)=>s+n(p.progress)*Math.max(n(p.contractValue),1),0)/Math.max(sum('contractValue'),1):0,criticalDelays:sum('criticalOverdue'),openRisks:sum('openRisks'),openActions:sum('openActions')},projects,alerts:alerts.slice(0,30),recommendations};
  }

  emptySummary(){return {totalProjects:0,activeProjects:0,green:0,amber:0,red:0,healthScore:100,portfolioBudget:0,forecastCost:0,costVariance:0,contractValue:0,progress:0,criticalDelays:0,openRisks:0,openActions:0};}

  async trends({companyId,projectId,days=90}) {
    await this.assertCompany(companyId);
    let q=this.supabase.from('project_execution_snapshots').select('project_id,snapshot_date,planned_value,earned_value,actual_cost,committed_cost,schedule_index,cost_index,forecast_cost,forecast_finish,schedule_variance_days,progress_percent').eq('company_id',companyId).gte('snapshot_date',new Date(Date.now()-Number(days)*86400000).toISOString().slice(0,10)).order('snapshot_date');
    if(projectId)q=q.eq('project_id',projectId);
    const {data,error}=await q.limit(2000);if(error)throw error;return data||[];
  }

  async report({companyId,projectId}) { const portfolio=await this.portfolio({companyId,projectId}); return {title:projectId?'Project Executive Control Report':'Portfolio Executive Control Report',generatedAt:portfolio.generatedAt,summary:portfolio.summary,priorityProjects:portfolio.projects.filter(p=>p.healthStatus!=='GREEN').sort((a,b)=>a.healthScore-b.healthScore).slice(0,10),alerts:portfolio.alerts.slice(0,20),recommendations:portfolio.recommendations.slice(0,12)}; }
}
