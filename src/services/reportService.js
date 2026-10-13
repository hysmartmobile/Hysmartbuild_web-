import { randomUUID } from "node:crypto";

const clean = (v) => typeof v === "string" ? v.trim() : v;

export class ReportService {
  constructor({ supabase }) { this.supabase = supabase; }

  async assertProject({ companyId, projectId }) {
    const { data, error } = await this.supabase.from("projects").select("id,company_id,name").eq("company_id", companyId).eq("id", projectId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Project not found"); e.code = "PROJECT_NOT_FOUND"; e.status = 404; throw e; }
    return data;
  }

  async listReports({ companyId, projectId, page=1, pageSize=20, fromDate, toDate }) {
    await this.assertProject({ companyId, projectId });
    const from=(page-1)*pageSize, to=from+pageSize-1;
    let q=this.supabase.from("daily_site_reports").select("id,company_id,project_id,site_id,report_date,weather,workforce_count,work_completed,work_in_progress,materials_received,materials_used,equipment_used,visitors,issues,safety_observations,delays,additional_notes,overall_progress,location_latitude,location_longitude,location_accuracy_m,location_verified,approval_status,approved_by,approved_at,rejection_reason,created_by,created_at,updated_at,sites:site_id(id,name),media:site_report_photos(id,file_name,mime_type,file_size,caption,created_at)",{count:"exact"}).eq("company_id",companyId).eq("project_id",projectId).order("report_date",{ascending:false}).order("created_at",{ascending:false});
    if(fromDate) q=q.gte("report_date",fromDate); if(toDate) q=q.lte("report_date",toDate);
    const {data,count,error}=await q.range(from,to); if(error) throw error;
    return {items:data??[],page,pageSize,total:count??0,totalPages:Math.ceil((count??0)/pageSize)};
  }

  async getReport({ companyId, projectId, reportId }) {
    await this.assertProject({companyId,projectId});
    const {data,error}=await this.supabase.from("daily_site_reports").select("*,sites:site_id(id,name)").eq("company_id",companyId).eq("project_id",projectId).eq("id",reportId).maybeSingle();
    if(error) throw error; if(!data){const e=new Error("Daily report not found");e.code="REPORT_NOT_FOUND";e.status=404;throw e;}
    const photos=await this.listPhotos({companyId,projectId,reportId}); return {...data,photos};
  }

  async verifyLocation({ companyId, projectId, siteId, latitude, longitude, accuracyM }) {
    if (latitude == null || longitude == null || !siteId) return false;
    if (accuracyM != null && accuracyM > 200) return false;
    const { data } = await this.supabase.from("sites").select("latitude,longitude").eq("company_id",companyId).eq("project_id",projectId).eq("id",siteId).maybeSingle();
    if (data?.latitude == null || data?.longitude == null) return false;
    const rad=v=>v*Math.PI/180, R=6371000; const dLat=rad(latitude-data.latitude),dLon=rad(longitude-data.longitude); const a=Math.sin(dLat/2)**2+Math.cos(rad(data.latitude))*Math.cos(rad(latitude))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(a))<=500;
  }

