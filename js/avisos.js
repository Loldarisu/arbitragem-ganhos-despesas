/* js/avisos.js — Avisos no telemóvel (notificações push).
   Script normal (sem módulos nem build), carregado a seguir ao definicoes.js.

   A app só faz duas coisas: pede autorização e regista este telemóvel em
   subscricoes_push (sql/07). Quem decide QUANDO avisar e envia é a Edge
   Function avisos-prazos, no servidor, de 10 em 10 minutos — por isso os
   avisos chegam com a app fechada. Guia: docs/AVISOS-PUSH.md.

   A chave pública VAPID vem do config.local.js (SB_CONFIG.vapid). Sem ela,
   o cartão explica que os avisos ainda não foram ligados no servidor. */
"use strict";

const vapidPublica=()=>(typeof SB_CONFIG!=="undefined"&&SB_CONFIG&&SB_CONFIG.vapid)||"";
const suportaPush=()=>"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;

// A chave VAPID vem em base64 "url-safe"; o browser quer os bytes.
function bytesDaChave(b64){
  const pad="=".repeat((4-b64.length%4)%4);
  const bin=atob((b64+pad).replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
async function subscricaoAtual(){
  if(!suportaPush())return null;
  try{ const reg=await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); }
  catch(_){ return null; }
}

async function ligaAvisos(){
  if(!vapidPublica()||!EQUIPA||!EUMEMBRO)return false;
  const perm=await Notification.requestPermission();
  if(perm!=="granted"){ toast("Sem autorização do telemóvel, não há avisos. Podes mudar isso nas definições do browser.","erro"); return false; }
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription()
      ||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytesDaChave(vapidPublica())});
    const j=sub.toJSON();
    // O endpoint é único: voltar a ligar no mesmo telemóvel atualiza, não duplica.
    await sbReq("POST","subscricoes_push?on_conflict=endpoint",[{
      user_id:await idDoUtilizador(),equipa_id:EQUIPA.id,membro_id:EUMEMBRO.id,
      endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth}],
      {Prefer:"resolution=merge-duplicates,return=minimal"});
    toast("Avisos ligados neste telemóvel");
    return true;
  }catch(e){ return falhou(e); }
}

/* Desliga neste telemóvel. Também é chamado ao terminar sessão: outra pessoa
   que entre aqui não pode receber os avisos da anterior. */
async function desligaAvisos(silencioso=false){
  const sub=await subscricaoAtual(); if(!sub)return true;
  try{ await sbReq("DELETE","subscricoes_push?endpoint=eq."+encodeURIComponent(sub.endpoint),null,{Prefer:"return=minimal"}); }
  catch(_){ /* sem rede: o telemóvel desiste da subscrição e o servidor apaga-a no próximo envio */ }
  try{ await sub.unsubscribe(); }catch(_){}
  if(!silencioso)toast("Avisos desligados neste telemóvel");
  return true;
}

const O_QUE_AVISA=`<ul class="mut sub" style="margin:8px 0 0 18px;line-height:1.55">
  <li>ao fim da tarde, se a nomeação ainda não estiver confirmada (Art. 3, até às 22h);</li>
  <li>entre as 18h e as 20h da véspera, se as horas não estiverem marcadas (Art. 4);</li>
  <li>cerca de 2 horas antes do apito, com o campo.</li></ul>`;

async function pintaAvisos(){
  const c=$("#cAvisos"); if(!c)return;
  let h;
  if(!suportaPush()){
    h=`<div class="mut sub">Este browser não recebe avisos. No iPhone é preciso instalar a app no ecrã principal (Partilhar → Adicionar ao ecrã principal), com iOS 16.4 ou mais recente.</div>`;
  }else if(!vapidPublica()){
    h=`<div class="mut sub">Os avisos ainda não foram ligados no servidor.${souResponsavel()?" O guia está em docs/AVISOS-PUSH.md.":" Fala com o responsável da equipa."}</div>`;
  }else if(Notification.permission==="denied"){
    h=`<div class="mut sub">As notificações desta app estão bloqueadas no telemóvel. Para as voltar a ligar: definições do browser → Sites → Notificações.</div>`;
  }else{
    const sub=await subscricaoAtual();
    if(!$("#cAvisos"))return;          // mudou de ecrã entretanto
    h=sub
      ?`<div class="sub"><b>✓ Ligados neste telemóvel.</b> Recebes um aviso:</div>${O_QUE_AVISA}
        <div class="btnrow"><button class="btn" id="avDesliga">Desligar</button></div>`
      :`<div class="sub">Recebe um aviso no telemóvel, mesmo com a app fechada:</div>${O_QUE_AVISA}
        <div class="btnrow"><button class="btn pri" id="avLiga">Ligar avisos</button></div>`;
  }
  h+=`<div class="mut sub" style="margin-top:8px">O calendário (.ics, no Resumo) continua a ser o alarme mais fiável: toca mesmo sem rede.</div>`;
  const cx=$("#cAvisos"); if(!cx)return;
  cx.innerHTML=h;
  if($("#avLiga"))$("#avLiga").onclick=async()=>{ ocupado("#avLiga","A ligar…"); await ligaAvisos(); pintaAvisos(); };
  if($("#avDesliga"))$("#avDesliga").onclick=async()=>{ ocupado("#avDesliga","A desligar…"); await desligaAvisos(); pintaAvisos(); };
}
