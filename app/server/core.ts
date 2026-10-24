import { z } from 'zod';
import type { Action, Role, State, Trip, Passenger, Booking, Route, TripEvent } from '../types';
import { haversineMeters, pointToPolylineMeters, geometryDistanceKm } from '../geo';

export class ApiError extends Error {
  status: number;
  constructor(message:string,status=400) {super(message);this.name='ApiError';this.status=status;}
}
type QrToken = {token:string;tripId:string;expiresAt:string;purpose:'trip_boarding';usedPassengerIds:string[]};
type Audit = {id:string;at:string;role:Role;action:string;entityId?:string;actorRegistration?:string};
export type InternalState = State & {qrTokens?:QrToken[];audit?:Audit[]};
const id = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const short = z.string().trim().min(1).max(140);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/,'Horário inválido.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(`${v}T12:00:00Z`))&&new Date(`${v}T12:00:00Z`).toISOString().startsWith(v),'Data inválida.');
const lat = z.number().finite().min(-90).max(90), lng = z.number().finite().min(-180).max(180);
const stop = z.object({id,name:short,lat,lng,time}).strict();
const createdAt=z.string().datetime().optional();
const registration=z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9_-]+$/,'Use letras, números, hífen ou sublinhado.');
const route = z.object({id:id.optional(),code:short,name:short,origin:short,destination:short,departure:time,returnTime:time,distance:z.number().min(0).max(1500),duration:z.number().int().min(1).max(1440),company:short,color:z.string().regex(/^#[0-9a-fA-F]{6}$/),stops:z.array(stop).min(2).max(60),active:z.boolean(),geometry:z.array(z.tuple([lat,lng])).min(2).max(5000).optional(),geometrySource:z.enum(['kml','gpx','geojson','stops']).optional(),geometryName:z.string().trim().max(240).optional(),gpsToleranceMeters:z.number().min(10).max(1000).optional(),revision:z.number().int().min(1).max(1_000_000).optional()}).strict();
const passenger = z.object({id:id.optional(),name:short,email:z.string().trim().email().max(240),registration,company:short,routeId:id,stopId:id,destinationStopId:id.optional(),active:z.boolean(),createdAt}).strict();
const vehicle = z.object({id:id.optional(),plate:z.string().trim().min(6).max(12),model:short,capacity:z.number().int().min(1).max(80),year:z.number().int().min(1990).max(2100),status:z.enum(['available','maintenance']),createdAt}).strict();
const driver = z.object({id:id.optional(),name:short,phone:z.string().trim().min(8).max(40),license:z.string().trim().min(3).max(100),registration:registration.optional(),active:z.boolean().optional(),createdAt}).strict().refine(d=>!!d.id||!!d.registration,'Informe a matrícula do novo motorista.');
const eventKind = z.enum(['boarding','alighting']);
const odometerKm=z.number().finite().min(0).max(10_000_000).optional();
const reportFilters=z.object({from:date.or(z.literal('')),to:date.or(z.literal('')),routeId:z.string().max(100),company:z.string().max(140),driverId:z.string().max(100),vehicleId:z.string().max(100),status:z.enum(['','all','scheduled','in_progress','completed']),source:z.enum(['','all','qr','manual','system','driver_batch'])}).strict().refine(f=>!f.from||!f.to||f.from<=f.to,'O início deve ser anterior ao fim.');
const report=z.object({id:id.optional(),name:short,filters:reportFilters,metrics:z.array(z.enum(['plannedKm','odometerKm','gpsKm','boardings','alightings','uniquePassengers','registeredPassengers','trips','completedTrips','noShows','occupancy','incidents','offRouteSamples'])).min(1).max(14).refine(v=>new Set(v).size===v.length,'Métricas duplicadas.'),groupBy:z.enum(['route','day','company','driver','vehicle']),chart:z.enum(['bar','line','table']),createdAt,updatedAt:z.string().datetime().optional()}).strict();
const schemas: Record<string,z.ZodTypeAny> = {
  'route.save':z.object({type:z.literal('route.save'),route}).strict(),
  'route.toggle':z.object({type:z.literal('route.toggle'),id}).strict(),
  'passenger.save':z.object({type:z.literal('passenger.save'),passenger}).strict(),
  'passenger.toggle':z.object({type:z.literal('passenger.toggle'),id}).strict(),
  'vehicle.save':z.object({type:z.literal('vehicle.save'),vehicle}).strict(),
  'driver.save':z.object({type:z.literal('driver.save'),driver}).strict(),
  'trip.create':z.object({type:z.literal('trip.create'),trip:z.object({routeId:id,driverId:id,vehicleId:id,date,departure:time}).strict()}).strict(),
  'trip.start':z.object({type:z.literal('trip.start'),tripId:id,odometerKm}).strict(),
  'trip.finish':z.object({type:z.literal('trip.finish'),tripId:id,odometerKm}).strict(),
  'booking.create':z.object({type:z.literal('booking.create'),tripId:id,passengerId:id}).strict(),
  'booking.cancel':z.object({type:z.literal('booking.cancel'),id}).strict(),
  'trip.qr.issue':z.object({type:z.literal('trip.qr.issue'),tripId:id}).strict(),
  'boarding.scan':z.object({type:z.literal('boarding.scan'),token:z.string().min(32).max(256),passengerId:id.optional()}).strict(),
  'alighting.batch':z.object({type:z.literal('alighting.batch'),tripId:id,stopId:id,passengerIds:z.array(id).min(1).max(80).refine(ids=>new Set(ids).size===ids.length,'Passageiros duplicados no lote.'),confirmation:z.literal(true),note:z.string().trim().max(1000).optional()}).strict(),
  'boarding.manual':z.object({type:z.literal('boarding.manual'),tripId:id,passengerId:id,kind:eventKind,note:z.string().trim().min(5).max(1000)}).strict(),
  'location.update':z.object({type:z.literal('location.update'),tripId:id,lat,lng,accuracy:z.number().min(0).max(50_000),speed:z.number().min(0).max(100).nullable().optional(),heading:z.number().min(0).max(360).nullable().optional(),deviceAt:z.string().datetime().optional()}).strict(),
  'incident.create':z.object({type:z.literal('incident.create'),tripId:id,note:z.string().trim().min(5).max(2000)}).strict(),
  'message.send':z.object({type:z.literal('message.send'),title:short,body:z.string().trim().min(1).max(4000),audience:z.enum(['all','drivers','passengers'])}).strict(),
  'settings.save':z.object({type:z.literal('settings.save'),settings:z.object({emailAlerts:z.boolean(),approachAlerts:z.boolean(),defaultCapacity:z.number().int().min(1).max(80),name:short.optional()}).strict()}).strict(),
  'report.save':z.object({type:z.literal('report.save'),report}).strict(),
  'report.delete':z.object({type:z.literal('report.delete'),id}).strict(),
};
const adminActions = new Set(['route.save','route.toggle','passenger.save','passenger.toggle','vehicle.save','driver.save','trip.create','message.send','settings.save','report.save','report.delete']);
const operationalActions = new Set(['trip.start','trip.finish','trip.qr.issue','alighting.batch','boarding.manual','location.update','incident.create']);
function requireThat(condition:unknown,message:string,status=409): asserts condition {if(!condition)throw new ApiError(message,status);}
function uniqueId(prefix:string) {return `${prefix}-${crypto.randomUUID()}`;}
function findTrip(s:InternalState,tripId:string) {const t=s.trips.find(t=>t.id===tripId);requireThat(t,'Viagem não encontrada.',404);return t;}
function findPassenger(s:InternalState,passengerId:string) {const p=s.passengers.find(p=>p.id===passengerId);requireThat(p,'Passageiro não encontrado.',404);return p;}
const sameRegistration=(a:string|undefined,b:string)=>a?.toUpperCase()===b.toUpperCase();
function driverActor(s:InternalState,actorRegistration?:string) {
  const actor=actorRegistration?s.drivers.find(d=>sameRegistration(d.registration,actorRegistration)):s.drivers.find(d=>d.id==='d1');
  requireThat(actor&&actor.active!==false,'Matrícula de motorista não encontrada ou inativa.',403);return actor;
}
function passengerActor(s:InternalState,actorRegistration?:string) {
  const actor=actorRegistration?s.passengers.find(p=>sameRegistration(p.registration,actorRegistration)):s.passengers.find(p=>p.id==='p1');
  requireThat(actor?.active,'Matrícula de passageiro não encontrada ou inativa.',403);return actor;
}
function authorizeTrip(s:InternalState,role:Role,t:Trip,actorRegistration?:string) {if(role==='driver')requireThat(t.driverId===driverActor(s,actorRegistration).id,'Este perfil de demonstração opera somente as viagens da matrícula selecionada.',403);}
function authorizePassenger(s:InternalState,role:Role,passengerId:string,actorRegistration?:string) {if(role==='passenger')requireThat(passengerId===passengerActor(s,actorRegistration).id,'Este perfil de demonstração opera somente o passageiro da matrícula selecionada.',403);}
function snapshot(s:InternalState,t:Trip,legacy=false) {
  const r=s.routes.find(r=>r.id===t.routeId),d=s.drivers.find(d=>d.id===t.driverId),v=s.vehicles.find(v=>v.id===t.vehicleId);
  let filled=false;
  if(!t.routeSnapshot&&r){t.routeSnapshot=structuredClone(r);filled=true;}
  if(!t.driverSnapshot&&d){t.driverSnapshot=structuredClone(d);filled=true;}
  if(!t.vehicleSnapshot&&v){t.vehicleSnapshot=structuredClone(v);filled=true;}
  if(filled&&legacy)t.legacySnapshot=true;
}
function tripRoute(s:InternalState,t:Trip):Route {const r=t.routeSnapshot??s.routes.find(r=>r.id===t.routeId);requireThat(r,'Rota não encontrada.',404);return r;}
function destination(route:Route,p:Passenger) {
  const from=route.stops.findIndex(stop=>stop.id===p.stopId),to=route.stops.findIndex(stop=>stop.id===p.destinationStopId);
  requireThat(from>=0&&to>from,'O destino deve ser um ponto posterior ao embarque na rota.',400);
  return p.destinationStopId!;
}
export function normalizeState(original:InternalState):InternalState {
  const s=structuredClone(original);
  const used=new Set(s.drivers.map(d=>d.registration?.toUpperCase()).filter(Boolean));
  let sequence=1;
  for(const d of s.drivers) {
    if(!d.registration) {let next:string;do{next=`MOT-${String(sequence++).padStart(3,'0')}`;}while(used.has(next));d.registration=next;used.add(next);}
    if(d.active===undefined)d.active=true;
  }
  for(const p of s.passengers)if(!p.destinationStopId)p.destinationStopId=s.routes.find(r=>r.id===p.routeId)?.stops.at(-1)?.id;
  for(const t of s.trips)snapshot(s,t,true);
  for(const b of s.bookings)if(!b.destinationStopId) {
    const t=s.trips.find(t=>t.id===b.tripId),p=s.passengers.find(p=>p.id===b.passengerId);
    const r=t?.routeSnapshot;
    b.destinationStopId=r?.stops.some(stop=>stop.id===p?.destinationStopId)?p?.destinationStopId:r?.stops.at(-1)?.id;
  }
  // Tokens do fluxo antigo não podem sobreviver à migração para QR da viagem.
  s.qrTokens=(s.qrTokens??[]).filter(q=>q.purpose==='trip_boarding'&&Array.isArray(q.usedPassengerIds));
  s.savedReports??=[];
  return s;
}
function eligible(s:InternalState,t:Trip,p:Passenger) {
  requireThat(p.active,'Passageiro inativo.');
  requireThat(p.routeId===t.routeId,'Passageiro não autorizado para esta rota.',403);
  const r=tripRoute(s,t);
  requireThat(s.routes.some(route=>route.id===t.routeId&&route.active),'A rota está inativa.');
  requireThat(r.stops.some(stop=>stop.id===p.stopId),'O ponto do passageiro não pertence à rota.');
  destination(r,p);
}
function currentBooking(s:InternalState,tripId:string,passengerId:string):Booking {const b=s.bookings.find(b=>b.tripId===tripId&&b.passengerId===passengerId&&b.status!=='cancelled');requireThat(b,'É necessária uma reserva confirmada para esta viagem.');return b;}
function onboard(s:InternalState,tripId:string) {const ids=new Set<string>();s.events.filter(e=>e.tripId===tripId).forEach(e=>{if(e.passengerId&&e.kind==='boarding')ids.add(e.passengerId);if(e.passengerId&&e.kind==='alighting')ids.delete(e.passengerId);});return ids;}
function checkCapacity(s:InternalState,t:Trip) {const v=t.vehicleSnapshot??s.vehicles.find(v=>v.id===t.vehicleId);requireThat(v,'Veículo não encontrado.',404);return v.capacity;}
function active(t:Trip) {requireThat(t.status==='in_progress','A viagem precisa estar em andamento.');}
function checkEvent(s:InternalState,t:Trip,p:Passenger,kind:'boarding'|'alighting') {
  active(t);eligible(s,t,p);const b=currentBooking(s,t.id,p.id);
  const history=s.events.filter(e=>e.tripId===t.id&&e.passengerId===p.id);
  if(kind==='boarding') {
    requireThat(!history.some(e=>e.kind==='boarding'),'Embarque já registrado nesta viagem.');
    requireThat(onboard(s,t.id).size<checkCapacity(s,t),'Capacidade máxima do veículo atingida.');
  } else {
    requireThat(history.some(e=>e.kind==='boarding'),'Registre o embarque antes do desembarque.');
    requireThat(!history.some(e=>e.kind==='alighting'),'Desembarque já registrado nesta viagem.');
  }
  return b;
}
function checkSchedule(s:InternalState,entry:{id?:string;routeId:string;driverId:string;vehicleId:string;date:string;departure:string}) {
  const r=s.routes.find(r=>r.id===entry.routeId);
  requireThat(r?.active,'Selecione uma rota ativa.');
  requireThat(s.drivers.some(d=>d.id===entry.driverId&&d.active!==false),'Motorista não encontrado ou inativo.',404);
  requireThat(s.vehicles.some(v=>v.id===entry.vehicleId&&v.status==='available'),'Veículo indisponível.');
  const start=Date.parse(`${entry.date}T${entry.departure}:00-03:00`),end=start+r.duration*60_000;
  requireThat(!s.trips.some(t=>{
    if(t.id===entry.id||t.status==='completed'||(t.driverId!==entry.driverId&&t.vehicleId!==entry.vehicleId))return false;
    const ts=Date.parse(`${t.date}T${t.departure}:00-03:00`),tr=t.routeSnapshot??s.routes.find(r=>r.id===t.routeId);
    return start<ts+(tr?.duration??60)*60_000&&end>ts;
  }),'Motorista ou veículo já alocado em uma viagem neste horário.');
}
export function publicState(s:InternalState):State {
  const {qrTokens:_tokens,audit:_audit,...state}=s;
  return structuredClone(state);
}
export async function applyAction(original:InternalState,raw:Action,role:Role,now=new Date(),actorRegistration?:string):Promise<{state:InternalState;extra:Record<string,unknown>}> {
  requireThat(raw?.type!=='qr.issue'&&raw?.type!=='qr.validate','Fluxo QR antigo desativado. O motorista exibe o QR da viagem (trip.qr.issue) e o passageiro lê para embarcar (boarding.scan).',410);
  const schema=schemas[raw?.type];
  requireThat(schema,'Ação desconhecida.',400);
  const parsed=schema.safeParse(raw);
  if(!parsed.success)throw new ApiError(`Dados inválidos: ${parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).slice(0,4).join('; ')}`,400);
  const a=parsed.data;
  requireThat(!adminActions.has(a.type)||role==='admin','Ação disponível somente no perfil de gestão.',403);
  requireThat(!operationalActions.has(a.type)||role==='admin'||role==='driver','Ação disponível somente para gestão ou motorista.',403);
  requireThat(!['booking.create','booking.cancel','boarding.scan'].includes(a.type)||role==='admin'||role==='passenger','Ação disponível somente para gestão ou passageiro.',403);
  const s=normalizeState(original),at=now.toISOString();
  if(role==='driver')driverActor(s,actorRegistration);
  if(role==='passenger')passengerActor(s,actorRegistration);
  const extra:Record<string,unknown>={};
  s.qrTokens=(s.qrTokens??[]).filter(q=>q.expiresAt>at);
  switch(a.type) {
    case 'route.save': {
      const previous=s.routes.find(r=>r.id===a.route.id);
      const value={...a.route,id:a.route.id??uniqueId('r'),revision:(previous?.revision??0)+1};
      requireThat(!a.route.id||s.routes.some(r=>r.id===a.route.id),'Rota não encontrada.',404);
      requireThat(!s.trips.some(t=>t.routeId===value.id&&t.status==='in_progress'),'Uma rota em viagem ativa não pode ser editada. Encerre a operação antes de alterar o traçado.');
      requireThat(!s.routes.some(r=>r.id!==value.id&&r.code.toLowerCase()===value.code.toLowerCase()),'Código da rota já utilizado.');
      requireThat(new Set(value.stops.map((p:{id:string})=>p.id)).size===value.stops.length,'Os pontos precisam de identificadores únicos.',400);
      for(const p of s.passengers.filter(p=>p.routeId===value.id))destination(value,p);
      if(value.geometry) {
        value.distance=Number(geometryDistanceKm(value.geometry).toFixed(3));
        requireThat(value.distance>0&&value.distance<=1500,'O traçado deve possuir distância válida de até 1.500 km.',400);
        value.geometrySource??='stops';
      }
      value.gpsToleranceMeters??=120;
      const index=s.routes.findIndex(r=>r.id===value.id);if(index>=0)s.routes[index]=value;else s.routes.push(value);extra.id=value.id;break;
    }
    case 'route.toggle': {const r=s.routes.find(r=>r.id===a.id);requireThat(r,'Rota não encontrada.',404);requireThat(!r.active||!s.trips.some(t=>t.routeId===r.id&&t.status==='in_progress'),'Uma rota em operação não pode ser desativada.');r.active=!r.active;break;}
    case 'passenger.save': {
      const previous=s.passengers.find(p=>p.id===a.passenger.id);
      const value={...a.passenger,id:a.passenger.id??uniqueId('p'),registration:a.passenger.registration.toUpperCase(),createdAt:previous?.createdAt??(a.passenger.id?undefined:at)};
      requireThat(!a.passenger.id||s.passengers.some(p=>p.id===a.passenger.id),'Passageiro não encontrado.',404);
      requireThat(!s.passengers.some(p=>p.id!==value.id&&(p.registration.toLowerCase()===value.registration.toLowerCase()||p.email.toLowerCase()===value.email.toLowerCase())),'E-mail ou matrícula já cadastrado.');
      const r=s.routes.find(r=>r.id===value.routeId);requireThat(r,'Rota não encontrada.',404);requireThat(r.stops.some(stop=>stop.id===value.stopId),'Ponto inválido para a rota.',400);
      value.destinationStopId??=r.stops.at(-1)!.id;destination(r,value);
      if(previous) {
        requireThat(!s.trips.some(t=>onboard(s,t.id).has(value.id))||value.active&&value.routeId===previous.routeId&&value.stopId===previous.stopId&&value.destinationStopId===previous.destinationStopId,'Passageiro embarcado: conclua o desembarque antes de inativar ou alterar seus pontos/rota.');
        requireThat(value.routeId===previous.routeId||!s.bookings.some(b=>b.passengerId===value.id&&b.status==='confirmed'&&s.trips.some(t=>t.id===b.tripId&&t.status!=='completed')),'Cancele as reservas futuras antes de alterar a rota.');
      }
      const i=s.passengers.findIndex(p=>p.id===value.id);if(i>=0)s.passengers[i]=value;else s.passengers.push(value);extra.id=value.id;break;
    }
    case 'passenger.toggle': {const p=findPassenger(s,a.id);requireThat(!p.active||!s.trips.some(t=>onboard(s,t.id).has(p.id)),'Registre o desembarque antes de inativar o passageiro.');p.active=!p.active;break;}
    case 'vehicle.save': {
      const previous=s.vehicles.find(v=>v.id===a.vehicle.id);
      const value={...a.vehicle,id:a.vehicle.id??uniqueId('v'),plate:a.vehicle.plate.toUpperCase(),createdAt:previous?.createdAt??(a.vehicle.id?undefined:at)};
      requireThat(!a.vehicle.id||s.vehicles.some(v=>v.id===a.vehicle.id),'Veículo não encontrado.',404);
      requireThat(!s.vehicles.some(v=>v.id!==value.id&&v.plate.replace(/\W/g,'')===value.plate.replace(/\W/g,'')),'Placa já cadastrada.');
      const trips=s.trips.filter(t=>t.vehicleId===value.id&&t.status!=='completed');
      requireThat(!trips.some(t=>t.status==='in_progress')||value.status==='available','Veículo em viagem não pode entrar em manutenção.');
      requireThat(trips.every(t=>s.bookings.filter(b=>b.tripId===t.id&&b.status!=='cancelled').length<=value.capacity),'Capacidade inferior às reservas existentes.');
      const i=s.vehicles.findIndex(v=>v.id===value.id);if(i>=0)s.vehicles[i]=value;else s.vehicles.push(value);extra.id=value.id;break;
    }
    case 'driver.save': {
      const previous=s.drivers.find(d=>d.id===a.driver.id);
      const value={...a.driver,id:a.driver.id??uniqueId('d'),registration:(a.driver.registration??previous?.registration??'').toUpperCase(),active:a.driver.active??previous?.active??true,createdAt:previous?.createdAt??(a.driver.id?undefined:at)};
      requireThat(!a.driver.id||previous,'Motorista não encontrado.',404);
      requireThat(!s.drivers.some(d=>d.id!==value.id&&sameRegistration(d.registration,value.registration)),'Matrícula de motorista já cadastrada.');
      requireThat(value.active||!s.trips.some(t=>t.driverId===value.id&&t.status==='in_progress'),'Motorista em viagem não pode ser inativado.');
      const i=s.drivers.findIndex(d=>d.id===value.id);if(i>=0)s.drivers[i]=value;else s.drivers.push(value);extra.id=value.id;break;
    }
    case 'trip.create': {checkSchedule(s,a.trip);const id=uniqueId('t');const t:Trip={...a.trip,id,status:'scheduled'};snapshot(s,t);s.trips.push(t);extra.id=id;break;}
    case 'trip.start': {
      const t=findTrip(s,a.tripId);authorizeTrip(s,role,t,actorRegistration);requireThat(t.status==='scheduled','Somente viagens agendadas podem ser iniciadas.');
      requireThat(s.routes.some(r=>r.id===t.routeId&&r.active),'A rota está inativa.');requireThat(s.vehicles.some(v=>v.id===t.vehicleId&&v.status==='available'),'Veículo em manutenção.');
      requireThat(s.drivers.some(d=>d.id===t.driverId&&d.active!==false),'Motorista inativo.');
      requireThat(!s.trips.some(other=>other.id!==t.id&&other.status==='in_progress'&&(other.driverId===t.driverId||other.vehicleId===t.vehicleId)),'Motorista ou veículo está em outra viagem em andamento.');
      snapshot(s,t,true);t.status='in_progress';t.startedAt=at;if(a.odometerKm!==undefined)t.startOdometerKm=a.odometerKm;s.events.push({id:uniqueId('e'),tripId:t.id,kind:'trip_start',at,source:'system',driverId:t.driverId,driverRegistration:t.driverSnapshot?.registration});break;
    }
    case 'trip.finish': {const t=findTrip(s,a.tripId);authorizeTrip(s,role,t,actorRegistration);active(t);requireThat(onboard(s,t.id).size===0,'Registre o desembarque de todos os passageiros antes de encerrar a viagem.');requireThat(a.odometerKm===undefined||t.startOdometerKm===undefined||a.odometerKm>=t.startOdometerKm,'O hodômetro final não pode ser inferior ao inicial.',400);if(a.odometerKm!==undefined)t.endOdometerKm=a.odometerKm;t.status='completed';t.endedAt=at;s.events.push({id:uniqueId('e'),tripId:t.id,kind:'trip_finish',at,source:'system',driverId:t.driverId,driverRegistration:t.driverSnapshot?.registration});s.qrTokens=s.qrTokens.filter(q=>q.tripId!==t.id);break;}
    case 'booking.create': {
      const t=findTrip(s,a.tripId),p=findPassenger(s,a.passengerId);authorizePassenger(s,role,p.id,actorRegistration);eligible(s,t,p);requireThat(t.status!=='completed','Esta viagem já foi encerrada.');
      requireThat(!s.bookings.some(b=>b.tripId===t.id&&b.passengerId===p.id&&b.status!=='cancelled'),'Você já possui uma reserva nesta viagem.');
      requireThat(!s.events.some(e=>e.tripId===t.id&&e.passengerId===p.id&&e.kind==='boarding'),'Não é possível refazer a reserva após o embarque.');
      requireThat(s.bookings.filter(b=>b.tripId===t.id&&b.status!=='cancelled').length<checkCapacity(s,t),'Não há assentos disponíveis nesta viagem.');
      const id=uniqueId('b');s.bookings.push({id,tripId:t.id,passengerId:p.id,status:'confirmed',createdAt:at,destinationStopId:destination(tripRoute(s,t),p)});extra.id=id;break;
    }
    case 'booking.cancel': {const b=s.bookings.find(b=>b.id===a.id);requireThat(b,'Reserva não encontrada.',404);authorizePassenger(s,role,b.passengerId,actorRegistration);requireThat(b.status==='confirmed','Somente reservas ainda não embarcadas podem ser canceladas.');requireThat(findTrip(s,b.tripId).status!=='completed','A viagem já foi encerrada.');requireThat(!s.events.some(e=>e.tripId===b.tripId&&e.passengerId===b.passengerId&&e.kind==='boarding'),'Reserva com embarque registrado não pode ser cancelada.');b.status='cancelled';break;}
    case 'trip.qr.issue': {
      const t=findTrip(s,a.tripId);authorizeTrip(s,role,t,actorRegistration);active(t);
      const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);const token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');const expiresAt=new Date(now.getTime()+120_000).toISOString();
      s.qrTokens=s.qrTokens.filter(q=>q.tripId!==t.id);s.qrTokens.push({token,tripId:t.id,expiresAt,purpose:'trip_boarding',usedPassengerIds:[]});extra.token=token;extra.expiresAt=expiresAt;break;
    }
    case 'boarding.scan': {
      const q=s.qrTokens.find(q=>q.token===a.token);requireThat(q&&q.expiresAt>at,'QR Code inválido, expirado ou revogado.',400);
      const t=findTrip(s,q.tripId);
      const p=role==='admin'?findPassenger(s,a.passengerId??'p1'):passengerActor(s,actorRegistration);
      requireThat(role==='admin'||!a.passengerId||a.passengerId===p.id,'O passageiro só pode registrar o próprio embarque.',403);
      requireThat(!q.usedPassengerIds.includes(p.id),'Embarque já registrado por este passageiro com o QR da viagem.');
      const b=checkEvent(s,t,p,'boarding');b.status='boarded';q.usedPassengerIds.push(p.id);
      s.events.push({id:uniqueId('e'),tripId:t.id,passengerId:p.id,kind:'boarding',at,source:'qr',passengerRegistration:p.registration,passengerName:p.name,driverId:t.driverId,driverRegistration:t.driverSnapshot?.registration});
      extra.passengerName=p.name;extra.passengerId=p.id;extra.tripId=t.id;extra.kind='boarding';break;
    }
    case 'alighting.batch': {
      const t=findTrip(s,a.tripId);authorizeTrip(s,role,t,actorRegistration);active(t);
      const route=tripRoute(s,t),stop=route.stops.find(stop=>stop.id===a.stopId);requireThat(stop,'O ponto não pertence ao trajeto congelado desta viagem.',400);
      const latest=s.locations.filter(l=>l.tripId===t.id&&l.simulated!==true).at(-1);
      const receivedAge=latest?now.getTime()-Date.parse(latest.at):Infinity;
      const deviceAge=latest?now.getTime()-Date.parse(latest.deviceAt??latest.at):Infinity;
      const gpsAtStop=!!latest&&receivedAge>=0&&receivedAge<=90_000&&deviceAge>=0&&deviceAge<=90_000&&latest.accuracy<=60&&latest.speed!==null&&latest.speed<=2&&latest.quality!=='jump'&&haversineMeters(latest,stop)<=120;
      const inside=onboard(s,t.id),selected:Passenger[]=[];
      let differentDestination=false;
      for(const passengerId of a.passengerIds as string[]) {
        const p=findPassenger(s,passengerId);requireThat(p.active,'Passageiro inativo.');
        requireThat(inside.has(p.id),'O lote contém passageiro sem embarque ou que já desembarcou.');
        checkEvent(s,t,p,'alighting');
        const b=currentBooking(s,t.id,p.id);
        if((b.destinationStopId??p.destinationStopId)!==stop.id)differentDestination=true;
        selected.push(p);
      }
      requireThat(gpsAtStop&&!differentDestination||(a.note?.length??0)>=10,differentDestination?'Destino diferente da reserva: informe uma justificativa de pelo menos 10 caracteres.':'GPS sem confirmação de parada: informe uma justificativa de pelo menos 10 caracteres.');
      const batchId=uniqueId('batch'),verification:TripEvent['verification']=gpsAtStop&&!differentDestination?'gps_at_stop':'manual_override';
      const batchEvents:TripEvent[]=selected.map(p=>({id:uniqueId('e'),tripId:t.id,passengerId:p.id,kind:'alighting',at,source:'driver_batch',stopId:stop.id,batchId,verification,passengerRegistration:p.registration,passengerName:p.name,driverId:t.driverId,driverRegistration:t.driverSnapshot?.registration,note:a.note,...(latest?{lat:latest.lat,lng:latest.lng,accuracy:latest.accuracy}:{})}));
      s.events.push(...batchEvents);extra.batchId=batchId;extra.count=selected.length;extra.verification=verification;break;
    }
    case 'boarding.manual': {const t=findTrip(s,a.tripId),p=findPassenger(s,a.passengerId);authorizeTrip(s,role,t,actorRegistration);const b=checkEvent(s,t,p,a.kind);if(a.kind==='boarding')b.status='boarded';s.events.push({id:uniqueId('e'),tripId:t.id,passengerId:p.id,kind:a.kind,at,source:'manual',note:a.note,passengerRegistration:p.registration,passengerName:p.name,driverId:t.driverId,driverRegistration:t.driverSnapshot?.registration});extra.passengerName=p.name;break;}
    case 'location.update': {
      const t=findTrip(s,a.tripId);authorizeTrip(s,role,t,actorRegistration);active(t);
      requireThat(s.locations.length<10_000,'Limite de 10.000 amostras GPS do piloto atingido. Exporte o histórico; dados anteriores não serão descartados.',413);
      const geometry=tripRoute(s,t).geometry;
      const offRouteMeters=geometry&&geometry.length>=2?pointToPolylineMeters({lat:a.lat,lng:a.lng},geometry):undefined;
      const previous=s.locations.filter(l=>l.tripId===t.id&&l.simulated!==true).at(-1);
      const deviceTime=Date.parse(a.deviceAt??at),previousTime=previous?Date.parse(previous.deviceAt??previous.at):0;
      const elapsed=(deviceTime-previousTime)/1000;
      const jump=previous&&previous.accuracy<=60&&a.accuracy<=60&&elapsed>0&&haversineMeters(previous,{lat:a.lat,lng:a.lng})/elapsed>60;
      s.locations.push({id:uniqueId('loc'),tripId:t.id,lat:a.lat,lng:a.lng,accuracy:a.accuracy,speed:a.speed??null,heading:a.heading??null,at,deviceAt:a.deviceAt,simulated:false,offRouteMeters,offRoute:offRouteMeters===undefined?undefined:offRouteMeters>(tripRoute(s,t).gpsToleranceMeters??120),quality:a.accuracy>60?'poor_accuracy':jump?'jump':'valid'});break;
    }
    case 'incident.create': {const t=findTrip(s,a.tripId);authorizeTrip(s,role,t,actorRegistration);active(t);s.events.push({id:uniqueId('e'),tripId:t.id,kind:'incident',at,source:'manual',note:a.note,driverId:t.driverId,driverRegistration:t.driverSnapshot?.registration});break;}
    case 'message.send': {requireThat(s.messages.length<500,'Limite de mensagens do piloto atingido.',413);const id=uniqueId('msg');s.messages.unshift({id,title:a.title,body:a.body,audience:a.audience,at});extra.id=id;break;}
    case 'settings.save': {const {name,...settings}=a.settings;s.settings=settings;if(name)s.workspace.name=name;break;}
    case 'report.save': {
      const previous=s.savedReports?.find(r=>r.id===a.report.id);
      requireThat(!a.report.id||previous,'Relatório não encontrado.',404);
      requireThat(previous||(s.savedReports?.length??0)<100,'Limite de 100 relatórios do piloto atingido.',413);
      const value={...a.report,id:a.report.id??uniqueId('report'),createdAt:previous?.createdAt??at,updatedAt:at};
      const i=s.savedReports!.findIndex(r=>r.id===value.id);if(i>=0)s.savedReports![i]=value;else s.savedReports!.push(value);extra.id=value.id;break;
    }
    case 'report.delete': {requireThat(s.savedReports?.some(r=>r.id===a.id),'Relatório não encontrado.',404);s.savedReports=s.savedReports!.filter(r=>r.id!==a.id);break;}
  }
  s.version=original.version+1;
  const actor=role==='driver'?driverActor(s,actorRegistration).registration:role==='passenger'?passengerActor(s,actorRegistration).registration:undefined;
  s.audit=[...(s.audit??[]),{id:uniqueId('audit'),at,role,action:a.type,entityId:a.id??a.tripId??extra.id as string|undefined,actorRegistration:actor}];
  requireThat(s.passengers.length<=5000&&s.routes.length<=500&&s.trips.length<=20_000,'Limite de registros deste piloto atingido. Exporte os dados e entre em contato com o administrador.',413);
  return {state:s,extra};
}
