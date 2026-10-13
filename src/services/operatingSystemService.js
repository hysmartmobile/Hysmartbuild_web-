import { randomUUID } from 'node:crypto';
import { calculateBoqCommercials } from './boqCommercialCalculations.js';
const n=v=>Number(v||0);
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const isoToday=()=>new Date().toISOString().slice(0,10);
const money=v=>Math.round(n(v)*100)/100;

export class OperatingSystemService {
  constructor({supabase,controlTowerService,revenueMarginService,workfrontProductionService}){this.supabase=supabase;this.controlTowerService=controlTowerService;this.revenueMarginService=revenueMarginService;this.workfrontProductionService=workfrontProductionService;}
  async membership(companyId,userId){const {data,error}=await this.supabase.from('company_members').select('role,status').eq('company_id',companyId).eq('user_id',userId).eq('status','ACTIVE').maybeSingle();if(error)throw error;if(!data){const e=new Error('Company access denied');e.status=403;throw e;}return data;}
  async today({companyId,userId}){
    const member=await this.membership(companyId,userId);
    const [tower,revenue,projects,actions,rfis,ncrs,incidents,materials,attendance,workforce,production,events]=await Promise.all([
      this.controlTowerService.dashboard({companyId,userId,refresh:false}),
      this.revenueMarginService.analyze({companyId}),
      this.supabase.from('projects').select('id,name,progress,status,budget,contract_value,expected_end_date').eq('company_id',companyId).neq('status','CANCELLED'),
      this.supabase.from('workflow_action_items').select('id,project_id,title,severity,status,due_at').eq('company_id',companyId).in('status',['OPEN','ACKNOWLEDGED']).order('due_at',{ascending:true}).limit(100),
      this.supabase.from('collaboration_rfis').select('id,project_id,subject,status,due_date').eq('company_id',companyId).not('status','in','(CLOSED,CANCELLED)').limit(100),
      this.supabase.from('quality_ncrs').select('id,project_id,title,severity,status,due_date').eq('company_id',companyId).neq('status','CLOSED').limit(100),
      this.supabase.from('project_safety_incidents').select('id,project_id,title,severity,status').eq('company_id',companyId).neq('status','CLOSED').limit(100),
      this.supabase.from('project_material_plans').select('id,project_id,required_by,status,planned_quantity').eq('company_id',companyId).in('status',['PLANNED','ORDERED','PARTIALLY_RECEIVED']).limit(200),
      this.supabase.from('attendance_records').select('id,status,attendance_date').eq('company_id',companyId).eq('attendance_date',isoToday()),
      this.supabase.from('workers').select('id,status').eq('company_id',companyId),
      this.supabase.from('project_production_entries').select('project_id,quantity_completed,labour_hours,work_date,blocker_type,blocker_note').eq('company_id',companyId).eq('work_date',isoToday()).limit(1000),
      this.supabase.from('audit_logs').select('id,entity_type,entity_id,action,created_at,metadata').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100)
    ]);
    for(const r of [projects,actions,rfis,ncrs,incidents,materials,attendance,workforce,production,events])if(r.error)throw r.error;
    const p=projects.data||[], a=actions.data||[], r=rfis.data||[], q=ncrs.data||[], s=incidents.data||[], m=materials.data||[], at=attendance.data||[], w=workforce.data||[], prod=production.data||[];
    const overdue=(x,due)=>x.filter(v=>v[due]&&v[due]<isoToday());
    const materialRisk=m.filter(x=>{const d=x.required_by;return d&&d<=new Date(Date.now()+4*86400000).toISOString().slice(0,10)&&x.status!=='RECEIVED'&&x.status!=='COMPLETED'});
    const scheduleRisks=(tower.focus?.scheduleRisk||[]).slice(0,8);
    const critical=[...tower.recommendations||[],...revenue.recommendations||[]].filter(x=>x.priority==='NOW').slice(0,12);
    const alerts=[
      ...tower.focus.redProjects.map(x=>({severity:'CRITICAL',type:'PROJECT',title:`${x.name} is critical`,reason:`Health ${x.healthScore}/100; ${x.criticalOverdue} critical delay(s).`,projectId:x.id})),
      ...(tower.cash?.alerts||[]).slice(0,5).map(x=>({severity:'CRITICAL',type:'CASH',title:x.title||'Cash pressure detected',reason:x.message||x.reason})),
      ...scheduleRisks.map(x=>({severity:n(x.scheduleVarianceDays)>7?'CRITICAL':'HIGH',type:'SCHEDULE',title:`${x.name||x.projectName||'Project'} schedule risk`,reason:`Forecast is ${n(x.scheduleVarianceDays)} day(s) behind baseline.`,projectId:x.id||x.projectId})),
      ...materialRisk.slice(0,8).map(x=>({severity:'HIGH',type:'MATERIAL',title:'Material risk approaching',reason:`Required by ${x.required_by}; status ${x.status}.`,projectId:x.project_id})),
      ...overdue(a,'due_at').slice(0,8).map(x=>({severity:x.severity==='CRITICAL'?'CRITICAL':'HIGH',type:'ACTION',title:x.title,reason:`Action due ${x.due_at}.`,projectId:x.project_id})),
      ...overdue(r,'due_date').slice(0,5).map(x=>({severity:'HIGH',type:'RFI',title:x.subject||'Overdue RFI',reason:`Technical decision due ${x.due_date}.`,projectId:x.project_id})),
      ...overdue(q,'due_date').slice(0,5).map(x=>({severity:x.severity==='CRITICAL'?'CRITICAL':'HIGH',type:'QUALITY',title:x.title||'Overdue NCR',reason:`NCR due ${x.due_date}.`,projectId:x.project_id})),
      ...s.slice(0,5).map(x=>({severity:x.severity==='CRITICAL'?'CRITICAL':'HIGH',type:'SAFETY',title:x.title||'Open safety incident',reason:`Status ${x.status}.`,projectId:x.project_id}))
    ].slice(0,40);
    const present=at.filter(x=>['PRESENT','CHECKED_IN','LATE'].includes(x.status)).length;
    const expected=w.filter(x=>x.status==='ACTIVE').length;
    const role=member.role;
    const [benchmarks,trial,moneyLeak]=await Promise.all([this.benchmarks(companyId),this.trialProgress(companyId),this.moneyLeak({companyId,revenue})]);
    const summary={projects:p.length,critical:alerts.filter(x=>x.severity==='CRITICAL').length,attention:alerts.filter(x=>x.severity==='HIGH').length,moneyAtRisk:n(moneyLeak.grossFlaggedValue),moneyLeak:moneyLeak.grossFlaggedValue,unbilled:n(revenue.summary?.unbilledWork),present,expected,productionEntries:prod.length,materialRisks:materialRisk.length,openNcrs:q.length,openSafety:s.length,openActions:a.length};
    const roleView=this.roleView(role,{tower,revenue,projects:p,summary,alerts,production:prod,attendance:{present,expected},materials:materialRisk,actions:a});
    const companyMemory={recentEvents:(events.data||[]).slice(0,30),recordCounts:{projects:p.length,dailyProduction:prod.length,openActions:a.length,openNcrs:q.length,openSafety:s.length},sources:['projects','daily_site_reports','attendance_records','production','procurement','quality','safety','commercial','cash','workflow']};
    const financeRoles=['SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','CEO','DIRECTOR','MANAGEMENT','ACCOUNTANT','COMMERCIAL_MANAGER','QUANTITY_SURVEYOR'];
    const executiveRoles=['SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','CEO','DIRECTOR','MANAGEMENT'];
    const fieldRoles=['PROJECT_MANAGER','SITE_ENGINEER','CIVIL_ENGINEER','SITE_SUPERVISOR','WORKER','STOREKEEPER','PROCUREMENT_OFFICER','HR_MANAGER'];
    const workforceRoles=[...executiveRoles,'PROJECT_MANAGER','SITE_ENGINEER','CIVIL_ENGINEER','SITE_SUPERVISOR','HR_MANAGER'];
    const client=role==='CLIENT';
    const visibleAlerts=client?[]:alerts.filter(x=>{
      if(executiveRoles.includes(role))return true;
      if(financeRoles.includes(role))return !['SAFETY'].includes(x.type);
      if(role==='HR_MANAGER')return ['ACTION'].includes(x.type);
      if(['STOREKEEPER','PROCUREMENT_OFFICER'].includes(role))return ['MATERIAL','ACTION'].includes(x.type);
      if(fieldRoles.includes(role))return ['PROJECT','SCHEDULE','MATERIAL','ACTION','RFI','QUALITY','SAFETY'].includes(x.type);
      return ['PROJECT','SCHEDULE','ACTION'].includes(x.type);
    });
    const visibleSummary={projects:summary.projects,critical:visibleAlerts.filter(x=>x.severity==='CRITICAL').length,attention:visibleAlerts.filter(x=>x.severity==='HIGH').length};
    if(financeRoles.includes(role)){Object.assign(visibleSummary,{moneyAtRisk:summary.moneyAtRisk,unbilled:summary.unbilled});}
    if(workforceRoles.includes(role))Object.assign(visibleSummary,{present,expected});
    if([...fieldRoles,...executiveRoles, ...financeRoles].includes(role))Object.assign(visibleSummary,{openActions:summary.openActions});
    if([...executiveRoles,'PROJECT_MANAGER','SITE_ENGINEER','CIVIL_ENGINEER','SITE_SUPERVISOR'].includes(role))Object.assign(visibleSummary,{productionEntries:summary.productionEntries,openNcrs:summary.openNcrs,openSafety:summary.openSafety});
    if([...executiveRoles,'PROJECT_MANAGER','SITE_ENGINEER','CIVIL_ENGINEER','SITE_SUPERVISOR','STOREKEEPER','PROCUREMENT_OFFICER'].includes(role))Object.assign(visibleSummary,{materialRisks:summary.materialRisks});
    const visibleMemory=executiveRoles.includes(role)?companyMemory:{recentEvents:[],recordCounts:{projects:p.length,dailyProduction:prod.length,openActions:a.length,openNcrs:q.length,openSafety:s.length},sources:companyMemory.sources};
    const visibleBenchmarks=financeRoles.includes(role)?benchmarks:{productivityAverage:benchmarks.productivityAverage,records:benchmarks.records,projectCount:benchmarks.projectCount};
    const visibleRoleView=client?{mode:'CLIENT',sections:[{title:'Project Visibility',items:[['Projects',p.length]]}]}:roleView;
    return {generatedAt:new Date().toISOString(),date:isoToday(),role,hero:{title:role==='SITE_ENGINEER'||role==='CIVIL_ENGINEER'||role==='SITE_SUPERVISOR'||role==='WORKER'?'Site Today':role==='ACCOUNTANT'?'Finance Today':role==='PROJECT_MANAGER'?'Project Control':role==='STOREKEEPER'||role==='PROCUREMENT_OFFICER'?'Materials Today':role==='HR_MANAGER'?'Workforce Today':client?'Project Visibility':executiveRoles.includes(role)?'Executive Control':'HySmart Today'},summary:visibleSummary,alerts:visibleAlerts,priorities:financeRoles.includes(role)||executiveRoles.includes(role)?critical.filter(x=>x.type!=='CASH'||financeRoles.includes(role)):[],roleView:visibleRoleView,companyMemory:visibleMemory,benchmarks:visibleBenchmarks,trial:executiveRoles.includes(role)?trial:null,moneyLeak:financeRoles.includes(role)?moneyLeak:null,quickActions:this.quickActions(role),fieldMode:this.fieldMode(role),dashboardScope:{executive:executiveRoles.includes(role),finance:financeRoles.includes(role),workforce:workforceRoles.includes(role),field:['PROJECT_MANAGER','SITE_ENGINEER','CIVIL_ENGINEER','SITE_SUPERVISOR','WORKER'].includes(role),canRefreshIntelligence:executiveRoles.includes(role)||['PROJECT_MANAGER','CIVIL_ENGINEER'].includes(role),materials:['PROJECT_MANAGER','SITE_ENGINEER','CIVIL_ENGINEER','SITE_SUPERVISOR','STOREKEEPER','PROCUREMENT_OFFICER'].includes(role)}};
  }
  roleView(role,d){
    const finance={cash:d.tower?.questions?.cash||{},receivables:d.revenue?.summary?.revenueOpportunity||0,payables:d.tower?.questions?.cash?.payables||0,marginLeakage:d.revenue?.summary?.marginLeakage||0};
    if(['SITE_ENGINEER','SITE_SUPERVISOR','WORKER'].includes(role))return {mode:'FIELD',sections:[{title:'Site',items:[['Production today',d.production.length],['Attendance',`${d.attendance.present}/${d.attendance.expected}`],['Material risks',d.materials.length],['Open actions',d.actions.length]]},{title:'Attention',items:d.alerts.slice(0,6).map(x=>[x.title,x.reason])}]};
    if(['ACCOUNTANT','COMMERCIAL_MANAGER','QUANTITY_SURVEYOR'].includes(role))return {mode:'FINANCE',sections:[{title:'Finance Today',items:[['Receivables',finance.receivables],['Payables',finance.payables],['Funding gap',finance.cash.fundingGap],['Margin leakage',finance.marginLeakage]]}]};
    if(['PROJECT_MANAGER','CIVIL_ENGINEER'].includes(role))return {mode:'PROJECT',sections:[{title:'Project Control',items:[['Projects at risk',n(d.tower?.portfolio?.summary?.red)+n(d.tower?.portfolio?.summary?.amber)],['Schedule risk',n(d.tower?.questions?.time?.projectsDelayed)],['Open actions',d.actions.length]]}]};
    if(['STOREKEEPER','PROCUREMENT_OFFICER'].includes(role))return {mode:'MATERIALS',sections:[{title:'Materials Today',items:[['Material risks',d.materials.length],['Open actions',d.actions.length],['Production entries',d.production.length]]}]};
    if(role==='HR_MANAGER')return {mode:'WORKFORCE',sections:[{title:'Workforce Today',items:[['Present',d.attendance.present],['Expected',d.attendance.expected],['Open actions',d.actions.length]]}]};
    if(role==='CLIENT')return {mode:'CLIENT',sections:[{title:'Project Visibility',items:[['Projects',d.projects.length],['Schedule risks',n(d.tower?.questions?.time?.projectsDelayed)],['Open actions',d.actions.length],['Unbilled work',n(d.summary?.unbilled)]]}]};
    if(['CEO','DIRECTOR','COMPANY_OWNER','COMPANY_ADMIN','SUPER_ADMIN','MANAGEMENT'].includes(role))return {mode:'EXECUTIVE',sections:[{title:'Executive Control',items:[['Projects at risk',n(d.tower?.portfolio?.summary?.red)+n(d.tower?.portfolio?.summary?.amber)],['Money at risk',n(d.summary?.moneyAtRisk)],['Cash gap',finance.cash.fundingGap],['Unbilled work',n(d.summary?.unbilled)]]}]};
    return {mode:'PROJECT',sections:[{title:'Project control',items:[['Open actions',d.actions.length],['Material risks',d.materials.length],['Production today',d.production.length],['Money at risk',n(d.summary?.moneyAtRisk)]]}]};
  }
  fieldMode(role){if(!['SITE_ENGINEER','CIVIL_ENGINEER','SITE_SUPERVISOR','WORKER','PROJECT_MANAGER'].includes(role))return [];return [{key:'daily-report',label:'Daily Report',path:'/reports'},{key:'attendance',label:'Attendance',path:'/attendance'},{key:'materials',label:'Materials',path:'/materials'},{key:'photos',label:'Photos / Evidence',path:'/documents'},{key:'progress',label:'Progress',path:'/production'},{key:'safety',label:'Safety',path:'/quality-safety'},{key:'issue',label:'Issue',path:'/issues'},{key:'task',label:'Task',path:'/tasks'}];}
  async moneyLeak({companyId,revenue=null}){
    const rm=revenue||await this.revenueMarginService.analyze({companyId});
    const rows=rm.projects||[];
    let overdueReceivables=0, supplierExposure=0;
    for(const p of rows){overdueReceivables+=n(p.revenue?.outstanding);supplierExposure+=n(p.cost?.openSupplierExposure);}
    const categories=[
      {key:'UNCLAIMED_VARIATIONS',label:'Unclaimed / pending variations',value:n(rm.summary?.pendingVariations),action:'Substantiate and submit eligible change orders.'},
      {key:'UNBILLED_WORK',label:'Completed but unbilled work',value:n(rm.summary?.unbilledWork),action:'Review approved measurements and include eligible value in the next valuation/IPC.'},
      {key:'MARGIN_LEAKAGE',label:'Forecast margin leakage',value:n(rm.summary?.marginLeakage),action:'Contain the largest actual and committed cost drivers.'},
      {key:'RECEIVABLE_EXPOSURE',label:'Receivable exposure',value:money(overdueReceivables),action:'Accelerate certification, invoicing and collections.'},
      {key:'PROCUREMENT_EXPOSURE',label:'Supplier / procurement exposure',value:money(supplierExposure),action:'Review commitments, delivery risk and supplier payment sequencing.'}
    ].filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
    return {generatedAt:new Date().toISOString(),grossFlaggedValue:money(categories.reduce((s,x)=>s+x.value,0)),categories,overlapPossible:true,projects:rows.map(p=>({project:p.project,unbilledWork:p.revenue?.unbilledWork||0,pendingVariations:p.revenue?.pendingVariations||0,marginLeakage:p.cost?.marginLeakage||0,receivableExposure:p.revenue?.outstanding||0,procurementExposure:p.cost?.openSupplierExposure||0})).sort((a,b)=>(b.unbilledWork+b.pendingVariations+b.marginLeakage)-(a.unbilledWork+a.pendingVariations+a.marginLeakage)).slice(0,10)};
  }
  async consequence({companyId,projectId}){
    const {data:p,error:pe}=await this.supabase.from('projects').select('id,name,contract_value,expected_end_date,daily_preliminaries,daily_preliminaries_cost').eq('company_id',companyId).eq('id',projectId).maybeSingle();if(pe)throw pe;if(!p){const e=new Error('Project not found');e.status=404;throw e;}
    const {data:acts,error:ae}=await this.supabase.from('project_schedule_activities').select('id,name,planned_finish,forecast_finish,is_critical,status,total_float_days').eq('company_id',companyId).eq('project_id',projectId).neq('status','COMPLETED');if(ae)throw ae;
    const delayed=(acts||[]).filter(x=>x.forecast_finish&&x.planned_finish&&new Date(x.forecast_finish)>new Date(x.planned_finish));
    const latest=delayed.reduce((max,x)=>!max||new Date(x.forecast_finish)>new Date(max)?x.forecast_finish:max,null);
    const baseline=p.expected_end_date?new Date(p.expected_end_date):null;const forecast=latest?new Date(latest):(baseline?new Date(baseline):null);const scheduleVarianceDays=baseline&&forecast?Math.max(0,Math.ceil((forecast-baseline)/86400000)):0;const dailyPreliminaries=n(p.daily_preliminaries||p.daily_preliminaries_cost);const additionalPreliminaries=money(scheduleVarianceDays*dailyPreliminaries);const marginImpactPct=n(p.contract_value)>0?money(additionalPreliminaries/n(p.contract_value)*100):null;
    return {project:{id:p.id,name:p.name},baselineFinish:p.expected_end_date||null,forecastFinish:forecast?forecast.toISOString().slice(0,10):null,scheduleVarianceDays,additionalPreliminaries,marginImpactPercentagePoints:marginImpactPct,delayedActivities:delayed.map(x=>({id:x.id,name:x.name,isCritical:!!x.is_critical,plannedFinish:x.planned_finish,forecastFinish:x.forecast_finish,floatDays:x.total_float_days})).slice(0,20),recoveryRequired:scheduleVarianceDays>0,explanation:scheduleVarianceDays>0?`A ${scheduleVarianceDays}-day completion shift is currently indicated. At ${dailyPreliminaries.toLocaleString()} per day, estimated additional preliminaries are ${additionalPreliminaries.toLocaleString()}.`:'No current schedule consequence detected from open activities.'};
  }
  async voiceReport({companyId,projectId,transcript}){
    const text=String(transcript||'').trim();if(!text){const e=new Error('Transcript is required');e.status=400;throw e;}
    const lower=text.toLowerCase();const quantityMatch=text.match(/(?:completed|did|finished|laid|installed)\s+(?:approximately\s+)?([\d,.]+)\s*([a-zA-ZÂ²Â³%/ -]{1,20})/i);const workerMatch=text.match(/([\d,]+)\s+(?:workers|labou?rs?|masons|carpenters|people|staff)/i);const draft={workCompleted:text,workforceCount:workerMatch?Number(workerMatch[1].replace(/,/g,'')):null,issues:/(issue|problem|defect|reinforcement)/i.test(text)?text:null,safetyObservations:/(safety|unsafe|accident|injury)/i.test(text)?text:null,delays:/(delay|delayed|late|behind|shortage|didn't arrive|did not arrive)/i.test(text)?text:null,materialsReceived:/(delivery|delivered|received)/i.test(text)?text:null,progressSignals:quantityMatch?{quantity:Number(quantityMatch[1].replace(/,/g,'')),unit:quantityMatch[2].trim()}:null,source:'VOICE_CAPTURE',projectId:projectId||null};return {transcript:text,draft,confidence:clamp(60+(quantityMatch?15:0)+(workerMatch?10:0)+(draft.issues?5:0)+(draft.delays?5:0),0,95)};
  }
  async ingestFieldMessage({companyId,userId,input}){const text=String(input.text||input.message||'').trim();if(!text){const e=new Error('Field message is required');e.status=400;throw e;}const lower=text.toLowerCase();let type='NOTE';if(/cement|material|stock|bag|shortage|finished/.test(lower))type='MATERIAL_RISK';else if(/delay|late|behind|blocked/.test(lower))type='SCHEDULE_RISK';else if(/safety|accident|injury|unsafe/.test(lower))type='SAFETY';else if(/ncr|defect|rework|quality/.test(lower))type='QUALITY';else if(/payment|invoice|variation|claim|money/.test(lower))type='COMMERCIAL';const {data,error}=await this.supabase.from('operational_inbox_messages').insert({company_id:companyId,source:'FIELD_MESSAGE',sender_user_id:userId,raw_text:text,class_type:type,metadata:{provider:input.provider||'manual',phone:input.phone||null}}).select().single();if(error)throw error;return {id:data.id,type,title:type.replaceAll('_',' '),message:text,action:type==='MATERIAL_RISK'?'Open material/procurement control':type==='SCHEDULE_RISK'?'Review schedule and recovery':type==='SAFETY'?'Open safety control':type==='QUALITY'?'Open quality/NCR control':type==='COMMERCIAL'?'Open revenue/margin control':'Review field message'};}
  async benchmarks(companyId){const [prod,projects]=await Promise.all([this.supabase.from('project_productivity_records').select('project_id,quantity_completed,labour_hours,estimate_item_id').eq('company_id',companyId).gt('labour_hours',0).limit(5000),this.supabase.from('projects').select('id,progress,contract_value,budget').eq('company_id',companyId)]);if(prod.error)throw prod.error;if(projects.error)throw projects.error;const rows=prod.data||[];const rates=rows.map(x=>n(x.quantity_completed)/n(x.labour_hours)).filter(x=>Number.isFinite(x)&&x>0);const avg=rates.length?rates.reduce((a,b)=>a+b,0)/rates.length:0;const margins=(projects.data||[]).filter(x=>n(x.contract_value)>0).map(x=>(n(x.contract_value)-n(x.budget))/n(x.contract_value)*100);return {productivityAverage:avg,records:rates.length,projectCount:(projects.data||[]).length,marginBenchmark:margins.length?margins.reduce((a,b)=>a+b,0)/margins.length:0};}
  async trialProgress(companyId){const {data:sub,error:se}=await this.supabase.from('company_subscriptions').select('status,trial_ends_at').eq('company_id',companyId).maybeSingle();if(se)throw se;const {data:logs,error}=await this.supabase.from('audit_logs').select('entity_type,action,created_at').eq('company_id',companyId).limit(5000);if(error)throw error;const text=(logs||[]).map(x=>`${x.entity_type}:${x.action}`.toLowerCase()).join('|');const steps=[
    ['COMPANY_PROJECT','Company + project setup',/company|project/],['BOQ_BUDGET','BOQ / estimate / budget',/estimate|boq|budget/],['TEAM','Team / people / permissions',/member|invite|people|worker/],['SCHEDULE','Schedule / WBS / milestones',/schedule|wbs|milestone/],['FIELD_REPORT','Daily field reporting',/report/],['FIELD_WORKFORCE','Attendance / workforce',/attendance|worker/],['MATERIALS','Materials / site intelligence',/material/],['PROCUREMENT','Requisition / PO / receipt',/procurement|purchase|po|grn/],['PROGRESS','Progress measurement / production',/progress|production|measurement/],['QUALITY','Inspection / NCR / safety',/ncr|inspection|safety/],['COMMERCIAL','Variation / IPC / revenue protection',/variation|ipc|estimate|commercial/],['CASH','Invoice / payment / treasury',/invoice|payment|treasury|cash/],['CONTROL','Control Tower / Command Centre',/control|workflow|command|executive/],['MEMORY','Company intelligence / recovery history',/recovery|intelligence|benchmark|audit/]
  ].map(([key,label,re],i)=>({day:i+1,key,label,complete:re.test(text)}));return {status:sub?.status||null,trialEndsAt:sub?.trial_ends_at||null,completed:steps.filter(x=>x.complete).length,total:steps.length,steps};}
  quickActions(role){const base=[{key:'daily-report',label:'Daily Report',path:'/reports'},{key:'production',label:'Record Production',path:'/production'},{key:'material',label:'Materials',path:'/materials'},{key:'issue',label:'Raise Issue',path:'/issues'}];if(role==='CLIENT')return [{key:'projects',label:'Project Updates',path:'/projects'},{key:'reports',label:'Reports',path:'/reports'}];if(role==='WORKER')return [{key:'daily-report',label:'Daily Report',path:'/reports'},{key:'materials',label:'Materials',path:'/materials'}];if(role==='HR_MANAGER')return [{key:'attendance',label:'Attendance',path:'/attendance'},{key:'people',label:'People',path:'/people'},{key:'reports',label:'Reports',path:'/reports'}];if(['CEO','DIRECTOR','COMPANY_OWNER','COMPANY_ADMIN','SUPER_ADMIN'].includes(role))return [...base,{key:'control',label:'Control Tower',path:'/control-tower'},{key:'money',label:'Money Leak Detector',path:'/today'}];if(['PROJECT_MANAGER','CIVIL_ENGINEER'].includes(role))return [...base,{key:'schedule',label:'Schedule',path:'/planning'},{key:'recovery',label:'Recovery',path:'/recovery'}];
    if(['MANAGEMENT','COMMERCIAL_MANAGER','QUANTITY_SURVEYOR'].includes(role))return [{key:'boq',label:'BOQ Control',path:'/boq-control'},{key:'commercial',label:'Revenue & Margin',path:'/revenue-margin'},{key:'projects',label:'Projects',path:'/projects'},{key:'reports',label:'Reports',path:'/reports'}];
    if(role==='PROCUREMENT_OFFICER')return [{key:'procurement',label:'Procurement',path:'/procurement'},{key:'materials',label:'Materials',path:'/materials'},{key:'reports',label:'Daily Reports',path:'/reports'}];if(role==='ACCOUNTANT')return [{key:'cash',label:'Cash & Treasury',path:'/treasury'},{key:'financial-intelligence',label:'Financial Intelligence',path:'/financial-intelligence'},{key:'accounting',label:'Accounting',path:'/accounting'},{key:'commercial',label:'Revenue & Margin',path:'/revenue-margin'}];if(role==='STOREKEEPER')return [{key:'materials',label:'Materials',path:'/materials'},{key:'procurement',label:'Procurement',path:'/procurement'},{key:'site',label:'Site Intelligence',path:'/site-intelligence'}];return base;}
  async boqItem({companyId,projectId,itemId}){
    const {data:item,error:ie}=await this.supabase.from('project_estimate_items').select('id,estimate_id,item_no,section,description,category,quantity,unit,unit_rate,tax_rate,line_total,estimate:estimate_id!inner(project_id,currency,status,version_no)').eq('company_id',companyId).eq('id',itemId).eq('estimate.project_id',projectId).maybeSingle();
    if(ie)throw ie;if(!item){const e=new Error('BOQ item not found for project');e.code='BOQ_ITEM_NOT_FOUND';e.status=404;throw e;}
    const [schedule,measurements,materials,productivity,poItems,expenses,subItems,ipcs,docs,comments,actions]=await Promise.all([
      this.supabase.from('project_schedule_activities').select('id,activity_code,name,status,percent_complete,planned_start,planned_finish,actual_start,actual_finish,forecast_finish,schedule_variance_days,is_critical,total_float_days,responsible_user_id,planned_quantity,unit,planned_value').eq('company_id',companyId).eq('project_id',projectId).eq('estimate_item_id',itemId),
      this.supabase.from('project_progress_measurements').select('id,measurement_date,quantity_completed,percent_complete,measured_value,status,location,notes,measured_by').eq('company_id',companyId).eq('project_id',projectId).eq('estimate_item_id',itemId).order('measurement_date',{ascending:false}),
      this.supabase.from('project_material_plans').select('id,material_id,planned_quantity,planned_unit_cost,wastage_allowance_percent,lead_time_days,required_by,status,materials:materials!project_material_plans_material_id_fkey(name,unit)').eq('company_id',companyId).eq('project_id',projectId).eq('estimate_item_id',itemId),
      this.supabase.from('project_productivity_records').select('id,work_date,worker_count,labour_hours,quantity_completed,unit,trade,notes').eq('company_id',companyId).eq('project_id',projectId).eq('estimate_item_id',itemId).order('work_date',{ascending:false}),
      this.supabase.from('purchase_order_items').select('id,purchase_order_id,description,quantity,unit,unit_price,received_quantity,line_total,purchase_orders!inner(id,po_no,project_id,status,order_date,expected_date,currency,subtotal,total,supplier_id,suppliers(name))').eq('company_id',companyId).eq('estimate_item_id',itemId).eq('purchase_orders.project_id',projectId),
      this.supabase.from('expenses').select('id,description,category,amount,currency,expense_date,status,vendor_name,supplier_invoice_id').eq('company_id',companyId).eq('project_id',projectId).eq('estimate_item_id',itemId).in('status',['APPROVED','PAID']).order('expense_date',{ascending:false}),
      this.supabase.from('project_subcontract_items').select('id,subcontract_id,item_no,description,quantity,unit,unit_rate,amount,project_subcontracts!inner(project_id,contract_no,status,currency,subcontractor_id,project_subcontractors(name))').eq('company_id',companyId).eq('estimate_item_id',itemId).eq('project_subcontracts.project_id',projectId),
      this.supabase.from('project_ipc_items').select('id,ipc_id,quantity_completed,unit,unit_rate,current_value,project_client_ipcs!inner(ipc_no,status,period_end,project_id)').eq('company_id',companyId).eq('estimate_item_id',itemId).eq('project_client_ipcs.project_id',projectId),
      this.supabase.from('documents').select('id,name,category,mime_type,size_bytes,created_at,uploaded_by,storage_path').eq('company_id',companyId).eq('project_id',projectId).eq('estimate_item_id',itemId).order('created_at',{ascending:false}),
      this.supabase.from('collaboration_comments').select('id,parent_id,body,author_user_id,created_at,edited_at,attachment_ids,mentions').eq('company_id',companyId).eq('project_id',projectId).eq('entity_type','BOQ_ITEM').eq('entity_id',itemId).is('deleted_at',null).order('created_at',{ascending:true}),
      this.supabase.from('workflow_action_items').select('id,title,body,severity,status,due_at,assigned_to,metadata,created_at').eq('company_id',companyId).eq('project_id',projectId).in('status',['OPEN','ACKNOWLEDGED']).limit(500)
    ]);
    for(const r of [schedule,measurements,materials,productivity,poItems,expenses,subItems,ipcs,docs,comments,actions])if(r.error)throw r.error;
    const linkedActions=(actions.data||[]).filter(x=>x.metadata?.estimateItemId===itemId||x.metadata?.estimate_item_id===itemId);
    const done=(measurements.data||[]).filter(x=>x.status==='APPROVED').reduce((s,x)=>s+n(x.quantity_completed),0);
    const certified=(ipcs.data||[]).filter(x=>['APPROVED','INVOICED','PAID'].includes(x.project_client_ipcs?.status)).reduce((s,x)=>s+n(x.current_value),0);
    const invoicedPOs=[...new Set((poItems.data||[]).map(x=>x.purchase_order_id).filter(Boolean))];
    let supplierInvoices=[];
    if(invoicedPOs.length){
      const {data:si,error:se}=await this.supabase.from('supplier_invoices').select('id,purchase_order_id,total,currency,status').eq('company_id',companyId).in('purchase_order_id',invoicedPOs).in('status',['APPROVED','PARTIALLY_PAID','PAID']);
      if(se)throw se;supplierInvoices=si||[];
      const invoiceIds=supplierInvoices.map(x=>x.id).filter(Boolean);
      if(invoiceIds.length){
        const {data:invoiceLines,error:lineError}=await this.supabase.from('supplier_invoice_items').select('id,supplier_invoice_id,total,purchase_order_items!inner(estimate_item_id)').eq('company_id',companyId).in('supplier_invoice_id',invoiceIds);
        if(lineError)throw lineError;
        const byInvoice=new Map();for(const line of invoiceLines||[]){const rows=byInvoice.get(line.supplier_invoice_id)||[];rows.push(line);byInvoice.set(line.supplier_invoice_id,rows);}supplierInvoices=supplierInvoices.map(inv=>({...inv,items:byInvoice.get(inv.id)||[]}));
      }
    }
    const commercial=calculateBoqCommercials({item,completedQuantity:done,certifiedValue:certified,poItems:poItems.data||[],supplierInvoices,expenses:expenses.data||[],subcontractItems:subItems.data||[]});
    const progressPct=n(item.quantity)>0?Math.min(100,done/n(item.quantity)*100):0;const remaining=Math.max(0,n(item.quantity)-done);return {item,progress:{completedQuantity:done,remainingQuantity:remaining,percentComplete:progressPct,earnedValue:commercial.earnedValue},commercial,schedule:{activities:schedule.data||[],delayed:(schedule.data||[]).filter(x=>n(x.schedule_variance_days)>0).length},procurement:{plans:materials.data||[],purchaseOrderItems:poItems.data||[]},productivity:{records:productivity.data||[],labourHours:(productivity.data||[]).reduce((s,x)=>s+n(x.labour_hours),0)},subcontracts:subItems.data||[],valuations:ipcs.data||[],expenses:expenses.data||[],evidence:docs.data||[],comments:comments.data||[],actions:linkedActions,chain:['BOQ','SCHEDULE','PROCUREMENT','MATERIALS','PRODUCTION','COST','VALUATION','REVENUE','MARGIN','EVIDENCE','ACTION']};
  }
  boq({companyId,projectId}){return this._boq({companyId,projectId});}
  async _boq({companyId,projectId}){const {data:items,error}=await this.supabase.from('project_estimate_items').select('id,estimate_id,item_no,description,quantity,unit,unit_rate,line_total,estimate:estimate_id!inner(project_id)').eq('company_id',companyId).eq('estimate.project_id',projectId).limit(2000);if(error)throw error;const ids=(items||[]).map(x=>x.id);if(!ids.length)return {items:[],summary:{count:0,budget:0,completed:0,cost:0}};const [sch,prog,mat,prod]=await Promise.all([this.supabase.from('project_schedule_activities').select('estimate_item_id,percent_complete,planned_quantity,unit,status').eq('company_id',companyId).eq('project_id',projectId).in('estimate_item_id',ids),this.supabase.from('project_progress_measurements').select('estimate_item_id,quantity_completed,current_value,status,measured_value').eq('company_id',companyId).eq('project_id',projectId).in('estimate_item_id',ids),this.supabase.from('project_material_plans').select('estimate_item_id,planned_quantity,planned_unit_cost,status,required_by').eq('company_id',companyId).eq('project_id',projectId).in('estimate_item_id',ids),this.supabase.from('project_productivity_records').select('estimate_item_id,quantity_completed,labour_hours,worker_count').eq('company_id',companyId).eq('project_id',projectId).in('estimate_item_id',ids)]);for(const x of [sch,prog,mat,prod])if(x.error)throw x.error;const sumBy=(arr,key,val)=>{const m=new Map();for(const x of arr||[]){if(!x[key])continue;m.set(x[key],(m.get(x[key])||0)+n(x[val]));}return m};const completed=sumBy(prog.data,'estimate_item_id','quantity_completed'), value=sumBy(prog.data,'estimate_item_id','current_value'), material=sumBy(mat.data,'estimate_item_id','planned_quantity'), labour=sumBy(prod.data,'estimate_item_id','labour_hours');const rows=(items||[]).map(i=>{const qty=n(i.quantity),done=completed.get(i.id)||0,pct=qty?clamp(done/qty*100):0;const hours=labour.get(i.id)||0;return {...i,completedQuantity:done,remainingQuantity:Math.max(0,qty-done),progressPercent:pct,certifiedValue:value.get(i.id)||0,materialPlanned:material.get(i.id)||0,labourHours:hours,unitCostToDate:done?value.get(i.id)/done:null,marginSignal:pct>0&&hours>0?hours/done:null};});return {items:rows,summary:{count:rows.length,budget:rows.reduce((s,x)=>s+n(x.line_total),0),completed:rows.reduce((s,x)=>s+n(x.completedQuantity),0),certifiedValue:rows.reduce((s,x)=>s+n(x.certifiedValue),0)}};}
  _intelligenceMetrics(d){
    return {critical:Number(d.summary?.critical||0),attention:Number(d.summary?.attention||0),moneyAtRisk:Number(d.summary?.moneyAtRisk||0),materialRisks:Number(d.summary?.materialRisks||0),openNcrs:Number(d.summary?.openNcrs||0),openSafety:Number(d.summary?.openSafety||0),openActions:Number(d.summary?.openActions||0),unbilled:Number(d.summary?.unbilled||0),productionEntries:Number(d.summary?.productionEntries||0)};
  }
  _deltaItems(current,previous){
    const labels={critical:'Critical signals',attention:'Attention signals',moneyAtRisk:'Money at risk',materialRisks:'Material risks',openNcrs:'Open NCRs',openSafety:'Open safety items',openActions:'Open actions',unbilled:'Unbilled work'};
    const worse=[],better=[],changed=[];const p=previous||{};
    for(const [key,label] of Object.entries(labels)){
      const now=Number(current[key]||0), before=Number(p[key]||0), delta=now-before;
      if(delta===0)continue;
      const moneyMetric=['moneyAtRisk','unbilled'].includes(key);
      const worsening=moneyMetric?delta>0:delta>0;
      const item={key,label,current:now,previous:before,delta,direction:worsening?'WORSE':'BETTER',unit:moneyMetric?'NGN':'COUNT'};
      changed.push(item);(worsening?worse:better).push(item);
    }
    return {changedItems:changed,worseItems:worse,betterItems:better};
  }
  async dailyIntelligence({companyId,userId,projectId=null,refresh=false}){
    const member=await this.membership(companyId,userId);const role=member.role;const date=isoToday();
    let q=this.supabase.from('daily_intelligence_snapshots').select('*').eq('company_id',companyId).eq('role',role).eq('snapshot_date',date);
    q=projectId?q.eq('project_id',projectId):q.is('project_id',null);
    const {data:existing,error:existingError}=await q.maybeSingle();if(existingError)throw existingError;
    if(existing&&!refresh)return this._redactIntelligence(this._hydrateIntelligence(existing),role);
    const current=await this.today({companyId,userId});const metrics=this._intelligenceMetrics(current);
    let pq=this.supabase.from('daily_intelligence_snapshots').select('*').eq('company_id',companyId).eq('role',role).lt('snapshot_date',date).order('snapshot_date',{ascending:false}).limit(1);
    pq=projectId?pq.eq('project_id',projectId):pq.is('project_id',null);
    const {data:prevRows,error:prevError}=await pq;if(prevError)throw prevError;const previous=prevRows?.[0]||null;
    const delta=this._deltaItems(metrics,previous?.summary||{});
    const consequences=[];
    for(const x of current.alerts||[]){if(['CRITICAL','HIGH'].includes(x.severity))consequences.push({type:x.type,severity:x.severity,title:x.title,reason:x.reason,projectId:x.projectId||projectId||null});}
    for(const x of current.moneyLeak?.categories||[]){if(Number(x.value)>0)consequences.push({type:'MONEY',severity:'HIGH',title:x.label,reason:`${x.label} is currently flagged at ${money(x.value)}.`,value:Number(x.value),unit:'NGN'});}
    const priorities=[...(current.priorities||[]),...(current.alerts||[])].filter((x,i,a)=>x?.title&&a.findIndex(y=>y.title===x.title)===i).slice(0,10);
    const actions=(current.alerts||[]).filter(x=>x.actionId).slice(0,20);
    const payload={company_id:companyId,project_id:projectId||null,role,snapshot_date:date,generated_at:new Date().toISOString(),previous_snapshot_id:previous?.id||null,summary:metrics,changed_items:delta.changedItems,worse_items:delta.worseItems,better_items:delta.betterItems,consequences:consequences.slice(0,20),priorities,actions,source_metadata:{loop:'V4.6',sources:current.companyMemory?.sources||[],generatedFrom:current.generatedAt,recordCounts:current.companyMemory?.recordCounts||{},interpretation:{moneyAtRisk:'Gross flagged exposure, not confirmed loss; categories may overlap.',benchmarks:'Descriptive company history based on available records; not an external industry benchmark.',snapshot:'Point-in-time summary generated from successful source queries; not a live streaming view.'}}};
    let snap,error;if(existing){const r=await this.supabase.from('daily_intelligence_snapshots').update(payload).eq('id',existing.id).select().single();snap=r.data;error=r.error;}else{const r=await this.supabase.from('daily_intelligence_snapshots').insert(payload).select().single();snap=r.data;error=r.error;}if(error)throw error;
    return this._redactIntelligence(this._hydrateIntelligence(snap),role);
  }
  _redactIntelligence(data,role){
    const finance=['SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','DIRECTOR','MANAGEMENT','ACCOUNTANT','COMMERCIAL_MANAGER','QUANTITY_SURVEYOR'].includes(role);
    const client=role==='CLIENT';
    if(finance)return data;
    const safeMetricKeys=new Set(['projects','critical','attention','present','expected','productionEntries','materialRisks','openNcrs','openSafety','openActions']);
    const summary=Object.fromEntries(Object.entries(data.summary||{}).filter(([key])=>safeMetricKeys.has(key)));
    const safeItems=items=>(items||[]).filter(x=>!['MONEY','CASH','COMMERCIAL'].includes(String(x.type||'').toUpperCase())&&!/(â‚¦|NGN|margin leakage|funding gap|receivable|payable|unbilled work|money at risk)/i.test(`${x.title||''} ${x.reason||''} ${x.label||''}`));
    return {...data,summary,whatChanged:safeItems(data.whatChanged),worse:safeItems(data.worse),better:safeItems(data.better),consequences:client?[]:safeItems(data.consequences),priorities:client?[]:safeItems(data.priorities),actions:client?[]:safeItems(data.actions),sourceMetadata:{...data.sourceMetadata,recordCounts:undefined}};
  }
  _hydrateIntelligence(snap){
    return {id:snap.id,date:snap.snapshot_date,generatedAt:snap.generated_at,previousSnapshotId:snap.previous_snapshot_id,summary:snap.summary||{},whatChanged:snap.changed_items||[],worse:snap.worse_items||[],better:snap.better_items||[],consequences:snap.consequences||[],priorities:snap.priorities||[],actions:snap.actions||[],sourceMetadata:snap.source_metadata||{}};
  }
  async recordIntelligenceOutcome({companyId,userId,snapshotId,input}){
    const {data:snap,error:se}=await this.supabase.from('daily_intelligence_snapshots').select('id,company_id,project_id').eq('company_id',companyId).eq('id',snapshotId).maybeSingle();if(se)throw se;if(!snap){const e=new Error('Daily intelligence snapshot not found');e.status=404;throw e;}
    const actionId=input.actionId||null;let action=null;
    const outcomeLabel=String(input.outcome||'MEASURED').trim().slice(0,120);
    const numericValue=value=>value==null?null:Number(value);
    const beforeValue=numericValue(input.beforeValue),afterValue=numericValue(input.afterValue);
    if(!outcomeLabel){const e=new Error('Outcome description is required');e.status=400;e.code='OUTCOME_REQUIRED';throw e;}
    if((beforeValue!==null&&!Number.isFinite(beforeValue))||(afterValue!==null&&!Number.isFinite(afterValue))){const e=new Error('Outcome measurements must be finite numbers');e.status=400;e.code='INVALID_OUTCOME_MEASUREMENT';throw e;}
    const verifiedResolution=input.verifiedResolution===true;
    if(input.markDone===true&&(!verifiedResolution||!String(input.notes||'').trim()||!String(input.evidenceReference||'').trim())){const e=new Error('Closing an action requires verified resolution, notes and an evidence reference');e.status=400;e.code='ACTION_CLOSURE_EVIDENCE_REQUIRED';throw e;}
    if(actionId){const {data:a,error:ae}=await this.supabase.from('workflow_action_items').select('id,title,status,metadata').eq('company_id',companyId).eq('id',actionId).maybeSingle();if(ae)throw ae;if(!a){const e=new Error('Workflow action not found');e.status=404;throw e;}action=a;}
    const row={id:randomUUID(),company_id:companyId,project_id:snap.project_id||null,snapshot_id:snapshotId,action_id:actionId,action_key:input.actionKey||null,outcome:outcomeLabel,before_value:beforeValue,after_value:afterValue,unit:input.unit||null,notes:input.notes||null,evidence_reference:input.evidenceReference||null,verified_by:verifiedResolution?userId:null,verified_at:verifiedResolution?new Date().toISOString():null,measured_by:userId};
    const {data:outcome,error}=await this.supabase.from('daily_intelligence_outcomes').insert(row).select().single();if(error)throw error;
    if(actionId){const metadata={...(action.metadata||{}),latestOutcome:{outcome:row.outcome,beforeValue:row.before_value,afterValue:row.after_value,unit:row.unit,notes:row.notes,evidenceReference:row.evidence_reference,verifiedResolution,measuredAt:row.measured_at,measuredBy:userId}};const patch={metadata,updated_at:new Date().toISOString(),status:input.markDone===true&&verifiedResolution?'DONE':action.status};if(input.markDone===true&&verifiedResolution)patch.completed_at=new Date().toISOString();const {error:updateError}=await this.supabase.from('workflow_action_items').update(patch).eq('company_id',companyId).eq('id',actionId);if(updateError)throw updateError;}
    return outcome;
  }

}
