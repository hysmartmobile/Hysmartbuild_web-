-- RC25: customer care, company-owner feedback, and platform-owner monitoring.
-- Platform data is accessed only through authenticated backend service-role routes.
begin;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null,
  requester_email text,
  category text not null default 'HOW_TO' check (category in ('HOW_TO','BUG','BILLING','ACCOUNT','UPLOADS','OTHER')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  subject text not null check (char_length(trim(subject)) between 4 and 180),
  description text not null check (char_length(trim(description)) between 10 and 8000),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','WAITING_FOR_USER','RESOLVED','CLOSED')),
  response text,
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_company_created_idx on public.support_tickets(company_id,created_at desc);
create index if not exists support_tickets_status_created_idx on public.support_tickets(status,created_at desc);
alter table public.support_tickets enable row level security;

create table if not exists public.company_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  submitter_name text not null,
  rating integer not null check (rating between 1 and 5),
  category text not null default 'GENERAL' check (category in ('GENERAL','FEATURE_REQUEST','BUG_REPORT','USABILITY','BILLING')),
  subject text not null check (char_length(trim(subject)) between 4 and 180),
  message text not null check (char_length(trim(message)) between 10 and 8000),
  status text not null default 'NEW' check (status in ('NEW','REVIEWING','PLANNED','IN_PROGRESS','COMPLETED','DECLINED')),
  admin_response text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_feedback_created_idx on public.company_feedback(created_at desc);
create index if not exists company_feedback_status_idx on public.company_feedback(status,created_at desc);
alter table public.company_feedback enable row level security;

-- No end-user table policies are added: data is read/written through the authenticated
-- backend, which verifies active company membership and platform_admins membership.
commit;
