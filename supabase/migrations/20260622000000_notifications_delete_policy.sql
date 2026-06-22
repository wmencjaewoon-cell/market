-- Allow authenticated users to mark and delete their own notification rows.
-- This is intentionally no-op when the notifications table is not part of the local schema.

do $$
begin
  if to_regclass('public.notifications') is not null then
    execute 'drop policy if exists notifications_update_own on public.notifications';
    execute 'create policy notifications_update_own on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid())';
    execute 'grant update (read_at) on public.notifications to authenticated';

    execute 'drop policy if exists notifications_delete_own on public.notifications';
    execute 'create policy notifications_delete_own on public.notifications for delete using (user_id = auth.uid())';
    execute 'grant delete on public.notifications to authenticated';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
