begin;

-- HySmart Build uses the Node API as the data plane; the browser uses Supabase
-- Auth and time-limited signed Storage URLs, not direct public-schema table CRUD.
-- Remove direct table grants that would let a signed-in member bypass API RBAC
-- and read/write another role's operational, financial or personnel records.
revoke all on all tables in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
-- Business RPCs are consumed by the authenticated Node API using the service
-- role. Do not expose SECURITY DEFINER functions as anonymous/authenticated RPC
-- endpoints: browser navigation hiding is not an authorization boundary.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public grant execute on functions to service_role;

-- Audit records must be written only by trusted backend/RPC paths. A company
-- member must never be able to fabricate their own audit trail via direct API.
drop policy if exists my_work_events_actor_insert on public.my_work_events;
revoke insert, update, delete, truncate, references, trigger on public.my_work_events from public, anon, authenticated;

-- The legacy approval/payment RPCs are also called by the Node API using the
-- Supabase service-role client. Permit that trusted path while still binding
-- direct authenticated calls to auth.uid(). All business authorization remains
-- checked against active company membership and role_permissions.
create or replace function public.approve_expense(
  p_company_id uuid, p_expense_id uuid, p_user_id uuid, p_decision text, p_reason text default null
) returns public.expenses
language plpgsql security definer set search_path=public as $$
declare
  v_expense public.expenses;
  v_role text;
  v_reason text := nullif(trim(coalesce(p_reason,'')), '');
  v_now timestamptz := now();
begin
  if coalesce(auth.role(),'') <> 'service_role' and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'AUTH_IDENTITY_MISMATCH' using errcode='42501';
  end if;
  select role into v_role from public.company_members
   where company_id=p_company_id and user_id=p_user_id and status='ACTIVE';
  if v_role is null then raise exception 'COMPANY_ACCESS_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.role_permissions where role=v_role and permission_key='expense:approve') then
    raise exception 'MY_WORK_PERMISSION_DENIED' using errcode='42501';
  end if;
  if p_decision not in ('APPROVED','REJECTED') then raise exception 'INVALID_DECISION' using errcode='22023'; end if;
  if p_decision='REJECTED' and v_reason is null then raise exception 'MY_WORK_REJECTION_REASON_REQUIRED' using errcode='22023'; end if;
  select * into v_expense from public.expenses where company_id=p_company_id and id=p_expense_id for update;
  if not found then raise exception 'EXPENSE_NOT_FOUND' using errcode='P0002'; end if;
  if v_expense.status<>'PENDING' then raise exception 'EXPENSE_NOT_PENDING' using errcode='55000'; end if;
  if v_expense.submitted_by=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
  if v_expense.project_id is not null
     and v_role not in ('SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','CEO','DIRECTOR','MANAGEMENT')
     and not exists(select 1 from public.project_members where company_id=p_company_id and project_id=v_expense.project_id and user_id=p_user_id and status='ACTIVE') then
    raise exception 'MY_WORK_PROJECT_ACCESS_DENIED' using errcode='42501';
  end if;
  update public.expenses
     set status=p_decision, approved_by=p_user_id,
         approved_at=case when p_decision='APPROVED' then v_now else null end,
         rejection_reason=case when p_decision='REJECTED' then v_reason else null end,
         updated_at=v_now
   where company_id=p_company_id and id=p_expense_id returning * into v_expense;
  insert into public.expense_approvals(id,company_id,expense_id,actor_user_id,decision,reason)
  values(gen_random_uuid(),p_company_id,p_expense_id,p_user_id,p_decision,v_reason);
  insert into public.my_work_events(company_id,project_id,entity_type,entity_id,actor_user_id,action,reason,metadata)
  values(p_company_id,v_expense.project_id,'EXPENSE',p_expense_id,p_user_id,
         case when p_decision='APPROVED' then 'APPROVE' else 'REJECT' end,v_reason,
         jsonb_build_object('role',v_role,'resultStatus',v_expense.status,'source','legacy_expense_rpc'));
  if v_expense.submitted_by<>p_user_id then
    insert into public.notifications(company_id,project_id,recipient_user_id,actor_user_id,type,title,body)
    values(p_company_id,v_expense.project_id,v_expense.submitted_by,p_user_id,'WORKFLOW_DECISION',
      case when p_decision='APPROVED' then 'Expense approved' else 'Expense returned/rejected' end,
      left(coalesce(v_expense.description,'Expense') || case when v_reason is not null then ': '||v_reason else '' end,500));
  end if;
  return v_expense;
