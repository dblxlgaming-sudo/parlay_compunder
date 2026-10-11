import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildFeed,normalizeTennisCsv,normalizeWnbaCsv,readBytes,sha256} from './compounder-feed-lib.mjs';

const args=process.argv.slice(2),value=flag=>{const index=args.indexOf(flag);return index<0?'':args[index+1]};
if(args[0]!=='publish'||(!value('--tennis')&&!value('--wnba')))throw new Error('Usage: node scripts/publish-compounder-feed.mjs publish [--tennis <csv>] [--wnba <csv>] [--production]');
const repo=path.resolve(value('--repo')||process.cwd()),liveBase='https://dblxlgaming-sudo.github.io/parlay_compunder',expectedOrigin='https://github.com/dblxlgaming-sudo/parlay_compunder.git';
const feedFile=path.join(repo,'compounder-feed.json');
function git(...gitArgs){const result=spawnSync('git',gitArgs,{cwd:repo,encoding:'utf8'});if(result.status!==0)throw new Error((result.stderr||result.stdout).trim());return result.stdout.trim()}
function canonicalOrigin(value){return value.replace(/^git@github\.com:/,'https://github.com/').replace(/\.git$/,'')+'.git'}
function currentFeed(){return fs.existsSync(feedFile)?JSON.parse(fs.readFileSync(feedFile,'utf8')):{markets:[]}}
function sourceRows(sport){return currentFeed().markets.filter(row=>row.sport===sport)}

if(args.includes('--production')){
  if(git('branch','--show-current')!=='main')throw new Error('Production publishing requires branch main.');
  if(canonicalOrigin(git('remote','get-url','origin'))!==expectedOrigin)throw new Error('Unexpected GitHub origin.');
  if(git('status','--porcelain'))throw new Error('Production publishing requires a clean worktree.');
  git('pull','--ff-only','origin','main');
}

const tennisPath=value('--tennis'),wnbaPath=value('--wnba');
const tennis=tennisPath?normalizeTennisCsv(readBytes(path.resolve(tennisPath))):sourceRows('Tennis');
const wnba=wnbaPath?normalizeWnbaCsv(readBytes(path.resolve(wnbaPath))):sourceRows('WNBA');
if(!tennis.length&&!wnba.length)throw new Error('Publishing would create an empty Compounder feed.');
const feed=buildFeed({tennis,wnba}),serialized=`${JSON.stringify(feed,null,2)}\n`;
const release=sha256(Buffer.from(serialized)).slice(0,16),releaseRelative=`data/compounder/releases/${feed.generatedAt.slice(0,10)}-${release}/compounder-feed.json`,releaseFile=path.join(repo,releaseRelative);
if(fs.existsSync(releaseFile)&&fs.readFileSync(releaseFile,'utf8')!==serialized)throw new Error('Immutable release path already exists with different bytes.');
fs.mkdirSync(path.dirname(releaseFile),{recursive:true});fs.writeFileSync(releaseFile,serialized);fs.writeFileSync(feedFile,serialized);
console.log(JSON.stringify({feed:'compounder-feed.json',release:releaseRelative,counts:feed.counts}));
if(!args.includes('--production'))process.exit(0);
git('add','--','compounder-feed.json',releaseRelative);
const changed=git('diff','--cached','--name-only').split(/\r?\n/).filter(Boolean),allowed=new Set(['compounder-feed.json',releaseRelative]);
if(changed.some(file=>!allowed.has(file)))throw new Error(`Publisher staged an unauthorized path: ${changed.join(', ')}`);
if(changed.length){git('commit','-m',`Publish Compounder feed ${feed.generatedAt.slice(0,10)}`);git('push','origin','main');}
const deadline=Date.now()+120000;
while(Date.now()<deadline){
  try{const response=await fetch(`${liveBase}/compounder-feed.json?_=${Date.now()}`,{cache:'no-store'});if(response.ok){const live=await response.json();if(live.schemaVersion===feed.schemaVersion&&live.counts?.total===feed.counts.total){console.log(`SUCCESS ${feed.counts.total} markets`);process.exit(0);}}}catch{}
  await new Promise(resolve=>setTimeout(resolve,4000));
}
throw new Error('GitHub Pages did not expose the published Compounder feed before timeout.');
