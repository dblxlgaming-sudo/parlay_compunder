import fs from 'node:fs';
import path from 'node:path';
import {buildFeed,normalizeTennisCsv,normalizeWnbaCsv,readBytes,TENNIS_SOURCE_SHA256} from './compounder-feed-lib.mjs';

const args=process.argv.slice(2);const value=flag=>{const index=args.indexOf(flag);return index<0?'':args[index+1]};
const tennis=value('--tennis'),wnba=value('--wnba'),output=path.resolve(value('--output')||'compounder-feed.json');
if(!tennis&&!wnba)throw new Error('Usage: node scripts/build-compounder-feed.mjs --tennis <csv> --wnba <csv> [--output <json>]');
const tennisRows=tennis?normalizeTennisCsv(readBytes(path.resolve(tennis)),{expectedSha256:args.includes('--verify-corrected-tennis')?TENNIS_SOURCE_SHA256:undefined}):[];
const wnbaRows=wnba?normalizeWnbaCsv(readBytes(path.resolve(wnba))):[];
const feed=buildFeed({tennis:tennisRows,wnba:wnbaRows});
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,`${JSON.stringify(feed,null,2)}\n`);
console.log(JSON.stringify({output,counts:feed.counts}));
