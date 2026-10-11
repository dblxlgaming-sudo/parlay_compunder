import crypto from 'node:crypto';
import fs from 'node:fs';

export const TENNIS_SCHEMA='lbg-tennis-downstream/1';
export const FEED_SCHEMA='triple-threat-compounder-feed/1';
export const TENNIS_SOURCE_SHA256='cff01eee1218432b8bb983a6bee384f6baab0dc77ac52dedca7b1eadf397dff6';

export const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
export const readBytes=file=>fs.readFileSync(file);

export function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i+=1){
    const ch=text[i],next=text[i+1];
    if(ch==='"'&&quoted&&next==='"'){cell+='"';i+=1;}
    else if(ch==='"')quoted=!quoted;
    else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i+=1;row.push(cell);if(row.some(value=>value!==''))rows.push(row);row=[];cell='';}
    else cell+=ch;
  }
  if(quoted)throw new Error('CSV has an unterminated quoted field.');
  row.push(cell);if(row.some(value=>value!==''))rows.push(row);
  const headers=(rows.shift()||[]).map((value,index)=>index===0?value.replace(/^\uFEFF/,''):value);
  const duplicates=headers.filter((value,index)=>headers.indexOf(value)!==index);
  if(duplicates.length)throw new Error(`Duplicate CSV headers: ${[...new Set(duplicates)].join(', ')}`);
  return {headers,records:rows.map((values,index)=>{if(values.length!==headers.length)throw new Error(`CSV row ${index+2} has ${values.length} fields; expected ${headers.length}.`);return Object.fromEntries(headers.map((header,column)=>[header,values[column]??'']));})};
}

