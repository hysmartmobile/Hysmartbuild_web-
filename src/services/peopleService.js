import { randomUUID } from "node:crypto";

const clean = (v) => typeof v === "string" ? v.trim() : v;

export class PeopleService {
  constructor({ supabase }) { this.supabase = supabase; }

  async assertMember({ companyId, userId }) {
    const { data, error } = await this.supabase.from("company_members").select("company_id,user_id,role,status").eq("company_id", companyId).eq("user_id", userId).eq("status", "ACTIVE").maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Active company member not found"); e.code = "MEMBER_NOT_FOUND"; e.status = 404; throw e; }
    return data;
  }
  async assertWorker({ companyId, workerId }) {
    const { data, error } = await this.supabase.from("workers").select("id,company_id,user_id,employee_code,full_name,phone,trade,job_title,hire_date,status").eq("company_id", companyId).eq("id", workerId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Worker not found"); e.code = "WORKER_NOT_FOUND"; e.status = 404; throw e; }
    return data;
  }
  async emailsByUserId(userIds) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length || !this.supabase.auth?.admin?.listUsers) return new Map();
    try {
      const result = await this.supabase.auth.admin.listUsers({ page: 1, perPage: Math.max(100, Math.min(1000, ids.length * 2)) });
      const users = result?.data?.users || [];
      return new Map(users.filter(u => ids.includes(u.id)).map(u => [u.id, u.email || null]));
    } catch { return new Map(); }
  }
  async basePeople({ companyId, search, status, projectId, page = 1, pageSize = 50, contactAllowed = false }) {
    const [membersResult, workersResult, profilesResult] = await Promise.all([
      this.supabase.from("company_members").select("company_id,user_id,role,status,created_at,updated_at").eq("company_id", companyId).eq("status", "ACTIVE").order("created_at"),
      this.supabase.from("workers").select("id,company_id,user_id,employee_code,full_name,phone,trade,job_title,hire_date,status,created_at,updated_at").eq("company_id", companyId).order("full_name"),
      this.supabase.from("company_people_profiles").select("id,company_id,user_id,worker_id,department,job_title,employee_code,supervisor_user_id,employment_status,joined_date,notes").eq("company_id", companyId)
    ]);
    if (membersResult.error) throw membersResult.error; if (workersResult.error) throw workersResult.error; if (profilesResult.error) throw profilesResult.error;
    const members = membersResult.data || [], workers = workersResult.data || [], profiles = profilesResult.data || [];
    const userIds = [...new Set(members.map(x => x.user_id).concat(workers.map(x => x.user_id).filter(Boolean)).concat(profiles.map(x => x.supervisor_user_id).filter(Boolean)))];
    const [profilesResult2, assignmentsResult, attendanceResult, projectMembersResult, projectsResult, sitesResult, emails] = await Promise.all([
      userIds.length ? this.supabase.from("profiles").select("id,full_name,phone,avatar_url").in("id", userIds) : Promise.resolve({ data: [], error: null }),
      this.supabase.from("worker_assignments").select("id,worker_id,project_id,site_id,assignment_role,start_date,end_date,status").eq("company_id", companyId).eq("status", "ACTIVE"),
      this.supabase.from("attendance_records").select("worker_id,project_id,site_id,attendance_date,status,check_in_at,check_out_at").eq("company_id", companyId).eq("attendance_date", new Date().toISOString().slice(0,10)),
      this.supabase.from("project_members").select("project_id,user_id,role,status").eq("company_id", companyId).eq("status", "ACTIVE"),
      this.supabase.from("projects").select("id,name,code,status").eq("company_id", companyId),
      this.supabase.from("sites").select("id,project_id,name,status").eq("company_id", companyId),
      this.emailsByUserId(userIds)
    ]);
    if (profilesResult2.error) throw profilesResult2.error; if (assignmentsResult.error) throw assignmentsResult.error; if (attendanceResult.error) throw attendanceResult.error; if (projectMembersResult.error) throw projectMembersResult.error; if (projectsResult.error) throw projectsResult.error; if (sitesResult.error) throw sitesResult.error;
    const pmap = new Map((profilesResult2.data || []).map(x => [x.id, x]));
    const metaByUser = new Map(profiles.filter(x => x.user_id).map(x => [x.user_id, x]));
    const metaByWorker = new Map(profiles.filter(x => x.worker_id).map(x => [x.worker_id, x]));
    const assignments = new Map(); for (const a of assignmentsResult.data || []) { const arr = assignments.get(a.worker_id) || []; arr.push(a); assignments.set(a.worker_id, arr); }
    const attendance = new Map(); for (const a of attendanceResult.data || []) attendance.set(`${a.worker_id}:${a.site_id}`, a);
    const projectUsers = new Map(); for (const p of projectMembersResult.data || []) { const arr = projectUsers.get(p.user_id) || []; arr.push(p); projectUsers.set(p.user_id, arr); }
    const projectMap = new Map((projectsResult.data || []).map(x => [x.id, x]));
    const siteMap = new Map((sitesResult.data || []).map(x => [x.id, x]));
    const people = [];
    for (const m of members) {
      const p = pmap.get(m.user_id) || {}, meta = metaByUser.get(m.user_id) || {};
      const worker = workers.find(w => w.user_id === m.user_id) || null;
      const workerAssignments = worker ? (assignments.get(worker.id) || []) : [];
      const projects = projectUsers.get(m.user_id) || [];
      people.push(this.shape({ kind: worker ? "WORKER" : "MEMBER", personId: worker?.id || m.user_id, userId: m.user_id, worker, membership: m, profile: p, meta, assignments: workerAssignments, projects, attendance, projectMap, siteMap, peopleProfiles: profiles, profileMap: pmap, contactAllowed } , emails));
    }
    for (const w of workers.filter(x => !x.user_id || !members.some(m => m.user_id === x.user_id))) {
      const p = w.user_id ? (pmap.get(w.user_id) || {}) : {}, meta = metaByWorker.get(w.id) || {};
      people.push(this.shape({ kind: "WORKER", personId: w.id, userId: w.user_id, worker: w, membership: null, profile: p, meta, assignments: assignments.get(w.id) || [], projects: w.user_id ? (projectUsers.get(w.user_id) || []) : [], attendance, projectMap, siteMap, peopleProfiles: profiles, profileMap: pmap, contactAllowed }, emails));
    }
    const filtered = people.filter(x => {
      const hay = `${x.fullName} ${x.employeeCode || ''} ${x.jobTitle || ''} ${x.department || ''} ${x.trade || ''}`.toLowerCase();
      const matchesSearch = !search || hay.includes(String(search).toLowerCase());
      const matchesStatus = !status || x.employmentStatus === status;
      const matchesProject = !projectId || x.projects.some(p => p.project_id === projectId) || x.assignments.some(a => a.project_id === projectId);
      return matchesSearch && matchesStatus && matchesProject;
    });
    const from = (page - 1) * pageSize;
    return { items: filtered.slice(from, from + pageSize), page, pageSize, total: filtered.length, totalPages: Math.ceil(filtered.length / pageSize) };
  }
  shape({ kind, personId, userId, worker, membership, profile, meta, assignments, projects, attendance, projectMap, siteMap, profileMap, contactAllowed }, emails) {
    const todayAssignment = assignments[0] || null;
    const attendanceRows = assignments.map(a => attendance.get(`${worker?.id}:${a.site_id}`)).filter(Boolean);
    return {
      id: personId, kind, userId: userId || null, workerId: worker?.id || null,
      fullName: profile.full_name || worker?.full_name || "Unnamed person", photoUrl: profile.avatar_url || null,
      phone: contactAllowed ? (profile.phone || worker?.phone || null) : null, email: contactAllowed && userId ? (emails.get(userId) || null) : null,
      employeeCode: meta.employee_code || worker?.employee_code || null,
      jobTitle: meta.job_title || worker?.job_title || membership?.role || worker?.trade || null,
      department: meta.department || null, trade: worker?.trade || null,
      role: membership?.role || (worker ? "WORKER" : null), status: membership?.status || worker?.status || "ACTIVE",
      employmentStatus: meta.employment_status || (worker?.status || membership?.status || "ACTIVE"),
      joinedDate: meta.joined_date || worker?.hire_date || membership?.created_at?.slice(0,10) || null,
      supervisorUserId: meta.supervisor_user_id || null,
      supervisorName: meta.supervisor_user_id ? (profileMap.get(meta.supervisor_user_id)?.full_name || null) : null,
      currentAssignment: todayAssignment ? { ...todayAssignment, project: projectMap.get(todayAssignment.project_id) || null, site: siteMap.get(todayAssignment.site_id) || null } : null,
      assignments: assignments.map(a => ({ ...a, project: projectMap.get(a.project_id) || null, site: siteMap.get(a.site_id) || null })), projects: projects.map(p => ({ ...p, project: projectMap.get(p.project_id) || null })),
      attendanceToday: attendanceRows[0] || null,
      accountability: { projectCount: new Set(projects.map(p => p.project_id)).size, siteCount: new Set(assignments.map(a => a.site_id).filter(Boolean)).size }
    };
  }
  async listPeople(args) { return this.basePeople(args); }
  async getPerson({ companyId, kind, personId, contactAllowed = false }) {
    const list = await this.basePeople({ companyId, page: 1, pageSize: 500, contactAllowed });
    const person = list.items.find(x => x.kind === kind && x.id === personId);
    if (!person) { const e = new Error("Person not found"); e.code = "PERSON_NOT_FOUND"; e.status = 404; throw e; }
    return person;
  }
  async projectTeam({ companyId, projectId, contactAllowed = false }) {
    const result = await this.basePeople({ companyId, projectId, page: 1, pageSize: 500, contactAllowed });
    return result;
  }
  async upsertProfile({ companyId, actorUserId, input }) {
    if (input.userId) await this.assertMember({ companyId, userId: input.userId });
    if (input.workerId) await this.assertWorker({ companyId, workerId: input.workerId });
    if (input.supervisorUserId) await this.assertMember({ companyId, userId: input.supervisorUserId });
    const selector = input.userId ? { company_id: companyId, user_id: input.userId } : { company_id: companyId, worker_id: input.workerId };
    const row = { id: randomUUID(), ...selector, department: clean(input.department) || null, job_title: clean(input.jobTitle) || null, employee_code: clean(input.employeeCode) || null, supervisor_user_id: input.supervisorUserId || null, employment_status: input.employmentStatus || "ACTIVE", joined_date: input.joinedDate || null, notes: clean(input.notes) || null, created_by: actorUserId };
    const { data: existing, error: existingError } = await this.supabase.from("company_people_profiles").select("id").match(selector).maybeSingle();
    if (existingError) throw existingError;
    const q = existing ? this.supabase.from("company_people_profiles").update(row).eq("company_id", companyId).eq("id", existing.id) : this.supabase.from("company_people_profiles").insert(row);
    const { data, error } = await q.select().single(); if (error) throw error; return data;
  }
  async updateWorkerContact({ companyId, workerId, input }) {
    await this.assertWorker({ companyId, workerId });
    const patch = {}; if (input.phone !== undefined) patch.phone = clean(input.phone) || null; if (input.fullName !== undefined) patch.full_name = clean(input.fullName); if (input.jobTitle !== undefined) patch.job_title = clean(input.jobTitle) || null; if (input.employeeCode !== undefined) patch.employee_code = clean(input.employeeCode);
    const { data, error } = await this.supabase.from("workers").update(patch).eq("company_id", companyId).eq("id", workerId).select().single(); if (error) throw error; return data;
  }
  async history({ companyId, kind, personId }) {
    const person = await this.getPerson({ companyId, kind, personId, contactAllowed: false });
    const userId = person.userId;
    const workerId = person.workerId;
    const [reports, tasks, issues, qualityActions, safetyObs, safetyInc, production, attendance, actions] = await Promise.all([
      userId ? this.supabase.from("daily_site_reports").select("id,project_id,site_id,report_date,work_completed,issues,delays,overall_progress,created_by,created_at").eq("company_id",companyId).eq("created_by",userId).order("report_date",{ascending:false}).limit(50) : Promise.resolve({data:[],error:null}),
      userId ? this.supabase.from("tasks").select("id,project_id,title,status,priority,due_date,assigned_to,created_at,updated_at").eq("company_id",companyId).eq("assigned_to",userId).order("updated_at",{ascending:false}).limit(50) : Promise.resolve({data:[],error:null}),
      userId ? this.supabase.from("issues").select("id,project_id,title,status,severity,due_date,assigned_to,created_at,updated_at").eq("company_id",companyId).eq("assigned_to",userId).order("updated_at",{ascending:false}).limit(50) : Promise.resolve({data:[],error:null}),
      userId ? this.supabase.from("quality_actions").select("id,project_id,title,status,due_date,assigned_to,created_at,updated_at").eq("company_id",companyId).eq("assigned_to",userId).order("updated_at",{ascending:false}).limit(50) : Promise.resolve({data:[],error:null}),
      userId ? this.supabase.from("safety_observations").select("id,project_id,title,status,severity,due_date,responsible_user_id,created_at,updated_at").eq("company_id",companyId).eq("responsible_user_id",userId).order("updated_at",{ascending:false}).limit(50) : Promise.resolve({data:[],error:null}),
      userId ? this.supabase.from("safety_incidents").select("id,project_id,title,status,severity,occurred_at,responsible_user_id,created_at,updated_at").eq("company_id",companyId).eq("responsible_user_id",userId).order("updated_at",{ascending:false}).limit(50) : Promise.resolve({data:[],error:null}),
      userId ? this.supabase.from("project_production_entries").select("id,project_id,workfront_id,work_date,quantity_completed,unit,labour_hours,worker_count,blocker_type,blocker_note,created_by,created_at").eq("company_id",companyId).eq("created_by",userId).order("work_date",{ascending:false}).limit(50) : Promise.resolve({data:[],error:null}),
      workerId ? this.supabase.from("attendance_records").select("id,project_id,site_id,attendance_date,status,check_in_at,check_out_at,notes").eq("company_id",companyId).eq("worker_id",workerId).order("attendance_date",{ascending:false}).limit(100) : Promise.resolve({data:[],error:null}),
      userId ? this.supabase.from("workflow_action_items").select("id,project_id,title,status,severity,due_at,assigned_to,created_at,updated_at").eq("company_id",companyId).eq("assigned_to",userId).order("updated_at",{ascending:false}).limit(50) : Promise.resolve({data:[],error:null})
    ]);
    const results=[reports,tasks,issues,qualityActions,safetyObs,safetyInc,production,attendance,actions]; for(const r of results) if(r.error) throw r.error;
    const items=[]; const add=(type,rows,dateKey='created_at')=>(rows||[]).forEach(row=>items.push({type,...row,date:row[dateKey]||row.created_at||null}));
    add('DAILY_REPORT',reports.data,'report_date'); add('TASK',tasks.data,'updated_at'); add('ISSUE',issues.data,'updated_at'); add('QUALITY_ACTION',qualityActions.data,'updated_at'); add('SAFETY_OBSERVATION',safetyObs.data,'updated_at'); add('SAFETY_INCIDENT',safetyInc.data,'occurred_at'); add('PRODUCTION',production.data,'work_date'); add('ATTENDANCE',attendance.data,'attendance_date'); add('MANAGEMENT_ACTION',actions.data,'updated_at');
    items.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    return { person, summary:{totalItems:items.length,dailyReports:(reports.data||[]).length,tasks:(tasks.data||[]).length,issues:(issues.data||[]).length,qualityActions:(qualityActions.data||[]).length,safetyRecords:(safetyObs.data||[]).length+(safetyInc.data||[]).length,production:(production.data||[]).length,attendance:(attendance.data||[]).length,managementActions:(actions.data||[]).length}, items:items.slice(0,250) };
  }

  async attendanceToday({ companyId, projectId }) {
    const result = await this.basePeople({ companyId, projectId, page: 1, pageSize: 500, contactAllowed: false });
    const expected = result.items.filter(x => projectId ? (x.projects.some(p => p.project_id === projectId) || x.assignments.some(a => a.project_id === projectId)) : true);
    return { date: new Date().toISOString().slice(0,10), expected: expected.length, present: expected.filter(x => ["PRESENT","LATE"].includes(x.attendanceToday?.status)).length, absent: expected.filter(x => x.attendanceToday?.status === "ABSENT").length, people: expected };
  }
}
