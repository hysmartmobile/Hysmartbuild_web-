import {Router} from 'express';
import {z} from 'zod';
export function createExecutionRouter({service,authMiddleware,authorize}){
 const r=Router();r.use(authMiddleware);const wrap=fn=>async(req,res,next)=>{try{res.json({success:true,data:await fn(req)});}catch(e){next(e);}};
 const measurement=z.object({estimateItemId:z.string().uuid(),quantityCompleted:z.coerce.number().nonnegative(),measurementDate:z.string().date().optional(),location:z.string().max(180).optional(),notes:z.string().max(4000).optional()});
 r.get('/companies/:companyId/projects/:projectId/execution/boq',authorize('execution:read'),wrap(req=>service.boqs(req.params.companyId,req.params.projectId)));
 r.get('/companies/:companyId/projects/:projectId/execution/dashboard',authorize('execution:read'),wrap(req=>service.dashboard({companyId:req.params.companyId,projectId:req.params.projectId})));
 r.get('/companies/:companyId/projects/:projectId/execution/alerts',authorize('execution:read'),wrap(req=>service.alerts({companyId:req.params.companyId,projectId:req.params.projectId})));
 r.get('/companies/:companyId/projects/:projectId/execution/snapshots',authorize('execution:read'),wrap(req=>service.snapshots({companyId:req.params.companyId,projectId:req.params.projectId})));
 r.post('/companies/:companyId/projects/:projectId/execution/snapshot',authorize('execution:manage'),wrap(req=>service.dashboard({companyId:req.params.companyId,projectId:req.params.projectId,saveSnapshot:true,userId:req.user.id})));
 r.post('/companies/:companyId/projects/:projectId/execution/measurements',authorize('execution:manage'),async(req,res,next)=>{try{res.status(201).json({success:true,data:await service.createMeasurement({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,input:measurement.parse(req.body)})});}catch(e){next(e);}});
 return r;
}
