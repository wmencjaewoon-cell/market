-- Admin security hardening.
-- Run this in Supabase SQL Editor after an admin account compromise.

-- 1) Do not allow app/API clients to change profile roles directly.
-- Admin actions should go through explicit RPC functions, not broad profile updates.
drop policy if exists profiles_admin_update on public.profiles;

revoke update (role) on public.profiles from anon;
revoke update (role) on public.profiles from authenticated;

create or replace function public.prevent_client_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role and auth.role() in ('anon', 'authenticated') then
    raise exception 'Profile role cannot be changed from the app client.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_client_profile_role_change on public.profiles;
create trigger prevent_client_profile_role_change
before update on public.profiles
for each row
execute function public.prevent_client_profile_role_change();

revoke all on function public.prevent_client_profile_role_change() from public;

-- 2) Keep the admin predicate server-side and require the account to be active.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(status, 'active') = 'active'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- 3) Review current admins.
-- Check this result after running the script and remove unknown admins manually.
select id, email, display_name, status, role, updated_at
from public.profiles
where role = 'admin'
order by updated_at desc nulls last;

select pg_notify('pgrst', 'reload schema');
