import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import ts from 'typescript';

// Regras de domínio e CAS são testadas sem Worker, UI ou banco externo.
const dir=new URL('../work/backend-tests/',import.meta.url);
await mkdir(dir,{recursive:true});
for(const [source,target] of [['app/geo.ts','geo.mjs'],['app/seed.ts','seed.mjs'],['app/server/core.ts','core.mjs'],['app/server/http.ts','http.mjs'],['app/server/store.ts','store.mjs']]) {
  const raw=await readFile(new URL(`../${source}`,import.meta.url),'utf8');
  let output=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  for(const [a,b] of [['cloudflare:workers','./env.mjs'],['../seed','./seed.mjs'],['./core','./core.mjs'],['../geo','./geo.mjs'],['./geo','./geo.mjs']])output=output.replaceAll(`'${a}'`,`'${b}'`).replaceAll(`"${a}"`,`"${b}"`);
  await writeFile(new URL(target,dir),output);
}
await writeFile(new URL('env.mjs',dir),'export const env = {};');
const {createSeed}=await import(new URL('seed.mjs',dir));
const {applyAction,publicState,normalizeState}=await import(new URL('core.mjs',dir));
const {requestOwner,requestRole,requestRegistration,checkOrigin}=await import(new URL('http.mjs',dir));
const {mutateWorkspace,loadWorkspace}=await import(new URL('store.mjs',dir));
const {geometryDistanceKm}=await import(new URL('geo.mjs',dir));
const {env}=await import(new URL('env.mjs',dir));
const now=new Date('2026-10-23T15:00:00.000Z');
const seed=()=>createSeed(now);
const act=(s,a,role='admin',at=now,registration)=>applyAction(s,a,role,at,registration);
const manual=(kind='boarding',passengerId='p1')=>({type:'boarding.manual',tripId:'t1',passengerId,kind,note:'Validação manual pelo motorista'});
const batch=(ids=['p7','p13'],extra={})=>({type:'alighting.batch',tripId:'t1',stopId:'s14',passengerIds:ids,confirmation:true,...extra});
const gps=async(s,extra={})=>{
  const stop=s.trips[0].routeSnapshot.stops.at(-1);
  return (await act(s,{type:'location.update',tripId:'t1',lat:stop.lat,lng:stop.lng,accuracy:8,speed:0,heading:0,deviceAt:now.toISOString(),...extra},'driver')).state;
};

