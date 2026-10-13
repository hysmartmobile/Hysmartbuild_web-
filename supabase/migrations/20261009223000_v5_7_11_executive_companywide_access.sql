-- RC24: company-wide executive visibility with least-privilege controls.
-- Owners/admins keep their existing administrative grants. CEO/Director/Management
-- receive broad read visibility and reporting/oversight actions, not unrestricted
-- financial mutation, payroll, ownership, billing, or payment-execution rights.
begin;

-- Repair role catalog drift before granting CEO/DIRECTOR/MANAGEMENT permissions.
-- Some deployed databases still have the earlier role_permissions_role_check list.
alter table public.role_permissions drop constraint if exists role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check check (role in (
 'SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR',
 'ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT','CEO','CIVIL_ENGINEER','MANAGEMENT','COMMERCIAL_MANAGER',
 'QUANTITY_SURVEYOR','PROCUREMENT_OFFICER'
));

-- Make executive dashboard scopes explicit and grant all currently registered read
-- permissions so newly added modules can be visible to executives without giving
-- them write access by accident. Explicit exceptions cover read-style keys that do
-- not follow the :read naming convention.
insert into public.role_permissions(role, permission_key)
select roles.role, p.key
from (values ('CEO'), ('DIRECTOR'), ('MANAGEMENT')) as roles(role)
cross join public.permissions p
where p.key like '%:read'
   or p.key in (
     'company:read','user:read','report:print','report:export','report:analytics',
     'finance:read','accounting:read','accounting:print','bank:read','ar:read',
     'billing:read','audit:read','activity:read','notification:read',
     'executive:read','control-tower:read','recovery:read',
     'commercial-intelligence:read','financial-intelligence:read',
     'operating-system:read','dashboard:executive','dashboard:finance',
     'dashboard:workforce','dashboard:field','lifecycle:read','workflow:read',
     'execution:read','production:read','schedule:read','quality:read',
     'safety:read','compliance:read','collaboration:read','boq:read',
     'inventory:read','field:read','procurement:read','document:read'
   )
on conflict do nothing;

-- Executives can oversee and approve operational reports and workflows, while
-- high-risk changes remain governed by dedicated permissions and approval flows.
insert into public.role_permissions(role, permission_key)
select roles.role, p.key
from (values ('CEO'), ('DIRECTOR'), ('MANAGEMENT')) as roles(role)
join public.permissions p on p.key in (
  'report:approve','expense:approve','workflow:execute','collaboration:manage',
  'dashboard:executive','dashboard:finance','dashboard:workforce','dashboard:field'
)
on conflict do nothing;

commit;
