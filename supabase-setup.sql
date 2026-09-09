-- Configuração da base de dados para a app Elite Referees AFA
-- Pode ser corrido as vezes que for preciso (substitui as regras antigas).
-- Cola TUDO em: Supabase → SQL Editor → New query → Run

create table if not exists estado (
  id int primary key,
  rev bigint not null default 1,
  dados jsonb not null,
  updated_at timestamptz default now()
);

alter table estado enable row level security;

-- limpar regras antigas (de qualquer versão anterior)
drop policy if exists "equipa pode ler" on estado;
drop policy if exists "equipa pode inserir" on estado;
drop policy if exists "equipa pode atualizar" on estado;
drop policy if exists "so o chefe insere" on estado;
drop policy if exists "so o chefe atualiza" on estado;

-- todos os utilizadores autenticados podem consultar
create policy "equipa pode ler" on estado
  for select to authenticated using (true);

-- só o chefe pode escrever
create policy "so o chefe insere" on estado
  for insert to authenticated
  with check (auth.jwt()->>'email' = 'o-teu-email@exemplo.com');

create policy "so o chefe atualiza" on estado
  for update to authenticated
  using (auth.jwt()->>'email' = 'o-teu-email@exemplo.com');
