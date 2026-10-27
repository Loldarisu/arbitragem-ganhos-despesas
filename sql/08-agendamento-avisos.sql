-- ===========================================================================
-- Elite Referees AFA — FICHEIRO 8: chamar a função dos avisos de 10 em 10 min
-- ---------------------------------------------------------------------------
-- Corre no SQL Editor DEPOIS de publicares a função avisos-prazos (ver
-- docs/AVISOS-PUSH.md, passos 1 a 4). Antes de correr, troca DUAS coisas:
--
--   <REF-DO-PROJETO>  o identificador do projeto, o que aparece no endereço
--                     https://<REF-DO-PROJETO>.supabase.co
--   <CRON_SEGREDO>    o MESMO segredo que puseste com
--                     supabase secrets set CRON_SEGREDO=...
--
-- O segredo fica no Vault do Supabase (cifrado), não no texto do agendamento.
-- Pode ser corrido outra vez: substitui o agendamento e o segredo.
--
-- Nota: este ficheiro usa pg_cron, pg_net e o Vault, que só existem no
-- Supabase — não foi possível testá-lo fora dele.
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- O endereço da função e o segredo, guardados no Vault
do $$
begin
  perform vault.create_secret('https://<REF-DO-PROJETO>.supabase.co/functions/v1/avisos-prazos', 'avisos_url');
exception when unique_violation then
  perform vault.update_secret((select id from vault.secrets where name = 'avisos_url'),
                              'https://<REF-DO-PROJETO>.supabase.co/functions/v1/avisos-prazos');
end $$;

do $$
begin
  perform vault.create_secret('<CRON_SEGREDO>', 'avisos_segredo');
exception when unique_violation then
  perform vault.update_secret((select id from vault.secrets where name = 'avisos_segredo'), '<CRON_SEGREDO>');
end $$;

-- De 10 em 10 minutos. A função decide sozinha se há alguma coisa para enviar.
select cron.unschedule('avisos-prazos') where exists (select 1 from cron.job where jobname = 'avisos-prazos');
select cron.schedule('avisos-prazos', '*/10 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_segredo')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);

-- Para ver se está a correr (a coluna status deve dizer "succeeded"):
--   select jobid, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
-- E a resposta da função:
--   select id, status_code, content from net._http_response order by created desc limit 10;
-- Para parar:
--   select cron.unschedule('avisos-prazos');
