/* Supabase de mentira para os testes: Auth + PostgREST + funções, em memória.
 *
 * Não substitui as provas de RLS — essas correm contra um PostgreSQL a sério
 * (sql/02-provas.sql). Aqui o objetivo é outro: pôr a app a andar de ponta a
 * ponta sem rede, e conseguir desligar a "rede" a meio para ver se ela diz a
 * verdade quando falha.
 *
 * As regras de quem vê o quê estão aqui repetidas de propósito: se a app
 * passar a mostrar coisas que o servidor a sério não lhe daria, os testes
 * apanham isso.
 */
import http from 'node:http';

export function criaMock(porta=0){
  const db={
    users:new Map(),            // id -> {id,email,password,nome,confirmado}
    porEmail:new Map(),
    tokens:new Map(),           // access -> userId
    equipas:[], membros_equipa:[], epocas:[], tabela_valores:[], almocos:[],
    artigos_multa:[], jogos:[], participacoes:[], despesas:[], multas:[],
    pagamentos:[], fundo_gastos:[], distancias:[], lixo:[], subscricoes_push:[],
    tentativas:new Map()        // userId -> [instantes de códigos errados]
  };
  // As tabelas com gatilho de lixo (sql/05-seguranca-dados.sql)
  const COM_LIXO=['jogos','participacoes','despesas','multas','pagamentos',
                  'fundo_gastos','distancias','almocos','tabela_valores','artigos_multa'];
  const estado={offline:false, falhaProxima:null, pedidos:[]};

  const uid=()=>'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16);});

  const meuMembro=(uidUser,equipa)=>db.membros_equipa.find(
    m=>m.user_id===uidUser&&m.equipa_id===equipa&&m.ativo!==false&&m.aprovado!==false);
  const eResp=(u,eq)=>{const m=meuMembro(u,eq);return !!(m&&m.papel==='responsavel');};
  const eMembro=(u,eq)=>!!meuMembro(u,eq);

  // As mesmas quatro regras do ficheiro 01-esquema.sql
  const GRUPO={
    epocas:'referencia', almocos:'referencia', artigos_multa:'referencia',
    tabela_valores:'reservada',
    multas:'equipa', fundo_gastos:'equipa',
    participacoes:'minha', distancias:'minha', pagamentos:'minha',
    despesas:'privada'
  };
  function podeLer(u,tabela,linha){
    const eq=linha.equipa_id;
    // quem está à espera de aprovação lê a sua própria linha, e só essa
    if(tabela==='membros_equipa'&&linha.user_id===u)return true;
    // sql/07: cada conta vê só as suas subscrições de avisos
    if(tabela==='subscricoes_push')return linha.user_id===u;
    if(tabela==='lixo')
      return linha.tabela==='despesas'
        ? linha.registo.membro_id===(meuMembro(u,eq)||{}).id
        : eResp(u,eq);
    if(!eMembro(u,eq))return false;
    if(tabela==='jogos')
      return eResp(u,eq)||db.participacoes.some(p=>p.jogo_id===linha.id&&p.membro_id===(meuMembro(u,eq)||{}).id);
    const g=GRUPO[tabela];
    if(g==='reservada')return eResp(u,eq);
    if(g==='minha')return eResp(u,eq)||linha.membro_id===(meuMembro(u,eq)||{}).id;
    // despesas: só as do próprio, nem o responsável vê as dos outros
    if(g==='privada')return linha.membro_id===(meuMembro(u,eq)||{}).id;
    return true;
  }
  const podeEscrever=(u,tabela,linha)=>
    tabela==='subscricoes_push'
      ? linha.user_id===u&&linha.membro_id===(meuMembro(u,linha.equipa_id)||{}).id
    : GRUPO[tabela]==='privada'
      ? linha.membro_id===(meuMembro(u,linha.equipa_id)||{}).id
      : eResp(u,linha.equipa_id);

  // Igual a aprovar_membro(): um pedido que reclama um lugar antigo fica com
  // esse lugar (e o histórico); os outros passam simplesmente a aprovados.
  function aprova(m){
    const lugar=m.reclama_id&&db.membros_equipa.find(x=>x.id===m.reclama_id&&!x.user_id);
    if(lugar){
      db.membros_equipa=db.membros_equipa.filter(x=>x.id!==m.id);
      Object.assign(lugar,{user_id:m.user_id,nome:m.nome,aprovado:true,ativo:true});
    }else Object.assign(m,{aprovado:true,reclama_id:null});
  }

  function filtra(tabela,params,u){
    let linhas=(db[tabela]||[]).filter(l=>podeLer(u,tabela,l));
    for(const [k,v] of params){
      if(['select','order','limit','offset'].includes(k))continue;
      const [op,...resto]=String(v).split('.');
      const alvo=resto.join('.');
      linhas=linhas.filter(l=>{
        const val=l[k];
        if(op==='eq')  return String(val)===alvo;
        if(op==='neq') return String(val)!==alvo;
        if(op==='is')  return alvo==='true'?val===true:alvo==='false'?val===false:val==null;
        if(op==='not') return !(String(resto[1]||'').split('(')[1]||'').replace(')','').split(',').includes(String(val));
        if(op==='in')  return alvo.replace(/[()]/g,'').split(',').includes(String(val));
        return true;
      });
    }
    return linhas;
  }

  const srv=http.createServer(async (req,res)=>{
    const u=new URL(req.url,'http://x');
    let corpo='';
    for await(const c of req)corpo+=c;
    estado.pedidos.push({metodo:req.method,caminho:u.pathname});

    const resp=(codigo,dados,cab={})=>{
      res.writeHead(codigo,{'content-type':'application/json',
        'access-control-allow-origin':'*',
        'access-control-allow-headers':'*',
        'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',
        'access-control-expose-headers':'date',...cab});
      res.end(dados===null?'':JSON.stringify(dados));
    };
    if(req.method==='OPTIONS')return resp(204,null);

    /* Comandos do próprio teste, para as suítes que partilham este servidor:
       ver o que está gravado, cortar a rede, repor tudo. */
    if(u.pathname.startsWith('/__')){
      if(u.pathname==='/__estado')return resp(200,{
        jogos:db.jogos.length, participacoes:db.participacoes.length,
        multas:db.multas.length, despesas:db.despesas.length,
        membros:db.membros_equipa.length, equipas:db.equipas.length, subscricoes:db.subscricoes_push.length,
        codigos:db.equipas.map(e=>e.codigo_convite)});
      if(u.pathname==='/__rede'){ estado.offline=u.searchParams.get('on')==='0'; return resp(200,{offline:estado.offline}); }
      if(u.pathname==='/__confirmacao'){ estado.exigeConfirmacao=u.searchParams.get('on')==='1'; return resp(200,{}); }
      // Aprova todos os pedidos pendentes, como faria o responsável.
      if(u.pathname==='/__aprova'){
        for(const m of db.membros_equipa.filter(x=>x.aprovado===false))aprova(m);
        return resp(200,{});
      }
      if(u.pathname==='/__reset'){
        for(const k of ['equipas','membros_equipa','epocas','tabela_valores','almocos','artigos_multa',
          'jogos','participacoes','despesas','multas','pagamentos','fundo_gastos','distancias','lixo','subscricoes_push'])db[k]=[];
        db.tentativas.clear();
        db.users.clear(); db.porEmail.clear(); db.tokens.clear();
        estado.offline=false; estado.exigeConfirmacao=false; estado.pedidos=[];
        return resp(200,{});
      }
      return resp(404,{});
    }

    // Cortar a ligação a sério: destruir só o pedido deixava o browser à
    // espera de uma resposta que nunca vinha, e o teste media um bloqueio em
    // vez de uma falha de rede.
    if(estado.offline){ try{ req.socket.destroy(); }catch(_){} return; }
    if(estado.falhaProxima){ const f=estado.falhaProxima; estado.falhaProxima=null;
      return resp(f.codigo,f.corpo||{message:'falha simulada'}); }

    const tok=(req.headers.authorization||'').replace('Bearer ','');
    const quem=db.tokens.get(tok)||null;
    const body=corpo?JSON.parse(corpo):null;

    /* ---------------- Auth ---------------- */
    if(u.pathname==='/auth/v1/signup'){
      const e=String(body.email||'').toLowerCase();
      if(db.porEmail.has(e))return resp(400,{msg:'User already registered'});
      if(String(body.password||'').length<6)return resp(422,{msg:'Password should be at least 6 characters'});
      const id=uid();
      const nome=(body.data&&body.data.nome)||'';
      db.users.set(id,{id,email:e,password:body.password,nome,confirmado:!estado.exigeConfirmacao});
      db.porEmail.set(e,id);
      if(estado.exigeConfirmacao)return resp(200,{id,email:e});   // sem sessão
      const a=uid(); db.tokens.set(a,id);
      return resp(200,{access_token:a,refresh_token:'r_'+a,expires_in:3600,user:{id,email:e}});
    }
    if(u.pathname==='/auth/v1/token'){
      if(u.searchParams.get('grant_type')==='refresh_token'){
        const rid=db.tokens.get(String(body.refresh_token||'').replace(/^r_/,''));
        if(!rid)return resp(401,{msg:'Invalid Refresh Token'});
        const a=uid(); db.tokens.set(a,rid);
        return resp(200,{access_token:a,refresh_token:'r_'+a,expires_in:3600});
      }
      const e=String(body.email||'').toLowerCase();
      const id=db.porEmail.get(e); const user=id&&db.users.get(id);
      if(!user||user.password!==body.password)return resp(400,{error_description:'Invalid login credentials'});
      if(!user.confirmado)return resp(400,{error_description:'Email not confirmed'});
      const a=uid(); db.tokens.set(a,id);
      return resp(200,{access_token:a,refresh_token:'r_'+a,expires_in:3600,user:{id,email:e}});
    }
    if(u.pathname==='/auth/v1/recover')  return resp(200,{});
    if(u.pathname==='/auth/v1/resend')   return resp(200,{});
    if(u.pathname==='/auth/v1/logout')   return resp(204,null);
    if(u.pathname==='/auth/v1/user'){
      if(!quem)return resp(401,{msg:'invalid claim'});
      if(req.method==='PUT'){ db.users.get(quem).password=body.password; return resp(200,{id:quem}); }
      const us=db.users.get(quem);
      return resp(200,{id:quem,email:us.email});
    }

    if(!quem)return resp(401,{message:'JWT required'});

    /* ---------------- Funções ---------------- */
    if(u.pathname==='/rest/v1/rpc/criar_equipa'){
      const eq={id:uid(),nome:body.p_nome,codigo_convite:'ABC123',
                categorias:['Equipamento','Inscrição','Deslocação','Formação','Quotas','Outro'],
                criada_por:quem};
      db.equipas.push(eq);
      db.membros_equipa.push({id:uid(),equipa_id:eq.id,user_id:quem,
        nome:body.p_meu_nome||'Responsável',alias:'',papel:'responsavel',
        funcao_habitual:'AA2',ativo:true});
      return resp(200,[{equipa_id:eq.id,codigo:eq.codigo_convite}]);
    }
    // Como no ficheiro 5: código errado ou expirado devolve zero linhas e conta
    // como tentativa; quem entra fica pendente até o responsável aprovar.
    if(u.pathname==='/rest/v1/rpc/entrar_com_codigo'){
      const agora=Date.now(), hora=3600*1000;
      const tent=(db.tentativas.get(quem)||[]).filter(t=>agora-t<hora);
      if(tent.length>=10)return resp(400,{code:'54000',message:'Demasiadas tentativas com códigos errados. Tenta daqui a uma hora.'});
      const cod=String(body.p_codigo||'').toUpperCase();
      const eq=db.equipas.find(x=>x.codigo_convite.toUpperCase()===cod&&(!x.codigo_expira_em||x.codigo_expira_em>agora));
      if(!eq){ tent.push(agora); db.tentativas.set(quem,tent); return resp(200,[]); }
      let m=db.membros_equipa.find(x=>x.equipa_id===eq.id&&x.user_id===quem);
      if(!m){
        const nome=String(body.p_meu_nome||'').trim();
        const lugar=db.membros_equipa.find(x=>x.equipa_id===eq.id&&!x.user_id&&
            (x.nome.toLowerCase()===nome.toLowerCase()||(x.alias||'').toLowerCase()===nome.toLowerCase()));
        m={id:uid(),equipa_id:eq.id,user_id:quem,nome:nome||'Assistente',alias:'',
           papel:'assistente',funcao_habitual:'AA2',ativo:true,aprovado:false,reclama_id:lugar?lugar.id:null};
        db.membros_equipa.push(m);
      }
      return resp(200,[{equipa_id:eq.id,equipa_nome:eq.nome,papel:m.aprovado===false?'pendente':m.papel}]);
    }
    if(u.pathname==='/rest/v1/rpc/aprovar_membro'||u.pathname==='/rest/v1/rpc/recusar_membro'){
      const m=db.membros_equipa.find(x=>x.id===body.p_membro);
      if(!m)return resp(400,{code:'22023',message:'Esse pedido já não existe.'});
      if(!eResp(quem,m.equipa_id))return resp(403,{code:'42501',message:'Só o responsável pode aprovar membros.'});
      if(u.pathname.endsWith('aprovar_membro'))aprova(m);
      else db.membros_equipa=db.membros_equipa.filter(x=>x.id!==m.id);
      return resp(204,null);
    }
    if(u.pathname==='/rest/v1/rpc/repor_do_lixo'){
      const l=db.lixo.find(x=>x.id===body.p_id);
      if(!l)return resp(400,{code:'22023',message:'Esse registo já não está no lixo.'});
      const pode=l.tabela==='despesas'?l.registo.membro_id===(meuMembro(quem,l.equipa_id)||{}).id:eResp(quem,l.equipa_id);
      if(!pode)return resp(403,{code:'42501',message:'Só o responsável da equipa pode repor isto.'});
      if(db[l.tabela].some(x=>x.id===l.registo.id))return resp(409,{code:'23505',message:'Já existe um registo igual — não foi preciso repor.'});
      db[l.tabela].push({...l.registo});
      if(l.tabela==='jogos')for(const p of db.lixo.filter(x=>x.tabela==='participacoes'&&x.grupo===l.grupo&&x.apagado_em===l.apagado_em)){
        db.participacoes.push({...p.registo}); db.lixo=db.lixo.filter(x=>x.id!==p.id);
      }
      db.lixo=db.lixo.filter(x=>x.id!==l.id);
      return resp(200,l.tabela);
    }
    if(u.pathname==='/rest/v1/rpc/rodar_codigo'){
      const eq=db.equipas.find(x=>x.id===body.p_equipa);
      if(!eq||!eResp(quem,eq.id))return resp(403,{code:'42501',message:'permission denied'});
      eq.codigo_convite='XYZ789'; eq.codigo_expira_em=Date.now()+30*24*3600*1000;
      return resp(200,eq.codigo_convite);
    }

    // O mesmo que sql/04-guardar-jogo.sql: tudo ou nada. Verifica primeiro,
    // escreve depois — a falha a meio que a função evita não acontece aqui.
    if(u.pathname==='/rest/v1/rpc/guardar_jogo'){
      const jg=body.p_jogo||{}, parts=Array.isArray(body.p_participacoes)?body.p_participacoes:[];
      if(!jg.id||!jg.equipa_id)return resp(400,{code:'22023',message:'Jogo sem id ou sem equipa.'});
      const existente=db.jogos.find(x=>x.id===jg.id);
      if(!eResp(quem,jg.equipa_id)||(existente&&!eResp(quem,existente.equipa_id)))
        return resp(403,{code:'42501',message:'Só o responsável da equipa pode alterar isto.'});
      const ix=db.jogos.findIndex(x=>x.id===jg.id);
      if(ix>=0)db.jogos[ix]={...db.jogos[ix],...jg,equipa_id:db.jogos[ix].equipa_id}; else db.jogos.push({...jg});
      const fica=new Set(parts.map(p=>p.id));
      db.participacoes=db.participacoes.filter(p=>p.jogo_id!==jg.id||fica.has(p.id));
      for(const p of parts){
        const l={...p,jogo_id:jg.id,equipa_id:jg.equipa_id,id:p.id||uid()};
        const k=db.participacoes.findIndex(x=>x.id===l.id);
        if(k>=0)db.participacoes[k]={...db.participacoes[k],...l}; else db.participacoes.push(l);
      }
      return resp(204,null);
    }

    /* ---------------- Tabelas ---------------- */
    const mt=u.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if(!mt)return resp(404,{message:'não existe'});
    const tabela=mt[1];
    if(!(tabela in db)&&tabela!=='perfis')return resp(404,{message:'tabela não existe'});
    if(tabela==='perfis')return resp(200,[]);

    const params=[...u.searchParams.entries()];

    if(req.method==='GET'){
      let linhas=filtra(tabela,params,quem).map(l=>({...l}));
      const sel=u.searchParams.get('select')||'*';
      if(tabela==='jogos'&&sel.includes('participacoes'))
        linhas=linhas.map(j=>({...j,participacoes:db.participacoes
          .filter(p=>p.jogo_id===j.id&&podeLer(quem,'participacoes',p))}));
      if(tabela==='membros_equipa'&&sel.includes('equipas'))
        linhas=linhas.map(m=>({...m,equipas:eMembro(quem,m.equipa_id)?(db.equipas.find(e=>e.id===m.equipa_id)||null):null}));
      return resp(200,linhas);
    }

    if(req.method==='POST'){
      const linhas=Array.isArray(body)?body:[body];
      for(const l of linhas){
        if(!podeEscrever(quem,tabela,l))
          return resp(403,{code:'42501',message:'new row violates row-level security policy'});
        const chave=u.searchParams.get('on_conflict')||'id';
        const ix=l[chave]==null?-1:db[tabela].findIndex(x=>x[chave]===l[chave]);
        if(ix>=0)db[tabela][ix]={...db[tabela][ix],...l}; else db[tabela].push({id:uid(),...l});
      }
      return resp(201,(req.headers.prefer||'').includes('return=minimal')?null:linhas);
    }

    if(req.method==='PATCH'){
      const alvo=filtra(tabela,params,quem);
      const podem=alvo.filter(l=>podeEscrever(quem,tabela,l)
        // cada um pode mudar o seu próprio nome e função
        ||(tabela==='membros_equipa'&&l.user_id===quem
           &&Object.keys(body).every(k=>['nome','funcao_habitual'].includes(k))));
      for(const l of podem)Object.assign(l,body);
      return resp(200,(req.headers.prefer||'').includes('return=minimal')?null:podem);
    }

    if(req.method==='DELETE'){
      const alvo=filtra(tabela,params,quem).filter(l=>podeEscrever(quem,tabela,l));
      const ids=new Set(alvo.map(l=>l.id));
      const quando=Date.now();
      const paraLixo=(t,l)=>{ if(COM_LIXO.includes(t))db.lixo.push({id:uid(),equipa_id:l.equipa_id,tabela:t,registo:{...l},
        grupo:t==='jogos'?l.id:t==='participacoes'?l.jogo_id:null,apagado_em:quando,apagado_por:quem}); };
      alvo.forEach(l=>paraLixo(tabela,l));
      if(tabela==='jogos')db.participacoes.filter(p=>ids.has(p.jogo_id)).forEach(p=>paraLixo('participacoes',p));
      db[tabela]=db[tabela].filter(l=>!ids.has(l.id));
      // apagar uma época leva tudo o que tem epoca_id (on delete cascade)
      if(tabela==='epocas'){
        const jogosIds=new Set(db.jogos.filter(j=>ids.has(j.epoca_id)).map(j=>j.id));
        db.participacoes.filter(p=>jogosIds.has(p.jogo_id)).forEach(p=>paraLixo('participacoes',p));
        db.participacoes=db.participacoes.filter(p=>!jogosIds.has(p.jogo_id));
        for(const t of ['tabela_valores','almocos','jogos','despesas','multas','pagamentos','fundo_gastos']){
          db[t].filter(l=>ids.has(l.epoca_id)).forEach(l=>paraLixo(t,l));
          db[t]=db[t].filter(l=>!ids.has(l.epoca_id));
        }
      }
      if(tabela==='equipas')for(const t of ['membros_equipa','epocas','tabela_valores','almocos',
        'artigos_multa','jogos','participacoes','despesas','multas','pagamentos','fundo_gastos','distancias','lixo'])
        db[t]=db[t].filter(l=>!ids.has(l.equipa_id));
      if(tabela==='jogos')db.participacoes=db.participacoes.filter(p=>!ids.has(p.jogo_id));
      return resp(204,null);
    }
    resp(405,{message:'método não suportado'});
  });

  return new Promise(res=>{
    srv.listen(porta,'127.0.0.1',()=>{
      const p=srv.address().port;
      res({
        url:'http://127.0.0.1:'+p, porta:p, db, estado,
        desligaRede:()=>{estado.offline=true;},
        ligaRede:()=>{estado.offline=false;},
        falhaComecom:(codigo,corpo)=>{estado.falhaProxima={codigo,corpo};},
        exigeConfirmacao:(v=true)=>{estado.exigeConfirmacao=v;},
        fecha:()=>new Promise(r=>srv.close(r))
      });
    });
  });
}

/* Modo linha de comandos: `node tests/mock-supabase.mjs [porta]`.
   É assim que o correr.mjs o levanta, uma vez para todas as suítes. */
if(import.meta.url===`file://${process.argv[1]}`){
  const porta=Number(process.argv[2]||8123);
  const m=await criaMock(porta);
  console.log('mock-supabase em '+m.url);
  process.on('SIGTERM',()=>m.fecha().then(()=>process.exit(0)));
}
