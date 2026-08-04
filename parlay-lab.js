const legsEl = document.getElementById('legs');
const stakeEl = document.getElementById('stake');
const STORAGE_KEY = 'triple-threat-parlay-lab-v3';
const DEFAULT_FEED_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTUgynZkMlV0EmiCfbuxUoIw6C9_dHoYByxdKwWFnBoUeHUnompM-_FJ4sD_fBfVlX3PcsjhAIQVno4/pub?gid=955945205&single=true&output=csv';
let legs = [];
let candidates = [];
let hasURLLegs = false;
let lastSuggestions = [];
let comboPage = 0;
let evaluatedCombinationCount = 0;
let passingCombinationCount = 0;

function finite(v){ return Number.isFinite(Number(v)); }
function clamp(v,min,max){ return Math.min(max,Math.max(min,v)); }
function esc(value){ return String(value ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function pct(v,d=1){ return finite(v) ? `${(Number(v)*100).toFixed(d)}%` : '—'; }
function pp(v,d=1){ return finite(v) ? `${Number(v)>=0?'+':''}${(Number(v)*100).toFixed(d)} pts` : '—'; }
function money(v){ return finite(v) ? `${Number(v)<0?'−':''}$${Math.abs(Number(v)).toFixed(2)}` : '—'; }

function americanToDecimal(o){
  o=Number(o); if(!finite(o)||o===0||(o>-100&&o<100)) return NaN;
  return o>0 ? 1+o/100 : 1+100/Math.abs(o);
}
function decimalToAmerican(d){
  d=Number(d); if(!finite(d)||d<=1) return NaN;
  return d<2 ? -Math.round(100/(d-1)) : Math.round((d-1)*100);
}
function probabilityToAmerican(p){
  p=Number(p); if(!finite(p)||p<=0||p>=1) return NaN;
  return p>=.5 ? -Math.round(100*p/(1-p)) : Math.round(100*(1-p)/p);
}
function fmtAmerican(v){ v=Math.round(Number(v)); return finite(v)?`${v>0?'+':''}${v}`:'—'; }
function parsePercent(value){
  const raw=String(value??'').trim().replace(/,/g,''); if(!raw) return NaN;
  const n=Number(raw.replace('%','')); if(!finite(n)) return NaN;
  return raw.includes('%')||Math.abs(n)>1 ? n/100 : n;
}
function validLeg(l){
  const d=americanToDecimal(l.odds),p=Number(l.prob)/100;
  return finite(d)&&p>0&&p<1;
}
function legBE(l){ const d=americanToDecimal(l.odds); return finite(d)?1/d:NaN; }
function adjustedLegProbability(l,trust){
  const model=Number(l.prob)/100;
  const base=finite(l.noVig)&&l.noVig>0&&l.noVig<1 ? Number(l.noVig) : model;
  return clamp(base+trust*(model-base),.001,.999);
}

function saveState(){
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({legs,candidates,stake:Number(stakeEl.value)||0,bankroll:Number(document.getElementById('bankroll').value)||0,unitSize:Number(document.getElementById('unitSize').value)||0,kellyFraction:Number(document.getElementById('kellyFraction').value)||.25,maxUnits:Number(document.getElementById('maxUnits').value)||0})); } catch(_){}
}
function loadState(){
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved){
      legs=Array.isArray(saved.legs)?saved.legs.slice(0,6):[];
      candidates=Array.isArray(saved.candidates)?saved.candidates.slice(0,250):[];
      if(finite(saved.stake)) stakeEl.value=saved.stake;
      if(finite(saved.bankroll)) document.getElementById('bankroll').value=saved.bankroll;
      if(finite(saved.unitSize)&&saved.unitSize>0) document.getElementById('unitSize').value=saved.unitSize;
      if(finite(saved.kellyFraction)&&saved.kellyFraction>0) document.getElementById('kellyFraction').value=saved.kellyFraction;
      if(finite(saved.maxUnits)) document.getElementById('maxUnits').value=saved.maxUnits;
    }
  } catch(_){}
}

