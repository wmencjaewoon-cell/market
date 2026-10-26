-- Run after deploying cleanup-as-analyses and setting its secret.
-- In Supabase Vault, first create:
--   as_ai_project_url: https://YOUR_PROJECT_REF.supabase.co
--   as_ai_cleanup_secret: the same 32+ character random value as AS_AI_CLEANUP_SECRET
-- Do not paste actual secrets into source-controlled files.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare old_job bigint;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'as_ai_project_url' and decrypted_secret like 'https://%')
    or not exists (select 1 from vault.decrypted_secrets where name = 'as_ai_cleanup_secret' and length(decrypted_secret) >= 32) then
    raise exception 'Set as_ai_project_url and as_ai_cleanup_secret in Vault first.';
  end if;
  for old_job in select jobid from cron.job where jobname = 'as-ai-retention' loop
    perform cron.unschedule(old_job);
  end loop;
  perform cron.schedule('as-ai-retention', '15 * * * *', $job$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'as_ai_project_url'), '/') || '/functions/v1/cleanup-as-analyses',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-as-cleanup-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'as_ai_cleanup_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$);
end;
$$;
