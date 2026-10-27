-- ===========================================================================
-- Elite Referees AFA — FICHEIRO 6: provas do ficheiro 5
-- ---------------------------------------------------------------------------
-- Corre no SQL Editor DEPOIS do ficheiro 5. Cria uma equipa de mentira, tenta
-- contornar a aprovação, o limite de tentativas e o lixo, e apaga tudo no fim.
--
-- Se aparecer um único FALHOU, o ficheiro acaba em erro e não se deve avançar.
-- ===========================================================================

do $$
declare
  u_chefe uuid := gen_random_uuid(); u_a1 uuid := gen_random_uuid();
  u_a2 uuid := gen_random_uuid();    u_fora uuid := gen_random_uuid();
  v_eq uuid; v_cod text; v_cod2 text; v_ep uuid; v_jogo uuid; v_lugar uuid; v_pedido uuid;
  v_desp uuid; v_lx uuid; v_papel text;
  n int; i int; falhas int := 0;
begin
  insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
  values
    (u_chefe,'authenticated','authenticated','prova5-chefe@exemplo.invalid',now(),now(),now(),'{"nome":"Chefe"}'::jsonb),
    (u_a1,   'authenticated','authenticated','prova5-a1@exemplo.invalid',   now(),now(),now(),'{"nome":"Bruno"}'::jsonb),
    (u_a2,   'authenticated','authenticated','prova5-a2@exemplo.invalid',   now(),now(),now(),'{"nome":"Novo"}'::jsonb),
    (u_fora, 'authenticated','authenticated','prova5-fora@exemplo.invalid', now(),now(),now(),'{"nome":"Fora"}'::jsonb);

  -- Cenário: equipa com um lugar antigo "Bruno" por reclamar, com um jogo.
  perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  select equipa_id, codigo into v_eq, v_cod from criar_equipa('Equipa Prova 5','Chefe');
  insert into epocas(equipa_id, nome, ano_inicio) values (v_eq,'2025/26',2025) returning id into v_ep;
  insert into membros_equipa(equipa_id, user_id, nome, papel) values (v_eq, null, 'Bruno', 'assistente')
    returning id into v_lugar;
  insert into jogos(equipa_id, epoca_id, data, escalao, local)
    values (v_eq, v_ep, '2026-01-10', 'sub 14 IN', 'Campo A') returning id into v_jogo;
  insert into participacoes(equipa_id, jogo_id, membro_id, funcao, valor)
    values (v_eq, v_jogo, v_lugar, 'AA', 18.5);

  -- ---- APROVAÇÃO ---------------------------------------------------------
  reset role; perform set_config('request.jwt.claim.sub', u_a1::text, true); set local role authenticated;
  select papel into v_papel from entrar_com_codigo(v_cod, 'Bruno');
  if v_papel = 'pendente' then raise notice 'PASSOU A1. quem entra com código fica pendente';
  else falhas:=falhas+1; raise notice 'FALHOU A1. entrou logo como %', v_papel; end if;

  select count(*) into n from jogos;
  if n = 0 then raise notice 'PASSOU A2. pendente não vê os jogos do lugar que pediu';
  else falhas:=falhas+1; raise notice 'FALHOU A2. pendente vê % jogos', n; end if;

  select count(*) into n from membros_equipa where user_id = u_a1;
  if n = 1 then raise notice 'PASSOU A3. pendente lê o seu próprio pedido';
  else falhas:=falhas+1; raise notice 'FALHOU A3. pendente não vê o pedido (vê %)', n; end if;

  select id into v_pedido from membros_equipa where user_id = u_a1;
  begin
    perform aprovar_membro(v_pedido);
    falhas:=falhas+1; raise notice 'FALHOU A4. aprovou-se a si próprio!';
  exception when others then raise notice 'PASSOU A4. não se aprova a si próprio'; end;

  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  select count(*) into n from membros_equipa where id = v_lugar and user_id is null;
  if n = 1 then raise notice 'PASSOU A5. o lugar "Bruno" continua livre até aprovação';
  else falhas:=falhas+1; raise notice 'FALHOU A5. o lugar foi ocupado sem aprovação!'; end if;

  perform aprovar_membro(v_pedido);
  select count(*) into n from membros_equipa where id = v_lugar and user_id = u_a1 and aprovado;
  if n = 1 then raise notice 'PASSOU A6. aprovado, o lugar antigo passa a ser da conta';
  else falhas:=falhas+1; raise notice 'FALHOU A6. o lugar não ficou ligado à conta'; end if;
  select count(*) into n from membros_equipa where id = v_pedido;
  if n = 0 then raise notice 'PASSOU A7. a linha do pedido desapareceu (não há lugar duplicado)';
  else falhas:=falhas+1; raise notice 'FALHOU A7. ficou uma linha a mais'; end if;

  reset role; perform set_config('request.jwt.claim.sub', u_a1::text, true); set local role authenticated;
  select count(*) into n from jogos;
  if n = 1 then raise notice 'PASSOU A8. depois de aprovado vê o jogo em que participou';
  else falhas:=falhas+1; raise notice 'FALHOU A8. aprovado vê % jogos', n; end if;

  reset role; perform set_config('request.jwt.claim.sub', u_a2::text, true); set local role authenticated;
  perform entrar_com_codigo(v_cod, 'Novo');
  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  select id into v_pedido from membros_equipa where user_id = u_a2;
  perform recusar_membro(v_pedido);
  select count(*) into n from membros_equipa where user_id = u_a2;
  if n = 0 then raise notice 'PASSOU A9. o responsável recusa um pedido';
  else falhas:=falhas+1; raise notice 'FALHOU A9. o pedido recusado ficou lá'; end if;

  -- ---- CONVITES ----------------------------------------------------------
  reset role; perform set_config('request.jwt.claim.sub', u_fora::text, true); set local role authenticated;
  for i in 1..10 loop
    select count(*) into n from entrar_com_codigo('ZZZZZ'||i, 'Intruso');
  end loop;
  begin
    perform entrar_com_codigo(v_cod, 'Intruso');
    falhas:=falhas+1; raise notice 'FALHOU C1. à 11.ª tentativa ainda deixou tentar';
  exception when others then raise notice 'PASSOU C1. ao fim de 10 códigos errados, bloqueia (mesmo com o certo)'; end;

  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  update equipas set codigo_expira_em = now() - interval '1 minute' where id = v_eq;
  reset role; perform set_config('request.jwt.claim.sub', u_a2::text, true); set local role authenticated;
  select count(*) into n from entrar_com_codigo(v_cod, 'Novo');
  if n = 0 then raise notice 'PASSOU C2. código expirado não deixa entrar';
  else falhas:=falhas+1; raise notice 'FALHOU C2. entrou com código expirado'; end if;

  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  v_cod2 := rodar_codigo(v_eq);
  reset role; perform set_config('request.jwt.claim.sub', u_a2::text, true); set local role authenticated;
  select count(*) into n from entrar_com_codigo(v_cod2, 'Novo');
  if n = 1 then raise notice 'PASSOU C3. rodar o código dá um código novo e válido';
  else falhas:=falhas+1; raise notice 'FALHOU C3. o código rodado não funciona'; end if;

  -- ---- LIXO --------------------------------------------------------------
  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  delete from jogos where id = v_jogo;
  select count(*) into n from lixo where equipa_id = v_eq and tabela in ('jogos','participacoes');
  if n = 2 then raise notice 'PASSOU L1. apagar um jogo guarda-o no lixo com a participação';
  else falhas:=falhas+1; raise notice 'FALHOU L1. o lixo tem % linhas (esperava 2)', n; end if;

  reset role; perform set_config('request.jwt.claim.sub', u_a1::text, true); set local role authenticated;
  select count(*) into n from lixo;
  if n = 0 then raise notice 'PASSOU L2. o assistente não vê o lixo da equipa';
  else falhas:=falhas+1; raise notice 'FALHOU L2. o assistente vê % linhas do lixo', n; end if;
  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  select id into v_lx from lixo where equipa_id = v_eq and tabela = 'jogos';
  reset role; perform set_config('request.jwt.claim.sub', u_a1::text, true); set local role authenticated;
  begin
    perform repor_do_lixo(v_lx);
    falhas:=falhas+1; raise notice 'FALHOU L3. o assistente repôs um jogo!';
  exception when others then raise notice 'PASSOU L3. o assistente não repõe jogos'; end;

  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  perform repor_do_lixo(v_lx);
  select count(*) into n from participacoes where jogo_id = v_jogo and membro_id = v_lugar and valor = 18.5;
  if n = 1 then raise notice 'PASSOU L4. repor o jogo devolve quem estava nomeado, com o valor';
  else falhas:=falhas+1; raise notice 'FALHOU L4. o jogo voltou sem a participação'; end if;
  select count(*) into n from lixo where equipa_id = v_eq;
  if n = 0 then raise notice 'PASSOU L5. o que foi reposto sai do lixo';
  else falhas:=falhas+1; raise notice 'FALHOU L5. ficaram % linhas no lixo', n; end if;

  -- despesas: de cada um, também no lixo
  reset role; perform set_config('request.jwt.claim.sub', u_a1::text, true); set local role authenticated;
  insert into despesas(equipa_id, epoca_id, membro_id, data, categoria, valor)
    values (v_eq, v_ep, v_lugar, '2026-01-10', 'Almoço', 9) returning id into v_desp;
  delete from despesas where id = v_desp;
  select id into v_lx from lixo where tabela = 'despesas';
  if v_lx is not null then raise notice 'PASSOU L6. o dono vê a sua despesa apagada no lixo';
  else falhas:=falhas+1; raise notice 'FALHOU L6. a despesa não aparece no lixo do dono'; end if;

  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  select count(*) into n from lixo where tabela = 'despesas';
  if n = 0 then raise notice 'PASSOU L7. o responsável não vê a despesa de outro no lixo';
  else falhas:=falhas+1; raise notice 'FALHOU L7. o responsável vê despesas alheias no lixo'; end if;
  begin
    perform repor_do_lixo(v_lx);
    falhas:=falhas+1; raise notice 'FALHOU L8. o responsável repôs a despesa de outro';
  exception when others then raise notice 'PASSOU L8. só o dono repõe a sua despesa'; end;

  reset role; perform set_config('request.jwt.claim.sub', u_a1::text, true); set local role authenticated;
  perform repor_do_lixo(v_lx);
  select count(*) into n from despesas where id = v_desp;
  if n = 1 then raise notice 'PASSOU L9. o dono repõe a sua despesa';
  else falhas:=falhas+1; raise notice 'FALHOU L9. a despesa não voltou'; end if;

  begin
    insert into lixo(equipa_id, tabela, registo) values (v_eq, 'multas', '{}'::jsonb);
    falhas:=falhas+1; raise notice 'FALHOU L10. escreveu diretamente no lixo';
  exception when others then raise notice 'PASSOU L10. ninguém escreve diretamente no lixo'; end;

  -- ---- GUARDAR JOGO (ficheiro 4) -----------------------------------------
  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  declare g uuid := gen_random_uuid(); begin
    perform guardar_jogo(
      jsonb_build_object('id',g,'equipa_id',v_eq,'epoca_id',v_ep,'data','2026-02-01','escalao','sub 16 JUV'),
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'membro_id',v_lugar,'funcao','AA','valor',19.5)));
    select count(*) into n from participacoes where jogo_id = g;
    if n = 1 then raise notice 'PASSOU G1. guardar_jogo grava o jogo e a participação juntos';
    else falhas:=falhas+1; raise notice 'FALHOU G1. ficaram % participações', n; end if;

    perform guardar_jogo(
      jsonb_build_object('id',g,'equipa_id',v_eq,'epoca_id',v_ep,'data','2026-02-01','escalao','sub 16 JUV'),
      '[]'::jsonb);
    select count(*) into n from participacoes where jogo_id = g;
    if n = 0 then raise notice 'PASSOU G2. quem sai da nomeação sai da base de dados';
    else falhas:=falhas+1; raise notice 'FALHOU G2. ficaram % participações', n; end if;
  end;

  declare g uuid := gen_random_uuid(); begin
    begin
      perform guardar_jogo(
        jsonb_build_object('id',g,'equipa_id',v_eq,'epoca_id',v_ep,'data','2026-02-08'),
        jsonb_build_array(jsonb_build_object('membro_id',gen_random_uuid(),'funcao','AA','valor',10)));
    exception when others then null; end;
    select count(*) into n from jogos where id = g;
    if n = 0 then raise notice 'PASSOU G3. uma participação inválida desfaz o jogo todo (tudo ou nada)';
    else falhas:=falhas+1; raise notice 'FALHOU G3. o jogo ficou gravado sem a participação'; end if;
  end;

  reset role; perform set_config('request.jwt.claim.sub', u_a1::text, true); set local role authenticated;
  begin
    perform guardar_jogo(
      jsonb_build_object('id',gen_random_uuid(),'equipa_id',v_eq,'epoca_id',v_ep,'data','2026-02-15'),'[]'::jsonb);
    falhas:=falhas+1; raise notice 'FALHOU G4. o assistente gravou um jogo';
  exception when others then raise notice 'PASSOU G4. o assistente não grava jogos'; end;

  -- ---- limpeza (apagar a equipa não pode falhar por causa do lixo) --------
  reset role;
  delete from equipas where nome = 'Equipa Prova 5';
  delete from tentativas_codigo where user_id in (u_chefe, u_a1, u_a2, u_fora);
  delete from auth.users where email like 'prova5-%@exemplo.invalid';

  if falhas = 0 then
    raise notice '----------------------------------------';
    raise notice 'TUDO PASSOU. Lixo, aprovação e convites estão na base de dados.';
  else
    raise exception '% PROVA(S) FALHARAM.', falhas;
  end if;
end $$;
