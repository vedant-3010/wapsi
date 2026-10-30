-- Demo seed (SPEC §5). Rebuilds every table relative to today; call it via POST /api/demo/reset.
-- Scripted merchants M001–M005 get exact volumes so risk_queue shows exact reasons
-- ("Silent 4 days · QR −80%"); fillers F001–F200 are deterministic noise around them.
create or replace function public.seed_demo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  surnames text[] := array['Patel','Shah','Iyer','Khan','Gupta','Naik','Pawar','Desai','Mehta','Kulkarni',
                           'Jain','Rao','Sawant','Qureshi','Pillai','Chavan','Bhatt','Kamath','Ansari','More'];
  firsts   text[] := array['Rajesh','Priya','Suresh','Ayesha','Vikram','Meena','Ganesh','Kavita','Arjun','Sneha',
                           'Mahesh','Lakshmi','Santosh','Farhan','Deepa','Prakash','Nisha','Anand','Rukhsar','Sunil'];
  shops    text[] := array['Kirana','Medical','Tea Stall','Stationers','Bakery','Fruits','Mobile Shop','Hardware',
                           'Tailors','Snacks'];
  areas    text[] := array['Borivali','Ghatkopar','Malad','Chembur','Vashi','Goregaon','Mulund','Powai','Sion',
                           'Lower Parel','Matunga','Vile Parle'];
