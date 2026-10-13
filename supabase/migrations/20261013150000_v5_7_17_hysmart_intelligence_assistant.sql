begin;

insert into public.permissions(key, description) values
  ('ai-assistant:use', 'Ask HySmart Intelligence questions within authorised company and project scope'),
  ('intelligence-predictions:read', 'View role-authorised construction intelligence baselines and forecasts'),
  ('intelligence-alerts:read', 'View role-authorised proactive construction alerts')
on conflict(key) do update set description = excluded.description;

delete from public.role_permissions where permission_key in ('ai-assistant:use','intelligence-predictions:read','intelligence-alerts:read');

-- All company roles may use the assistant, but backend project-membership checks and
-- each user's existing functional permissions limit the context returned to them.
insert into public.role_permissions(role, permission_key) values
  ('SUPER_ADMIN','ai-assistant:use'),('COMPANY_OWNER','ai-assistant:use'),('COMPANY_ADMIN','ai-assistant:use'),
  ('DIRECTOR','ai-assistant:use'),('PROJECT_MANAGER','ai-assistant:use'),('SITE_ENGINEER','ai-assistant:use'),
  ('SITE_SUPERVISOR','ai-assistant:use'),('ACCOUNTANT','ai-assistant:use'),('STOREKEEPER','ai-assistant:use'),
  ('HR_MANAGER','ai-assistant:use'),('WORKER','ai-assistant:use'),('CLIENT','ai-assistant:use'),('CEO','ai-assistant:use'),
  ('CIVIL_ENGINEER','ai-assistant:use'),('MANAGEMENT','ai-assistant:use'),('COMMERCIAL_MANAGER','ai-assistant:use'),
  ('QUANTITY_SURVEYOR','ai-assistant:use'),('PROCUREMENT_OFFICER','ai-assistant:use');

insert into public.role_permissions(role, permission_key) values
  ('SUPER_ADMIN','intelligence-predictions:read'),('COMPANY_OWNER','intelligence-predictions:read'),('COMPANY_ADMIN','intelligence-predictions:read'),
  ('DIRECTOR','intelligence-predictions:read'),('PROJECT_MANAGER','intelligence-predictions:read'),('SITE_ENGINEER','intelligence-predictions:read'),
  ('CIVIL_ENGINEER','intelligence-predictions:read'),('CEO','intelligence-predictions:read'),('MANAGEMENT','intelligence-predictions:read'),
  ('QUANTITY_SURVEYOR','intelligence-predictions:read'),('COMMERCIAL_MANAGER','intelligence-predictions:read'),('ACCOUNTANT','intelligence-predictions:read'),
  ('PROCUREMENT_OFFICER','intelligence-predictions:read'),('STOREKEEPER','intelligence-predictions:read');

insert into public.role_permissions(role, permission_key) values
  ('SUPER_ADMIN','intelligence-alerts:read'),('COMPANY_OWNER','intelligence-alerts:read'),('COMPANY_ADMIN','intelligence-alerts:read'),
  ('DIRECTOR','intelligence-alerts:read'),('PROJECT_MANAGER','intelligence-alerts:read'),('SITE_ENGINEER','intelligence-alerts:read'),
  ('SITE_SUPERVISOR','intelligence-alerts:read'),('ACCOUNTANT','intelligence-alerts:read'),('STOREKEEPER','intelligence-alerts:read'),
  ('HR_MANAGER','intelligence-alerts:read'),('WORKER','intelligence-alerts:read'),('CLIENT','intelligence-alerts:read'),('CEO','intelligence-alerts:read'),
  ('CIVIL_ENGINEER','intelligence-alerts:read'),('MANAGEMENT','intelligence-alerts:read'),('COMMERCIAL_MANAGER','intelligence-alerts:read'),
  ('QUANTITY_SURVEYOR','intelligence-alerts:read'),('PROCUREMENT_OFFICER','intelligence-alerts:read');

notify pgrst, 'reload schema';
commit;
