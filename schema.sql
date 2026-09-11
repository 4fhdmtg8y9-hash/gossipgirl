begin;
create table if not exists public.gg_posts (
 id uuid primary key default gen_random_uuid(),
 text text not null check (char_length(text) between 1 and 5000),
 "photoUrl" text not null default '' check (char_length("photoUrl") <= 2048),
 category text not null default 'gossip' check(category in ('gossip','party')),
 timestamp bigint not null
);
create index if not exists gg_posts_newest on public.gg_posts(timestamp desc,id desc);
create table if not exists public.gg_sessions (
 token_hash text primary key,
 expires_at timestamptz not null
);
create index if not exists gg_sessions_expiry on public.gg_sessions(expires_at);
create table if not exists public.gg_login_attempts (
 key text primary key,
 attempts integer not null,
 expires_at timestamptz not null
);
create index if not exists gg_login_expiry on public.gg_login_attempts(expires_at);
alter table public.gg_posts enable row level security;
alter table public.gg_sessions enable row level security;
alter table public.gg_login_attempts enable row level security;
revoke all on public.gg_posts,public.gg_sessions,public.gg_login_attempts from anon,authenticated;
grant select,insert,update,delete on public.gg_posts,public.gg_sessions,public.gg_login_attempts to service_role;
create or replace function public.gg_login_allowed(attempt_key text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare attempt_count integer;
begin
 delete from public.gg_login_attempts where expires_at < now();
 delete from public.gg_sessions where expires_at < now();
 insert into public.gg_login_attempts(key,attempts,expires_at)
 values(attempt_key,1,now()+interval '15 minutes')
 on conflict(key) do update set attempts=public.gg_login_attempts.attempts+1
 returning attempts into attempt_count;
 return attempt_count <= 10;
end;
$$;
revoke all on function public.gg_login_allowed(text) from public,anon,authenticated;
grant execute on function public.gg_login_allowed(text) to service_role;
commit;
