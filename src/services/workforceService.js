import { randomUUID } from "node:crypto";

const clean = (v) => typeof v === "string" ? v.trim() : v;

export class WorkforceService {
  constructor({ supabase }) { this.supabase = supabase; }

  async assertWorker({ companyId, workerId }) {
    const { data, error } = await this.supabase.from("workers").select("id,company_id,full_name,employee_code,status").eq("company_id", companyId).eq("id", workerId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Worker not found"); e.code = "WORKER_NOT_FOUND"; e.status = 404; throw e; }
    return data;
  }

  async assertProject({ companyId, projectId }) {
    if (!projectId) return null;
    const { data, error } = await this.supabase.from("projects").select("id,company_id,name").eq("company_id", companyId).eq("id", projectId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Project not found"); e.code = "PROJECT_NOT_FOUND"; e.status = 404; throw e; }
    return data;
  }

  async assertSite({ companyId, siteId }) {
    const { data, error } = await this.supabase.from("sites").select("id,company_id,project_id,name,status,latitude,longitude").eq("company_id", companyId).eq("id", siteId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Site not found"); e.code = "SITE_NOT_FOUND"; e.status = 404; throw e; }
    return data;
  }

  async listWorkers({ companyId, search, status, page = 1, pageSize = 50 }) {
    const from = (page - 1) * pageSize, to = from + pageSize - 1;
    let q = this.supabase.from("workers").select("id,company_id,user_id,employee_code,full_name,phone,trade,job_title,hire_date,status,created_at,updated_at", { count: "exact" }).eq("company_id", companyId).order("full_name").range(from, to);
    if (status) q = q.eq("status", status);
    if (search) q = q.or(`full_name.ilike.%${search}%,employee_code.ilike.%${search}%,trade.ilike.%${search}%,job_title.ilike.%${search}%`);
    const { data, count, error } = await q;
    if (error) throw error;
    return { items: data ?? [], page, pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) };
  }

  async assertCompanyUser({ companyId, userId }) {
    if (!userId) return;
    const { data, error } = await this.supabase.from("company_members").select("user_id").eq("company_id", companyId).eq("user_id", userId).eq("status", "ACTIVE").maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Linked user is not an active company member"); e.code = "USER_COMPANY_MISMATCH"; e.status = 400; throw e; }
  }

  async createWorker({ companyId, userId, input }) {
    await this.assertCompanyUser({ companyId, userId: input.userId });
    const row = { id: randomUUID(), company_id: companyId, user_id: input.userId || null, employee_code: clean(input.employeeCode), full_name: clean(input.fullName), phone: clean(input.phone) || null, trade: clean(input.trade) || null, job_title: clean(input.jobTitle) || null, hire_date: input.hireDate || null, status: input.status || "ACTIVE", created_by: userId };
    const { data, error } = await this.supabase.from("workers").insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async updateWorker({ companyId, workerId, input }) {
    await this.assertWorker({ companyId, workerId });
    if (input.userId !== undefined) await this.assertCompanyUser({ companyId, userId: input.userId });
    const map = { userId: "user_id", employeeCode: "employee_code", fullName: "full_name", phone: "phone", trade: "trade", jobTitle: "job_title", hireDate: "hire_date", status: "status" };
    const patch = {};
    for (const [key, column] of Object.entries(map)) if (input[key] !== undefined) patch[column] = typeof input[key] === "string" ? clean(input[key]) || null : input[key];
    const { data, error } = await this.supabase.from("workers").update(patch).eq("company_id", companyId).eq("id", workerId).select().single();
    if (error) throw error;
    return data;
  }

  async deleteWorker({ companyId, workerId }) {
    const { data, error } = await this.supabase.from("workers").update({ status:"INACTIVE" })
      .eq("company_id",companyId).eq("id",workerId).select().maybeSingle();
    if(error)throw error;
    if(!data){const e=new Error("Worker not found");e.code="WORKER_NOT_FOUND";e.status=404;throw e;}
    return data;
  }

  async assignWorker({ companyId, userId, workerId, input }) {
    await this.assertWorker({ companyId, workerId });
    if (input.projectId) await this.assertProject({ companyId, projectId: input.projectId });
    if (input.siteId) {
      const site = await this.assertSite({ companyId, siteId: input.siteId });
      if (input.projectId && site.project_id && site.project_id !== input.projectId) { const e = new Error("Site does not belong to the selected project"); e.code = "SITE_PROJECT_MISMATCH"; e.status = 400; throw e; }
    }
    const row = { id: randomUUID(), company_id: companyId, worker_id: workerId, project_id: input.projectId || null, site_id: input.siteId || null, assignment_role: clean(input.assignmentRole) || null, start_date: input.startDate, end_date: input.endDate || null, status: "ACTIVE", created_by: userId };
    const { data, error } = await this.supabase.from("worker_assignments").insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async listAssignments({ companyId, workerId, projectId, siteId, status = "ACTIVE" }) {
    let q = this.supabase.from("worker_assignments").select("id,company_id,worker_id,project_id,site_id,assignment_role,start_date,end_date,status,created_at").eq("company_id", companyId).order("start_date", { ascending: false });
    if (workerId) q = q.eq("worker_id", workerId); if (projectId) q = q.eq("project_id", projectId); if (siteId) q = q.eq("site_id", siteId); if (status) q = q.eq("status", status);
    const { data, error } = await q; if (error) throw error; return data ?? [];
  }

  async endAssignment({ companyId, assignmentId }) {
    const { data, error } = await this.supabase.from("worker_assignments").update({ status: "ENDED", end_date: new Date().toISOString().slice(0, 10) }).eq("company_id", companyId).eq("id", assignmentId).eq("status", "ACTIVE").select().maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Active assignment not found"); e.code = "ASSIGNMENT_NOT_FOUND"; e.status = 404; throw e; }
    return data;
  }

  async listAttendance({ companyId, fromDate, toDate, workerId, projectId, siteId, status, page = 1, pageSize = 50 }) {
    const from = (page - 1) * pageSize, to = from + pageSize - 1;
    // Do not embed workers/sites here. Attendance has both direct FKs and
    // tenant-safe composite FKs, and PostgREST can reject an embed when an
    // existing database exposes more than one relationship. Keep the query
    // deterministic by fetching the paged attendance rows first, then hydrate
    // the two small lookup sets with explicit company-scoped queries.
    let q = this.supabase.from("attendance_records").select("id,company_id,worker_id,project_id,site_id,attendance_date,status,check_in_at,check_out_at,notes,location_latitude,location_longitude,location_accuracy_m,location_verified,recorded_by,created_at,updated_at", { count: "exact" }).eq("company_id", companyId).order("attendance_date", { ascending: false }).order("created_at", { ascending: false }).range(from, to);
    if (fromDate) q = q.gte("attendance_date", fromDate); if (toDate) q = q.lte("attendance_date", toDate); if (workerId) q = q.eq("worker_id", workerId); if (projectId) q = q.eq("project_id", projectId); if (siteId) q = q.eq("site_id", siteId); if (status) q = q.eq("status", status);
    const { data, count, error } = await q; if (error) throw error;
    const items = data ?? [];
    const workerIds = [...new Set(items.map((x) => x.worker_id).filter(Boolean))];
    const siteIds = [...new Set(items.map((x) => x.site_id).filter(Boolean))];
    const [workersResult, sitesResult] = await Promise.all([
      workerIds.length ? this.supabase.from("workers").select("id,full_name,employee_code,trade").eq("company_id", companyId).in("id", workerIds) : Promise.resolve({ data: [], error: null }),
      siteIds.length ? this.supabase.from("sites").select("id,name").eq("company_id", companyId).in("id", siteIds) : Promise.resolve({ data: [], error: null })
    ]);
    if (workersResult.error) throw workersResult.error;
    if (sitesResult.error) throw sitesResult.error;
    const workers = new Map((workersResult.data ?? []).map((x) => [x.id, x]));
    const sites = new Map((sitesResult.data ?? []).map((x) => [x.id, x]));
    return { items: items.map((x) => ({ ...x, workers: workers.get(x.worker_id) ?? null, sites: sites.get(x.site_id) ?? null })), page, pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) };
  }

  async recordAttendance({ companyId, userId, input }) {
    await this.assertWorker({ companyId, workerId: input.workerId });
    const site = await this.assertSite({ companyId, siteId: input.siteId });
    if (input.projectId) {
      const project = await this.assertProject({ companyId, projectId: input.projectId });
      if (site.project_id && site.project_id !== project.id) { const e = new Error("Site does not belong to the selected project"); e.code = "SITE_PROJECT_MISMATCH"; e.status = 400; throw e; }
    }
    const location = this.verifyLocation({ site, latitude: input.locationLatitude, longitude: input.locationLongitude, accuracyM: input.locationAccuracyM });
    const row = { id: input.id || randomUUID(), company_id: companyId, worker_id: input.workerId, project_id: input.projectId || site.project_id || null, site_id: input.siteId, attendance_date: input.attendanceDate, status: input.status, check_in_at: input.checkInAt || null, check_out_at: input.checkOutAt || null, notes: clean(input.notes) || null, location_latitude: input.locationLatitude ?? null, location_longitude: input.locationLongitude ?? null, location_accuracy_m: input.locationAccuracyM ?? null, location_verified: location.verified, recorded_by: userId };
    const { data, error } = await this.supabase.from("attendance_records").insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async updateAttendance({ companyId, attendanceId, input }) {
    const map = { status: "status", checkInAt: "check_in_at", checkOutAt: "check_out_at", notes: "notes", projectId: "project_id", siteId: "site_id", locationLatitude: "location_latitude", locationLongitude: "location_longitude", locationAccuracyM: "location_accuracy_m" };
    const patch = {};
    for (const [key, column] of Object.entries(map)) if (input[key] !== undefined) patch[column] = typeof input[key] === "string" ? clean(input[key]) || null : input[key];
    if (input.siteId) await this.assertSite({ companyId, siteId: input.siteId });
    if (input.projectId) await this.assertProject({ companyId, projectId: input.projectId });
    const { data, error } = await this.supabase.from("attendance_records").update(patch).eq("company_id", companyId).eq("id", attendanceId).select().single();
    if (error) throw error;
    return data;
  }

  verifyLocation({ site, latitude, longitude, accuracyM }) {
    if (latitude == null || longitude == null || site.latitude == null || site.longitude == null) return { verified: false, distanceM: null };
    if (accuracyM != null && accuracyM > 200) return { verified: false, distanceM: null, reason: "GPS accuracy is too low" };
    const toRad = (v) => v * Math.PI / 180; const R = 6371000;
    const dLat = toRad(Number(latitude) - Number(site.latitude)); const dLon = toRad(Number(longitude) - Number(site.longitude));
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(Number(site.latitude))) * Math.cos(toRad(Number(latitude))) * Math.sin(dLon/2)**2;
    const distanceM = 2 * R * Math.asin(Math.sqrt(a));
    return { verified: distanceM <= 500, distanceM };
  }

  async summary({ companyId, fromDate, toDate, projectId, siteId }) {
    const result = await this.listAttendance({ companyId, fromDate, toDate, projectId, siteId, page: 1, pageSize: 1000 });
    const summary = { total: result.total, present: 0, absent: 0, late: 0, onLeave: 0, workers: new Set() };
    for (const row of result.items) { summary.workers.add(row.worker_id); if (row.status === "PRESENT") summary.present++; else if (row.status === "ABSENT") summary.absent++; else if (row.status === "LATE") summary.late++; else if (row.status === "ON_LEAVE") summary.onLeave++; }
    return { totalRecords: summary.total, uniqueWorkers: summary.workers.size, present: summary.present, absent: summary.absent, late: summary.late, onLeave: summary.onLeave };
  }
}
