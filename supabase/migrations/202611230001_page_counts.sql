-- Cookieless visit counts for every public page of codevalanche.com and
-- radovar.com, the same way as the download page counts (202610210001): one
-- row per day, site, page, metric, source and language, holding only a number.
-- No visitor identifier, address, user agent, full referrer or timestamp finer
-- than the day is stored.
-- metric: page_view = a page was opened; visit = a page was opened coming from
-- outside the site (a new visit). source: a coarse bucket of where it came from.
create table if not exists public.site_page_counts (
  day date not null,
  site text not null check (site in ('codevalanche', 'radovar')),
  page_id text not null check (page_id ~ '^[a-z0-9_]{1,40}$'),
  metric text not null check (metric in ('page_view', 'visit')),
  source text not null check (source in ('direct', 'internal', 'search', 'social', 'github', 'ai', 'other')),
  locale text not null check (locale in ('en', 'ar', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'ro', 'ru', 'tr', 'vi', 'zh-Hans', 'zh-Hant')),
  count bigint not null default 0 check (count >= 0),
  primary key (day, site, page_id, metric, source, locale)
);

-- Visitors never read or write the table directly; only the function below adds one.
alter table public.site_page_counts enable row level security;
revoke all on public.site_page_counts from public, anon, authenticated, service_role;
grant select on public.site_page_counts to service_role;

create or replace function public.count_site_page(p_site text, p_page text, p_metric text, p_source text, p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_site is null or p_site not in ('codevalanche', 'radovar') then return; end if;
  if p_page is null or p_page !~ '^[a-z0-9_]{1,40}$' then return; end if;
  if p_metric is null or p_metric not in ('page_view', 'visit') then return; end if;
  if p_source is null or p_source not in ('direct', 'internal', 'search', 'social', 'github', 'ai', 'other') then return; end if;
  if p_locale is null or p_locale not in ('en', 'ar', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'ro', 'ru', 'tr', 'vi', 'zh-Hans', 'zh-Hant') then return; end if;
  insert into public.site_page_counts as counts (day, site, page_id, metric, source, locale, count)
  values ((now() at time zone 'utc')::date, p_site, p_page, p_metric, p_source, p_locale, 1)
  on conflict (day, site, page_id, metric, source, locale) do update set count = counts.count + 1;
end;
$$;

revoke all on function public.count_site_page(text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.count_site_page(text, text, text, text, text) to anon, authenticated;
