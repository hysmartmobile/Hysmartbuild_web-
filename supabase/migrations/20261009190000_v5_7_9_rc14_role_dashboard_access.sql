-- v5.7.9 RC14: construction role catalog, least-privilege grants, and member dashboard access.
-- Additive only: existing memberships and their role values are preserved.
begin;

alter table public.company_members drop constraint if exists company_members_role_check;
alter table public.company_members add constraint company_members_role_check check (role in (
 'SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR',
 'ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT','CEO','CIVIL_ENGINEER','MANAGEMENT','COMMERCIAL_MANAGER',
 'QUANTITY_SURVEYOR','PROCUREMENT_OFFICER'
));
alter table public.role_permissions drop constraint if exists role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check check (role in (
 'SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR',
 'ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT','CEO','CIVIL_ENGINEER','MANAGEMENT','COMMERCIAL_MANAGER',
 'QUANTITY_SURVEYOR','PROCUREMENT_OFFICER'
));
-- Invitation schema differs between historical deployments; safely expand its role constraint when present.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.company_invitations'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%role%' loop
   execute format('alter table public.company_invitations drop constraint %I',c.conname);
 end loop;
 if to_regclass('public.company_invitations') is not null then
   alter table public.company_invitations add constraint company_invitations_role_check check (role in (
    'COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR','ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT',
    'CEO','CIVIL_ENGINEER','MANAGEMENT','COMMERCIAL_MANAGER','QUANTITY_SURVEYOR','PROCUREMENT_OFFICER'
   ));
 end if;
end $$;

-- Ensure the permissions referenced below exist in the permission registry.
insert into public.permissions(key,description) values
 ('boq:read','Read estimates and BOQ traceability'),('boq:manage','Manage estimates and BOQ traceability'),
 ('inventory:read','Read inventory and goods received'),('inventory:manage','Manage inventory and goods received'),
 ('field:read','Read field reports and site evidence'),('field:manage','Create and manage field reports and site evidence'),
 ('dashboard:executive','View executive and company-wide dashboard indicators'),
 ('dashboard:finance','View finance and commercial dashboard indicators'),
 ('dashboard:workforce','View workforce dashboard indicators'),
 ('dashboard:field','View site execution dashboard indicators')
on conflict(key) do update set description=excluded.description;

-- Company owners/admins retain full workspace administration, including newly introduced permissions.
insert into public.role_permissions(role,permission_key)
select r.role,p.key from (values ('COMPANY_OWNER'),('COMPANY_ADMIN'),('SUPER_ADMIN')) r(role)
cross join public.permissions p
on conflict do nothing;

