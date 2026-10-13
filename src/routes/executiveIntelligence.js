import { Router } from 'express';
export function createExecutiveIntelligenceRouter({service,authMiddleware,authorize}){const r=Router();r.use(authMiddleware);
 r.get('/companies/:companyId/executive-intelligence/portfolio',authorize('executive:read'),async(req,res,next)=>{try{res.json({success:true,data:await service.portfolio({companyId:req.params.companyId,projectId:req.query.projectId})});}catch(e){next(e)}});
 r.get('/companies/:companyId/executive-intelligence/trends',authorize('executive:read'),async(req,res,next)=>{try{res.json({success:true,data:await service.trends({companyId:req.params.companyId,projectId:req.query.projectId,days:req.query.days||90})});}catch(e){next(e)}});
 r.get('/companies/:companyId/executive-intelligence/report',authorize('executive:read'),async(req,res,next)=>{try{res.json({success:true,data:await service.report({companyId:req.params.companyId,projectId:req.query.projectId})});}catch(e){next(e)}});
 return r;}
