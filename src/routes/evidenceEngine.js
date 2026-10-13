import { Router } from 'express';
import { z } from 'zod';

const record = z.object({ sourceType:z.string().min(2), sourceId:z.string().uuid().nullable().optional(), title:z.string().max(300).optional(), description:z.string().max(4000).optional(), evidenceType:z.string().max(80).optional(), tags:z.array(z.string()).max(30).optional(), occurredAt:z.string().optional(), metadata:z.record(z.string(),z.any()).optional() });
const list = z.object({ projectId:z.string().uuid().optional(), limit:z.coerce.number().int().min(1).max(500).default(100) });

export function createEvidenceEngineRouter({service,authMiddleware,authorize}){
 const r=Router(); r.use(authMiddleware);
 const wrap=fn=>async(req,res,next)=>{try{res.json({success:true,data:await fn(req)});}catch(e){next(e)}};
 r.get('/companies/:companyId/projects/:projectId/evidence',authorize('evidence:read'),wrap(req=>service.evidence({companyId:req.params.companyId,projectId:req.params.projectId,limit:Number(req.query.limit||100)})));
 r.post('/companies/:companyId/projects/:projectId/evidence',authorize('evidence:manage'),async(req,res,next)=>{try{res.status(201).json({success:true,data:await service.record({companyId:req.params.companyId,userId:req.user.id,projectId:req.params.projectId,input:record.parse(req.body)})});}catch(e){next(e);}});
 r.get('/companies/:companyId/projects/:projectId/evidence/chronology',authorize('evidence:read'),wrap(req=>service.projectChronology({companyId:req.params.companyId,projectId:req.params.projectId,limit:Number(req.query.limit||200)})));
 r.post('/companies/:companyId/projects/:projectId/evidence/claim-pack',authorize('evidence:manage'),async(req,res,next)=>{try{res.status(201).json({success:true,data:await service.claimPack({companyId:req.params.companyId,userId:req.user.id,projectId:req.params.projectId,title:req.body?.title})});}catch(e){next(e);}});
 r.get('/companies/:companyId/evidence/packs',authorize('evidence:read'),wrap(req=>service.packs({companyId:req.params.companyId,...list.parse(req.query)})));
 return r;
}