function applyURLParameters(){
  const q=new URLSearchParams(window.location.search);
  const setNumber=(param,id,min=0)=>{const v=Number(q.get(param));if(q.has(param)&&finite(v)&&v>=min)document.getElementById(id).value=v;};
  setNumber('stake','stake',0);setNumber('bankroll','bankroll',0);setNumber('unit','unitSize',.01);setNumber('max_units','maxUnits',0);setNumber('min_edge','minEdge',-100);
  const trust=q.get('trust');if(['0.5','0.75','1'].includes(trust))document.getElementById('modelTrust').value=trust;
  const kelly=q.get('kelly');if(['0.125','0.25','0.5'].includes(kelly))document.getElementById('kellyFraction').value=kelly;
  const combo=q.get('combo_size');if(['2','3','4','5','6'].includes(combo))document.getElementById('comboSize').value=combo;
  const same=q.get('same_match');if(['exclude','review'].includes(same))document.getElementById('sameMatch').value=same;
  const urlLegs=[];
  for(let i=1;i<=6;i++){
    const pick=q.get(`l${i}_pick`),odds=Number(q.get(`l${i}_odds`)),prob=parsePercent(q.get(`l${i}_prob`));
    if(!pick||!finite(odds)||!(prob>0&&prob<1))continue;
    const market=q.get(`l${i}_market`)||'',matchId=q.get(`l${i}_match`)||'',noVig=parsePercent(q.get(`l${i}_novig`));
    urlLegs.push({desc:market?`${market}: ${pick}`:pick,market,matchId,odds,prob:Number((prob*100).toFixed(3)),noVig:finite(noVig)?noVig:undefined});
  }
  if(urlLegs.length){legs=urlLegs;hasURLLegs=true;}
}

function parseCSV(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;}
    else if(ch==='"')quoted=!quoted;
    else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&next==='\n')i++;
      row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';
    } else cell+=ch;
  }
  row.push(cell);if(row.some(v=>v!==''))rows.push(row);return rows;
}

function setCandidatePool(parsed){
  const unique=[],seen=new Set();
  for(const c of parsed){const key=c.id.toLowerCase();if(!seen.has(key)){seen.add(key);unique.push(c);}}
  candidates=unique;
  legs=legs.map(l=>{
    if(l.sourceId){const current=candidates.find(c=>c.id===l.sourceId);return current?candidateToLeg(current):null;}
    if(hasURLLegs){
      const current=candidates.find(c=>c.matchId===l.matchId&&String(c.market).toLowerCase()===String(l.market).toLowerCase()&&(c.desc.includes(l.desc)||l.desc.includes(c.pick)));
      return current?candidateToLeg(current):l;
    }
    return null;
  }).filter(Boolean).slice(0,6);
  saveState();renderCandidates();renderLegs();
  return unique.length;
}

