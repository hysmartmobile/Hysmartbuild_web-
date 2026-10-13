import { supabaseAdmin } from '../src/lib/supabase.js';
import { CostForecastLearningService } from '../src/services/costForecastLearningService.js';
// Trusted cron only: requires service-role credentials server-side, never in browser.
const service=new CostForecastLearningService({supabase:supabaseAdmin});
const {data:projects,error}=await supabaseAdmin.from('projects').select('id,company_id,status').limit(5000);
if(error)throw error;
let trained=0,skipped=0,failed=0;
for(const p of projects||[]){if(['COMPLETED','CANCELLED'].includes(String(p.status||'').toUpperCase()))continue;try{const r=await service.trainProject({companyId:p.company_id,projectId:p.id});if(r.model?.status==='READY')trained++;else skipped++;process.stdout.write(`${r.model?.status||'SKIPPED'} ${p.company_id}/${p.id} samples=${r.model?.training_sample_count??r.readiness?.historicalSampleCount??0}\n`);}catch(e){failed++;process.stderr.write(`FAILED ${p.company_id}/${p.id}: ${String(e?.message||e).slice(0,220)}\n`);}}
process.stdout.write(`Cost forecast batch complete: trained=${trained}, skipped=${skipped}, failed=${failed}\n`);if(failed)process.exitCode=1;
