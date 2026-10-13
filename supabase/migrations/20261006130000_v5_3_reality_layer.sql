-- V5.3 Reality Layer: drawing impact, field reality observations, QR traceability, as-built verification.
begin;
create table if not exists public.construction_reality_observations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, observation_type text not null check(observation_type in ('PHOTO','VIDEO','QR_SCAN','REALITY_NOTE','AS_BUILT')),
 title text not null, description text, captured_at timestamptz not null default now(), captured_by uuid not null references auth.users(id),
 latitude numeric(10,7), longitude numeric(10,7), accuracy_m numeric(10,2), location_label text,
 media jsonb not null default '[]'::jsonb, linked_drawing_id uuid, linked_revision_id uuid, linked_boq_item_id uuid,
 linked_workfront_id uuid, linked_schedule_activity_id uuid, metadata jsonb not null default '{}'::jsonb,
 status text not null default 'RECORDED' check(status in ('RECORDED','REVIEW_REQUIRED','VERIFIED','REJECTED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint reality_obs_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade,
 constraint reality_obs_drawing_fk foreign key(company_id,linked_drawing_id) references public.collaboration_drawings(company_id,id) on delete set null,
 constraint reality_obs_revision_fk foreign key(company_id,linked_revision_id) references public.collaboration_drawing_revisions(company_id,id) on delete set null
);
create table if not exists public.construction_drawing_impacts (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, drawing_id uuid not null, revision_id uuid not null, impact_type text not null check(impact_type in ('WORKFRONT','SCHEDULE','BOQ','PROCUREMENT','QUALITY','SAFETY','COMMERCIAL','EVIDENCE')),
 severity text not null default 'MEDIUM' check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')), affected_area text, explanation text not null,
 source_ids jsonb not null default '[]'::jsonb, status text not null default 'OPEN' check(status in ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
 owner_user_id uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint drawing_impact_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade,
 constraint drawing_impact_drawing_fk foreign key(company_id,drawing_id) references public.collaboration_drawings(company_id,id) on delete cascade,
 constraint drawing_impact_revision_fk foreign key(company_id,revision_id) references public.collaboration_drawing_revisions(company_id,id) on delete cascade
);
create table if not exists public.construction_reality_markers (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, marker_code text not null, marker_type text not null check(marker_type in ('ASSET','LOCATION','BOQ','WORKFRONT','EQUIPMENT','MATERIAL')),
 title text not null, description text, target_type text, target_id uuid, active boolean not null default true,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint reality_marker_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade,
 unique(company_id,marker_code)
);
create table if not exists public.construction_asbuilt_verifications (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, title text not null, reference_type text not null check(reference_type in ('DRAWING','BOQ','WORKFRONT','SCHEDULE','MARKER')),
 reference_id uuid, expected_value text, observed_value text, variance text, verification_status text not null default 'PENDING' check(verification_status in ('PENDING','PASS','VARIANCE','FAIL','WAIVED')),
 evidence_ids jsonb not null default '[]'::jsonb, verified_by uuid references auth.users(id), verified_at timestamptz, notes text,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint asbuilt_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade
);
create index if not exists reality_obs_project_time_idx on public.construction_reality_observations(company_id,project_id,captured_at desc);
create index if not exists reality_obs_drawing_idx on public.construction_reality_observations(company_id,linked_drawing_id,captured_at desc);
create index if not exists drawing_impacts_project_idx on public.construction_drawing_impacts(company_id,project_id,status,severity,created_at desc);
create index if not exists reality_markers_project_idx on public.construction_reality_markers(company_id,project_id,active);
create index if not exists asbuilt_project_idx on public.construction_asbuilt_verifications(company_id,project_id,verification_status,created_at desc);

create or replace function public.validate_v53_reality_links() returns trigger language plpgsql as $$
declare p uuid;
begin
 if new.linked_drawing_id is not null then select project_id into p from public.collaboration_drawings where company_id=new.company_id and id=new.linked_drawing_id; if p is null or p<>new.project_id then raise exception 'Linked drawing does not belong to project' using errcode='23514'; end if; end if;
 if new.linked_revision_id is not null then select d.project_id into p from public.collaboration_drawing_revisions r join public.collaboration_drawings d on d.company_id=r.company_id and d.id=r.drawing_id where r.company_id=new.company_id and r.id=new.linked_revision_id; if p is null or p<>new.project_id then raise exception 'Linked drawing revision does not belong to project' using errcode='23514'; end if; end if;
 if new.linked_workfront_id is not null then select project_id into p from public.project_workfronts where company_id=new.company_id and id=new.linked_workfront_id; if p is null or p<>new.project_id then raise exception 'Linked workfront does not belong to project' using errcode='23514'; end if; end if;
 if new.linked_schedule_activity_id is not null then select project_id into p from public.project_schedule_activities where company_id=new.company_id and id=new.linked_schedule_activity_id; if p is null or p<>new.project_id then raise exception 'Linked schedule activity does not belong to project' using errcode='23514'; end if; end if;
 if new.linked_boq_item_id is not null then select e.project_id into p from public.project_estimate_items i join public.project_estimates e on e.company_id=i.company_id and e.id=i.estimate_id where i.company_id=new.company_id and i.id=new.linked_boq_item_id; if p is null or p<>new.project_id then raise exception 'Linked BOQ item does not belong to project' using errcode='23514'; end if; end if;
 return new;
end; $$;
drop trigger if exists validate_v53_reality_links on public.construction_reality_observations;
create trigger validate_v53_reality_links before insert or update of company_id,project_id,linked_drawing_id,linked_revision_id on public.construction_reality_observations for each row execute function public.validate_v53_reality_links();

do $$ declare t text; begin foreach t in array array['construction_reality_observations','construction_drawing_impacts','construction_reality_markers','construction_asbuilt_verifications'] loop execute format('drop policy if exists %I_member_all on public.%I',t,t); execute format('alter table public.%I enable row level security',t); execute format('create policy %I_member_all on public.%I for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id))',t,t); end loop; end $$;

insert into public.permissions(key,description) values
('reality:read','View construction reality, drawing impacts and as-built verification'),
('reality:manage','Capture and manage construction reality evidence'),
('reality:verify','Verify as-built observations and reality evidence')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('reality:read','reality:manage','reality:verify');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','reality:read'),('SUPER_ADMIN','reality:manage'),('SUPER_ADMIN','reality:verify'),
('COMPANY_OWNER','reality:read'),('COMPANY_OWNER','reality:manage'),('COMPANY_OWNER','reality:verify'),
('COMPANY_ADMIN','reality:read'),('COMPANY_ADMIN','reality:manage'),('COMPANY_ADMIN','reality:verify'),
('DIRECTOR','reality:read'),('DIRECTOR','reality:manage'),('DIRECTOR','reality:verify'),
('PROJECT_MANAGER','reality:read'),('PROJECT_MANAGER','reality:manage'),('PROJECT_MANAGER','reality:verify'),
('SITE_ENGINEER','reality:read'),('SITE_ENGINEER','reality:manage'),('SITE_ENGINEER','reality:verify'),
('SITE_SUPERVISOR','reality:read'),('SITE_SUPERVISOR','reality:manage'),
('ACCOUNTANT','reality:read'),('CLIENT','reality:read');
commit;
