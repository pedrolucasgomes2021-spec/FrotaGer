import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import ts from 'typescript';

// Pure calculations run without Next, a browser, a database or React.
const dir=new URL('../work/reporting-tests/',import.meta.url);
await mkdir(dir,{recursive:true});
for(const name of ['geo','reporting']){
  const raw=await readFile(new URL(`../app/${name}.ts`,import.meta.url),'utf8');
  let output=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  output=output.replaceAll("'./geo'","'./geo.mjs'");
  await writeFile(new URL(`${name}.mjs`,dir),output);
}
const {buildReport,createReportExport,createCsv,csvCell,localTimestamp,odometerDistance,peakOccupancy,reportDateBounds,saoPauloDate,validReportDate,inReportPeriod,reportDefinitionJson,formatReportValue}=await import(new URL('reporting.mjs',dir));
const {assessGpsTrack}=await import(new URL('geo.mjs',dir));
const filters=()=>({from:'2026-10-22',to:'2026-10-22',routeId:'',company:'',driverId:'',vehicleId:'',status:'',source:''});
function fixture(){
  const route={id:'r1',code:'01',name:'Rota original',origin:'Centro',destination:'Fábrica',departure:'07:00',returnTime:'17:00',distance:12.123456789,duration:40,company:'Empresa original',color:'#45cc99',stops:[{id:'s1',name:'Ponto original',lat:-23.5,lng:-46.6,time:'07:00'},{id:'s2',name:'Fábrica',lat:-23.51,lng:-46.61,time:'07:40'}],active:true,revision:1};
  const driver={id:'d1',name:'Motorista original',phone:'11999999999',license:'D1'},vehicle={id:'v1',plate:'ABC1D23',model:'Van',capacity:4,year:2026,status:'available'};
  const trip={id:'t1',routeId:'r1',driverId:'d1',vehicleId:'v1',date:'2026-10-22',departure:'07:00',status:'completed',startedAt:'2026-10-22T10:03:00.000Z',endedAt:'2026-10-22T10:40:00.000Z',startOdometerKm:100.1,endOdometerKm:112.23456789,routeSnapshot:structuredClone(route),driverSnapshot:structuredClone(driver),vehicleSnapshot:structuredClone(vehicle)};
  const passengers=Array.from({length:5},(_,i)=>({id:`p${i+1}`,name:`Pessoa ${i+1}`,email:`p${i+1}@test.com`,registration:`M${i+1}`,company:'Empresa original',routeId:'r1',stopId:'s1',active:true,...(i===4?{}:{createdAt:i===3?'2026-10-22T02:59:59.999Z':'2026-10-22T15:00:00.000Z'})}));
  const events=[['e1','p1','boarding','10:00:00','qr'],['e2','p2','boarding','10:01:00','qr'],['e3','p1','alighting','10:02:00','driver_batch'],['e4','p3','boarding','10:03:00','manual'],['e5','p2','alighting','10:04:00','driver_batch'],['e6','p3','alighting','10:05:00','driver_batch']].map(([id,passengerId,kind,at,source])=>({id,tripId:'t1',passengerId,kind,at:`2026-10-22T${at}.000Z`,source,stopId:'s1'}));
  return {workspace:{name:'Teste',demo:false},routes:[route],drivers:[driver],vehicles:[vehicle],passengers,trips:[trip],bookings:[{id:'b1',tripId:'t1',passengerId:'p1',status:'boarded',createdAt:'2026-10-21T10:00:00Z'},{id:'b2',tripId:'t1',passengerId:'p2',status:'confirmed',createdAt:'2026-10-21T10:00:00Z'},{id:'b3',tripId:'t1',passengerId:'p4',status:'confirmed',createdAt:'2026-10-21T10:00:00Z'},{id:'b4',tripId:'t1',passengerId:'p5',status:'cancelled',createdAt:'2026-10-21T10:00:00Z'}],events,locations:[],messages:[],settings:{emailAlerts:false,approachAlerts:false,defaultCapacity:4},version:1};
}
const point=(id,at,lat,lng,extra={})=>({id,tripId:'t1',at:`2026-10-22T${at}.000Z`,lat,lng,accuracy:5,speed:null,heading:null,...extra});

