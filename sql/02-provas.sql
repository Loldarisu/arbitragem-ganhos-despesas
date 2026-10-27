-- ===========================================================================
-- Elite Referees AFA — FICHEIRO 2 de 3: provas das políticas RLS
-- ---------------------------------------------------------------------------
-- Corre no SQL Editor DEPOIS do ficheiro 1. Cria uma equipa de mentira, tenta
-- violar todas as regras, e apaga tudo no fim. Não deixa lixo.
--
-- Se aparecer um único FALHOU, para e avisa-me: há um buraco na segurança.
--
-- Nota técnica que interessa perceber: um UPDATE bloqueado por RLS NÃO dá
-- erro — afeta zero linhas e devolve 200. Um INSERT dá 42501. Por isso as
-- provas de escrita contam linhas em vez de esperar por uma exceção; um teste
-- mal escrito aqui passava sempre.
-- ===========================================================================

do $$
declare
  u_chefe uuid; u_a1 uuid; u_a2 uuid; u_fora uuid;
  v_eq uuid; v_cod text; v_epoca uuid;
  j_meu uuid; j_outro uuid; m_a1 uuid; m_a2 uuid;
  n int; falhas int := 0;
begin
  -- As contas de teste têm de trazer o `id` escrito à mão. No Supabase a coluna
  -- auth.users.id NÃO tem valor por omissão — quem o gera é o serviço de
  -- autenticação, não a base de dados. (Foi aqui que este ficheiro falhou da
  -- primeira vez: o meu Postgres de ensaio tinha um default que o Supabase não
  -- tem, e o erro só apareceu do lado do Pedro.)
  u_chefe := gen_random_uuid();
  u_a1    := gen_random_uuid();
  u_a2    := gen_random_uuid();
  u_fora  := gen_random_uuid();

  insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
  values
    (u_chefe,'authenticated','authenticated','prova-chefe@exemplo.invalid',now(),now(),now(),'{"nome":"Chefe"}'::jsonb),
    (u_a1,   'authenticated','authenticated','prova-a1@exemplo.invalid',   now(),now(),now(),'{"nome":"Assistente Um"}'::jsonb),
    (u_a2,   'authenticated','authenticated','prova-a2@exemplo.invalid',   now(),now(),now(),'{"nome":"Assistente Dois"}'::jsonb),
    (u_fora, 'authenticated','authenticated','prova-fora@exemplo.invalid', now(),now(),now(),'{"nome":"De Fora"}'::jsonb);

  -- =====================================================================
  -- Cenário: dois jogos. No primeiro vai o assistente 1, no segundo o 2.
  -- =====================================================================
  perform set_config('request.jwt.claim.sub', u_chefe::text, true);
  set local role authenticated;
  select equipa_id, codigo into v_eq, v_cod from criar_equipa('Equipa de Prova','Chefe');
  insert into epocas(equipa_id, nome, ano_inicio) values (v_eq,'2025/26',2025) returning id into v_epoca;

  reset role; perform set_config('request.jwt.claim.sub', u_a1::text, true); set local role authenticated;
  perform entrar_com_codigo(v_cod, 'Assistente Um');
  reset role; perform set_config('request.jwt.claim.sub', u_a2::text, true); set local role authenticated;
  perform entrar_com_codigo(v_cod, 'Assistente Dois');

  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;
  select id into m_a1 from membros_equipa where equipa_id=v_eq and user_id=u_a1;
  select id into m_a2 from membros_equipa where equipa_id=v_eq and user_id=u_a2;
  -- Com o ficheiro 5 corrido, quem entra com código fica à espera de
  -- aprovação. Estas provas são sobre o que um membro JÁ APROVADO pode fazer.
  if exists (select 1 from pg_proc where proname = 'aprovar_membro') then
    perform aprovar_membro(m_a1); perform aprovar_membro(m_a2);
  end if;

  insert into jogos(equipa_id, epoca_id, data, escalao, local)
    values (v_eq, v_epoca, '2026-01-10','sub 14 IN','Campo A') returning id into j_meu;
  insert into jogos(equipa_id, epoca_id, data, escalao, local)
    values (v_eq, v_epoca, '2026-01-17','Sub 19 JUN','Campo B') returning id into j_outro;

  insert into participacoes(equipa_id, jogo_id, membro_id, funcao, valor)
    values (v_eq, j_meu,   m_a1, 'AA', 18.50);
  insert into participacoes(equipa_id, jogo_id, membro_id, funcao, valor)
    values (v_eq, j_outro, m_a2, 'AA', 20.50);

  -- As despesas são de cada um: o próprio lança as suas. O responsável já não
  -- as pode lançar por ninguém — é por isso que cada assistente lança a sua
  -- mais abaixo, com a sua sessão.

  insert into multas(equipa_id, epoca_id, membro_id, data, descricao, valor)
    values (v_eq, v_epoca, m_a1, '2026-01-13','atraso', 5);
  insert into multas(equipa_id, epoca_id, membro_id, data, descricao, valor)
    values (v_eq, v_epoca, m_a2, '2026-01-13','material', 3);

  insert into tabela_valores(equipa_id, epoca_id, tipo, escalao, funcao, valor)
    values (v_eq, v_epoca, 'Distrital','sub 14 IN','AA', 18.50);

  -- A associação paga por pessoa, por mês e por competição: duas folhas.
  insert into pagamentos(equipa_id, epoca_id, membro_id, tipo, mes, valor, data)
    values (v_eq, v_epoca, m_a1, 'Distrital', '2026-01', 18.50, '2026-02-05'),
           (v_eq, v_epoca, m_a2, 'Distrital', '2026-01', 20.50, '2026-02-05');

  raise notice 'PASSOU  1. responsável monta a época toda';

  -- o assistente 2 lança a sua despesa
  reset role; perform set_config('request.jwt.claim.sub', u_a2::text, true); set local role authenticated;
  insert into despesas(equipa_id, epoca_id, membro_id, data, categoria, descricao, valor)
    values (v_eq, v_epoca, m_a2, '2026-01-12','Jantar','do Dois', 60);

  -- =====================================================================
  -- O ASSISTENTE 1, a partir daqui
  -- =====================================================================
  reset role; perform set_config('request.jwt.claim.sub', u_a1::text, true); set local role authenticated;

  -- D1. lança a SUA despesa — é a única escrita que um assistente faz
  begin
    insert into despesas(equipa_id, epoca_id, membro_id, data, categoria, descricao, valor)
      values (v_eq, v_epoca, m_a1, '2026-01-12','Almoço','do Um', 40);
    raise notice 'PASSOU D1. o assistente lança a sua própria despesa';
  exception when others then
    falhas:=falhas+1; raise notice 'FALHOU D1. o assistente não conseguiu lançar a sua despesa: %', sqlerrm;
  end;

  -- D2. mas não lança uma em nome de outro
  begin
    insert into despesas(equipa_id, epoca_id, membro_id, data, categoria, descricao, valor)
      values (v_eq, v_epoca, m_a2, '2026-01-12','Jantar','falsa', 999);
    falhas:=falhas+1; raise notice 'FALHOU D2. lançou uma despesa em nome de outro!';
  exception when insufficient_privilege then
    raise notice 'PASSOU D2. não lança despesas em nome de outro (42501)';
  end;

  -- D3. edita a sua
  update despesas set valor = 45 where membro_id = m_a1;
  get diagnostics n = row_count;
  if n = 1 then raise notice 'PASSOU D3. edita a sua própria despesa';
  else falhas:=falhas+1; raise notice 'FALHOU D3. não editou a sua (% linhas)', n; end if;

  -- D4. não mexe na do outro
  update despesas set valor = 0 where membro_id = m_a2;
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASSOU D4. não mexe na despesa do outro';
  else falhas:=falhas+1; raise notice 'FALHOU D4. mexeu em % despesas do outro!', n; end if;

  -- 2. vê a SUA participação e só a sua
  select count(*) into n from participacoes;
  if n = 1 then raise notice 'PASSOU  2. o assistente vê 1 participação (a dele)';
  else falhas:=falhas+1; raise notice 'FALHOU  2. o assistente vê % participações', n; end if;

  select count(*) into n from participacoes where membro_id = m_a2;
  if n = 0 then raise notice 'PASSOU  3. não vê o que o outro assistente ganhou';
  else falhas:=falhas+1; raise notice 'FALHOU  3. vê % participações do outro!', n; end if;

  -- 4. vê o jogo em que participou, não vê o outro
  select count(*) into n from jogos where id = j_meu;
  if n = 1 then raise notice 'PASSOU  4a. vê o jogo em que foi nomeado';
  else falhas:=falhas+1; raise notice 'FALHOU  4a. não vê o próprio jogo'; end if;

  select count(*) into n from jogos where id = j_outro;
  if n = 0 then raise notice 'PASSOU  4b. não vê o jogo em que não foi nomeado';
  else falhas:=falhas+1; raise notice 'FALHOU  4b. vê o jogo dos outros!'; end if;

  -- 5. despesas: só as dele
  select count(*) into n from despesas;
  if n = 1 then raise notice 'PASSOU  5. vê 1 despesa (a dele)';
  else falhas:=falhas+1; raise notice 'FALHOU  5. vê % despesas', n; end if;

  -- 6. MULTAS: a exceção do brief — vê as de toda a gente
  select count(*) into n from multas;
  if n = 2 then raise notice 'PASSOU  6. vê as multas de TODA a equipa (2)';
  else falhas:=falhas+1; raise notice 'FALHOU  6. vê % multas, deviam ser 2', n; end if;

  -- 7. tabela de valores: reservada ao responsável
  select count(*) into n from tabela_valores;
  if n = 0 then raise notice 'PASSOU  7. não lê a tabela de valores';
  else falhas:=falhas+1; raise notice 'FALHOU  7. lê a tabela de valores'; end if;

  -- 7b. pagamentos: vê a SUA folha, não a dos outros
  select count(*) into n from pagamentos;
  if n = 1 then raise notice 'PASSOU  7b. vê 1 pagamento (a folha dele)';
  else falhas:=falhas+1; raise notice 'FALHOU  7b. vê % pagamentos', n; end if;

  select count(*) into n from pagamentos where membro_id = m_a2;
  if n = 0 then raise notice 'PASSOU  7c. não vê quanto o outro recebeu';
  else falhas:=falhas+1; raise notice 'FALHOU  7c. vê a folha do outro!'; end if;

  update pagamentos set valor = 999 where membro_id = m_a1;
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASSOU  7d. não mexe no valor da sua própria folha';
  else falhas:=falhas+1; raise notice 'FALHOU  7d. alterou % pagamentos!', n; end if;

  -- 8. vê os membros da equipa (precisa disso para saber quem é quem)
  select count(*) into n from membros_equipa;
  if n = 3 then raise notice 'PASSOU  8. vê os 3 membros da equipa';
  else falhas:=falhas+1; raise notice 'FALHOU  8. vê % membros', n; end if;

  -- =====================================================================
  -- ESCRITA: o assistente não escreve NADA
  -- =====================================================================
  begin
    insert into jogos(equipa_id, epoca_id, data) values (v_eq, v_epoca, '2030-01-01');
    falhas:=falhas+1; raise notice 'FALHOU  9. criou um jogo!';
  exception when insufficient_privilege then
    raise notice 'PASSOU  9. insert de jogo recusado (42501)';
  end;

  begin
    insert into participacoes(equipa_id, jogo_id, membro_id, funcao, valor)
      values (v_eq, j_meu, m_a1, 'A', 999);
    falhas:=falhas+1; raise notice 'FALHOU 10. criou uma participação para si!';
  exception when others then
    raise notice 'PASSOU 10. insert de participação recusado';
  end;

  update participacoes set valor = 999 where membro_id = m_a1;
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASSOU 11. não aumenta o seu próprio valor';
  else falhas:=falhas+1; raise notice 'FALHOU 11. aumentou % participações!', n; end if;

  update jogos set local = 'invadido';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASSOU 12. não altera jogos';
  else falhas:=falhas+1; raise notice 'FALHOU 12. alterou % jogos!', n; end if;

  delete from jogos where id = j_meu;
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASSOU 13. não apaga jogos';
  else falhas:=falhas+1; raise notice 'FALHOU 13. apagou % jogos!', n; end if;

  update multas set pago = true;
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASSOU 14. vê as multas mas não lhes mexe';
  else falhas:=falhas+1; raise notice 'FALHOU 14. mexeu em % multas!', n; end if;

  update membros_equipa set papel = 'responsavel' where user_id = u_a1;
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASSOU 15. não se promove a responsável';
  else falhas:=falhas+1; raise notice 'FALHOU 15. PROMOVEU-SE!'; end if;

  -- 16. nem se auto-inscreve numa nomeação para passar a ver outro jogo
  begin
    update participacoes set membro_id = m_a1 where jogo_id = j_outro;
    get diagnostics n = row_count;
    if n = 0 then raise notice 'PASSOU 16. não se mete no jogo dos outros';
    else falhas:=falhas+1; raise notice 'FALHOU 16. meteu-se em % jogos!', n; end if;
  exception when others then
    raise notice 'PASSOU 16. não se mete no jogo dos outros (recusado)';
  end;

  -- =====================================================================
  -- QUEM ESTÁ FORA DA EQUIPA
  -- =====================================================================
  reset role; perform set_config('request.jwt.claim.sub', u_fora::text, true); set local role authenticated;

  select count(*) into n from jogos;          if n>0 then falhas:=falhas+1; raise notice 'FALHOU 17a. estranho vê % jogos', n; else raise notice 'PASSOU 17a. estranho vê 0 jogos'; end if;
  select count(*) into n from multas;         if n>0 then falhas:=falhas+1; raise notice 'FALHOU 17b. estranho vê % multas', n; else raise notice 'PASSOU 17b. estranho vê 0 multas'; end if;
  select count(*) into n from participacoes;  if n>0 then falhas:=falhas+1; raise notice 'FALHOU 17c. estranho vê % participações', n; else raise notice 'PASSOU 17c. estranho vê 0 participações'; end if;
  select count(*) into n from pagamentos;     if n>0 then falhas:=falhas+1; raise notice 'FALHOU 17c2. estranho vê % folhas', n; else raise notice 'PASSOU 17c2. estranho vê 0 folhas de pagamento'; end if;
  select count(*) into n from equipas;        if n>0 then falhas:=falhas+1; raise notice 'FALHOU 17d. estranho lê equipas (e os códigos!)'; else raise notice 'PASSOU 17d. estranho não lê equipas nem códigos'; end if;
  select count(*) into n from membros_equipa; if n>0 then falhas:=falhas+1; raise notice 'FALHOU 17e. estranho vê % membros', n; else raise notice 'PASSOU 17e. estranho vê 0 membros'; end if;

  -- Antes do ficheiro 5 um código errado dá erro; depois devolve zero linhas
  -- (para a tentativa ficar contada). As duas respostas são recusas.
  begin
    select count(*) into n from entrar_com_codigo('AAAAAA','Intruso');
    if n > 0 then falhas:=falhas+1; raise notice 'FALHOU 18. entrou com um código inventado!';
    else raise notice 'PASSOU 18. código inventado recusado'; end if;
  exception when others then
    raise notice 'PASSOU 18. código inventado recusado';
  end;

  -- 19. outra equipa não vê nada desta
  declare v_eq2 uuid; begin
    select equipa_id into v_eq2 from criar_equipa('Outra Equipa','Fora');
    select count(*) into n from jogos;
    if n = 0 then raise notice 'PASSOU 19. responsável da equipa B não vê nada da equipa A';
    else falhas:=falhas+1; raise notice 'FALHOU 19. vê % jogos da outra equipa!', n; end if;
  end;

  -- =====================================================================
  -- O RESPONSÁVEL continua a poder tudo (não fechámos a porta a mais)
  -- =====================================================================
  reset role; perform set_config('request.jwt.claim.sub', u_chefe::text, true); set local role authenticated;

  select count(*) into n from pagamentos;
  if n = 2 then raise notice 'PASSOU 19b. o responsável vê as folhas de todos';
  else falhas:=falhas+1; raise notice 'FALHOU 19b. o responsável vê % folhas', n; end if;

  -- D5. as despesas dos assistentes são deles: o responsável não as vê
  select count(*) into n from despesas;
  if n = 0 then raise notice 'PASSOU D5. o responsável NÃO vê as despesas dos assistentes';
  else falhas:=falhas+1; raise notice 'FALHOU D5. o responsável vê % despesas dos outros!', n; end if;

  update despesas set valor = 0;
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASSOU D6. nem as consegue alterar';
  else falhas:=falhas+1; raise notice 'FALHOU D6. o responsável alterou % despesas de outros!', n; end if;

  select count(*) into n from participacoes;
  if n = 2 then raise notice 'PASSOU 20. o responsável vê as participações todas';
  else falhas:=falhas+1; raise notice 'FALHOU 20. o responsável vê % participações', n; end if;

  select count(*) into n from jogos;
  if n = 2 then raise notice 'PASSOU 21. o responsável vê os jogos todos';
  else falhas:=falhas+1; raise notice 'FALHOU 21. o responsável vê % jogos', n; end if;

  update jogos set local = 'Campo da Prova' where id = j_meu;
  get diagnostics n = row_count;
  if n = 1 then raise notice 'PASSOU 22. o responsável altera o jogo';
  else falhas:=falhas+1; raise notice 'FALHOU 22. o responsável não conseguiu alterar!'; end if;

  update jogos set confirmada = true, horas_marcadas = true, num_jogo = '114010120' where id = j_meu;
  select count(*) into n from jogos where id = j_meu and confirmada and horas_marcadas and num_jogo = '114010120';
  if n = 1 then raise notice 'PASSOU 22b. "confirmada", "horas marcadas" e número do jogo ficam gravados';
  else falhas:=falhas+1; raise notice 'FALHOU 22b. os campos do jogo não ficaram gravados'; end if;

  update membros_equipa set funcao_habitual = 'AA1' where id = m_a1;
  get diagnostics n = row_count;
  if n = 1 then raise notice 'PASSOU 23. o responsável define a função habitual';
  else falhas:=falhas+1; raise notice 'FALHOU 23. não conseguiu definir a função'; end if;

  -- ---- limpeza ---------------------------------------------------------
  reset role;
  delete from equipas where nome in ('Equipa de Prova','Outra Equipa');
  delete from auth.users where email like 'prova-%@exemplo.invalid';

  if falhas = 0 then
    raise notice '----------------------------------------';
    raise notice 'TUDO PASSOU. As permissões estão na base de dados.';
  else
    raise exception '% PROVA(S) FALHARAM — não avances para o ficheiro 3.', falhas;
  end if;
end $$;
