import { randomUUID, createHash } from "node:crypto";

export class CompanyService {
  constructor({ supabase, webAppUrl = "http://localhost:5173" }) { this.supabase = supabase; this.webAppUrl = webAppUrl; }

  async createCompany({ userId, name, legalName, phone, email, industry, countryCode, currencyCode, timezone, locale, billingCountryCode, taxCountryCode, unitSystem }) {
    const { data: ownedCompany, error: ownedError } = await this.supabase
      .from("companies").select("id,name").eq("created_by", userId).maybeSingle();
    if (ownedError) throw ownedError;
    if (ownedCompany) {
      const e = new Error("You can create only one company. You can join additional companies by invitation.");
      e.code = "COMPANY_CREATION_LIMIT_REACHED"; e.status = 409; throw e;
    }

    const normalizedCountry = String(countryCode || "").toUpperCase();
    if (!normalizedCountry) {
      const e = new Error("Company country is required");
      e.code = "COMPANY_COUNTRY_REQUIRED"; e.status = 400; throw e;
    }

    const { data: country, error: countryError } = await this.supabase
      .from("billing_countries")
      .select("country_code,currency_code,locale,timezone,unit_system,active")
      .eq("country_code", normalizedCountry)
      .maybeSingle();
    if (countryError) throw countryError;
    if (!country || !country.active) {
      const e = new Error("The selected company country is not supported");
      e.code = "COUNTRY_NOT_SUPPORTED"; e.status = 400; throw e;
    }

    const billingCountry = String(billingCountryCode || normalizedCountry).toUpperCase();
    const taxCountry = String(taxCountryCode || normalizedCountry).toUpperCase();

    const { data: billingCatalog, error: billingError } = await this.supabase
      .from("billing_countries")
      .select("country_code,currency_code,locale,timezone,unit_system,active")
      .eq("country_code", billingCountry)
      .maybeSingle();
    if (billingError) throw billingError;
    if (!billingCatalog || !billingCatalog.active) {
      const e = new Error("The selected billing country is not supported");
      e.code = "BILLING_COUNTRY_NOT_SUPPORTED"; e.status = 400; throw e;
    }

    const { data: taxCatalog, error: taxError } = await this.supabase
      .from("billing_countries")
      .select("country_code,active")
      .eq("country_code", taxCountry)
      .maybeSingle();
    if (taxError) throw taxError;
    if (!taxCatalog || !taxCatalog.active) {
      const e = new Error("The selected tax country is not supported");
      e.code = "TAX_COUNTRY_NOT_SUPPORTED"; e.status = 400; throw e;
    }

    // Country is authoritative for default currency/locale/timezone/unit system.
    // Explicit currency is accepted only when a matching active price exists for
    // the billing country, preventing arbitrary client-selected currencies.
    const resolvedCurrency = String(currencyCode || billingCatalog.currency_code).toUpperCase();
    if (resolvedCurrency !== billingCatalog.currency_code) {
      const { data: price, error: priceError } = await this.supabase
        .from("subscription_plan_prices")
        .select("id")
        .eq("country_code", billingCountry)
        .eq("currency_code", resolvedCurrency)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (priceError) throw priceError;
      if (!price) {
        const e = new Error("The selected currency is not configured for the billing country");
        e.code = "CURRENCY_NOT_CONFIGURED"; e.status = 400; throw e;
      }
    }

    const { data: company, error: companyError } = await this.supabase
      .from("companies")
      .insert({
        id: randomUUID(),
        name: name.trim(),
        legal_name: legalName?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        industry: industry?.trim() || null,
        created_by: userId,
        country_code: normalizedCountry,
        currency_code: resolvedCurrency,
        timezone: timezone || billingCatalog.timezone,
        locale: locale || billingCatalog.locale,
        billing_country: billingCountry,
        tax_country: taxCountry,
        unit_system: unitSystem || billingCatalog.unit_system || country.unit_system || "METRIC"
      })
      .select("id,name,legal_name,phone,email,industry,created_at,country_code,currency_code,timezone,locale,billing_country,tax_country,unit_system")
      .single();
    if (companyError) throw companyError;

    const { error: membershipError } = await this.supabase
      .from("company_members")
      .insert({ company_id: company.id, user_id: userId, role: "COMPANY_OWNER", status: "ACTIVE" });
    if (membershipError) {
      await this.supabase.from("companies").delete().eq("id", company.id);
      throw membershipError;
    }
    return company;
  }