-- Management and commercial roles receive cross-functional read access, not unrestricted mutations.
insert into public.role_permissions(role,permission_key)
select 'CEO',p.key from public.permissions p
where p.key in ('company:read','user:read','project:read','project:create','project:update','report:read','report:approve','report:analytics','report:export','expense:read','expense:approve','finance:read','material:read','attendance:read','document:read','notification:read','activity:read','schedule:read','execution:read','quality:read','safety:read','compliance:read','procurement:read','accounting:read','ar:read','bank:read','executive:read','control-tower:read','recovery:read','commercial-intelligence:read','production:read','operating-system:read','financial-intelligence:read','lifecycle:read','boq:read','inventory:read','field:read','dashboard:executive','dashboard:finance','dashboard:workforce','dashboard:field','workflow:read','workflow:execute','collaboration:read','collaboration:manage')
on conflict do nothing;
insert into public.role_permissions(role,permission_key) values ('DIRECTOR','boq:read') on conflict do nothing;
insert into public.role_permissions(role,permission_key) select 'MANAGEMENT',p.key from public.permissions p
where p.key in ('company:read','user:read','project:read','report:read','report:analytics','expense:read','finance:read','material:read','attendance:read','document:read','notification:read','activity:read','schedule:read','execution:read','quality:read','safety:read','compliance:read','procurement:read','accounting:read','ar:read','bank:read','executive:read','control-tower:read','recovery:read','commercial-intelligence:read','production:read','operating-system:read','financial-intelligence:read','lifecycle:read','boq:read','inventory:read','field:read','dashboard:executive','dashboard:finance','dashboard:workforce','dashboard:field','workflow:read','collaboration:read')
on conflict do nothing;
insert into public.role_permissions(role,permission_key)
select 'COMMERCIAL_MANAGER',p.key from public.permissions p
where p.key in ('company:read','project:read','report:read','report:analytics','expense:read','finance:read','procurement:read','procurement:create','procurement:approve','accounting:read','ar:create','ar:read','ar:pay','supplier:read','supplier:create','supplier:update','schedule:read','execution:read','commercial-intelligence:read','commercial-intelligence:manage','financial-intelligence:read','financial-intelligence:manage','revenue-margin:read','boq:read','boq:manage','operating-system:read','control-tower:read','dashboard:finance','workflow:read','document:read','audit:read')
on conflict do nothing;
insert into public.role_permissions(role,permission_key)
select 'QUANTITY_SURVEYOR',p.key from public.permissions p
where p.key in ('company:read','project:read','report:read','report:analytics','expense:read','procurement:read','supplier:read','schedule:read','execution:read','commercial-intelligence:read','financial-intelligence:read','boq:read','boq:manage','operating-system:read','document:read','collaboration:read','dashboard:finance','workflow:read')
on conflict do nothing;
insert into public.role_permissions(role,permission_key)
select 'PROCUREMENT_OFFICER',p.key from public.permissions p
where p.key in ('company:read','project:read','report:read','material:read','material:request','material:receive','supplier:read','supplier:create','supplier:update','procurement:read','procurement:create','procurement:approve','procurement:receive','inventory:read','inventory:manage','boq:read','operating-system:read','document:read','collaboration:read','workflow:read','dashboard:field')
on conflict do nothing;
insert into public.role_permissions(role,permission_key)
select 'CIVIL_ENGINEER',p.key from public.permissions p
where p.key in ('company:read','project:read','project:update','report:create','report:read','report:update','material:read','material:request','attendance:read','document:read','task:read','task:update','issue:create','issue:read','issue:update','schedule:read','schedule:manage','execution:read','execution:manage','quality:read','quality:manage','safety:read','field:read','field:manage','boq:read','production:read','operating-system:read','dashboard:field','collaboration:read','collaboration:comment','notification:read','workflow:execute')
on conflict do nothing;
-- Existing operational roles get explicit dashboard scopes; no financial dashboard access for field-only roles.
insert into public.role_permissions(role,permission_key)
select role,permission_key from (values
 ('DIRECTOR','dashboard:executive'),('DIRECTOR','dashboard:finance'),('DIRECTOR','dashboard:workforce'),('DIRECTOR','dashboard:field'),('CEO','dashboard:executive'),('CEO','dashboard:finance'),('CEO','dashboard:workforce'),('CEO','dashboard:field'),
 ('PROJECT_MANAGER','dashboard:field'),('PROJECT_MANAGER','dashboard:workforce'),('PROJECT_MANAGER','boq:read'),('PROJECT_MANAGER','field:read'),('PROJECT_MANAGER','field:manage'),
 ('SITE_ENGINEER','dashboard:field'),('SITE_ENGINEER','field:read'),('SITE_ENGINEER','field:manage'),('SITE_ENGINEER','boq:read'),
 ('SITE_SUPERVISOR','dashboard:field'),('SITE_SUPERVISOR','field:read'),('SITE_SUPERVISOR','field:manage'),
 ('ACCOUNTANT','dashboard:finance'),('ACCOUNTANT','boq:read'),
 ('STOREKEEPER','dashboard:field'),('STOREKEEPER','inventory:read'),('STOREKEEPER','inventory:manage'),
 ('HR_MANAGER','dashboard:workforce'),('WORKER','dashboard:field'),('CLIENT','dashboard:field')
) as x(role,permission_key) join public.permissions p on p.key=x.permission_key
on conflict do nothing;

commit;
