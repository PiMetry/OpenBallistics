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

const routes=[['#/c/9_mm_luger','9 mm Luger'],['#/b/sample_308_win_a','Sample'],['#/targets',null]];
for(const origin of ['http://127.0.0.1:5174','http://127.0.0.1:4175']) {
 for(const [route,expected] of routes) {
  await call('Page.navigate',{url:origin+'/'+route});
  let page;
  for(let i=0;i<30;i++) {
   await pause();
   page=await evaluate("({heading:document.querySelector('main h1')?.textContent, text:document.querySelector('main')?.textContent, svg:document.querySelectorAll('main svg').length, targets:document.querySelector('main select[data-report-context]')?.options.length})");
   if(page.heading && page.svg && (!expected || page.text.includes(expected))) break;
  }
  if(!page.heading || !page.svg || (expected && !page.text.includes(expected)) || (route==='#/targets' && page.targets!==24)) throw new Error(JSON.stringify({origin,route,page}));
  console.log('PASS',origin,route,JSON.stringify({heading:page.heading,svg:page.svg,targets:page.targets}));
 }
}
if(errors.length)throw new Error(JSON.stringify(errors));
console.log('PASS no browser runtime exceptions');
await call('Browser.close');
ws.close();
