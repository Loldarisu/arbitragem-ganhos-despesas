// Edge Function "avisos-prazos": envia as notificações push dos prazos.
//
// Chamada de 10 em 10 minutos pelo agendamento do sql/08-agendamento-avisos.sql
// (pg_cron + pg_net). Não é chamada pela app. Por isso é publicada com
// --no-verify-jwt e protege-se com um segredo próprio (CRON_SEGREDO).
//
// O que faz em cada volta:
//   1. vai buscar os jogos agendados de hoje até daqui a 2 dias;
//   2. decide que avisos são devidos agora (regras.js, testado em Node);
//   3. envia-os às subscrições de cada pessoa (subscricoes_push);
//   4. regista-os em avisos_enviados, para não repetir;
//   5. apaga as subscrições que o serviço de push diz que já não existem.
//
// Segredos (supabase secrets set ...): VAPID_PUBLICA, VAPID_PRIVADA,
// VAPID_CONTACTO (mailto:...), CRON_SEGREDO. SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY são postos pelo próprio Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { avisosDevidos, partesLisboa } from "./regras.js";

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`falta o segredo ${k}`);
  return v;
};

// Uma falha tem de dizer o que falhou: um 500 mudo não deixa perceber se falta
// um segredo ou se a base de dados recusou. Nunca se devolve o VALOR de um
// segredo — só o nome do que falta.
Deno.serve(async (req) => {
  try {
    return await trata(req);
  } catch (e) {
    console.error("avisos-prazos falhou:", e);
    return new Response("erro: " + (e as Error).message, { status: 500 });
  }
});

async function trata(req: Request): Promise<Response> {
  if (req.headers.get("Authorization") !== `Bearer ${env("CRON_SEGREDO")}`)
    return new Response("não autorizado", { status: 401 });

  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } });
  webpush.setVapidDetails(env("VAPID_CONTACTO"), env("VAPID_PUBLICA"), env("VAPID_PRIVADA"));

  const agora = Date.now();
  const dia = (n: number) => partesLisboa(agora + n * 86400000).data;

  const { data: jogos, error: e1 } = await sb.from("jogos")
    .select("id,equipa_id,data,hora,estado,confirmada,horas_marcadas,equipa_a,equipa_b,local,participacoes(membro_id)")
    .eq("estado", "agendado").gte("data", dia(0)).lte("data", dia(2));
  if (e1) return new Response("jogos: " + e1.message, { status: 500 });
  if (!jogos?.length) return Response.json({ enviados: 0 });

  const ids = jogos.map((j) => j.id);
  const equipas = [...new Set(jogos.map((j) => j.equipa_id))];
  const [{ data: feitos }, { data: resp }] = await Promise.all([
    sb.from("avisos_enviados").select("jogo_id,membro_id,tipo").in("jogo_id", ids),
    sb.from("membros_equipa").select("id,equipa_id").in("equipa_id", equipas)
      .eq("papel", "responsavel").eq("ativo", true),
  ]);
  const jaEnviados = new Set((feitos || []).map((f) => `${f.jogo_id}|${f.membro_id}|${f.tipo}`));
  const responsaveis: Record<string, string[]> = {};
  for (const r of resp || []) (responsaveis[r.equipa_id] ||= []).push(r.id);

  const devidos = avisosDevidos(jogos, agora, jaEnviados, responsaveis);
  if (!devidos.length) return Response.json({ enviados: 0 });

  const membros = [...new Set(devidos.flatMap((d) => d.membros))];
  const { data: subs } = await sb.from("subscricoes_push")
    .select("id,membro_id,endpoint,p256dh,auth").in("membro_id", membros);

  let enviados = 0;
  const registos: { jogo_id: string; membro_id: string; tipo: string }[] = [];
  const mortas: string[] = [];
  for (const a of devidos) {
    const corpo = JSON.stringify({ titulo: a.titulo, corpo: a.corpo, url: "./index.html", tag: `${a.jogoId}-${a.tipo}` });
    for (const m of a.membros) {
      for (const s of (subs || []).filter((x) => x.membro_id === m)) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, corpo, { TTL: 3600 });
          enviados++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) mortas.push(s.id);   // o telemóvel desistiu da subscrição
          else console.error("push falhou", code, (e as Error).message);
        }
      }
      // Regista mesmo sem subscrição: quem ligar os avisos depois não recebe
      // de rajada os avisos que já passaram.
      registos.push({ jogo_id: a.jogoId, membro_id: m, tipo: a.tipo });
    }
  }
  if (registos.length)
    await sb.from("avisos_enviados").upsert(registos, { onConflict: "jogo_id,membro_id,tipo", ignoreDuplicates: true });
  if (mortas.length) await sb.from("subscricoes_push").delete().in("id", mortas);

  return Response.json({ enviados, avisos: devidos.length, subscricoesApagadas: mortas.length });
}
