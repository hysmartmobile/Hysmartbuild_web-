import { randomUUID } from "node:crypto";

const clean = (v) => typeof v === "string" ? v.trim() : v;

export class SupplierService {
  constructor({ supabase }) { this.supabase = supabase; }

  async list({ companyId, page = 1, pageSize = 50, search, status }) {
    const from = (page - 1) * pageSize, to = from + pageSize - 1;
    let q = this.supabase.from("suppliers")
      .select("id,company_id,name,contact_name,email,phone,address,tax_id,status,notes,created_by,created_at,updated_at", { count: "exact" })
      .eq("company_id", companyId).order("name").range(from, to);
    if (status) q = q.eq("status", status);
    if (search) q = q.or(`name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    const { data, count, error } = await q;
    if (error) throw error;
    return { items: data ?? [], page, pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) };
  }

  async create({ companyId, userId, input }) {
    const { data, error } = await this.supabase.from("suppliers").insert({
      id: randomUUID(), company_id: companyId, created_by: userId,
      name: clean(input.name), contact_name: clean(input.contactName) || null,
      email: clean(input.email) || null, phone: clean(input.phone) || null,
      address: clean(input.address) || null, tax_id: clean(input.taxId) || null,
      status: input.status || "ACTIVE", notes: clean(input.notes) || null
    }).select().single();
    if (error) throw error;
    return data;
  }

  async update({ companyId, supplierId, input }) {
    const map = { name:"name", contactName:"contact_name", email:"email", phone:"phone", address:"address", taxId:"tax_id", status:"status", notes:"notes" };
    const patch = {};
    for (const [key, col] of Object.entries(map)) if (input[key] !== undefined) patch[col] = typeof input[key] === "string" ? clean(input[key]) || null : input[key];
    const { data, error } = await this.supabase.from("suppliers").update(patch)
      .eq("company_id", companyId).eq("id", supplierId).select().maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Supplier not found"); e.code="SUPPLIER_NOT_FOUND"; e.status=404; throw e; }
    return data;
  }

  async remove({ companyId, supplierId }) {
    const { data, error } = await this.supabase.from("suppliers").update({ status:"INACTIVE" })
      .eq("company_id", companyId).eq("id", supplierId).select().maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Supplier not found"); e.code="SUPPLIER_NOT_FOUND"; e.status=404; throw e; }
    return data;
  }
}
