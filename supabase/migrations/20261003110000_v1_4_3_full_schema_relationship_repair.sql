-- HySmart Build V1.4.3 full schema/relationship repair
-- Safe to run repeatedly against databases that contain older HySmart migrations.
-- Repairs:
--   1. projects.progress
--   2. company_members -> profiles relationship
--   3. project_members -> profiles relationship (same PostgREST embedding pattern)
-- Attendance has two valid site relationships (direct site_id FK and tenant-safe composite FK).
-- The API explicitly selects the tenant-safe composite relationship.

begin;

-- ---------------------------------------------------------------------------
-- 1. Project progress used by the analytics dashboard.
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists progress integer;

update public.projects
set progress = 0
where progress is null;

alter table public.projects
  alter column progress set default 0,
  alter column progress set not null;

alter table public.projects
  drop constraint if exists projects_progress_check;

alter table public.projects
  add constraint projects_progress_check
  check (progress between 0 and 100);

-- ---------------------------------------------------------------------------
-- 2. Ensure every Auth user referenced by membership rows has a profile row.
-- Profiles are application metadata; auth.users remains the authentication source.
-- ---------------------------------------------------------------------------
insert into public.profiles(id, full_name)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Add explicit PostgREST relationships from membership tables to profiles.
-- Existing membership FKs to auth.users are retained.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_members_user_profile_fk'
      and conrelid = 'public.company_members'::regclass
  ) then
    alter table public.company_members
      add constraint company_members_user_profile_fk
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_members_user_profile_fk'
      and conrelid = 'public.project_members'::regclass
  ) then
    alter table public.project_members
      add constraint project_members_user_profile_fk
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

commit;

-- Tell PostgREST to refresh its relationship/schema cache.
notify pgrst, 'reload schema';
