-- ===========================================================================
-- Elite Referees AFA — contas, equipas e permissões
-- FICHEIRO 3 de 3: migração do JSON atual para as tabelas novas
-- ---------------------------------------------------------------------------
-- O QUE ISTO FAZ E O QUE NÃO FAZ
--
--   FAZ    -> lê a linha `estado` (id=1) que tens hoje e copia o conteúdo para
--             as tabelas novas.
--   NÃO FAZ-> não apaga, não altera e não toca em `estado`. A tua época
--             inteira continua lá, byte a byte, como backup.
--
-- É por isso que é reversível: para desfazer, apaga a equipa criada (ficam
-- todas as tabelas limpas por cascata) e o `estado` nunca soube de nada.
-- O comando de desfazer está no fim do ficheiro.
--
-- Pode ser corrido várias vezes: cada registo leva o `id` antigo no campo
-- `id_antigo`, por isso a segunda passagem não duplica nada.
-- ===========================================================================

-- --- ajuda: "12,5" ou "" ou null -> numeric ou null -----------------------
create or replace function public.mig_num(t text)
returns numeric language sql immutable as $$
  select case when t is null or btrim(t) = '' then null
              else nullif(replace(btrim(t), ',', '.'), '')::numeric end;
$$;

create or replace function public.migrar_do_estado(
  p_email_responsavel text,
  p_nome_equipa       text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  d          jsonb;
  v_user     uuid;
  v_eq       uuid;
  v_nome_eq  text;
  v_cod      text;
  v_eu       text;      -- settings.membroEuId
  r          jsonb;
  cnt        jsonb := '{}'::jsonb;
  n          int;
begin
  -- 1. o JSON que existe hoje --------------------------------------------
  select dados into d from estado where id = 1;
  if d is null then raise exception 'Não encontrei a linha estado(id=1).'; end if;

  -- 2. a conta que fica responsável ---------------------------------------
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email_responsavel));
  if v_user is null then
    raise exception 'Não existe conta com o email %. Regista-te primeiro na app e confirma o email.', p_email_responsavel;
  end if;

  v_nome_eq := coalesce(nullif(btrim(p_nome_equipa),''),
                        nullif(btrim(d->'settings'->>'equipa'),''),
                        'A minha equipa');
  v_eu := d->'settings'->>'membroEuId';

  -- 3. a equipa (id_antigo='estado:1' -> só se cria uma vez) --------------
  select id, codigo_convite into v_eq, v_cod from equipas where id_antigo = 'estado:1';
  if v_eq is null then
    loop
      v_cod := gera_codigo();
      exit when not exists (select 1 from equipas e where e.codigo_convite = v_cod);
    end loop;
    insert into equipas(nome, codigo_convite, criada_por, id_antigo,
                        categorias)
    values (v_nome_eq, v_cod, v_user, 'estado:1',
            coalesce((select array_agg(value::text) from jsonb_array_elements_text(d->'categorias') as value),
                     array['Equipamento','Inscrição','Deslocação','Formação','Quotas','Outro']))
    returning id into v_eq;
  end if;

  -- 4. MEMBROS ------------------------------------------------------------
  -- Quem já lá estava entra com user_id NULL = "lugar por reclamar".
  -- A exceção é o membro marcado como "Eu" nas definições: esse fica logo
  -- ligado à tua conta e responsável. Ninguém mais é adivinhado.
  for r in select * from jsonb_array_elements(coalesce(d->'membros','[]'::jsonb)) loop
    insert into membros_equipa(equipa_id, user_id, nome, alias, papel, id_antigo)
    values (v_eq,
            case when r->>'id' = v_eu then v_user else null end,
            coalesce(r->>'nome','(sem nome)'),
            coalesce(r->>'alias',''),
            case when r->>'id' = v_eu then 'responsavel' else 'assistente' end,
            r->>'id')
    on conflict (equipa_id, id_antigo) do nothing;
  end loop;

  -- Se o "Eu" não estava definido, a tua conta não ficaria em lado nenhum e
  -- a equipa ficava sem responsável — ninguém conseguia escrever.
  if not exists (select 1 from membros_equipa m where m.equipa_id = v_eq and m.papel = 'responsavel' and m.user_id is not null) then
    insert into membros_equipa(equipa_id, user_id, nome, papel, id_antigo)
    values (v_eq, v_user,
            coalesce(nullif((select p.nome from perfis p where p.id = v_user),''), 'Responsável'),
            'responsavel', 'estado:responsavel')
    on conflict (equipa_id, id_antigo) do update set papel = 'responsavel', user_id = excluded.user_id;
  end if;

  -- 5. ÉPOCAS -------------------------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(d->'epocas','[]'::jsonb)) loop
    insert into epocas(equipa_id, nome, ano_inicio, valor_km, deslocacoes, id_antigo)
    values (v_eq, coalesce(r->>'nome','época'), coalesce((r->>'anoInicio')::int, 2025),
            coalesce(mig_num(r->>'valorKm'), 0.36),
            coalesce(r->'deslocacoes','[]'::jsonb), r->>'id')
    on conflict (equipa_id, id_antigo) do nothing;
  end loop;

  -- 6. TABELA DE VALORES / ALMOÇOS / ARTIGOS ------------------------------
  for r in select * from jsonb_array_elements(coalesce(d->'tabela','[]'::jsonb)) loop
    insert into tabela_valores(equipa_id, epoca_id, tipo, escalao, funcao, valor, id_antigo)
    select v_eq, e.id, r->>'tipo', r->>'escalao', r->>'funcao', coalesce(mig_num(r->>'valor'),0), r->>'id'
      from epocas e where e.equipa_id = v_eq and e.id_antigo = r->>'epocaId'
    on conflict (equipa_id, id_antigo) do nothing;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(d->'almocos','[]'::jsonb)) loop
    insert into almocos(equipa_id, epoca_id, nome, valor, id_antigo)
    select v_eq, e.id, r->>'nome', coalesce(mig_num(r->>'valor'),0), r->>'id'
      from epocas e where e.equipa_id = v_eq and e.id_antigo = r->>'epocaId'
    on conflict (equipa_id, id_antigo) do nothing;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(d->'artigos','[]'::jsonb)) loop
    insert into artigos_multa(equipa_id, num, descricao, valor, por_unidade, regra, id_antigo)
    values (v_eq, coalesce((r->>'num')::int, 0),
            coalesce(nullif(r->>'nome',''), r->>'descricao', ''),
            coalesce(mig_num(r->>'valor'),0),
            coalesce((r->>'porUnidade')::boolean, false),
            coalesce((r->>'regra')::boolean, false), r->>'id')
    on conflict (equipa_id, id_antigo) do nothing;
  end loop;

  -- 7. JOGOS e PARTICIPAÇÕES ----------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(d->'jogos','[]'::jsonb)) loop
    insert into jogos(equipa_id, epoca_id, data, hora, tipo, escalao,
                      equipa_a, equipa_b, local, estado, valor_recebido, data_pagamento,
                      num_jogo, confirmada, horas_marcadas, id_antigo)
    select v_eq, e.id,
           (r->>'data')::date, coalesce(nullif(r->>'hora',''),'15:00'),
           coalesce(r->>'tipo','Distrital'), coalesce(r->>'escalao',''),
           coalesce(r->>'equipaA',''), coalesce(r->>'equipaB',''),
           coalesce(r->>'local',''), coalesce(nullif(r->>'estado',''),'agendado'),
           mig_num(r->>'valorRecebido'),
           nullif(r->>'dataPagamento','')::date,
           coalesce(r->>'numJogo',''),
           coalesce((r->>'confirmada')::boolean,false),
           coalesce((r->>'horasMarcadas')::boolean,false),
           r->>'id'
      from epocas e where e.equipa_id = v_eq and e.id_antigo = r->>'epocaId'
    on conflict (equipa_id, id_antigo) do nothing;

    -- as participações: o `valor` e a `calcKey` vêm tal e qual do JSON.
    -- É este par que garante que a tabela de valores nunca reescreve o
    -- passado — exatamente como a app já se comporta hoje.
    insert into participacoes(equipa_id, jogo_id, membro_id, funcao, almoco_id,
                              km, override, desloc_fixa, valor, calc_key, nome_sms)
    select v_eq, j.id, m.id, coalesce(a->>'funcao','AA'), al.id,
           mig_num(a->>'km'), mig_num(a->>'override'),
           coalesce(nullif(a->>'deslocFixa',''),'') in ('1','true'),
           coalesce(mig_num(a->>'valor'), 0), coalesce(a->>'calcKey',''),
           coalesce(a->>'nomeSms','')
      from jsonb_array_elements(coalesce(r->'atribuicoes','[]'::jsonb)) a
      join jogos j            on j.equipa_id = v_eq and j.id_antigo = r->>'id'
      left join membros_equipa m on m.equipa_id = v_eq and m.id_antigo = a->>'membroId'
      left join almocos al       on al.equipa_id = v_eq and al.id_antigo = nullif(a->>'almocoId','')
    on conflict (jogo_id, membro_id) do nothing;
  end loop;

  -- 8. DESPESAS / MULTAS / PAGAMENTOS / FUNDO / DISTÂNCIAS ----------------
  for r in select * from jsonb_array_elements(coalesce(d->'despesas','[]'::jsonb)) loop
    insert into despesas(equipa_id, epoca_id, membro_id, data, categoria, tipo_lanc, descricao, valor, id_antigo)
    select v_eq, e.id, m.id, (r->>'data')::date,
           coalesce(nullif(r->>'categoria',''),'Outro'),
           case when r->>'tipoLanc' = 'receita' then 'receita' else 'despesa' end,
           coalesce(r->>'descricao',''), coalesce(mig_num(r->>'valor'),0), r->>'id'
      from epocas e
      left join membros_equipa m on m.equipa_id = v_eq and m.id_antigo = nullif(r->>'membroId','')
     where e.equipa_id = v_eq and e.id_antigo = r->>'epocaId'
    on conflict (equipa_id, id_antigo) do nothing;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(d->'multas','[]'::jsonb)) loop
    insert into multas(equipa_id, epoca_id, membro_id, artigo_id, data, descricao, valor, pago, data_pagamento, id_antigo)
    select v_eq, e.id, m.id, ar.id, (r->>'data')::date,
           coalesce(r->>'descricao',''), coalesce(mig_num(r->>'valor'),0),
           coalesce((r->>'pago')::boolean,false), nullif(r->>'dataPagamento','')::date, r->>'id'
      from epocas e
      left join membros_equipa m  on m.equipa_id = v_eq and m.id_antigo = nullif(r->>'membroId','')
      left join artigos_multa ar  on ar.equipa_id = v_eq and ar.id_antigo = nullif(r->>'artigoId','')
     where e.equipa_id = v_eq and e.id_antigo = r->>'epocaId'
    on conflict (equipa_id, id_antigo) do nothing;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(d->'pagamentos','[]'::jsonb)) loop
    insert into pagamentos(equipa_id, epoca_id, mes, valor, data, id_antigo)
    select v_eq, e.id, coalesce(r->>'mes',''), coalesce(mig_num(r->>'valor'),0),
           nullif(r->>'data','')::date, r->>'id'
      from epocas e where e.equipa_id = v_eq and e.id_antigo = r->>'epocaId'
    on conflict (equipa_id, id_antigo) do nothing;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(d->'fundo','[]'::jsonb)) loop
    insert into fundo_gastos(equipa_id, epoca_id, descricao, data, valor, id_antigo)
    select v_eq, e.id, coalesce(r->>'descricao',''), (r->>'data')::date,
           coalesce(mig_num(r->>'valor'),0), r->>'id'
      from epocas e where e.equipa_id = v_eq and e.id_antigo = r->>'epocaId'
    on conflict (equipa_id, id_antigo) do nothing;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(d->'distancias','[]'::jsonb)) loop
    insert into distancias(equipa_id, membro_id, local, km, id_antigo)
    select v_eq, m.id, coalesce(r->>'local',''), coalesce(mig_num(r->>'km'),0), r->>'id'
      from membros_equipa m
     where m.equipa_id = v_eq and m.id_antigo = r->>'membroId'
    on conflict (equipa_id, id_antigo) do nothing;
  end loop;

  -- 9. contagem para conferires -------------------------------------------
  select jsonb_build_object(
    'equipa', v_nome_eq, 'codigo_convite', v_cod,
    'membros',        (select count(*) from membros_equipa where equipa_id = v_eq),
    'por_reclamar',   (select count(*) from membros_equipa where equipa_id = v_eq and user_id is null),
    'epocas',         (select count(*) from epocas         where equipa_id = v_eq),
    'tabela_valores', (select count(*) from tabela_valores where equipa_id = v_eq),
    'almocos',        (select count(*) from almocos        where equipa_id = v_eq),
    'artigos',        (select count(*) from artigos_multa  where equipa_id = v_eq),
    'jogos',          (select count(*) from jogos          where equipa_id = v_eq),
    'participacoes',  (select count(*) from participacoes  where equipa_id = v_eq),
    'despesas',       (select count(*) from despesas       where equipa_id = v_eq),
    'multas',         (select count(*) from multas         where equipa_id = v_eq),
    'pagamentos',     (select count(*) from pagamentos     where equipa_id = v_eq),
    'fundo',          (select count(*) from fundo_gastos   where equipa_id = v_eq),
    'distancias',     (select count(*) from distancias     where equipa_id = v_eq)
  ) into cnt;

  return jsonb_pretty(cnt);
