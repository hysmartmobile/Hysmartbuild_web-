begin;

create table if not exists public.my_work_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid,
  entity_type text not null check (entity_type in ('REPORT','EXPENSE','SUBMITTAL','WORKFLOW_ACTION','SITE_INSTRUCTION','RFI','TASK','ISSUE','NOTIFICATION','MATERIAL_REQUEST','PROCUREMENT_REQUISITION','PURCHASE_ORDER','SUPPLIER_INVOICE','PURCHASE_QUOTATION','PAYROLL_RUN')),
  entity_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
  -- project_id is a historical reference; retain audit events if a project is removed.
);
create index if not exists my_work_events_actor_idx on public.my_work_events(company_id,actor_user_id,created_at desc);
create index if not exists my_work_events_entity_idx on public.my_work_events(company_id,entity_type,entity_id,created_at desc);
alter table public.my_work_events drop constraint if exists my_work_events_entity_type_check;
alter table public.my_work_events add constraint my_work_events_entity_type_check check (entity_type in ('REPORT','EXPENSE','SUBMITTAL','WORKFLOW_ACTION','SITE_INSTRUCTION','RFI','TASK','ISSUE','NOTIFICATION','MATERIAL_REQUEST','PROCUREMENT_REQUISITION','PURCHASE_ORDER','SUPPLIER_INVOICE','PURCHASE_QUOTATION','PAYROLL_RUN'));
alter table public.material_requests add column if not exists rejection_reason text;
alter table public.purchase_quotations add column if not exists decision_reason text;
alter table public.my_work_events enable row level security;
drop policy if exists my_work_events_actor_read on public.my_work_events;
create policy my_work_events_actor_read on public.my_work_events for select using (public.is_company_member(company_id) and actor_user_id=auth.uid());
drop policy if exists my_work_events_actor_insert on public.my_work_events;
create policy my_work_events_actor_insert on public.my_work_events for insert with check (public.is_company_member(company_id) and actor_user_id=auth.uid());

insert into public.permissions(key,description) values
 ('my-work:read','Read the signed-in user personal work inbox and workflow queues'),
 ('my-work:act','Perform eligible actions on personally assigned work items')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role,permission_key)
select roles.role, perms.permission_key
from (values
 ('SUPER_ADMIN'),('COMPANY_OWNER'),('COMPANY_ADMIN'),('DIRECTOR'),('PROJECT_MANAGER'),('SITE_ENGINEER'),('SITE_SUPERVISOR'),('ACCOUNTANT'),('STOREKEEPER'),('HR_MANAGER'),('WORKER'),('CLIENT'),('CEO'),('CIVIL_ENGINEER'),('MANAGEMENT'),('COMMERCIAL_MANAGER'),('QUANTITY_SURVEYOR'),('PROCUREMENT_OFFICER')
) as roles(role)
cross join (values ('my-work:read'),('my-work:act')) as perms(permission_key)
on conflict(role,permission_key) do nothing;

