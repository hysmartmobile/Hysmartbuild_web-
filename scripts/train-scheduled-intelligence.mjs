import { supabaseAdmin } from '../src/lib/supabase.js';
import { ScheduleForecastService } from '../src/services/scheduleForecastService.js';

// Intended for a trusted deployment cron (daily or after schedule-data imports).
// Never expose the service-role key to the browser or call this script from a public endpoint.
const PAGE_SIZE = 1000;
const MIN_ROWS = 20;
const MIN_PER_CLASS = 4;
const service = new ScheduleForecastService({ supabase: supabaseAdmin });
const byProject = new Map();
let from = 0;

for (;;) {
  const { data, error } = await supabaseAdmin.from('project_schedule_activities')
    .select('company_id,project_id,activity_type,planned_finish,actual_finish')
    .eq('status', 'COMPLETED').not('actual_finish', 'is', null)
    .order('company_id').order('project_id').order('actual_finish')
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  const rows = data || [];
  for (const row of rows) {
    if (row.activity_type === 'SUMMARY') continue;
    const key = `${row.company_id}:${row.project_id}`;
    if (!byProject.has(key)) byProject.set(key, { companyId: row.company_id, projectId: row.project_id, total: 0, late: 0, onTime: 0 });
    const item = byProject.get(key);
    item.total++;
    if (new Date(`${row.actual_finish}T00:00:00Z`) > new Date(`${row.planned_finish}T00:00:00Z`)) item.late++;
    else item.onTime++;
  }
  if (rows.length < PAGE_SIZE) break;
  from += PAGE_SIZE;
}

let trained = 0, skipped = 0, failed = 0;
for (const project of byProject.values()) {
  if (project.total < MIN_ROWS || Math.min(project.late, project.onTime) < MIN_PER_CLASS) { skipped++; continue; }
  try {
    const result = await service.trainProject({ companyId: project.companyId, projectId: project.projectId });
    if (result.model?.status === 'READY') trained++; else skipped++;
    process.stdout.write(`${result.model?.status || 'UNKNOWN'} ${project.companyId}/${project.projectId} samples=${project.total}\n`);
  } catch (error) {
    failed++;
    process.stderr.write(`FAILED ${project.companyId}/${project.projectId}: ${String(error?.message || error).slice(0, 240)}\n`);
  }
}
process.stdout.write(`Scheduled forecasting complete: trained=${trained}, skipped=${skipped}, failed=${failed}\n`);
if (failed) process.exitCode = 1;
