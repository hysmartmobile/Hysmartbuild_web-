-- RC20: allow controlled, browser-generated report print/PDF output without
-- granting the broader company-wide report:export permission to field roles.
begin;
insert into public.permissions(key,description)
values ('report:print','Print or save authorized reports as PDF')
on conflict(key) do update set description=excluded.description;
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','report:print'),
('COMPANY_OWNER','report:print'),
('COMPANY_ADMIN','report:print'),
('DIRECTOR','report:print'),
('PROJECT_MANAGER','report:print'),
('SITE_ENGINEER','report:print'),
('SITE_SUPERVISOR','report:print'),
('ACCOUNTANT','report:print'),
('HR_MANAGER','report:print')
on conflict(role,permission_key) do nothing;
commit;