create or replace function public.perform_my_work_action(
  p_company_id uuid,
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_reason text default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_role text;
  v_permission text;
  v_project_id uuid;
  v_status text;
  v_owner uuid;
  v_assignee uuid;
  v_row jsonb;
  v_reason text := nullif(trim(coalesce(p_reason,'')), '');
  v_now timestamptz := now();
begin
  if p_user_id is null or not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=p_user_id and cm.status='ACTIVE') then
    raise exception 'MY_WORK_MEMBERSHIP_REQUIRED' using errcode='42501';
  end if;
  select role into v_role from public.company_members where company_id=p_company_id and user_id=p_user_id and status='ACTIVE';

  if p_action='REJECT' and v_reason is null then raise exception 'MY_WORK_REJECTION_REASON_REQUIRED' using errcode='22023'; end if;
  if p_action='APPROVE_WITH_COMMENTS' and v_reason is null then raise exception 'MY_WORK_REVIEW_COMMENT_REQUIRED' using errcode='22023'; end if;
  if p_entity_type='REPORT' and p_action in ('APPROVE','REJECT') then v_permission:='report:approve';
  elsif p_entity_type='EXPENSE' and p_action in ('APPROVE','REJECT') then v_permission:='expense:approve';
  elsif p_entity_type='SUBMITTAL' and p_action in ('APPROVE','APPROVE_WITH_COMMENTS','REJECT','START_REVIEW') then v_permission:='collaboration:approve';
  elsif p_entity_type='MATERIAL_REQUEST' and p_action in ('APPROVE','REJECT') then v_permission:='material:approve';
  elsif p_entity_type='PROCUREMENT_REQUISITION' and p_action in ('APPROVE','REJECT') then v_permission:='procurement:approve';
  elsif p_entity_type='PURCHASE_ORDER' and p_action in ('APPROVE','SEND','CANCEL') then v_permission:='procurement:approve';
  elsif p_entity_type='SUPPLIER_INVOICE' and p_action='APPROVE' then v_permission:='procurement:approve';
  elsif p_entity_type='PURCHASE_QUOTATION' and p_action in ('ACCEPT','REJECT','CANCEL') then v_permission:='procurement:approve';
  elsif p_entity_type='PAYROLL_RUN' and p_action in ('APPROVE','PAID','VOID') then v_permission:='payroll:approve';
  elsif p_entity_type='WORKFLOW_ACTION' and p_action in ('DONE','ACKNOWLEDGED','DISMISSED') then v_permission:='workflow:update';
  elsif p_entity_type='SITE_INSTRUCTION' and p_action='ACKNOWLEDGED' then v_permission:='collaboration:respond';
  elsif p_entity_type='RFI' and p_action='RESPOND' then v_permission:='collaboration:respond';
  elsif p_entity_type='TASK' and p_action in ('TODO','IN_PROGRESS','BLOCKED','COMPLETED') then v_permission:='task:update';
  elsif p_entity_type='ISSUE' and p_action in ('OPEN','IN_PROGRESS','RESOLVED','CLOSED') then v_permission:='issue:update';
  elsif p_entity_type='NOTIFICATION' and p_action='MARK_READ' then v_permission:='notification:update';
  else raise exception 'MY_WORK_ACTION_NOT_SUPPORTED' using errcode='22023'; end if;

  if not exists(select 1 from public.role_permissions rp where rp.role=v_role and rp.permission_key=v_permission) then
    raise exception 'MY_WORK_PERMISSION_DENIED' using errcode='42501';
  end if;

  if p_entity_type='REPORT' then
    select project_id,created_by,approval_status into v_project_id,v_owner,v_status from public.daily_site_reports where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_status is distinct from 'PENDING' then raise exception 'MY_WORK_CONFLICT_ALREADY_DECIDED' using errcode='40001'; end if;
    if v_owner=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
    if p_action='APPROVE' then update public.daily_site_reports set approval_status='APPROVED',approved_by=p_user_id,approved_at=v_now,rejection_reason=null where company_id=p_company_id and id=p_entity_id returning to_jsonb(daily_site_reports) into v_row;
    else update public.daily_site_reports set approval_status='REJECTED',approved_by=null,approved_at=null,rejection_reason=v_reason where company_id=p_company_id and id=p_entity_id returning to_jsonb(daily_site_reports) into v_row; end if;
  elsif p_entity_type='EXPENSE' then
    select project_id,submitted_by,status into v_project_id,v_owner,v_status from public.expenses where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_status<>'PENDING' then raise exception 'MY_WORK_CONFLICT_ALREADY_DECIDED' using errcode='40001'; end if;
    if v_owner=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
    update public.expenses set status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,approved_by=p_user_id,approved_at=v_now,rejection_reason=case when p_action='REJECT' then v_reason else null end,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(expenses) into v_row;
    insert into public.expense_approvals(id,company_id,expense_id,actor_user_id,decision,reason) values(gen_random_uuid(),p_company_id,p_entity_id,p_user_id,case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,v_reason);
  elsif p_entity_type='SUBMITTAL' then
    select project_id,submitted_by,reviewer_user_id,status into v_project_id,v_owner,v_assignee,v_status from public.collaboration_submittals where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'MY_WORK_CONFLICT_ALREADY_DECIDED' using errcode='40001'; end if;
    if v_owner=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
    if v_assignee is not null and v_assignee<>p_user_id then raise exception 'MY_WORK_ASSIGNMENT_REQUIRED' using errcode='42501'; end if;
    if p_action='START_REVIEW' then
      if v_status<>'SUBMITTED' then raise exception 'MY_WORK_CONFLICT_ALREADY_DECIDED' using errcode='40001'; end if;
      update public.collaboration_submittals set status='UNDER_REVIEW',updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(collaboration_submittals) into v_row;
    elsif p_action='APPROVE' then update public.collaboration_submittals set status='APPROVED',review_comments=v_reason,reviewed_by=p_user_id,reviewed_at=v_now,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(collaboration_submittals) into v_row;
    elsif p_action='APPROVE_WITH_COMMENTS' then update public.collaboration_submittals set status='APPROVED_WITH_COMMENTS',review_comments=v_reason,reviewed_by=p_user_id,reviewed_at=v_now,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(collaboration_submittals) into v_row;
    else update public.collaboration_submittals set status='REJECTED',review_comments=v_reason,reviewed_by=p_user_id,reviewed_at=v_now,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(collaboration_submittals) into v_row; end if;
  elsif p_entity_type='MATERIAL_REQUEST' then
    select project_id,requested_by,status into v_project_id,v_owner,v_status from public.material_requests where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_status<>'PENDING' then raise exception 'MY_WORK_CONFLICT_ALREADY_DECIDED' using errcode='40001'; end if;
    if v_owner=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
    update public.material_requests set status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,approved_by=p_user_id,approved_at=v_now,rejection_reason=case when p_action='REJECT' then v_reason else null end,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(material_requests) into v_row;
  elsif p_entity_type='PROCUREMENT_REQUISITION' then
    select project_id,requested_by,status into v_project_id,v_owner,v_status from public.purchase_requisitions where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_status<>'SUBMITTED' then raise exception 'MY_WORK_CONFLICT_ALREADY_DECIDED' using errcode='40001'; end if;
    if v_owner=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
    update public.purchase_requisitions set status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,approved_by=p_user_id,approved_at=case when p_action='APPROVE' then v_now else null end,rejection_reason=case when p_action='REJECT' then v_reason else null end,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(purchase_requisitions) into v_row;
  elsif p_entity_type='PURCHASE_ORDER' then
    select project_id,created_by,status into v_project_id,v_owner,v_status from public.purchase_orders where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if p_action='APPROVE' and v_owner=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
    if p_action='APPROVE' then
      if v_status<>'SUBMITTED' then raise exception 'MY_WORK_CONFLICT_ALREADY_DECIDED' using errcode='40001'; end if;
      update public.purchase_orders set status='APPROVED',approved_by=p_user_id,approved_at=v_now,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(purchase_orders) into v_row;
    elsif p_action='SEND' then
      if v_status not in ('SUBMITTED','APPROVED','SENT') then raise exception 'MY_WORK_CONFLICT_NOT_OPEN' using errcode='40001'; end if;
      update public.purchase_orders set status='SENT',updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(purchase_orders) into v_row;
    elsif p_action='CANCEL' then
      if v_status not in ('SUBMITTED','APPROVED','SENT') then raise exception 'MY_WORK_CONFLICT_NOT_OPEN' using errcode='40001'; end if;
      update public.purchase_orders set status='CANCELLED',updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(purchase_orders) into v_row;
    end if;
  elsif p_entity_type='PAYROLL_RUN' then
    select created_by,status into v_owner,v_status from public.payroll_runs where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if p_action='APPROVE' then
      if v_status<>'DRAFT' then raise exception 'MY_WORK_CONFLICT_ALREADY_DECIDED' using errcode='40001'; end if;
      if v_owner=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
      update public.payroll_runs set status='APPROVED',approved_by=p_user_id,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(payroll_runs) into v_row;
    elsif p_action='PAID' then
      if v_status<>'APPROVED' then raise exception 'MY_WORK_CONFLICT_NOT_OPEN' using errcode='40001'; end if;
      select public.transition_payroll_run_atomic(p_company_id,p_entity_id,p_user_id,'PAID',current_date) into v_row;
    elsif p_action='VOID' then
      if v_status not in ('DRAFT','APPROVED') then raise exception 'MY_WORK_CONFLICT_NOT_OPEN' using errcode='40001'; end if;
      select public.transition_payroll_run_atomic(p_company_id,p_entity_id,p_user_id,'VOID',null) into v_row;
    end if;
  elsif p_entity_type='PURCHASE_QUOTATION' then
    select q.created_by,q.status,r.project_id into v_owner,v_status,v_project_id from public.purchase_quotations q left join public.purchase_requisitions r on r.company_id=q.company_id and r.id=q.requisition_id where q.company_id=p_company_id and q.id=p_entity_id for update of q;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if p_action in ('ACCEPT','REJECT') and v_owner=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
    if p_action in ('ACCEPT','REJECT') then
      if v_status<>'SUBMITTED' then raise exception 'MY_WORK_CONFLICT_ALREADY_DECIDED' using errcode='40001'; end if;
      update public.purchase_quotations set status=case when p_action='ACCEPT' then 'ACCEPTED' else 'REJECTED' end,decision_reason=v_reason,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(purchase_quotations) into v_row;
    else
      if v_status not in ('DRAFT','SUBMITTED') then raise exception 'MY_WORK_CONFLICT_NOT_OPEN' using errcode='40001'; end if;
      update public.purchase_quotations set status='CANCELLED',decision_reason=v_reason,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(purchase_quotations) into v_row;
    end if;
  elsif p_entity_type='SUPPLIER_INVOICE' then
    select si.created_by,si.status,po.project_id into v_owner,v_status,v_project_id from public.supplier_invoices si left join public.purchase_orders po on po.company_id=si.company_id and po.id=si.purchase_order_id where si.company_id=p_company_id and si.id=p_entity_id for update of si;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_status<>'RECEIVED' then raise exception 'MY_WORK_CONFLICT_ALREADY_DECIDED' using errcode='40001'; end if;
    if v_owner=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
    select public.approve_supplier_invoice_atomic(p_company_id,p_entity_id,p_user_id) into v_row;
  elsif p_entity_type='WORKFLOW_ACTION' then
    select project_id,assigned_to,status into v_project_id,v_assignee,v_status from public.workflow_action_items where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_assignee is distinct from p_user_id then raise exception 'MY_WORK_ASSIGNMENT_REQUIRED' using errcode='42501'; end if;
    if v_status not in ('OPEN','ACKNOWLEDGED') then raise exception 'MY_WORK_CONFLICT_NOT_OPEN' using errcode='40001'; end if;
    update public.workflow_action_items set status=p_action,acknowledged_at=case when p_action='ACKNOWLEDGED' then v_now else acknowledged_at end,completed_at=case when p_action='DONE' then v_now else completed_at end,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(workflow_action_items) into v_row;
  elsif p_entity_type='SITE_INSTRUCTION' then
    select project_id,assigned_to,status into v_project_id,v_assignee,v_status from public.collaboration_site_instructions where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_assignee is distinct from p_user_id then raise exception 'MY_WORK_ASSIGNMENT_REQUIRED' using errcode='42501'; end if;
    if v_status<>'ISSUED' then raise exception 'MY_WORK_CONFLICT_NOT_OPEN' using errcode='40001'; end if;
    update public.collaboration_site_instructions set status='ACKNOWLEDGED',acknowledged_by=p_user_id,acknowledged_at=v_now,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(collaboration_site_instructions) into v_row;
  elsif p_entity_type='RFI' then
    if nullif(trim(coalesce(p_payload->>'response','')),'') is null then raise exception 'MY_WORK_RESPONSE_REQUIRED' using errcode='22023'; end if;
    select project_id,assigned_to,status into v_project_id,v_assignee,v_status from public.collaboration_rfis where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_assignee is distinct from p_user_id then raise exception 'MY_WORK_ASSIGNMENT_REQUIRED' using errcode='42501'; end if;
    if v_status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'MY_WORK_CONFLICT_NOT_OPEN' using errcode='40001'; end if;
    update public.collaboration_rfis set status='RESPONDED',response=trim(p_payload->>'response'),responded_by=p_user_id,responded_at=v_now,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(collaboration_rfis) into v_row;
  elsif p_entity_type='TASK' then
    select project_id,created_by,assigned_to,status into v_project_id,v_owner,v_assignee,v_status from public.tasks where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_assignee is distinct from p_user_id and v_owner is distinct from p_user_id then raise exception 'MY_WORK_ASSIGNMENT_REQUIRED' using errcode='42501'; end if;
    if v_status in ('COMPLETED','CANCELLED') then raise exception 'MY_WORK_CONFLICT_NOT_OPEN' using errcode='40001'; end if;
    update public.tasks set status=p_action,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(tasks) into v_row;
  elsif p_entity_type='ISSUE' then
    select project_id,created_by,assigned_to,status into v_project_id,v_owner,v_assignee,v_status from public.issues where company_id=p_company_id and id=p_entity_id for update;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
    if v_assignee is distinct from p_user_id and v_owner is distinct from p_user_id then raise exception 'MY_WORK_ASSIGNMENT_REQUIRED' using errcode='42501'; end if;
    if v_status in ('CLOSED','RESOLVED') then raise exception 'MY_WORK_CONFLICT_NOT_OPEN' using errcode='40001'; end if;
    update public.issues set status=p_action,updated_at=v_now where company_id=p_company_id and id=p_entity_id returning to_jsonb(issues) into v_row;
  elsif p_entity_type='NOTIFICATION' then
    update public.notifications set read_at=coalesce(read_at,v_now) where company_id=p_company_id and id=p_entity_id and recipient_user_id=p_user_id returning project_id,to_jsonb(notifications) into v_project_id,v_row;
    if not found then raise exception 'MY_WORK_NOT_FOUND' using errcode='P0002'; end if;
  end if;

  if v_project_id is not null and v_role not in ('SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','CEO','DIRECTOR','MANAGEMENT') and not exists(select 1 from public.project_members pm where pm.company_id=p_company_id and pm.project_id=v_project_id and pm.user_id=p_user_id and pm.status='ACTIVE') then
    raise exception 'MY_WORK_PROJECT_ACCESS_DENIED' using errcode='42501';
  end if;

  if p_entity_type in ('REPORT','EXPENSE','SUBMITTAL','MATERIAL_REQUEST','PROCUREMENT_REQUISITION','PURCHASE_ORDER','SUPPLIER_INVOICE','PURCHASE_QUOTATION','PAYROLL_RUN') and v_owner is not null and v_owner<>p_user_id then
    insert into public.notifications(company_id,project_id,recipient_user_id,actor_user_id,type,title,body)
    values(p_company_id,v_project_id,v_owner,p_user_id,'WORKFLOW_DECISION',
      case when p_action in ('APPROVE','APPROVE_WITH_COMMENTS','ACCEPT') then 'Your submission was approved' when p_action='REJECT' then 'Your submission was rejected' when p_action='PAID' then 'Payroll was marked paid' when p_action='VOID' then 'Payroll was voided' else 'Your workflow item was updated' end,
      left(coalesce(v_row->>'title',v_row->>'description',v_row->>'report_date',v_row->>'invoice_no',v_row->>'requisition_no',v_row->>'po_no',v_row->>'notes',p_entity_type)||case when v_reason is not null then ': '||v_reason else '' end,500));
  end if;

  if p_entity_type in ('SUBMITTAL','RFI','SITE_INSTRUCTION') and v_project_id is not null then
    insert into public.collaboration_audit_events(company_id,project_id,entity_type,entity_id,action,actor_user_id,metadata)
    values(p_company_id,v_project_id,p_entity_type,p_entity_id,p_action,p_user_id,jsonb_build_object('reason',v_reason,'resultStatus',coalesce(v_row->>'status',v_row->>'approval_status')));
  end if;

  insert into public.my_work_events(company_id,project_id,entity_type,entity_id,actor_user_id,action,reason,metadata)
  values(p_company_id,v_project_id,p_entity_type,p_entity_id,p_user_id,p_action,v_reason,jsonb_build_object('role',v_role,'source',p_entity_type,'resultStatus',coalesce(v_row->>'status',v_row->>'approval_status',v_row->>'read_at'),'payload',coalesce(p_payload,'{}'::jsonb)));
  return jsonb_build_object('item',v_row,'event',jsonb_build_object('entityType',p_entity_type,'entityId',p_entity_id,'action',p_action,'actorUserId',p_user_id,'reason',v_reason,'createdAt',v_now));
