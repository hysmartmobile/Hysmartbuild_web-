import { ROLES } from "../rbac.js";

export class RbacService {
  constructor({ supabase }) { this.supabase = supabase; }

  async getMembership({ userId, companyId }) {
    const { data, error } = await this.supabase
      .from("company_members")
      .select("company_id,user_id,role,status")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getPermissionsForRole(role) {
    const { data, error } = await this.supabase
      .from("role_permissions")
      .select("permission_key")
      .eq("role", role);
    if (error) throw error;
    return (data ?? []).map((row) => row.permission_key);
  }

  async getSubscriptionStatus({ companyId }) {
    const { data, error } = await this.supabase.from("company_subscriptions").select("status,trial_ends_at,current_period_end,grace_period_ends_at,cancel_at_period_end").eq("company_id", companyId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async getAuthorization({ userId, companyId }) {
    const membership = await this.getMembership({ userId, companyId });
    if (!membership) return null;
    const permissions = await this.getPermissionsForRole(membership.role);
    return { ...membership, permissions };
  }

  async listRoles() {
    const { data, error } = await this.supabase
      .from("role_permissions")
      .select("role,permission_key")
      .order("role");
    if (error) throw error;
    return ROLES.map((role) => ({
      role,
      permissions: (data ?? []).filter((row) => row.role === role).map((row) => row.permission_key)
    }));
  }

  async updateMemberRole({ actorUserId, companyId, targetUserId, role }) {
    const actor = await this.getMembership({ userId: actorUserId, companyId });
    if (!actor) {
      const error = new Error("Company access denied");
      error.code = "COMPANY_ACCESS_DENIED";
      error.status = 403;
      throw error;
    }

    if (!["COMPANY_OWNER", "COMPANY_ADMIN"].includes(actor.role)) {
      const error = new Error("You do not have permission to manage company roles");
      error.code = "FORBIDDEN";
      error.status = 403;
      throw error;
    }

    if (role === "SUPER_ADMIN") {
      const error = new Error("SUPER_ADMIN cannot be assigned from a company role-management flow");
      error.code = "ROLE_ASSIGNMENT_FORBIDDEN";
      error.status = 403;
      throw error;
    }

    if (actor.role === "COMPANY_ADMIN" && role === "COMPANY_OWNER") {
      const error = new Error("Company admins cannot assign the owner role");
      error.code = "ROLE_ASSIGNMENT_FORBIDDEN";
      error.status = 403;
      throw error;
    }

    if (actorUserId === targetUserId && role !== actor.role) {
      const error = new Error("You cannot change your own role");
      error.code = "SELF_ROLE_CHANGE_FORBIDDEN";
      error.status = 403;
      throw error;
    }

    const { data: target, error: targetError } = await this.supabase
      .from("company_members")
      .select("id,company_id,user_id,role,status")
      .eq("company_id", companyId)
      .eq("user_id", targetUserId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) {
      const error = new Error("Target member not found");
      error.code = "MEMBER_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    if (target.role === "COMPANY_OWNER" && role !== "COMPANY_OWNER") {
      const { count, error: countError } = await this.supabase
        .from("company_members")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("role", "COMPANY_OWNER")
        .eq("status", "ACTIVE");
      if (countError) throw countError;
      if ((count ?? 0) <= 1) {
        const error = new Error("The company must retain at least one active owner");
        error.code = "LAST_OWNER_PROTECTED";
        error.status = 409;
        throw error;
      }
    }

    const { data, error } = await this.supabase
      .from("company_members")
      .update({ role })
      .eq("company_id", companyId)
      .eq("user_id", targetUserId)
      .eq("status", "ACTIVE")
      .select("company_id,user_id,role,status,updated_at")
      .single();
    if (error) throw error;
    return data;
  }
}
