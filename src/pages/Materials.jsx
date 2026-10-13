import React,{useCallback,useEffect,useRef,useState}from'react';
import{useOutletContext}from'react-router-dom';
import{Boxes,Plus,AlertTriangle,RefreshCw}from'lucide-react';
import{api}from'../lib/api';
import{PageHeader,Card,Button,Empty}from'../components/UI';

export default function Materials(){
 const outlet=useOutletContext()||{};
 const[data,setData]=useState([]);
 const[inv,setInv]=useState([]);
 const[show,setShow]=useState(false);
 const[loading,setLoading]=useState(false);
 const[saving,setSaving]=useState(false);
 const[error,setError]=useState('');
 const[f,setF]=useState({name:'',sku:'',category:'GENERAL',unit:'pcs',reorderLevel:0});
 const requestVersion=useRef(0);
 const load=useCallback(async()=>{
  const requestId=++requestVersion.current;
  setLoading(true);setError('');
  try{
   const[a,b]=await Promise.all([api.materials(),api.inventory()]);
   if(requestId!==requestVersion.current)return;
   setData(a.data?.items||a.data||[]);setInv(b.data?.items||b.data||[]);
  }catch(e){
   if(requestId===requestVersion.current)setError(e?.message||'Materials and inventory could not be loaded. Please retry.');
  }finally{if(requestId===requestVersion.current)setLoading(false);}
 },[outlet.companyId]);
 useEffect(()=>{
  setData([]);setInv([]);setError('');
  load();
  return()=>{requestVersion.current+=1;};
 },[outlet.companyId,load]);
 async function create(e){
  e.preventDefault();setSaving(true);setError('');
  try{
   await api.createMaterial({...f,reorderLevel:Number(f.reorderLevel)});
   setShow(false);setF({name:'',sku:'',category:'GENERAL',unit:'pcs',reorderLevel:0});
   await load();
  }catch(e){setError(e?.message||'Material could not be created. Please try again.');}
  finally{setSaving(false);}
 }
 return <>
  <PageHeader title="Materials & inventory" subtitle={`Maintain the material catalogue and current stock balances${outlet.companyName?` for ${outlet.companyName}`:''}.`} action={<><Button onClick={load} disabled={loading}><RefreshCw size={16}/>{loading?'Refreshing…':'Refresh'}</Button><Button primary onClick={()=>setShow(true)}><Plus size={17}/>New material</Button></>}/>
  {error&&<div className="notice error" role="alert"><strong>Materials could not be fully loaded.</strong><p>{error}</p><Button onClick={load} disabled={loading}>Retry</Button></div>}
  <div className="grid2"><Card><div className="cardtitle"><div><h3>Material catalogue</h3><span>{data.length} active materials</span></div><Boxes/></div>{data.map(m=><div className="activityitem" key={m.id}><i></i><div><b>{m.name}</b><span>{m.sku||'No SKU'} · {m.unit}</span></div></div>)}{!loading&&!error&&!data.length&&<Empty title="No materials" text="Create your first material catalogue item."/>}{loading&&!data.length&&<p className="muted">Loading materials…</p>}</Card>
  <Card><div className="cardtitle"><div><h3>Inventory</h3><span>Current balances</span></div><AlertTriangle/></div>{inv.map(i=><div className="activityitem" key={i.id}><i></i><div><b>{i.material?.name||i.material_id}</b><span>{i.quantity} · Site {i.site_id||'Not assigned'}</span></div></div>)}{!loading&&!error&&!inv.length&&<Empty title="No inventory balances" text="Stock movements will create balances."/>}{loading&&!inv.length&&<p className="muted">Loading inventory…</p>}</Card></div>
  {show&&<div className="modal"><form className="modalcard" onSubmit={create}><h2>New material</h2><label>Name<input required value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label>SKU<input value={f.sku} onChange={e=>setF({...f,sku:e.target.value})}/></label><label>Category<input value={f.category} onChange={e=>setF({...f,category:e.target.value})}/></label><label>Unit<input value={f.unit} onChange={e=>setF({...f,unit:e.target.value})}/></label><label>Reorder level<input type="number" min="0" value={f.reorderLevel} onChange={e=>setF({...f,reorderLevel:e.target.value})}/></label>{error&&<p className="notice error" role="alert">{error}</p>}<div className="modalactions"><Button type="button" onClick={()=>setShow(false)} disabled={saving}>Cancel</Button><Button primary disabled={saving}>{saving?'Saving…':'Create'}</Button></div></form></div>}
 </>;
}