begin
  perform setseed(0.42);

  truncate public.actions, public.handoffs, public.calls, public.tickets, public.settlements,
           public.daily_volume, public.devices, public.merchants
    restart identity cascade;

  -- The five scripted merchants -------------------------------------------------------------

  insert into public.merchants (id, name, owner_name, area, language, phone, cohort, scripted) values
    ('M001', 'Sharma General Store', 'Ramesh Sharma',   'Dadar',        'hi', '+910000000001', 'wapsi', true),
    ('M002', 'Patil Medical',        'Sunita Patil',    'Andheri East', 'mr', '+910000000002', 'wapsi', true),
    ('M003', 'Shaikh Chai Corner',   'Imran Shaikh',    'Kurla',        'hi', '+910000000003', 'wapsi', true),
    ('M004', 'Joshi Stationers',     'Anil Joshi',      'Thane',        'mr', '+910000000004', 'wapsi', true),
    ('M005', 'Fernandes Bakery',     'Maria Fernandes', 'Bandra',       'hi', '+910000000005', 'wapsi', true);

  -- "+ 2 hours" keeps days_silent stable for ~22 hours after a reset.
  insert into public.devices (id, merchant_id, status, fault, rent_status, last_announced_at, at_risk_since) values
    ('SB-M001', 'M001', 'at_risk', 'speaker_fault', 'paid',   now() - interval '4 days 2 hours', now() - interval '12 hours'),
    ('SB-M002', 'M002', 'at_risk', 'no_network',    'paid',   now() - interval '3 days 2 hours', now() - interval '12 hours'),
    ('SB-M003', 'M003', 'at_risk', 'none',          'paid',   now() - interval '1 day 2 hours',  now() - interval '12 hours'),
    ('SB-M004', 'M004', 'at_risk', 'none',          'failed', now() - interval '1 day 2 hours',  now() - interval '12 hours'),
    ('SB-M005', 'M005', 'at_risk', 'none',          'paid',   now() - interval '2 days 2 hours', now() - interval '12 hours');

  -- 30 days ending yesterday. Days 4–30 average exactly `base` (offsets −5/0/+5, nine each);
  -- days 1–3 are `recent`, so the QR drop rounds to exactly 80 / 90 / 70 / 65 / 90 %.
  insert into public.daily_volume (device_id, day, txn_count, amount)
  select s.device_id, current_date - d, v.txn, v.txn * s.ticket
  from (values ('SB-M001', 45, 180, array[8, 9, 10]),
               ('SB-M002', 60, 260, array[5, 6, 7]),
               ('SB-M003', 80,  40, array[22, 24, 26]),
               ('SB-M004', 35, 120, array[12, 12, 13]),
               ('SB-M005', 50, 150, array[4, 5, 6])) as s(device_id, base, ticket, recent)
  cross join generate_series(1, 30) as d
  cross join lateral (
    select case when d <= 3 then s.recent[d] else s.base + (array[-5, 0, 5])[d % 3 + 1] end as txn
  ) v;

  insert into public.settlements (merchant_id, settled_on, amount) values
    ('M001', current_date - 3, 18450),
    ('M002', current_date - 4, 22100),
    ('M003', current_date - 5,  6200),
    ('M004', current_date - 6,  9800),
    ('M005', current_date - 7, 12300);

  insert into public.tickets (merchant_id, type, status, created_at) values
    ('M003', 'settlement_query', 'open', now() - interval '2 days'),
    ('M004', 'rent_dispute',     'open', now() - interval '1 day');

  -- 200 fillers ---------------------------------------------------------------------------
  -- k = 1..30 marks the at-risk fillers (i % 20 in 3, 10, 17); odd k → wapsi, even k → holdout.
  -- combo = (k - 1) / 3 picks one or two signals, never "silent + QR drop" (that scores 70),
  -- so every filler scores 60 or less and M001 / M002 stay on top.

  create temp table _fill on commit drop as
  with f as (
    select i,
           case when i % 20 in (3, 10, 17)
                then 3 * (i / 20) + case i % 20 when 3 then 1 when 10 then 2 else 3 end end as k
    from generate_series(1, 200) as i
  ), c as (
    select f.*, (f.k - 1) / 3 as combo from f
  )
  select c.i,
         'F' || lpad(c.i::text, 3, '0') as id,
         surnames[(c.i - 1) % 20 + 1] || ' ' || shops[((c.i - 1) / 20 + c.i) % 10 + 1] as name,  -- 200 unique
         firsts[((c.i - 1) * 7) % 20 + 1] || ' ' || surnames[(c.i - 1) % 20 + 1] as owner_name,
         areas[((c.i - 1) * 5) % 12 + 1] as area,
         case when c.i % 4 = 0 then 'mr' when c.i % 10 = 7 then 'en' else 'hi' end as language,
         '+91' || lpad((1000 + c.i)::text, 10, '0') as phone,
         c.k,
         case when c.k % 2 = 0 then 'holdout' else 'wapsi' end as cohort,
         20 + floor(random() * 61)::int as base,           -- 20–80 txns a day
         80 + floor(random() * 171)::int as ticket,        -- ₹80–250 a txn
         5 + floor(random() * 296)::int as quiet_mins,     -- healthy devices spoke minutes ago
         case when c.combo in (0, 4, 5) then 3 + c.k % 4 else 0 end as silent_days,                  -- 3–6
         case when c.combo in (1, 6, 7, 9) then 65 + floor(random() * 31)::int else 0 end as drop_pct, -- 65–95
         coalesce(c.combo in (2, 4, 6, 8), false) as rent_failed,
         case when c.combo in (3, 5, 7, 8)
              then (array['device_issue', 'settlement_query', 'rent_dispute'])[c.k % 3 + 1] end as ticket_type
  from c
  order by c.i;

  insert into public.merchants (id, name, owner_name, area, language, phone, cohort, scripted)
  select id, name, owner_name, area, language, phone, cohort, false from _fill order by i;

  insert into public.devices (id, merchant_id, status, fault, rent_status, last_announced_at, at_risk_since)
  select 'SB-' || id, id,
         case when k is null then 'healthy' else 'at_risk' end,
         case when silent_days > 0 then (array['speaker_fault', 'no_network', 'frozen'])[k % 3 + 1] else 'none' end,
         case when rent_failed then 'failed' else 'paid' end,
         case when silent_days > 0 then now() - make_interval(days => silent_days, hours => 2)
              else now() - make_interval(mins => quiet_mins) end,
         case when k is not null then now() - interval '12 hours' end
  from _fill order by i;

  -- ±20% daily noise; a QR-drop filler's last 3 days sit at (100 − drop_pct)% of its base.
  insert into public.daily_volume (device_id, day, txn_count, amount)
  select 'SB-' || f.id, current_date - d, v.txn, v.txn * f.ticket
  from _fill f
  cross join generate_series(1, 30) as d
  cross join lateral (
    select case when f.drop_pct > 0 and d <= 3
                then round(f.base * (1 - f.drop_pct / 100.0))::int
                else greatest(1, round(f.base * (0.8 + random() * 0.4)))::int end as txn
  ) v
  order by f.i, d;

  insert into public.settlements (merchant_id, settled_on, amount)
  select id, current_date - (1 + i % 7), round(base * ticket * (1 + random()))::int
  from _fill order by i;

  insert into public.tickets (merchant_id, type, status, created_at)
  select id, ticket_type, 'open', now() - make_interval(hours => 6 + i % 48)
  from _fill where ticket_type is not null order by i;
end;
$$;

-- Only the backend (secret key → service_role) may reset the demo.
revoke execute on function public.seed_demo() from public, anon, authenticated;
grant execute on function public.seed_demo() to service_role;