test('seed relaciona dados demo, matrículas, destinos, geometrias e snapshots',()=>{
  const s=seed();assert.equal(s.routes.length,6);assert.equal(s.vehicles.length,6);assert.equal(s.drivers.length,4);assert.equal(s.passengers.length,32);
  assert.equal(s.trips.filter(t=>!t.id.startsWith('hist-')).length,9);assert.equal(s.trips.filter(t=>t.id.startsWith('hist-')).length,42);
  assert.equal(s.drivers[0].registration,'MOT-001');assert.equal(s.passengers[0].registration,'NX-1001');assert.equal(s.passengers[0].destinationStopId,'s14');
  assert.ok(s.locations.every(l=>l.simulated));assert.ok(s.trips.every(t=>t.routeSnapshot&&t.vehicleSnapshot&&t.driverSnapshot&&!t.legacySnapshot));
  assert.ok(s.routes.every(r=>r.geometry.length>=2&&r.geometrySource==='stops'&&Math.abs(r.distance-geometryDistanceKm(r.geometry))<.001));
});
test('normalização legado não inventa timestamps e marca snapshots inferidos',()=>{
  const s=seed();for(const d of s.drivers){delete d.registration;delete d.active;delete d.createdAt;}for(const p of s.passengers){delete p.destinationStopId;delete p.createdAt;}for(const v of s.vehicles)delete v.createdAt;
  for(const t of s.trips){delete t.routeSnapshot;delete t.vehicleSnapshot;delete t.driverSnapshot;delete t.legacySnapshot;}for(const b of s.bookings)delete b.destinationStopId;
  s.qrTokens=[{token:'antigo',passengerId:'p1',tripId:'t1',expiresAt:'2099-01-01T00:00:00.000Z',used:[]}];
  const n=normalizeState(s);assert.equal(n.drivers[0].registration,'MOT-001');assert.ok(n.drivers.every(d=>d.active&&!d.createdAt));assert.ok(n.passengers.every(p=>p.destinationStopId&&!p.createdAt));assert.ok(n.vehicles.every(v=>!v.createdAt));
  assert.ok(n.trips.every(t=>t.legacySnapshot));assert.ok(n.bookings.every(b=>b.destinationStopId));assert.equal(n.qrTokens.length,0);assert.equal(s.drivers[0].registration,undefined);
});
test('motorista emite QR opaco TTL120s e estado público não contém segredos',async()=>{
  const {state,extra}=await act(seed(),{type:'trip.qr.issue',tripId:'t1'},'driver');
  assert.match(extra.token,/^[0-9a-f]{64}$/);assert.equal(Date.parse(extra.expiresAt)-now.getTime(),120_000);
  assert.ok(!JSON.stringify(publicState(state)).includes(extra.token));assert.ok(!('qrTokens' in publicState(state)));assert.ok(!('audit' in publicState(state)));
  await assert.rejects(act(seed(),{type:'trip.qr.issue',tripId:'t1'},'passenger'));
});
test('mesmo QR embarca passageiros distintos e recusa repetição individual',async()=>{
  let {state,extra}=await act(seed(),{type:'trip.qr.issue',tripId:'t1'},'driver');
  const scan={type:'boarding.scan',token:extra.token};
  ({state}=await act(state,scan,'passenger'));({state}=await act(state,scan,'passenger',now,'NX-1025'));
  const records=state.events.filter(e=>e.tripId==='t1'&&['p1','p25'].includes(e.passengerId)&&e.kind==='boarding');assert.equal(records.length,2);assert.equal(records[0].passengerRegistration,'NX-1001');assert.equal(records[0].driverRegistration,'MOT-001');
  await assert.rejects(act(state,scan,'passenger'));await assert.rejects(act(state,{type:'booking.cancel',id:'b-t1-p1'},'passenger'));
  await assert.rejects(act(state,scan,'driver'));await assert.rejects(act(seed(),{type:'boarding.scan',token:extra.token},'passenger'));
});
test('QR expirado, revogado e fluxo antigo são recusados',async()=>{
  let {state,extra}=await act(seed(),{type:'trip.qr.issue',tripId:'t1'});const token=extra.token;
  await assert.rejects(act(state,{type:'boarding.scan',token},'passenger',new Date(now.getTime()+120_001)));
  ({state}=await act(state,{type:'trip.qr.issue',tripId:'t1'}));await assert.rejects(act(state,{type:'boarding.scan',token},'passenger'));
  await assert.rejects(act(state,{type:'qr.issue',tripId:'t1',passengerId:'p1'}),e=>e.status===410);
  await assert.rejects(act(state,{type:'qr.validate',tripId:'t1',token,kind:'boarding'}),e=>e.status===410);
});
test('leitura QR revalida reserva, rota, capacidade, ativo e identidade',async()=>{
  const q=await act(seed(),{type:'trip.qr.issue',tripId:'t1'}),scan={type:'boarding.scan',token:q.extra.token};
  const noBooking=structuredClone(q.state);noBooking.bookings=noBooking.bookings.filter(b=>b.id!=='b-t1-p1');await assert.rejects(act(noBooking,scan,'passenger'));
  await assert.rejects(act(q.state,scan,'passenger',now,'NX-1002'));
  const full=structuredClone(q.state);full.trips[0].vehicleSnapshot.capacity=3;await assert.rejects(act(full,scan,'passenger'));
  const inactive=structuredClone(q.state);inactive.passengers[0].active=false;await assert.rejects(act(inactive,scan,'passenger'));
  await assert.rejects(act(q.state,{...scan,passengerId:'p25'},'passenger'));
  const admin=await act(q.state,{...scan,passengerId:'p25'});assert.equal(admin.extra.passengerId,'p25');
});
test('matrícula selecionada limita viagem e passageiro, com fallback compatível',async()=>{
  const s=seed();await assert.rejects(act(s,{type:'trip.qr.issue',tripId:'t3'},'driver'));
  const d2=await act(s,{type:'trip.qr.issue',tripId:'t3'},'driver',now,'MOT-002');assert.ok(d2.extra.token);
  await assert.rejects(act(s,{type:'booking.cancel',id:'b-t2-p25'},'passenger'));
  const p25=await act(s,{type:'booking.cancel',id:'b-t2-p25'},'passenger',now,'NX-1025');assert.equal(p25.state.bookings.find(b=>b.id==='b-t2-p25').status,'cancelled');
  await assert.rejects(act(s,{type:'trip.qr.issue',tripId:'t1'},'driver',now,'MOT-404'));
  s.drivers[0].active=false;await assert.rejects(act(s,{type:'trip.qr.issue',tripId:'t1'},'driver'));
});
test('lote com GPS real na parada registra só selecionados e congela identificação',async()=>{
  const s=await gps(seed());const result=await act(s,batch(),'driver');const ev=result.state.events.filter(e=>e.batchId===result.extra.batchId);
  assert.equal(ev.length,2);assert.equal(result.extra.verification,'gps_at_stop');assert.ok(ev.every(e=>e.source==='driver_batch'&&e.stopId==='s14'&&e.verification==='gps_at_stop'&&e.driverRegistration==='MOT-001'&&e.passengerName&&e.passengerRegistration));
  assert.ok(!result.state.events.some(e=>e.tripId==='t1'&&e.passengerId==='p19'&&e.kind==='alighting'));
  await assert.rejects(act(result.state,batch(),'driver'));
});
test('lote sem GPS fresco e confiável exige justificativa manual',async()=>{
  await assert.rejects(act(seed(),batch(),'driver'));
  for(const [patch,at] of [[{accuracy:61},now],[{speed:3},now],[{speed:null},now],[{deviceAt:new Date(now.getTime()-91_000).toISOString()},now],[{},new Date(now.getTime()+91_000)]]) {
    const s=await gps(seed(),patch);await assert.rejects(act(s,batch(),'driver',at));
    const out=await act(s,batch(['p7'],{note:'Parada confirmada visualmente pelo motorista'}),'driver',at);assert.equal(out.extra.verification,'manual_override');
  }
  const far=await gps(seed(),{lat:-23.65,lng:-46.75});await assert.rejects(act(far,batch(),'driver'));
});
test('lote exige confirmação, destino e ponto da viagem; falha é atômica',async()=>{
  const s=await gps(seed()),snapshot=JSON.stringify(s);
  for(const bad of [batch(['p7','p7']),batch(['p7','p1']),batch(['p7'],{confirmation:false}),batch(['p7'],{stopId:'s23'}),batch(['p7'],{stopId:'s12'})])await assert.rejects(act(s,bad,'driver'));
  assert.equal(JSON.stringify(s),snapshot);
  const override=await act(s,batch(['p7'],{stopId:'s12',note:'Passageiro solicitou descer antes do destino'}),'driver');assert.equal(override.extra.verification,'manual_override');
  await assert.rejects(act(s,batch(),'passenger'));
});
test('viagem encerra apenas vazia; hodômetro é opcional e nunca decresce',async()=>{
  let s=seed();await assert.rejects(act(s,{type:'trip.finish',tripId:'t1'},'driver'));
  s=(await act(s,batch(['p7','p13','p19'],{note:'Todos confirmaram desembarque no terminal'}),'driver')).state;
  s=(await act(s,{type:'trip.finish',tripId:'t1'},'driver')).state;assert.equal(s.trips[0].endOdometerKm,undefined);
  s=(await act(s,{type:'trip.start',tripId:'t2',odometerKm:1000},'driver')).state;assert.equal(s.trips[1].startOdometerKm,1000);
  await assert.rejects(act(s,{type:'trip.finish',tripId:'t2',odometerKm:999},'driver'));
  s=(await act(s,{type:'trip.finish',tripId:'t2',odometerKm:1008.25},'driver')).state;assert.equal(s.trips[1].endOdometerKm,1008.25);
});
test('snapshot criado na agenda permanece imutável após editar cadastros',async()=>{
  let s=seed();const before=structuredClone(s.trips.find(t=>t.id==='t6'));
  s=(await act(s,{type:'route.save',route:{...s.routes[3],name:'Rota atualizada',geometry:[[-23.5266,-46.7769],[-23.5668,-46.6938]],geometrySource:'kml',geometryName:'teste.kml'}})).state;
  s=(await act(s,{type:'driver.save',driver:{...s.drivers[3],name:'Nome atualizado'}})).state;
  s=(await act(s,{type:'vehicle.save',vehicle:{...s.vehicles[3],model:'Modelo atualizado'}})).state;
  assert.deepEqual(s.trips.find(t=>t.id==='t6'),before);assert.equal(s.routes[3].revision,2);assert.equal(s.routes[3].distance,Number(geometryDistanceKm(s.routes[3].geometry).toFixed(3)));
  const created=await act(s,{type:'trip.create',trip:{routeId:'r4',driverId:'d4',vehicleId:'v4',date:s.trips[1].date,departure:'14:00'}});const trip=created.state.trips.find(t=>t.id===created.extra.id);
  assert.equal(trip.routeSnapshot.name,'Rota atualizada');assert.equal(trip.driverSnapshot.name,'Nome atualizado');assert.equal(trip.vehicleSnapshot.model,'Modelo atualizado');
  await assert.rejects(act(s,{type:'route.save',route:s.routes[0]}));
});
test('cadastros validam matrícula por perfil, destino posterior e timestamp servidor',async()=>{
  const s=seed(),driver={name:'Nova motorista',phone:'11999990000',license:'D-123456',registration:'MOT-090',active:true,createdAt:'2000-01-01T00:00:00.000Z'};
  const out=await act(s,{type:'driver.save',driver});assert.equal(out.state.drivers.at(-1).createdAt,now.toISOString());
  await assert.rejects(act(out.state,{type:'driver.save',driver}));await assert.rejects(act(s,{type:'driver.save',driver:{...driver,registration:undefined}}));
  await assert.rejects(act(s,{type:'passenger.save',passenger:{...s.passengers[0],destinationStopId:'s11'}}));
  const legacy=structuredClone(s);delete legacy.drivers[0].registration;delete legacy.drivers[0].createdAt;const edited=await act(legacy,{type:'driver.save',driver:{id:'d1',name:'Carlos editado',phone:'11999990101',license:'D-98765'}});assert.equal(edited.state.drivers[0].registration,'MOT-001');assert.equal(edited.state.drivers[0].createdAt,undefined);
  const p={...s.passengers[0],id:undefined,name:'Pessoa nova',email:'nova@exemplo.invalid',registration:'MOT-090'};
  const passenger=await act(out.state,{type:'passenger.save',passenger:p});assert.equal(passenger.state.passengers.at(-1).createdAt,now.toISOString());
});
test('GPS bruto preserva coordenadas/deviceAt e calcula qualidade/saída do snapshot',async()=>{
  const s=seed(),before=structuredClone(s.locations),point={lat:-23.65001,lng:-46.74999};
  const out=await act(s,{type:'location.update',tripId:'t1',...point,accuracy:99,speed:0,heading:null,deviceAt:now.toISOString()},'driver');const last=out.state.locations.at(-1);
  assert.deepEqual(out.state.locations.slice(0,-1),before);assert.equal(last.lat,point.lat);assert.equal(last.lng,point.lng);assert.equal(last.deviceAt,now.toISOString());assert.equal(last.quality,'poor_accuracy');assert.equal(last.simulated,false);assert.ok(last.offRouteMeters>120);assert.equal(last.offRoute,true);
  await assert.rejects(act(s,{type:'location.update',tripId:'t2',lat:-23.5,lng:-46.6,accuracy:10}));
});
test('relatórios salvam definições estritas, preservam criação e excluem por ID',async()=>{
  const report={name:'Embarques por rota',filters:{from:'2026-10-01',to:'2026-10-31',routeId:'',company:'',driverId:'',vehicleId:'',status:'all',source:'all'},metrics:['boardings','plannedKm'],groupBy:'route',chart:'bar'};
  const created=await act(seed(),{type:'report.save',report});const id=created.extra.id;assert.equal(created.state.savedReports[0].createdAt,now.toISOString());
  const tomorrow=new Date(now.getTime()+86_400_000),edited=await act(created.state,{type:'report.save',report:{...report,id,name:'Novo título'}},'admin',tomorrow);assert.equal(edited.state.savedReports[0].createdAt,now.toISOString());assert.equal(edited.state.savedReports[0].updatedAt,tomorrow.toISOString());
  const deleted=await act(edited.state,{type:'report.delete',id});assert.equal(deleted.state.savedReports.length,0);
  await assert.rejects(act(seed(),{type:'report.save',report},'driver'));await assert.rejects(act(seed(),{type:'report.save',report:{...report,metrics:['unknown']}}));await assert.rejects(act(seed(),{type:'report.save',report:{...report,filters:{...report.filters,sql:'raw'}}}));
});
test('limites de geometria e campos extras rejeitam sem truncar histórico',async()=>{
  const s=seed();await assert.rejects(act(s,{type:'route.save',route:{...s.routes[3],geometry:Array.from({length:5001},()=>[-23.5,-46.6])}}));
  await assert.rejects(act(s,{type:'location.update',tripId:'t1',lat:91,lng:-46,accuracy:2}));await assert.rejects(act(s,{type:'route.toggle',id:'r4',owner:'outro'}));
});
test('identidade local permanece restrita e header matrícula é validado',()=>{
  const old=process.env.NODE_ENV;process.env.NODE_ENV='production';assert.throws(()=>requestOwner(new Request('http://localhost/api/state')));
  assert.equal(requestOwner(new Request('https://piloto.exemplo/api/state',{headers:{'oai-authenticated-user-id':'alice'}})),'user:alice');
  process.env.NODE_ENV='development';assert.equal(requestOwner(new Request('http://localhost/api/state')),'development:local-preview');assert.throws(()=>requestOwner(new Request('https://piloto.exemplo/api/state')));
  assert.equal(requestRegistration(new Request('http://localhost',{headers:{'x-vertice-registration':'mot-002'}})),'MOT-002');assert.throws(()=>requestRegistration(new Request('http://localhost',{headers:{'x-vertice-registration':'bad value'}})));assert.throws(()=>requestRole(new Request('http://localhost')));
  assert.throws(()=>checkOrigin(new Request('https://piloto.exemplo/api/action',{method:'POST',headers:{origin:'https://outro.exemplo','content-type':'application/json'}})));
  if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;
});