test('intervalo usa meia-noite de São Paulo, inclusivo no início e exclusivo após o último dia',()=>{
  const f=filters(),bounds=reportDateBounds(f.from,f.to);
  assert.equal(new Date(bounds.start).toISOString(),'2026-10-22T03:00:00.000Z');
  assert.equal(new Date(bounds.end).toISOString(),'2026-10-23T03:00:00.000Z');
  assert.equal(inReportPeriod('2026-10-22T02:59:59.999Z',f),false);
  assert.equal(inReportPeriod('2026-10-22T03:00:00.000Z',f),true);
  assert.equal(inReportPeriod('2026-10-23T02:59:59.999Z',f),true);
  assert.equal(inReportPeriod('2026-10-23T03:00:00.000Z',f),false);
  assert.equal(saoPauloDate('2026-10-23T01:00:00Z'),'2026-10-22');
  assert.equal(localTimestamp('2026-10-23T01:00:00.123Z'),'2026-10-22T22:00:00.123-03:00');
  assert.equal(validReportDate('2026-02-30'),false);assert.equal(validReportDate('2024-02-29'),true);
  assert.throws(()=>reportDateBounds('2026-10-23','2026-10-22'),/inicial/);
  // A primeira hora de 04/11/2018 foi pulada pelo horário de verão local.
  const daylight=reportDateBounds('2018-11-04','2018-11-04');
  assert.equal(new Date(daylight.start).toISOString(),'2018-11-04T03:00:00.000Z');
  assert.equal(new Date(daylight.end).toISOString(),'2018-11-05T02:00:00.000Z');
  assert.equal(daylight.end-daylight.start,23*60*60_000);
});

test('todos os filtros selecionam a mesma coorte de viagens e eventos respeitam o horário local',()=>{
  const state=fixture();state.trips.push({...structuredClone(state.trips[0]),id:'t2',routeId:'r2',driverId:'d2',vehicleId:'v2',status:'scheduled',routeSnapshot:{...state.routes[0],id:'r2',company:'Outra empresa'}});
  state.events.push({id:'before',tripId:'t1',kind:'incident',at:'2026-10-22T02:59:59Z',source:'manual'},{id:'after',tripId:'t1',kind:'incident',at:'2026-10-23T03:00:00Z',source:'manual'},{id:'inside',tripId:'t1',kind:'incident',at:'2026-10-23T02:59:59Z',source:'manual'},{id:'other',tripId:'t2',kind:'incident',at:'2026-10-22T15:00:00Z',source:'manual'});
  const report=buildReport(state,{...filters(),routeId:'r1',company:'Empresa original',driverId:'d1',vehicleId:'v1',status:'completed'});
  assert.deepEqual(report.trips.map(r=>r.trip.id),['t1']);assert.equal(report.values.incidents,1);assert.ok(report.events.some(e=>e.id==='inside'));
  for(const [key,value] of [['routeId','missing'],['company','Outra empresa'],['driverId','d2'],['vehicleId','v2'],['status','scheduled']])assert.equal(buildReport(state,{...report.filters,[key]:value}).trips.length,0);
  const invalid=buildReport(state,{...filters(),from:'2026-99-99'});assert.ok(invalid.error);assert.equal(invalid.trips.length,0);assert.equal(invalid.values.gpsKm,null);
});

