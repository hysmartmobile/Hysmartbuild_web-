import { supabase } from './supabase';
import { enqueueMutation } from './offlineQueue';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API = `${BASE}/api/v1`;
const COMPANY_KEY = 'hysmart.company_id';
const REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableStatus(status){ return status === 502 || status === 503 || status === 504; }

export function getSelectedCompany(){ return localStorage.getItem(COMPANY_KEY) || ''; }
export function setSelectedCompany(id){ if(id) localStorage.setItem(COMPANY_KEY,id); else localStorage.removeItem(COMPANY_KEY); window.dispatchEvent(new Event('hysmart-company-change')); }
export function companyId(){ const id=getSelectedCompany(); if(!id) throw new Error('Select a company workspace first'); return id; }

async function call(path, opts={}){
  const { data } = await supabase.auth.getSession();
  const headers = { ...(opts.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(opts.headers||{}) };
  if(data.session) headers.Authorization=`Bearer ${data.session.access_token}`;
  let r;
  try {
    const method=String(opts.method||'GET').toUpperCase();
    const attempts=method==='GET'?2:1;
    let lastError;
    for(let attempt=0;attempt<attempts;attempt++){
      try {
        r=await fetchWithTimeout(`${API}${path}`,{...opts,headers});
        if(!(method==='GET' && isRetryableStatus(r.status) && attempt===0)) break;
        await new Promise(resolve=>setTimeout(resolve,250));
      } catch(error) {
        lastError=error;
        if(!(method==='GET' && attempt===0)) throw error;
        await new Promise(resolve=>setTimeout(resolve,250));
      }
    }
    if(!r && lastError) throw lastError;
  } catch (error) {
    const method=String(opts.method||'GET').toUpperCase();
    const op=opts.offlineOperation;
    // Only queue mutations with an explicit idempotent sync operation.
    // Generic mutations must not be replayed after an ambiguous network failure.
    if (method!=='GET' && op && typeof indexedDB !== 'undefined') {
      const queuedCompanyId=getSelectedCompany();
      if(!queuedCompanyId) throw new Error('Select a company workspace before saving offline.');
      await enqueueMutation({sync:true,companyId:queuedCompanyId,operationId:op.operationId||crypto.randomUUID(),operationType:op.operationType,entityType:op.entityType,entityId:op.entityId||null,baseUpdatedAt:op.baseUpdatedAt||null,payload:op.payload||JSON.parse(opts.body||'{}'),photo:op.photo||null,path,method,body:typeof opts.body==='string'?opts.body:null,headers:{'Content-Type':'application/json'}});
      window.dispatchEvent(new Event('hysmart-offline-queued'));
      return {success:true,data:{queued:true},message:'Saved on this device and queued for sync when you are back online.'};
    }
    const target = `${BASE}/api/v1`;
    throw new Error(`Cannot reach HySmart Build API at ${target}. Check your connection and VITE_API_URL/CORS. (${error?.message || 'Network error'})`);
  }
  const body=await r.json().catch(()=>({}));
  if(!r.ok){if(r.status===402&&body?.error?.code==='SUBSCRIPTION_REQUIRED')window.dispatchEvent(new Event('hysmart-subscription-required'));const err=new Error(body?.error?.message || body?.error || `Request failed (${r.status})`);err.status=r.status;err.code=body?.error?.code;throw err;}
  return body;
}
const cid=()=>companyId();
const q=(params={})=>{const s=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')s.set(k,v)});const x=s.toString();return x?`?${x}`:''};
const adminAllPages=async path=>{const first=await call(`${path}?page=1&pageSize=100`);const payload=first.data||{};const pages=Number(payload.totalPages||1);const rest=await Promise.all(Array.from({length:Math.max(0,pages-1)},(_,i)=>call(`${path}?page=${i+2}&pageSize=100`)));return {...first,data:{...payload,items:[...(payload.items||[]),...rest.flatMap(r=>r.data?.items||[])]}};};

export const api={syncStatus:async()=>call(`/companies/${await cid()}/sync/status`),
  health:()=>fetchWithTimeout(`${BASE}/`).then(r=>r.json()),
  procurementRisk:()=>call(`/companies/${cid()}/procurement-risk`), constructionTruth:()=>call(`/companies/${cid()}/construction-truth`), projectConstructionTruth:projectId=>call(`/companies/${cid()}/projects/${projectId}/construction-truth`), claimsIntelligence:projectId=>call(`/companies/${cid()}/projects/${projectId}/claims-intelligence`), aiIntelligence:projectId=>call(`/companies/${cid()}/projects/${projectId}/ai-intelligence`), autopilotBrief:(projectId)=>call(`/companies/${cid()}/autopilot/morning-brief${projectId?`?projectId=${encodeURIComponent(projectId)}`:''}`), autopilotCaptures:(params)=>call(`/companies/${cid()}/autopilot/captures${q(params||{})}`), autopilotIntelligence:(params)=>call(`/companies/${cid()}/autopilot/intelligence${q(params||{})}`), autopilotCapture:p=>call(`/companies/${cid()}/autopilot/capture`,{method:'POST',body:JSON.stringify(p)}), autopilotEventStatus:(id,status)=>call(`/companies/${cid()}/autopilot/intelligence/${id}/status`,{method:'POST',body:JSON.stringify({status})}), evidence:(projectId,params)=>call(`/companies/${cid()}/projects/${projectId}/evidence${q(params||{})}`), evidenceChronology:(projectId,params)=>call(`/companies/${cid()}/projects/${projectId}/evidence/chronology${q(params||{})}`), createEvidence:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/evidence`,{method:'POST',body:JSON.stringify(p)}), createClaimEvidencePack:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/evidence/claim-pack`,{method:'POST',body:JSON.stringify(p||{})}), evidencePacks:(params)=>call(`/companies/${cid()}/evidence/packs${q(params||{})}`), constructionNetwork:(projectId)=>call(`/companies/${cid()}/projects/${projectId}/network`),financialIntelligence:(projectId)=>call(`/companies/${cid()}/financial-intelligence${projectId?`?projectId=${encodeURIComponent(projectId)}`:''}`), refreshFinancialIntelligence:(projectId)=>call(`/companies/${cid()}/financial-intelligence/refresh${projectId?`?projectId=${encodeURIComponent(projectId)}`:''}`,{method:'POST'}), financialIntelligenceHistory:(projectId)=>call(`/companies/${cid()}/financial-intelligence/history${projectId?`?projectId=${encodeURIComponent(projectId)}`:''}`),reality:(projectId)=>call(`/companies/${cid()}/projects/${projectId}/reality`), captureReality:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/reality/observations`,{method:'POST',body:JSON.stringify(p)}), realityImpactScan:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/reality/drawing-impact-scan`,{method:'POST',body:JSON.stringify(p)}), realityMarkers:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/reality/markers`,{method:'POST',body:JSON.stringify(p)}), scanRealityMarker:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/reality/markers/scan`,{method:'POST',body:JSON.stringify(p)}), createAsBuiltVerification:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/reality/as-built`,{method:'POST',body:JSON.stringify(p)}), verifyAsBuilt:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/reality/as-built/${id}`,{method:'PATCH',body:JSON.stringify(p)}), constructionTypeProfiles:()=>call(`/construction-type-profiles`), constructionType:(projectId)=>call(`/companies/${cid()}/projects/${projectId}/construction-type`), setConstructionType:(projectId,constructionType)=>call(`/companies/${cid()}/projects/${projectId}/construction-type`,{method:'PATCH',body:JSON.stringify({constructionType})}), lifecycle:(projectId)=>call(`/companies/${cid()}/lifecycle${projectId?`?projectId=${encodeURIComponent(projectId)}`:''}`), lifecycleBenchmarks:()=>call(`/companies/${cid()}/lifecycle/benchmarks`), createTenderIntelligence:p=>call(`/companies/${cid()}/lifecycle/tenders`,{method:'POST',body:JSON.stringify(p)}), createLifecycleItem:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/lifecycle/items`,{method:'POST',body:JSON.stringify(p)}), updateLifecycleItem:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/lifecycle/items/${id}`,{method:'PATCH',body:JSON.stringify(p)}), createWarranty:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/lifecycle/warranties`,{method:'POST',body:JSON.stringify(p)}), createLesson:p=>call(`/companies/${cid()}/lifecycle/lessons`,{method:'POST',body:JSON.stringify(p)}), networkInvite:p=>call(`/companies/${cid()}/network/invitations`,{method:'POST',body:JSON.stringify(p)}), networkSubmit:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/network/submissions`,{method:'POST',body:JSON.stringify(p)}), networkReviewSubmission:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/network/submissions/${id}`,{method:'PATCH',body:JSON.stringify(p)}), networkCommercial:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/network/commercial`,{method:'POST',body:JSON.stringify(p)}), networkReviewCommercial:(projectId,id,status)=>call(`/companies/${cid()}/projects/${projectId}/network/commercial/${id}`,{method:'PATCH',body:JSON.stringify({status})}),
  me:async()=>{const r=await call('/me');return r.data??r}, companies:()=>call('/companies'), createCompany:p=>call('/companies',{method:'POST',body:JSON.stringify(p)}),
  updateCompany:p=>call(`/companies/${cid()}`,{method:'PATCH',body:JSON.stringify(p)}), members:(params)=>call(`/companies/${cid()}/members${q(params)}`), invitations:()=>call(`/companies/${cid()}/invitations`), inviteUser:p=>call(`/companies/${cid()}/invitations`,{method:"POST",body:JSON.stringify(p)}), invitationPreview:token=>call(`/companies/invitations/preview?token=${encodeURIComponent(token)}`), acceptInvitation:p=>call(`/companies/invitations/accept`,{method:"POST",body:JSON.stringify(p)}),
  access:()=>call(`/rbac/companies/${cid()}/access`), roles:()=>call('/rbac/roles'), updateMemberRole:(userId,role)=>call(`/rbac/companies/${cid()}/members/${userId}/role`,{method:'PATCH',body:JSON.stringify({role})}),
  dashboard:(params)=>call(`/companies/${cid()}/dashboard${q(params)}`), analytics:(params)=>call(`/companies/${cid()}/analytics/overview${q(params)}`),
  projects:(params)=>call(`/companies/${cid()}/projects${q(params)}`), project:(id)=>call(`/companies/${cid()}/projects/${id}`), createProject:p=>{const payload={...p,id:p.id||crypto.randomUUID()};return call(`/companies/${cid()}/projects`,{method:'POST',body:JSON.stringify(payload),offlineOperation:{operationId:payload.id,operationType:'CREATE_PROJECT',entityType:'PROJECT',entityId:payload.id,payload}})}, updateProject:(id,p)=>call(`/companies/${cid()}/projects/${id}`,{method:'PATCH',body:JSON.stringify(p),offlineOperation:{operationId:crypto.randomUUID(),operationType:'UPDATE_PROJECT',entityType:'PROJECT',entityId:id,baseUpdatedAt:p.updatedAt||p.updated_at||null,payload:p}}), deleteProject:id=>call(`/companies/${cid()}/projects/${id}`,{method:'DELETE'}), projectStatus:(id,p)=>call(`/companies/${cid()}/projects/${id}/status`,{method:'POST',body:JSON.stringify(p)}), projectControlCenter:id=>call(`/companies/${cid()}/projects/${id}/control-center`), projectStatusHistory:id=>call(`/companies/${cid()}/projects/${id}/status-history`), projectRisks:id=>call(`/companies/${cid()}/projects/${id}/risks`), createProjectRisk:(id,p)=>call(`/companies/${cid()}/projects/${id}/risks`,{method:'POST',body:JSON.stringify(p)}), updateProjectRisk:(id,r,p)=>call(`/companies/${cid()}/projects/${id}/risks/${r}`,{method:'PATCH',body:JSON.stringify(p)}), projectChangeOrders:id=>call(`/companies/${cid()}/projects/${id}/change-orders`), createProjectChangeOrder:(id,p)=>call(`/companies/${cid()}/projects/${id}/change-orders`,{method:'POST',body:JSON.stringify(p)}), updateProjectChangeOrder:(id,r,p)=>call(`/companies/${cid()}/projects/${id}/change-orders/${r}`,{method:'PATCH',body:JSON.stringify(p)}), projectChecklists:id=>call(`/companies/${cid()}/projects/${id}/checklists`), createProjectChecklist:(id,p)=>call(`/companies/${cid()}/projects/${id}/checklists`,{method:'POST',body:JSON.stringify(p)}), updateProjectChecklist:(id,r,p)=>call(`/companies/${cid()}/projects/${id}/checklists/${r}`,{method:'PATCH',body:JSON.stringify(p)}), projectBudgetLines:id=>call(`/companies/${cid()}/projects/${id}/budget-lines`), createProjectBudgetLine:(id,p)=>call(`/companies/${cid()}/projects/${id}/budget-lines`,{method:'POST',body:JSON.stringify(p)}),
  sites:projectId=>call(`/companies/${cid()}/projects/${projectId}/sites`), createSite:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/sites`,{method:'POST',body:JSON.stringify(p)}),
  team:projectId=>call(`/companies/${cid()}/projects/${projectId}/team`), addTeam:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/team`,{method:'POST',body:JSON.stringify(p)}), removeTeam:(projectId,userId)=>call(`/companies/${cid()}/projects/${projectId}/team/${userId}`,{method:'DELETE'}),
  milestones:projectId=>call(`/companies/${cid()}/projects/${projectId}/milestones`), createMilestone:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/milestones`,{method:'POST',body:JSON.stringify(p)}), updateMilestone:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/milestones/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  tasks:(projectId,params)=>call(`/companies/${cid()}/projects/${projectId}/tasks${q(params)}`), createTask:(projectId,p)=>{const payload={...p,id:p.id||crypto.randomUUID(),projectId:p.projectId||projectId};return call(`/companies/${cid()}/projects/${projectId}/tasks`,{method:'POST',body:JSON.stringify(payload),offlineOperation:{operationId:payload.id,operationType:'CREATE_TASK',entityType:'TASK',entityId:payload.id,payload}})}, updateTask:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/tasks/${id}`,{method:'PATCH',body:JSON.stringify(p),offlineOperation:{operationId:crypto.randomUUID(),operationType:'UPDATE_TASK',entityType:'TASK',entityId:id,baseUpdatedAt:p.updatedAt||p.updated_at||null,payload:{...p,projectId:p.projectId||projectId}}}), deleteTask:(projectId,id)=>call(`/companies/${cid()}/projects/${projectId}/tasks/${id}`,{method:'DELETE'}),
  issues:(projectId,params)=>call(`/companies/${cid()}/projects/${projectId}/issues${q(params)}`), createIssue:(projectId,p)=>{const payload={...p,id:p.id||crypto.randomUUID(),projectId:p.projectId||projectId};return call(`/companies/${cid()}/projects/${projectId}/issues`,{method:'POST',body:JSON.stringify(payload),offlineOperation:{operationId:payload.id,operationType:'CREATE_ISSUE',entityType:'ISSUE',entityId:payload.id,payload}})}, updateIssue:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/issues/${id}`,{method:'PATCH',body:JSON.stringify(p),offlineOperation:{operationId:crypto.randomUUID(),operationType:'UPDATE_ISSUE',entityType:'ISSUE',entityId:id,baseUpdatedAt:p.updatedAt||p.updated_at||null,payload:{...p,projectId:p.projectId||projectId}}}), deleteIssue:(projectId,id)=>call(`/companies/${cid()}/projects/${projectId}/issues/${id}`,{method:'DELETE'}),
  activity:(projectId,params)=>call(`/companies/${cid()}/projects/${projectId}/activity${q(params)}`),
  reports:(projectId,params)=>call(`/companies/${cid()}/projects/${projectId}/reports${q(params)}`), report:(projectId,id)=>call(`/companies/${cid()}/projects/${projectId}/reports/${id}`), createReport:(projectId,p,photo)=>{const payload={...p,id:p.id||crypto.randomUUID()};return call(`/companies/${cid()}/projects/${projectId}/reports`,{method:'POST',body:JSON.stringify(payload),offlineOperation:{operationId:payload.id,operationType:'CREATE_REPORT',entityType:'REPORT',entityId:payload.id,payload,photo:photo?{projectId,file:photo,fileName:photo.name,mimeType:photo.type,fileSize:photo.size,caption:photo.type.startsWith('image/')?'Site photo':photo.type.startsWith('video/')?'Site video':'Voice recording'}:null}})}, updateReport:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/reports/${id}`,{method:'PATCH',body:JSON.stringify(p),offlineOperation:{operationId:crypto.randomUUID(),operationType:'UPDATE_REPORT',entityType:'REPORT',entityId:id,baseUpdatedAt:p.updatedAt||p.updated_at||null,payload:{...p,projectId:p.projectId||projectId}}}),
  reportUploadUrl:(projectId,reportId,p)=>call(`/companies/${cid()}/projects/${projectId}/reports/${reportId}/photos/upload-url`,{method:'POST',body:JSON.stringify(p)}), attachReportPhoto:(projectId,reportId,p)=>call(`/companies/${cid()}/projects/${projectId}/reports/${reportId}/photos`,{method:'POST',body:JSON.stringify(p)}), reportPhotoDownloadUrl:(projectId,reportId,photoId)=>call(`/companies/${cid()}/projects/${projectId}/reports/${reportId}/photos/${photoId}/download-url`),
  materials:(params)=>call(`/companies/${cid()}/materials${q(params)}`), createMaterial:p=>{const payload={...p,id:p.id||crypto.randomUUID()};return call(`/companies/${cid()}/materials`,{method:'POST',body:JSON.stringify(payload),offlineOperation:{operationId:payload.id,operationType:'CREATE_MATERIAL',entityType:'MATERIAL',entityId:payload.id,payload}})}, inventory:(params)=>call(`/companies/${cid()}/inventory${q(params)}`), transactions:(params)=>call(`/companies/${cid()}/inventory/transactions${q(params)}`), moveStock:p=>{const operationId=p.operationId||crypto.randomUUID();const payload={...p,operationId};return call(`/companies/${cid()}/inventory/movements`,{method:'POST',body:JSON.stringify(payload),offlineOperation:{operationId,operationType:'INVENTORY_MOVEMENT',entityType:'INVENTORY_MOVEMENT',entityId:null,payload}})}, materialRequests:(params)=>call(`/companies/${cid()}/material-requests${q(params)}`), createMaterialRequest:p=>{const payload={...p,id:p.id||crypto.randomUUID()};return call(`/companies/${cid()}/material-requests`,{method:'POST',body:JSON.stringify(payload),offlineOperation:{operationId:payload.id,operationType:'CREATE_MATERIAL_REQUEST',entityType:'MATERIAL_REQUEST',entityId:payload.id,payload}})}, materialRequest:id=>call(`/companies/${cid()}/material-requests/${id}`), decideMaterialRequest:(id,p)=>call(`/companies/${cid()}/material-requests/${id}/decision`,{method:'POST',body:JSON.stringify(p)}),
  people:(params)=>call(`/companies/${cid()}/people${q(params)}`), personHistory:(kind,id)=>call(`/companies/${cid()}/people/${String(kind).toLowerCase()}/${id}/history`), personUser:(id)=>call(`/companies/${cid()}/people/user/${id}`), personWorker:(id)=>call(`/companies/${cid()}/people/worker/${id}`), projectPeople:(projectId)=>call(`/companies/${cid()}/projects/${projectId}/people`), peopleAttendanceToday:(projectId)=>call(`/companies/${cid()}/people/attendance/today${projectId?`?projectId=${encodeURIComponent(projectId)}`:''}`), savePeopleProfile:p=>call(`/companies/${cid()}/people/profile`,{method:'POST',body:JSON.stringify(p)}), updatePeopleWorker:(id,p)=>call(`/companies/${cid()}/people/worker/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  workers:(params)=>call(`/companies/${cid()}/workers${q(params)}`), createWorker:p=>call(`/companies/${cid()}/workers`,{method:'POST',body:JSON.stringify(p)}), updateWorker:(id,p)=>call(`/companies/${cid()}/workers/${id}`,{method:'PATCH',body:JSON.stringify(p)}), assignments:workerId=>call(`/companies/${cid()}/workers/${workerId}/assignments`), assignWorker:(workerId,p)=>call(`/companies/${cid()}/workers/${workerId}/assignments`,{method:'POST',body:JSON.stringify(p)}), attendance:(params)=>call(`/companies/${cid()}/attendance${q(params)}`), attendanceSummary:(params)=>call(`/companies/${cid()}/attendance/summary${q(params)}`), createAttendance:p=>{const payload={...p,id:p.id||crypto.randomUUID()};return call(`/companies/${cid()}/attendance`,{method:'POST',body:JSON.stringify(payload),offlineOperation:{operationId:payload.id,operationType:'CREATE_ATTENDANCE',entityType:'ATTENDANCE',entityId:payload.id,payload}})}, updateAttendance:(id,p)=>call(`/companies/${cid()}/attendance/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  expenses:(params)=>call(`/companies/${cid()}/expenses${q(params)}`), createExpense:p=>call(`/companies/${cid()}/expenses`,{method:'POST',body:JSON.stringify(p)}), decideExpense:(id,p)=>call(`/companies/${cid()}/expenses/${id}/decision`,{method:'POST',body:JSON.stringify(p)}), payExpense:(id,p)=>call(`/companies/${cid()}/expenses/${id}/pay`,{method:'POST',body:JSON.stringify(p)}), financialRecords:(params)=>call(`/companies/${cid()}/financial-records${q(params)}`), financialSummary:(params)=>call(`/companies/${cid()}/financial-summary${q(params)}`),
  documents:(params)=>call(`/companies/${cid()}/documents${q(params)}`), documentUploadUrl:p=>call(`/companies/${cid()}/documents/upload-url`,{method:'POST',body:JSON.stringify(p)}), documentDownloadUrl:id=>call(`/companies/${cid()}/documents/${id}/download-url`), clientAccess:(params)=>call(`/companies/${cid()}/client-access${q(params)}`), grantClient:p=>call(`/companies/${cid()}/client-access`,{method:'POST',body:JSON.stringify(p)}), revokeClient:id=>call(`/companies/${cid()}/client-access/${id}`,{method:'DELETE'}), clientPortal:()=>call(`/companies/${cid()}/client-portal`),
  collaborationDashboard:projectId=>call(`/companies/${cid()}/projects/${projectId}/collaboration/dashboard`),
  collaborationRfis:projectId=>call(`/companies/${cid()}/projects/${projectId}/collaboration/rfis`), createCollaborationRfi:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/rfis`,{method:'POST',body:JSON.stringify(p)}), updateCollaborationRfi:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/rfis/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  collaborationSubmittals:projectId=>call(`/companies/${cid()}/projects/${projectId}/collaboration/submittals`), createCollaborationSubmittal:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/submittals`,{method:'POST',body:JSON.stringify(p)}), updateCollaborationSubmittal:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/submittals/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  collaborationDrawings:projectId=>call(`/companies/${cid()}/projects/${projectId}/collaboration/drawings`), createCollaborationDrawing:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/drawings`,{method:'POST',body:JSON.stringify(p)}), addDrawingRevision:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/drawings/${id}/revisions`,{method:'POST',body:JSON.stringify(p)}), drawingRevisions:(projectId,id)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/drawings/${id}/revisions`),
  collaborationTransmittals:projectId=>call(`/companies/${cid()}/projects/${projectId}/collaboration/transmittals`), createCollaborationTransmittal:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/transmittals`,{method:'POST',body:JSON.stringify(p)}), updateCollaborationTransmittal:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/transmittals/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  collaborationInstructions:projectId=>call(`/companies/${cid()}/projects/${projectId}/collaboration/site-instructions`), createCollaborationInstruction:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/site-instructions`,{method:'POST',body:JSON.stringify(p)}), updateCollaborationInstruction:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/site-instructions/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  collaborationComments:(projectId,params)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/comments${q(params)}`), addCollaborationComment:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/comments`,{method:'POST',body:JSON.stringify(p)}), updateCollaborationComment:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/comments/${id}`,{method:'PATCH',body:JSON.stringify(p)}), deleteCollaborationComment:(projectId,id)=>call(`/companies/${cid()}/projects/${projectId}/collaboration/comments/${id}`,{method:'DELETE'}),
  messages:(projectId,params)=>call(`/companies/${cid()}/projects/${projectId}/messages${q(params)}`), sendMessage:p=>call(`/companies/${cid()}/messages`,{method:'POST',body:JSON.stringify(p)}), workflowDashboard:(projectId)=>call(`/companies/${cid()}${projectId?`/projects/${projectId}`:''}/workflow/dashboard`),workflowActions:(params)=>call(`/companies/${cid()}/workflow/actions${q(params)}`),updateWorkflowAction:(id,p)=>call(`/companies/${cid()}/workflow/actions/${id}`,{method:'PATCH',body:JSON.stringify(p)}),workflowRules:()=>call(`/companies/${cid()}/workflow/rules`),createWorkflowRule:p=>call(`/companies/${cid()}/workflow/rules`,{method:'POST',body:JSON.stringify(p)}),updateWorkflowRule:(id,p)=>call(`/companies/${cid()}/workflow/rules/${id}`,{method:'PATCH',body:JSON.stringify(p)}),scanWorkflow:(projectId)=>call(`/companies/${cid()}/workflow/scan`,{method:'POST',body:JSON.stringify(projectId?{projectId}:{})}),workflowDigest:(projectId)=>call(`/companies/${cid()}/workflow/digest${q(projectId?{projectId}:{})}`),notifications:(params)=>call(`/companies/${cid()}/notifications${q(params)}`), unreadCount:()=>call(`/companies/${cid()}/notifications/unread-count`), markNotificationRead:id=>call(`/companies/${cid()}/notifications/${id}/read`,{method:'POST'}), markAllNotificationsRead:()=>call(`/companies/${cid()}/notifications/read-all`,{method:'POST'}),
  billingCountries:()=>call('/billing/countries'), billingProviders:(countryCode)=>call(`/billing/providers${countryCode?`?countryCode=${encodeURIComponent(countryCode)}`:""}`), billingPlans:(countryCode)=>call(`/billing/plans${countryCode?`?countryCode=${encodeURIComponent(countryCode)}`:""}`), billing:()=>call(`/companies/${cid()}/billing`), billingStatus:()=>call(`/companies/${cid()}/billing/status`), startTrial:()=>call(`/companies/${cid()}/billing/trial`,{method:'POST',body:'{}'}), checkout:p=>call(`/companies/${cid()}/billing/checkout`,{method:'POST',body:JSON.stringify(p)}), verifyPayment:p=>call(`/companies/${cid()}/billing/verify`,{method:'POST',body:JSON.stringify(p)}),
  procurementRequisitions:(params)=>call(`/companies/${cid()}/procurement/requisitions${q(params)}`),
  createProcurementRequisition:p=>call(`/companies/${cid()}/procurement/requisitions`,{method:'POST',body:JSON.stringify(p)}),
  decideProcurementRequisition:(id,p)=>call(`/companies/${cid()}/procurement/requisitions/${id}/decision`,{method:'POST',body:JSON.stringify(p)}),
  procurementQuotations:(params)=>call(`/companies/${cid()}/procurement/quotations${q(params)}`),
  createProcurementQuotation:p=>call(`/companies/${cid()}/procurement/quotations`,{method:'POST',body:JSON.stringify(p)}),
  decideProcurementQuotation:(id,p)=>call(`/companies/${cid()}/procurement/quotations/${id}/decision`,{method:'POST',body:JSON.stringify(p)}),
  purchaseOrders:(params)=>call(`/companies/${cid()}/procurement/purchase-orders${q(params)}`), purchaseOrder:id=>call(`/companies/${cid()}/procurement/purchase-orders/${id}`),
  createPurchaseOrder:p=>call(`/companies/${cid()}/procurement/purchase-orders`,{method:'POST',body:JSON.stringify(p)}),
  decidePurchaseOrder:(id,p)=>call(`/companies/${cid()}/procurement/purchase-orders/${id}/decision`,{method:'POST',body:JSON.stringify(p)}),
  goodsReceived:(params)=>call(`/companies/${cid()}/procurement/goods-received${q(params)}`),
  createGoodsReceived:p=>call(`/companies/${cid()}/procurement/goods-received`,{method:'POST',body:JSON.stringify(p)}),
  supplierInvoices:(params)=>call(`/companies/${cid()}/procurement/supplier-invoices${q(params)}`),
  createSupplierInvoice:p=>call(`/companies/${cid()}/procurement/supplier-invoices`,{method:'POST',body:JSON.stringify(p)}),
  supplierInvoiceItems:id=>call(`/companies/${cid()}/procurement/supplier-invoices/${id}/items`),
  createSupplierInvoiceItems:(id,p)=>call(`/companies/${cid()}/procurement/supplier-invoices/${id}/items`,{method:'POST',body:JSON.stringify(p)}),
  approveSupplierInvoice:id=>call(`/companies/${cid()}/procurement/supplier-invoices/${id}/approve`,{method:'POST'}),
  supplierPayments:(params)=>call(`/companies/${cid()}/procurement/supplier-payments${q(params)}`),
  createSupplierPayment:p=>call(`/companies/${cid()}/procurement/supplier-payments`,{method:'POST',body:JSON.stringify(p)}),
  suppliers:(params)=>call(`/companies/${cid()}/suppliers${q(params)}`),
  accountingAccounts:()=>call(`/companies/${cid()}/accounting/accounts`),
  createAccountingAccount:p=>call(`/companies/${cid()}/accounting/accounts`,{method:'POST',body:JSON.stringify(p)}),
  costCodes:()=>call(`/companies/${cid()}/accounting/cost-codes`),
  createCostCode:p=>call(`/companies/${cid()}/accounting/cost-codes`,{method:'POST',body:JSON.stringify(p)}),
  accountingJournals:(params)=>call(`/companies/${cid()}/accounting/journals${q(params)}`),
  createJournal:p=>call(`/companies/${cid()}/accounting/journals`,{method:'POST',body:JSON.stringify(p)}),
  accountingReport:(type,params)=>call(`/companies/${cid()}/accounting/reports/${type}${q(params)}`),
  arInvoices:(params)=>call(`/companies/${cid()}/accounting/ar/invoices${q(params)}`),
  createARInvoice:p=>call(`/companies/${cid()}/accounting/ar/invoices`,{method:'POST',body:JSON.stringify(p)}),
  payAR:p=>call(`/companies/${cid()}/accounting/ar/payments`,{method:'POST',body:JSON.stringify(p)}),
  taxRates:(params)=>call(`/companies/${cid()}/accounting/tax-rates${q(params)}`),
  createTaxRate:p=>call(`/companies/${cid()}/accounting/tax-rates`,{method:'POST',body:JSON.stringify(p)}),
  payrollRuns:(params)=>call(`/companies/${cid()}/accounting/payroll-runs${q(params)}`),
  createPayrollRun:p=>call(`/companies/${cid()}/accounting/payroll-runs`,{method:'POST',body:JSON.stringify(p)}),
  payrollStatus:(id,status)=>call(`/companies/${cid()}/accounting/payroll-runs/${id}/status`,{method:'POST',body:JSON.stringify({status})}),
  bankAccounts:()=>call(`/companies/${cid()}/accounting/bank-accounts`),
  createBankAccount:p=>call(`/companies/${cid()}/accounting/bank-accounts`,{method:'POST',body:JSON.stringify(p)}),
  bankTransactions:(params)=>call(`/companies/${cid()}/accounting/bank-transactions${q(params)}`),
  createBankTransaction:p=>call(`/companies/${cid()}/accounting/bank-transactions`,{method:'POST',body:JSON.stringify(p)}),
  reconcileBankTransaction:id=>call(`/companies/${cid()}/accounting/bank-transactions/${id}/reconcile`,{method:'POST'}),
  scheduleWbs:projectId=>call(`/companies/${cid()}/projects/${projectId}/schedule/wbs`),
  createScheduleWbs:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/schedule/wbs`,{method:'POST',body:JSON.stringify(p)}),
  updateScheduleWbs:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/schedule/wbs/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  deleteScheduleWbs:(projectId,id)=>call(`/companies/${cid()}/projects/${projectId}/schedule/wbs/${id}`,{method:'DELETE'}),
  scheduleDashboard:projectId=>call(`/companies/${cid()}/projects/${projectId}/schedule/dashboard`),
  scheduleLookahead:(projectId,weeks=3)=>call(`/companies/${cid()}/projects/${projectId}/schedule/lookahead?weeks=${weeks}`),
  scheduleActivities:projectId=>call(`/companies/${cid()}/projects/${projectId}/schedule/activities`),
  createScheduleActivity:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/schedule/activities`,{method:'POST',body:JSON.stringify(p)}),
  updateScheduleActivity:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/schedule/activities/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  deleteScheduleActivity:(projectId,id)=>call(`/companies/${cid()}/projects/${projectId}/schedule/activities/${id}`,{method:'DELETE'}),
  scheduleDependencies:projectId=>call(`/companies/${cid()}/projects/${projectId}/schedule/dependencies`),
  createScheduleDependency:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/schedule/dependencies`,{method:'POST',body:JSON.stringify(p)}),
  deleteScheduleDependency:(projectId,id)=>call(`/companies/${cid()}/projects/${projectId}/schedule/dependencies/${id}`,{method:'DELETE'}),
  recalculateSchedule:projectId=>call(`/companies/${cid()}/projects/${projectId}/schedule/recalculate`,{method:'POST'}),
  scheduleBaselines:projectId=>call(`/companies/${cid()}/projects/${projectId}/schedule/baselines`),
  createScheduleBaseline:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/schedule/baselines`,{method:'POST',body:JSON.stringify(p)}),
  approveScheduleBaseline:(projectId,id)=>call(`/companies/${cid()}/projects/${projectId}/schedule/baselines/${id}/approve`,{method:'POST'}),
  updateScheduleProgress:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/schedule/activities/${id}/progress`,{method:'POST',body:JSON.stringify(p)}),
  scheduleDelays:projectId=>call(`/companies/${cid()}/projects/${projectId}/schedule/delays`),
  createScheduleDelay:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/schedule/delays`,{method:'POST',body:JSON.stringify(p)}),
  executionDashboard:projectId=>call(`/companies/${cid()}/projects/${projectId}/execution/dashboard`),
  executionAlerts:projectId=>call(`/companies/${cid()}/projects/${projectId}/execution/alerts`),
  executionSnapshots:projectId=>call(`/companies/${cid()}/projects/${projectId}/execution/snapshots`),
  saveExecutionSnapshot:projectId=>call(`/companies/${cid()}/projects/${projectId}/execution/snapshot`,{method:'POST',body:'{}'}),
  qualityTemplates:()=>call(`/companies/${cid()}/quality/templates`),
  createQualityTemplate:p=>call(`/companies/${cid()}/quality/templates`,{method:"POST",body:JSON.stringify(p)}),
    qualityDashboard:projectId=>call(`/companies/${cid()}/projects/${projectId}/quality/dashboard`),
  qualityInspections:projectId=>call(`/companies/${cid()}/projects/${projectId}/quality/inspections`),
  createQualityInspection:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/quality/inspections`,{method:"POST",body:JSON.stringify(p)}),
  approveQualityInspection:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/quality/inspections/${id}`,{method:"PATCH",body:JSON.stringify(p)}),
  qualityNcrs:projectId=>call(`/companies/${cid()}/projects/${projectId}/quality/ncrs`),
  createQualityNcr:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/quality/ncrs`,{method:"POST",body:JSON.stringify(p)}),
  updateQualityNcr:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/quality/ncrs/${id}`,{method:"PATCH",body:JSON.stringify(p)}),
  qualityActions:projectId=>call(`/companies/${cid()}/projects/${projectId}/quality/actions`),
  createQualityAction:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/quality/actions`,{method:"POST",body:JSON.stringify(p)}),
  updateQualityAction:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/quality/actions/${id}`,{method:"PATCH",body:JSON.stringify(p)}),
  safety:projectId=>call(`/companies/${cid()}/projects/${projectId}/safety`),
  createSafetyObservation:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/safety/observations`,{method:"POST",body:JSON.stringify(p)}),
  createSafetyIncident:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/safety/incidents`,{method:"POST",body:JSON.stringify(p)}),
  compliancePermits:projectId=>call(`/companies/${cid()}/projects/${projectId}/compliance/permits`),
  createCompliancePermit:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/compliance/permits`,{method:"POST",body:JSON.stringify(p)}),
  executionBoq:projectId=>call(`/companies/${cid()}/projects/${projectId}/execution/boq`),
  createExecutionMeasurement:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/execution/measurements`,{method:'POST',body:JSON.stringify(p)}),
  siteMaterialIntelligence:projectId=>call(`/companies/${cid()}/projects/${projectId}/site-intelligence/materials`),
  siteProductivity:projectId=>call(`/companies/${cid()}/projects/${projectId}/site-intelligence/productivity`),
  createMaterialPlan:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/site-intelligence/material-plans`,{method:'POST',body:JSON.stringify(p)}),
  createProductivity:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/site-intelligence/productivity`,{method:'POST',body:JSON.stringify(p)}),
  executivePortfolio:(projectId)=>call(`/companies/${cid()}/executive-intelligence/portfolio${q(projectId?{projectId}: {})}`),
  executiveTrends:(projectId,days=90)=>call(`/companies/${cid()}/executive-intelligence/trends${q({projectId,days})}`),
  executiveReport:(projectId)=>call(`/companies/${cid()}/executive-intelligence/report${q(projectId?{projectId}: {})}`),
  treasuryForecast:(p)=>call(`/companies/${cid()}/treasury/forecast${q(p||{})}`),
  controlTower:()=>call(`/companies/${cid()}/control-tower`), controlTowerRefresh:p=>call(`/companies/${cid()}/control-tower/refresh`,{method:'POST',body:JSON.stringify(p||{})}),
  recoveryIntelligence:(p)=>call(`/companies/${cid()}/recovery-intelligence${q(p||{})}`),
  revenueMargin:(p)=>call(`/companies/${cid()}/revenue-margin${q(p||{})}`), today:()=>call(`/companies/${cid()}/today`), dailyIntelligence:(p)=>call(`/companies/${cid()}/today/intelligence${q(p||{})}`), refreshDailyIntelligence:(p)=>call(`/companies/${cid()}/today/intelligence/refresh`,{method:'POST',body:JSON.stringify(p||{})}), dailyIntelligenceOutcome:(snapshotId,p)=>call(`/companies/${cid()}/today/intelligence/${snapshotId}/outcome`,{method:'POST',body:JSON.stringify(p||{})}), moneyLeak:()=>call(`/companies/${cid()}/money-leak`), consequence:projectId=>call(`/companies/${cid()}/projects/${projectId}/consequence`), voiceReport:p=>call(`/companies/${cid()}/integrations/voice-report`,{method:'POST',body:JSON.stringify(p)}), fieldMessage:p=>call(`/companies/${cid()}/integrations/field-message`,{method:'POST',body:JSON.stringify(p)}), boqIntelligence:projectId=>call(`/companies/${cid()}/projects/${projectId}/boq-intelligence`), boqItem:(projectId,itemId)=>call(`/companies/${cid()}/projects/${projectId}/boq/${itemId}`), production:(projectId)=>call(`/companies/${cid()}/projects/${projectId}/production`), workfronts:(projectId)=>call(`/companies/${cid()}/projects/${projectId}/workfronts`), createWorkfront:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/workfronts`,{method:'POST',body:JSON.stringify(p)}), setReadiness:(projectId,workfrontId,p)=>call(`/companies/${cid()}/projects/${projectId}/workfronts/${workfrontId}/readiness`,{method:'POST',body:JSON.stringify(p)}), createProduction:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/production`,{method:'POST',body:JSON.stringify(p)}), valueProtectionEvents:(p)=>call(`/companies/${cid()}/value-protection-events${q(p||{})}`), createValueProtectionEvent:p=>call(`/companies/${cid()}/value-protection-events`,{method:'POST',body:JSON.stringify(p)}), recoveryPlans:(p)=>call(`/companies/${cid()}/recovery-plans${q(p||{})}`), recoveryPlan:id=>call(`/companies/${cid()}/recovery-plans/${id}`),
  createRecoveryPlan:p=>call(`/companies/${cid()}/recovery-plans`,{method:'POST',body:JSON.stringify(p)}),
  updateRecoveryPlan:(id,p)=>call(`/companies/${cid()}/recovery-plans/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  attachRecoveryActions:(id,actionIds)=>call(`/companies/${cid()}/recovery-plans/${id}/actions`,{method:'POST',body:JSON.stringify({actionIds})}),
  reviewRecoveryPlan:(id,notes)=>call(`/companies/${cid()}/recovery-plans/${id}/review`,{method:'POST',body:JSON.stringify({notes})}),
  recoveryReviews:id=>call(`/companies/${cid()}/recovery-plans/${id}/reviews`), recoveryCommitments:id=>call(`/companies/${cid()}/recovery-plans/${id}/commitments`), createRecoveryCommitment:(id,p)=>call(`/companies/${cid()}/recovery-plans/${id}/commitments`,{method:'POST',body:JSON.stringify(p)}), updateRecoveryCommitment:(id,p)=>call(`/companies/${cid()}/recovery-commitments/${id}`,{method:'PATCH',body:JSON.stringify(p)}), recoveryFieldExecutions:id=>call(`/companies/${cid()}/recovery-plans/${id}/field-executions`), recoveryFieldExecutionSummary:id=>call(`/companies/${cid()}/recovery-plans/${id}/field-execution-summary`), recoveryActivities:projectId=>call(`/companies/${cid()}/projects/${projectId}/recovery-activities`), createRecoveryFieldExecution:(id,p)=>call(`/companies/${cid()}/recovery-plans/${id}/field-executions`,{method:'POST',body:JSON.stringify(p)}), updateRecoveryFieldExecution:(id,p)=>call(`/companies/${cid()}/recovery-field-executions/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  createTreasuryForecast:p=>call(`/companies/${cid()}/treasury/forecast`,{method:'POST',body:JSON.stringify(p)}),
  treasuryHistory:(projectId)=>call(`/companies/${cid()}/treasury/history${q(projectId?{projectId}:{})}`),
  constructionExecutive:()=>call(`/companies/${cid()}/construction/executive`),
  constructionAiInsights:()=>call(`/companies/${cid()}/construction/ai-insights`),
  projectProfitability:projectId=>call(`/companies/${cid()}/projects/${projectId}/construction/profitability`),
  commercialSummary:projectId=>call(`/companies/${cid()}/projects/${projectId}/construction/commercial-summary`),
  costCodes:()=>call(`/companies/${cid()}/construction/cost-codes`),
  createCostCode:p=>call(`/companies/${cid()}/construction/cost-codes`,{method:'POST',body:JSON.stringify(p)}),
  importEstimate:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/construction/estimates/import`,{method:'POST',body:JSON.stringify(p)}),
  transitionChangeOrder:(projectId,id,p)=>call(`/companies/${cid()}/projects/${projectId}/construction/change-orders/${id}/transition`,{method:'POST',body:JSON.stringify(p)}),
  constructionList:(resource,params)=>call(`/companies/${cid()}/construction/${resource}${q(params)}`),
  constructionCreate:(resource,p)=>call(`/companies/${cid()}/construction/${resource}`,{method:'POST',body:JSON.stringify(p)}),
  constructionUpdate:(resource,id,p)=>call(`/companies/${cid()}/construction/${resource}/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  approveProgress:id=>call(`/companies/${cid()}/construction/project_progress_measurements/${id}/approve`,{method:'POST'}),
  estimates:(projectId,params)=>call(`/companies/${cid()}/projects/${projectId}/construction/estimates${q(params)}`),
  createEstimate:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/construction/estimates`,{method:'POST',body:JSON.stringify(p)}),
  estimate:id=>call(`/companies/${cid()}/construction/estimates/${id}`), approveEstimate:id=>call(`/companies/${cid()}/construction/estimates/${id}/approve`,{method:'POST'}),
  ipcs:(projectId,params)=>call(`/companies/${cid()}/projects/${projectId}/construction/ipcs${q(params)}`),
  createIpc:(projectId,p)=>call(`/companies/${cid()}/projects/${projectId}/construction/ipcs`,{method:'POST',body:JSON.stringify(p)}),
  approveIpc:id=>call(`/companies/${cid()}/construction/ipcs/${id}/approve`,{method:'POST'}), invoiceIpc:id=>call(`/companies/${cid()}/construction/ipcs/${id}/invoice`,{method:'POST'}), ipc:id=>call(`/companies/${cid()}/construction/ipcs/${id}`),
  supportFaqs:()=>call('/support/faqs'),
  askCustomerCare:question=>call('/support/answer',{method:'POST',body:JSON.stringify({question})}),
  supportTickets:companyId=>call(`/support/tickets${q({companyId})}`),
  createSupportTicket:p=>call('/support/tickets',{method:'POST',body:JSON.stringify(p)}),
  myFeedback:companyId=>call(`/support/feedback${q({companyId})}`),
  createCompanyFeedback:p=>call('/support/feedback',{method:'POST',body:JSON.stringify(p)}),
  platformAdminOverview:()=>call('/admin/overview'),
  platformAdminCompanies:()=>adminAllPages('/admin/companies'),
  platformAdminSubscriptions:()=>adminAllPages('/admin/subscriptions'),
  platformAdminPayments:()=>call('/admin/payments?page=1&pageSize=100'),
  platformAdminTickets:()=>adminAllPages('/admin/support/tickets'),
  platformAdminUpdateTicket:(id,p)=>call(`/admin/support/tickets/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  platformAdminFeedback:()=>adminAllPages('/admin/feedback'),
  platformAdminUpdateFeedback:(id,p)=>call(`/admin/feedback/${id}`,{method:'PATCH',body:JSON.stringify(p)}),
  downloadReport:async(type,params)=>{const {data}=await supabase.auth.getSession();const headers=data.session?{Authorization:`Bearer ${data.session.access_token}`}:{ };const r=await fetch(`${API}/companies/${cid()}/reports/${type}.csv${q(params)}`,{headers});if(!r.ok)throw new Error('Export failed');return r.blob()}
};
