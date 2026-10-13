-- HySmart Build V1.6.1
-- Production invitation delivery + atomic acceptance hardening.

alter table public.company_invitations
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_provider text,
  add column if not exists email_provider_message_id text,
  add column if not exists email_last_error text;

create index if not exists company_invitations_pending_email_idx
  on public.company_invitations(lower(email), company_id, status, created_at desc);

create or replace function public.accept_company_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
) returns public.company_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.company_invitations;
  v_now timestamptz := now();
begin
  select * into v_invite
  from public.company_invitations
  where token_hash = p_token_hash
  for update;

  if not found or v_invite.status <> 'PENDING' then
    raise exception 'INVITATION_INVALID' using errcode='P0001';
  end if;

  if v_invite.expires_at <= v_now then
    update public.company_invitations
    set status='EXPIRED', updated_at=v_now
    where id=v_invite.id;
    raise exception 'INVITATION_EXPIRED' using errcode='P0001';
  end if;

  if lower(v_invite.email) <> lower(coalesce(p_email,'')) then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501';
  end if;

  if exists (
    select 1 from public.company_members
    where company_id=v_invite.company_id and user_id=p_user_id and status='ACTIVE'
  ) then
    raise exception 'ALREADY_COMPANY_MEMBER' using errcode='23505';
  end if;

  perform public.enforce_company_limit(v_invite.company_id, 'users', 1);

  insert into public.company_members(company_id,user_id,role,status,created_at,updated_at)
  values(v_invite.company_id,p_user_id,v_invite.role,'ACTIVE',v_now,v_now)
  on conflict(company_id,user_id) do update
    set role=excluded.role,status='ACTIVE',updated_at=v_now;

  update public.company_invitations
  set status='ACCEPTED', accepted_at=v_now, accepted_user_id=p_user_id, updated_at=v_now
  where id=v_invite.id
  returning * into v_invite;

  return v_invite;
end;
$$;

revoke all on function public.accept_company_invitation(text,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_company_invitation(text,uuid,text) to service_role;
