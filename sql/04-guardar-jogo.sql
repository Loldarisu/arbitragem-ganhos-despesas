-- ===========================================================================
-- Elite Referees AFA — FICHEIRO 4: gravar um jogo de uma só vez
-- ---------------------------------------------------------------------------
-- Corre no SQL Editor DEPOIS do ficheiro 1. Pode ser corrido mais do que uma
-- vez sem estragar nada (é idempotente) e não mexe em dados nenhuns.
--
-- O problema que resolve: a app gravava um jogo em três pedidos seguidos —
-- o jogo, depois apagar as participações que saíram, depois gravar as que
-- ficam. Se a rede caísse entre o segundo e o terceiro, o jogo ficava na base
-- de dados SEM ninguém nomeado, e os valores desapareciam dos totais e dos
-- pagamentos sem aviso nenhum.
--
-- Aqui os três passos correm dentro de uma função, e uma função do PostgreSQL
-- é uma transação: ou fica tudo gravado, ou não fica nada.
--
-- `security invoker`: a função corre com as permissões de quem a chama. As
-- políticas RLS do ficheiro 1 continuam a decidir tudo — um assistente que a
-- chame é recusado exatamente como seria com escritas diretas.
--
-- Enquanto este ficheiro não for corrido, a app continua a funcionar: deteta
-- que a função não existe e usa o caminho antigo de três pedidos.
-- ===========================================================================

create or replace function public.guardar_jogo(p_jogo jsonb, p_participacoes jsonb default '[]'::jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_id  uuid := (p_jogo->>'id')::uuid;
  v_eq  uuid := (p_jogo->>'equipa_id')::uuid;
  v_ids uuid[];
begin
  if v_id is null or v_eq is null then
    raise exception 'Jogo sem id ou sem equipa.' using errcode = '22023';
  end if;
  if not e_responsavel(v_eq) then
    raise exception 'Só o responsável da equipa pode alterar isto.' using errcode = '42501';
  end if;

  -- 1. O jogo. A equipa nunca muda num update: um jogo não salta de equipa.
  insert into jogos as j (id, equipa_id, epoca_id, data, hora, tipo, escalao, equipa_a, equipa_b,
                          local, estado, valor_recebido, data_pagamento, num_jogo, confirmada, horas_marcadas)
  select r.id, v_eq, r.epoca_id, r.data, coalesce(r.hora,'15:00'), coalesce(r.tipo,'Distrital'),
         coalesce(r.escalao,''), coalesce(r.equipa_a,''), coalesce(r.equipa_b,''), coalesce(r.local,''),
         coalesce(r.estado,'agendado'), r.valor_recebido, r.data_pagamento, coalesce(r.num_jogo,''),
         coalesce(r.confirmada,false), coalesce(r.horas_marcadas,false)
    from jsonb_populate_record(null::jogos, p_jogo) r
  on conflict (id) do update set
    epoca_id = excluded.epoca_id, data = excluded.data, hora = excluded.hora, tipo = excluded.tipo,
    escalao = excluded.escalao, equipa_a = excluded.equipa_a, equipa_b = excluded.equipa_b,
    local = excluded.local, estado = excluded.estado, valor_recebido = excluded.valor_recebido,
    data_pagamento = excluded.data_pagamento, num_jogo = excluded.num_jogo,
    confirmada = excluded.confirmada, horas_marcadas = excluded.horas_marcadas;

  -- 2. Fora as participações de quem saiu da nomeação.
  select coalesce(array_agg((x->>'id')::uuid), '{}')
    into v_ids
    from jsonb_array_elements(coalesce(p_participacoes,'[]'::jsonb)) x
   where x->>'id' is not null;

  delete from participacoes p
   where p.jogo_id = v_id and not (p.id = any(v_ids));

  -- 3. As que ficam. O jogo e a equipa vêm do jogo, não do que o cliente diz.
  insert into participacoes as p (id, equipa_id, jogo_id, membro_id, funcao, almoco_id, km,
                                  override, desloc_fixa, valor, calc_key, nome_sms)
  select coalesce(r.id, gen_random_uuid()), v_eq, v_id, r.membro_id, r.funcao, r.almoco_id, r.km,
         r.override, coalesce(r.desloc_fixa,false), coalesce(r.valor,0),
         coalesce(r.calc_key,''), coalesce(r.nome_sms,'')
    from jsonb_populate_recordset(null::participacoes, coalesce(p_participacoes,'[]'::jsonb)) r
  on conflict (id) do update set
    membro_id = excluded.membro_id, funcao = excluded.funcao, almoco_id = excluded.almoco_id,
    km = excluded.km, override = excluded.override, desloc_fixa = excluded.desloc_fixa,
    valor = excluded.valor, calc_key = excluded.calc_key, nome_sms = excluded.nome_sms;
end $$;

revoke execute on function public.guardar_jogo(jsonb, jsonb) from public, anon;
grant  execute on function public.guardar_jogo(jsonb, jsonb) to authenticated;

-- Para confirmar que ficou criada:
--   select proname from pg_proc where proname = 'guardar_jogo';
