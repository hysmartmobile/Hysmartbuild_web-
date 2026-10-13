import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, 'src/services/companyService.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'src/routes/companies.js'), 'utf8');
const api = fs.readFileSync(path.join(root, '../HySmart-Build-Web/src/lib/api.js'), 'utf8');
const team = fs.readFileSync(path.join(root, '../HySmart-Build-Web/src/pages/Team.jsx'), 'utf8');
const accept = fs.readFileSync(path.join(root, '../HySmart-Build-Web/src/pages/InvitationAccept.jsx'), 'utf8');

test('team invitation UI has API methods for revoke and access history routes', () => {
  assert.ok(api.includes('revokeInvitation:(invitationId,reason)=>call(`/companies/${cid()}/invitations/${encodeURIComponent(invitationId)}/revoke'));
  assert.ok(api.includes('accessLifecycle:(params)=>call(`/companies/${cid()}/access-lifecycle${q(params||{})}`'));
  assert.ok(api.includes('invitations:(params)=>call(`/companies/${cid()}/invitations${q(params||{})}`)'));
  assert.match(routes, /router\.post\("\/:companyId\/invitations\/:invitationId\/revoke"/);
  assert.match(routes, /router\.get\("\/:companyId\/access-lifecycle"/);
  assert.match(team, /api\.revokeInvitation\(id,why\)/);
  assert.match(team, /api\.accessLifecycle\(\{page,pageSize:10\}\)/);
});

test('listing invitations changes overdue pending invitations to EXPIRED', () => {
  assert.match(service, /async listInvitations\(\{companyId,page=1,pageSize=50\}\)/);
  assert.match(service, /status: 'EXPIRED', updated_at: now/);
  assert.match(service, /\.eq\('status', 'PENDING'\)\.lte\('expires_at', now\)/);
});

test('replacement invitations revoke the old token with actor, time, reason, and lifecycle event', () => {
  assert.match(service, /Superseded by a replacement invitation/);
  assert.match(service, /revoked_by: invitedBy, revoked_at: supersededAt, revocation_reason: supersededReason/);
  assert.match(service, /action: "INVITATION_REVOKED"/);
});

test('invitation preview and atomic acceptance remain in place', () => {
  assert.match(service, /Invitation has been revoked\. Request a new invitation\./);
  assert.match(service, /rpc\('accept_company_invitation'/);
  assert.match(accept, /api\.invitationPreview\(token\)/);
  assert.match(accept, /api\.acceptInvitation\(\{token,fullName:normalizedName\}\)/);
  assert.match(accept, /session\.user\.email\?\.toLowerCase\(\)===invite\.email\.toLowerCase\(\)/);
  assert.match(accept, /Sign out and continue/);
});
