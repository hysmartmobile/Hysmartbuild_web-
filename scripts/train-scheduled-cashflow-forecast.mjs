import { supabaseAdmin } from '../src/lib/supabase.js';
import { CashflowForecastLearningService } from '../src/services/cashflowForecastLearningService.js';
// Trusted server-side cron only. Never expose the Supabase service-role key to the PWA.
const service=new CashflowForecastLearningService({supabase:supabaseAdmin});
const result=await service.scheduledBatch();
process.stdout.write(`Cashflow forecast batch complete: ready=${result.ready}, skipped=${result.skipped}, failed=${result.failed}\n`);
if(result.failed)process.exitCode=1;
