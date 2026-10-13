import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { Link } from 'react-router-dom';
import { Inbox,ClipboardList,Send,ShieldCheck,History,CheckCircle2,RefreshCw,Clock3,AlertCircle,Check, X,MessageSquareText,ExternalLink,Bell } from 'lucide-react';
import { api } from '../lib/api';

const TABS=[
 {id:'personal',label:'My Tasks',icon:ClipboardList,help:'Work assigned to you and workflow actions you own.'},
 {id:'received',label:'Received / Inbox',icon:Inbox,help:'Instructions, requests, notifications and items sent to you.'},
 {id:'sent',label:'Sent by Me',icon:Send,help:'Items you submitted and their current status.'},
 {id:'review',label:'Awaiting My Review',icon:ShieldCheck,help:'Only items you are authorised to approve or reject.'},
 {id:'decisions',label:'Decisions & Returns',icon:CheckCircle2,help:'Outcomes and feedback on your submitted work.'},
 {id:'history',label:'Reports & History',icon:History,help:'Your recent actions and recorded workflow decisions.'}
];
const fmtDate=value=>{if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});};
const human=value=>String(value||'').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

export default function MyWorkPanel({companyId,role}){
 const requestSeq=useRef(0);const [data,setData]=useState(null);const [tab,setTab]=useState('personal');const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState('');const [rejecting,setRejecting]=useState('');const [reason,setReason]=useState('');const [responding,setResponding]=useState('');const [response,setResponse]=useState('');const [notice,setNotice]=useState('');
 const load=useCallback(async(silent=false)=>{const requestId=++requestSeq.current;silent?setRefreshing(true):setLoading(true);setError('');try{const r=await api.myWork();if(requestId===requestSeq.current)setData(r.data||null);}catch(e){if(requestId===requestSeq.current)setError(e.message||'Your personal work could not be loaded.');}finally{if(requestId===requestSeq.current){setLoading(false);setRefreshing(false);}}},[]);
 useEffect(()=>{load();return()=>{requestSeq.current+=1};},[load,companyId,role]);
 const sections=data?.sections||{};const items=sections[tab]||[];const summary=data?.summary||{};
 const run=async(item,action,extra={})=>{const key=`${item.entityType}:${item.sourceId}`;setBusy(key);setError('');setNotice('');try{await api.myWorkAction({entityType:item.entityType,entityId:item.sourceId,action,...extra});setRejecting('');setReason('');setResponding('');setResponse('');setNotice('Action saved. The decision and audit history have been recorded.');await load(true);}catch(e){setError(e.message||'The action could not be completed. Refresh and try again.');}finally{setBusy('');}};
 const actionButtons=item=>{
  const key=`${item.entityType}:${item.sourceId}`;const working=busy===key;
  if(item.action==='APPROVE_ONLY')return <button className="btn btn-primary" onClick={()=>run(item,'APPROVE')} disabled={working}><Check size={15}/>{working?'Saving…':(item.metadata?.approveLabel||'Approve')}</button>;
  if(item.action==='DECIDE'){
   if(rejecting===key)return <div className="mywork-inline-form"><label htmlFor={`reason-${key}`}>Reason for rejection (required)</label><textarea id={`reason-${key}`} value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000} placeholder="Explain what needs to be corrected…"/><div className="mywork-actions"><button className="btn btn-secondary" onClick={()=>{setRejecting('');setReason('')}} disabled={working}>Cancel</button><button className="btn btn-danger" onClick={()=>run(item,'REJECT',{reason:reason.trim()})} disabled={working||reason.trim().length<3}>{working?'Saving…':'Confirm rejection'}</button></div></div>;
   return <div className="mywork-actions"><button className="btn btn-primary" onClick={()=>run(item,item.metadata?.decisionAction||'APPROVE')} disabled={working}><Check size={15}/>{working?'Saving…':(item.metadata?.decisionAction==='ACCEPT'?'Accept':'Approve')}</button><button className="btn btn-secondary" onClick={()=>{setRejecting(key);setReason('')}} disabled={working}><X size={15}/>Reject</button></div>;
  }
  if(item.action==='RESPOND'){
   if(responding===key)return <div className="mywork-inline-form"><label htmlFor={`response-${key}`}>Your response</label><textarea id={`response-${key}`} value={response} onChange={e=>setResponse(e.target.value)} maxLength={4000} placeholder="Write a clear response…"/><div className="mywork-actions"><button className="btn btn-secondary" onClick={()=>{setResponding('');setResponse('')}} disabled={working}>Cancel</button><button className="btn btn-primary" onClick={()=>run(item,'RESPOND',{payload:{response:response.trim()}})} disabled={working||response.trim().length<2}>{working?'Sending…':'Send response'}</button></div></div>;
   return <button className="btn btn-primary" onClick={()=>{setResponding(key);setResponse('')}} disabled={working}><MessageSquareText size={15}/>Respond</button>;
  }
  if(item.action==='ACKNOWLEDGE')return <button className="btn btn-primary" onClick={()=>run(item,'ACKNOWLEDGED')} disabled={working}><Check size={15}/>{working?'Saving…':'Acknowledge'}</button>;
  if(item.action==='MARK_READ')return <button className="btn btn-secondary" onClick={()=>run(item,'MARK_READ')} disabled={working}><Bell size={15}/>{working?'Saving…':'Mark read'}</button>;
  if(item.action==='WORKFLOW_STATUS')return <div className="mywork-actions"><button className="btn btn-primary" onClick={()=>run(item,'DONE')} disabled={working}><Check size={15}/>{working?'Saving…':'Mark complete'}</button></div>;
  if(item.action==='TASK_STATUS'&&!['COMPLETED','CANCELLED'].includes(item.status))return <button className="btn btn-primary" onClick={()=>run(item,'COMPLETED')} disabled={working}><Check size={15}/>{working?'Saving…':'Mark complete'}</button>;
  if(item.action==='ISSUE_STATUS'&&!['RESOLVED','CLOSED'].includes(item.status))return <button className="btn btn-primary" onClick={()=>run(item,'RESOLVED')} disabled={working}><Check size={15}/>{working?'Saving…':'Mark resolved'}</button>;
  return null;
 };
 const activeTab=useMemo(()=>TABS.find(x=>x.id===tab)||TABS[0],[tab]);
 return <section className="mywork-panel" aria-label="My Work">
  <div className="mywork-heading"><div><div className="mywork-eyebrow"><ClipboardList size={16}/> PERSONAL WORKSPACE</div><h2>My Work</h2><p>One place for your assignments, inbox, submissions, reviews and decisions.</p></div><button className="btn btn-secondary" onClick={()=>load(true)} disabled={refreshing||loading}><RefreshCw size={15} className={refreshing?'mywork-spin':''}/>{refreshing?'Refreshing…':'Refresh'}</button></div>
  {error&&<div className="notice error" role="alert">{error}</div>}{notice&&<div className="notice success" role="status">{notice}</div>}
  <div className="mywork-tabs" role="tablist" aria-label="My Work sections">{TABS.map(t=>{const Icon=t.icon;return <button key={t.id} type="button" role="tab" aria-selected={tab===t.id} className={`mywork-tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}><Icon size={17}/><span>{t.label}</span><b>{summary[t.id]??0}</b></button>})}</div>
  <div className="mywork-list-heading"><div><h3>{activeTab.label}</h3><p>{activeTab.help}</p></div><span className="mywork-role">{human(role)}</span></div>
  {loading?<div className="mywork-empty"><RefreshCw size={22} className="mywork-spin"/><span>Loading your personal work…</span></div>:items.length===0?<div className="mywork-empty"><CheckCircle2 size={28}/><b>You're all caught up</b><span>There are no items in this section for your current company and role.</span></div>:<div className="mywork-items">{items.map(it=><article className="mywork-item" key={it.id}><div className="mywork-item-main"><div className="mywork-item-title-row"><h4>{it.title}</h4><span className={`mywork-status status-${String(it.status||'open').toLowerCase().replaceAll('_','-')}`}>{human(it.status)}</span></div>{it.description&&<p>{it.description}</p>}<div className="mywork-meta">{it.createdAt&&<span><Clock3 size={13}/>{fmtDate(it.createdAt)}</span>}{it.dueAt&&<span className={new Date(it.dueAt)<new Date()?'overdue':''}><AlertCircle size={13}/>Due {fmtDate(it.dueAt)}</span>}{it.projectName&&<span>{it.projectName}</span>}</div></div><div className="mywork-item-actions">{actionButtons(it)}<Link className="mywork-open-link" to={it.href||'/dashboard'}>Open details <ExternalLink size={13}/></Link></div></article>)}</div>}
  <p className="mywork-footnote">Actions are checked by the server against your company membership, project assignment and role permissions. Approval and rejection decisions are recorded with the acting user, timestamp and reason.</p>
 </section>;
}
