import { Router } from 'express';
import { z } from 'zod';

const capture = z.object({
  projectId: z.string().uuid().nullable().optional(),
  channel: z.enum(['WEB','VOICE','WHATSAPP','MOBILE','API']).default('WEB'),
  text: z.string().trim().min(3).max(12000),
  metadata: z.record(z.string(), z.any()).optional().default({})
});
const list = z.object({ projectId: z.string().uuid().optional(), status: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
const eventUpdate = z.object({ status: z.enum(['ACKNOWLEDGED','ACTIONED','DISMISSED']) });

export function createConstructionAutopilotRouter({ service, authMiddleware, authorize }) {
  const r = Router(); r.use(authMiddleware);
  const wrap = fn => async (req, res, next) => { try { res.json({ success: true, data: await fn(req) }); } catch (e) { next(e); } };
  r.post('/companies/:companyId/autopilot/capture', authorize('autopilot:manage'), async (req,res,next) => { try { res.status(201).json({ success:true, data: await service.capture({ companyId:req.params.companyId, userId:req.user.id, ...capture.parse(req.body) }) }); } catch(e){ next(e); } });
  r.get('/companies/:companyId/autopilot/captures', authorize('autopilot:read'), wrap(req => service.inbox({ companyId:req.params.companyId, ...list.parse(req.query) })));
  r.get('/companies/:companyId/autopilot/intelligence', authorize('autopilot:read'), wrap(req => service.intelligence({ companyId:req.params.companyId, ...list.parse(req.query) })));
  r.post('/companies/:companyId/autopilot/intelligence/:eventId/status', authorize('autopilot:manage'), async(req,res,next)=>{try{res.json({success:true,data:await service.acknowledgeEvent({companyId:req.params.companyId,userId:req.user.id,eventId:req.params.eventId,...eventUpdate.parse(req.body)})});}catch(e){next(e);}});
  r.get('/companies/:companyId/autopilot/morning-brief', authorize('autopilot:read'), wrap(req => service.morningBrief({ companyId:req.params.companyId, userId:req.user.id, projectId:req.query.projectId })));
  return r;
}
