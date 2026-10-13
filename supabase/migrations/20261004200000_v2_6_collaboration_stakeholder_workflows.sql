begin;
create extension if not exists pgcrypto;

create table if not exists public.collaboration_rfis (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, rfi_no text not null, subject text not null, question text not null,
 category text, priority text not null default 'MEDIUM' check(priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
 status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','UNDER_REVIEW','RESPONDED','CLOSED','CANCELLED')),
 raised_by uuid references auth.users(id), assigned_to uuid references auth.users(id), due_date date,
 response text, responded_by uuid references auth.users(id), responded_at timestamptz, closed_by uuid references auth.users(id), closed_at timestamptz,
 evidence jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,rfi_no)
);
create table if not exists public.collaboration_submittals (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, submittal_no text not null, title text not null, discipline text, specification_ref text,
 status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','APPROVED_WITH_COMMENTS','REJECTED','RESUBMIT')),
 submitted_by uuid references auth.users(id), reviewer_user_id uuid references auth.users(id), due_date date,
 review_comments text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz, revision_no integer not null default 0,
 document_ids jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,submittal_no)
);
create table if not exists public.collaboration_drawings (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, drawing_no text not null, title text not null, discipline text, status text not null default 'CURRENT' check(status in ('DRAFT','CURRENT','SUPERSEDED','VOID')),
 current_revision text, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,drawing_no)
);
create table if not exists public.collaboration_drawing_revisions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 drawing_id uuid not null, revision text not null, revision_date date not null default current_date, description text, status text not null default 'CURRENT' check(status in ('CURRENT','SUPERSEDED','VOID')),
 document_id uuid, issued_by uuid references auth.users(id), created_at timestamptz not null default now(), unique(company_id,drawing_id,revision)
);
create table if not exists public.collaboration_transmittals (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, transmittal_no text not null, subject text not null, recipient_name text, recipient_user_id uuid references auth.users(id), purpose text,
 status text not null default 'SENT' check(status in ('DRAFT','SENT','ACKNOWLEDGED','CANCELLED')), sent_by uuid references auth.users(id), sent_at timestamptz, acknowledged_by uuid references auth.users(id), acknowledged_at timestamptz,
 item_ids jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,transmittal_no)
);
create table if not exists public.collaboration_site_instructions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, instruction_no text not null, subject text not null, instruction text not null, priority text not null default 'MEDIUM' check(priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
 status text not null default 'DRAFT' check(status in ('DRAFT','ISSUED','ACKNOWLEDGED','CLOSED','CANCELLED')),
 issued_by uuid references auth.users(id), assigned_to uuid references auth.users(id), due_date date, acknowledged_by uuid references auth.users(id), acknowledged_at timestamptz, closed_by uuid references auth.users(id), closed_at timestamptz,
 evidence jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,instruction_no)
);
create table if not exists public.collaboration_comments (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, entity_type text not null check(entity_type in ('RFI','SUBMITTAL','DRAWING','TRANSMITTAL','SITE_INSTRUCTION')),
 entity_id uuid not null, parent_id uuid, author_user_id uuid references auth.users(id), body text not null, mentions jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), edited_at timestamptz
);
create table if not exists public.collaboration_audit_events (
 id bigint generated always as identity primary key, company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null,
 entity_type text not null, entity_id uuid not null, action text not null, actor_user_id uuid references auth.users(id), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

alter table public.collaboration_rfis add constraint coll_rfi_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.collaboration_submittals add constraint coll_sub_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.collaboration_drawings add constraint coll_draw_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.collaboration_drawing_revisions add constraint coll_drawrev_drawing_tenant_fk foreign key(company_id,drawing_id) references public.collaboration_drawings(company_id,id) on delete cascade;
alter table public.collaboration_transmittals add constraint coll_trans_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.collaboration_site_instructions add constraint coll_si_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.collaboration_comments add constraint coll_comment_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.collaboration_comments add constraint coll_comment_parent_fk foreign key(parent_id) references public.collaboration_comments(id) on delete cascade;
alter table public.collaboration_audit_events add constraint coll_audit_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;

create index if not exists coll_rfi_project_status_idx on public.collaboration_rfis(company_id,project_id,status,due_date);
create index if not exists coll_sub_project_status_idx on public.collaboration_submittals(company_id,project_id,status,due_date);
create index if not exists coll_draw_project_idx on public.collaboration_drawings(company_id,project_id,drawing_no);
create index if not exists coll_trans_project_status_idx on public.collaboration_transmittals(company_id,project_id,status,created_at desc);
create index if not exists coll_si_project_status_idx on public.collaboration_site_instructions(company_id,project_id,status,due_date);
create index if not exists coll_comment_entity_idx on public.collaboration_comments(company_id,project_id,entity_type,entity_id,created_at);
create index if not exists coll_audit_entity_idx on public.collaboration_audit_events(company_id,project_id,entity_type,entity_id,created_at desc);

alter table public.collaboration_rfis enable row level security;
alter table public.collaboration_submittals enable row level security;
alter table public.collaboration_drawings enable row level security;
alter table public.collaboration_drawing_revisions enable row level security;
alter table public.collaboration_transmittals enable row level security;
alter table public.collaboration_site_instructions enable row level security;
alter table public.collaboration_comments enable row level security;
alter table public.collaboration_audit_events enable row level security;

do $$ declare t text; begin foreach t in array array['collaboration_rfis','collaboration_submittals','collaboration_drawings','collaboration_drawing_revisions','collaboration_transmittals','collaboration_site_instructions','collaboration_comments'] loop execute format('drop policy if exists %I_member_all on public.%I',t,t); execute format('create policy %I_member_all on public.%I for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id))',t,t); end loop; end $$;
drop policy if exists collaboration_audit_select on public.collaboration_audit_events;
drop policy if exists collaboration_audit_insert on public.collaboration_audit_events;
create policy collaboration_audit_select on public.collaboration_audit_events for select using(public.is_company_member(company_id));
create policy collaboration_audit_insert on public.collaboration_audit_events for insert with check(public.is_company_member(company_id));

create or replace function public.validate_v26_collaboration_links() returns trigger language plpgsql as $$
declare p uuid;
begin
 if tg_table_name='collaboration_drawing_revisions' then select project_id into p from public.collaboration_drawings where company_id=new.company_id and id=new.drawing_id; if p is null then raise exception 'Drawing does not belong to company' using errcode='23514'; end if; end if;
 if tg_table_name='collaboration_comments' then if not exists(select 1 from public.projects where company_id=new.company_id and id=new.project_id) then raise exception 'Comment project does not belong to company' using errcode='23514'; end if; end if;
 return new;
end; $$;
drop trigger if exists validate_v26_drawing_revisions on public.collaboration_drawing_revisions;
create trigger validate_v26_drawing_revisions before insert or update of company_id,drawing_id on public.collaboration_drawing_revisions for each row execute function public.validate_v26_collaboration_links();
drop trigger if exists validate_v26_comments on public.collaboration_comments;
create trigger validate_v26_comments before insert or update of company_id,project_id on public.collaboration_comments for each row execute function public.validate_v26_collaboration_links();

insert into public.permissions(key,description) values
('collaboration:read','View RFIs, submittals, drawings and stakeholder correspondence'),
('collaboration:manage','Create and manage RFIs, submittals, drawings, transmittals and site instructions'),
('collaboration:approve','Respond to and approve stakeholder workflows'),
('collaboration:comment','Comment on stakeholder collaboration records'),
('collaboration:respond','Respond to RFIs and acknowledge stakeholder correspondence') on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('collaboration:read','collaboration:manage','collaboration:approve','collaboration:comment','collaboration:respond');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','collaboration:read'),('SUPER_ADMIN','collaboration:manage'),('SUPER_ADMIN','collaboration:approve'),('SUPER_ADMIN','collaboration:comment'),('SUPER_ADMIN','collaboration:respond'),
('COMPANY_OWNER','collaboration:read'),('COMPANY_OWNER','collaboration:manage'),('COMPANY_OWNER','collaboration:approve'),('COMPANY_OWNER','collaboration:comment'),('COMPANY_OWNER','collaboration:respond'),
('COMPANY_ADMIN','collaboration:read'),('COMPANY_ADMIN','collaboration:manage'),('COMPANY_ADMIN','collaboration:approve'),('COMPANY_ADMIN','collaboration:comment'),('COMPANY_ADMIN','collaboration:respond'),
('DIRECTOR','collaboration:read'),('DIRECTOR','collaboration:manage'),('DIRECTOR','collaboration:approve'),('DIRECTOR','collaboration:comment'),('DIRECTOR','collaboration:respond'),
('PROJECT_MANAGER','collaboration:read'),('PROJECT_MANAGER','collaboration:manage'),('PROJECT_MANAGER','collaboration:approve'),('PROJECT_MANAGER','collaboration:comment'),('PROJECT_MANAGER','collaboration:respond'),
('SITE_ENGINEER','collaboration:read'),('SITE_ENGINEER','collaboration:manage'),('SITE_ENGINEER','collaboration:comment'),('SITE_ENGINEER','collaboration:respond'),
('SITE_SUPERVISOR','collaboration:read'),('SITE_SUPERVISOR','collaboration:comment'),('SITE_SUPERVISOR','collaboration:respond'),
('CLIENT','collaboration:read'),('CLIENT','collaboration:comment'),('CLIENT','collaboration:respond');
notify pgrst,'reload schema';
commit;
