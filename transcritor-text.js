// Central PCPR — Transcritor: utilitários puros de texto.
// Mantidos em módulo separado para permitir testes automatizados e reuso.
// Nenhuma dependência de DOM ou de rede: apenas processamento de string.

export function normWord(w){
  return String(w||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9çÇ]/g,'').toLowerCase();
}

// Colapsa repetições típicas de alucinação do Whisper (palavra/frase repetida em
// sequência), preservando ênfase natural. Palavra isolada só é colapsada a partir
// de 4 repetições; frases (2+ palavras) a partir de 3 repetições consecutivas.
export function collapseRepetitions(input){
  const raw=String(input||'');
  if(!raw.trim())return raw.trim();
  const tokens=raw.split(/\s+/).filter(Boolean);
  const norm=tokens.map(normWord);
  const N=tokens.length;
  const out=[];
  let i=0;
  while(i<N){
    let collapsed=false;
    // Janelas curtas primeiro: uma palavra repetida deve colapsar como palavra,
    // não como sub-frase de duas palavras.
    for(let w=1;w<=8;w++){
      if(i+2*w>N)continue;
      let reps=1;
      while(i+(reps+1)*w<=N){
        let same=true;
        for(let j=0;j<w;j++){ if(norm[i+j]!==norm[i+reps*w+j]){same=false;break} }
        if(!same)break;
        reps++;
      }
      const threshold=w===1?4:3;
      if(reps>=threshold){
        for(let j=0;j<w;j++)out.push(tokens[i+j]);
        i+=reps*w;
        collapsed=true;
        break;
      }
    }
    if(!collapsed){ out.push(tokens[i]); i++; }
  }
  return out.join(' ');
}

// Remove anotações de não-fala que o Whisper costuma alucinar em silêncio/ruído
// (ex.: "[música]", "(aplausos)", "♪"), preservando o conteúdo falado real.
export function stripNonSpeech(t){
  let s=String(t||'');
  s=s.replace(/[♪♫\u2669-\u266F]+/g,' ');
  s=s.replace(/[\[(]\s*(m[úu]sica|music|aplausos?|applause|palmas|risos?|laughter|suspiros?|inaud[íi]vel|inaudible|ru[íi]dos?|noise|sil[êe]ncio|silence|blank[_ ]?audio|no[_ ]?speech|vinheta|trilha(?:\s+sonora)?|ao\s+fundo)\s*[\])]/gi,' ');
  return s.replace(/\s+/g,' ').trim();
}

export function cleanupText(t){
  t=stripNonSpeech(t);
  t=collapseRepetitions(t);
  t=t.replace(/\s+/g,' ').trim();
  if(!t)return '';
  t=t.charAt(0).toUpperCase()+t.slice(1);
  if(!/[.!?…]$/.test(t))t+='.';
  return t.replace(/\s+([,.;!?])/g,'$1');
}

export function sentenceSplit(t){
  return cleanupText(t).split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/).map(s=>s.trim()).filter(Boolean);
}

// Une dois blocos consecutivos removendo a sobreposição (janela de 3 a 28 palavras),
// comparando de forma tolerante a acentos/pontuação para evitar duplicação ou perda.
export function mergeWithOverlap(base,next){
  base=String(base||'').trim(); next=String(next||'').trim();
  if(!base)return next;if(!next)return base;
  const a=base.split(/\s+/),b=next.split(/\s+/);let best=0;
  const max=Math.min(28,a.length,b.length);
  for(let k=max;k>=3;k--){
    let ok=true;
    for(let i=0;i<k;i++){if(normWord(a[a.length-k+i])!==normWord(b[i])){ok=false;break}}
    if(ok){best=k;break}
  }
  const tail=best?b.slice(best).join(' '):next;
  return (base+(tail?' '+tail:'')).trim();
}

export function thirdPersonSentence(s){
  let t=String(s||'').trim();
  const reps=[
    [/\b[Ee]u\s+fui\b/g,'foi'],[/\b[Ee]u\s+vi\b/g,'viu'],[/\b[Ee]u\s+ouvi\b/g,'ouviu'],[/\b[Ee]u\s+recebi\b/g,'recebeu'],[/\b[Ee]u\s+fiz\b/g,'fez'],[/\b[Ee]u\s+disse\b/g,'disse'],[/\b[Ee]u\s+falei\b/g,'falou'],[/\b[Ee]u\s+liguei\b/g,'ligou'],[/\b[Ee]u\s+enviei\b/g,'enviou'],[/\b[Ee]u\s+mandei\b/g,'mandou'],[/\b[Ee]u\s+peguei\b/g,'pegou'],[/\b[Ee]u\s+deixei\b/g,'deixou'],[/\b[Ee]u\s+cheguei\b/g,'chegou'],[/\b[Ee]u\s+saí\b/g,'saiu'],[/\b[Ee]u\s+entrei\b/g,'entrou'],[/\b[Ee]u\s+comprei\b/g,'comprou'],[/\b[Ee]u\s+vendi\b/g,'vendeu'],[/\b[Ee]u\s+dei\b/g,'deu'],[/\b[Ee]u\s+tenho\b/g,'tem'],[/\b[Ee]u\s+tinha\b/g,'tinha'],[/\b[Ee]u\s+estava\b/g,'estava'],[/\b[Ee]u\s+estou\b/g,'está'],[/\b[Ee]u\s+sou\b/g,'é'],[/\b[Ee]u\s+era\b/g,'era'],[/\b[Ee]u\s+quero\b/g,'quer'],[/\b[Ee]u\s+queria\b/g,'queria'],[/\b[Ee]u\s+acho\b/g,'acha'],[/\b[Ee]u\s+acredito\b/g,'acredita'],[/\b[Ee]u\s+lembro\b/g,'lembra']
  ];
  for(const [a,b] of reps)t=t.replace(a,b);
  t=t.replace(/^eu\s+/i,'').replace(/\bmeu\b/gi,'seu').replace(/\bminha\b/gi,'sua').replace(/\bmeus\b/gi,'seus').replace(/\bminhas\b/gi,'suas');
  return t.charAt(0).toLowerCase()+t.slice(1);
}

export function makeThirdPersonText(text,name,role){
  name=String(name||'').trim().toUpperCase();
  role=String(role||'').trim().toLowerCase();
  const prefix=name?`${name}, ouvido(a) na condição de ${role}, relatou que `:`A pessoa ouvida, na condição de ${role}, relatou que `;
  const ss=sentenceSplit(text).map(thirdPersonSentence).filter(Boolean);
  if(!ss.length)return '';
  let body=ss.join(' '); body=body.charAt(0).toLowerCase()+body.slice(1);
  return prefix+body;
}

export function makeDepositionText(text){
  const ss=sentenceSplit(text).map(thirdPersonSentence).map(s=>s.replace(/[.]+$/,'').trim()).filter(Boolean);
  if(!ss.length)return '';
  return ss.map((s,i)=>(i===0?'DECLARA que ':'QUE ')+s+';').join('\n\n').replace(/;$/,'.');
}
