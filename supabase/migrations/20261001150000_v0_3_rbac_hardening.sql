-- V0.3 RBAC hardening.
-- The API remains the authoritative authorization layer; RLS remains a second boundary.

-- Prevent clients from changing membership roles directly through the public client.
drop policy if exists members_update_owner_admin on public.company_members;

create policy members_update_owner_admin on public.company_members
for update
using (
  public.has_company_role(company_id, 'COMPANY_OWNER')
  or public.has_company_role(company_id, 'COMPANY_ADMIN')
)
with check (
  public.is_company_member(company_id)
  and role <> 'SUPER_ADMIN'
);

-- Only the API/service role should mutate the role-permission matrix.
drop policy if exists role_permissions_read_authenticated on public.role_permissions;
create policy role_permissions_read_authenticated on public.role_permissions
for select to authenticated using (true);

create index if not exists role_permissions_role_idx on public.role_permissions(role);
create index if not exists company_members_company_role_status_idx
  on public.company_members(company_id, role, status);

-- Seed explicit least-privilege mappings for the operational roles.
-- Owner/admin receive the full V0.2 permission set; other roles receive only
-- permissions required for their normal responsibilities.
insert into public.role_permissions(role, permission_key)
select x.role, x.permission_key
from (values
  ('SUPER_ADMIN','company:read'),('SUPER_ADMIN','company:update'),('SUPER_ADMIN','user:create'),('SUPER_ADMIN','user:read'),('SUPER_ADMIN','user:update'),
  ('SUPER_ADMIN','project:create'),('SUPER_ADMIN','project:read'),('SUPER_ADMIN','project:update'),('SUPER_ADMIN','project:delete'),
  ('SUPER_ADMIN','report:create'),('SUPER_ADMIN','report:read'),('SUPER_ADMIN','report:update'),('SUPER_ADMIN','report:approve'),
  ('SUPER_ADMIN','expense:create'),('SUPER_ADMIN','expense:read'),('SUPER_ADMIN','expense:approve'),
  ('SUPER_ADMIN','material:create'),('SUPER_ADMIN','material:read'),('SUPER_ADMIN','material:issue'),('SUPER_ADMIN','material:receive'),
  ('DIRECTOR','company:read'),('DIRECTOR','company:update'),('DIRECTOR','user:read'),('DIRECTOR','project:create'),('DIRECTOR','project:read'),('DIRECTOR','project:update'),('DIRECTOR','project:delete'),('DIRECTOR','report:read'),('DIRECTOR','report:approve'),('DIRECTOR','expense:read'),('DIRECTOR','expense:approve'),('DIRECTOR','material:read'),
  ('PROJECT_MANAGER','company:read'),('PROJECT_MANAGER','user:read'),('PROJECT_MANAGER','project:create'),('PROJECT_MANAGER','project:read'),('PROJECT_MANAGER','project:update'),('PROJECT_MANAGER','report:create'),('PROJECT_MANAGER','report:read'),('PROJECT_MANAGER','report:update'),('PROJECT_MANAGER','report:approve'),('PROJECT_MANAGER','expense:read'),('PROJECT_MANAGER','material:read'),
  ('SITE_ENGINEER','company:read'),('SITE_ENGINEER','project:read'),('SITE_ENGINEER','project:update'),('SITE_ENGINEER','report:create'),('SITE_ENGINEER','report:read'),('SITE_ENGINEER','report:update'),('SITE_ENGINEER','material:read'),
  ('SITE_SUPERVISOR','company:read'),('SITE_SUPERVISOR','project:read'),('SITE_SUPERVISOR','report:create'),('SITE_SUPERVISOR','report:read'),('SITE_SUPERVISOR','material:read'),
  ('ACCOUNTANT','company:read'),('ACCOUNTANT','user:read'),('ACCOUNTANT','expense:create'),('ACCOUNTANT','expense:read'),('ACCOUNTANT','expense:approve'),('ACCOUNTANT','report:read'),('ACCOUNTANT','material:read'),
  ('STOREKEEPER','company:read'),('STOREKEEPER','project:read'),('STOREKEEPER','material:create'),('STOREKEEPER','material:read'),('STOREKEEPER','material:issue'),('STOREKEEPER','material:receive'),
  ('HR_MANAGER','company:read'),('HR_MANAGER','user:create'),('HR_MANAGER','user:read'),('HR_MANAGER','user:update'),
  ('WORKER','company:read'),('WORKER','project:read'),('WORKER','report:create'),('WORKER','report:read'),('WORKER','material:read'),
  ('CLIENT','company:read'),('CLIENT','project:read'),('CLIENT','report:read')
) as x(role, permission_key)
where exists (select 1 from public.permissions p where p.key = x.permission_key)
on conflict do nothing;
