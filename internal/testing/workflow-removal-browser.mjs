import { writeFile } from 'node:fs/promises';
const tabs = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
});
const call = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, {resolve, reject}); ws.send(JSON.stringify({id:n, method, params})); });
const evaluate = async expression => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, replMode: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const pause = () => new Promise(r => setTimeout(r, 700));
await call('Runtime.enable');
await call('Page.enable');

await call('Page.navigate',{url:'http://127.0.0.1:5174/#/designer'});
for(let i=0;i<30;i++){await pause();if(await evaluate("!!document.querySelector('.start select')"))break;}
await evaluate("(()=>{const s=document.querySelector('.start select');s.value='sample_308_win_a';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
for(let i=0;i<20;i++){await pause();if(await evaluate("!!document.querySelector('a[download]')"))break;}
const result=await evaluate("(()=>{const a=document.querySelector('a[download]');const json=JSON.parse(decodeURIComponent(a.href.split(',').slice(1).join(','))); const report=document.querySelector('footer a[target=\"_blank\"]');report.dispatchEvent(new FocusEvent('focus'));return {filename:a.download,key:json.key,name:json.name,svg:document.querySelectorAll('main svg').length,submissionLinks:document.querySelectorAll('main a[href*=\"issues/new\"]').length,report:report.href};})()");
if(!result.filename.endsWith('.json')||!result.key||!result.name||!result.svg||result.submissionLinks!==0||!result.report.startsWith('https://github.com/PiMetry/OpenBallistics/issues/new?'))throw new Error(JSON.stringify(result));
console.log('PASS catalogue example renders and exports valid JSON; no submission link; footer feedback preserved',JSON.stringify({filename:result.filename,name:result.name}));
if(errors.length)throw new Error(JSON.stringify(errors));
await call('Browser.close');ws.close();
