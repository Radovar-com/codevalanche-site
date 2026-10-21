-- Cookieless counts for the download pages: one row per day, metric, platform
-- and site language, holding only a number. No visitor identifier, address,
-- user agent or timestamp finer than the day is stored.
create table if not exists public.codevalanche_download_counts (
  day date not null,
  metric text not null check (metric in ('download_page_view', 'download_started', 'download_retry')),
  platform text not null check (platform in ('windows', 'windows-x64', 'macos', 'linux', 'android', 'ios', 'other')),
  locale text not null check (locale in ('en', 'ar', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'ro', 'ru', 'tr', 'vi', 'zh-Hans', 'zh-Hant')),
  count bigint not null default 0 check (count >= 0),
  primary key (day, metric, platform, locale)
);

-- Visitors never read or write the table directly; only the function below adds one.
alter table public.codevalanche_download_counts enable row level security;
revoke all on public.codevalanche_download_counts from public, anon, authenticated, service_role;
grant select on public.codevalanche_download_counts to service_role;

create or replace function public.codevalanche_count_download(p_metric text, p_platform text, p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_metric is null or p_metric not in ('download_page_view', 'download_started', 'download_retry') then return; end if;
  if p_platform is null or p_platform not in ('windows', 'windows-x64', 'macos', 'linux', 'android', 'ios', 'other') then return; end if;
  if p_locale is null or p_locale not in ('en', 'ar', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'ro', 'ru', 'tr', 'vi', 'zh-Hans', 'zh-Hant') then return; end if;
  insert into public.codevalanche_download_counts as counts (day, metric, platform, locale, count)
  values ((now() at time zone 'utc')::date, p_metric, p_platform, p_locale, 1)
  on conflict (day, metric, platform, locale) do update set count = counts.count + 1;
end;
$$;

revoke all on function public.codevalanche_count_download(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.codevalanche_count_download(text, text, text) to anon, authenticated;
