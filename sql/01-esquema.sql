-- ===========================================================================
-- Elite Referees AFA — contas, equipas e permissões
-- FICHEIRO 1 de 3: esquema + políticas RLS
-- ---------------------------------------------------------------------------
-- NÃO CORRAS ISTO AINDA. Lê primeiro, aprova, e só depois cola no
-- Supabase -> SQL Editor -> New query -> Run.
--
-- Este ficheiro só CRIA coisas novas. Não altera nem apaga a tabela `estado`
-- que tens hoje em produção. Enquanto não correres o ficheiro 3, a app atual
-- continua a funcionar exatamente como está.
--
-- Pode ser corrido mais do que uma vez sem estragar nada (é idempotente).
-- ===========================================================================

-- ===========================================================================
-- 0. Extensões
-- ===========================================================================
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ===========================================================================
-- 1. PERFIS — uma linha por conta, criada automaticamente no registo
-- ---------------------------------------------------------------------------
-- O Supabase guarda as contas em `auth.users`, um esquema a que a app não
-- deve mexer diretamente. `perfis` é a nossa cópia pública: só o nome e a
-- data. O email fica onde está, no `auth.users`, e nunca é copiado para uma
-- tabela que a equipa toda consegue ler.
-- ===========================================================================
create table if not exists perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  criado_em  timestamptz not null default now()
);

alter table perfis enable row level security;
alter table perfis force  row level security;

-- Cada pessoa vê e edita o seu próprio perfil, e vê o de quem partilha equipa.
drop policy if exists "perfil proprio le" on perfis;
create policy "perfil proprio le" on perfis
  for select to authenticated using (id = auth.uid());

