-- HySmart Build V5.2 — Construction Network
-- Controlled external operating network for clients, subcontractors, suppliers and consultants.
-- External users remain restricted to explicit project grants and never receive internal margin/cash data.
begin;
create extension if not exists pgcrypto;

alter table public.company_invitations add column if not exists network_type text;
alter table public.company_invitations add column if not exists network_project_id uuid;
alter table public.company_invitations drop constraint if exists company_invitations_network_type_check;
alter table public.company_invitations add constraint company_invitations_network_type_check check (network_type is null or network_type in ('CLIENT','SUBCONTRACTOR','SUPPLIER','CONSULTANT'));
alter table public.company_invitations add constraint company_invitations_network_project_fk foreign key (company_id,network_project_id) references public.projects(company_id,id) on delete cascade;

create table if not exists public.construction_network_participants (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 network_type text not null check (network_type in ('CLIENT','SUBCONTRACTOR','SUPPLIER','CONSULTANT')),
 organization_name text,
 contact_role text,
 phone text,
 status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','REVOKED')),
 invited_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,project_id,user_id),
 constraint network_participant_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade
);

create table if not exists public.construction_network_submissions (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null,
 participant_id uuid not null references public.construction_network_participants(id) on delete cascade,
 submission_type text not null check (submission_type in ('RFI','SUBMITTAL','PROGRESS','DOCUMENT','VARIATION','PAYMENT_REQUEST','DELIVERY_NOTICE','OTHER')),
 title text not null,
 description text,
 amount numeric(18,2),
 currency text,
 document_ids jsonb not null default '[]'::jsonb,
 source_reference text,
 status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','APPROVED_WITH_COMMENTS','REJECTED','RESUBMIT','WITHDRAWN')),
 reviewer_user_id uuid references auth.users(id),
 review_comments text,
 submitted_at timestamptz,
 reviewed_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint network_submission_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade,
 constraint network_submission_participant_project_fk foreign key(company_id,project_id,participant_id) references public.construction_network_participants(company_id,project_id,id) on delete cascade,
 constraint network_submission_amount_check check (amount is null or amount >= 0)
);

create table if not exists public.construction_network_commercial_exchanges (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null,
 participant_id uuid not null references public.construction_network_participants(id) on delete cascade,
 exchange_type text not null check (exchange_type in ('SUBCONTRACT_VALUATION','SUPPLIER_INVOICE','PAYMENT_REQUEST','VARIATION','CREDIT_NOTE','OTHER')),
 direction text not null check (direction in ('OUTBOUND','INBOUND')),
 reference_no text,
 description text not null,
 amount numeric(18,2) not null default 0 check (amount >= 0),
 currency text not null,
 status text not null default 'OPEN' check (status in ('OPEN','SUBMITTED','UNDER_REVIEW','APPROVED','PARTIALLY_PAID','PAID','REJECTED','CANCELLED')),
 source_type text,
 source_id uuid,
 visible_to_external boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint network_exchange_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade,
 constraint network_exchange_participant_project_fk foreign key(company_id,project_id,participant_id) references public.construction_network_participants(company_id,project_id,id) on delete cascade
);

create index if not exists network_participants_project_idx on public.construction_network_participants(company_id,project_id,status);
create index if not exists network_participants_user_idx on public.construction_network_participants(company_id,user_id,status);
create index if not exists network_submissions_project_idx on public.construction_network_submissions(company_id,project_id,status,created_at desc);
create index if not exists network_submissions_participant_idx on public.construction_network_submissions(company_id,participant_id,created_at desc);
create index if not exists network_exchanges_project_idx on public.construction_network_commercial_exchanges(company_id,project_id,status,created_at desc);
create index if not exists network_exchanges_participant_idx on public.construction_network_commercial_exchanges(company_id,participant_id,created_at desc);

create trigger construction_network_participants_updated_at before update on public.construction_network_participants for each row execute procedure public.set_updated_at();
create trigger construction_network_submissions_updated_at before update on public.construction_network_submissions for each row execute procedure public.set_updated_at();
create trigger construction_network_exchanges_updated_at before update on public.construction_network_commercial_exchanges for each row execute procedure public.set_updated_at();

alter table public.construction_network_participants enable row level security;
alter table public.construction_network_submissions enable row level security;
alter table public.construction_network_commercial_exchanges enable row level security;

create or replace function public.is_company_network_manager(target_company uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.company_members cm
    where cm.company_id=target_company and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role <> 'CLIENT'
  );
$$;

