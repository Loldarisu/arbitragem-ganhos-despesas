-- ===========================================================================
-- Elite Referees AFA — FICHEIRO 5: lixo, aprovação de membros e convites
-- ---------------------------------------------------------------------------
-- Corre no SQL Editor DEPOIS dos ficheiros 1 e 4. Pode ser corrido mais do
-- que uma vez sem estragar nada (é idempotente). Não apaga dados.
--
-- Três coisas, cada uma a fechar um buraco que a auditoria encontrou:
--
--   1. LIXO — o que se apagava desaparecia para sempre (só havia 9 segundos
--      para "Anular"). Agora cada registo apagado fica 30 dias no `lixo` e
--      pode ser reposto em Definições.
--
--   2. APROVAÇÃO — bastava ter o código de convite e escrever o nome de um
--      colega ("Bruno") para ficar com o lugar dele: o histórico, as
--      participações e os pagamentos. Agora quem entra com código fica
--      PENDENTE até o responsável aprovar, e quem quer ocupar um lugar que já
--      existe só o recebe depois dessa aprovação.
--
--   3. CONVITES — o código não expirava e podia ser tentado sem limite. Agora
--      vale 30 dias (renova-se ao rodar) e cada conta tem 10 tentativas
--      falhadas por hora.
--
-- A app nova funciona antes e depois de correres isto; só ganha estas
-- proteções depois.
-- ===========================================================================


-- ===========================================================================
-- 1. LIXO
-- ---------------------------------------------------------------------------
-- Um gatilho em cada tabela copia a linha apagada para aqui, inteira, em
-- JSON. Repor é voltar a inserir essa linha. Os jogos levam consigo as
-- participações que foram apagadas no mesmo momento (em cascata), por isso
-- repor um jogo devolve também quem estava nomeado.
--
-- As épocas ficam de fora de propósito: apagar uma época leva dezenas de
-- registos em cascata e repô-la bem é outra conversa.
-- ===========================================================================
create table if not exists lixo (
  id          uuid primary key default gen_random_uuid(),
  equipa_id   uuid not null references equipas(id) on delete cascade,
  tabela      text not null,
  registo     jsonb not null,
  grupo       uuid,                       -- o jogo a que a linha pertence
  apagado_em  timestamptz not null default now(),
  apagado_por uuid references auth.users(id) on delete set null
);
create index if not exists ix_lixo_equipa on lixo(equipa_id, apagado_em desc);
create index if not exists ix_lixo_grupo  on lixo(grupo);

alter table lixo enable row level security;
alter table lixo force  row level security;

-- Ler: o responsável vê o lixo da equipa; as despesas são de cada um, também
-- no lixo. Escrever: ninguém diretamente — só os gatilhos e repor_do_lixo().
drop policy if exists "quem ve o lixo" on lixo;
create policy "quem ve o lixo" on lixo
  for select to authenticated using (
    (tabela <> 'despesas' and e_responsavel(equipa_id))
    or (tabela = 'despesas' and registo->>'membro_id' = meu_membro_id(equipa_id)::text)
  );

create or replace function public.vai_para_lixo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A equipa inteira a ser apagada: não há onde guardar, nem a quem repor.
  if not exists (select 1 from equipas e where e.id = old.equipa_id) then
    return old;
  end if;
  insert into lixo(equipa_id, tabela, registo, grupo, apagado_por)
  values (old.equipa_id, tg_table_name, to_jsonb(old),
          case tg_table_name when 'jogos' then (to_jsonb(old)->>'id')::uuid
                             when 'participacoes' then (to_jsonb(old)->>'jogo_id')::uuid end,
          auth.uid());
  -- Arrumação: o que tem mais de 30 dias sai de vez.
  delete from lixo where apagado_em < now() - interval '30 days';
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['jogos','participacoes','despesas','multas','pagamentos',
                           'fundo_gastos','distancias','almocos','tabela_valores','artigos_multa'] loop
    execute format('drop trigger if exists tg_lixo on %I', t);
    execute format('create trigger tg_lixo after delete on %I for each row execute function public.vai_para_lixo()', t);
  end loop;
end $$;

