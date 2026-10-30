# Wapsi — Product Spec

The source of truth for what we build. If code and this file disagree, fix one of them on purpose.

## 1. Product

Wapsi is an AI teammate for Paytm's merchant-service team. Every Soundbox that goes quiet costs Paytm subscription revenue (about ₹100 a month per device), payment volume and a future merchant-loan customer. Wapsi:

1. **Detects** at-risk devices (silent, QR volume drop, failed rent debit, open complaint).
2. **Calls** the merchant on a real phone, in Hindi or Marathi.
3. **Acts** across (mocked) systems with tools: diagnostics, technician booking, settlement resend, remote restart, goodwill credit.
4. **Hands off** to a human only when needed, with a summary and next step.
5. **Verifies**: a save counts only when payments resume, compared with a holdout group.

Paytm's device, settlement, field-service and billing systems are not public. We **mock them in Supabase** and say so on stage.

## 2. The flagship demo (must always work)

| Step | What happens | Feature |
| --- | --- | --- |
| 1 | Queue shows Sharma General Store on top: "Silent 4 days · QR −80%" | F1 |
| 2 | Click **Start Wapsi's run**; the feed shows "Wapsi picked Sharma General Store: Silent 4 days · QR −80%" and a real phone rings from a +91 number (per-row **Call** is the backup) | F16, F2 |
| 3 | Agent greets Ramesh ji in Hindi, runs diagnostics: speaker fault | F3, F4 |
| 4 | Agent books a technician and resends the settlement statement | F4 |
| 5 | Each action slides into the live feed while the call is on | F5 |
| 6 | Call ends; transcript and outcome appear | F6 |
| 7 | Click **Simulate next day**: device → *Recovered (verified)*, the virtual Soundbox chimes and says the first payment ("Paytm पर 180 रुपये प्राप्त हुए"), KPIs update | F7, F9 |

## 3. Features

### P0 — must work on stage

| ID | Feature | Done when |
| --- | --- | --- |
| F1 | **At-risk queue** from the `risk_queue` view, sorted by `risk_score` then `days_silent` (both descending), reason in plain words, Call button per row; holdout rows show "Holdout · not called" and no Call button | M001 is first with "Silent 4 days · QR −80%" |
| F2 | **One-click call**: `POST /api/calls/start` → Bolna outbound call with `user_data` | Allowlisted phone rings; `calls` row has `bolna_execution_id` |
| F3 | **Voice agent** in Bolna: Sarvam STT/TTS, Hindi, prompt + welcome message in §8 | Natural 2-minute call, short replies |
| F4 | **Four tools**: `run_diagnostics`, `book_technician`, `resend_settlement`, `escalate_to_human` | Each fires in a live call, changes data, writes an `actions` row |
| F5 | **Live activity feed** via Supabase Realtime | Actions appear without refresh during the call |
| F6 | **Post-call webhook** saves status, transcript, summary, duration, cost, outcome | Call card shows transcript after hang-up |
| F7 | **Simulate next day** + verified save rule (§6) | M001 → Recovered (verified); Verified saves +1; ₹ retained +100 |
| F8 | **Demo reset**: `POST /api/demo/reset` reseeds everything relative to today | One click restores the starting state |
| F9 | **Virtual Soundbox** card: status light, last announcement time, 30-day QR chart; when its device recovers it chimes and speaks the first payment's amount in the merchant's language (browser speech; amount from the `payments_resumed` payload) | Light turns green, "₹180 received" shows and is spoken |
| F10 | **Handoff queue**: open handoffs with reason, summary, next step and **Take over** (`POST /api/handoffs/{id}/take`; logs a `human_takeover` action, actor = human) | M005 hardship call lands here; Take over marks it `taken` |
| F16 | **Autonomous run**: primary **Start Wapsi's run** button → `POST /api/runs/start` picks the highest-risk merchant in cohort `wapsi` with status `at_risk` (`risk_queue` order) and calls `DEMO_DEFAULT_PHONE` through the same code path as `/api/calls/start`; writes a system action "Wapsi picked Sharma General Store: Silent 4 days · QR −80%". The per-row Call button stays as a backup | After a reset, one click picks M001 and the allowlisted phone rings |

### P1 — adds proof and trust (only after P0 is complete and a backup video is recorded)