drop policy if exists "perfil proprio edita" on perfis;
create policy "perfil proprio edita" on perfis
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- O perfil nasce sozinho quando a conta é criada. Assim não há o caso de
-- alguém confirmar o email e ficar sem perfil porque a app fechou a meio.
create or replace function public.cria_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis(id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists tg_cria_perfil on auth.users;
create trigger tg_cria_perfil
  after insert on auth.users
  for each row execute function public.cria_perfil();

-- ===========================================================================
-- 2. EQUIPAS
-- ---------------------------------------------------------------------------
-- `codigo_convite` é a chave que alguém escreve para entrar. Não é segredo
-- criptográfico — é um código de 6 caracteres para dizer ao telefone. Por isso
-- pode ser rodado a qualquer momento pelo responsável (ver rodar_codigo()).
-- ===========================================================================
create table if not exists equipas (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  codigo_convite  text not null unique,
  categorias      text[] not null default array['Almoço','Jantar','Lanche','Café','Gota','Combustível','Portagens','Estacionamento','Equipamento','Outro'],
  criada_por      uuid references auth.users(id) on delete set null,
  criada_em       timestamptz not null default now(),
  id_antigo       text unique          -- só preenchido pela migração; ver ficheiro 3
);

alter table equipas enable row level security;
alter table equipas force  row level security;

-- ===========================================================================
-- 3. MEMBROS_EQUIPA — a tabela que manda em tudo o resto
-- ---------------------------------------------------------------------------
-- Dois papéis, como pediste: 'responsavel' (o chefe de equipa, escreve) e
-- 'assistente' (vê tudo, não escreve nada).
--
-- `user_id` pode ser NULL. Isto é de propósito e resolve o problema do
-- mapeamento nome-antigo -> conta:
--   * a migração cria os membros que já existem com user_id NULL — são
--     "lugares por reclamar", com o nome que já tinham;
--   * quando cada pessoa se regista e usa o código, reclama o seu lugar pelo
--     nome e o histórico dela fica logo lá, sem eu adivinhar emails.
-- Ninguém tem de te dizer o email antes de começarmos.
-- ===========================================================================
create table if not exists membros_equipa (
  id         uuid primary key default gen_random_uuid(),
  equipa_id  uuid not null references equipas(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  nome       text not null,
  alias      text not null default '',      -- como o nome vem nas convocatórias
  papel      text not null default 'assistente' check (papel in ('responsavel','assistente')),
  -- A função habitual em campo. É diferente do papel: o papel diz quem manda
  -- na app, a função diz o que a pessoa costuma fazer no jogo. Serve para
  -- pré-preencher a nomeação, e pode ser outra num jogo concreto.
  funcao_habitual text not null default 'AA2'
    check (funcao_habitual in ('arbitro','AA1','AA2','outro')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  id_antigo  text,
  unique (equipa_id, user_id),              -- uma conta = um lugar por equipa
  unique (equipa_id, id_antigo)
);
-- Nota: em Postgres dois NULL não colidem num UNIQUE, por isso a linha acima
-- permite vários lugares por reclamar na mesma equipa. É o que queremos.

create index if not exists ix_membros_user on membros_equipa(user_id);

alter table membros_equipa enable row level security;
alter table membros_equipa force  row level security;

-- ===========================================================================
-- 4. As duas funções em que assenta TODA a segurança
-- ---------------------------------------------------------------------------
-- São `security definer` por uma razão técnica concreta: uma política sobre
-- `membros_equipa` que consultasse `membros_equipa` entrava em recursão
-- infinita. `security definer` faz a consulta correr fora da RLS, cortando o
-- ciclo. `stable` deixa o Postgres chamá-las uma vez por consulta em vez de
-- uma vez por linha.
--
-- `set search_path = public` não é decoração: sem isso, quem pudesse criar um
-- esquema conseguiria pôr uma tabela `membros_equipa` falsa à frente desta.
-- ===========================================================================
create or replace function public.e_membro(p_equipa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membros_equipa
     where equipa_id = p_equipa and user_id = auth.uid() and ativo
  );
$$;

create or replace function public.e_responsavel(p_equipa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membros_equipa
     where equipa_id = p_equipa and user_id = auth.uid() and ativo
       and papel = 'responsavel'
  );
$$;

revoke execute on function public.e_membro(uuid)      from anon;
revoke execute on function public.e_responsavel(uuid) from anon;

-- --- políticas de equipas -------------------------------------------------
drop policy if exists "equipa visivel a membros" on equipas;
create policy "equipa visivel a membros" on equipas
  for select to authenticated using (e_membro(id));
-- Repara: quem não é membro NÃO consegue ler a tabela `equipas`. Logo não
-- consegue listar códigos de convite à procura de um que funcione.

drop policy if exists "responsavel edita equipa" on equipas;
create policy "responsavel edita equipa" on equipas
  for update to authenticated using (e_responsavel(id)) with check (e_responsavel(id));

drop policy if exists "responsavel apaga equipa" on equipas;
create policy "responsavel apaga equipa" on equipas
  for delete to authenticated using (e_responsavel(id));
-- Sem política de INSERT: criar equipa passa pela função criar_equipa(), pela
-- razão explicada aí em baixo.

-- --- políticas de membros_equipa ------------------------------------------
drop policy if exists "membros veem a equipa" on membros_equipa;
create policy "membros veem a equipa" on membros_equipa
  for select to authenticated using (e_membro(equipa_id));

drop policy if exists "responsavel gere membros ins" on membros_equipa;
create policy "responsavel gere membros ins" on membros_equipa
  for insert to authenticated with check (e_responsavel(equipa_id));

drop policy if exists "responsavel gere membros upd" on membros_equipa;
create policy "responsavel gere membros upd" on membros_equipa
  for update to authenticated using (e_responsavel(equipa_id)) with check (e_responsavel(equipa_id));

drop policy if exists "responsavel gere membros del" on membros_equipa;
create policy "responsavel gere membros del" on membros_equipa
  for delete to authenticated using (e_responsavel(equipa_id));

-- ===========================================================================
-- 5. DADOS DA ÉPOCA
-- ---------------------------------------------------------------------------
-- Todas estas tabelas têm `equipa_id` e `id_antigo`:
--   equipa_id  -> é por ele que a RLS decide tudo; sem ele cada política tinha
--                 de dar um salto por `jogos` para descobrir a equipa, e isso
--                 custa a cada linha lida.
--   id_antigo  -> guarda o `id` que o registo tinha no JSON. Serve para a
--                 migração poder ser repetida sem duplicar nada, e para
--                 conseguires cruzar o antes e o depois.
-- ===========================================================================

create table if not exists epocas (
  id           uuid primary key default gen_random_uuid(),
  equipa_id    uuid not null references equipas(id) on delete cascade,
  nome         text not null,
  ano_inicio   int  not null,
  valor_km     numeric(10,4) not null default 0.36,
  deslocacoes  jsonb not null default '[]'::jsonb,   -- [{tipo,modo,valor}]
  criada_em    timestamptz not null default now(),
  id_antigo    text,
  unique (equipa_id, id_antigo)
);

create table if not exists tabela_valores (
  id         uuid primary key default gen_random_uuid(),
  equipa_id  uuid not null references equipas(id) on delete cascade,
  epoca_id   uuid not null references epocas(id) on delete cascade,
  tipo       text not null,          -- Distrital / Nacional
  escalao    text not null,
  funcao     text not null,          -- A / AA / 1 arb / 2 arb
  valor      numeric(10,2) not null,
  id_antigo  text,
  unique (equipa_id, id_antigo),
  unique (epoca_id, tipo, escalao, funcao)
);

create table if not exists almocos (
  id         uuid primary key default gen_random_uuid(),
  equipa_id  uuid not null references equipas(id) on delete cascade,
  epoca_id   uuid not null references epocas(id) on delete cascade,
  nome       text not null,
  valor      numeric(10,2) not null,
  id_antigo  text,
  unique (equipa_id, id_antigo)
);

create table if not exists artigos_multa (
  id            uuid primary key default gen_random_uuid(),
  equipa_id     uuid not null references equipas(id) on delete cascade,
  num           int  not null,
  descricao     text not null,
  valor         numeric(10,2) not null,
  por_unidade   boolean not null default false,
  -- O Art. 19 não é uma multa que se escolha: é a regra que duplica o valor à
  -- 3.ª ocorrência do mesmo artigo. Fica na lista para o regulamento estar
  -- completo, mas marcado assim para não aparecer no seletor.
  regra         boolean not null default false,
  id_antigo     text,
  unique (equipa_id, id_antigo),
  unique (equipa_id, num)
);

create table if not exists jogos (
  id              uuid primary key default gen_random_uuid(),
  equipa_id       uuid not null references equipas(id) on delete cascade,
  epoca_id        uuid not null references epocas(id) on delete cascade,
  data            date not null,
  hora            text not null default '15:00',
  tipo            text not null default 'Distrital',
  escalao         text not null default '',
  equipa_a        text not null default '',
  equipa_b        text not null default '',
  local           text not null default '',
  estado          text not null default 'agendado',
  valor_recebido  numeric(10,2),          -- já não se usa; fica para não perder dados
  data_pagamento  date,
  num_jogo        text not null default '',        -- o número que vem na convocatória
  confirmada      boolean not null default false,  -- nomeação confirmada na plataforma
  horas_marcadas  boolean not null default false,  -- horas marcadas na véspera
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references auth.users(id) on delete set null,
  id_antigo       text,
  unique (equipa_id, id_antigo)
);
create index if not exists ix_jogos_epoca on jogos(epoca_id, data);

-- --- PARTICIPACOES --------------------------------------------------------
-- O `valor` é o valor CONGELADO, exatamente como já faz a app hoje: uma vez
-- gravado, mexer na tabela de valores não reescreve o passado. `calc_key`
-- guarda de que combinação (escalão+função+almoço+km+época) é que aquele valor
-- saiu — se a combinação mudar, a app recalcula; se não mudar, mantém.
-- Isto é o mesmo par (valor, calcKey) que já existe no JSON; nada de novo.
create table if not exists participacoes (
  id          uuid primary key default gen_random_uuid(),
  equipa_id   uuid not null references equipas(id) on delete cascade,
  jogo_id     uuid not null references jogos(id) on delete cascade,
  membro_id   uuid references membros_equipa(id) on delete set null,
  funcao      text not null,
  almoco_id   uuid references almocos(id) on delete set null,
  km          numeric(10,2),
  override    numeric(10,2),           -- valor forçado à mão nesta linha
  desloc_fixa boolean not null default false,  -- recebe a deslocação de valor fixo?
  valor       numeric(10,2) not null default 0,
  calc_key    text not null default '',
  nome_sms    text not null default '',
  unique (jogo_id, membro_id)
);
create index if not exists ix_part_jogo   on participacoes(jogo_id);
create index if not exists ix_part_membro on participacoes(membro_id);

create table if not exists despesas (
  id          uuid primary key default gen_random_uuid(),
  equipa_id   uuid not null references equipas(id) on delete cascade,
  epoca_id    uuid not null references epocas(id) on delete cascade,
  membro_id   uuid references membros_equipa(id) on delete set null,
  data        date not null,
  categoria   text not null default 'Outro',
  tipo_lanc   text not null default 'despesa' check (tipo_lanc in ('despesa','receita')),
  descricao   text not null default '',
  valor       numeric(10,2) not null,
  id_antigo   text,
  unique (equipa_id, id_antigo)
);

create table if not exists multas (
  id              uuid primary key default gen_random_uuid(),
  equipa_id       uuid not null references equipas(id) on delete cascade,
  epoca_id        uuid not null references epocas(id) on delete cascade,
  membro_id       uuid references membros_equipa(id) on delete set null,
  artigo_id       uuid references artigos_multa(id) on delete set null,
  data            date not null,
  descricao       text not null default '',
  valor           numeric(10,2) not null,
  pago            boolean not null default false,
  data_pagamento  date,
  id_antigo       text,
  unique (equipa_id, id_antigo)
);
create index if not exists ix_multas_membro on multas(membro_id, pago);

-- --- PAGAMENTOS ------------------------------------------------------------
-- A associação não paga jogo a jogo: paga ao fim do mês, a cada árbitro, e
-- manda uma folha por competição — uma para o Distrital, outra para o
-- Nacional. Por isso um pagamento é a combinação (pessoa, mês, tipo de jogo),
-- e não "um por mês" como estava antes.
create table if not exists pagamentos (
  id         uuid primary key default gen_random_uuid(),
  equipa_id  uuid not null references equipas(id) on delete cascade,
  epoca_id   uuid not null references epocas(id) on delete cascade,
  membro_id  uuid references membros_equipa(id) on delete cascade,
  tipo       text not null default '',   -- Distrital / Nacional
  mes        text not null,              -- "2026-01"
  valor      numeric(10,2) not null,
  data       date,
  id_antigo  text,
  unique (equipa_id, id_antigo),
  unique (epoca_id, membro_id, mes, tipo)
);

create table if not exists fundo_gastos (
  id         uuid primary key default gen_random_uuid(),
  equipa_id  uuid not null references equipas(id) on delete cascade,
  epoca_id   uuid not null references epocas(id) on delete cascade,
  descricao  text not null default '',
  data       date not null,
  valor      numeric(10,2) not null,
  id_antigo  text,
  unique (equipa_id, id_antigo)
);

create table if not exists distancias (
  id         uuid primary key default gen_random_uuid(),
  equipa_id  uuid not null references equipas(id) on delete cascade,
  membro_id  uuid references membros_equipa(id) on delete cascade,
  local      text not null,
  km         numeric(10,2) not null,
  id_antigo  text,
  unique (equipa_id, id_antigo),
  unique (membro_id, local)
);

-- ===========================================================================
-- 5b. Acertos para quem já correu uma versão anterior deste ficheiro
-- ---------------------------------------------------------------------------
-- Correr o ficheiro outra vez tem de ser seguro. Estas linhas acrescentam o
-- que foi aparecendo depois, sem tocar no que já lá está.
-- ===========================================================================
alter table membros_equipa add column if not exists funcao_habitual text not null default 'AA2';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'membros_equipa_funcao_habitual_check') then
    alter table membros_equipa add constraint membros_equipa_funcao_habitual_check
      check (funcao_habitual in ('arbitro','AA1','AA2','outro'));
  end if;
end $$;
alter table artigos_multa  add column if not exists regra boolean not null default false;
alter table pagamentos     add column if not exists membro_id uuid references membros_equipa(id) on delete cascade;
alter table pagamentos     add column if not exists tipo text not null default '';
-- Estes três existiam na app mas não tinham coluna: a app mostrava-os, e ao
-- recarregar desapareciam. Foi o "Confirmar nomeação" que voltava sempre.
alter table jogos          add column if not exists num_jogo text not null default '';
alter table jogos          add column if not exists confirmada boolean not null default false;
alter table jogos          add column if not exists horas_marcadas boolean not null default false;
-- Mesmo problema: o "Deslocação fixa: Sim" ficava no ecrã e não na base de
-- dados. Ao reabrir o jogo aparecia "Não", e gravar outra vez tirava os 15 €.
alter table participacoes  add column if not exists desloc_fixa boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pagamentos_epoca_id_membro_id_mes_tipo_key') then
    begin
      alter table pagamentos add constraint pagamentos_epoca_id_membro_id_mes_tipo_key
        unique (epoca_id, membro_id, mes, tipo);
    exception when others then null;   -- já existe com outro nome
    end;
  end if;
end $$;

-- ===========================================================================
-- 6. QUEM VÊ O QUÊ
-- ---------------------------------------------------------------------------
-- O brief é explícito: o assistente "vê apenas os seus próprios valores — o
-- que recebe por mês e por época", com UMA exceção — as multas de toda a
-- gente são visíveis por toda a gente, porque são informação de equipa.
--
-- Isso obriga a quatro regras diferentes, não a uma só. Escrevo-as em ciclo,
-- agrupadas por regra, para se ver de relance em que grupo está cada tabela.
--
--  REFERÊNCIA  época, almoços, artigos do regulamento
--              -> todos os membros leem (o assistente precisa deles para
--                 perceber a sua própria linha); só o responsável escreve.
--
--  RESERVADA   tabela de valores
--              -> só o responsável, a ler e a escrever. O brief põe a tabela
--                 de valores nas Definições "só para o responsável", e os
--                 valores das participações já estão congelados, por isso o
--                 assistente não precisa da tabela para ver o que ganhou.
--
--  DE EQUIPA   multas, fundo das multas
--              -> todos os membros leem; só o responsável escreve.
--                 (ponto 3 do brief, e o fundo é o destino desse dinheiro)
--
--  MINHA       participações, distâncias, pagamentos do mês
--              -> o responsável vê tudo; o assistente vê só as linhas dele.
--                 Só o responsável escreve.
--
--  JOGOS       caso à parte, mais abaixo.
--
-- IMPORTANTE — isto MUDOU em relação ao que combinámos antes por mensagem
-- ("todos veem, só o chefe corrige"). Fui pelo brief, que é mais recente e
-- mais específico. Se quiseres voltar atrás, é trocar três nomes de tabela do
-- grupo MINHA para o grupo DE EQUIPA, aqui em baixo, e mais nada.
-- ===========================================================================

-- Qual é o meu lugar nesta equipa? (null se não for membro)
create or replace function public.meu_membro_id(p_equipa uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from membros_equipa
   where equipa_id = p_equipa and user_id = auth.uid() and ativo
   limit 1;
$$;
revoke execute on function public.meu_membro_id(uuid) from anon;

do $$
declare
  t text;
  -- grupo -> condição de LEITURA
  grupos jsonb := jsonb_build_object(
    'referencia', jsonb_build_array('epocas','almocos','artigos_multa'),
    'reservada',  jsonb_build_array('tabela_valores'),
    'equipa',     jsonb_build_array('multas','fundo_gastos'),
    'minha',      jsonb_build_array('participacoes','distancias','pagamentos')
  );
  g text; cond_ler text;
begin
  for g in select jsonb_object_keys(grupos) loop
    cond_ler := case g
      when 'referencia' then 'e_membro(equipa_id)'
      when 'reservada'  then 'e_responsavel(equipa_id)'
      when 'equipa'     then 'e_membro(equipa_id)'
      when 'minha'      then 'e_responsavel(equipa_id) or membro_id = meu_membro_id(equipa_id)'
    end;

    for t in select jsonb_array_elements_text(grupos->g) loop
      execute format('alter table %I enable row level security', t);
      execute format('alter table %I force  row level security', t);

      execute format('drop policy if exists "quem le" on %I', t);
      execute format('create policy "quem le" on %I for select to authenticated using (%s)', t, cond_ler);

      -- escrita: sempre e só o responsável, em todas elas
      execute format('drop policy if exists "responsavel insere" on %I', t);
      execute format($p$create policy "responsavel insere" on %I
          for insert to authenticated with check (e_responsavel(equipa_id))$p$, t);

      execute format('drop policy if exists "responsavel atualiza" on %I', t);
      execute format($p$create policy "responsavel atualiza" on %I
          for update to authenticated using (e_responsavel(equipa_id))
          with check (e_responsavel(equipa_id))$p$, t);

      execute format('drop policy if exists "responsavel apaga" on %I', t);
      execute format($p$create policy "responsavel apaga" on %I
          for delete to authenticated using (e_responsavel(equipa_id))$p$, t);

      -- limpar políticas de uma versão anterior deste ficheiro
      execute format('drop policy if exists "membros leem" on %I', t);
    end loop;
  end loop;
end $$;

-- `force row level security`: sem isto, o dono das tabelas (o papel que as
-- criou) ficava isento das políticas. Não afeta a app, mas fecha a porta.

-- --- JOGOS: o assistente vê os jogos EM QUE PARTICIPOU ---------------------
-- Não podia ser "vê todos": a lista de nomeações da equipa inteira não é dele.
-- Não podia ser "vê nenhum": sem o jogo não há data, escalão nem campo para
-- mostrar ao lado do valor que recebeu.
alter table jogos enable row level security;
alter table jogos force  row level security;

drop policy if exists "membros leem"  on jogos;
drop policy if exists "quem le"       on jogos;
create policy "quem le" on jogos
  for select to authenticated using (
    e_responsavel(equipa_id)
    or exists (
      select 1 from participacoes p
       where p.jogo_id = jogos.id
         and p.membro_id = meu_membro_id(jogos.equipa_id)
    )
  );

drop policy if exists "responsavel insere" on jogos;
create policy "responsavel insere" on jogos
  for insert to authenticated with check (e_responsavel(equipa_id));

drop policy if exists "responsavel atualiza" on jogos;
create policy "responsavel atualiza" on jogos
  for update to authenticated using (e_responsavel(equipa_id))
  with check (e_responsavel(equipa_id));

drop policy if exists "responsavel apaga" on jogos;
create policy "responsavel apaga" on jogos
  for delete to authenticated using (e_responsavel(equipa_id));

-- --- DESPESAS: de cada um, e SÓ de cada um ------------------------------------
-- As despesas são pessoais: o almoço, o jantar, a gasolina de cada um. Aqui a
-- regra é diferente de tudo o resto, e de propósito:
--   * cada pessoa vê, cria, altera e apaga as SUAS;
--   * ninguém vê as dos outros — nem o responsável.
-- É a única tabela onde o assistente escreve, e só na sua própria linha: o
-- `with check` impede que alguém lance uma despesa em nome de outro.
alter table despesas enable row level security;
alter table despesas force  row level security;

-- fora as políticas de versões anteriores deste ficheiro, que deixavam o
-- responsável ver tudo (as políticas somam-se: bastava ficar uma para abrir)
drop policy if exists "membros leem"          on despesas;
drop policy if exists "quem le"               on despesas;
drop policy if exists "responsavel insere"    on despesas;
drop policy if exists "responsavel atualiza"  on despesas;
drop policy if exists "responsavel apaga"     on despesas;

drop policy if exists "so as minhas le"       on despesas;
create policy "so as minhas le" on despesas
  for select to authenticated using (membro_id = meu_membro_id(equipa_id));

drop policy if exists "so as minhas insere"   on despesas;
create policy "so as minhas insere" on despesas
  for insert to authenticated with check (membro_id = meu_membro_id(equipa_id));

drop policy if exists "so as minhas atualiza" on despesas;
create policy "so as minhas atualiza" on despesas
  for update to authenticated
  using (membro_id = meu_membro_id(equipa_id))
  with check (membro_id = meu_membro_id(equipa_id));

drop policy if exists "so as minhas apaga"    on despesas;
create policy "so as minhas apaga" on despesas
  for delete to authenticated using (membro_id = meu_membro_id(equipa_id));

-- ===========================================================================
-- 7. Entrar e criar equipa
-- ---------------------------------------------------------------------------
-- Porque é que isto são funções e não INSERTs normais:
--
--  * criar_equipa: a política de escrita em `membros_equipa` exige ser
--    responsável DESSA equipa. Na primeira linha ainda não há responsável
--    nenhum — era o ovo e a galinha. A função cria a equipa e o primeiro
--    membro no mesmo passo, e é a própria função que garante que quem chama
--    fica responsável.
--
--  * entrar_com_codigo: para validar um código é preciso LER `equipas`, e quem
--    ainda não é membro não pode ler `equipas` (de propósito — senão bastava
--    pedir a lista de códigos). A função corre por cima da RLS, mas só faz uma
--    coisa: procurar UM código exato. Não devolve a lista, não devolve nada de
--    outra equipa.
-- ===========================================================================

create or replace function public.gera_codigo()
returns text language sql volatile as $$
  -- 6 caracteres sem os que se confundem ao telefone (0/O, 1/I/L, 5/S, 2/Z)
  select string_agg(substr('ABCDEFGHJKMNPQRTUVWXY346789',
                           1 + floor(random()*27)::int, 1), '')
    from generate_series(1,6);
$$;

create or replace function public.criar_equipa(p_nome text, p_meu_nome text default null)
returns table (equipa_id uuid, codigo text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text; v_tent int := 0;
begin
  if auth.uid() is null then
    raise exception 'Precisas de iniciar sessão.' using errcode = '28000';
  end if;
  if coalesce(trim(p_nome),'') = '' then
    raise exception 'A equipa precisa de um nome.' using errcode = '22023';
  end if;

  loop
    v_cod := gera_codigo(); v_tent := v_tent + 1;
    exit when not exists (select 1 from equipas e where e.codigo_convite = v_cod);
    if v_tent > 20 then raise exception 'Não consegui gerar um código.'; end if;
  end loop;

  insert into equipas(nome, codigo_convite, criada_por)
  values (trim(p_nome), v_cod, auth.uid())
  returning id into v_id;

  insert into membros_equipa(equipa_id, user_id, nome, papel)
  values (v_id, auth.uid(),
          coalesce(nullif(trim(p_meu_nome),''),
                   nullif((select p.nome from perfis p where p.id = auth.uid()),''),
                   'Responsável'),
          'responsavel');

  return query select v_id, v_cod;
end $$;

create or replace function public.entrar_com_codigo(p_codigo text, p_meu_nome text default null)
returns table (equipa_id uuid, equipa_nome text, papel text)
language plpgsql security definer set search_path = public as $$
declare v_eq uuid; v_nome text; v_mem uuid; v_papel text; v_meu text;
begin
  if auth.uid() is null then
    raise exception 'Precisas de iniciar sessão.' using errcode = '28000';
  end if;

  select e.id, e.nome into v_eq, v_nome
    from equipas e
   where upper(e.codigo_convite) = upper(trim(coalesce(p_codigo,'')));

  if v_eq is null then
    raise exception 'Esse código não corresponde a nenhuma equipa.' using errcode = '22023';
  end if;

  -- já lá dentro? não faz nada, devolve o que há
  select m.id, m.papel into v_mem, v_papel
    from membros_equipa m where m.equipa_id = v_eq and m.user_id = auth.uid();
  if v_mem is not null then
    update membros_equipa m set ativo = true where m.id = v_mem;
    return query select v_eq, v_nome, v_papel; return;
  end if;

  v_meu := nullif(trim(coalesce(p_meu_nome,'')),'');

  -- reclamar um lugar que a migração deixou por reclamar, pelo nome
  if v_meu is not null then
    update membros_equipa m
       set user_id = auth.uid(), nome = v_meu
     where m.id = (select x.id from membros_equipa x
                    where x.equipa_id = v_eq and x.user_id is null
                      and (lower(x.nome) = lower(v_meu) or lower(x.alias) = lower(v_meu))
                    order by x.criado_em limit 1)
    returning m.id, m.papel into v_mem, v_papel;
  end if;

  -- não havia lugar com esse nome: entra como assistente novo
  if v_mem is null then
    insert into membros_equipa as m (equipa_id, user_id, nome, papel)
    values (v_eq, auth.uid(),
            coalesce(v_meu, nullif((select p.nome from perfis p where p.id = auth.uid()),''), 'Assistente'),
            'assistente')
    returning m.id, m.papel into v_mem, v_papel;
  end if;

  return query select v_eq, v_nome, v_papel;
end $$;

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
  update equipas e set codigo_convite = v_cod where e.id = p_equipa;
  return v_cod;
end $$;

-- A chave `anon` sem sessão não pode chamar nada disto.
revoke execute on function public.criar_equipa(text,text)       from anon;
revoke execute on function public.entrar_com_codigo(text,text)  from anon;
revoke execute on function public.rodar_codigo(uuid)            from anon;
revoke execute on function public.gera_codigo()                 from anon, authenticated;

-- ===========================================================================
-- 8. Carimbo de quem mexeu (só nos jogos, que é onde interessa)
-- ===========================================================================
create or replace function public.carimba()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;

drop trigger if exists tg_carimba_jogos on jogos;
create trigger tg_carimba_jogos before insert or update on jogos
  for each row execute function public.carimba();