const number=value=>{if(value===null||value===undefined||String(value).trim()==='')return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const probability=value=>{const parsed=number(value);return parsed!==null&&parsed>=0&&parsed<=1?parsed:null;};
const edge=value=>{const parsed=number(value);return parsed!==null&&Math.abs(parsed)>1?parsed/100:parsed;};
const americanToDecimal=odds=>odds>0?1+odds/100:1+100/Math.abs(odds);
const breakEven=odds=>1/americanToDecimal(odds);
const slug=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const pct=value=>`${(value*100).toFixed(1)}%`;

const thresholds={TENNIS_V2:{ML:{candidate:.04,lean:.02},SPREAD:{candidate:.05,lean:.025},TOTAL:{candidate:.05,lean:.025}},WNBA:{ML:{candidate:.04,lean:.02},SPREAD:{candidate:.05,lean:.025},TOTAL:{candidate:.05,lean:.025}}};

export function qualifyCoreMarket(input){
  const threshold=thresholds[input.sport][input.market];
  if(input.pricingState!=='PRICED_MARKET'||input.sportsbookPrice===null||input.modelProbability===null||input.noVigProbability===null){
    return {classification:'PASS',reasonCode:'INSUFFICIENT_DATA',compounderEligibility:'INELIGIBLE',verifiedEdge:null,modelRead:input.modelRead};
  }
  const verified=input.verifiedEdge??input.modelProbability-input.noVigProbability;
  const classification=verified>=threshold.candidate?'CANDIDATE':verified>=threshold.lean?'LEAN':'PASS';
  const reasonCode=classification!=='PASS'?'':verified>=0?'INSUFFICIENT_EDGE':input.selectionMatchesModelRead?'OVERPRICED':'MODEL_DISAGREES';
  const extreme=input.sport==='TENNIS_V2'&&input.market==='ML'&&input.sportsbookPrice>=1000&&input.noVigProbability<=.05&&input.modelProbability>=.20&&Math.abs(input.modelProbability-input.noVigProbability)>=.20;
  return {classification,reasonCode,compounderEligibility:extreme?'INELIGIBLE':input.selectionMatchesModelRead?'ELIGIBLE':'INELIGIBLE',verifiedEdge:verified,modelRead:input.modelRead,needsAttention:extreme,needsAttentionReason:extreme?'EXTREME_MODEL_MARKET_DISAGREEMENT':''};
}

const tennisRequired=['SlateID','BoardDate','MatchID','Date','Tournament','Surface','PlayerA','PlayerB','MarketType','MarketDisplay','MarketVariantID','Participant','SelectedPlayer','Opponent','Side','Direction','Line','PricingState','CoverageState','CoverageReason','OfferedOdds','BreakevenProbability','NoVigProbability','ModelProjection','ModelProbability','HitChance','EdgeVsBreakeven','EdgeVsNoVig','ExpectedValuePerUnit','ExpectedValueStatus','Reliability','Sportsbook','Source','MatchupScore','MatchupScoreVersion','MatchupScoreStatus','MatchupScoreUnavailableReason','MatchupScoreDataQuality','MatchupScorePresentationBand'];
const wnbaRequired=['SlateID','BoardDate','GeneratedAt','StableRowID','EventID','GameTime','Matchup','Sport','AwayTeam','HomeTeam','Market','Direction','ExactLine','Sportsbook','MarketFamily','Availability','Actionability','PricingState','AmericanOdds','ModelProbability','HitProbability','ModelFairOdds','ExpectedValuePerUnit','RawImpliedProbability','PairedNoVigProbability','MarketRelativeEdge','ProjectedWinner','AwayProjectedScore','HomeProjectedScore','ProjectedMargin','ProjectedTotal','Reliability','AvailabilityWarning','ModelVersion'];

function requireHeaders(headers,required,label){const missing=required.filter(field=>!headers.includes(field));if(missing.length)throw new Error(`${label} is missing columns: ${missing.join(', ')}`);}
function assertProbability(value,label){if(value===null)throw new Error(`${label} must contain a probability from 0 to 1.`);return value;}
function assertAmerican(value,label){const parsed=number(value);if(parsed===null||!Number.isInteger(parsed)||parsed===0||Math.abs(parsed)<100)throw new Error(`${label} must contain valid American odds.`);return parsed;}

export function normalizeTennisCsv(bytes,{expectedSha256}={}){
  const actualSha=sha256(bytes);if(expectedSha256&&actualSha!==expectedSha256)throw new Error(`Tennis source SHA-256 mismatch: ${actualSha}`);
  const {headers,records}=parseCsv(bytes.toString('utf8'));requireHeaders(headers,tennisRequired,'Tennis artifact');
  if(records.length!==370)throw new Error(`Tennis artifact must contain 370 rows; found ${records.length}.`);
  const markets=[];
  for(const [index,row] of records.entries()){
    if(row.PricingState!=='PRICED_MARKET'||!['ML','SPREAD','MATCH_TOTAL'].includes(row.MarketType))continue;
    const odds=assertAmerican(row.OfferedOdds,`Tennis row ${index+2} OfferedOdds`);
    const model=assertProbability(probability(row.ModelProbability),`Tennis row ${index+2} ModelProbability`);
    const noVig=assertProbability(probability(row.NoVigProbability),`Tennis row ${index+2} NoVigProbability`);
    const suppliedBe=assertProbability(probability(row.BreakevenProbability),`Tennis row ${index+2} BreakevenProbability`);
    const computedBe=breakEven(odds);if(Math.abs(suppliedBe-computedBe)>.0002)throw new Error(`Tennis row ${index+2} breakeven does not match OfferedOdds.`);
    const verified=edge(row.EdgeVsNoVig);if(verified===null||Math.abs(verified-(model-noVig))>.0002)throw new Error(`Tennis row ${index+2} EdgeVsNoVig is invalid.`);
    const normalizedMarket=row.MarketType==='MATCH_TOTAL'?'TOTAL':row.MarketType;
    const line=number(row.Line),selected=(row.SelectedPlayer||row.Participant||row.Side).trim();
    const selection=normalizedMarket==='TOTAL'?(row.Side||row.Direction).trim():selected;
    const displaySelection=normalizedMarket==='SPREAD'?(row.Side||`${selection} ${line}`).trim():selection;
    const modelRead=model>=.5?displaySelection:`Opposite of ${displaySelection}`;
    const qualification=qualifyCoreMarket({sport:'TENNIS_V2',market:normalizedMarket,selection:displaySelection,line,sportsbookPrice:odds,modelProbability:model,noVigProbability:noVig,verifiedEdge:verified,pricingState:'PRICED_MARKET',modelRead,selectionMatchesModelRead:model>=.5});
    if(qualification.compounderEligibility!=='ELIGIBLE')continue;
    const marketId=[row.MatchID,row.MarketVariantID,row.Side||row.Direction||displaySelection,row.Line||'na'].map(slug).join('|');
    markets.push({marketId,eventId:null,matchId:row.MatchID,sport:'Tennis',league:'Tennis V2',slateId:row.SlateID,boardDate:row.BoardDate,eventDate:row.Date,eventTime:'',timezone:'',competition:row.Tournament,participantA:row.PlayerA,participantB:row.PlayerB,marketType:normalizedMarket==='ML'?'ML':normalizedMarket==='SPREAD'?'Spread':'Total',selection:displaySelection,line,sportsbook:row.Sportsbook,sportsbookAmericanOdds:odds,sportsbookDecimalOdds:americanToDecimal(odds),sportsbookBreakevenProbability:computedBe,noVigProbability:noVig,modelProbability:model,modelProjection:number(row.ModelProjection),modelFairOdds:null,verifiedEdge:verified,expectedValuePerUnit:number(row.ExpectedValuePerUnit),expectedValueStatus:row.ExpectedValueStatus,reliability:number(row.Reliability),modelRead:qualification.modelRead,straightBetClassification:qualification.classification,passReasonCode:qualification.reasonCode,compounderEligibility:qualification.compounderEligibility,modelVersion:'Tennis V2',sourceSchema:TENNIS_SCHEMA,sourceArtifactSha256:actualSha,sourceRow:index+2});
  }
  return markets;
}

export function normalizeWnbaCsv(bytes){
  const actualSha=sha256(bytes);const {headers,records}=parseCsv(bytes.toString('utf8'));requireHeaders(headers,wnbaRequired,'WNBA artifact');
  const markets=[];
  for(const [index,row] of records.entries()){
    if(row.PricingState!=='PRICED_MARKET'||!['MONEYLINE','SPREAD','TOTAL'].includes(row.Market))continue;
    const odds=assertAmerican(row.AmericanOdds,`WNBA row ${index+2} AmericanOdds`);
    const model=assertProbability(probability(row.ModelProbability||row.HitProbability),`WNBA row ${index+2} ModelProbability`);
    const noVig=assertProbability(probability(row.PairedNoVigProbability),`WNBA row ${index+2} PairedNoVigProbability`);
    const verified=edge(row.MarketRelativeEdge);if(verified===null||Math.abs(verified-(model-noVig))>.0002)throw new Error(`WNBA row ${index+2} MarketRelativeEdge is invalid.`);
    const normalizedMarket=row.Market==='MONEYLINE'?'ML':row.Market;
    const line=number(row.ExactLine),direction=row.Direction.toUpperCase();
    const team=direction==='HOME'?row.HomeTeam:row.AwayTeam;
    const selection=row.Market==='TOTAL'?(direction==='UNDER'?'Under':'Over'):row.Market==='SPREAD'?`${team} ${line>0?'+':''}${line}`:team;
    const modelRead=model>=.5?selection:`Opposite of ${selection}`;
    const qualification=qualifyCoreMarket({sport:'WNBA',market:normalizedMarket,selection,line,sportsbookPrice:odds,modelProbability:model,noVigProbability:noVig,verifiedEdge:verified,pricingState:'PRICED_MARKET',modelRead,selectionMatchesModelRead:model>=.5});
    if(qualification.compounderEligibility!=='ELIGIBLE')continue;
    const [eventDate,eventTime='']=row.GameTime.split('T');
    markets.push({marketId:row.StableRowID,eventId:row.EventID,matchId:row.EventID,sport:'WNBA',league:'WNBA',slateId:row.SlateID,boardDate:row.BoardDate,eventDate,eventTime:eventTime.replace(/Z$/,'Z'),timezone:'UTC',competition:'WNBA',participantA:row.AwayTeam,participantB:row.HomeTeam,marketType:normalizedMarket==='ML'?'ML':normalizedMarket==='SPREAD'?'Spread':'Total',selection,line,sportsbook:row.Sportsbook,sportsbookAmericanOdds:odds,sportsbookDecimalOdds:americanToDecimal(odds),sportsbookBreakevenProbability:breakEven(odds),noVigProbability:noVig,modelProbability:model,modelProjection:null,modelFairOdds:number(row.ModelFairOdds),verifiedEdge:verified,expectedValuePerUnit:number(row.ExpectedValuePerUnit),expectedValueStatus:String(row.ExpectedValuePerUnit).trim()?'CALCULATED':'UNAVAILABLE',reliability:number(row.Reliability),modelRead:qualification.modelRead,straightBetClassification:qualification.classification,passReasonCode:qualification.reasonCode,compounderEligibility:qualification.compounderEligibility,modelVersion:row.ModelVersion,sourceSchema:'wnba-market/1',sourceArtifactSha256:actualSha,sourceRow:index+2});
  }
  return markets;
}

export function buildFeed({tennis=[],wnba=[],generatedAt=new Date().toISOString()}){
  const markets=[...tennis,...wnba].sort((a,b)=>a.eventDate.localeCompare(b.eventDate)||a.sport.localeCompare(b.sport)||a.marketId.localeCompare(b.marketId));
  const ids=new Set();for(const row of markets){if(ids.has(row.marketId))throw new Error(`Duplicate marketId: ${row.marketId}`);ids.add(row.marketId);}
  return {schemaVersion:FEED_SCHEMA,generatedAt,counts:{total:markets.length,tennis:tennis.length,wnba:wnba.length},markets};
}