| ID | Feature | Done when |
| --- | --- | --- |
| F11 | **Impact panel**: recovery rate Wapsi vs holdout (labelled "simulated"), ₹ retained, cost per verified save | Numbers match §10 definitions |
| F12 | **`restart_device` tool**: clears `no_network`/`frozen`; device turns Online during the call | M002 fixed live |
| F13 | **`apply_goodwill_credit` tool**, cap ₹100; above cap → refused, agent escalates | M004 credit applied; ₹500 request refused |
| F14 | **Marathi**: per-merchant language; M002 and M004 calls in Marathi | One Marathi call works end to end |
| F15 | **Visible guardrails**: Safety strip from `GET /api/config` (allowlist size, calling hours and whether they're open now, credit cap, dry run or real calls); every action tagged agent/human/system | Visible on dashboard |

### P2 — stretch (only if P0 + P1 done by 16:45 on build day)

- **Run tonight's queue** (extends F16): call 2 allowlisted numbers in sequence (trial limit: 2 concurrent, verified numbers only).
- Call recording playback (`telephony_data.recording_url`).
- Merchant drawer with a 30-day QR volume chart, before/after.
- Real WhatsApp/SMS for the statement (mocked otherwise).

### Not building

Real Paytm integrations · our own telephony/STT/TTS · login/auth · multiple users · mobile app.

## 4. Data model

`supabase/migrations/0001_schema.sql` — apply exactly; change only via new migrations.

```sql
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
```

## 5. Seed data and demo reset (F8)

`supabase/migrations/0002_seed_demo.sql` creates `public.seed_demo()`:

- `security definer`, `set search_path = public`; `revoke execute on function public.seed_demo() from public, anon, authenticated;` (only the backend's secret key may call it, via RPC).
- Truncates all tables (`restart identity cascade`) and reinserts everything **relative to `current_date` / `now()`**, so a reset on build day looks fresh. Deterministic: `perform setseed(0.42);` first.
- Daily volume: 30 days ending **yesterday**. Today is left empty for "Simulate next day".
- Sets `at_risk_since` on every at-risk device.

**The five scripted merchants** (cohort `wapsi`, `scripted = true`, fake phones `+910000000001`…`5`):

| ID | Shop | Owner | Area | Lang | Fault | Rent | Last announced | Volume (baseline → last 3 days) | Open ticket | Last settlement | Expected path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M001 | Sharma General Store | Ramesh Sharma | Dadar | hi | `speaker_fault` | paid | 4 days ago | ~45/day → −80% | — | ₹18,450, 3 days ago | Technician → verified |
| M002 | Patil Medical | Sunita Patil | Andheri East | mr | `no_network` | paid | 3 days ago | ~60/day → −90% | — | ₹22,100, 4 days ago | Remote restart (P1) → verified |
| M003 | Shaikh Chai Corner | Imran Shaikh | Kurla | hi | `none` | paid | yesterday | ~80/day → −70% | `settlement_query` | ₹6,200, 5 days ago | Resend statement → verified |
| M004 | Joshi Stationers | Anil Joshi | Thane | mr | `none` | failed | yesterday | ~35/day → −65% | `rent_dispute` | ₹9,800, 6 days ago | Goodwill credit (P1) → verified |
| M005 | Fernandes Bakery | Maria Fernandes | Bandra | hi | `none` | paid | 2 days ago | ~50/day → −90% | — | ₹12,300, 7 days ago | Hardship → handoff |

All five devices start with `status = 'at_risk'`. Money and names are mock data.

**Filler merchants** `F001`–`F200`:

- Names: surname × shop type (e.g., Patel, Shah, Iyer, Khan, Gupta, Naik, Pawar, Desai, Mehta, Kulkarni × Kirana, Medical, Tea Stall, Stationers, Bakery, Fruits, Mobile Shop, Hardware, Tailors, Snacks), areas from a list of ~12 Mumbai neighbourhoods.
- ~170 `healthy`: 20–80 txns/day with ±20% daily noise; amount = txns × ₹80–250.
- 30 `at_risk` with one or two signals each (silent 3–6 days, QR drop 60–95%, rent failed, open ticket) and a `risk_score` of 60 or less, so M001 (70) and M002 (70) stay on top; cohort alternates `wapsi` / `holdout` (15 each).
- One settlement row per merchant in the last 7 days.

`POST /api/demo/reset` calls `supabase.rpc("seed_demo")`. Run it once after migrations, and before every demo.

## 6. Device simulation rules

```
healthy ──(seed)──▶ at_risk
at_risk ──book_technician──────────────▶ fix_scheduled
at_risk ──restart_device (no_network|frozen) ──▶ awaiting_verification   (fault := none, last_announced_at := now)
at_risk ──resend_settlement / apply_goodwill_credit (fault = none) ──▶ awaiting_verification
at_risk | fix_scheduled ──escalate_to_human──▶ handed_off
fix_scheduled ──simulate next day──▶ awaiting_verification   (technician visited: fault := none)
awaiting_verification ──simulate next day──▶ recovered        (if today's volume ≥ 50% of baseline)
holdout at_risk ──simulate next day──▶ recovered for HOLDOUT_RECOVERY_RATE of them (default 0.1, deterministic: lowest device ids first)
```

**Diagnostics messages** (`result` is what the agent says; `detail` is the feed line, stating the decision and why — see §7):

| Fault | `result` | Action `detail` |
| --- | --- | --- |
| `speaker_fault` | "The device is online but its speaker is not responding. It needs a technician visit." | "Diagnostics: speaker fault → booking a technician (a remote restart can't fix hardware)" |
| `no_network` | "The device has sent no signal for {days} days. A remote restart may fix it." | "Diagnostics: no signal for {days} days → trying a remote restart (it usually brings the network back)" |
| `frozen` | "The device is online but frozen. A remote restart should fix it." | "Diagnostics: device frozen → trying a remote restart (a software hang needs no visit)" |
| `none` + rent failed | "The device is healthy. The last rent debit of ₹{rent} failed." | "Diagnostics: device healthy, rent debit of ₹{rent} failed → no device fix (the rent is the likely complaint)" |
| `none` | "The device is healthy: network and speaker are working." | "Diagnostics: device healthy → no device fix (network and speaker work; the cause is elsewhere)" |

**Simulate next day** (`POST /api/simulate/next-day`), in order:

1. `fix_scheduled` → fault `none`, status `awaiting_verification`; action `technician_visited` (actor system).
2. For each `awaiting_verification` device: upsert today's `daily_volume` at 90–110% of baseline; set `last_announced_at = now()`; status `recovered`; action `payments_resumed` ("Payments resumed at Sharma General Store: 41 today, back to normal → verified save") (actor system), payload `{txn_count, baseline, amount}` where `amount` is the shop's typical ticket to the nearest ₹10: the payment the Soundbox announces.
3. Holdout recoveries per rule above (status `recovered`, no action row needed).
4. Return counts: `{"recovered": n, "holdout_recovered": k}`.

## 7. API contracts (FastAPI)

Base URL: the backend Vercel project. All bodies JSON.

### Dashboard-facing

**`GET /api/health`** → `{"ok": true, "db": "ok"|"error"|"not_configured", "bolna": "configured"|"dry_run"|"not_configured"}`. `bolna` is `dry_run` when `CALL_DRY_RUN`, else `configured` if `BOLNA_API_KEY` and `BOLNA_AGENT_ID` are set, else `not_configured`.

**`GET /api/config`** (F15) → `{"dry_run": true, "calling_hours": "09:00-21:00", "within_calling_hours": true, "allowed_numbers": 2, "goodwill_cap": 100}`. Non-secret guardrails for the Safety strip; never the numbers themselves.

**`POST /api/calls/start`**
```json
{ "merchant_id": "M001", "phone": "+91XXXXXXXXXX", "bypass_hours": false }
```
- `phone` optional → `DEMO_DEFAULT_PHONE`. Must be in `ALLOWED_NUMBERS` (403 otherwise). Outside `CALLING_HOURS` → 409 unless `bypass_hours`.
- Creates `calls` row (status `queued`), action `call_started` (actor system, detail "Calling Sharma General Store").
- Builds `user_data` (below). If `CALL_DRY_RUN`, skip Bolna and store `dry-<uuid>`; else `POST https://api.bolna.ai/call` with `Authorization: Bearer $BOLNA_API_KEY`:
```json
{
  "agent_id": "<BOLNA_AGENT_ID, or the merchant's language entry in BOLNA_AGENT_IDS>",
  "recipient_phone_number": "+91XXXXXXXXXX",
  "user_data": {
    "call_id": "6f1c…", "merchant_id": "M001", "device_id": "SB-M001",
    "merchant_name": "Sharma General Store", "owner_name": "Ramesh Sharma", "owner_first_name": "Ramesh",
    "language_name": "Hindi",
    "greeting": "नमस्ते Ramesh जी! मैं Wapsi, Paytm merchant support से बोल रहा हूँ। आपके Soundbox में कुछ दिक्कत दिख रही है। क्या हुआ?",
    "reason": "Silent 4 days · QR −80%", "days_silent": "4",
    "last_settlement_amount": "₹18,450", "last_settlement_date": "26 Oct",
    "slot_options": "tomorrow 11 AM to 1 PM or tomorrow 3 PM to 5 PM", "goodwill_cap": "₹100"
  }
}
```
- `greeting` is per language (`messages.py`: hi, mr, en); `slot_options` comes from `TECHNICIAN_SLOTS`; `goodwill_cap` from `GOODWILL_CAP`. Nothing in the agent's words is hard-coded in Bolna.
- Bolna returns `{"message": "done", "status": "queued", "execution_id": "…"}` → save `bolna_execution_id`.
- Response: `{"call_id": "…", "execution_id": "…", "status": "queued"}`
- Other errors: 400 no phone and no `DEMO_DEFAULT_PHONE`; 404 unknown merchant; 502 Bolna refused (the calls row gets status `error` and a `call_ended` action says so).

**`POST /api/runs/start`** (F16)
```json
{ "bypass_hours": false }
```
- If there is an **active call** (defined under Tool endpoints) → 409 "Wapsi is already on a call". One call at a time keeps the tools' context fallback unambiguous and makes a double click harmless. The per-row Call button is not blocked: it is the manual override.
- Picks `select * from risk_queue where cohort = 'wapsi' and status = 'at_risk' order by risk_score desc, days_silent desc limit 1`. No row → 404.
- Phone is always `DEMO_DEFAULT_PHONE`. Runs the **same start-call function** as `/api/calls/start` (same allowlist 403 and calling-hours 409 checks, calls row, `user_data`, Bolna or dry run). Never a second call path.
- After the checks pass, inserts action `merchant_picked` (actor system, with the new `call_id`) just before `call_started`: detail "Wapsi picked Sharma General Store: Silent 4 days · QR −80%", payload `{risk_score, reason}`.
- Response: `{"call_id": "…", "execution_id": "…", "status": "queued", "merchant_id": "M001", "reason": "Silent 4 days · QR −80%"}`

**`POST /api/simulate/next-day`** → see §6. **`POST /api/demo/reset`** → `{"ok": true}`.
**`POST /api/handoffs/{id}/take`** (F10) → status `taken`, action `human_takeover` (actor human). Response `{"id": "…", "status": "taken"}`; 404 unknown, 409 not open.

### Tool endpoints (Bolna custom functions)

Auth: `Authorization: Bearer $TOOL_SECRET`. Context: `merchant_id` from the body if it exists in `merchants`, else the merchant on the **active call**: the latest call with status not in (`completed`, `failed`, `no-answer`, `busy`, `canceled`, `error`, `stopped`, `balance-low`) started in the last 15 minutes. Every response is HTTP 200 `{"result": "<sentence>", ...}`, including malformed bodies and uncaught errors (the tools router's route class turns both into the safe `result`).

**Reasoning in the feed.** Every tool's action `detail` states the decision and why, as `<Step>: <finding> → <decision> (<why>)`, e.g. "Diagnostics: speaker fault → booking a technician (a remote restart can't fix hardware)". The backend builds it from templates (fault, reason, amounts), never from free LLM text. `result` stays plain words for the merchant; the reasoning is for the team watching the feed.

| Endpoint | Body | Effect | `result` example | Action `detail` example |
| --- | --- | --- | --- | --- |
| `POST /api/tools/diagnostics` | `{merchant_id}` | Read device; action `diagnostics` | §6 messages | §6 details |
| `POST /api/tools/book-technician` | `{merchant_id, slot}` (no slot → the first `TECHNICIAN_SLOTS` entry) | status `fix_scheduled`; booking id `TB-####`; action `technician_booked`; call outcome `fix_scheduled` | "Technician booked for tomorrow 11 AM to 1 PM. Booking TB-4821." | "Technician: booked tomorrow 11 AM to 1 PM (TB-4821) → fix scheduled (a speaker fault needs a visit)" |
| `POST /api/tools/resend-settlement` | `{merchant_id}` | Latest settlement; close `settlement_query` ticket; if fault `none` → `awaiting_verification`; action `statement_sent`; outcome `statement_sent` if none set yet | "₹18,450 was settled on 26 Oct. The statement has been sent on WhatsApp." | "Settlement: ₹18,450 paid on 26 Oct → statement sent on WhatsApp (proof the money arrived)"; adds ", query closed" when a ticket was closed |
| `POST /api/tools/escalate` | `{merchant_id, reason, summary}` | `handoffs` row (next_step from reason); status `handed_off`; action `escalated`; outcome `handed_off` | per reason (table below) | "Escalated: hardship → Call back within 2 hours; offer rent pause (a rent pause needs a human decision)" |
| `POST /api/tools/restart-device` (P1) | `{merchant_id}` | Rule §6; action `device_restarted`; outcome `fixed_live` | "Restart done. The device is back online." | "Restart: device back online → awaiting verification (a save counts only when payments resume)" |
| `POST /api/tools/goodwill-credit` (P1) | `{merchant_id, amount}` | ≤ `GOODWILL_CAP` → rent `paid`, close `rent_dispute`, `awaiting_verification`, action `credit_applied`, outcome `credit_applied`; else action `credit_refused` | "₹100 credit applied to this month's rent." / "That is above my limit. I'll ask a senior to help." | "Goodwill credit: ₹100 applied → rent marked paid (it was charged while the device was down)" / "Goodwill credit: ₹500 refused → escalating (above the ₹100 cap)" |

`next_step` and the feed's *why* by `reason`:

| `reason` | `next_step` | Why (in `detail`) | `result` (what the agent promises) |
| --- | --- | --- | --- |
| `hardship` | "Call back within 2 hours; offer rent pause" | "a rent pause needs a human decision" | "A senior colleague will call you back within 2 hours." |
| `angry` | "Senior callback today" | "still upset after one attempt to calm them" | "A senior colleague will call you back today." |
| `asked_for_person` | "Senior callback today" | "the merchant asked for a person" | same as `angry` |
| `above_cap` | "Approve or reject credit" | "the credit asked is above the {`GOODWILL_CAP`} cap" | "A senior colleague will review the credit and call you back today." |
| `fraud_kyc` | "Route to risk team" | "fraud and KYC go to the risk team only" | "Our risk team will call you back." |
| `fixes_failed` | "Send technician with replacement device" | "two fixes did not work" | "A senior colleague will call you back today to send a replacement device." |
| anything else | "Senior callback today" | "the agent could not resolve it" (still hands off; never fails) | same as `angry` |

### Webhook

**`POST /api/bolna/webhook?token=$WEBHOOK_SECRET`** (403 on wrong token). Payload = Bolna execution object. Update the `calls` row where `bolna_execution_id = payload.id`. Never insert (`merchant_id` and `phone` are required): no matching row → log a warning and return 200 `{"ok": true, "matched": false}`; Bolna repeats webhooks, so a later one fills the row. Matched → `{"ok": true, "matched": true}` and:
- `status` ← `status`; `duration_s` ← `conversation_duration`; `cost_cents` ← `total_cost`; `transcript`, `summary`, `raw` ← payload.
- On a terminal status (the list under Tool endpoints): set `ended_at`; a later non-terminal webhook never reopens the call; if `conversation_duration` is 0 or missing → outcome `no_answer`; insert one `call_ended` action (only once per call).
- `transcript` is filled only at `completed`; `summary` is null unless call summary is enabled on the agent.

## 8. Bolna agent

Configure in the Bolna dashboard (steps in `SETUP.md`). Variables in `{braces}` come from `user_data`.

**Welcome message** (one variable; the backend writes it in the merchant's language, with their first name)
> {greeting}

**Languages**: one agent can serve every merchant (`Speak {language_name}`). If Marathi needs its own transcriber/voice settings, create a second agent and set `BOLNA_AGENT_IDS=mr=<agent id>`; other languages keep `BOLNA_AGENT_ID`.

**Prompt**
```
You are Wapsi, a merchant-support agent calling on behalf of Paytm about the merchant's Soundbox.
Speak {language_name}. Short, simple sentences. One question at a time. Never read IDs aloud.

Already known (never ask for it):
- Shop: {merchant_name}, owner {owner_name} (call them {owner_first_name} ji)
- merchant_id: {merchant_id}
- Signal: {reason}
- Last settlement: {last_settlement_amount} on {last_settlement_date}

Flow:
1. You have greeted them. Listen to what happened.
2. ALWAYS call run_diagnostics first, with merchant_id {merchant_id}.
3. Fix based on the result:
   - Speaker or power fault: offer these slots: {slot_options}. Then call book_technician with the one they pick.
   - No signal or frozen: call restart_device, then run_diagnostics again.
   - They doubt their settlement: call resend_settlement and tell them the date and amount.
   - Upset about rent while the device was down: call apply_goodwill_credit ({goodwill_cap} or less).
4. Call escalate_to_human when: they ask for a person; still angry after one attempt to calm them;
   hardship (shop closing, illness, money stress); they want more than {goodwill_cap} credit;
   fraud or KYC topics; two fixes failed. Say exactly what the tool's result promises.
5. Close: say what you did and what happens next, thank them. Keep the call under 2 minutes.
Never promise anything a tool did not confirm.
```

**Custom functions** — paste into the agent's Tools tab. Shape follows Bolna's docs (`key` must be `custom_task`); confirm field names in the editor.

```json
{
  "name": "run_diagnostics",
  "description": "Run remote diagnostics on the merchant's Soundbox. Always call this first, before suggesting any fix.",
  "pre_call_message": "एक सेकंड, मैं आपका device check करता हूँ।",
  "parameters": {
    "type": "object",
    "properties": {
      "merchant_id": { "type": "string", "description": "merchant_id from the call context, e.g. M001. Never ask the merchant." }
    },
    "required": ["merchant_id"]
  },
  "key": "custom_task",
  "value": {
    "method": "POST",
    "param": { "merchant_id": "%(merchant_id)s" },
    "url": "https://<backend>.vercel.app/api/tools/diagnostics",
    "api_token": "Bearer <TOOL_SECRET>",
    "headers": { "Content-Type": "application/json" }
  }
}
```

The others follow the same shape (pre-call messages are spoken by Sarvam, so they're in Devanagari; a Marathi agent gets Marathi ones, see `docs/SETUP_CHECKLIST.md`):

| name | url path | extra properties (`param` mapping) | pre_call_message |
| --- | --- | --- | --- |
| `book_technician` | `/api/tools/book-technician` | `slot` string: one of the offered slot options (`%(slot)s`) | "मैं technician का slot देख रहा हूँ।" |
| `resend_settlement` | `/api/tools/resend-settlement` | — | "मैं आपका statement निकाल रहा हूँ।" |
| `escalate_to_human` | `/api/tools/escalate` | `reason` enum [`asked_for_person`,`angry`,`hardship`,`above_cap`,`fraud_kyc`,`fixes_failed`] (`%(reason)s`), `summary` string (`%(summary)s`) | "मैं आपको अपने senior से जोड़ रहा हूँ।" |
| `restart_device` (P1) | `/api/tools/restart-device` | — | "मैं remote से आपका device restart कर रहा हूँ।" |
| `apply_goodwill_credit` (P1) | `/api/tools/goodwill-credit` | `amount` integer (`%(amount)i`) | "मैं देखता हूँ क्या कर सकते हैं।" |

**Agent settings**: transcriber Sarvam (Saaras), voice Sarvam Bulbul Hindi (e.g., `shubh`), fast LLM with tool calling, call summary **on**, webhook URL `https://<backend>.vercel.app/api/bolna/webhook?token=<WEBHOOK_SECRET>` (Extractions tab).

## 9. Dashboard

One screen. Design system "Night shift" (tokens in `dashboard/src/index.css`): frosted glass on the deck's navy darkened to near-black, 1px hairlines, grayscale text; Paytm blue (`#00BAF2`) marks what's live or most important; ok / warn / danger mark state, always with an icon or word. Geist for UI, Geist Mono captions and numbers, Instrument Serif for display moments. Lively only on change (springs, one-shot keyframes); nothing loops unless a call is live; reduced motion turns it off.

```
┌ TopBar: Wapsi · Live updates · Dry run/Real calls   [Reset demo] [Simulate next day] [▶ Start Wapsi's run] ┐
│ Safety strip (F15): allowlist size · calling hours (open now) · credit cap · every action logged          │
├ KPI strip: At risk · Calls today · Verified saves · ₹ retained · Handoffs (numbers count up, "+1" floats) ┤
├ At-risk queue (F1)        │ Live call (F5, F6)                     │ Virtual Soundbox (F9)  ┤
│ All/Wapsi/Holdout filter  │ sticky header: merchant, language,     │ device, LED, display,  │
│ risk ring · signal chips  │ masked phone, timer, outcome           │ 30-day chart           │
│ 30-day sparkline · Call   │ timeline: finding → decision · Why     │ Handoff queue (F10)    │
│ "On call" on the live row │ summary · recording · transcript chat  │ Impact (F11)           │
└───────────────────────────┴────────────────────────────────────────┴────────────────────────┘
```

- **Start Wapsi's run** (F16): the primary button (filled Paytm blue) → `POST /api/runs/start` with `{}`; no dialog (the backend always uses `DEMO_DEFAULT_PHONE`). Disabled while the request is in flight or the latest call is still active; a 409/404 shows its `detail` as a short toast.
- **Queue**: `select * from risk_queue order by risk_score desc, days_silent desc`. Call (the backup to Start Wapsi's run) opens a small dialog: phone (prefilled `VITE_DEMO_PHONE`) → `POST /api/calls/start`.
- **Handoff queue** (F10): `handoffs` with status `open`, newest first, with merchant name, reason, summary, next step and **Take over** → `POST /api/handoffs/{id}/take`.
- **Live call**: latest `calls` row (with `raw->telephony_data->>recording_url`); status pill; feed = `actions` for that `call_id` plus actions with no `call_id` created after it started, newest at bottom, each parsed into finding → decision and Why. Transcript lines `assistant:` / `user:` render as a chat.
- **Virtual Soundbox**: the device of the latest call. LED red `at_risk`, amber `fix_scheduled`/`awaiting_verification`, grey `handed_off`, green `recovered`. On a new `payments_resumed` action for its device: sound rings, "₹{amount} received" on its display, a two-note chime, then the amount spoken in the merchant's language. Browsers block audio until the first click on the page, which primes it. Actions are keyed by `id` + `created_at` because a reset restarts ids.
- **Sparklines**: view `volume_series` (migration `0003_volume_series.sql`): one row per device with 30 days of `txns`, so the dashboard never hits Supabase's 1,000-row limit.
- **Realtime**: one channel; `postgres_changes` on `actions` (INSERT) → append; on `calls`, `devices`, `handoffs` (`*`) → refetch queue + KPIs.

```ts
supabase.channel('wapsi')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actions' }, (p) => onAction(p.new))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, refresh)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, refresh)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'handoffs' }, refresh)
  .subscribe()
```

## 10. Metric definitions

| Metric | Definition |
| --- | --- |
| At risk | devices with status in (`at_risk`, `fix_scheduled`, `awaiting_verification`, `handed_off`) |
| Calls today | `calls` started today (Asia/Kolkata) |
| Verified saves | devices `recovered` in cohort `wapsi` |
| ₹ retained | Verified saves × `monthly_rent` (label: "subscription a month") |
| Handoffs | `handoffs` with status `open` |
| Recovery rate | Wapsi: recovered ÷ `wapsi` devices Wapsi has called. Holdout: recovered ÷ `holdout` devices with `at_risk_since` not null. Show n beside each (label: "simulated"). Dividing by all `wapsi` at-risk devices would count merchants nobody has called yet |
| Cost per verified save | sum(`cost_cents`) ÷ 100 ÷ Verified saves, shown in USD as Bolna reports it |

## 11. Guardrails

- Calls only to `ALLOWED_NUMBERS`; only within `CALLING_HOURS` (default 09:00–21:00 IST) unless bypassed.
- Autonomous runs make one call at a time (`/api/runs/start` → 409 while a call is active).
- Dashboard-facing endpoints have no auth (no login, by design; a key in the dashboard bundle would be public anyway). The allowlist and calling hours are what protect real calls. Keep the backend URL off the slides.
- Goodwill credit capped by `GOODWILL_CAP` (₹100).
- Tool endpoints require `TOOL_SECRET`; webhook requires `WEBHOOK_SECRET` in the URL.
- Every state change writes an `actions` row with `actor`.
- The agent never promises anything a tool did not confirm (prompt rule).
