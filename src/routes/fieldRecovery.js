import { Router } from 'express';
import { z } from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const create=z.object({executionDate:date,title:z.string().trim().min(3).max(180),commitmentId:z.string().uuid().nullable().optional(),activityId:z.string().uuid().nullable().optional(),targetQuantity:z.number().nullable().optional(),actualQuantity:z.number().nullable().optional(),unit:z.string().trim().max(40).nullable().optional(),status:z.enum(['OPEN','IN_PROGRESS','ACHIEVED','MISSED','CANCELLED']).optional(),ownerUserId:z.string().uuid().nullable().optional(),evidenceNote:z.string().trim().max(2000).nullable().optional(),dailyReportId:z.string().uuid().nullable().optional()});
const patch=create.partial();
export function createFieldRecoveryRouter({service,authMiddleware,authorize}){const r=Router();r.use(authMiddleware);
 r.get('/companies/:companyId/recovery-plans/:planId/field-executions',authorize('recovery:read'),async(req,res,next)=>{try{res.json({success:true,data:await service.list({companyId:req.params.companyId,planId:req.params.planId})});}catch(e){next(e)}});
 r.get('/companies/:companyId/recovery-plans/:planId/field-execution-summary',authorize('recovery:read'),async(req,res,next)=>{try{res.json({success:true,data:await service.summary({companyId:req.params.companyId,planId:req.params.planId})});}catch(e){next(e)}});
 r.get('/companies/:companyId/projects/:projectId/recovery-activities',authorize('recovery:read'),async(req,res,next)=>{try{res.json({success:true,data:await service.activities({companyId:req.params.companyId,projectId:req.params.projectId})});}catch(e){next(e)}});
 r.post('/companies/:companyId/recovery-plans/:planId/field-executions',authorize('recovery:execute'),async(req,res,next)=>{try{res.status(201).json({success:true,data:await service.create({companyId:req.params.companyId,userId:req.user.id,planId:req.params.planId,input:create.parse(req.body)})});}catch(e){next(e)}});
 r.patch('/companies/:companyId/recovery-field-executions/:id',authorize('recovery:execute'),async(req,res,next)=>{try{res.json({success:true,data:await service.update({companyId:req.params.companyId,id:req.params.id,input:patch.parse(req.body)})});}catch(e){next(e)}});
 return r;}