end $$;

revoke execute on function public.migrar_do_estado(text,text) from anon, authenticated;

-- ===========================================================================
-- COMO CORRER (substitui o email pelo teu)
-- ---------------------------------------------------------------------------
--   select migrar_do_estado('o-teu-email@exemplo.com');
--
-- Devolve as contagens de tudo o que copiou. Confere-as contra o que a app
-- mostra hoje ANTES de mudares alguma coisa.
-- ===========================================================================

-- ===========================================================================
-- CONFERÊNCIA — corre isto depois e compara com os ecrãs da app
-- ---------------------------------------------------------------------------
-- 1) Quantos registos vieram de cada lado:
--
--   select
--     jsonb_array_length(dados->'jogos')     as jogos_no_json,
--     (select count(*) from jogos)           as jogos_nas_tabelas,
--     jsonb_array_length(dados->'multas')    as multas_no_json,
--     (select count(*) from multas)          as multas_nas_tabelas,
--     jsonb_array_length(dados->'despesas')  as despesas_no_json,
--     (select count(*) from despesas)        as despesas_nas_tabelas
--   from estado where id = 1;
--
-- 2) O total de euros tem de bater certo ao cêntimo:
--
--   select round(sum(valor),2) as total_atribuido from participacoes;
--   -- compara com o total do separador Resumo da época
--
-- 3) Ninguém ficou sem nome nem sem lugar:
--
--   select nome, papel, (user_id is null) as por_reclamar
--     from membros_equipa order by papel, nome;
--
-- 4) Participações que perderam o membro (não deve haver nenhuma):
--
--   select count(*) from participacoes where membro_id is null;
-- ===========================================================================