async function loadPublishedFeed(){
  const status=document.getElementById('feedStatus');status.textContent='Loading Google Sheet…';status.className='import-status';
  try{
    if(window.location.protocol==='file:')throw new Error('Live feed is blocked in local-file mode. Test the HTTPS GitHub Pages URL.');
    const q=new URLSearchParams(window.location.search),feed=q.get('feed')||DEFAULT_FEED_URL;
    if(!/^https:\/\//i.test(feed))throw new Error('Feed URL must use HTTPS.');
    const separator=feed.includes('?')?'&':'?';
    const response=await fetch(`${feed}${separator}_=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`Google Sheet returned ${response.status}.`);
    const rows=parseCSV(await response.text()),parsed=[];
    rows.slice(1).forEach((row,i)=>{const c=parseCandidateLine(row.join('\t'),i);if(c)parsed.push(c);});
    if(!parsed.length)throw new Error('No valid Market Edge rows were found in columns A:L.');
    const count=setCandidatePool(parsed);
    status.textContent=`Live feed loaded: ${count} unique candidates · ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
  }catch(error){
    status.textContent=`Feed unavailable: ${error.message} ${candidates.length?'Showing the last saved feed.':''}`;status.className='import-status error';
  }
}

function parseCandidateLine(line,index){
  const c=line.split('\t').map(v=>v.trim());
  if(!c.length) return null;
  let x;
  if(c.length>=12){
    if(/^matchid$/i.test(c[0])) return null;
    x={matchId:c[0],playerA:c[1],playerB:c[2],market:c[3],pick:c[4],be:parsePercent(c[5]),noVig:parsePercent(c[6]),model:parsePercent(c[7]),marketEdge:parsePercent(c[8]),confidence:c[9],fairOdds:Number(c[10]),beEdge:parsePercent(c[11])};
  } else if(c.length>=5){
    if(/^market$/i.test(c[0])) return null;
    x={matchId:'',playerA:'',playerB:'',market:c[0],pick:c[1],be:parsePercent(c[2]),noVig:parsePercent(c[3]),model:parsePercent(c[4]),rawEdge:NaN,confidence:'',fairOdds:NaN,beEdge:NaN};
  } else return null;
  if(!x.pick||/pass|no clear lean|no total projection/i.test(x.pick)||!(x.be>0&&x.be<1)||!(x.model>0&&x.model<1)) return null;
  x.rawEdge=finite(x.beEdge)?x.beEdge:x.model-x.be;
  x.odds=probabilityToAmerican(x.be);
  const eventLabel=x.playerA&&x.playerB?`${x.playerA} vs ${x.playerB}`:x.matchId;
  x.desc=`${x.market}: ${x.pick}${eventLabel?` — ${eventLabel}`:''}`;
  x.id=x.matchId?`${x.matchId}|${x.market}|${x.pick}`:`row-${index}|${x.market}|${x.pick}|${x.odds}`;
  return x;
}

function candidateToLeg(c){
  return {sourceId:c.id,matchId:c.matchId,market:c.market,desc:c.desc,odds:c.odds,prob:Number((c.model*100).toFixed(3)),noVig:c.noVig,confidence:c.confidence,rawEdge:c.rawEdge};
}

function renderCandidates(){
  const term=document.getElementById('candidateSearch').value.trim().toLowerCase();
  const filtered=candidates.filter(c=>!term||[c.matchId,c.playerA,c.playerB,c.market,c.pick].join(' ').toLowerCase().includes(term));
  document.getElementById('poolCount').textContent=`${candidates.length} candidate${candidates.length===1?'':'s'}`;
  const selected=new Set(legs.map(l=>l.sourceId).filter(Boolean));
  document.getElementById('candidateList').innerHTML=filtered.length?filtered.map(c=>`
    <label class="candidate">
      <input type="checkbox" data-candidate="${esc(c.id)}" ${selected.has(c.id)?'checked':''}>
      <span><span class="candidate-name">${esc(c.desc)}</span><span class="candidate-meta">${esc(c.matchId||'No MatchID')} · BE ${pct(c.be)} · model ${pct(c.model)}${c.confidence?` · conf ${esc(c.confidence)}`:''}</span></span>
      <span class="candidate-edge ${c.rawEdge<0?'neg':''}">${pp(c.rawEdge)}</span>
    </label>`).join(''):'<div class="empty">No candidates match this filter.</div>';
}

function renderLegs(){
  legsEl.innerHTML='';
  legs.forEach((leg,i)=>{
    const be=legBE(leg),p=Number(leg.prob)/100,edge=p-be;
    const row=document.createElement('div'); row.className='leg';
    row.innerHTML=`
      <div class="field desc"><label>Description</label><input type="text" value="${esc(leg.desc)}" readonly></div>
      <div class="field"><label>Odds (US)</label><input class="${finite(be)?'':'invalid'}" type="number" value="${esc(leg.odds)}" readonly></div>
      <div class="field"><label>Model Prob %</label><input class="${p>0&&p<1?'':'invalid'}" type="number" value="${esc(leg.prob)}" readonly></div>
      <div class="field"><label>BE / leg edge</label><input type="text" value="${pct(be)} / ${pp(edge)}" disabled title="Breakeven ${pct(be)}; leg edge ${pp(edge)}"></div><div></div>`;
    const rm=document.createElement('button');rm.className='rm';rm.textContent='×';rm.setAttribute('aria-label',`Remove ${leg.desc||`leg ${i+1}`}`);
    rm.addEventListener('click',()=>{legs.splice(i,1);saveState();renderLegs();renderCandidates();compute();});
    row.lastElementChild.replaceWith(rm);legsEl.appendChild(row);
  });
  compute();
}

function analyzeSlip(items,trust=1){
  if(!items.length||!items.every(validLeg)) return null;
  const decs=items.map(l=>americanToDecimal(l.odds));
  const raw=items.map(l=>Number(l.prob)/100);
  const adj=items.map(l=>adjustedLegProbability(l,trust));
  const dec=decs.reduce((a,b)=>a*b,1),be=1/dec;
  const rawAll=raw.reduce((a,b)=>a*b,1),adjAll=adj.reduce((a,b)=>a*b,1);
  let rawOne=0,adjOne=0;
  const contrib=[];
  items.forEach((l,i)=>{
    const r=(1-raw[i])*(rawAll/raw[i]),a=(1-adj[i])*(adjAll/adj[i]);
    rawOne+=r;adjOne+=a;contrib.push({desc:l.desc,raw:r,adj:a});
  });
  const matchCounts={}; items.forEach(l=>{if(l.matchId)matchCounts[l.matchId]=(matchCounts[l.matchId]||0)+1;});
  const duplicateMatches=Object.entries(matchCounts).filter(([,n])=>n>1).map(([id])=>id);
  const adjLegEdges=items.map((l,i)=>adj[i]-(1/decs[i]));
  return {items,decs,raw,adj,dec,be,rawAll,adjAll,rawOne,adjOne,rawTwo:Math.max(0,1-rawAll-rawOne),adjTwo:Math.max(0,1-adjAll-adjOne),rawEdge:rawAll-be,adjEdge:adjAll-be,rawROI:rawAll*dec-1,adjROI:adjAll*dec-1,contrib,duplicateMatches,adjLegEdges,ratio:adjAll?adjOne/adjAll:Infinity};
}

function classify(a){
  if(!a||a.items.length<2) return {label:'ADD LEGS',text:'Use two to six valid legs for parlay guidance.',color:'var(--sub)'};
  if(a.duplicateMatches.length) return {label:'CORRELATION REVIEW',text:'At least two legs share a MatchID. The independence calculation may materially misstate the real joint probability.',color:'var(--amber)'};
  if(a.adjLegEdges.some(e=>e<=0)||a.adjEdge<=0) return {label:'AVOID',text:'At least one leg or the full slip has no positive edge under the selected probability stress test.',color:'var(--neg)'};
  if(a.adjAll<.10||a.ratio>2) return {label:'SINGLES PREFERRED',text:'The individual edges may be positive, but stacking them creates a very fragile slip under the selected assumptions.',color:'var(--amber)'};
  if(Math.min(...a.adjLegEdges)>=.03&&a.adjROI>=.25&&a.ratio<=1.35) return {label:'STRONG',text:'Every leg remains positive after adjustment, with comparatively strong projected return and controlled fragility.',color:'var(--pos)'};
  if(a.adjROI>=.15&&a.ratio<=1.8) return {label:'GOOD',text:'Positive adjusted value with manageable relative fragility. Review model calibration and market overlap before using it.',color:'var(--pos)'};
  return {label:'OKAY / HIGH VARIANCE',text:'The slip remains positive under adjustment, but its hit rate or one-leg-miss burden calls for caution.',color:'var(--amber)'};
}

function compute(){
  saveState();
  const a=analyzeSlip(legs,1),stake=Number(stakeEl.value)||0;
  if(!a){
    ['oddsCombined','beCombined','probCombined','edgeCombined'].forEach(id=>document.getElementById(id).textContent='—');
    document.getElementById('decCombined').textContent=legs.length?'Fix highlighted inputs':'Add at least two legs';
    document.getElementById('edgeNote').textContent='';document.getElementById('bars').innerHTML='';document.getElementById('missLegs').innerHTML='';
    renderGuidance(null);renderSizing(null);return;
  }
  const profit=stake*(a.dec-1),ret=stake*a.dec,ev=stake*a.rawROI;
  document.getElementById('oddsCombined').textContent=fmtAmerican(decimalToAmerican(a.dec));
  document.getElementById('decCombined').textContent=`${a.dec.toFixed(2)} decimal · ${money(profit)} profit / ${money(ret)} return`;
  document.getElementById('beCombined').textContent=pct(a.be);
  document.getElementById('probCombined').textContent=pct(a.rawAll);
  const edgeEl=document.getElementById('edgeCombined');edgeEl.textContent=pp(a.rawEdge);edgeEl.className=`val ${a.rawEdge>=0?'pos':'neg'}`;
  document.getElementById('edgeNote').textContent=`EV: ${ev>=0?'+':''}${money(ev)} per ${money(stake)} staked · ROI ${pct(a.rawROI)}`;
  const rows=[['Hit every leg',a.rawAll,'var(--pos)'],['Miss by exactly one',a.rawOne,'var(--amber)'],['Miss by 2+ legs',a.rawTwo,'var(--neg)']];
  document.getElementById('bars').innerHTML=rows.map(r=>`<div class="bar-row"><div class="bl">${r[0]}</div><div class="bar-track"><div class="bar-fill" style="width:${clamp(r[1]*100,0,100).toFixed(1)}%;background:${r[2]}"></div></div><div class="bv">${pct(r[1])}</div></div>`).join('');
  const total=a.contrib.reduce((s,x)=>s+x.raw,0)||1;
  document.getElementById('missLegs').innerHTML=[...a.contrib].sort((x,y)=>y.raw-x.raw).map(x=>`<div class="mleg-row"><span class="who">${esc(x.desc)}</span><span class="pct">${pct(x.raw/total)} of one-leg misses</span></div>`).join('');
  renderGuidance(a);
  renderSizing(a);
}

function renderSizing(rawAnalysis){
  const unit=Number(document.getElementById('unitSize').value),bankroll=Number(document.getElementById('bankroll').value),fraction=Number(document.getElementById('kellyFraction').value),cap=Number(document.getElementById('maxUnits').value),stake=Number(stakeEl.value)||0;
  const actualUnits=unit>0?stake/unit:NaN;
  document.getElementById('actualStakeSize').textContent=unit>0?`${money(stake)} · ${actualUnits.toFixed(2)}u`:'—';
  if(!rawAnalysis||!(unit>0)||!(bankroll>0)||!(fraction>0)||cap<0){
    document.getElementById('recommendedSize').textContent='—';
    document.getElementById('recommendedUnits').textContent='Enter a valid bankroll, unit size, and slip.';
    document.getElementById('stakeComparison').textContent='';return;
  }
  const trust=Number(document.getElementById('modelTrust').value)||1;
  const a=analyzeSlip(legs,trust);
  if(a.duplicateMatches.length){
    document.getElementById('recommendedSize').textContent='REVIEW';
    document.getElementById('recommendedUnits').textContent='No sizing recommendation while same-event correlation is unresolved.';
    document.getElementById('stakeComparison').textContent='Your stake is shown for comparison only.';return;
  }
  const b=a.dec-1;
  const fullKelly=b>0?Math.max(0,(a.adjAll*a.dec-1)/b):0;
  const fractionalKelly=fullKelly*fraction;
  const uncappedDollars=fractionalKelly*bankroll;
  const uncappedUnits=uncappedDollars/unit;
  const units=Math.max(0,Math.min(cap,uncappedUnits));
  const dollars=units*unit;
  document.getElementById('recommendedSize').textContent=`${money(dollars)} · ${units.toFixed(2)}u`;
  document.getElementById('recommendedUnits').textContent=a.adjROI<=0?'Adjusted edge is not positive, so the calculated size is zero.':`${Math.round(fraction*100)}% Kelly suggests ${uncappedUnits.toFixed(2)}u before the ${cap.toFixed(2)}u cap. Adjusted hit ${pct(a.adjAll)}; adjusted ROI ${pct(a.adjROI)}.`;
  const diff=actualUnits-units;
  document.getElementById('stakeComparison').textContent=!finite(actualUnits)?'Enter a valid unit size.':Math.abs(diff)<.01?'Your stake matches the capped estimate.':diff>0?`Your stake is ${diff.toFixed(2)}u above the estimate.`:`Your stake is ${Math.abs(diff).toFixed(2)}u below the estimate.`;
}

function renderGuidance(rawAnalysis){
  const trust=Number(document.getElementById('modelTrust').value)||1;
  const a=rawAnalysis?analyzeSlip(legs,trust):null,q=classify(a);
  const badge=document.getElementById('guidanceBadge');badge.textContent=q.label;badge.style.background=q.color;
  document.getElementById('guidanceText').textContent=a?`${q.text} Adjusted hit ${pct(a.adjAll)}, adjusted breakeven edge ${pp(a.adjEdge)}, adjusted ROI ${pct(a.adjROI)}, miss-one/win ratio ${a.ratio.toFixed(2)}.`:q.text;
  const warnings=[];
  if(a?.duplicateMatches.length) warnings.push(`Shared MatchID: ${a.duplicateMatches.join(', ')}`);
  if(a?.adjLegEdges.some(e=>e<=0)) warnings.push('One or more legs loses its positive edge under the selected Model Trust setting.');
  if(a&&a.items.length>6) warnings.push('The tool is designed for no more than six legs.');
  document.getElementById('warningList').innerHTML=warnings.map(w=>`<div>⚠ ${esc(w)}</div>`).join('');
  const impact=document.getElementById('impactAnalysis');
  if(!a||legs.length<2){impact.innerHTML='<div class="empty">Add at least two valid legs.</div>';return;}
  const rows=legs.map((l,i)=>{
    const reduced=analyzeSlip(legs.filter((_,j)=>j!==i),trust);
    return {name:l.desc,hit:reduced.rawAll,edge:reduced.rawEdge,ratio:reduced.ratio,delta:reduced.rawAll-a.rawAll};
  }).sort((x,y)=>y.delta-x.delta);
  impact.innerHTML=`<table class="impact-table"><thead><tr><th>Remove leg</th><th>New hit</th><th>Hit change</th><th>New edge</th><th>Miss-one/win</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${pct(r.hit)}</td><td>${pp(r.delta)}</td><td>${pp(r.edge)}</td><td>${finite(r.ratio)?r.ratio.toFixed(2):'—'}</td></tr>`).join('')}</tbody></table>`;
}

function comboScore(a){
  const minEdge=Math.min(...a.adjLegEdges),maxCulprit=Math.max(...a.contrib.map(x=>x.adj/(a.adjOne||1)));
  return 100*(.38*clamp(a.adjROI/.6,0,1)+.27*clamp(a.adjAll/.55,0,1)+.22*clamp(minEdge/.10,0,1)+.13*(1-maxCulprit));
}
function combinations(arr,k,limit=75000){
  const out=[],pick=[];
  function walk(start){
    if(out.length>=limit)return;
    if(pick.length===k){out.push(pick.slice());return;}
    for(let i=start;i<=arr.length-(k-pick.length);i++){pick.push(arr[i]);walk(i+1);pick.pop();if(out.length>=limit)return;}
  }
  walk(0);return out;
}
function rankCombinations(){
  const size=Number(document.getElementById('comboSize').value),trust=Number(document.getElementById('modelTrust').value),min=Number(document.getElementById('minEdge').value||0)/100,mode=document.getElementById('sameMatch').value,marketMix=document.getElementById('marketMix').value,sortMode=document.getElementById('comboSort').value,diversityMode=document.getElementById('resultDiversity').value;
  const eligible=candidates.filter(c=>c.rawEdge>=min&&validLeg(candidateToLeg(c))).sort((a,b)=>(adjustedLegProbability(candidateToLeg(b),trust)-b.be)-(adjustedLegProbability(candidateToLeg(a),trust)-a.be)).slice(0,22);
  if(eligible.length<size){lastSuggestions=[];document.getElementById('suggestions').innerHTML=`<div class="empty">Only ${eligible.length} eligible candidates remain; ${size} are required.</div>`;document.getElementById('comboPageStatus').textContent='';return;}
  const sets=combinations(eligible,size);
  evaluatedCombinationCount=sets.length;
  const ranked=sets.map(set=>{
    const analysis=analyzeSlip(set.map(candidateToLeg),trust);
    if(mode==='exclude'&&analysis.duplicateMatches.length)return null;
    const markets=new Set(set.map(c=>String(c.market).toLowerCase()));
    if(marketMix==='mixed'&&markets.size<2)return null;
    if(['ML','Spread','Total'].includes(marketMix)&&set.some(c=>String(c.market).toLowerCase()!==marketMix.toLowerCase()))return null;
    return {set,analysis,score:comboScore(analysis),quality:classify(analysis)};
  }).filter(Boolean);
  passingCombinationCount=ranked.length;
  const comparators={score:(a,b)=>b.score-a.score,hit:(a,b)=>b.analysis.adjAll-a.analysis.adjAll||b.score-a.score,roi:(a,b)=>b.analysis.adjROI-a.analysis.adjROI||b.score-a.score,fragility:(a,b)=>a.analysis.ratio-b.analysis.ratio||b.score-a.score};
  ranked.sort(comparators[sortMode]||comparators.score);
  if(diversityMode==='diverse'){
    const maxShared=Math.floor(size/2),chosen=[];
    for(const item of ranked){
      const ids=new Set(item.set.map(c=>c.id));
      if(chosen.every(existing=>existing.set.reduce((n,c)=>n+(ids.has(c.id)?1:0),0)<=maxShared))chosen.push(item);
      if(chosen.length>=25)break;
    }
    lastSuggestions=chosen;
  } else lastSuggestions=ranked.slice(0,25);
  comboPage=0;renderSuggestionPage();
}

function renderSuggestionPage(){
  const perPage=Number(document.getElementById('resultsPerPage').value)||6,total=lastSuggestions.length,maxPage=Math.max(0,Math.ceil(total/perPage)-1);
  comboPage=clamp(comboPage,0,maxPage);
  const start=comboPage*perPage,page=lastSuggestions.slice(start,start+perPage),capNote=evaluatedCombinationCount>=75000?' Search capped at 75,000 combinations.':'';
  document.getElementById('suggestions').innerHTML=page.length?page.map((s,i)=>`
    <div class="suggestion"><div class="grade">${esc(s.quality.label)}</div><div><div class="suggestion-title">${s.set.map(c=>esc(c.desc)).join(' + ')}</div><div class="suggestion-meta">score ${s.score.toFixed(1)} · adj hit ${pct(s.analysis.adjAll)} · adj ROI ${pct(s.analysis.adjROI)} · miss-one/win ${s.analysis.ratio.toFixed(2)}${s.analysis.duplicateMatches.length?' · correlation review':''}</div></div><div class="suggestion-stat">BE ${pct(s.analysis.be)}<br>edge ${pp(s.analysis.adjEdge)}</div><button class="secondary" data-use-combo="${start+i}">Use parlay</button></div>`).join(''):`<div class="empty">No combinations passed the selected rules.</div>`;
  const showingEnd=Math.min(start+page.length,total),diverse=document.getElementById('resultDiversity').value==='diverse',browseNote=diverse?` Showing up to 25 diversified suggestions from ${passingCombinationCount.toLocaleString()} passing combinations.`:(passingCombinationCount>25?' Showing the top 25 under the selected sort.':'');
  document.getElementById('comboPageStatus').textContent=total?`Showing ${start+1}–${showingEnd} of ${passingCombinationCount.toLocaleString()} passing combinations · ${evaluatedCombinationCount.toLocaleString()} evaluated.${capNote}${browseNote}`:`${evaluatedCombinationCount.toLocaleString()} evaluated; none passed.`;
  document.getElementById('prevCombos').disabled=comboPage===0;
  document.getElementById('nextCombos').disabled=comboPage>=maxPage;
}

document.getElementById('candidateList').addEventListener('change',e=>{
  const id=e.target.dataset.candidate;if(!id)return;
  if(e.target.checked){
    if(legs.length>=6){e.target.checked=false;document.getElementById('feedStatus').textContent='Maximum six legs.';return;}
    const c=candidates.find(x=>x.id===id);if(c&&!legs.some(l=>l.sourceId===id))legs.push(candidateToLeg(c));
  } else legs=legs.filter(l=>l.sourceId!==id);
  saveState();renderLegs();renderCandidates();
});
document.getElementById('candidateSearch').addEventListener('input',renderCandidates);
document.getElementById('clearSelection').addEventListener('click',()=>{legs=legs.filter(l=>!l.sourceId);saveState();renderLegs();renderCandidates();});
document.getElementById('clearSlip').addEventListener('click',()=>{legs=[];saveState();renderLegs();renderCandidates();});
document.getElementById('refreshFeed').addEventListener('click',loadPublishedFeed);
document.getElementById('findCombos').addEventListener('click',rankCombinations);
document.getElementById('prevCombos').addEventListener('click',()=>{if(comboPage>0){comboPage--;renderSuggestionPage();}});
document.getElementById('nextCombos').addEventListener('click',()=>{const per=Number(document.getElementById('resultsPerPage').value)||6;if((comboPage+1)*per<lastSuggestions.length){comboPage++;renderSuggestionPage();}});
document.getElementById('resultsPerPage').addEventListener('change',()=>{comboPage=0;renderSuggestionPage();});
document.getElementById('comboSort').addEventListener('change',()=>{if(evaluatedCombinationCount)rankCombinations();});
document.getElementById('resultDiversity').addEventListener('change',()=>{if(evaluatedCombinationCount)rankCombinations();});
document.getElementById('suggestions').addEventListener('click',e=>{
  const idx=e.target.dataset.useCombo;if(idx===undefined)return;
  const s=lastSuggestions[Number(idx)];if(!s)return;legs=s.set.map(candidateToLeg);saveState();renderLegs();renderCandidates();document.querySelector('.stake-row').scrollIntoView({behavior:'smooth'});
});
document.getElementById('modelTrust').addEventListener('change',()=>{compute();if(lastSuggestions.length)rankCombinations();});
stakeEl.addEventListener('input',compute);
['bankroll','unitSize','kellyFraction','maxUnits'].forEach(id=>document.getElementById(id).addEventListener('input',compute));

loadState();applyURLParameters();if(!hasURLLegs)legs=legs.filter(l=>l.sourceId);renderCandidates();renderLegs();loadPublishedFeed();
