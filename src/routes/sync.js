import { Router } from "express";
import { z } from "zod";
const operation=z.object({operationId:z.string().uuid(),operationType:z.string().min(1).max(80),entityType:z.string().min(1).max(80),entityId:z.string().uuid().optional().nullable(),baseUpdatedAt:z.string().datetime().optional().nullable(),payload:z.record(z.string(),z.any()).default({})});
export function createSyncRouter({syncService,authMiddleware,authorize}){
  const r=Router(); r.use(authMiddleware);
  r.post("/companies/:companyId/sync/push",authorize("sync:push"),async(req,res,next)=>{try{const body=z.object({operations:z.array(operation).min(1).max(50)}).parse(req.body);const results=[];for(const op of body.operations){try{results.push({...op, ...(await syncService.apply({companyId:req.params.companyId,userId:req.user.id,...op}))});}catch(e){if(e.code==='SYNC_CONFLICT'){results.push({...op,status:'CONFLICT',conflict:e.conflict});continue;} throw e;}}res.json({success:true,data:{results}});}catch(e){next(e)}});
  r.get("/companies/:companyId/sync/status",authorize("sync:read"),async(req,res,next)=>{try{res.json({success:true,data:await syncService.status({companyId:req.params.companyId,userId:req.user.id,limit:Math.min(100,Math.max(1,Number(req.query.limit||50)))})});}catch(e){next(e)}});
  return r;
}
