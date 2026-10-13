begin;
alter table public.projects add column if not exists construction_type text;
update public.projects set construction_type='BUILDING' where construction_type is null;
alter table public.projects drop constraint if exists projects_construction_type_check;
alter table public.projects add constraint projects_construction_type_check check (construction_type is null or construction_type in ('BUILDING','ESTATE','ROAD_CIVIL','MEP','INDUSTRIAL_EPC','RENOVATION','FIT_OUT'));
create index if not exists projects_construction_type_idx on public.projects(company_id,construction_type);
delete from public.role_permissions where permission_key in ('construction-type:read','construction-type:manage');
insert into public.role_permissions(role,permission_key) values ('SUPER_ADMIN','construction-type:read'),('SUPER_ADMIN','construction-type:manage'),('COMPANY_OWNER','construction-type:read'),('COMPANY_OWNER','construction-type:manage'),('COMPANY_ADMIN','construction-type:read'),('COMPANY_ADMIN','construction-type:manage'),('DIRECTOR','construction-type:read'),('DIRECTOR','construction-type:manage'),('PROJECT_MANAGER','construction-type:read'),('PROJECT_MANAGER','construction-type:manage'),('COMMERCIAL_MANAGER','construction-type:read');
commit;