-- ===========================================================================
-- DESFAZER — apaga tudo o que a migração criou, sem tocar em `estado`
-- ---------------------------------------------------------------------------
-- A linha `estado` fica intacta, por isso a app antiga volta a funcionar
-- exatamente como antes. Corre isto e estás no ponto de partida:
--
--   delete from equipas where id_antigo = 'estado:1';
--   -- o "on delete cascade" leva atrás épocas, jogos, participações,
--   -- despesas, multas, pagamentos, fundo, distâncias e membros.
--
-- Para apagar também o esquema todo (voltar mesmo ao zero):
--
--   drop function if exists migrar_do_estado(text,text);
--   drop function if exists mig_num(text);
--   drop function if exists entrar_com_codigo(text,text);
--   drop function if exists criar_equipa(text,text);
--   drop function if exists rodar_codigo(uuid);
--   drop function if exists gera_codigo();
--   drop function if exists e_responsavel(uuid);
--   drop function if exists e_membro(uuid);
--   drop function if exists carimba();
--   drop table if exists distancias, fundo_gastos, pagamentos, multas,
--     despesas, participacoes, jogos, artigos_multa, almocos,
--     tabela_valores, epocas, membros_equipa, equipas cascade;
--   drop trigger if exists tg_cria_perfil on auth.users;
--   drop function if exists cria_perfil();
--   drop table if exists perfis cascade;
--   -- `estado`, `estado_historico` e `equipa_admin` continuam onde estavam.
-- ===========================================================================
