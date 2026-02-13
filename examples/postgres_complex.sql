with home as (
select 
    (usage_start_time + usage_date) at time zone 'America/Chicago' as time,
    sum(usage_kwh) as total_home
from energy.energy_usage
where usage_date = (select max(usage_date) from energy.energy_usage)
group by 1
),


room as (
select
    date_bin(interval '15 minutes', captured_at, timestamptz '1970-01-01 00:00:00+00') as min_15,
    sum(power_w) / 60 / 1000 as total_room
from public.plug_power_data
where plug_name in ('Server UPS Plug', 'AC Plug', 'Desk UPS Plug')
    and captured_at::date = (select max(usage_date) from energy.energy_usage)
group by 1
),


servers as (
select
    date_bin(interval '15 minutes', captured_at, timestamptz '1970-01-01 00:00:00+00') as min_15,
    sum(power_w) / 60 / 1000 as total_room
from public.plug_power_data
where plug_name in ('T630', 'R730xd')
    and captured_at::date = (select max(usage_date) from energy.energy_usage)
group by 1
)


select
    home.time,
    home.total_home,
    room.total_room,
    round(room.total_room / nullif(home.total_home, 0), 4) as room_pct,
    round(servers.total_room / nullif(home.total_home, 0), 4) as servers_pct
from home
left join room
    on home.time = room.min_15
left join servers
    on home.time = servers.min_15
order by 1