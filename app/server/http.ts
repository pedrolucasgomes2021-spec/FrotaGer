import type { Role } from '../types';
import { ApiError } from './core';

const loopback=(host:string)=>['localhost','127.0.0.1','[::1]','::1'].includes(host);
export function requestOwner(request:Request) {
  const user=request.headers.get('oai-authenticated-user-id')?.trim();
  if(user&&user.length<=256)return `user:${user}`;
  const url=new URL(request.url);
  const origin=request.headers.get('origin');
  let localOrigin=true;
  try {localOrigin=!origin||loopback(new URL(origin).hostname);}catch {localOrigin=false;}
  if(process.env.NODE_ENV==='development'&&loopback(url.hostname)&&localOrigin) {
    const local=request.headers.get('x-vertice-dev-owner')??'local-preview';
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(local))throw new ApiError('Identificação local inválida.',400);
    return `development:${local}`;
  }
  throw new ApiError('Entre na sua conta para acessar este espaço de trabalho.',401);
}
export function requestRole(request:Request):Role {
  const role=request.headers.get('x-vertice-role');
  if(role!=='admin'&&role!=='driver'&&role!=='passenger')throw new ApiError('Informe um perfil válido em x-vertice-role.',403);
  return role;
}
export function requestRegistration(request:Request):string|undefined {
  const value=request.headers.get('x-vertice-registration');
  if(value===null)return undefined;
  const registration=value.trim().toUpperCase();
  if(!/^[A-Z0-9_-]{2,50}$/.test(registration))throw new ApiError('Matrícula inválida.',400);
  return registration;
}
export function checkOrigin(request:Request) {
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)throw new ApiError('Origem da requisição não autorizada.',403);
  if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))throw new ApiError('Envie os dados como application/json.',415);
}
export function json(value:unknown,status=200) {
  return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export function errorResponse(error:unknown) {
  if(error instanceof ApiError)return json({error:error.message},error.status);
  const message=error instanceof Error?error.message:'';
  if(message.includes('no such table'))return json({error:'Banco aguardando migração: aplique os arquivos SQL de drizzle/ ao D1 antes de abrir o piloto.'},503);
  if(error instanceof SyntaxError)return json({error:'O corpo da requisição contém JSON inválido.'},400);
  console.error('Vértice API:',error);
  return json({error:'Não foi possível concluir a operação. Tente novamente.'},500);
}
