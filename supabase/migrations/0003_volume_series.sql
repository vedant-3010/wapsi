-- 30-day QR volume per device, for the dashboard's sparklines: one row per device instead of
-- ~1,000 daily_volume rows (Supabase caps a response at 1,000 rows by default).
create view public.volume_series with (security_invoker = true) as
select device_id,
       array_agg(day order by day)       as days,
       array_agg(txn_count order by day) as txns
from public.daily_volume
where day >= current_date - 30
group by device_id;

grant select on public.volume_series to anon, authenticated;
