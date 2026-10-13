create table if not exists public.project_client_access (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, user_id uuid not null, status text not null default 'ACTIVE' check(status in ('ACTIVE','REVOKED')),
 granted_by uuid not null, created_at timestamptz not null default now(), revoked_at timestamptz,
 unique(company_id,project_id,user_id)
);
create table if not exists public.documents (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid, site_id uuid, uploaded_by uuid not null, name text not null, storage_path text not null,
 mime_type text not null, size_bytes bigint not null default 0 check(size_bytes>=0 and size_bytes<=52428800),
 category text not null default 'GENERAL', visibility text not null default 'INTERNAL' check(visibility in ('INTERNAL','CLIENT')),
 description text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists project_client_access_company_project_user on public.project_client_access(company_id,project_id,user_id);
create index if not exists documents_company_project_idx on public.documents(company_id,project_id,created_at desc);
create index if not exists documents_company_site_idx on public.documents(company_id,site_id,created_at desc);
alter table public.project_client_access add constraint pca_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.documents add constraint documents_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.documents add constraint documents_site_tenant_fk foreign key(company_id,site_id) references public.sites(company_id,id) on delete cascade;
alter table public.project_client_access enable row level security; alter table public.documents enable row level security;
create policy pca_member_all on public.project_client_access for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy documents_member_all on public.documents for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
insert into public.permissions(key,description) values
('document:create','Upload project and site documents'),('document:read','Read documents'),('document:delete','Delete documents'),('client:manage','Manage client project access'),('client:read','Access client portal') on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('document:create','document:read','document:delete','client:manage','client:read');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','document:create'),('SUPER_ADMIN','document:read'),('SUPER_ADMIN','document:delete'),('SUPER_ADMIN','client:manage'),('SUPER_ADMIN','client:read'),
('COMPANY_OWNER','document:create'),('COMPANY_OWNER','document:read'),('COMPANY_OWNER','document:delete'),('COMPANY_OWNER','client:manage'),('COMPANY_OWNER','client:read'),
('COMPANY_ADMIN','document:create'),('COMPANY_ADMIN','document:read'),('COMPANY_ADMIN','document:delete'),('COMPANY_ADMIN','client:manage'),('COMPANY_ADMIN','client:read'),
('DIRECTOR','document:create'),('DIRECTOR','document:read'),('DIRECTOR','client:manage'),('DIRECTOR','client:read'),
('PROJECT_MANAGER','document:create'),('PROJECT_MANAGER','document:read'),('PROJECT_MANAGER','client:read'),
('SITE_ENGINEER','document:create'),('SITE_ENGINEER','document:read'),
('SITE_SUPERVISOR','document:create'),('SITE_SUPERVISOR','document:read'),
('ACCOUNTANT','document:read'),('HR_MANAGER','document:read'),('CLIENT','client:read');
insert into storage.buckets(id,name,public) values('project-documents','project-documents',false) on conflict(id) do nothing;