  async createInvitation({ companyId, invitedBy, email, role, expiresInDays=7 }) {
    const normalizedEmail = email.trim().toLowerCase();
    const { error: limitError } = await this.supabase.rpc("enforce_company_limit", { p_company_id: companyId, p_resource: "users", p_increment: 0 });
    if (limitError) {
      if (String(limitError.message || "").includes("SUBSCRIPTION_LIMIT_EXCEEDED")) {
        const e = new Error("User limit for the active subscription has been reached"); e.code="SUBSCRIPTION_LIMIT_EXCEEDED"; e.status=402; throw e;
      }
      throw limitError;
    }

    const { data: company, error: companyError } = await this.supabase
      .from("companies").select("id,name").eq("id", companyId).maybeSingle();
    if (companyError) throw companyError;
    if (!company) { const e = new Error("Company not found"); e.code = "COMPANY_NOT_FOUND"; e.status = 404; throw e; }

    // Only one live invitation per email/company. Re-inviting invalidates the old token.
    await this.supabase.from("company_invitations")
      .update({ status: "REVOKED", updated_at: new Date().toISOString() })
      .eq("company_id", companyId).eq("status", "PENDING").ilike("email", normalizedEmail);

    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now()+Math.max(1,Math.min(30,expiresInDays))*86400000).toISOString();
    const {data,error}=await this.supabase.from('company_invitations').insert({
      company_id:companyId,email:normalizedEmail,role,token_hash:tokenHash,expires_at:expiresAt,invited_by:invitedBy,status:'PENDING'
    }).select('id,company_id,email,role,expires_at,status,created_at').single();
    if(error)throw error;

