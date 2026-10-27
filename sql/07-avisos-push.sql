-- ===========================================================================
-- Elite Referees AFA — FICHEIRO 7: avisos no telemóvel (push)
-- ---------------------------------------------------------------------------
-- Corre no SQL Editor DEPOIS do ficheiro 5. Idempotente; não mexe em dados.
--
-- Duas tabelas:
--   subscricoes_push — um telemóvel que aceitou receber avisos. Cada pessoa
--                      só vê, cria e apaga as SUAS.
--   avisos_enviados  — o que já foi enviado, para cada aviso sair uma vez.
--                      Só a Edge Function lá mexe (chave de serviço); a app
--                      não lê nem escreve.
--
-- Isto sozinho não envia nada: é preciso publicar a função avisos-prazos e
-- ligar o agendamento (sql/08). O guia está em docs/AVISOS-PUSH.md.
-- ===========================================================================

create table if not exists subscricoes_push (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  equipa_id  uuid not null references equipas(id) on delete cascade,
  membro_id  uuid not null references membros_equipa(id) on delete cascade,
  endpoint   text not null unique,       -- o endereço do serviço de push deste telemóvel
  p256dh     text not null,
  auth       text not null,
  criada_em  timestamptz not null default now()
);
create index if not exists ix_subs_membro on subscricoes_push(membro_id);

alter table subscricoes_push enable row level security;
alter table subscricoes_push force  row level security;

drop policy if exists "as minhas subscricoes le" on subscricoes_push;
create policy "as minhas subscricoes le" on subscricoes_push
  for select to authenticated using (user_id = auth.uid());

-- Só para o MEU lugar numa equipa onde estou aprovado: não se subscreve avisos
-- em nome de outra pessoa.
drop policy if exists "as minhas subscricoes cria" on subscricoes_push;
create policy "as minhas subscricoes cria" on subscricoes_push
  for insert to authenticated with check (
    user_id = auth.uid() and membro_id = meu_membro_id(equipa_id)
  );

drop policy if exists "as minhas subscricoes altera" on subscricoes_push;
create policy "as minhas subscricoes altera" on subscricoes_push
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and membro_id = meu_membro_id(equipa_id));

drop policy if exists "as minhas subscricoes apaga" on subscricoes_push;
create policy "as minhas subscricoes apaga" on subscricoes_push
  for delete to authenticated using (user_id = auth.uid());

create table if not exists avisos_enviados (
  jogo_id    uuid not null references jogos(id) on delete cascade,
  membro_id  uuid not null references membros_equipa(id) on delete cascade,
  tipo       text not null check (tipo in ('confirmar','horas','sair')),
  enviado_em timestamptz not null default now(),
  primary key (jogo_id, membro_id, tipo)
);
alter table avisos_enviados enable row level security;
alter table avisos_enviados force  row level security;
-- sem políticas: só a chave de serviço (a Edge Function) lá chega

-- ---------------------------------------------------------------------------
-- Provas rápidas (corre, e deve acabar em "TUDO PASSOU")
-- ---------------------------------------------------------------------------
do $$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
        v_eq uuid; v_cod text; m1 uuid; n int; falhas int := 0;
begin
  insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
  values (u1,'authenticated','authenticated','prova7-a@exemplo.invalid',now(),now(),now(),'{}'::jsonb),
         (u2,'authenticated','authenticated','prova7-b@exemplo.invalid',now(),now(),now(),'{}'::jsonb);

  perform set_config('request.jwt.claim.sub', u1::text, true); set local role authenticated;
  select equipa_id, codigo into v_eq, v_cod from criar_equipa('Equipa Prova 7','A');
  select id into m1 from membros_equipa where equipa_id = v_eq and user_id = u1;
  insert into subscricoes_push(equipa_id, membro_id, endpoint, p256dh, auth)
    values (v_eq, m1, 'https://push.exemplo/1', 'k', 'a');
  select count(*) into n from subscricoes_push;
  if n = 1 then raise notice 'PASSOU P1. subscrevo avisos para mim';
  else falhas:=falhas+1; raise notice 'FALHOU P1. (%)', n; end if;

  reset role; perform set_config('request.jwt.claim.sub', u2::text, true); set local role authenticated;
  select count(*) into n from subscricoes_push;
  if n = 0 then raise notice 'PASSOU P2. outra conta não vê as minhas subscrições';
  else falhas:=falhas+1; raise notice 'FALHOU P2. vê % subscrições alheias', n; end if;
  begin
    insert into subscricoes_push(equipa_id, membro_id, endpoint, p256dh, auth)
      values (v_eq, m1, 'https://push.exemplo/2', 'k', 'a');
    falhas:=falhas+1; raise notice 'FALHOU P3. subscreveu avisos em nome de outra pessoa';
  exception when others then raise notice 'PASSOU P3. não subscreve em nome de outra pessoa'; end;
  select count(*) into n from avisos_enviados;
  begin
    insert into avisos_enviados(jogo_id, membro_id, tipo) values (gen_random_uuid(), m1, 'sair');
    falhas:=falhas+1; raise notice 'FALHOU P4. a app escreveu em avisos_enviados';
  exception when others then raise notice 'PASSOU P4. a app não escreve em avisos_enviados'; end;

  reset role;
  delete from equipas where nome = 'Equipa Prova 7';
  delete from auth.users where email like 'prova7-%@exemplo.invalid';
  if falhas = 0 then raise notice 'TUDO PASSOU. Avisos push: tabelas e permissões prontas.';
  else raise exception '% PROVA(S) FALHARAM.', falhas; end if;
end $$;