  async createReport({ companyId, projectId, userId, input }) {
    await this.assertProject({companyId,projectId});
    if(input.siteId){ const site=await this.supabase.from("sites").select("id,project_id").eq("company_id",companyId).eq("project_id",projectId).eq("id",input.siteId).maybeSingle(); if(site.error) throw site.error; if(!site.data){const e=new Error("Site does not belong to the selected project");e.code="SITE_PROJECT_MISMATCH";e.status=400;throw e;} }
    const row={id:input.id||randomUUID(),company_id:companyId,project_id:projectId,site_id:input.siteId||null,report_date:input.reportDate,weather:clean(input.weather)||null,workforce_count:input.workforceCount??0,work_completed:clean(input.workCompleted)||null,work_in_progress:clean(input.workInProgress)||null,materials_received:clean(input.materialsReceived)||null,materials_used:clean(input.materialsUsed)||null,equipment_used:clean(input.equipmentUsed)||null,visitors:clean(input.visitors)||null,issues:clean(input.issues)||null,safety_observations:clean(input.safetyObservations)||null,delays:clean(input.delays)||null,additional_notes:clean(input.additionalNotes)||null,overall_progress:input.overallProgress??0,location_latitude:input.locationLatitude??null,location_longitude:input.locationLongitude??null,location_accuracy_m:input.locationAccuracyM??null,location_verified:await this.verifyLocation({siteId:input.siteId,latitude:input.locationLatitude,longitude:input.locationLongitude,accuracyM:input.locationAccuracyM,companyId,projectId}),created_by:userId};
    const {data,error}=await this.supabase.from("daily_site_reports").insert(row).select().single(); if(error) throw error;
    await this.logActivity({companyId,projectId,userId,action:"CREATED",summary:`Daily site report submitted for ${data.report_date}`,metadata:{reportId:data.id,overallProgress:data.overall_progress}});
    // Route the report to active project members, excluding its author. Keep the
    // saved report successful even if notification delivery has a transient failure.
    let notificationDelivery={status:"NOT_CONFIGURED",recipientCount:0};
    try {
      const {data:members,error:memberError}=await this.supabase.from("project_members").select("user_id").eq("company_id",companyId).eq("project_id",projectId).eq("status","ACTIVE");
      if(memberError) throw memberError;
      const recipients=[...new Set((members||[]).map(m=>m.user_id).filter(id=>id&&id!==userId))];
      if(recipients.length){
        const {error:notificationError}=await this.supabase.from("notifications").insert(recipients.map(recipient_user_id=>({id:randomUUID(),company_id:companyId,project_id:projectId,recipient_user_id,actor_user_id:userId,type:"DAILY_SITE_REPORT",title:"New daily site report",body:`Report for ${data.report_date} submitted${data.location_verified?" with verified site location":""}.`,})))
        if(notificationError) throw notificationError;
      }
      notificationDelivery={status:"DELIVERED_TO_IN_APP_INBOX",recipientCount:recipients.length};
    } catch(notificationError) {
      notificationDelivery={status:"FAILED",recipientCount:0};
      // Report is already persisted; expose delivery state instead of making the
      // client retry report creation and accidentally duplicate the report.
      console.error("Daily report notification delivery failed",{companyId,projectId,reportId:data.id,error:notificationError?.message||"unknown"});
    }
    return {...data,notification_delivery:notificationDelivery};
  }

  async updateReport({companyId,projectId,reportId,userId,input}) {
    await this.assertProject({companyId,projectId});
    const {data:before,error:be}=await this.supabase.from("daily_site_reports").select("id,report_date,overall_progress").eq("company_id",companyId).eq("project_id",projectId).eq("id",reportId).maybeSingle(); if(be) throw be; if(!before){const e=new Error("Daily report not found");e.code="REPORT_NOT_FOUND";e.status=404;throw e;}
    const map={siteId:"site_id",reportDate:"report_date",weather:"weather",workforceCount:"workforce_count",workCompleted:"work_completed",workInProgress:"work_in_progress",materialsReceived:"materials_received",materialsUsed:"materials_used",equipmentUsed:"equipment_used",visitors:"visitors",issues:"issues",safetyObservations:"safety_observations",delays:"delays",additionalNotes:"additional_notes",overallProgress:"overall_progress"}; const patch={}; for(const[k,c]of Object.entries(map)) if(input[k]!==undefined) patch[c]=typeof input[k]==="string"?clean(input[k])||null:input[k];
    const {data,error}=await this.supabase.from("daily_site_reports").update(patch).eq("company_id",companyId).eq("project_id",projectId).eq("id",reportId).select().single(); if(error) throw error;
    await this.logActivity({companyId,projectId,userId,action:"UPDATED",summary:`Daily site report updated for ${data.report_date}`,metadata:{reportId:data.id,fromProgress:before.overall_progress,toProgress:data.overall_progress}}); return data;
  }

  async decideReport({companyId,projectId,reportId,userId,decision,reason}) {
    await this.assertProject({companyId,projectId});
    const action=decision==="APPROVED"?"APPROVE":"REJECT";
    const {data,error}=await this.supabase.rpc("perform_my_work_action",{p_company_id:companyId,p_user_id:userId,p_entity_type:"REPORT",p_entity_id:reportId,p_action:action,p_reason:reason||null,p_payload:{projectId}});
    if(error) throw error;
    return data?.item??data;
  }