    // The raw token is returned exactly once so the owner can copy and share the link
    // through any channel they choose (email, WhatsApp, SMS, Telegram, etc.). The DB
    // stores only the SHA-256 hash, so possession of the database never reveals the link.
    const inviteUrl = `${this.webAppUrl}/invitations/accept?token=${encodeURIComponent(token)}`;
    return { ...data, inviteUrl, expiresInDays: Math.max(1,Math.min(30,expiresInDays)) };
  }

  async revokeInvitation({companyId, invitationId, actorUserId, reason}) {
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 3) { const e=new Error('A reason is required when revoking an invitation'); e.code='INVITATION_REVOCATION_REASON_REQUIRED'; e.status=400; throw e; }
    const { data: invite, error: findError } = await this.supabase.from('company_invitations').select('id,company_id,email,status').eq('company_id',companyId).eq('id',invitationId).maybeSingle();
    if (findError) throw findError;
    if (!invite) { const e=new Error('Invitation not found'); e.code='INVITATION_NOT_FOUND'; e.status=404; throw e; }
    if (invite.status !== 'PENDING') { const e=new Error(`Only pending invitations can be revoked; current status is ${invite.status}`); e.code='INVITATION_NOT_PENDING'; e.status=409; throw e; }
    const now=new Date().toISOString();
    const {data,error}=await this.supabase.from('company_invitations').update({status:'REVOKED',revoked_by:actorUserId,revoked_at:now,revocation_reason:cleanReason,updated_at:now}).eq('company_id',companyId).eq('id',invitationId).eq('status','PENDING').select('id,email,status,revoked_by,revoked_at,revocation_reason').single();
    if(error) throw error;
    const {error:auditError}=await this.supabase.from('company_access_lifecycle_events').insert({company_id:companyId,invitation_id:invitationId,action:'INVITATION_REVOKED',reason:cleanReason,actor_user_id:actorUserId});
    if(auditError) throw auditError;
    return data;
  }

  async updateMemberAccess({companyId,userId,actorUserId,action,reason}) {
    const cleanReason=String(reason||'').trim();
    if(cleanReason.length<3){const e=new Error(`A reason is required when ${action==='SUSPEND'?'suspending':'reactivating'} access`);e.code='MEMBER_ACCESS_REASON_REQUIRED';e.status=400;throw e;}
    if(userId===actorUserId && action==='SUSPEND'){const e=new Error('You cannot suspend your own company access');e.code='SELF_ACCESS_SUSPEND_FORBIDDEN';e.status=400;throw e;}
    const {data:member,error:findError}=await this.supabase.from('company_members').select('id,company_id,user_id,role,status').eq('company_id',companyId).eq('user_id',userId).maybeSingle();
    if(findError) throw findError;
    if(!member){const e=new Error('Company member not found');e.code='MEMBER_NOT_FOUND';e.status=404;throw e;}
    const isSuspend=action==='SUSPEND'; const targetStatus=isSuspend?'SUSPENDED':'ACTIVE';
    if(!isSuspend && member.status!=='SUSPENDED'){const e=new Error('Only suspended members can be reactivated');e.code='MEMBER_NOT_SUSPENDED';e.status=409;throw e;}
    if(isSuspend && member.status!=='ACTIVE'){const e=new Error(`Only active members can be suspended; current status is ${member.status}`);e.code='MEMBER_NOT_ACTIVE';e.status=409;throw e;}
    const now=new Date().toISOString();
    const patch=isSuspend?{status:targetStatus,access_suspended_by:actorUserId,access_suspended_at:now,access_suspension_reason:cleanReason,updated_at:now}:{status:targetStatus,access_suspended_by:null,access_suspended_at:null,access_suspension_reason:null,updated_at:now};
    const {data,error}=await this.supabase.from('company_members').update(patch).eq('company_id',companyId).eq('user_id',userId).select('id,company_id,user_id,role,status,access_suspended_by,access_suspended_at,access_suspension_reason').single();
    if(error) throw error;
    const {error:auditError}=await this.supabase.from('company_access_lifecycle_events').insert({company_id:companyId,target_user_id:userId,action:isSuspend?'MEMBER_SUSPENDED':'MEMBER_REACTIVATED',reason:cleanReason,actor_user_id:actorUserId});
    if(auditError) throw auditError;
    return data;
  }

  async listAccessLifecycleEvents({companyId, page=1, pageSize=25}) {
    const from=(page-1)*pageSize,to=from+pageSize-1;
    const {data,count,error}=await this.supabase.from('company_access_lifecycle_events').select('id,company_id,target_user_id,invitation_id,action,reason,actor_user_id,created_at',{count:'exact'}).eq('company_id',companyId).order('created_at',{ascending:false}).range(from,to);
    if(error) throw error; return {items:data||[],page,pageSize,total:count||0,totalPages:Math.ceil((count||0)/pageSize)};
  }

  async listInvitations({companyId,page=1,pageSize=50}) {
    const from=(page-1)*pageSize,to=from+pageSize-1;
    const {data,count,error}=await this.supabase.from('company_invitations').select('id,company_id,email,role,expires_at,status,invited_by,accepted_at,accepted_user_id,revoked_by,revoked_at,revocation_reason,created_at',{count:'exact'}).eq('company_id',companyId).order('created_at',{ascending:false}).range(from,to);
    if(error)throw error;return {items:data||[],page,pageSize,total:count||0,totalPages:Math.ceil((count||0)/pageSize)};
  }

  async previewInvitation({ token }) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const { data: invite, error } = await this.supabase.from('company_invitations')
      .select('id,company_id,email,role,expires_at,status,companies:company_id(id,name,industry)')
      .eq('token_hash', tokenHash).maybeSingle();
    if (error) throw error;
    if (!invite) {
      const e = new Error('Invitation is invalid, expired or already used'); e.code='INVITATION_INVALID'; e.status=400; throw e;
    }
    if (invite.status !== 'PENDING') {
      const statusMessages = { ACCEPTED: 'Invitation has already been used', REVOKED: 'Invitation has been revoked. Request a new invitation.', EXPIRED: 'Invitation has expired' };
      const e = new Error(statusMessages[invite.status] || 'Invitation is invalid, expired or already used');
      e.code = invite.status === 'EXPIRED' ? 'INVITATION_EXPIRED' : invite.status === 'ACCEPTED' ? 'INVITATION_ALREADY_USED' : 'INVITATION_REVOKED';
      e.status = 400;
      throw e;
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      await this.supabase.from('company_invitations').update({status:'EXPIRED',updated_at:new Date().toISOString()}).eq('id',invite.id);
      const e = new Error('Invitation has expired'); e.code='INVITATION_EXPIRED'; e.status=400; throw e;
    }
    return { id: invite.id, companyId: invite.company_id, companyName: invite.companies?.name || 'Company', industry: invite.companies?.industry || null, email: invite.email, role: invite.role, expiresAt: invite.expires_at };
  }

  async acceptInvitation({userId,email,token,fullName}) {
    const normalizedFullName=String(fullName||"").trim().replace(/\s+/g," ");
    if(normalizedFullName.length<2||normalizedFullName.length>120){const e=new Error("A valid full name is required to accept an invitation");e.code="PROFILE_FULL_NAME_REQUIRED";e.status=400;throw e;}
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const { data: accepted, error } = await this.supabase.rpc('accept_company_invitation', { p_token_hash: tokenHash, p_user_id: userId, p_email: String(email || '').trim().toLowerCase() });
    if (error) {
      const message = String(error.message || 'Invitation could not be accepted');
      const map = { INVITATION_INVALID: ['INVITATION_INVALID',400], INVITATION_EXPIRED:['INVITATION_EXPIRED',400], INVITATION_EMAIL_MISMATCH:['INVITATION_EMAIL_MISMATCH',403], ALREADY_COMPANY_MEMBER:['ALREADY_COMPANY_MEMBER',409] };
      const match = Object.keys(map).find((key) => message.includes(key));
      const e = new Error(match ? (match === 'INVITATION_EMAIL_MISMATCH' ? 'Invitation email does not match the authenticated account' : match === 'ALREADY_COMPANY_MEMBER' ? 'You are already a member of this company' : match === 'INVITATION_EXPIRED' ? 'Invitation has expired' : 'Invitation is invalid, expired or already used') : message);
      e.code = match || 'INVITATION_ACCEPT_FAILED'; e.status = match ? map[match][1] : 400; throw e;
    }
    const row = Array.isArray(accepted) ? accepted[0] : accepted;
    // Every accepted company member must have a durable profile name. Keep Auth metadata
    // in sync as a fallback for UI surfaces that read the authenticated user object.
    const { error: profileError } = await this.supabase.from("profiles").upsert({ id:userId, full_name:normalizedFullName, updated_at:new Date().toISOString() }, { onConflict:"id" });
    if (profileError) throw profileError;
    if (this.supabase.auth?.admin?.updateUserById) {
      const { error: metadataError } = await this.supabase.auth.admin.updateUserById(userId, { user_metadata:{ full_name:normalizedFullName } });
      if (metadataError) throw metadataError;
    }
    if (row?.id) {
      const { data: invite } = await this.supabase.from('company_invitations').select('network_type,network_project_id').eq('id',row.id).maybeSingle();
      if (invite?.network_type && invite?.network_project_id) {
        const { error: networkError } = await this.supabase.from('construction_network_participants').upsert({
          company_id: row.company_id, project_id: invite.network_project_id, user_id: userId, network_type: invite.network_type, status: 'ACTIVE'
        }, { onConflict: 'company_id,project_id,user_id' });
        if (networkError) throw networkError;
      }
    }
    return { id: row.id, company_id: row.company_id, email: row.email, role: row.role, status: row.status, accepted_at: row.accepted_at };
  }

  async listForUser(userId) {
    const { data, error } = await this.supabase
      .from("company_members")
      .select("role,status,companies:company_id(id,name,legal_name,phone,email,industry,created_at,country_code,currency_code,timezone,locale,billing_country,tax_country,unit_system)")
      .eq("user_id", userId)
      .eq("status", "ACTIVE");
    if (error) throw error;
    return data.map((row) => ({ ...row.companies, role: row.role, membershipStatus: row.status }));
  }

  async listMembers({ companyId, page = 1, pageSize = 50, search }) {
    const from = (page - 1) * pageSize; const to = from + pageSize - 1;
    let q = this.supabase.from("company_members").select("id,company_id,user_id,role,status,created_at,updated_at,profiles!company_members_user_profile_fk(id,full_name,phone,avatar_url)", { count: "exact" }).eq("company_id", companyId).order("created_at", { ascending: true }).range(from, to);
    if (search) q = q.ilike("profiles.full_name", `%${search}%`);
    const { data, count, error } = await q; if (error) throw error;
    return { items: data ?? [], page, pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) };
  }

  async updateCompany({ companyId, input }) {
    const current = await this.getCompanyIdentity(companyId);
    const nextCountry = String(input.countryCode || current.country_code || "").toUpperCase();
    const nextBillingCountry = String(input.billingCountryCode || current.billing_country || nextCountry).toUpperCase();
    const nextTaxCountry = String(input.taxCountryCode || current.tax_country || nextCountry).toUpperCase();

    for (const [label, code] of [["country",nextCountry],["billing country",nextBillingCountry],["tax country",nextTaxCountry]]) {
      const { data, error } = await this.supabase.from("billing_countries").select("country_code,active,currency_code,locale,timezone,unit_system").eq("country_code",code).maybeSingle();
      if(error)throw error;
      if(!data || !data.active){const e=new Error(`Unsupported ${label}`);e.code="COUNTRY_NOT_SUPPORTED";e.status=400;throw e;}
    }

    const billingCatalog = await this.supabase.from("billing_countries").select("currency_code,locale,timezone,unit_system").eq("country_code",nextBillingCountry).single();
    if(billingCatalog.error)throw billingCatalog.error;
    const patch = {};
    const map = { name:"name", legalName:"legal_name", phone:"phone", email:"email", industry:"industry", countryCode:"country_code", currencyCode:"currency_code", timezone:"timezone", locale:"locale", billingCountryCode:"billing_country", taxCountryCode:"tax_country", unitSystem:"unit_system" };
    for (const [key,col] of Object.entries(map)) if (input[key] !== undefined) patch[col] = typeof input[key] === "string" ? input[key].trim() || null : input[key];
    if(input.currencyCode===undefined && input.billingCountryCode!==undefined) patch.currency_code=billingCatalog.data.currency_code;
    if(input.timezone===undefined && input.billingCountryCode!==undefined) patch.timezone=billingCatalog.data.timezone;
    if(input.locale===undefined && input.billingCountryCode!==undefined) patch.locale=billingCatalog.data.locale;
    if(input.unitSystem===undefined && input.billingCountryCode!==undefined) patch.unit_system=billingCatalog.data.unit_system;

    const { data, error } = await this.supabase.from("companies").update(patch).eq("id", companyId).select("id,name,legal_name,phone,email,industry,created_at,updated_at,country_code,currency_code,timezone,locale,billing_country,tax_country,unit_system").single();
    if (error) throw error; return data;
  }

  async getCompanyIdentity(companyId) {
    const { data, error } = await this.supabase.from("companies")
      .select("id,country_code,billing_country,tax_country,currency_code,locale,timezone,unit_system")
      .eq("id",companyId).single();
    if(error)throw error;return data;
  }

  async getMembership({ userId, companyId }) {
    const { data, error } = await this.supabase
      .from("company_members")
      .select("company_id,user_id,role,status,companies:company_id(id,name,legal_name,phone,email,industry,created_at,country_code,currency_code,timezone,locale,billing_country,tax_country,unit_system)")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}
