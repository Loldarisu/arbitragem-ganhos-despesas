/* Regras dos avisos: que notificações são devidas AGORA.
 *
 * Funções puras, sem rede nem base de dados, para se poderem testar em Node
 * (tests/avisos.mjs) e correr iguais na Edge Function (Deno). A função que
 * as chama (index.ts) só vai buscar os dados, envia e regista.
 *
 * As horas dos jogos estão guardadas como hora de Portugal ("15:00" é 15h em
 * Lisboa), e o servidor corre em UTC. Tudo o que é "às 20h da véspera" é
 * calculado no fuso de Lisboa, com a mudança de hora incluída.
 *
 * Os três avisos, cada um enviado UMA vez por jogo e por pessoa (o registo
 * fica em avisos_enviados):
 *   confirmar  Art. 3 — nomeação por confirmar, entre as 19h e as 22h de
 *              Lisboa, para um jogo agendado que ainda não começou
 *   horas      Art. 4 — horas por marcar, entre as 18h e as 20h da véspera
 *   sair       o jogo começa daqui a cerca de 2 horas
 */

const FUSO = "Europe/Lisbon";

const fmtLisboa = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/* As peças da data e hora de Lisboa num instante. */
export function partesLisboa(ms) {
  const p = Object.fromEntries(fmtLisboa.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour, minuto: +p.minute,
           data: `${p.year}-${p.month}-${p.day}` };
}

/* Minutos que Lisboa está à frente de UTC nesse instante (0 no inverno, 60 no verão). */
function desvioLisboa(ms) {
  const p = partesLisboa(ms);
  const comoUTC = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  return Math.round((comoUTC - Math.floor(ms / 60000) * 60000) / 60000);
}

/* O instante (ms) de uma data e hora de Lisboa, ex.: ("2026-03-29","15:00"). */
export function instanteLisboa(data, hora) {
  const [a, m, d] = String(data).split("-").map(Number);
  const [hh, mm] = String(hora || "15:00").split(":").map(Number);
  const palpite = Date.UTC(a, m - 1, d, hh || 0, mm || 0);
  let t = palpite - desvioLisboa(palpite) * 60000;
  const d2 = desvioLisboa(t);                      // no dia da mudança de hora
  if (palpite - d2 * 60000 !== t) t = palpite - d2 * 60000;
  return t;
}

/* A véspera de um jogo, às HH:00 de Lisboa. */
export function vesperaAs(data, horaDoDia) {
  const [a, m, d] = String(data).split("-").map(Number);
  const v = new Date(Date.UTC(a, m - 1, d - 1));
  const iso = v.toISOString().slice(0, 10);
  return instanteLisboa(iso, `${String(horaDoDia).padStart(2, "0")}:00`);
}

const nomeJogo = j => `${j.equipa_a || "?"} vs ${j.equipa_b || "?"}`;

/* Devolve a lista de avisos devidos:
 *   [{ jogoId, tipo, membros:[membro_id], titulo, corpo }]
 * `jogos` vêm da base de dados (jogos + participacoes(membro_id));
 * `responsaveis` é {equipa_id: [membro_id]} — quem trata da confirmação e das
 * horas também é avisado dessas duas, mesmo que não vá ao jogo;
 * `jaEnviados` é um Set de "jogo|membro|tipo". */
export function avisosDevidos(jogos, agora, jaEnviados = new Set(), responsaveis = {}) {
  const out = [];
  const lx = partesLisboa(agora);
  for (const j of jogos || []) {
    if (j.estado !== "agendado") continue;
    const inicio = instanteLisboa(j.data, j.hora);
    if (!(inicio > agora)) continue;
    const quem = [...new Set((j.participacoes || []).map(p => p.membro_id).filter(Boolean))];
    const comResp = [...new Set(quem.concat(responsaveis[j.equipa_id] || []))];
    const quando = `${j.data.split("-").reverse().join("/")} às ${j.hora || "15:00"}`;
    const junta = (tipo, membros, titulo, corpo) => {
      const falta = membros.filter(m => !jaEnviados.has(`${j.id}|${m}|${tipo}`));
      if (falta.length) out.push({ jogoId: j.id, tipo, membros: falta, titulo, corpo });
    };

    // Art. 3 — confirmar nomeação, ao fim da tarde, antes das 22h
    if (!j.confirmada && lx.hora >= 19 && lx.hora < 22)
      junta("confirmar", comResp, "Confirmar nomeação (Art. 3)",
        `${nomeJogo(j)}, ${quando}. O prazo acaba às 22h.`);

    // Art. 4 — marcar horas entre as 18h e as 20h da véspera
    const v18 = vesperaAs(j.data, 18), v20 = vesperaAs(j.data, 20);
    if (!j.horas_marcadas && agora >= v18 && agora < v20)
      junta("horas", comResp, "Marcar horas até às 20h (Art. 4)",
        `${nomeJogo(j)}, amanhã às ${j.hora || "15:00"}.`);

    // Sair para o jogo: entre 2h15 e 1h30 antes do apito (o agendamento corre
    // de 10 em 10 minutos; a janela larga aguenta uma volta falhada)
    const falta = inicio - agora;
    if (falta <= 135 * 60000 && falta > 90 * 60000)
      junta("sair", quem, `Jogo às ${j.hora || "15:00"}`,
        `${nomeJogo(j)}${j.local ? " — " + j.local : ""}.`);
  }
  return out;
}
