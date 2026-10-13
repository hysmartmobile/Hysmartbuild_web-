-- RC20: account statement/financial PDF output is separate from viewing books.
begin;
insert into public.permissions(key,description)
values ('accounting:print','Print or save authorized accounting reports and account statements as PDF')
on conflict(key) do update set description=excluded.description;
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','accounting:print'),
('COMPANY_OWNER','accounting:print'),
('COMPANY_ADMIN','accounting:print'),
('DIRECTOR','accounting:print'),
('CEO','accounting:print'),
('MANAGEMENT','accounting:print'),
('ACCOUNTANT','accounting:print')
on conflict(role,permission_key) do nothing;
commit;