end;
$$;
revoke all on function public.approve_expense(uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.approve_expense(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.mark_expense_paid(
  p_company_id uuid, p_expense_id uuid, p_user_id uuid, p_reference text default null
) returns public.expenses
language plpgsql security definer set search_path=public as $$
declare
  v_expense public.expenses;
  v_role text;
  v_now timestamptz := now();
  v_reference text := nullif(trim(coalesce(p_reference,'')), '');
begin
  if coalesce(auth.role(),'') <> 'service_role' and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'AUTH_IDENTITY_MISMATCH' using errcode='42501';
  end if;
  select role into v_role from public.company_members
   where company_id=p_company_id and user_id=p_user_id and status='ACTIVE';
  if v_role is null then raise exception 'COMPANY_ACCESS_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.role_permissions where role=v_role and permission_key='expense:pay') then
    raise exception 'MY_WORK_PERMISSION_DENIED' using errcode='42501';
  end if;
  select * into v_expense from public.expenses where company_id=p_company_id and id=p_expense_id for update;
  if not found then raise exception 'EXPENSE_NOT_FOUND' using errcode='P0002'; end if;
  if v_expense.status<>'APPROVED' then raise exception 'EXPENSE_NOT_APPROVED' using errcode='55000'; end if;
  if v_expense.project_id is not null
     and v_role not in ('SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','CEO','DIRECTOR','MANAGEMENT')
     and not exists(select 1 from public.project_members where company_id=p_company_id and project_id=v_expense.project_id and user_id=p_user_id and status='ACTIVE') then
    raise exception 'MY_WORK_PROJECT_ACCESS_DENIED' using errcode='42501';
  end if;
  update public.expenses set status='PAID',updated_at=v_now
   where company_id=p_company_id and id=p_expense_id returning * into v_expense;
  insert into public.financial_records(id,company_id,project_id,site_id,expense_id,record_type,reference,description,amount,currency,record_date,recorded_by)
  values(gen_random_uuid(),p_company_id,v_expense.project_id,v_expense.site_id,v_expense.id,'PAYMENT',v_reference,
         v_expense.description,v_expense.amount,v_expense.currency,current_date,p_user_id);
  insert into public.my_work_events(company_id,project_id,entity_type,entity_id,actor_user_id,action,metadata)
  values(p_company_id,v_expense.project_id,'EXPENSE',p_expense_id,p_user_id,'MARK_PAID',
         jsonb_build_object('role',v_role,'reference',v_reference,'resultStatus','PAID'));
  if v_expense.submitted_by<>p_user_id then
    insert into public.notifications(company_id,project_id,recipient_user_id,actor_user_id,type,title,body)
    values(p_company_id,v_expense.project_id,v_expense.submitted_by,p_user_id,'WORKFLOW_DECISION','Expense paid',
           left(coalesce(v_expense.description,'Expense') || case when v_reference is not null then ' · Reference: '||v_reference else '' end,500));
  end if;
  return v_expense;
end;
$$;
revoke all on function public.mark_expense_paid(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.mark_expense_paid(uuid,uuid,uuid,text) to service_role;

-- Explicit hand-offs: an RFI submission goes to its assigned responder; a
-- response returns to the originator. Site instructions go to the assigned
-- field person when issued, and acknowledgement returns to the issuer.
create or replace function public.notify_rfi_handoff() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.status='SUBMITTED' and old.status is distinct from new.status and new.assigned_to is not null and new.assigned_to is distinct from new.raised_by then
    insert into public.notifications(company_id,project_id,recipient_user_id,actor_user_id,type,title,body)
    values(new.company_id,new.project_id,new.assigned_to,new.raised_by,'RFI_ASSIGNED','RFI requires your response',
           left('RFI '||new.rfi_no||' · '||new.subject||': '||new.question,500));
  elsif new.status='RESPONDED' and old.status is distinct from new.status and new.raised_by is not null and new.raised_by is distinct from new.responded_by then
    insert into public.notifications(company_id,project_id,recipient_user_id,actor_user_id,type,title,body)
    values(new.company_id,new.project_id,new.raised_by,new.responded_by,'RFI_RESPONSE','RFI response received',
           left('RFI '||new.rfi_no||' · '||new.subject||': '||coalesce(new.response,''),500));
  end if;
  return new;
end;
$$;
drop trigger if exists rfi_handoff_notifications on public.collaboration_rfis;
create trigger rfi_handoff_notifications after update of status on public.collaboration_rfis
for each row execute function public.notify_rfi_handoff();

create or replace function public.notify_site_instruction_handoff() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.status='ISSUED' and old.status is distinct from new.status and new.assigned_to is not null and new.assigned_to is distinct from new.issued_by then
    insert into public.notifications(company_id,project_id,recipient_user_id,actor_user_id,type,title,body)
    values(new.company_id,new.project_id,new.assigned_to,new.issued_by,'SITE_INSTRUCTION_ISSUED','New site instruction',
           left('Instruction '||new.instruction_no||' · '||new.subject||': '||new.instruction,500));
  elsif new.status='ACKNOWLEDGED' and old.status is distinct from new.status and new.issued_by is not null and new.issued_by is distinct from new.acknowledged_by then
    insert into public.notifications(company_id,project_id,recipient_user_id,actor_user_id,type,title,body)
    values(new.company_id,new.project_id,new.issued_by,new.acknowledged_by,'SITE_INSTRUCTION_ACKNOWLEDGED','Site instruction acknowledged',
           left('Instruction '||new.instruction_no||' · '||new.subject||' was acknowledged.',500));
  end if;
  return new;
end;
$$;
drop trigger if exists site_instruction_handoff_notifications on public.collaboration_site_instructions;
create trigger site_instruction_handoff_notifications after update of status on public.collaboration_site_instructions
for each row execute function public.notify_site_instruction_handoff();

-- Re-apply the least-privilege function policy after defining this migration's
-- functions, so no explicit or inherited historical grant re-exposes RPCs.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

commit;
