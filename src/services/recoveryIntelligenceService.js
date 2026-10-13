const n=v=>Number(v||0);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const round=v=>Math.round(n(v)*100)/100;

export class RecoveryIntelligenceService {
  constructor({executiveIntelligenceService, treasuryService}) { this.executive=executiveIntelligenceService; this.treasury=treasuryService; }

  async analyze({companyId, projectId=null}) {
    const portfolio=await this.executive.portfolio({companyId, projectId});
    const projects=portfolio.projects||[];
    const target=projectId ? projects.find(p=>p.id===projectId) : null;
    const rows=target?[target]:projects.filter(p=>p.healthStatus!=='GREEN').sort((a,b)=>a.healthScore-b.healthScore).slice(0,20);
    const cash=await this.treasury.forecast({companyId,projectId,horizonWeeks:13,collectionRate:1,paymentRate:1,contingencyRate:0,persist:false});
    const analyses=rows.map(p=>this.project(p,cash));
    return {generatedAt:new Date().toISOString(),projectId,summary:this.summary(analyses),projects:analyses,cash:{minimumCash:cash.lines.at(-1)?.closingCash!=null?Math.min(...cash.lines.map(x=>n(x.closingCash))):null,fundingGap:n(cash.lines.reduce((m,x)=>Math.max(m,n(x.fundingGap)),0)),alerts:cash.alerts,drivers:cash.drivers}};
  }

  project(p,cash) {
    const recommendations=[];
    const add=(type,priority,title,reason,action,targetValue,unit,evidence,confidence=80)=>recommendations.push({type,priority,title,reason,action,targetValue:targetValue==null?null:round(targetValue),unit:unit||null,evidence,confidence});
    if(n(p.criticalOverdue)>0) add('SCHEDULE','NOW','Recover the critical path',`${p.criticalOverdue} critical activity/activities are overdue and the forecast finish is ${Math.max(0,round(p.scheduleVarianceDays))} day(s) late.`,`Resequence or accelerate the critical activities and commit named owners to remove the blockers.`,Math.max(1,Math.min(14,Math.ceil(n(p.scheduleVarianceDays)||7))),'days', {criticalOverdue:p.criticalOverdue,scheduleVarianceDays:round(p.scheduleVarianceDays),spi:p.spi},92);
    else if(n(p.scheduleVarianceDays)>7) add('SCHEDULE','THIS_WEEK','Recover schedule float',`Forecast completion is ${round(p.scheduleVarianceDays)} day(s) behind the contractual/expected finish.`,`Run a look-ahead recovery review and commit to the activities that will recover the lost days.`,Math.min(14,Math.ceil(n(p.scheduleVarianceDays))),'days',{scheduleVarianceDays:round(p.scheduleVarianceDays),spi:p.spi},88);
    if(n(p.costVariance)<0) add('COST','NOW','Protect project margin',`Forecast final cost is ${Math.abs(round(p.costVariance)).toLocaleString()} above the approved budget.`,`Identify the largest cost drivers, freeze avoidable leakage and approve a quantified containment target.`,Math.abs(round(p.costVariance)),'currency',{forecastCost:round(p.forecastCost),budget:round(p.budget),costVariance:round(p.costVariance),cpi:p.cpi},93);
    if(n(p.materialRisk)>0) add('PROCUREMENT','NOW','Protect site supply',`${p.materialRisk} material requirement(s) appear at risk against their required dates.`,`Escalate the affected procurement lines, confirm supplier dates and agree a substitute or recovery route where necessary.`,p.materialRisk,'items',{materialRisk:p.materialRisk},89);
    if(n(p.overdueRfis)>0) add('CLIENT','THIS_WEEK','Clear technical decisions',`${p.overdueRfis} RFI(s) are overdue and may be blocking production.`,`Escalate the overdue RFIs to the responsible consultant/client and set a decision deadline before the next look-ahead.`,p.overdueRfis,'RFIs',{overdueRfis:p.overdueRfis},86);
    if(n(p.productivityIndex)>0 && n(p.productivityIndex)<1) add('SUBCONTRACTOR','THIS_WEEK','Recover productivity',`Recent labour productivity is below the baseline signal used by the project intelligence layer.`,`Review the affected work fronts, labour loading and subcontractor output; set a measurable weekly production target.`,round(Math.max(1,n(p.productivityIndex)*1.15)),'productivity index',{productivityIndex:round(p.productivityIndex)},74);
    if(n(p.criticalNcrs)>0) add('QUALITY','NOW','Contain critical quality risk',`${p.criticalNcrs} critical NCR(s) remain open.`,`Contain the affected work, assign corrective action owners and verify closure before the next recovery review.`,p.criticalNcrs,'NCRs',{criticalNcrs:p.criticalNcrs,openNcrs:p.openNcrs},94);
    if(n(p.openSafetyIncidents)>0) add('QUALITY','NOW','Stabilise safety exposure',`${p.openSafetyIncidents} open safety incident(s) are contributing to project risk.`,`Close immediate corrective actions and confirm controls at the next site review.`,p.openSafetyIncidents,'incidents',{openSafetyIncidents:p.openSafetyIncidents},90);
    if(n(cash.fundingGap)>0) add('CASH','NOW','Protect working capital',`The 13-week cash forecast shows a potential funding gap of ${round(cash.fundingGap).toLocaleString()}.`,`Accelerate collections, re-sequence discretionary payments and escalate the funding requirement before the projected trough.`,round(cash.fundingGap),'currency',{fundingGap:round(cash.fundingGap),overdueReceivables:round(cash.drivers?.overdueReceivables),overduePayables:round(cash.drivers?.overduePayables)},91);
    if(n(cash.drivers?.overdueReceivables)>0) add('CASH','THIS_WEEK','Accelerate collections',`Overdue customer receivables total ${round(cash.drivers.overdueReceivables).toLocaleString()}.`,`Assign collection owners to the overdue invoices and agree client payment dates.`,round(cash.drivers.overdueReceivables),'currency',{overdueReceivables:round(cash.drivers.overdueReceivables)},87);
    recommendations.sort((a,b)=>({NOW:0,THIS_WEEK:1}[a.priority]-({NOW:0,THIS_WEEK:1}[b.priority])||b.confidence-a.confidence));
    const interventionScore=clamp(100-(n(p.healthScore)),0,100);
    return {project:{id:p.id,name:p.name,code:p.code},health:{score:p.healthScore,status:p.healthStatus,confidence:p.confidence},drivers:{costVariance:round(p.costVariance),scheduleVarianceDays:round(p.scheduleVarianceDays),criticalOverdue:p.criticalOverdue,materialRisk:p.materialRisk,overdueRfis:p.overdueRfis,productivityIndex:p.productivityIndex,criticalNcrs:p.criticalNcrs,openSafetyIncidents:p.openSafetyIncidents},interventionScore,recommendations};
  }

  summary(rows){const recommendations=rows.flatMap(x=>x.recommendations);return {projectsAnalysed:rows.length,projectsNeedingRecovery:rows.filter(x=>x.health.status!=='GREEN').length,now:recommendations.filter(x=>x.priority==='NOW').length,thisWeek:recommendations.filter(x=>x.priority==='THIS_WEEK').length,topIntervention:recommendations[0]?.title||null};}
}