test('retratos históricos prevalecem sobre alterações atuais em nome, capacidade, empresa e distância',()=>{
  const state=fixture();state.routes[0].name='Rota alterada';state.routes[0].company='Empresa alterada';state.routes[0].distance=99;state.drivers[0].name='Nome alterado';state.vehicles[0].capacity=40;state.vehicles[0].plate='NEW0A00';
  const report=buildReport(state,{...filters(),company:'Empresa original'}),row=report.trips[0];
  assert.equal(row.route.name,'Rota original');assert.equal(row.driver.name,'Motorista original');assert.equal(row.vehicle.capacity,4);assert.equal(report.values.plannedKm,12.123456789);assert.equal(report.values.occupancy,50);assert.equal(report.coverage.legacy,0);
  const exported=createReportExport(state,report,'trips');assert.ok(exported.csv.includes('Rota original'));assert.ok(exported.csv.includes('ABC1D23'));assert.ok(!exported.csv.includes('Rota alterada'));assert.ok(exported.csv.includes('12.123456789'));
  delete state.trips[0].vehicleSnapshot;assert.equal(buildReport(state,filters()).coverage.legacy,1);
});

test('hodômetro e medições ausentes mantêm null, zero medido é legítimo e cobertura é explícita',()=>{
  const state=fixture();delete state.trips[0].startOdometerKm;delete state.trips[0].endOdometerKm;
  let report=buildReport(state,filters());assert.equal(report.values.odometerKm,null);assert.equal(report.values.gpsKm,null);assert.equal(report.coverage.odometer,0);assert.equal(report.coverage.gps,0);assert.equal(formatReportValue(null,'gpsKm'),'Sem medição');
  assert.equal(odometerDistance({startOdometerKm:10,endOdometerKm:9}),null);assert.equal(odometerDistance({startOdometerKm:0,endOdometerKm:0}),0);assert.equal(odometerDistance({startOdometerKm:10}),null);
  state.trips[0].startOdometerKm=10;state.trips[0].endOdometerKm=10;report=buildReport(state,filters());assert.equal(report.values.odometerKm,0);assert.equal(report.coverage.odometer,1);
});

test('pico é reconstruído com pessoas a bordo e passageiros únicos não somam viagens ou eventos',()=>{
  const state=fixture(),base=buildReport(state,filters());assert.equal(base.values.boardings,3);assert.equal(base.values.alightings,3);assert.equal(base.values.uniquePassengers,3);assert.equal(base.trips[0].peakPassengers,2);assert.equal(base.values.occupancy,50);
  state.trips.push({...structuredClone(state.trips[0]),id:'t2'});state.events.push({id:'again',tripId:'t2',passengerId:'p1',kind:'boarding',at:'2026-10-22T17:00:00Z',source:'qr'});
  const report=buildReport(state,filters(),'vehicle');assert.equal(report.values.boardings,4);assert.equal(report.values.uniquePassengers,3);assert.equal(report.values.occupancy,(50+25)/2);
  const duplicate=[...state.events.filter(e=>e.tripId==='t1'),{...state.events[0],id:'duplicate'}];assert.equal(peakOccupancy(duplicate,4).peak,2);assert.deepEqual(peakOccupancy([],4),{peak:null,percent:null});
});

test('ausências usam somente reservas elegíveis de viagens concluídas e ignoram canceladas',()=>{
  const state=fixture();let report=buildReport(state,filters());assert.equal(report.values.noShows,1);
  state.bookings.push({id:'alreadyMarked',tripId:'t1',passengerId:'missingEvent',status:'boarded',createdAt:'2026-10-22T10:00:00Z'});report=buildReport(state,filters());assert.equal(report.values.noShows,2);
  state.trips[0].status='scheduled';report=buildReport(state,filters());assert.equal(report.values.noShows,null);assert.equal(report.coverage.completed,0);
});

