import {Router} from 'express';
export function createStrategicIntelligenceRouter({procurementRiskService,claimsIntelligenceService,truthEngineService,aiIntelligenceService,authMiddleware,authorize}){
 const r=Router();r.use(authMiddleware);const wrap=fn=>async(req,res,next)=>{try{res.json({success:true,data:await fn(req)});}catch(e){next(e)}};
 r.get('/companies/:companyId/procurement-risk',authorize('procurement-intelligence:read'),wrap(req=>procurementRiskService.analyze({companyId:req.params.companyId,projectId:req.query.projectId})));
 r.get('/companies/:companyId/projects/:projectId/claims-intelligence',authorize('contract-intelligence:read'),wrap(req=>claimsIntelligenceService.analyze({companyId:req.params.companyId,projectId:req.params.projectId})));
 r.get('/companies/:companyId/projects/:projectId/construction-truth',authorize('construction-truth:read'),wrap(req=>truthEngineService.project({companyId:req.params.companyId,userId:req.user.id,projectId:req.params.projectId})));
 r.get('/companies/:companyId/construction-truth',authorize('construction-truth:read'),wrap(req=>truthEngineService.portfolio({companyId:req.params.companyId,userId:req.user.id})));
 r.get('/companies/:companyId/projects/:projectId/ai-intelligence',authorize('ai-intelligence:read'),wrap(req=>aiIntelligenceService.explainProject({companyId:req.params.companyId,userId:req.user.id,projectId:req.params.projectId})));
 return r;
}
