import { Router } from 'express';
import { z } from 'zod';

const input = z.object({
  contractValue: z.coerce.number().min(0).optional(), materialsCost: z.coerce.number().min(0), labourCost: z.coerce.number().min(0),
  plantEquipmentCost: z.coerce.number().min(0).default(0), subcontractCost: z.coerce.number().min(0).default(0), otherDirectCost: z.coerce.number().min(0).default(0),
  overheads: z.coerce.number().min(0), durationMonths: z.coerce.number().min(0).max(1200), contingencyPct: z.coerce.number().min(0).max(100).default(10),
  annualEscalationPct: z.coerce.number().min(0).max(100).default(0), mobilisationPct: z.coerce.number().min(0).max(100).default(10), materialsAdvancePct: z.coerce.number().min(0).max(100).default(0),
  clientPaymentDelayDays: z.coerce.number().int().min(0).max(3650).default(30), supplierCreditDays: z.coerce.number().int().min(0).max(3650).default(30),
  targetMarginPct: z.coerce.number().min(-100).max(90).default(15), taxAllowancePct: z.coerce.number().min(0).max(100).default(0), currency: z.string().length(3).optional(),
  projectType: z.string().max(80).optional(), startDate: z.string().optional(), notes: z.string().max(2000).optional()
});
const query = z.object({ limit: z.coerce.number().int().min(1).max(50).optional() });

export function createProjectCostPlanningRouter({ service, learningService = null, cashflowLearningService = null, authMiddleware, authorize }) {
  const r = Router();
  r.use(authMiddleware);
  r.post('/companies/:companyId/projects/:projectId/cost-plan', authorize('project-cost-plan:manage'), async (req, res, next) => {
    try { const payload = input.parse(req.body || {}); res.status(201).json({ success: true, data: await service.calculate({ companyId: req.params.companyId, projectId: req.params.projectId, userId: req.user.id, role: req.authorization.role, input: payload, save: true }) }); }
    catch (e) { next(e); }
  });
  if (learningService) {
    r.get('/companies/:companyId/projects/:projectId/cost-forecast/readiness', authorize('project-cost-plan:read'), async (req,res,next)=>{ try { await service.assertProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,role:req.authorization.role}); res.json({success:true,data:await learningService.readiness({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e)} });
    r.get('/companies/:companyId/projects/:projectId/cost-forecast', authorize('project-cost-plan:read'), async (req,res,next)=>{ try { await service.assertProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,role:req.authorization.role}); res.json({success:true,data:await learningService.latest({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e)} });
    r.post('/companies/:companyId/projects/:projectId/cost-forecast/train', authorize('intelligence-model:train'), async (req,res,next)=>{ try { await service.assertProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,role:req.authorization.role}); res.json({success:true,data:await learningService.trainProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id})}); } catch(e){next(e)} });
  }
  if (cashflowLearningService) {
    const cashInput = z.object({
      asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), currency: z.string().length(3).optional(),
      openingCashBalance: z.coerce.number(), inflowsLast30d: z.coerce.number().min(0), outflowsLast30d: z.coerce.number().min(0),
      receivablesDueNext30d: z.coerce.number().min(0), payablesDueNext30d: z.coerce.number().min(0), minimumCashBuffer: z.coerce.number().min(0),
      reconciliationStatus: z.enum(['DRAFT','RECONCILED']).default('DRAFT'), evidenceNote: z.string().max(1000).optional(),
      outcomeShortfall: z.boolean().nullable().optional(), outcomeObservedAt: z.string().datetime().optional()
    });
    r.get('/companies/:companyId/projects/:projectId/cashflow-forecast/readiness', authorize('cashflow-forecast:read'), async(req,res,next)=>{try{await service.assertProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,role:req.authorization.role});res.json({success:true,data:await cashflowLearningService.readiness({companyId:req.params.companyId,projectId:req.params.projectId})});}catch(e){next(e)}});
    r.get('/companies/:companyId/projects/:projectId/cashflow-forecast', authorize('cashflow-forecast:read'), async(req,res,next)=>{try{await service.assertProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,role:req.authorization.role});res.json({success:true,data:await cashflowLearningService.latest({companyId:req.params.companyId,projectId:req.params.projectId})});}catch(e){next(e)}});
    r.get('/companies/:companyId/projects/:projectId/cashflow-forecast/performance', authorize('cashflow-forecast:read'), async(req,res,next)=>{try{await service.assertProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,role:req.authorization.role});res.json({success:true,data:await cashflowLearningService.performance({companyId:req.params.companyId,projectId:req.params.projectId})});}catch(e){next(e)}});
    r.post('/companies/:companyId/projects/:projectId/cashflow-observations', authorize('cashflow-observation:manage'), async(req,res,next)=>{try{const payload=cashInput.parse(req.body||{});await service.assertProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,role:req.authorization.role});const data=await cashflowLearningService.createObservation({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,input:payload});res.status(201).json({success:true,data});}catch(e){next(e)}});
    r.post('/companies/:companyId/projects/:projectId/cashflow-forecast/train', authorize('intelligence-model:train'), async(req,res,next)=>{try{await service.assertProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,role:req.authorization.role});res.json({success:true,data:await cashflowLearningService.trainProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id})});}catch(e){next(e)}});
  }
  r.get('/companies/:companyId/projects/:projectId/cost-plans', authorize('project-cost-plan:read'), async (req, res, next) => {
    try { const q = query.parse(req.query); res.json({ success: true, data: await service.history({ companyId: req.params.companyId, projectId: req.params.projectId, userId: req.user.id, role: req.authorization.role, limit: q.limit || 20 }) }); }
    catch (e) { next(e); }
  });
  return r;
}
