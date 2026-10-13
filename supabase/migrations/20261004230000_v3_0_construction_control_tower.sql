begin;
insert into public.permissions(key,description) values ('control-tower:read','View the construction control tower and management priorities'),('control-tower:manage','Refresh control tower workflow signals') on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('control-tower:read','control-tower:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','control-tower:read'),('SUPER_ADMIN','control-tower:manage'),
('COMPANY_OWNER','control-tower:read'),('COMPANY_OWNER','control-tower:manage'),
('COMPANY_ADMIN','control-tower:read'),('COMPANY_ADMIN','control-tower:manage'),
('DIRECTOR','control-tower:read'),('DIRECTOR','control-tower:manage'),
('PROJECT_MANAGER','control-tower:read'),('PROJECT_MANAGER','control-tower:manage');
notify pgrst,'reload schema';
commit;