  async createPhotoDownload({companyId,projectId,reportId,photoId}) {
    await this.getReport({companyId,projectId,reportId});
    const {data,error}=await this.supabase.from("site_report_photos").select("id,file_path,file_name,mime_type,file_size").eq("company_id",companyId).eq("project_id",projectId).eq("report_id",reportId).eq("id",photoId).maybeSingle();
    if(error)throw error;
    if(!data){const e=new Error("Evidence not found");e.code="PHOTO_NOT_FOUND";e.status=404;throw e;}
    const {data:signed,error:se}=await this.supabase.storage.from("site-report-photos").createSignedUrl(data.file_path,600);
    if(se)throw se;
    return {photo:data,url:signed.signedUrl,expiresIn:600};
  }

  async deleteReport({companyId,projectId,reportId,userId}) { const {data,error}=await this.supabase.from("daily_site_reports").delete().eq("company_id",companyId).eq("project_id",projectId).eq("id",reportId).select("id,report_date").maybeSingle(); if(error) throw error; if(data) await this.logActivity({companyId,projectId,userId,action:"DELETED",summary:`Daily site report deleted for ${data.report_date}`,metadata:{reportId:data.id}}); }

  async listPhotos({companyId,projectId,reportId}) { const {data,error}=await this.supabase.from("site_report_photos").select("id,report_id,file_path,file_name,mime_type,file_size,caption,created_by,created_at").eq("company_id",companyId).eq("project_id",projectId).eq("report_id",reportId).order("created_at",{ascending:true}); if(error) throw error; return data??[]; }

  async createPhotoRecord({companyId,projectId,reportId,userId,input}) {
    await this.getReport({companyId,projectId,reportId});
    const expectedPrefix=`${companyId}/${projectId}/${reportId}/`;
    if(!String(input.filePath||"").startsWith(expectedPrefix)){
      const e=new Error("Evidence path does not belong to this company report");e.code="PHOTO_PATH_INVALID";e.status=400;throw e;
    }
    const row={id:randomUUID(),company_id:companyId,project_id:projectId,report_id:reportId,file_path:input.filePath,file_name:input.fileName,mime_type:input.mimeType,file_size:input.fileSize,caption:clean(input.caption)||null,created_by:userId}; const {data,error}=await this.supabase.from("site_report_photos").insert(row).select().single(); if(error) throw error; return data; }

  async createUploadUrl({companyId,projectId,reportId,userId,input}) {
    await this.getReport({companyId,projectId,reportId});
    const storageIncrement=Math.max(1,Math.ceil(Number(input.fileSize||0)/1048576));
    const {error:limitError}=await this.supabase.rpc("enforce_company_limit",{p_company_id:companyId,p_resource:"storage_mb",p_increment:storageIncrement});
    if(limitError){
      const message=String(limitError.message||"");
      if(message.includes("SUBSCRIPTION_LIMIT_EXCEEDED")){const e=new Error("Storage limit for the active subscription has been reached");e.code="SUBSCRIPTION_LIMIT_EXCEEDED";e.status=402;throw e;}
      if(message.includes("SUBSCRIPTION_REQUIRED")){const e=new Error("An active subscription is required to upload field evidence");e.code="SUBSCRIPTION_REQUIRED";e.status=402;throw e;}
      throw limitError;
    }
    const safe=input.fileName.replace(/[^a-zA-Z0-9._-]/g,"-"); const path=`${companyId}/${projectId}/${reportId}/${randomUUID()}-${safe}`; const {data,error}=await this.supabase.storage.from("site-report-photos").createSignedUploadUrl(path); if(error) throw error; return {path,token:data.token}; }

  async logActivity({companyId,projectId,userId,action,summary,metadata={}}) { const {error}=await this.supabase.from("project_activity").insert({id:randomUUID(),company_id:companyId,project_id:projectId,actor_user_id:userId,entity_type:"SITE_REPORT",entity_id:null,action,summary,metadata}); if(error) throw error; }
}
