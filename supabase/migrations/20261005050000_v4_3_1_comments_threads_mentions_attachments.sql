-- V4.3.1 Comment & Reply Intelligence. Additive hardening of existing collaboration comments.
begin;

alter table public.collaboration_comments add column if not exists attachment_ids jsonb not null default '[]'::jsonb;
alter table public.collaboration_comments add column if not exists edited_by uuid references auth.users(id) on delete set null;
alter table public.collaboration_comments add column if not exists deleted_at timestamptz;
alter table public.collaboration_comments add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.collaboration_comments drop constraint if exists collaboration_comments_entity_type_check;
alter table public.collaboration_comments add constraint collaboration_comments_entity_type_check check(entity_type in (
 'RFI','SUBMITTAL','DRAWING','TRANSMITTAL','SITE_INSTRUCTION','TASK','ISSUE','PURCHASE_ORDER','NCR','SAFETY_INCIDENT','DAILY_REPORT','CHANGE_ORDER','WORKFRONT','PRODUCTION'
));

create index if not exists coll_comment_parent_idx on public.collaboration_comments(company_id,project_id,parent_id,created_at);
create index if not exists coll_comment_mentions_idx on public.collaboration_comments using gin(mentions);
create index if not exists coll_comment_attachments_idx on public.collaboration_comments using gin(attachment_ids);

-- Keep comment records tenant/project safe. Parent replies must remain inside the same thread.
create or replace function public.validate_v431_comment_links() returns trigger language plpgsql as $$
declare parent_company uuid; parent_project uuid; parent_type text; parent_entity uuid; p uuid;
begin
  if not exists(select 1 from public.projects where company_id=new.company_id and id=new.project_id) then
    raise exception 'Comment project does not belong to company' using errcode='23514';
  end if;
  if new.parent_id is not null then
    select company_id,project_id,entity_type,entity_id into parent_company,parent_project,parent_type,parent_entity
    from public.collaboration_comments where id=new.parent_id;
    if parent_company is null or parent_company<>new.company_id or parent_project<>new.project_id or parent_type<>new.entity_type or parent_entity<>new.entity_id then
      raise exception 'Comment parent must belong to the same project record' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists validate_v431_comments on public.collaboration_comments;
create trigger validate_v431_comments before insert or update of company_id,project_id,entity_type,entity_id,parent_id on public.collaboration_comments for each row execute function public.validate_v431_comment_links();

insert into public.permissions(key,description) values
 ('collaboration:comment:manage','Edit or remove collaboration comments and moderate threads')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role,permission_key) values
 ('SUPER_ADMIN','collaboration:comment:manage'),('COMPANY_OWNER','collaboration:comment:manage'),('COMPANY_ADMIN','collaboration:comment:manage'),('DIRECTOR','collaboration:comment:manage'),('PROJECT_MANAGER','collaboration:comment:manage')
on conflict do nothing;

notify pgrst,'reload schema';
commit;
