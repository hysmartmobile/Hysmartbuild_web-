import { Router } from 'express';
export function createRecoveryIntelligenceRouter({service,authMiddleware,authorize}){const r=Router();r.use(authMiddleware);
 r.get('/companies/:companyId/recovery-intelligence',authorize('recovery:read'),async(req,res,next)=>{try{res.json({success:true,data:await service.analyze({companyId:req.params.companyId,projectId:req.query.projectId||null})});}catch(e){next(e)}});
 return r;}
