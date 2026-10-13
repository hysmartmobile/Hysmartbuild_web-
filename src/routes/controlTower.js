import {Router} from 'express';
export function createControlTowerRouter({service,authMiddleware,authorize}){
 const r=Router();r.use(authMiddleware);
 const read=authorize('control-tower:read');
 r.get('/companies/:companyId/control-tower',read,async(req,res,next)=>{try{res.json({success:true,data:await service.dashboard({companyId:req.params.companyId,projectId:req.query.projectId||null,userId:req.user.id,refresh:false})});}catch(e){next(e)}});
 r.post('/companies/:companyId/control-tower/refresh',authorize('control-tower:manage'),async(req,res,next)=>{try{res.json({success:true,data:await service.dashboard({companyId:req.params.companyId,projectId:req.body?.projectId||null,userId:req.user.id,refresh:true})});}catch(e){next(e)}});
 return r;
}
