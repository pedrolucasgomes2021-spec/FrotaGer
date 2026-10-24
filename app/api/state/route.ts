import { publicState } from '../../server/core';
import { requestOwner, json, errorResponse } from '../../server/http';
import { loadWorkspace } from '../../server/store';

export async function GET(request:Request) {
  try {
    const owner=requestOwner(request);
    return json({state:publicState(await loadWorkspace(owner))});
  } catch(error) {return errorResponse(error);}
}
