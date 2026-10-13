export class AdminService {
  constructor({ supabase }) { this.supabase = supabase; }

  async assertAdmin(userId) {
    const { data, error } = await this.supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) { const e=new Error("Platform administrator access required"); e.code="PLATFORM_ADMIN_REQUIRED"; e.status=403; throw e; }
  }


  async platformOverview() {
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
    const [companies,members,subscriptionsTotal,activeSubscribers,trialCompanies,pastDueSubscriptions,cancelledSubscriptions,transactions,ticketTotal,openTickets,newFeedback,totalFeedback,recentPayments] = await Promise.all([
      this.supabase.from("companies").select("id",{count:"exact",head:true}),
      this.supabase.from("company_members").select("user_id",{count:"exact",head:true}).eq("status","ACTIVE"),
      this.supabase.from("company_subscriptions").select("id",{count:"exact",head:true}),
      this.supabase.from("company_subscriptions").select("id",{count:"exact",head:true}).eq("status","ACTIVE"),
      this.supabase.from("company_subscriptions").select("id",{count:"exact",head:true}).eq("status","TRIAL"),
      this.supabase.from("company_subscriptions").select("id",{count:"exact",head:true}).eq("status","PAST_DUE"),
      this.supabase.from("company_subscriptions").select("id",{count:"exact",head:true}).eq("status","CANCELLED"),
      this.supabase.from("billing_transactions").select("amount,currency,status,paid_at",{count:"exact"}).eq("status","SUCCESS").gte("paid_at",monthStart.toISOString()).order("paid_at",{ascending:true}).range(0,999),
      this.supabase.from("support_tickets").select("id",{count:"exact",head:true}),
      this.supabase.from("support_tickets").select("id",{count:"exact",head:true}).in("status",["OPEN","IN_PROGRESS","WAITING_FOR_USER"]),
      this.supabase.from("company_feedback").select("id",{count:"exact",head:true}).eq("status","NEW"),
      this.supabase.from("company_feedback").select("id",{count:"exact",head:true}),
      this.supabase.from("billing_transactions").select("id,company_id,amount,currency,status,provider,reference,paid_at,created_at,companies(id,name)").order("created_at",{ascending:false}).limit(20)
    ]);
    for (const result of [companies,members,subscriptionsTotal,activeSubscribers,trialCompanies,pastDueSubscriptions,cancelledSubscriptions,transactions,ticketTotal,openTickets,newFeedback,totalFeedback,recentPayments]) if(result.error) throw result.error;
    const paymentRows=[...(transactions.data||[])];
    // PostgREST may cap a page at 1,000 rows; page through the rest so monthly revenue is not silently truncated.
    for(let from=1000;from<(transactions.count||0);from+=1000){const {data,error}=await this.supabase.from("billing_transactions").select("amount,currency,status,paid_at").eq("status","SUCCESS").gte("paid_at",monthStart.toISOString()).order("paid_at",{ascending:true}).range(from,from+999);if(error)throw error;paymentRows.push(...(data||[]));}
    const byCurrency={};for(const tx of paymentRows){const currency=String(tx.currency||"NGN").toUpperCase();byCurrency[currency]=(byCurrency[currency]||0)+Number(tx.amount||0);}
    return {generatedAt:new Date().toISOString(),monthStart:monthStart.toISOString(),companiesTotal:companies.count||0,activeMembers:members.count||0,subscriptionsTotal:subscriptionsTotal.count||0,activeSubscribers:activeSubscribers.count||0,trialCompanies:trialCompanies.count||0,pastDueSubscriptions:pastDueSubscriptions.count||0,cancelledSubscriptions:cancelledSubscriptions.count||0,monthlyRevenueByCurrency:byCurrency,monthlySuccessfulPayments:transactions.count||0,openSupportTickets:openTickets.count||0,totalSupportTickets:ticketTotal.count||0,newFeedback:newFeedback.count||0,totalFeedback:totalFeedback.count||0,recentPayments:recentPayments.data||[]};
  }

  async adminPayments({page=1,pageSize=50,status,search}) {
    const from=(page-1)*pageSize,to=from+pageSize-1;
    let q=this.supabase.from("billing_transactions").select("*,companies(id,name),subscription_plans(code,name)",{count:"exact"}).order("created_at",{ascending:false}).range(from,to);
    if(status)q=q.eq("status",status);
    if(search)q=q.ilike("reference",`%${search}%`);
    const {data,count,error}=await q;if(error)throw error;
    return {items:data||[],page,pageSize,total:count||0,totalPages:Math.ceil((count||0)/pageSize)};
  }

  async companies({ page=1,pageSize=50,search,status }) {
    const from=(page-1)*pageSize,to=from+pageSize-1;
    let q=this.supabase.from("companies").select("id,name,legal_name,email,phone,industry,created_by,country_code,billing_country,tax_country,currency_code,locale,timezone,unit_system,created_at,updated_at",{count:"exact"}).order("created_at",{ascending:false}).range(from,to);
    if(search)q=q.ilike("name",`%${search}%`);
    const {data,count,error}=await q;if(error)throw error;
    return {items:data||[],page,pageSize,total:count||0,totalPages:Math.ceil((count||0)/pageSize)};
  }

  async subscriptions({ page=1,pageSize=50,status }) {
    const from=(page-1)*pageSize,to=from+pageSize-1;
    let q=this.supabase.from("company_subscriptions").select("*,companies(id,name,country_code,billing_country,currency_code),subscription_plans(code,name)",{count:"exact"}).order("updated_at",{ascending:false}).range(from,to);
    if(status)q=q.eq("status",status);
    const {data,count,error}=await q;if(error)throw error;
    return {items:data||[],page,pageSize,total:count||0,totalPages:Math.ceil((count||0)/pageSize)};
  }

  async plans() {
    const {data,error}=await this.supabase.from("subscription_plans").select("*").order("monthly_amount");
    if(error)throw error;return data||[];
  }

  async updatePlan({planId,input}) {
    const allowed={name:"name",description:"description",maxUsers:"max_users",maxProjects:"max_projects",maxStorageMb:"max_storage_mb",active:"active"};
    const patch={};for(const[k,c]of Object.entries(allowed))if(input[k]!==undefined)patch[c]=input[k];
    const {data,error}=await this.supabase.from("subscription_plans").update(patch).eq("id",planId).select().maybeSingle();
    if(error)throw error;if(!data){const e=new Error("Plan not found");e.code="PLAN_NOT_FOUND";e.status=404;throw e;}return data;
  }

  async updatePrice({planId,countryCode,input}) {
    const {data,error}=await this.supabase.from("subscription_plan_prices").upsert({
      plan_id:planId,country_code:countryCode.toUpperCase(),currency_code:input.currencyCode.toUpperCase(),
      monthly_amount:input.monthlyAmount,yearly_amount:input.yearlyAmount,active:input.active!==false,
      updated_at:new Date().toISOString()
    },{onConflict:"plan_id,country_code,currency_code"}).select().single();
    if(error)throw error;return data;
  }

  async routes() {
    const {data,error}=await this.supabase.from("payment_provider_routes").select("*").order("country_code").order("priority");
    if(error)throw error;return data||[];
  }

  async updateRoute({routeId,input}) {
    const patch={};if(input.priority!==undefined)patch.priority=input.priority;if(input.active!==undefined)patch.active=input.active;
    const {data,error}=await this.supabase.from("payment_provider_routes").update(patch).eq("id",routeId).select().maybeSingle();
    if(error)throw error;if(!data){const e=new Error("Payment route not found");e.code="PAYMENT_ROUTE_NOT_FOUND";e.status=404;throw e;}return data;
  }

  async setSubscriptionStatus({companyId,status,reason}) {
    const patch={status,updated_at:new Date().toISOString()};
    if(status==="CANCELLED"){patch.cancelled_at=new Date().toISOString();patch.cancellation_reason=reason||"Platform administrator action";}
    const {data,error}=await this.supabase.from("company_subscriptions").update(patch).eq("company_id",companyId).select().maybeSingle();
    if(error)throw error;if(!data){const e=new Error("Company subscription not found");e.code="SUBSCRIPTION_NOT_FOUND";e.status=404;throw e;}return data;
  }
}