end;
$$;
revoke all on function public.perform_my_work_action(uuid,uuid,text,uuid,text,text,jsonb) from public,anon;
grant execute on function public.perform_my_work_action(uuid,uuid,text,uuid,text,text,jsonb) to service_role;


-- Harden the legacy RPCs too: authenticated clients must not bypass API RBAC by
-- calling the old expense approval/payment functions directly.
create or replace function public.approve_expense(
  p_company_id uuid, p_expense_id uuid, p_user_id uuid, p_decision text, p_reason text default null
) returns public.expenses
language plpgsql security definer set search_path=public as $$
declare v_expense public.expenses; v_role text;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTH_IDENTITY_MISMATCH' using errcode='42501'; end if;
  select role into v_role from public.company_members where company_id=p_company_id and user_id=p_user_id and status='ACTIVE';
  if v_role is null then raise exception 'COMPANY_ACCESS_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.role_permissions where role=v_role and permission_key='expense:approve') then raise exception 'MY_WORK_PERMISSION_DENIED' using errcode='42501'; end if;
  if p_decision not in ('APPROVED','REJECTED') then raise exception 'INVALID_DECISION' using errcode='22023'; end if;
  if p_decision='REJECTED' and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'MY_WORK_REJECTION_REASON_REQUIRED' using errcode='22023'; end if;
  select * into v_expense from public.expenses where company_id=p_company_id and id=p_expense_id for update;
  if not found then raise exception 'EXPENSE_NOT_FOUND' using errcode='P0002'; end if;
  if v_expense.status<>'PENDING' then raise exception 'EXPENSE_NOT_PENDING' using errcode='55000'; end if;
  if v_expense.submitted_by=p_user_id then raise exception 'MY_WORK_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
  if v_expense.project_id is not null and v_role not in ('SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','CEO','DIRECTOR','MANAGEMENT') and not exists(select 1 from public.project_members where company_id=p_company_id and project_id=v_expense.project_id and user_id=p_user_id and status='ACTIVE') then raise exception 'MY_WORK_PROJECT_ACCESS_DENIED' using errcode='42501'; end if;
  update public.expenses set status=p_decision,approved_by=p_user_id,approved_at=now(),rejection_reason=case when p_decision='REJECTED' then nullif(trim(p_reason),'') else null end,updated_at=now() where company_id=p_company_id and id=p_expense_id returning * into v_expense;
  insert into public.expense_approvals(id,company_id,expense_id,actor_user_id,decision,reason) values(gen_random_uuid(),p_company_id,p_expense_id,p_user_id,p_decision,nullif(trim(p_reason),''));
  if p_entity_type in ('SUBMITTAL','RFI','SITE_INSTRUCTION') and v_project_id is not null then
    insert into public.collaboration_audit_events(company_id,project_id,entity_type,entity_id,action,actor_user_id,metadata)
    values(p_company_id,v_project_id,p_entity_type,p_entity_id,p_action,p_user_id,jsonb_build_object('reason',v_reason,'resultStatus',coalesce(v_row->>'status',v_row->>'approval_status')));
  end if;

  insert into public.my_work_events(company_id,project_id,entity_type,entity_id,actor_user_id,action,reason,metadata) values(p_company_id,v_expense.project_id,'EXPENSE',p_expense_id,p_user_id,case when p_decision='APPROVED' then 'APPROVE' else 'REJECT' end,nullif(trim(p_reason),''),jsonb_build_object('role',v_role,'resultStatus',v_expense.status,'source','legacy_expense_rpc'));
  return v_expense;
