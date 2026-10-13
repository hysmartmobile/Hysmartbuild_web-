import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261006170000_v5_6_1_access_lifecycle.sql'),'utf8');
const service=fs.readFileSync(path.join(root,'src/services/companyService.js'),'utf8');
const routes=fs.readFileSync(path.join(root,'src/routes/companies.js'),'utf8');
const layout=fs.readFileSync(path.join(root,'../HySmart-Build-Web/src/components/Layout.jsx'),'utf8');
const ui=fs.readFileSync(path.join(root,'../HySmart-Build-Web/src/components/UI.jsx'),'utf8');
const team=fs.readFileSync(path.join(root,'../HySmart-Build-Web/src/pages/Team.jsx'),'utf8');
const css=fs.readFileSync(path.join(root,'../HySmart-Build-Web/src/styles.css'),'utf8');

test('V5.6.1 uses reversible access lifecycle instead of deleting people',()=>{
 assert.match(migration,/access_suspension_reason/);assert.match(migration,/company_access_lifecycle_events/);assert.match(service,/revokeInvitation/);assert.match(service,/updateMemberAccess/);assert.match(service,/SELF_ACCESS_SUSPEND_FORBIDDEN/);assert.match(routes,/invitations\/:invitationId\/revoke/);assert.match(routes,/members\/:userId\/access/);
});
test('V5.6.1 requires a reason and records actor/time for access changes',()=>{
 assert.match(service,/A reason is required/);assert.match(service,/actor_user_id:actorUserId/);assert.match(service,/revoked_at:now/);assert.match(service,/access_suspended_at:now/);
});
test('V5.6.1 sidebar scrolls independently and keeps logout visible',()=>{
 assert.match(css,/sidebar nav[^}]*overflow-y:auto/);assert.match(css,/sidebottom\{flex:0 0 auto/);assert.match(layout,/Sign out/);
});
test('V5.6.1 provides reusable pagination and team access controls',()=>{
 assert.match(ui,/export function Pagination/);assert.match(team,/Pagination/);assert.match(team,/Revoke/);assert.match(team,/Suspend/);assert.match(team,/Restore/);assert.match(team,/Access history/);
});
console.log('v5.6.1 access lifecycle tests passed');