test('origem restringe eventos e pessoas sem adulterar total de viagens ou quilometragem',()=>{
  const state=fixture(),all=buildReport(state,filters()),qr=buildReport(state,{...filters(),source:'qr'});
  assert.equal(qr.values.boardings,2);assert.equal(qr.values.alightings,0);assert.equal(qr.values.uniquePassengers,2);assert.equal(qr.values.trips,all.values.trips);assert.equal(qr.values.plannedKm,all.values.plannedKm);assert.equal(qr.values.odometerKm,all.values.odometerKm);assert.equal(qr.values.noShows,null);assert.equal(qr.values.occupancy,null);assert.equal(qr.coverage.occupancy,0);
  assert.ok(qr.events.every(e=>e.source==='qr'));assert.deepEqual(qr.passengers.map(p=>p.id),['p1','p2']);assert.equal(createReportExport(state,qr,'events').count,2);
  assert.equal(buildReport(state,{...filters(),status:'all',source:'all'}).values.boardings,all.values.boardings);
});

test('cadastros no período usam createdAt conhecido e filtros de viagem restringem a coorte',()=>{
  const state=fixture(),all=buildReport(state,filters());assert.equal(all.values.registeredPassengers,3);assert.equal(all.unknownRegistrationDates,1);
  const filtered=buildReport(state,{...filters(),driverId:'d1'});assert.equal(filtered.values.registeredPassengers,3); // p1,p2 reservados; p3 tem evento.
  const missing=buildReport(state,{...filters(),driverId:'not-present'});assert.equal(missing.values.registeredPassengers,0);
  const source=buildReport(state,{...filters(),source:'manual'});assert.equal(source.values.registeredPassengers,1);assert.equal(source.registrations[0].id,'p3');
  const unrelated={...state.passengers[0],id:'new-without-trip',createdAt:'2026-10-22T12:00:00Z'};state.passengers.push(unrelated);assert.equal(buildReport(state,filters()).values.registeredPassengers,4);assert.equal(buildReport(state,{...filters(),driverId:'d1'}).values.registeredPassengers,3);
  state.trips=[];state.events=[];state.bookings=[];const onlyRegistered=buildReport(state,filters(),'day');assert.equal(onlyRegistered.groups.length,1);assert.equal(onlyRegistered.groups[0].values.trips,0);assert.equal(onlyRegistered.groups[0].values.registeredPassengers,4);
});

test('GPS separa segmentos, exclui simulações, baixa precisão e saltos, sem criar percurso ausente',()=>{
  const state=fixture();state.locations=[point('a','10:00:00',-23.5,-46.6),point('b','10:00:10',-23.5001,-46.6),point('sim','10:00:20',-23.5002,-46.6,{simulated:true}),point('poor','10:00:25',-23.5003,-46.6,{accuracy:100}),point('marked-jump','10:00:30',-23.5,-46.7,{quality:'jump'}),point('jump','10:00:35',-24.5,-46.6),point('gap','10:10:00',-23.51,-46.6),point('after-gap','10:10:10',-23.5101,-46.6)];
  const assessed=assessGpsTrack(state.locations),report=buildReport(state,filters());assert.equal(report.values.gpsKm,assessed.distanceKm);assert.equal(report.coverage.gps,1);assert.equal(report.coverage.gpsRejected,4);assert.equal(report.coverage.gpsAccepted,4);assert.equal(report.coverage.gpsGaps,1);assert.equal(report.coverage.gpsSimulated,1);assert.ok(report.values.gpsKm>0.02&&report.values.gpsKm<0.03);
  state.locations=state.locations.filter(l=>l.simulated);const onlySimulated=buildReport(state,filters());assert.equal(onlySimulated.values.gpsKm,null);assert.equal(onlySimulated.coverage.gps,0);
});

