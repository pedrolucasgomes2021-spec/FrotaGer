import type { State, Route, Passenger, Trip, Booking, TripEvent } from './types';
import { geometryDistanceKm } from './geo';

const DAY = 86_400_000;
export function spDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(now);
}
export function createSeed(now = new Date()): State {
  const today = spDate(now);
  const tomorrow = spDate(new Date(now.getTime() + DAY));
  const demoCreatedAt=new Date(now.getTime()-8*DAY).toISOString();
  const routes: Route[] = [
    {id:'r1',code:'SP-01',name:'Zona Sul → Berrini',origin:'Terminal Santo Amaro',destination:'Campus Berrini',departure:'07:10',returnTime:'18:10',distance:18.4,duration:52,company:'Nexora Tecnologia',color:'#36e6ab',active:true,stops:[{id:'s11',name:'Terminal Santo Amaro',lat:-23.6514,lng:-46.7091,time:'07:10'},{id:'s12',name:'Chácara Santo Antônio',lat:-23.6317,lng:-46.7064,time:'07:25'},{id:'s13',name:'Shopping Morumbi',lat:-23.6225,lng:-46.6989,time:'07:37'},{id:'s14',name:'Campus Berrini',lat:-23.6018,lng:-46.6936,time:'08:02'}]},
    {id:'r2',code:'SP-02',name:'Zona Leste → Paulista',origin:'Metrô Tatuapé',destination:'Avenida Paulista',departure:'06:50',returnTime:'18:20',distance:22.8,duration:65,company:'Grupo Horizonte',color:'#6da8ff',active:true,stops:[{id:'s21',name:'Metrô Tatuapé',lat:-23.5404,lng:-46.5767,time:'06:50'},{id:'s22',name:'Mooca',lat:-23.5604,lng:-46.6017,time:'07:12'},{id:'s23',name:'Avenida Paulista',lat:-23.5614,lng:-46.6559,time:'07:55'}]},
    {id:'r3',code:'SP-03',name:'Guarulhos → Vila Olímpia',origin:'Centro de Guarulhos',destination:'Vila Olímpia',departure:'06:20',returnTime:'18:00',distance:38.2,duration:90,company:'Nexora Tecnologia',color:'#b39aff',active:true,stops:[{id:'s31',name:'Centro de Guarulhos',lat:-23.4628,lng:-46.5333,time:'06:20'},{id:'s32',name:'Santana',lat:-23.5018,lng:-46.6243,time:'06:55'},{id:'s33',name:'Vila Olímpia',lat:-23.5955,lng:-46.6856,time:'07:50'}]},
    {id:'r4',code:'SP-04',name:'Osasco → Pinheiros',origin:'Estação Osasco',destination:'Largo da Batata',departure:'07:00',returnTime:'18:30',distance:16.7,duration:48,company:'Ateliê Digital',color:'#ffba72',active:true,stops:[{id:'s41',name:'Estação Osasco',lat:-23.5266,lng:-46.7769,time:'07:00'},{id:'s42',name:'Jaguaré',lat:-23.5521,lng:-46.7484,time:'07:20'},{id:'s43',name:'Largo da Batata',lat:-23.5668,lng:-46.6938,time:'07:48'}]},
    {id:'r5',code:'SP-05',name:'ABC → Chácara Santo Antônio',origin:'Paço de São Bernardo',destination:'Chácara Santo Antônio',departure:'06:30',returnTime:'17:50',distance:29.5,duration:76,company:'Grupo Horizonte',color:'#65d4e8',active:true,stops:[{id:'s51',name:'Paço de São Bernardo',lat:-23.6914,lng:-46.5646,time:'06:30'},{id:'s52',name:'Diadema',lat:-23.6863,lng:-46.6232,time:'06:55'},{id:'s53',name:'Chácara Santo Antônio',lat:-23.6317,lng:-46.7064,time:'07:46'}]},
    {id:'r6',code:'SP-06',name:'Zona Norte → Barra Funda',origin:'Metrô Tucuruvi',destination:'Barra Funda',departure:'07:20',returnTime:'18:40',distance:14.2,duration:42,company:'Ateliê Digital',color:'#ed93ce',active:true,stops:[{id:'s61',name:'Metrô Tucuruvi',lat:-23.4801,lng:-46.6032,time:'07:20'},{id:'s62',name:'Casa Verde',lat:-23.5128,lng:-46.6542,time:'07:40'},{id:'s63',name:'Barra Funda',lat:-23.5255,lng:-46.6672,time:'08:02'}]},
  ];
  for(const route of routes) {
    route.geometry=route.stops.map(stop=>[stop.lat,stop.lng]);
    route.geometrySource='stops';
    route.geometryName='Traçado demonstrativo entre pontos';
    route.gpsToleranceMeters=120;
    route.revision=1;
    route.distance=Number(geometryDistanceKm(route.geometry).toFixed(3));
  }
  const names = ['Marina Costa','Rafael Almeida','Camila Santos','Lucas Ferreira','Beatriz Oliveira','Pedro Rocha','Juliana Ribeiro','André Lima','Fernanda Alves','Bruno Martins','Letícia Gomes','Diego Nunes','Isabela Mendes','Gustavo Carvalho','Amanda Souza','Thiago Pereira','Carolina Dias','Felipe Cardoso','Renata Vieira','Gabriel Teixeira','Larissa Pinto','Eduardo Moreira','Patrícia Castro','Vinícius Barros','Ana Paula Melo','Daniel Freitas','Natália Azevedo','João Correia','Débora Fernandes','Marcelo Torres','Luiza Monteiro','Henrique Ramos'];
  const passengers: Passenger[] = names.map((name,i) => {
    const route = routes[i % routes.length];
    return {id:`p${i+1}`,name,email:`passageiro${i+1}@exemplo.invalid`,registration:`NX-${String(1001+i)}`,company:route.company,routeId:route.id,stopId:route.stops[i % (route.stops.length-1)].id,destinationStopId:route.stops.at(-1)!.id,active:true,createdAt:demoCreatedAt};
  });
  const trips: Trip[] = [
    {id:'t1',routeId:'r1',driverId:'d1',vehicleId:'v1',date:today,departure:now.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}),status:'in_progress',startedAt:new Date(now.getTime()-24*60_000).toISOString()},
    {id:'t2',routeId:'r1',driverId:'d1',vehicleId:'v1',date:tomorrow,departure:'07:10',status:'scheduled'},
    {id:'t3',routeId:'r2',driverId:'d2',vehicleId:'v2',date:today,departure:'18:20',status:'in_progress',startedAt:new Date(now.getTime()-37*60_000).toISOString()},
    {id:'t4',routeId:'r3',driverId:'d3',vehicleId:'v3',date:today,departure:'06:20',status:'completed',startedAt:`${today}T09:20:00.000Z`,endedAt:`${today}T10:48:00.000Z`},
    {id:'t5',routeId:'r3',driverId:'d3',vehicleId:'v3',date:tomorrow,departure:'06:20',status:'scheduled'},
    {id:'t6',routeId:'r4',driverId:'d4',vehicleId:'v4',date:tomorrow,departure:'07:00',status:'scheduled'},
    {id:'t7',routeId:'r5',driverId:'d2',vehicleId:'v5',date:tomorrow,departure:'06:30',status:'scheduled'},
    {id:'t8',routeId:'r6',driverId:'d4',vehicleId:'v6',date:tomorrow,departure:'09:20',status:'scheduled'},
    {id:'t9',routeId:'r4',driverId:'d4',vehicleId:'v4',date:today,departure:'23:30',status:'scheduled'},
  ];
  const bookings: Booking[] = [];
  const events: TripEvent[] = [];
  const at = (minus:number) => new Date(now.getTime()-minus*60_000).toISOString();
  for (const trip of trips) {
    const members = passengers.filter(p=>p.routeId===trip.routeId);
    members.forEach((p,i)=>{
      const boarded = (trip.id==='t1'&&i>0&&i<4)||(trip.id==='t3'&&i<4)||trip.status==='completed';
      bookings.push({id:`b-${trip.id}-${p.id}`,tripId:trip.id,passengerId:p.id,status:boarded?'boarded':'confirmed',createdAt:at(80),destinationStopId:p.destinationStopId});
      if(boarded) {
        events.push({id:`e-${trip.id}-${p.id}-in`,tripId:trip.id,passengerId:p.id,kind:'boarding',at:trip.id==='t4'?`${today}T09:${String(21+i).padStart(2,'0')}:00.000Z`:at(20-i),source:'qr',note:'Registro demonstrativo'});
        if(trip.status==='completed') events.push({id:`e-${trip.id}-${p.id}-out`,tripId:trip.id,passengerId:p.id,kind:'alighting',at:`${today}T10:46:00.000Z`,source:'qr',note:'Registro demonstrativo'});
      }
    });
    if(trip.startedAt) events.push({id:`e-${trip.id}-start`,tripId:trip.id,kind:'trip_start',at:trip.startedAt,source:'system'});
    if(trip.endedAt) events.push({id:`e-${trip.id}-end`,tripId:trip.id,kind:'trip_finish',at:trip.endedAt,source:'system'});
  }
  // Histórico sintético, explicitamente identificado pelo espaço demonstrativo.
  for(let day=1;day<=7;day++) {
    const date = spDate(new Date(now.getTime()-day*DAY));
    routes.forEach((route,ri)=>{
      const id=`hist-${day}-${route.id}`;
      const start=`${date}T10:00:00.000Z`, end=`${date}T11:00:00.000Z`;
      trips.push({id,routeId:route.id,driverId:`d${ri%4+1}`,vehicleId:`v${ri+1}`,date,departure:'07:00',status:'completed',startedAt:start,endedAt:end});
      passengers.filter(p=>p.routeId===route.id).slice(0,4+(day+ri)%2).forEach((p,i)=>{
        bookings.push({id:`b-${id}-${p.id}`,tripId:id,passengerId:p.id,status:'boarded',createdAt:start,destinationStopId:p.destinationStopId});
        events.push({id:`e-${id}-${p.id}-in`,tripId:id,passengerId:p.id,kind:'boarding',at:`${date}T10:${String(2+i).padStart(2,'0')}:00.000Z`,source:'qr',note:'Histórico demonstrativo'}, {id:`e-${id}-${p.id}-out`,tripId:id,passengerId:p.id,kind:'alighting',at:end,source:'qr',note:'Histórico demonstrativo'});
      });
      events.push({id:`e-${id}-start`,tripId:id,kind:'trip_start',at:start,source:'system'},{id:`e-${id}-end`,tripId:id,kind:'trip_finish',at:end,source:'system'});
    });
  }
  const state:State={
    workspace:{name:'Nexora Mobilidade',demo:true},routes,passengers,trips,bookings,events,
    vehicles:[{id:'v1',plate:'FRT-4A21',model:'Mercedes-Benz Sprinter',capacity:18,year:2024,status:'available'},{id:'v2',plate:'BZR-8B32',model:'Volare W9',capacity:32,year:2023,status:'available'},{id:'v3',plate:'NXA-2C14',model:'Marcopolo Senior',capacity:28,year:2024,status:'available'},{id:'v4',plate:'SPV-5D76',model:'Mercedes-Benz Sprinter',capacity:18,year:2025,status:'available'},{id:'v5',plate:'HZN-1E90',model:'Volare Fly 10',capacity:36,year:2023,status:'available'},{id:'v6',plate:'ATL-7F45',model:'Iveco Daily Minibus',capacity:19,year:2024,status:'available'}],
    drivers:[{id:'d1',name:'Carlos Silva',phone:'(11) 99999-0101',license:'CNH D · demonstração'},{id:'d2',name:'Patrícia Lima',phone:'(11) 99999-0102',license:'CNH D · demonstração'},{id:'d3',name:'Roberto Santos',phone:'(11) 99999-0103',license:'CNH E · demonstração'},{id:'d4',name:'Ana Ferreira',phone:'(11) 99999-0104',license:'CNH D · demonstração'}],
    locations:[{id:'loc-t1',tripId:'t1',lat:-23.6317,lng:-46.7064,accuracy:12,speed:8.2,heading:18,at:at(2),simulated:true},{id:'loc-t3',tripId:'t3',lat:-23.5548,lng:-46.6102,accuracy:18,speed:6.1,heading:232,at:at(3),simulated:true}],
    messages:[{id:'msg1',title:'Bem-vindo ao piloto Vértice',body:'Este ambiente contém dados demonstrativos. A matrícula seleciona seu perfil no piloto; não é autenticação individual.',audience:'all',at:at(25)},{id:'msg2',title:'Leia o QR da viagem para embarcar',body:'Mensagem demonstrativa: o motorista exibe o QR da viagem. Cada passageiro lê no próprio aplicativo. O motorista confirma o desembarque no ponto.',audience:'passengers',at:at(60)},{id:'msg3',title:'Compartilhamento de localização',body:'Mensagem demonstrativa: inicie a viagem e autorize o GPS para compartilhar a posição real do veículo. O traçado inicial liga os pontos e não representa uma via mapeada.',audience:'drivers',at:at(90)}],
    settings:{emailAlerts:false,approachAlerts:true,defaultCapacity:28},version:1,
    savedReports:[],
  };
  state.drivers.forEach((driver,index)=>{driver.registration=`MOT-${String(index+1).padStart(3,'0')}`;driver.active=true;driver.createdAt=demoCreatedAt;});
  state.vehicles.forEach(vehicle=>{vehicle.createdAt=demoCreatedAt;});
  state.trips.forEach(trip=>{trip.routeSnapshot=structuredClone(state.routes.find(route=>route.id===trip.routeId)!);trip.driverSnapshot=structuredClone(state.drivers.find(driver=>driver.id===trip.driverId)!);trip.vehicleSnapshot=structuredClone(state.vehicles.find(vehicle=>vehicle.id===trip.vehicleId)!);trip.legacySnapshot=false;});
  state.events.forEach(event=>{const trip=state.trips.find(trip=>trip.id===event.tripId);const passenger=state.passengers.find(passenger=>passenger.id===event.passengerId);if(passenger){event.passengerName=passenger.name;event.passengerRegistration=passenger.registration;}if(trip){event.driverId=trip.driverId;event.driverRegistration=trip.driverSnapshot?.registration;}});
  return state;
}
