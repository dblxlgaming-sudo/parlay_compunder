import fs from 'node:fs';
import vm from 'node:vm';

const feedUrl=process.argv[2]||'https://lbg-todays-board.univursmusic.chatgpt.site/public-feed.json';
const source=fs.readFileSync(new URL('../parlay-lab.js',import.meta.url),'utf8');
const prefix=source.split("document.getElementById('candidateList').addEventListener")[0];
const stub={value:'',innerHTML:'',textContent:'',className:'',style:{},addEventListener(){}};
const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{...stub,style:{}});return elements.get(id)};
const context={document:{getElementById:element},localStorage:{getItem(){return null},setItem(){}},window:{location:{search:'',protocol:'https:'}},URLSearchParams,Intl,Date,console};
vm.createContext(context);
vm.runInContext(prefix,context);

const response=await fetch(feedUrl,{cache:'no-store'});
if(!response.ok)throw new Error(`HTTP ${response.status}`);
const payload=await response.json();
const validated=context.validatePublishedFeed(payload);
console.log(JSON.stringify({...validated.meta,feedUrl,normalizedEligibleCount:validated.parsed.length},null,2));
