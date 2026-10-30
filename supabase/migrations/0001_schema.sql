-- Wapsi schema. Paytm systems are mocked here.
create extension if not exists pgcrypto;

create table public.merchants (
  id          text primary key,                       -- 'M001', 'F001'
  name        text not null,
  owner_name  text not null,
  area        text not null,
  language    text not null default 'hi' check (language in ('hi','mr','en')),
  phone       text,                                   -- fake in seed; real calls go to an allowlisted demo number
  cohort      text not null default 'wapsi' check (cohort in ('wapsi','holdout')),
  scripted    boolean not null default false,         -- the 5 demo cases
  created_at  timestamptz not null default now()
);

create table public.devices (
  id                 text primary key,                -- 'SB-M001'
  merchant_id        text not null references public.merchants(id) on delete cascade,
  model              text not null default 'Soundbox',
  status             text not null default 'healthy' check (status in
                       ('healthy','at_risk','fix_scheduled','awaiting_verification','handed_off','recovered')),
  fault              text not null default 'none' check (fault in ('none','speaker_fault','no_network','frozen')),
  rent_status        text not null default 'paid' check (rent_status in ('paid','failed')),
  monthly_rent       int  not null default 100,       -- ₹ per month
  last_announced_at  timestamptz not null default now(),  -- last time it spoke a payment
  at_risk_since      timestamptz,                     -- set when it entered the queue; never cleared
  updated_at         timestamptz not null default now()
);

create table public.daily_volume (
  device_id  text not null references public.devices(id) on delete cascade,
  day        date not null,
  txn_count  int  not null,
  amount     int  not null,                            -- ₹
  primary key (device_id, day)
);

create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  text not null references public.merchants(id) on delete cascade,
  settled_on   date not null,
  amount       int  not null                           -- ₹
);

create table public.tickets (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  text not null references public.merchants(id) on delete cascade,
  type         text not null check (type in ('settlement_query','device_issue','rent_dispute')),
  status       text not null default 'open' check (status in ('open','closed')),
  created_at   timestamptz not null default now()
);

create table public.calls (
  id                  uuid primary key default gen_random_uuid(),
  merchant_id         text not null references public.merchants(id) on delete cascade,
  device_id           text references public.devices(id) on delete set null,
  phone               text not null,
  bolna_execution_id  text unique,
  status              text not null default 'queued',  -- Bolna status string
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  duration_s          int,
  cost_cents          numeric,                          -- Bolna total_cost (cents)
  transcript          text,
  summary             text,
  outcome             text,  -- fix_scheduled | fixed_live | statement_sent | credit_applied | handed_off | no_answer
  raw                 jsonb
);

create table public.actions (
  id           bigint generated always as identity primary key,
  call_id      uuid references public.calls(id) on delete set null,
  merchant_id  text not null references public.merchants(id) on delete cascade,
  device_id    text references public.devices(id) on delete set null,
  type         text not null,  -- merchant_picked | call_started | diagnostics | technician_booked | statement_sent
                               -- | device_restarted | credit_applied | credit_refused | escalated | call_ended
                               -- | technician_visited | payments_resumed | human_takeover
  detail       text not null,  -- one sentence for the live feed; tool actions state the decision and why
  payload      jsonb not null default '{}'::jsonb,
  actor        text not null default 'agent' check (actor in ('agent','human','system')),
  created_at   timestamptz not null default now()
);

create table public.handoffs (
  id           uuid primary key default gen_random_uuid(),
  call_id      uuid references public.calls(id) on delete set null,
  merchant_id  text not null references public.merchants(id) on delete cascade,
  reason       text not null,
  summary      text not null,
  next_step    text,
  status       text not null default 'open' check (status in ('open','taken','closed')),
  created_at   timestamptz not null default now()
);

create index actions_created_at_idx on public.actions (created_at desc);
create index actions_call_id_idx    on public.actions (call_id);
create index calls_started_at_idx   on public.calls (started_at desc);
create index devices_status_idx     on public.devices (status);

-- At-risk queue: devices in the queue, with a score and the reason in plain words.
create view public.risk_queue with (security_invoker = true) as
with base as (
  select d.id, d.merchant_id, d.status, d.fault, d.rent_status,
         floor(extract(epoch from now() - d.last_announced_at) / 86400)::int as days_silent,
         (select avg(v.txn_count) from public.daily_volume v
            where v.device_id = d.id and v.day between current_date - 31 and current_date - 4) as baseline,
         (select coalesce(avg(v.txn_count), 0) from public.daily_volume v
            where v.device_id = d.id and v.day between current_date - 3 and current_date - 1) as recent,
         exists (select 1 from public.tickets t
                   where t.merchant_id = d.merchant_id and t.status = 'open') as open_ticket
  from public.devices d
  where d.status in ('at_risk','fix_scheduled','awaiting_verification','handed_off')
), scored as (
  select b.*,
         case when b.baseline > 0
              then greatest(0, round(100 * (1 - b.recent / b.baseline)))::int
              else 0 end as qr_drop_pct
  from base b
)
select s.id as device_id, s.merchant_id, m.name, m.owner_name, m.area, m.language, m.cohort, m.scripted,
       s.status, s.fault, s.rent_status, s.days_silent, s.qr_drop_pct, s.open_ticket,
       (case when s.days_silent >= 3 then 40 else 0 end
        + case when s.qr_drop_pct >= 60 then 30 else 0 end
        + case when s.rent_status = 'failed' then 20 else 0 end
        + case when s.open_ticket then 10 else 0 end) as risk_score,
       concat_ws(' · ',
         case when s.days_silent >= 3 then 'Silent ' || s.days_silent || ' days' end,
         case when s.qr_drop_pct >= 60 then 'QR −' || s.qr_drop_pct || '%' end,
         case when s.rent_status = 'failed' then 'Rent debit failed' end,
         case when s.open_ticket then 'Open complaint' end) as reason
from scored s
join public.merchants m on m.id = s.merchant_id;

-- Read-only access for the dashboard (publishable key). Writes go through the backend (secret key).
alter table public.merchants    enable row level security;
alter table public.devices      enable row level security;
alter table public.daily_volume enable row level security;
alter table public.settlements  enable row level security;
alter table public.tickets      enable row level security;
alter table public.calls        enable row level security;
alter table public.actions      enable row level security;
alter table public.handoffs     enable row level security;

create policy dashboard_read on public.merchants    for select to anon, authenticated using (true);
create policy dashboard_read on public.devices      for select to anon, authenticated using (true);
create policy dashboard_read on public.daily_volume for select to anon, authenticated using (true);
create policy dashboard_read on public.settlements  for select to anon, authenticated using (true);
create policy dashboard_read on public.tickets      for select to anon, authenticated using (true);
create policy dashboard_read on public.calls        for select to anon, authenticated using (true);
create policy dashboard_read on public.actions      for select to anon, authenticated using (true);
create policy dashboard_read on public.handoffs     for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

-- Live updates for the dashboard
alter publication supabase_realtime add table public.actions, public.calls, public.devices, public.handoffs;