-- Repor um registo. Corre por cima da RLS (para poder tirar a linha do lixo),
-- por isso verifica à mão exatamente o que as políticas verificariam.
create or replace function public.repor_do_lixo(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v lixo%rowtype; p lixo%rowtype;
begin
  select * into v from lixo where id = p_id;
  if v.id is null then
    raise exception 'Esse registo já não está no lixo.' using errcode = '22023';
  end if;
  if v.tabela = 'participacoes' then
    raise exception 'As participações repõem-se com o jogo.' using errcode = '22023';
  end if;
  if v.tabela = 'despesas' then
    if v.registo->>'membro_id' is distinct from meu_membro_id(v.equipa_id)::text then
      raise exception 'Só podes repor as tuas próprias despesas.' using errcode = '42501';
    end if;
  elsif not e_responsavel(v.equipa_id) then
    raise exception 'Só o responsável da equipa pode repor isto.' using errcode = '42501';
  end if;
  if v.tabela not in ('jogos','despesas','multas','pagamentos','fundo_gastos',
                      'distancias','almocos','tabela_valores','artigos_multa') then
    raise exception 'Não sei repor registos de %.', v.tabela using errcode = '22023';
  end if;

  begin
    execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', v.tabela, v.tabela)
      using v.registo;
    -- Um jogo traz de volta quem estava nomeado quando foi apagado.
    if v.tabela = 'jogos' then
      for p in select * from lixo
                where tabela = 'participacoes' and grupo = v.grupo and apagado_em = v.apagado_em loop
        insert into participacoes select * from jsonb_populate_record(null::participacoes, p.registo)
          on conflict do nothing;
        delete from lixo where id = p.id;
      end loop;
    end if;
  exception
    when unique_violation then
      raise exception 'Já existe um registo igual — não foi preciso repor.' using errcode = '23505';
    when foreign_key_violation then
      raise exception 'Não dá para repor: a época, o membro ou o almoço a que pertencia já foi apagado.' using errcode = '23503';
  end;

  delete from lixo where id = v.id;
  return v.tabela;
end $$;

revoke execute on function public.repor_do_lixo(uuid) from public, anon;
grant  execute on function public.repor_do_lixo(uuid) to authenticated;
revoke execute on function public.vai_para_lixo()      from public, anon, authenticated;


-- ===========================================================================
-- 2. APROVAÇÃO DE MEMBROS
-- ---------------------------------------------------------------------------
-- `aprovado` — quem entra com código começa a false. Enquanto for false, as
--              três funções de segurança tratam-no como não-membro: não lê
--              nada da equipa.
-- `reclama_id` — se a pessoa disse um nome que corresponde a um lugar por
--              reclamar, fica aqui qual. Só passa a ser dela quando o
--              responsável aprovar.
-- Quem já está na equipa fica aprovado (o valor por omissão é true).
-- ===========================================================================
alter table membros_equipa add column if not exists aprovado boolean not null default true;
alter table membros_equipa add column if not exists reclama_id uuid references membros_equipa(id) on delete set null;

create or replace function public.e_membro(p_equipa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membros_equipa
     where equipa_id = p_equipa and user_id = auth.uid() and ativo and aprovado
  );
$$;

create or replace function public.e_responsavel(p_equipa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membros_equipa
     where equipa_id = p_equipa and user_id = auth.uid() and ativo and aprovado
       and papel = 'responsavel'
  );
$$;

create or replace function public.meu_membro_id(p_equipa uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from membros_equipa
   where equipa_id = p_equipa and user_id = auth.uid() and ativo and aprovado
   limit 1;
$$;

-- Quem está à espera tem de conseguir ler a SUA linha, para a app lhe dizer
-- "o teu pedido está à espera" em vez de "não pertences a nenhuma equipa".
drop policy if exists "vejo o meu pedido" on membros_equipa;
create policy "vejo o meu pedido" on membros_equipa
  for select to authenticated using (user_id = auth.uid());

create or replace function public.aprovar_membro(p_membro uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v membros_equipa%rowtype; v_user uuid;
begin
  select * into v from membros_equipa where id = p_membro;
  if v.id is null then raise exception 'Esse pedido já não existe.' using errcode = '22023'; end if;
  if not e_responsavel(v.equipa_id) then
    raise exception 'Só o responsável pode aprovar membros.' using errcode = '42501';
  end if;

  if v.reclama_id is not null and exists (select 1 from membros_equipa s
       where s.id = v.reclama_id and s.equipa_id = v.equipa_id and s.user_id is null) then
    -- O lugar antigo passa a ser desta conta, com o histórico todo. A linha do
    -- pedido sai primeiro: (equipa, user) é único.
    v_user := v.user_id;
    delete from membros_equipa where id = v.id;
    update membros_equipa set user_id = v_user, nome = v.nome, aprovado = true, ativo = true
     where id = v.reclama_id;
  else
    update membros_equipa set aprovado = true, reclama_id = null where id = v.id;
  end if;
end $$;

create or replace function public.recusar_membro(p_membro uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v membros_equipa%rowtype;
begin
  select * into v from membros_equipa where id = p_membro;
  if v.id is null then return; end if;
  if not e_responsavel(v.equipa_id) then
    raise exception 'Só o responsável pode recusar membros.' using errcode = '42501';
  end if;
  if v.aprovado then
    raise exception 'Esse membro já foi aprovado; tira-o da equipa em vez disso.' using errcode = '22023';
  end if;
  delete from membros_equipa where id = v.id;
end $$;

revoke execute on function public.aprovar_membro(uuid) from public, anon;
revoke execute on function public.recusar_membro(uuid) from public, anon;
grant  execute on function public.aprovar_membro(uuid) to authenticated;
grant  execute on function public.recusar_membro(uuid) to authenticated;


-- ===========================================================================
-- 3. CONVITES: prazo e limite de tentativas
-- ===========================================================================
alter table equipas add column if not exists codigo_expira_em timestamptz
  not null default (now() + interval '30 days');

create table if not exists tentativas_codigo (
  user_id uuid not null,
  em      timestamptz not null default now()
);
create index if not exists ix_tentativas on tentativas_codigo(user_id, em);
alter table tentativas_codigo enable row level security;
alter table tentativas_codigo force  row level security;
-- sem políticas: só entrar_com_codigo() (security definer) lá escreve

create or replace function public.rodar_codigo(p_equipa uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_cod text;
begin
  if not e_responsavel(p_equipa) then
    raise exception 'Só o responsável pode mudar o código.' using errcode = '42501';
  end if;
  loop
    v_cod := gera_codigo();
    exit when not exists (select 1 from equipas e where e.codigo_convite = v_cod);
  end loop;
  update equipas e set codigo_convite = v_cod, codigo_expira_em = now() + interval '30 days'
   where e.id = p_equipa;
  return v_cod;
end $$;

-- Mesma assinatura do ficheiro 1, comportamento novo:
--   * código errado ou expirado -> devolve ZERO linhas em vez de um erro. Um
--     erro desfazia também o registo da tentativa, e o limite nunca contava.
--     Errado e expirado dão a mesma resposta: não se diz a quem está a
--     adivinhar que acertou num código antigo.
--   * papel 'pendente' -> entrou, mas espera pela aprovação do responsável.
create or replace function public.entrar_com_codigo(p_codigo text, p_meu_nome text default null)
returns table (equipa_id uuid, equipa_nome text, papel text)
language plpgsql security definer set search_path = public as $$
declare v_eq uuid; v_nome text; v_mem uuid; v_papel text; v_aprov boolean; v_meu text; v_lugar uuid;
begin
  if auth.uid() is null then
    raise exception 'Precisas de iniciar sessão.' using errcode = '28000';
  end if;

  if (select count(*) from tentativas_codigo t
       where t.user_id = auth.uid() and t.em > now() - interval '1 hour') >= 10 then
    raise exception 'Demasiadas tentativas com códigos errados. Tenta daqui a uma hora.' using errcode = '54000';
  end if;

  select e.id, e.nome into v_eq, v_nome
    from equipas e
   where upper(e.codigo_convite) = upper(trim(coalesce(p_codigo,'')))
     and e.codigo_expira_em > now();

  if v_eq is null then
    insert into tentativas_codigo(user_id) values (auth.uid());
    delete from tentativas_codigo t where t.em < now() - interval '1 day';
    return;
  end if;

  -- já lá dentro? não faz nada, devolve o que há
  select m.id, m.papel, m.aprovado into v_mem, v_papel, v_aprov
    from membros_equipa m where m.equipa_id = v_eq and m.user_id = auth.uid();
  if v_mem is not null then
    update membros_equipa m set ativo = true where m.id = v_mem;
    return query select v_eq, v_nome, case when v_aprov then v_papel else 'pendente' end;
    return;
  end if;

  v_meu := nullif(trim(coalesce(p_meu_nome,'')),'');

  -- Um lugar por reclamar com este nome? Fica anotado no pedido; só passa a
  -- ser desta conta quando o responsável aprovar.
  if v_meu is not null then
    select x.id into v_lugar from membros_equipa x
     where x.equipa_id = v_eq and x.user_id is null
       and (lower(x.nome) = lower(v_meu) or lower(x.alias) = lower(v_meu))
     order by x.criado_em limit 1;
  end if;

  insert into membros_equipa as m (equipa_id, user_id, nome, papel, aprovado, reclama_id)
  values (v_eq, auth.uid(),
          coalesce(v_meu, nullif((select p.nome from perfis p where p.id = auth.uid()),''), 'Assistente'),
          'assistente', false, v_lugar);

  return query select v_eq, v_nome, 'pendente'::text;
end $$;

revoke execute on function public.entrar_com_codigo(text,text) from anon;
revoke execute on function public.rodar_codigo(uuid)           from anon;

-- Para confirmar que ficou tudo criado:
--   select proname from pg_proc
--    where proname in ('repor_do_lixo','aprovar_membro','recusar_membro','vai_para_lixo');
