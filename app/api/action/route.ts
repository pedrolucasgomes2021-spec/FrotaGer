import type { Action } from '../../types';
import { ApiError } from '../../server/core';
import { requestOwner, requestRole, requestRegistration, checkOrigin, json, errorResponse } from '../../server/http';
import { mutateWorkspace } from '../../server/store';

export async function POST(request:Request) {
  try {
    const owner=requestOwner(request);
    checkOrigin(request);
    const role=requestRole(request);
    const actorRegistration=requestRegistration(request);
    const body=await request.text();
    if(new TextEncoder().encode(body).length>1_000_000)throw new ApiError('Dados maiores que o limite de 1 MB por operação.',413);
    const action=JSON.parse(body) as Action;
    if(!action||typeof action!=='object'||Array.isArray(action)||typeof action.type!=='string')throw new ApiError('Informe o tipo da ação.',400);
    return json(await mutateWorkspace(owner,action,role,actorRegistration));
  } catch(error) {return errorResponse(error);}
}
