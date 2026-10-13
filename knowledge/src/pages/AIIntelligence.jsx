import React,{useCallback,useEffect,useRef,useState}from'react';
import{useParams,useNavigate}from'react-router-dom';
import{Brain,CheckCircle2,AlertTriangle,Send,RefreshCw,CalendarClock,Wallet,ShieldAlert,ArrowRight,MessageSquareText}from'lucide-react';
import{api}from'../lib/api';
import{Card,Button,PageHeader}from'../components/UI';

const money=v=>v==null?'Not available':Number(v||0).toLocaleString(undefined,{maximumFractionDigits:2});
const severityClass=s=>`severity ${String(s||'MEDIUM').toLowerCase()}`;
export default function AIIntelligence(){
 const{projectId}=useParams();const navigate=useNavigate();
 const[d,setD]=useState(null),[question,setQuestion]=useState(''),[answer,setAnswer]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[err,setErr]=useState(''),[forecast,setForecast]=useState(null),[canTrain,setCanTrain]=useState(false),[training,setTraining]=useState(false);const requestSeq=useRef(0),askSeq=useRef(0),forecastSeq=useRef(0);
 const load=useCallback(async()=>{setLoading(true);setErr('');try{const r=await api.aiAssistantOverview(projectId);setD(r.data||r);}catch(e){setErr(e.message||'Could not load project intelligence.');setD(null);}finally{setLoading(false)}},[projectId]);
 useEffect(()=>{let active=true;const refresh=()=>{const seq=++requestSeq.current;const fseq=++forecastSeq.current;askSeq.current++;setLoading(true);setErr('');setD(null);setForecast(null);setAnswer(null);setQuestion('');setTraining(false);api.aiAssistantOverview(projectId).then(r=>{if(active&&seq===requestSeq.current)setD(r.data||r)}).catch(e=>{if(active&&seq===requestSeq.current)setErr(e.message||'Could not load project intelligence.')}).finally(()=>{if(active&&seq===requestSeq.current)setLoading(false)});api.projectAiModel(projectId).then(r=>{if(active&&fseq===forecastSeq.current)setForecast(r.data||r)}).catch(()=>{if(active&&fseq===forecastSeq.current)setForecast(null)});api.access().then(r=>{if(active)setCanTrain((r.data?.permissions||[]).includes('intelligence-model:train'))}).catch(()=>{if(active)setCanTrain(false)})};refresh();window.addEventListener('hysmart-company-change',refresh);return()=>{active=false;window.removeEventListener('hysmart-company-change',refresh)}},[projectId]);
 const trainModel=async()=>{if(training)return;const seq=forecastSeq.current;const req=requestSeq.current;setTraining(true);setErr('');try{const r=await api.trainProjectAiModel(projectId);const result=r.data||r;if(seq===forecastSeq.current&&req===requestSeq.current)setForecast(prev=>({...prev,model:result.model||prev?.model,ready:result.model?.status==='READY',trainingResult:result}));const latest=await api.projectAiModel(projectId);if(seq===forecastSeq.current&&req===requestSeq.current)setForecast(latest.data||latest)}catch(e){if(seq===forecastSeq.current&&req===requestSeq.current)setErr(e.message||'Could not train the schedule forecast model.')}finally{if(seq===forecastSeq.current&&req===requestSeq.current)setTraining(false)}};
 const ask=async(e)=>{e?.preventDefault();if(!question.trim()||busy)return;const seq=++askSeq.current;setBusy(true);setErr('');try{const r=await api.askProjectAi(projectId,question.trim());if(seq===askSeq.current){setAnswer(r.data||r);setQuestion('')}}catch(e){if(seq===askSeq.current)setErr(e.message||'The assistant could not answer.');}finally{setBusy(false)}};
 return <>
  <PageHeader title="HySmart Intelligence" subtitle="A decision-support layer over your existing project workflows." action={<Button onClick={load} disabled={loading}><RefreshCw size={16}/>Refresh</Button>} />
  {err&&<div className="notice error" role="alert">{err}</div>}
  {loading&&!d?<Card><p>Loading authorised project insights…</p></Card>:null}
  {d&&<>
   <Card>
    <div className="cardtitle"><div><p className="eyebrow">PROJECT DECISION SUPPORT</p><h3>{d.project?.name||'Project intelligence'}</h3><span>Evidence-backed recommendations. Human review remains required.</span></div><Brain/></div>
    <p className="lead">{d.summary}</p>
    <div className="minirow"><div><b>{d.recommendations?.length||0}</b><span>Current recommendations</span></div><div><b>{d.alerts?.length||0}</b><span>Open alerts</span></div><div><b>{d.confidence==null?'—':`${Number(d.confidence).toFixed(0)}%`}</b><span>Authorised source coverage</span></div></div>
    <div className="notice" style={{marginTop:12}}>Forecasts in this release are rule-based baselines, not trained ML predictions. Verify the linked records before making financial, technical or safety decisions.</div>
   </Card>
   <Card>
    <div className="cardtitle"><div><h3>Ask HySmart</h3><span>Answers are limited to project information your role is permitted to see.</span></div><MessageSquareText/></div>
    <form onSubmit={ask}>
     <label htmlFor="hysmart-intelligence-question" className="muted">Your question</label>
     <textarea id="hysmart-intelligence-question" className="textarea" rows="3" maxLength={1200} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="What should I prioritise today? Why is this project at risk? Summarise the current blockers…" />
     <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',marginTop:10,flexWrap:'wrap'}}><small className="muted">Do not include passwords, payment details or unrelated personal data.</small><Button primary type="submit" disabled={busy||question.trim().length<3}><Send size={16}/>{busy?'Thinking…':'Ask HySmart'}</Button></div>
    </form>
    {answer&&<div className="todayitem" style={{marginTop:16,alignItems:'flex-start'}}><span className="severity low">ANSWER</span><div style={{flex:1}}><b>HySmart response</b><p style={{whiteSpace:'pre-wrap'}}>{answer.answer}</p><small>Mode: {answer.mode?.replaceAll('_',' ').toLowerCase()} · Context: {(answer.contextCategories||[]).join(', ')||'general guidance'}</small>{answer.recommendations?.length>0&&<ul>{answer.recommendations.map((x,i)=><li key={`${x.type}-${i}`}>{x.action}</li>)}</ul>}<small>{answer.disclaimer}</small></div></div>}
   </Card>
   <div className="grid two">
    <Card><div className="cardtitle"><div><h3>Predictive signals</h3><span>Transparent baseline estimates from current records.</span></div><CalendarClock/></div>
     <div className="notice" style={{marginBottom:12}}><b>Trained schedule model:</b> {forecast===null?'Status unavailable for this role':forecast?.model?.status==='READY'?'Ready':forecast?.model?.status==='INSUFFICIENT_DATA'?'Needs more completed history':forecast?.model?'Not trained yet':'No model status available'}. {forecast?.model?.training_sample_count!=null?`${forecast.model.training_sample_count} completed activities used.`:'Train when enough completed schedule history is available.'} {forecast?.model?.trained_at?`Last trained ${new Date(forecast.model.trained_at).toLocaleString()}.`:''}<br/>{forecast?.model?.evaluation_metrics?.chronologicalHoldout?.accuracy!=null?`Holdout accuracy: ${(forecast.model.evaluation_metrics.chronologicalHoldout.accuracy*100).toFixed(1)}% · Brier score: ${forecast.model.evaluation_metrics.chronologicalHoldout.brierScore}`:'Holdout metrics will appear after a successful training run.'}</div>
     {canTrain&&<div style={{marginBottom:12}}><Button onClick={trainModel} disabled={training}>{training?'Training model…':'Train / refresh schedule model'}</Button></div>}
     {forecast?.ready&&forecast.predictions?.length>0&&<div style={{marginBottom:12}}><b>Highest schedule-delay risks</b>{forecast.predictions.slice(0,5).map(p=><div className="todayitem" key={p.activity_id}><span className={severityClass(p.risk_level)}>{p.risk_level}</span><div style={{flex:1}}><b>{p.activity_name||p.activity_id}</b><p>{(Number(p.delay_probability)*100).toFixed(1)}% estimated delay probability</p><small>{p.explanation}</small></div></div>)}</div>}
     {(d.predictions||[]).map(p=><div className="todayitem" key={p.type}><span className="severity medium">BASELINE</span><div style={{flex:1}}><b>{p.label}</b><p>{p.value==null?'Insufficient authorised data to estimate.':`${money(p.value)} ${p.unit||''}`}</p><small>{p.method?.replaceAll('_',' ')} · {p.uncertainty}</small></div></div>)}
     {!d.predictions?.length&&<div className="notice">No prediction baseline is available from the records visible to your role.</div>}
    </Card>
    <Card><div className="cardtitle"><div><h3>Proactive alerts</h3><span>Open signals connected to project records.</span></div><ShieldAlert/></div>
     {(d.alerts||[]).slice(0,8).map(a=><div className="todayitem" key={a.id} style={{alignItems:'flex-start'}}><span className={severityClass(a.severity)}>{a.severity}</span><div style={{flex:1}}><b>{a.title}</b><p>{a.explanation||'An operational signal requires review.'}</p>{a.recommendation&&<small>{a.recommendation}</small>}<small style={{display:'block',marginTop:5}}>{a.status} · {a.createdAt?new Date(a.createdAt).toLocaleString():''}</small></div></div>)}
     {!d.alerts?.length&&<div className="notice"><CheckCircle2 size={16}/>No open alerts in the authorised project scope.</div>}
     <div style={{marginTop:12}}><Button onClick={()=>navigate('/autopilot')}><ArrowRight size={16}/>Open Construction Autopilot</Button></div>
    </Card>
   </div>
   {(d.recommendations||[]).length>0&&<Card><div className="cardtitle"><div><h3>Recommended interventions</h3><span>Review these in their source module; this assistant does not execute changes.</span></div><AlertTriangle/></div><div className="grid two">{d.recommendations.map((x,i)=><div className="todayitem" key={`${x.type}-${i}`} style={{alignItems:'flex-start'}}><span className={severityClass(x.priority==='NOW'?'HIGH':'MEDIUM')}>{x.priority}</span><div style={{flex:1}}><b>{x.statement}</b><p>{x.action}</p><small>Evidence categories: {(x.evidence||[]).join(', ')||'project records'}</small></div></div>)}</div></Card>}
  </>}
 </>;
}