end;
$$;
revoke all on function public.approve_expense(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.approve_expense(uuid,uuid,uuid,text,text) to authenticated,service_role;

create or replace function public.mark_expense_paid(
  p_company_id uuid, p_expense_id uuid, p_user_id uuid, p_reference text default null
) returns public.expenses
language plpgsql security definer set search_path=public as $$
declare v_expense public.expenses; v_role text;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTH_IDENTITY_MISMATCH' using errcode='42501'; end if;
  select role into v_role from public.company_members where company_id=p_company_id and user_id=p_user_id and status='ACTIVE';
  if v_role is null then raise exception 'COMPANY_ACCESS_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.role_permissions where role=v_role and permission_key='expense:pay') then raise exception 'MY_WORK_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into v_expense from public.expenses where company_id=p_company_id and id=p_expense_id for update;
  if not found then raise exception 'EXPENSE_NOT_FOUND' using errcode='P0002'; end if;
  if v_expense.status<>'APPROVED' then raise exception 'EXPENSE_NOT_APPROVED' using errcode='55000'; end if;
  if v_expense.project_id is not null and v_role not in ('SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','CEO','DIRECTOR','MANAGEMENT') and not exists(select 1 from public.project_members where company_id=p_company_id and project_id=v_expense.project_id and user_id=p_user_id and status='ACTIVE') then raise exception 'MY_WORK_PROJECT_ACCESS_DENIED' using errcode='42501'; end if;
  update public.expenses set status='PAID',updated_at=now() where company_id=p_company_id and id=p_expense_id returning * into v_expense;
  insert into public.financial_records(id,company_id,project_id,site_id,expense_id,record_type,reference,description,amount,currency,record_date,recorded_by)
  values(gen_random_uuid(),p_company_id,v_expense.project_id,v_expense.site_id,v_expense.id,'PAYMENT',nullif(trim(p_reference),''),v_expense.description,v_expense.amount,v_expense.currency,current_date,p_user_id);
  insert into public.my_work_events(company_id,project_id,entity_type,entity_id,actor_user_id,action,metadata) values(p_company_id,v_expense.project_id,'EXPENSE',p_expense_id,p_user_id,'MARK_PAID',jsonb_build_object('role',v_role,'reference',nullif(trim(p_reference),''),'resultStatus','PAID'));
  return v_expense;
end;
$$;
revoke all on function public.mark_expense_paid(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.mark_expense_paid(uuid,uuid,uuid,text) to authenticated,service_role;
revoke all on function public.approve_material_request(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.approve_material_request(uuid,uuid,uuid,boolean) to service_role;

commit;
