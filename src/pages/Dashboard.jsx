import React,{useEffect,useMemo,useState}from'react';
import{useOutletContext,Link}from'react-router-dom';
import{Building2,CheckCircle2,Wallet,TrendingUp,Activity,RefreshCw,ClipboardCheck,FileText,Boxes,Users,ShoppingCart,BookOpen,CalendarRange,ShieldCheck,FolderOpen,Bell,ArrowUpRight,BriefcaseBusiness}from'lucide-react';
import{api}from'../lib/api';
import{PageHeader,Card,Stat,Progress}from'../components/UI';

const WORK_AREAS=[
 {to:'/projects',label:'Projects',permission:'project:read',description:'Project plans, teams, milestones and progress',icon:Building2},
 {to:'/tasks',label:'My tasks',permission:'task:read',description:'Assigned work, due dates and task updates',icon:ClipboardCheck},
 {to:'/reports',label:'Daily reports',permission:'report:read',description:'Site activities, progress and evidence',icon:FileText},
 {to:'/attendance',label:'Attendance',permission:'attendance:read',description:'Workforce attendance and site check-ins',icon:Users},
 {to:'/materials',label:'Materials & stores',permission:'material:read',description:'Material availability, issues and records',icon:Boxes},
 {to:'/procurement',label:'Procurement',permission:'procurement:read',description:'Purchase requests, orders and deliveries',icon:ShoppingCart},
 {to:'/accounting',label:'Accounting office',permission:'accounting:read',description:'Ledgers, invoices and account statements',icon:BookOpen},
 {to:'/planning',label:'Planning',permission:'schedule:read',description:'Programme, schedules and upcoming work',icon:CalendarRange},
 {to:'/quality-safety',label:'Quality & safety',permission:'quality:read',description:'Inspections, safety actions and compliance',icon:ShieldCheck},
 {to:'/documents',label:'Documents',permission:'document:read',description:'Company and project documents',icon:FolderOpen},
 {to:'/notifications',label:'Notifications',permission:'notification:read',description:'Updates, mentions and items needing attention',icon:Bell},
 {to:'/collaboration',label:'Team collaboration',permission:'collaboration:read',description:'Project discussions and shared updates',icon:Activity}
];
export default function Dashboard(){
 const outlet=useOutletContext()||{};const[d,setD]=useState(null);const[err,setErr]=useState('');const[loading,setLoading]=useState(false);
 const permissions=useMemo(()=>new Set(outlet.permissions||[]),[outlet.permissions]);
 const workAreas=useMemo(()=>WORK_AREAS.filter(x=>permissions.has(x.permission)),[permissions]);
 const canSeeFinance=['accounting:read','financial-intelligence:read','treasury:read','executive:read'].some(p=>permissions.has(p));
 const canSeeWorkforce=permissions.has('attendance:read')||permissions.has('worker:read');
 const canSeeProjects=permissions.has('project:read');
 const load=async()=>{setLoading(true);setErr('');try{const r=await api.dashboard();setD(r.data)}catch(e){setErr(e.message||'Dashboard data could not be loaded.')}finally{setLoading(false)}};
 useEffect(()=>{let active=true;api.dashboard().then(r=>{if(active){setD(r.data);setErr('')}}).catch(e=>{if(active)setErr(e.message||'Dashboard data could not be loaded.')});return()=>{active=false}},[outlet.companyId,outlet.companyName,outlet.role]);
 const x=d||{projects:{total:0,active:0},workers:{total:0,active:0},attendance:{present:0,late:0,absent:0},finance:{income:0,expense:0,payment:0,netIncome:0,pendingExpenses:0},siteProgress:{latest:null,reports:0}};
 const title=outlet.dashboardLabel||`${outlet.roleLabel||'Member'} Dashboard`;
 return <>
  <PageHeader title={`${title}${outlet.displayName?` — ${outlet.displayName}`:''}`} subtitle={`Your work office · ${outlet.companyName||'Company workspace'} · Role-based access is applied to the links and summaries shown here.`} action={<button className="btn" onClick={load} disabled={loading}><RefreshCw size={16}/>{loading?'Refreshing…':'Refresh'}</button>}/>
  {err&&<div className="notice error">{err}</div>}
  <Card><div className="cardtitle"><div><h3><BriefcaseBusiness size={18}/> My office</h3><span>Work areas available to your current role in this company</span></div><span className="status">{outlet.roleLabel||'Member'}</span></div>
   {workAreas.length?<div className="grid2 dashboard-work-areas">{workAreas.map(area=>{const Icon=area.icon;return <Link className="dashboard-work-link" key={area.to} to={area.to}><span className="dashboard-work-icon"><Icon size={19}/></span><span className="dashboard-work-copy"><b>{area.label}</b><small>{area.description}</small></span><ArrowUpRight size={16}/></Link>})}</div>:<p className="muted">No work areas are assigned to this role yet. Ask your company administrator to review your access.</p>}
  </Card>
  {canSeeProjects&&<div className="stats"><Stat icon={Building2} label="Active projects" value={x.projects?.active??0}/><Stat icon={CheckCircle2} label="Total projects" value={x.projects?.total??0}/></div>}
  {canSeeWorkforce&&<div className="grid2"><Card><div className="cardtitle"><div><h3>Field workforce</h3><span>Attendance snapshot</span></div><Activity/></div><div className="minirow"><div><b>{x.workers?.active??0}</b><span>Active workers</span></div><div><b>{x.attendance?.present??0}</b><span>Present</span></div><div><b>{x.attendance?.late??0}</b><span>Late</span></div><div><b>{x.attendance?.absent??0}</b><span>Absent</span></div></div></Card><Card><div className="cardtitle"><div><h3>Site progress</h3><span>Latest daily report</span></div><b className="bigpercent">{x.siteProgress?.latest??0}%</b></div><Progress value={x.siteProgress?.latest||0}/><p className="muted">{x.siteProgress?.reports??0} daily reports recorded in the selected period.</p></Card></div>}
  {canSeeFinance&&<Card><div className="cardtitle"><div><h3>Finance snapshot</h3><span>Financial indicators available to your role</span></div><Wallet/></div><div className="minirow"><div><b>₦{Number(x.finance?.income||0).toLocaleString()}</b><span>Income</span></div><div><b>₦{Number(x.finance?.expense||0).toLocaleString()}</b><span>Expenses</span></div><div><b>₦{Number(x.finance?.payment||0).toLocaleString()}</b><span>Payments</span></div><div><b>₦{Number(x.finance?.pendingExpenses||0).toLocaleString()}</b><span>Pending approvals</span></div></div></Card>}
  <p className="muted dashboard-footnote">This dashboard is your starting office, not a separate account. Records you create or update appear in their relevant project or company workspace and remain subject to your permissions.</p>
 </>;
}
