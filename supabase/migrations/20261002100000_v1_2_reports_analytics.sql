-- V1.2 Reports, Analytics & Exports
insert into public.permissions(key,description) values
('report:analytics','View aggregated company analytics'),
('report:export','Export company reports')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('report:analytics','report:export');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','report:analytics'),('SUPER_ADMIN','report:export'),
('COMPANY_OWNER','report:analytics'),('COMPANY_OWNER','report:export'),
('COMPANY_ADMIN','report:analytics'),('COMPANY_ADMIN','report:export'),
('DIRECTOR','report:analytics'),('DIRECTOR','report:export'),
('PROJECT_MANAGER','report:analytics'),('PROJECT_MANAGER','report:export'),
('SITE_ENGINEER','report:analytics'),
('SITE_SUPERVISOR','report:analytics'),
('ACCOUNTANT','report:analytics'),('ACCOUNTANT','report:export'),
('STOREKEEPER','report:analytics'),
('HR_MANAGER','report:analytics'),('HR_MANAGER','report:export');
