import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../parlay-lab.js',import.meta.url),'utf8');
const prefix=source.split("document.getElementById('candidateList').addEventListener")[0];
const stub={value:'',innerHTML:'',textContent:'',className:'',style:{},addEventListener(){}};
const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{...stub,style:{}});return elements.get(id)};
const storage=new Map();
const context={document:{getElementById:element},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},window:{location:{search:'',protocol:'https:'}},URLSearchParams,Intl,Date,console};
vm.createContext(context);
vm.runInContext(prefix,context);

const market={selectionId:'event-1|market-1|Team A|',marketId:'market-1',eventId:'event-1',slateId:'TT-2026-10-15-A',boardDate:'2026-10-15',eventDate:'2026-10-16',eventStart:'2026-10-16T02:00:00Z',eventTimeZone:'UTC',sport:'WTA',marketType:'Moneyline',selection:'Team A moneyline',matchup:'Team A vs Team B',americanOdds:-110,modelProbability:.6,noVigProbability:.5,edge:.1,compounderEligibility:'ELIGIBLE',classification:'candidate',source:'Publisher',modelVersion:'v2'};
const envelope=(overrides={})=>({schemaVersion:'triple-threat-compounder-feed/1',boardDate:'2026-10-15',publishedAt:'2026-10-15T18:11:48.217Z',version:'db-1',markets:[market],...overrides});

test('Publisher selection identity, future event date, price and probability are preserved',()=>{
  const result=context.validatePublishedFeed(envelope());
  assert.equal(result.meta.eligibleCount,1);
  assert.equal(result.parsed[0].id,market.selectionId);
  assert.equal(result.parsed[0].eventDate,'2026-10-16');
  assert.equal(result.parsed[0].odds,-110);
  assert.equal(result.parsed[0].model,.6);
});

test('a valid published empty eligible pool is accepted',()=>{
  const result=context.validatePublishedFeed(envelope({markets:[{...market,compounderEligibility:null}]}));
  assert.equal(result.meta.marketCount,1);
  assert.equal(result.meta.eligibleCount,0);
  assert.deepEqual(result.parsed,[]);
});

test('unavailable and unpublished responses cannot replace the last valid publication',()=>{
  assert.throws(()=>context.validatePublishedFeed({...envelope(),unavailable:true}),/unavailable/);
  assert.throws(()=>context.validatePublishedFeed(envelope({publishedAt:null,version:'db-0',markets:[]})),/no valid published slate/);
  const older={publishedAt:'2026-10-14T20:00:00Z',boardDate:'2026-10-14',version:'db-3'};
  const newer={publishedAt:'2026-10-15T18:11:48Z',boardDate:'2026-10-15',version:'db-1'};
  assert.equal(context.isNewerFeed(newer,older),true);
  assert.equal(context.isNewerFeed(older,newer),false);
});

test('explicitly eligible records with missing authoritative inputs invalidate the replacement',()=>{
  assert.throws(()=>context.validatePublishedFeed(envelope({markets:[{...market,eventDate:null}]})),/missing required identity, date, price, or probability/);
});

test('saved legs are removed when a valid replacement no longer contains them',()=>{
  const remaining=vm.runInContext("legs=[{sourceId:'old-selection',eventDate:'2026-10-14'}]; selectedSlateDate='2026-10-14'; setCandidatePool([]); legs.length",context);
  assert.equal(remaining,0);
});
