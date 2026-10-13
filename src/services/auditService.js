export class AuditService {
  constructor({ supabase }) { this.supabase = supabase; }

  async list({ companyId, page = 1, pageSize = 50, action, entityType, actorUserId }) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let q = this.supabase
      .from("audit_logs")
      .select("id,company_id,actor_user_id,action,entity_type,entity_id,metadata,ip_address,user_agent,created_at", { count: "exact" })
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (action) q = q.ilike("action", `%${action}%`);
    if (entityType) q = q.eq("entity_type", entityType);
    if (actorUserId) q = q.eq("actor_user_id", actorUserId);
    const { data, count, error } = await q;
    if (error) throw error;
    return { items: data ?? [], page, pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) };
  }
}
