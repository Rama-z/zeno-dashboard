import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import test from 'node:test';

function harness() {
  const dom = new JSDOM('<div id="app"></div>', { url:'http://localhost/doing' });
  const {window} = dom;
  const calls = [];
  const api = {
    doingTasks: async () => ({entries:[]}), doing: async () => ({entries:[]}),
    createDoingTask: async input => {calls.push(input); return {...input,duration:{...input.duration,label:'15–30 minutes'},id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-09-23T00:00:00Z',updatedAt:'2026-09-23T00:00:00Z'};},
    updateDoingTask: async (id,input) => {calls.push(input);return {...input,id,createdAt:'2026-09-23T00:00:00Z',updatedAt:'2026-09-23T00:00:00Z'};},
  };
  const source = readFileSync(new URL('../src/doing-complete.ts',import.meta.url),'utf8')
    .replace(/^import .*?;$/gm,'');
  const code = transformSync(source,{loader:'ts',format:'cjs'}).code;
  const module = {exports:{}};
  runInNewContext(code,{module,exports:module.exports,api,document:window.document,window,FormData:window.FormData,Date,Intl,Promise,Number,String,Array,Object,Map,Set,Event:window.Event,CSS:{escape:value=>value},requestAnimationFrame:cb=>cb(),console,globalThis:{__api:api}});
  const workspace = module.exports;
  let route={kind:'page',page:'doing'};
  function mount() {window.document.querySelector('#app').innerHTML=workspace.renderDoingPage(route);workspace.bindDoingEvents({rerender:mount,navigate:path=>{route=path==='/doing/new'?{kind:'doing-editor',taskId:null}:path==='/doing'?{kind:'page',page:'doing'}:path.endsWith('/edit')?{kind:'doing-editor',taskId:path.split('/').at(-2)}:{kind:'doing-detail',taskId:path.split('/').pop()};mount()},onStatus:()=>{}},route);}
  return {window,workspace,api,calls,mount,get route(){return route}};
}
test('a workspace load error shows retry rather than a false empty task list',async()=>{
  const h=harness();
  h.api.doingTasks=async()=>{throw new Error('offline fixture')};
  await assert.rejects(h.workspace.syncDoingData(),/offline fixture/);
  h.mount();
  assert.match(h.window.document.querySelector('[role="alert"]').textContent,/offline fixture/);
  assert.equal(h.window.document.querySelector('[data-doing-new]'),null);
  h.api.doingTasks=async()=>({entries:[]});
  h.window.document.querySelector('[data-doing-retry]').click();
  await flush();
  assert.ok(h.window.document.querySelector('[data-doing-new]'));
});

test('legacy overview preserves server values rather than synthesizing workspace metrics',async()=>{
  const h=harness();
  const legacy={id:'legacy',date:'2026-09-23',title:'Old task',timeBlockStart:'08:00',actualMinutes:37,dependency:'Reviewed schema'};
  h.api.doing=async()=>({entries:[legacy]});
  await h.workspace.syncDoingData();
  assert.deepEqual(JSON.parse(JSON.stringify(h.workspace.doingOverviewEntries())),[legacy]);
});

test('Unicode limits reject overlong notes without truncating drafts or calling the API',async()=>{
  const h=harness();await h.workspace.syncDoingData();h.mount();h.window.document.querySelector('[data-doing-new]').click();
  let form=h.window.document.querySelector('[data-doing-form]');
  form.elements.namedItem('title').value='Keep the draft';form.elements.namedItem('project').value='Workspace';form.elements.namedItem('nextAction').value='Check';
  h.window.document.querySelector('[data-doing-check-new]').value='Done';h.window.document.querySelector('[data-doing-check-add]').click();
  form=h.window.document.querySelector('[data-doing-form]');form.elements.namedItem('notes').value='😀'.repeat(20001);
  form.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(h.calls.length,0);assert.equal(form.elements.namedItem('notes').value,'😀'.repeat(20001));
  assert.match(h.window.document.querySelector('[data-doing-feedback]').textContent,/20.000/);
});

test('migrated task can edit Notes without inventing Next Action or checklist',async()=>{
  const h=harness();
  const old={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'Legacy task',area:'All Rounder',project:'',type:'',status:'Ready',priority:'P2',urgency:'',impact:'',effort:'',energy:'',focus:'Deep',duration:{minMinutes:15,maxMinutes:30,label:'15–30 minutes'},context:'',device:'',location:'',timePreference:'',difficulty:'',resistance:'',due:null,nextAction:'',definitionOfDone:[],plannedDate:'2026-09-23',notes:'Original',legacyMetadata:{goalOutcome:'Original outcome'}};
  h.api.doingTasks=async()=>({entries:[old]});
  await h.workspace.syncDoingData();h.mount();
  h.window.document.querySelector('[data-doing-open]').click();h.window.document.querySelector('[data-doing-edit]').click();
  const form=h.window.document.querySelector('[data-doing-form]');form.elements.namedItem('notes').value='Edited\n\nNotes';
  form.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));await flush();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].notes,'Edited\n\nNotes');
  assert.equal(h.calls[0].nextAction,'');assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].definitionOfDone)),[]);
});

const flush = () => new Promise(resolve=>setTimeout(resolve,0));

test('new workspace task submits nested duration, literal notes and nullable dates then opens detail',async()=>{
  const h=harness();await h.workspace.syncDoingData();h.mount();
  h.window.document.querySelector('[data-doing-new]').click();
  const form=h.window.document.querySelector('[data-doing-form]');
  form.elements.namedItem('title').value='Implement API';
  form.elements.namedItem('project').value='Zeno';
  form.elements.namedItem('nextAction').value='Inspect schema';
  form.elements.namedItem('durationMinMinutes').value='15';
  form.elements.namedItem('durationMaxMinutes').value='30';
  form.elements.namedItem('notes').value='  First line\n\nSecond line  \n';
  h.window.document.querySelector('[data-doing-check-new]').value='API connected';
  h.window.document.querySelector('[data-doing-check-add]').click();
  h.window.document.querySelector('[data-doing-form]').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  assert.equal(h.calls.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].duration)),{minMinutes:15,maxMinutes:30});
  assert.equal(h.calls[0].notes,'  First line\n\nSecond line  \n');
  assert.equal(h.calls[0].due,null);
  assert.equal(h.calls[0].plannedDate,null);
  assert.equal(h.calls[0].definitionOfDone[0].text,'API connected');
  assert.equal(h.route.kind,'doing-detail');
  assert.match(h.window.document.querySelector('.dc-notes-detail').textContent,/Second line/);
  const box=h.window.document.querySelector('.dc-detail-checks [data-doing-check]');
  box.checked=true;box.dispatchEvent(new h.window.Event('change',{bubbles:true}));await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[1].duration)),{minMinutes:15,maxMinutes:30},'response-only duration.label must not be sent on checklist update');
  assert.equal(h.calls[1].definitionOfDone[0].done,true);
});
