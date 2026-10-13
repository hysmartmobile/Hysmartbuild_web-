import { Router } from 'express';
import { z } from 'zod';
const query=z.object({projectId:z.string().uuid().optional(),persist:z.coerce.boolean().optional(),limit:z.coerce.number().int().min(1).max(100).optional()});
export function createFinancialIntelligenceRouter({service,authMiddleware,authorize}){const r=Router();r.use(authMiddleware);
 r.get('/companies/:companyId/financial-intelligence',authorize('financial-intelligence:read'),async(req,res,next)=>{try{const q=query.parse(req.query);res.json({success:true,data:await service.dashboard({companyId:req.params.companyId,projectId:q.projectId||null,persist:false,userId:req.user.id})});}catch(e){next(e)}});
 r.post('/companies/:companyId/financial-intelligence/refresh',authorize('financial-intelligence:manage'),async(req,res,next)=>{try{const q=query.parse(req.query);res.status(201).json({success:true,data:await service.dashboard({companyId:req.params.companyId,projectId:q.projectId||null,persist:true,userId:req.user.id}),message:'Financial intelligence refreshed'});}catch(e){next(e)}});
 r.get('/companies/:companyId/financial-intelligence/history',authorize('financial-intelligence:read'),async(req,res,next)=>{try{const q=query.parse(req.query);res.json({success:true,data:await service.history({companyId:req.params.companyId,projectId:q.projectId||null,limit:q.limit||20})});}catch(e){next(e)}});
 return r;}
