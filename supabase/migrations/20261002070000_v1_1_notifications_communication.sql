-- V1.1 Notifications & Communication
create table public.project_messages (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, sender_user_id uuid not null references auth.users(id), recipient_user_id uuid references auth.users(id),
 body text not null check(length(trim(body)) between 1 and 4000), created_at timestamptz not null default now(), edited_at timestamptz
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id), actor_user_id uuid references auth.users(id),
 type text not null, title text not null, body text not null, project_id uuid, message_id uuid,
 read_at timestamptz, created_at timestamptz not null default now()
);
alter table public.project_messages add constraint project_messages_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.notifications add constraint notifications_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.notifications add constraint notifications_message_fk foreign key(message_id) references public.project_messages(id) on delete cascade;
create index project_messages_company_project_created_idx on public.project_messages(company_id,project_id,created_at desc);
create index project_messages_recipient_idx on public.project_messages(company_id,recipient_user_id,created_at desc);
create index notifications_recipient_unread_idx on public.notifications(company_id,recipient_user_id,read_at,created_at desc);
alter table public.project_messages enable row level security; alter table public.notifications enable row level security;
create policy project_messages_member_all on public.project_messages for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy notifications_member_all on public.notifications for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
insert into public.permissions(key,description) values
('message:create','Send project messages'),('message:read','Read project messages'),('notification:read','Read notifications'),('notification:update','Mark notifications read') on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('message:create','message:read','notification:read','notification:update');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','message:create'),('SUPER_ADMIN','message:read'),('SUPER_ADMIN','notification:read'),('SUPER_ADMIN','notification:update'),
('COMPANY_OWNER','message:create'),('COMPANY_OWNER','message:read'),('COMPANY_OWNER','notification:read'),('COMPANY_OWNER','notification:update'),
('COMPANY_ADMIN','message:create'),('COMPANY_ADMIN','message:read'),('COMPANY_ADMIN','notification:read'),('COMPANY_ADMIN','notification:update'),
('DIRECTOR','message:create'),('DIRECTOR','message:read'),('DIRECTOR','notification:read'),('DIRECTOR','notification:update'),
('PROJECT_MANAGER','message:create'),('PROJECT_MANAGER','message:read'),('PROJECT_MANAGER','notification:read'),('PROJECT_MANAGER','notification:update'),
('SITE_ENGINEER','message:create'),('SITE_ENGINEER','message:read'),('SITE_ENGINEER','notification:read'),('SITE_ENGINEER','notification:update'),
('SITE_SUPERVISOR','message:create'),('SITE_SUPERVISOR','message:read'),('SITE_SUPERVISOR','notification:read'),('SITE_SUPERVISOR','notification:update'),
('ACCOUNTANT','message:read'),('ACCOUNTANT','notification:read'),('ACCOUNTANT','notification:update'),
('STOREKEEPER','message:read'),('STOREKEEPER','notification:read'),('STOREKEEPER','notification:update'),
('HR_MANAGER','message:create'),('HR_MANAGER','message:read'),('HR_MANAGER','notification:read'),('HR_MANAGER','notification:update'),
('WORKER','message:read'),('WORKER','notification:read'),('WORKER','notification:update'),
('CLIENT','message:read'),('CLIENT','notification:read'),('CLIENT','notification:update');
create or replace function public.send_project_message(p_company_id uuid,p_project_id uuid,p_sender_user_id uuid,p_recipient_user_id uuid,p_body text)
returns public.project_messages language plpgsql security definer set search_path=public as $$
declare v_message public.project_messages; v_recipient uuid;
begin
 if auth.uid() is null or auth.uid() <> p_sender_user_id then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.company_members where company_id=p_company_id and user_id=p_sender_user_id and status='ACTIVE') then raise exception 'MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.projects where company_id=p_company_id and id=p_project_id) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if p_recipient_user_id is not null and not exists(select 1 from public.company_members where company_id=p_company_id and user_id=p_recipient_user_id and status='ACTIVE') then raise exception 'RECIPIENT_NOT_MEMBER'; end if;
 insert into public.project_messages(company_id,project_id,sender_user_id,recipient_user_id,body) values(p_company_id,p_project_id,p_sender_user_id,p_recipient_user_id,trim(p_body)) returning * into v_message;
 if p_recipient_user_id is not null then
   insert into public.notifications(company_id,recipient_user_id,actor_user_id,type,title,body,project_id,message_id)
   select p_company_id,p_recipient_user_id,p_sender_user_id,'PROJECT_MESSAGE', 'New project message', left(trim(p_body),240), p_project_id,v_message.id;
 else
   for v_recipient in select distinct user_id from public.project_members where company_id=p_company_id and project_id=p_project_id and status='ACTIVE' and user_id<>p_sender_user_id loop
     insert into public.notifications(company_id,recipient_user_id,actor_user_id,type,title,body,project_id,message_id)
     values(p_company_id,v_recipient,p_sender_user_id,'PROJECT_MESSAGE','New project message',left(trim(p_body),240),p_project_id,v_message.id);
   end loop;
 end if;
 return v_message;
end; $$;
revoke all on function public.send_project_message(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.send_project_message(uuid,uuid,uuid,uuid,text) to authenticated;
