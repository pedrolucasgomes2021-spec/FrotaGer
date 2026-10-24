import { env } from 'cloudflare:workers';
import { createSeed } from '../seed';
import type { Action, Role } from '../types';
import { ApiError, applyAction, normalizeState, publicState, type InternalState } from './core';

type Row = {data:string;version:number};
function database():D1Database {
  if(!env.DB)throw new ApiError('Banco indisponível. Habilite o vínculo D1 DB e aplique a migração workspace_state.',503);
  return env.DB;
}
function parse(row:Row):InternalState {
  const value=JSON.parse(row.data) as InternalState;
  value.version=row.version;
  return normalizeState(value);
}
export async function loadWorkspace(owner:string):Promise<InternalState> {
  const db=database();
  let row=await db.prepare('SELECT data, version FROM workspace_state WHERE owner = ?').bind(owner).first<Row>();
  if(!row) {
    const seed=createSeed();
    await db.prepare('INSERT INTO workspace_state(owner, data, version) VALUES (?, ?, 1) ON CONFLICT(owner) DO NOTHING').bind(owner,JSON.stringify(seed)).run();
    row=await db.prepare('SELECT data, version FROM workspace_state WHERE owner = ?').bind(owner).first<Row>();
  }
  if(!row)throw new ApiError('Não foi possível abrir seu espaço de trabalho.',503);
  return parse(row);
}
export async function mutateWorkspace(owner:string,action:Action,role:Role,actorRegistration?:string) {
  const db=database();
  for(let attempt=0;attempt<8;attempt++) {
    const current=await loadWorkspace(owner);
    const {state,extra}=await applyAction(current,action,role,new Date(),actorRegistration);
    const json=JSON.stringify(state);
    if(new TextEncoder().encode(json).length>1_800_000)throw new ApiError('O espaço atingiu o limite de armazenamento do piloto. Exporte os dados antes de continuar.',413);
    const result=await db.prepare('UPDATE workspace_state SET data = ?, version = ? WHERE owner = ? AND version = ?').bind(json,state.version,owner,current.version).run();
    if(result.meta.changes===1)return {state:publicState(state),...extra};
    // A concorrência é revalidada sobre o estado vencedor; QR/reservas nunca
    // são aceitos duas vezes por duas abas que leram a mesma versão.
  }
  throw new ApiError('Outra operação está atualizando este espaço. Tente novamente.',409);
}