test('CSV preserva números brutos, UTC+local e BOM e neutraliza fórmulas sem alterar números negativos',()=>{
  const state=fixture();state.events[0].lat=-23.500000123456;state.events[0].lng=-46.600000987654;state.events[0].accuracy=7.123456789;state.events[0].passengerName='=HYPERLINK("https://invalid")';state.events[0].note=' \t=1+1';
  const report=buildReport(state,filters()),exported=createReportExport(state,report,'events');assert.equal(exported.csv.charCodeAt(0),0xfeff);assert.ok(exported.csv.includes('"-23.500000123456"'));assert.ok(exported.csv.includes('"7.123456789"'));assert.ok(exported.csv.includes('2026-10-22T07:00:00.000-03:00'));assert.ok(exported.csv.includes("' =")===false);assert.ok(exported.csv.includes("'=HYPERLINK"));assert.ok(exported.csv.includes("' \t=1+1"));
  for(const formula of ['=1+1','+1+1','-1+1','@SUM(A1:A2)','  =1','\t=1','\r=1','\n=1'])assert.ok(csvCell(formula).startsWith('"\''));
  assert.equal(csvCell(-23.5),'"-23.5"');assert.equal(csvCell(null),'""');assert.equal(csvCell('a"b'),'"a""b"');assert.ok(createCsv(['A'],[[1]]).startsWith('\uFEFF"A"'));
});

test('cada conjunto exportado respeita filtros e mantém volumes e medições ausentes',()=>{
  const state=fixture();state.locations=[point('in','10:00:00',-23.5000001234,-46.6000004321),{...point('out','10:01:00',-23.5,-46.6),tripId:'outside'}];
  state.trips.push({...structuredClone(state.trips[0]),id:'outside',driverId:'d2'});state.events.push({...state.events[0],id:'outside-event',tripId:'outside'});
  const report=buildReport(state,{...filters(),driverId:'d1'});
  const events=createReportExport(state,report,'events'),trips=createReportExport(state,report,'trips'),people=createReportExport(state,report,'passengers'),gps=createReportExport(state,report,'gps'),aggregate=createReportExport(state,report,'aggregate',['boardings','gpsKm']);
  assert.equal(events.count,6);assert.equal(trips.count,1);assert.equal(gps.count,1);assert.equal(aggregate.count,1);assert.ok(people.rows.every(row=>row[0]!=='p5'));assert.ok(!events.csv.includes('outside-event'));assert.ok(!gps.csv.includes('"out"'));assert.ok(gps.csv.includes('-23.5000001234'));assert.equal(report.values.gpsKm,null);assert.equal(aggregate.rows[0][3],null);
  const exported=JSON.parse(reportDefinitionJson(report.filters,['boardings'],'driver','table','Minha visão'));assert.equal(exported.timeZone,'America/Sao_Paulo');assert.equal(exported.filters.driverId,'d1');assert.deepEqual(exported.metrics,['boardings']);assert.ok(exported.notes.length);
});

test('exportação da coorte preserva passageiros da viagem mesmo com rota ou empresa atuais alteradas',()=>{
  const state=fixture();state.passengers[0].routeId='new-route';state.passengers[0].company='Nova empresa';
  const report=buildReport(state,{...filters(),routeId:'r1',company:'Empresa original'});
  assert.equal(report.values.uniquePassengers,3);assert.ok(report.passengers.some(p=>p.id==='p1'));assert.ok(!report.registrations.some(p=>p.id==='p1'));
  const out=createReportExport(state,report,'passengers');assert.ok(out.rows.some(row=>row[0]==='p1'&&row[4]==='Nova empresa'));
});

test('cadastro agrupado por motorista com origem específica exige evento dessa origem no grupo',()=>{
  const state=fixture();state.trips.push({...structuredClone(state.trips[0]),id:'t2',driverId:'d2',driverSnapshot:{...state.drivers[0],id:'d2',name:'Outro motorista'}});
  state.events.push({id:'manual-other',tripId:'t2',passengerId:'p1',kind:'boarding',at:'2026-10-22T16:00:00Z',source:'manual'});
  const report=buildReport(state,{...filters(),source:'qr'},'driver');
  assert.equal(report.groups.find(g=>g.id==='d1').values.registeredPassengers,2);assert.equal(report.groups.find(g=>g.id==='d2').values.registeredPassengers,0);assert.equal(report.values.registeredPassengers,2);
});
