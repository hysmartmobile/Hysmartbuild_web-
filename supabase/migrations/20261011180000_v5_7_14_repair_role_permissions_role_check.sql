-- RC61 hotfix: align role_permissions check constraint with supported application roles.
-- Apply this before retrying the failed executive-access migration on a database
-- where role_permissions_role_check still rejects CEO.
begin;

alter table public.role_permissions drop constraint if exists role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check check (role in (
 'SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR',
 'ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT','CEO','CIVIL_ENGINEER','MANAGEMENT','COMMERCIAL_MANAGER',
 'QUANTITY_SURVEYOR','PROCUREMENT_OFFICER'
));

commit;