function fakeD1(initial) {
  const rows=new Map(Object.entries(initial).map(([owner,s])=>[owner,{data:JSON.stringify(s),version:s.version}]));
  return {rows,prepare(query) {return {bind(...args) {return {
    async first() {return structuredClone(rows.get(args[0])??null);},
    async run() {if(query.startsWith('INSERT')){if(!rows.has(args[0]))rows.set(args[0],{data:args[1],version:1});return {meta:{changes:1}};}
      const [data,version,owner,previous]=args,row=rows.get(owner);if(!row||row.version!==previous)return {meta:{changes:0}};rows.set(owner,{data,version});return {meta:{changes:1}};},
  };}};}};
}
test('CAS concorrente aceita um embarque por ator e preserva isolamento do dono',async()=>{
  const q=await act(seed(),{type:'trip.qr.issue',tripId:'t1'},'driver',new Date());const db=fakeD1({alice:q.state,bob:seed()});env.DB=db;
  const a={type:'boarding.scan',token:q.extra.token};const results=await Promise.allSettled([mutateWorkspace('alice',a,'passenger','NX-1001'),mutateWorkspace('alice',a,'passenger','NX-1001')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const alice=JSON.parse(db.rows.get('alice').data),bob=JSON.parse(db.rows.get('bob').data);assert.equal(alice.events.filter(e=>e.tripId==='t1'&&e.passengerId==='p1'&&e.kind==='boarding').length,1);assert.equal(bob.events.filter(e=>e.tripId==='t1'&&e.passengerId==='p1'&&e.kind==='boarding').length,0);
});
test('CAS lote concorrente não duplica nem grava parte de um lote inválido',async()=>{
  const db=fakeD1({alice:seed()});env.DB=db;const a=batch(['p7','p13'],{note:'Desembarque conferido visualmente no ponto'});
  const results=await Promise.allSettled([mutateWorkspace('alice',a,'driver','MOT-001'),mutateWorkspace('alice',a,'driver','MOT-001')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const s=JSON.parse(db.rows.get('alice').data);assert.equal(s.events.filter(e=>e.source==='driver_batch').length,2);const before=db.rows.get('alice').data;
  await assert.rejects(mutateWorkspace('alice',batch(['p19','p1'],{note:'Conferência do lote antes de salvar'}),'driver','MOT-001'));assert.equal(db.rows.get('alice').data,before);
});
test('loadWorkspace normaliza dados D1 legados sem inventar data',async()=>{
  const s=seed();delete s.drivers[0].registration;delete s.drivers[0].createdAt;delete s.passengers[0].destinationStopId;delete s.passengers[0].createdAt;delete s.trips[0].routeSnapshot;
  env.DB=fakeD1({legacy:s});const result=await loadWorkspace('legacy');assert.equal(result.drivers[0].registration,'MOT-001');assert.equal(result.drivers[0].createdAt,undefined);assert.equal(result.passengers[0].createdAt,undefined);assert.equal(result.passengers[0].destinationStopId,'s14');assert.equal(result.trips[0].legacySnapshot,true);
});