drop policy if exists network_participants_member_all on public.construction_network_participants;
drop policy if exists network_participants_select on public.construction_network_participants;
drop policy if exists network_participants_manage on public.construction_network_participants;
drop policy if exists network_submissions_member_all on public.construction_network_submissions;
drop policy if exists network_submissions_select on public.construction_network_submissions;
drop policy if exists network_submissions_insert on public.construction_network_submissions;
drop policy if exists network_submissions_manage on public.construction_network_submissions;
drop policy if exists network_exchanges_member_all on public.construction_network_commercial_exchanges;
drop policy if exists network_exchanges_select on public.construction_network_commercial_exchanges;
drop policy if exists network_exchanges_insert on public.construction_network_commercial_exchanges;
drop policy if exists network_exchanges_manage on public.construction_network_commercial_exchanges;

-- Internal company roles have full network management. External CLIENT users can only
-- read their own participant record and submit against their own active grant.
create policy network_participants_select on public.construction_network_participants for select
using (public.is_company_network_manager(company_id) or (public.is_company_member(company_id) and user_id=auth.uid()));
create policy network_participants_manage on public.construction_network_participants for all
using (public.is_company_network_manager(company_id))
with check (public.is_company_network_manager(company_id));

create policy network_submissions_select on public.construction_network_submissions for select
using (public.is_company_network_manager(company_id) or (public.is_company_member(company_id) and exists (select 1 from public.construction_network_participants np where np.id=participant_id and np.user_id=auth.uid() and np.status='ACTIVE')));
create policy network_submissions_insert on public.construction_network_submissions for insert
with check (public.is_company_network_manager(company_id) or (public.is_company_member(company_id) and exists (select 1 from public.construction_network_participants np where np.id=participant_id and np.company_id=construction_network_submissions.company_id and np.project_id=construction_network_submissions.project_id and np.user_id=auth.uid() and np.status='ACTIVE')));
create policy network_submissions_manage on public.construction_network_submissions for update using (public.is_company_network_manager(company_id)) with check (public.is_company_network_manager(company_id));
create policy network_submissions_delete on public.construction_network_submissions for delete using (public.is_company_network_manager(company_id));

create policy network_exchanges_select on public.construction_network_commercial_exchanges for select
using (public.is_company_network_manager(company_id) or (public.is_company_member(company_id) and visible_to_external=true and exists (select 1 from public.construction_network_participants np where np.id=participant_id and np.user_id=auth.uid() and np.status='ACTIVE')));
create policy network_exchanges_insert on public.construction_network_commercial_exchanges for insert
with check (public.is_company_network_manager(company_id) or (public.is_company_member(company_id) and exists (select 1 from public.construction_network_participants np where np.id=participant_id and np.company_id=construction_network_commercial_exchanges.company_id and np.project_id=construction_network_commercial_exchanges.project_id and np.user_id=auth.uid() and np.status='ACTIVE')));
create policy network_exchanges_manage on public.construction_network_commercial_exchanges for update using (public.is_company_network_manager(company_id)) with check (public.is_company_network_manager(company_id));
create policy network_exchanges_delete on public.construction_network_commercial_exchanges for delete using (public.is_company_network_manager(company_id));

insert into public.permissions(key,description) values
 ('network:read','Read controlled construction network portals'),
 ('network:manage','Manage external participants and network records'),
 ('network:submit','Submit and respond through the construction network'),
 ('network:approve','Review and approve network submissions'),
 ('network:commercial','Manage controlled external commercial exchanges')
on conflict(key) do update set description=excluded.description;

delete from public.role_permissions where permission_key in ('network:read','network:manage','network:submit','network:approve','network:commercial');
insert into public.role_permissions(role,permission_key) values
 ('SUPER_ADMIN','network:read'),('SUPER_ADMIN','network:manage'),('SUPER_ADMIN','network:submit'),('SUPER_ADMIN','network:approve'),('SUPER_ADMIN','network:commercial'),
 ('COMPANY_OWNER','network:read'),('COMPANY_OWNER','network:manage'),('COMPANY_OWNER','network:submit'),('COMPANY_OWNER','network:approve'),('COMPANY_OWNER','network:commercial'),
 ('COMPANY_ADMIN','network:read'),('COMPANY_ADMIN','network:manage'),('COMPANY_ADMIN','network:submit'),('COMPANY_ADMIN','network:approve'),('COMPANY_ADMIN','network:commercial'),
 ('DIRECTOR','network:read'),('DIRECTOR','network:manage'),('DIRECTOR','network:submit'),('DIRECTOR','network:approve'),('DIRECTOR','network:commercial'),
 ('PROJECT_MANAGER','network:read'),('PROJECT_MANAGER','network:manage'),('PROJECT_MANAGER','network:submit'),('PROJECT_MANAGER','network:approve'),('PROJECT_MANAGER','network:commercial'),
 ('SITE_ENGINEER','network:read'),('SITE_ENGINEER','network:submit'),('SITE_ENGINEER','network:approve'),
 ('SITE_SUPERVISOR','network:read'),('SITE_SUPERVISOR','network:submit'),
 ('ACCOUNTANT','network:read'),('ACCOUNTANT','network:commercial'),
 ('CLIENT','network:read'),('CLIENT','network:submit');

commit;
