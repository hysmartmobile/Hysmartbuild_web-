import { supabase } from './supabase';
import { listMutations, removeMutation, updateMutation } from './offlineQueue';
const BASE=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
const API=`${BASE}/api/v1`;
async function flushOfflineMutationsOnce(){
  if(!navigator.onLine)return {synced:0,pending:(await listMutations()).length};
  const queued=await listMutations(); const actionable=queued.filter(item=>!item.state||item.state==='pending'||item.state==='syncing'); const {data}=await supabase.auth.getSession(); if(!data.session)return {synced:0,pending:queued.length};
  let synced=0,conflicts=0;
  for(const item of actionable){
    try{
      await updateMutation(item.id,{state:'syncing',lastAttemptAt:new Date().toISOString()});
      const headers={'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`};
      const pathCompany=item.path?.match(/\/companies\/([^/]+)/)?.[1]||null;
      const company=item.companyId||pathCompany||localStorage.getItem('hysmart.company_id');
      if(!company){await updateMutation(item.id,{state:'failed',lastError:'No company workspace is available for this queued change',lastAttemptAt:new Date().toISOString(),attempts:(item.attempts||0)+1});break;}
      const body=item.sync?JSON.stringify({operations:[{operationId:item.operationId,operationType:item.operationType,entityType:item.entityType,entityId:item.entityId,baseUpdatedAt:item.baseUpdatedAt,payload:item.payload||{}}]}):item.body;
      const path=item.sync?`/companies/${company}/sync/push`:item.path;
      const r=await fetch(`${API}${path}`,{method:item.sync?'POST':item.method,headers,body});
      const json=await r.json().catch(()=>({}));
      if(!r.ok){ if(r.status===409){conflicts++;await updateMutation(item.id,{state:'conflict',lastError:json?.error?.message||'Sync conflict',lastAttemptAt:new Date().toISOString(),attempts:(item.attempts||0)+1}); break;} if(r.status>=400&&r.status<500){await updateMutation(item.id,{state:'failed',lastError:json?.error?.message||`Sync failed (${r.status})`,lastAttemptAt:new Date().toISOString(),attempts:(item.attempts||0)+1}); break;} await updateMutation(item.id,{state:'pending',lastError:`Temporary server error (${r.status})`,lastAttemptAt:new Date().toISOString(),attempts:(item.attempts||0)+1}); break; }
      const result=item.sync?json?.data?.results?.[0]:null;
      if(result?.status==='CONFLICT'){conflicts++;await updateMutation(item.id,{state:'conflict',lastError:'Server conflict',lastAttemptAt:new Date().toISOString(),attempts:(item.attempts||0)+1});break;}
      if(item.sync && item.photo && result?.result?.id){
        const reportId=result.result.id; const meta={fileName:item.photo.fileName,mimeType:item.photo.mimeType,fileSize:item.photo.fileSize};
        const signedResponse=await fetch(`${API}/companies/${company}/projects/${item.photo.projectId}/reports/${reportId}/photos/upload-url`,{method:'POST',headers,body:JSON.stringify(meta)});
        const signedJson=await signedResponse.json().catch(()=>({})); if(!signedResponse.ok) throw new Error(signedJson?.error?.message||'Evidence upload authorization failed');
        const upload=await supabase.storage.from('site-report-photos').uploadToSignedUrl(signedJson.data.path,signedJson.data.token,item.photo.file); if(upload.error) throw upload.error;
        const attachResponse=await fetch(`${API}/companies/${company}/projects/${item.photo.projectId}/reports/${reportId}/photos`,{method:'POST',headers,body:JSON.stringify({filePath:signedJson.data.path,fileName:item.photo.fileName,mimeType:item.photo.mimeType,fileSize:item.photo.fileSize,caption:item.photo.caption})});
        if(!attachResponse.ok){const aj=await attachResponse.json().catch(()=>({}));throw new Error(aj?.error?.message||'Evidence attachment failed');}
      }
      await removeMutation(item.id); synced++;
    }catch(error){await updateMutation(item.id,{state:'failed',lastError:error?.message||'Network or attachment error',lastAttemptAt:new Date().toISOString(),attempts:(item.attempts||0)+1});break;}
  }
  window.dispatchEvent(new Event('hysmart-sync-complete'));return {synced,conflicts,pending:(await listMutations()).length};
}

// Multiple triggers (startup, online events, and periodic refresh) can fire together.
// Share one in-flight run so a queued operation or evidence upload is never raced by this tab.
let flushInFlight = null;
export function flushOfflineMutations(){
  if (flushInFlight) return flushInFlight;
  flushInFlight = flushOfflineMutationsOnce().finally(() => { flushInFlight = null; });
  return flushInFlight;
}
