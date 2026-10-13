import { randomUUID } from 'node:crypto';

const TYPES = new Set(['CLIENT','SUBCONTRACTOR','SUPPLIER','CONSULTANT']);
const SUBMISSION_TYPES = new Set(['RFI','SUBMITTAL','PROGRESS','DOCUMENT','VARIATION','PAYMENT_REQUEST','DELIVERY_NOTICE','OTHER']);
const REVIEW_STATUSES = new Set(['UNDER_REVIEW','APPROVED','APPROVED_WITH_COMMENTS','REJECTED','RESUBMIT','WITHDRAWN']);
const clean = v => typeof v === 'string' ? v.trim() : '';
const iso = () => new Date().toISOString();

export class ConstructionNetworkService {
  constructor({ supabase, webAppUrl = '' }) { this.supabase = supabase; this.webAppUrl = webAppUrl; }

  async assertProject({ companyId, projectId }) {
    const { data, error } = await this.supabase.from('projects').select('id,company_id,name,status,start_date,end_date,currency_code').eq('company_id',companyId).eq('id',projectId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Project not found'); e.code='PROJECT_NOT_FOUND'; e.status=404; throw e; }
    return data;
  }

  async participant({ companyId, projectId, userId, participantId }) {
    let q = this.supabase.from('construction_network_participants').select('id,company_id,project_id,user_id,network_type,organization_name,contact_role,phone,status,created_at,updated_at').eq('company_id',companyId).eq('project_id',projectId).eq('status','ACTIVE');
    if (participantId) q=q.eq('id',participantId); else q=q.eq('user_id',userId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Network access not found for this project'); e.code='NETWORK_ACCESS_DENIED'; e.status=403; throw e; }
    return data;
  }

  async assertInternal({ companyId, userId, role }) {
    if (role === 'CLIENT') return false;
    const { data, error } = await this.supabase.from('company_members').select('user_id,role,status').eq('company_id',companyId).eq('user_id',userId).eq('status','ACTIVE').maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Company access denied'); e.code='COMPANY_ACCESS_DENIED'; e.status=403; throw e; }
    return true;
  }

  async dashboard({ companyId, projectId, userId, role }) {
    await this.assertProject({companyId,projectId});
    const internal = await this.assertInternal({companyId,userId,role});
    const own = internal ? null : await this.participant({companyId,projectId,userId});
    const pQuery = this.supabase.from('construction_network_participants').select('id,user_id,network_type,organization_name,contact_role,phone,status,created_at').eq('company_id',companyId).eq('project_id',projectId).eq('status','ACTIVE').order('created_at',{ascending:false});
    const sQuery = this.supabase.from('construction_network_submissions').select('id,participant_id,submission_type,title,description,amount,currency,document_ids,source_reference,status,reviewer_user_id,review_comments,submitted_at,reviewed_at,created_by,created_at,updated_at').eq('company_id',companyId).eq('project_id',projectId).order('created_at',{ascending:false}).limit(100);
    const cQuery = this.supabase.from('construction_network_commercial_exchanges').select('id,participant_id,exchange_type,direction,reference_no,description,amount,currency,status,source_type,source_id,visible_to_external,created_by,created_at,updated_at').eq('company_id',companyId).eq('project_id',projectId).eq('visible_to_external',true).order('created_at',{ascending:false}).limit(100);
    if (!internal) { pQuery.eq('id',own.id); sQuery.eq('participant_id',own.id); cQuery.eq('participant_id',own.id); }
    const [participants,submissions,commercial] = await Promise.all([pQuery,sQuery,cQuery]);
    for (const x of [participants,submissions,commercial]) if (x.error) throw x.error;
    return { project:{id:projectId}, viewer:{internal,participant:own}, participants:participants.data||[], submissions:submissions.data||[], commercialExchanges:commercial.data||[], collaboration:{message:'Project communication remains in Collaboration/Comments and is not duplicated here.'} };
  }

  async createNetworkInvitation({ companyId, invitedBy, email, networkType, projectId, expiresInDays=7 }) {
    if (!TYPES.has(networkType)) { const e=new Error('Invalid network participant type'); e.code='NETWORK_TYPE_INVALID'; e.status=400; throw e; }
    await this.assertProject({companyId,projectId});
    const normalized=clean(email).toLowerCase();
    await this.supabase.from('company_invitations').update({status:'REVOKED',updated_at:iso()}).eq('company_id',companyId).eq('status','PENDING').ilike('email',normalized);
    const token = randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');
    const {createHash}=await import('node:crypto');
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const expiresAt=new Date(Date.now()+Math.max(1,Math.min(30,expiresInDays))*86400000).toISOString();
    const {data,error}=await this.supabase.from('company_invitations').insert({id:randomUUID(),company_id:companyId,email:normalized,role:'CLIENT',token_hash:tokenHash,expires_at:expiresAt,invited_by:invitedBy,status:'PENDING',network_type:networkType,network_project_id:projectId}).select('id,company_id,email,role,expires_at,status,network_type,network_project_id,created_at').single();
    if(error)throw error;
    return {...data,token,inviteUrl:`${this.webAppUrl}/invitations/accept?token=${encodeURIComponent(token)}`};
  }

  async createSubmission({companyId,projectId,userId,role,input}) {
    await this.assertProject({companyId,projectId});
    const internal=await this.assertInternal({companyId,userId,role});
    const participant=internal ? await this.participant({companyId,projectId,participantId:input.participantId}) : await this.participant({companyId,projectId,userId});
    const row={id:randomUUID(),company_id:companyId,project_id:projectId,participant_id:participant.id,submission_type:input.submissionType,title:clean(input.title),description:clean(input.description)||null,amount:input.amount ?? null,currency:clean(input.currency).toUpperCase()||null,document_ids:Array.isArray(input.documentIds)?input.documentIds:[],source_reference:clean(input.sourceReference)||null,status:'SUBMITTED',created_by:userId,submitted_at:iso()};
    const {data,error}=await this.supabase.from('construction_network_submissions').insert(row).select().single();
    if(error)throw error; return data;
  }

  async reviewSubmission({companyId,projectId,userId,role,submissionId,input}) {
    await this.assertProject({companyId,projectId});
    await this.assertInternal({companyId,userId,role});
    if(!REVIEW_STATUSES.has(input.status)){const e=new Error('Invalid review status');e.code='NETWORK_REVIEW_STATUS_INVALID';e.status=400;throw e;}
    const {data,error}=await this.supabase.from('construction_network_submissions').update({status:input.status,reviewer_user_id:userId,review_comments:clean(input.reviewComments)||null,reviewed_at:iso(),updated_at:iso()}).eq('company_id',companyId).eq('project_id',projectId).eq('id',submissionId).select().maybeSingle();
    if(error)throw error;if(!data){const e=new Error('Network submission not found');e.code='NETWORK_SUBMISSION_NOT_FOUND';e.status=404;throw e;}return data;
  }

  async createCommercialExchange({companyId,projectId,userId,role,input}) {
    await this.assertProject({companyId,projectId});
    const internal=await this.assertInternal({companyId,userId,role});
    const participant=internal ? await this.participant({companyId,projectId,participantId:input.participantId}) : await this.participant({companyId,projectId,userId});
    const row={id:randomUUID(),company_id:companyId,project_id:projectId,participant_id:participant.id,exchange_type:input.exchangeType,direction:internal?'OUTBOUND':'INBOUND',reference_no:clean(input.referenceNo)||null,description:clean(input.description),amount:Number(input.amount),currency:clean(input.currency).toUpperCase(),status:internal?'OPEN':'SUBMITTED',source_type:clean(input.sourceType).toUpperCase()||null,source_id:input.sourceId||null,visible_to_external:true,created_by:userId};
    const {data,error}=await this.supabase.from('construction_network_commercial_exchanges').insert(row).select().single();
    if(error)throw error;return data;
  }

  async reviewCommercialExchange({companyId,projectId,userId,role,exchangeId,status}) {
    await this.assertProject({companyId,projectId}); await this.assertInternal({companyId,userId,role});
    const allowed=['OPEN','UNDER_REVIEW','APPROVED','PARTIALLY_PAID','PAID','REJECTED','CANCELLED'];
    if(!allowed.includes(status)){const e=new Error('Invalid commercial exchange status');e.code='NETWORK_COMMERCIAL_STATUS_INVALID';e.status=400;throw e;}
    const {data,error}=await this.supabase.from('construction_network_commercial_exchanges').update({status,updated_at:iso()}).eq('company_id',companyId).eq('project_id',projectId).eq('id',exchangeId).select().maybeSingle();
    if(error)throw error;if(!data){const e=new Error('Commercial exchange not found');e.code='NETWORK_EXCHANGE_NOT_FOUND';e.status=404;throw e;}return data;
  }

  async activateAcceptedInvitation({companyId,userId,invitationId}) {
    const {data:invite,error}=await this.supabase.from('company_invitations').select('id,company_id,network_type,network_project_id,email,status').eq('id',invitationId).eq('company_id',companyId).maybeSingle();
    if(error)throw error;
    if(!invite?.network_type||!invite.network_project_id)return null;
    const {data,error:ie}=await this.supabase.from('construction_network_participants').upsert({id:randomUUID(),company_id:companyId,project_id:invite.network_project_id,user_id:userId,network_type:invite.network_type,status:'ACTIVE',invited_by:null},{onConflict:'company_id,project_id,user_id,network_type'}).select().single();
    if(ie)throw ie; return data;
  }
}
