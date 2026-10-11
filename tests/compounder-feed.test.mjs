import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeTennisCsv,normalizeWnbaCsv,readBytes,TENNIS_SOURCE_SHA256} from '../scripts/compounder-feed-lib.mjs';

const tennisPath=process.env.TENNIS_COMPOUNDER_SOURCE;
const wnbaPath=process.env.WNBA_COMPOUNDER_SOURCE;
if(!tennisPath||!wnbaPath)throw new Error('Set TENNIS_COMPOUNDER_SOURCE and WNBA_COMPOUNDER_SOURCE.');
const tennis=normalizeTennisCsv(readBytes(tennisPath),{expectedSha256:TENNIS_SOURCE_SHA256});
const wnba=normalizeWnbaCsv(readBytes(wnbaPath));

test('authoritative source values and event identities are preserved',()=>{
  assert.equal(tennis.length,49);assert.equal(wnba.length,6);
  const t=tennis.find(row=>row.marketId.includes('kal-kar-1012|v2-ml-92b8e4da25b7|sonay-kartal'));
  assert.ok(t);assert.equal(t.eventId,null);assert.equal(t.matchId,'KAL_KAR_1012');assert.equal(t.sportsbookAmericanOdds,-172);assert.equal(t.modelProbability,0.6808568460987379);
  const w=wnba.find(row=>row.marketId==='4bd87682231cb239405d');assert.ok(w);assert.equal(w.eventId,'401918299');assert.equal(w.sportsbookAmericanOdds,-161);assert.equal(w.modelProbability,.6954);assert.equal(w.expectedValuePerUnit,null);
});

test('LBG eligibility allows matching overpriced Pass and rejects opposite directions',()=>{
  const overpriced=tennis.filter(row=>row.straightBetClassification==='PASS'&&row.passReasonCode==='OVERPRICED');
  assert.ok(overpriced.length>0);assert.ok(overpriced.every(row=>row.compounderEligibility==='ELIGIBLE'));
  assert.ok(tennis.every(row=>row.modelProbability>=.5));assert.ok(wnba.every(row=>row.modelProbability>=.5));
});

test('consumer math, handoff and same-event protections remain intact',()=>{
  const source=fs.readFileSync(new URL('../parlay-lab.js',import.meta.url),'utf8');
  const prefix=source.split("document.getElementById('candidateList').addEventListener")[0];
  const stub={value:'',innerHTML:'',textContent:'',className:'',style:{},addEventListener(){}};
  const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{...stub,style:{}});return elements.get(id)};element('modelTrust').value='0.75';
  const requested=tennis[0].marketId;
  const context={document:{getElementById:element},localStorage:{getItem(){return null},setItem(){}},window:{location:{search:`?market_id=${encodeURIComponent(requested)}`,protocol:'https:'}},URLSearchParams,Intl,Date,console};
  vm.runInNewContext(prefix+`
    const normalized=${JSON.stringify([...tennis,...wnba])}.map(normalizeMarketRecord).filter(Boolean);
    if(normalized.length!==55)throw Error('normalized count');
    const same=analyzeSlip(normalized.filter(row=>row.matchId===normalized[0].matchId).slice(0,2).map(candidateToLeg),.75);
    if(same.duplicateMatches.length!==1)throw Error('same-event detection');
    const counts={2:231,3:1540,4:7315,5:26334,6:74613};for(const [k,n] of Object.entries(counts))if(combinations(Array.from({length:22},(_,i)=>i),Number(k)).length!==n)throw Error('combination '+k);
    applyURLParameters();if(pendingMarketId!==${JSON.stringify(requested)}||legs.length!==0)throw Error('market_id');
  `,context);
  assert.match(source,/if\(mode==='exclude'&&analysis\.duplicateMatches\.length\)return null/);
  assert.match(source,/No sizing recommendation while same-event correlation is unresolved/);
});
