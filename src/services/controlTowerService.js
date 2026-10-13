const n=v=>Number(v||0);
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
const money=(v)=>Math.round(n(v)*100)/100;

export class ControlTowerService {
  constructor({executiveIntelligenceService, treasuryService, workflowService}) {
    this.executive = executiveIntelligenceService;
    this.treasury = treasuryService;
    this.workflow = workflowService;
  }

  async dashboard({companyId, projectId=null, userId=null, refresh=false}) {
    if (refresh) await this.workflow.scan({companyId,userId,projectId});
    const [portfolio, cash, workflow] = await Promise.all([
      this.executive.portfolio({companyId,projectId}),
      this.treasury.forecast({companyId,projectId,horizonWeeks:13,collectionRate:1,paymentRate:1,contingencyRate:0,persist:false}),
      this.workflow.dashboard({companyId,projectId})
    ]);
    const projects=portfolio.projects||[];
    const red=projects.filter(p=>p.healthStatus==='RED');
    const amber=projects.filter(p=>p.healthStatus==='AMBER');
    const scheduleVariance=projects.filter(p=>n(p.scheduleVarianceDays)>0).sort((a,b)=>n(b.scheduleVarianceDays)-n(a.scheduleVarianceDays));
    const costAtRisk=projects.filter(p=>n(p.costVariance)<0).sort((a,b)=>n(a.costVariance)-n(b.costVariance));
    const executionRisk=projects.filter(p=>n(p.materialRisk)>0||n(p.productivityIndex)>0&&n(p.productivityIndex)<0.8).sort((a,b)=>(n(b.materialRisk)+ (n(b.productivityIndex)<0.8?1:0))-(n(a.materialRisk)+(n(a.productivityIndex)<0.8?1:0)));
    const actionItems=(workflow.items||[]).filter(x=>['OPEN','ACKNOWLEDGED'].includes(x.status));
    const questions={
      time:{status:scheduleVariance.some(p=>n(p.scheduleVarianceDays)>14)?'RED':scheduleVariance.length?'AMBER':'GREEN',projectsDelayed:scheduleVariance.length,criticalDelays:projects.reduce((s,p)=>s+n(p.criticalOverdue),0),worstProject:scheduleVariance[0]||null},
      money:{status:costAtRisk.some(p=>Math.abs(n(p.costVariance))>Math.max(n(p.budget)*0.1,1))?'RED':costAtRisk.length?'AMBER':'GREEN',projectsOverBudget:costAtRisk.length,forecastOverrun:money(costAtRisk.reduce((s,p)=>s+Math.max(0,-n(p.costVariance)),0)),worstProject:costAtRisk[0]||null},
      cash:{status:(cash.alerts||[]).some(x=>x.severity==='CRITICAL')?'RED':(cash.alerts||[]).length?'AMBER':'GREEN',minimumCash:money(cash.lines?.length?Math.min(...cash.lines.map(x=>n(x.closingCash)),n(cash.run?.opening_cash)):0),fundingGap:money(cash.lines?.reduce((m,x)=>Math.max(m,n(x.fundingGap)),0)||0),receivables:money(cash.drivers?.receivablesOutstanding),payables:money(cash.drivers?.payablesOutstanding)},
      execution:{status:executionRisk.length>2?'RED':executionRisk.length?'AMBER':'GREEN',atRiskProjects:executionRisk.length,materialRisk:projects.reduce((s,p)=>s+n(p.materialRisk),0),lowProductivity:projects.filter(p=>n(p.productivityIndex)>0&&n(p.productivityIndex)<0.8).length},
      action:{status:workflow.summary?.critical?'RED':workflow.summary?.overdue?'AMBER':'GREEN',open:workflow.summary?.open||0,overdue:workflow.summary?.overdue||0,critical:workflow.summary?.critical||0,high:workflow.summary?.high||0}
    };
    const recommendations=[];
    const add=(priority,projectId,title,reason,action)=>recommendations.push({priority,projectId,title,reason,action});
    for(const p of [...projects].sort((a,b)=>a.healthScore-b.healthScore).slice(0,10)) {
      if(n(p.criticalOverdue)>0) add('NOW',p.id,`Recover ${p.name}`,`${p.criticalOverdue} critical-path activity/activities are overdue.`,`Run a recovery programme, assign blockers and confirm a revised finish date.`);
      else if(n(p.costVariance)<0) add('NOW',p.id,`Protect margin on ${p.name}`,`Forecast cost is ${Math.abs(n(p.costVariance)).toFixed(0)} above budget.`,`Review remaining quantities, commitments, variations and subcontractor exposure before further spend.`);
      else if(n(p.materialRisk)>0) add('NOW',p.id,`Protect site supply on ${p.name}`,`${p.materialRisk} material position(s) are at risk.`,`Escalate procurement and confirm delivery dates against the look-ahead programme.`);
      else if(n(p.overdueRfis)>0) add('THIS_WEEK',p.id,`Resolve technical decisions on ${p.name}`,`${p.overdueRfis} RFI(s) are overdue.`,`Escalate unanswered RFIs to the responsible consultant/client and record the decision.`);
      else if(n(p.overdueActions)>0) add('THIS_WEEK',p.id,`Clear management actions on ${p.name}`,`${p.overdueActions} workflow action(s) are overdue.`,`Assign owners and close or re-date actions with evidence.`);
    }
    if(n(questions.cash.fundingGap)>0) add('NOW',null,'Protect working capital',`The 13-week forecast has a peak funding gap of ${questions.cash.fundingGap.toFixed(0)}.`,`Accelerate collections, sequence supplier payments and identify a funding source before the shortfall week.`);
    else if(n(questions.cash.receivables)>n(questions.cash.payables)*1.5&&n(questions.cash.receivables)>0) add('THIS_WEEK',null,'Accelerate collections','Receivables materially exceed supplier payables.','Prioritise overdue certificates/invoices and assign collection owners by client.');
    return {generatedAt:new Date().toISOString(),questions,portfolio:{summary:portfolio.summary,projects},cash:{minimumCash:questions.cash.minimumCash,fundingGap:questions.cash.fundingGap,alerts:cash.alerts||[],drivers:cash.drivers||{},lines:(cash.lines||[]).slice(0,13)},actions:{summary:workflow.summary||{},items:actionItems.slice(0,25)},recommendations:recommendations.slice(0,15),focus:{redProjects:red.slice(0,5),amberProjects:amber.slice(0,5),scheduleRisk:scheduleVariance.slice(0,5),costRisk:costAtRisk.slice(0,5),executionRisk:executionRisk.slice(0,5)}};
  }
}
