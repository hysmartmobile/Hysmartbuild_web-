import { Router } from "express";
import { z } from "zod";

const projectCreateSchema = z.object({  id: z.string().uuid().optional(),

  name: z.string().trim().min(2).max(180),
  code: z.string().trim().max(40).optional(),
  description: z.string().trim().max(4000).optional(),
  clientName: z.string().trim().max(180).optional(),
  status: z.enum(["PLANNING","ACTIVE","ON_HOLD","COMPLETED","CANCELLED"]).optional(),
  startDate: z.string().date().optional(),
  expectedEndDate: z.string().date().optional(),
  budget: z.number().min(0).max(999999999999).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  actualEndDate: z.string().date().optional(),
  lifecyclePhase: z.enum(["PRECONSTRUCTION","MOBILIZATION","CONSTRUCTION","CLOSEOUT","DEFECTS_LIABILITY"]).optional(),
  priority: z.enum(["LOW","NORMAL","HIGH","CRITICAL"]).optional(),
  healthStatus: z.enum(["GREEN","AMBER","RED"]).optional(),
  currency: z.string().trim().length(3).optional(),
  contractValue: z.number().min(0).optional(),
  clientContact: z.string().trim().max(180).optional(),
  projectManagerUserId: z.string().uuid().optional(),
  notes: z.string().trim().max(4000).optional()
});
const projectUpdateSchema = projectCreateSchema.partial();
const transitionSchema = z.object({ toStatus:z.enum(["PLANNING","ACTIVE","ON_HOLD","COMPLETED","CANCELLED"]), reason:z.string().trim().max(1000).optional() });
const budgetLineSchema = z.object({ costCode:z.string().trim().max(60).optional(), category:z.string().trim().min(2).max(120), description:z.string().trim().min(2).max(300), budgetAmount:z.number().min(0), committedAmount:z.number().min(0).optional(), actualAmount:z.number().min(0).optional() });
const riskSchema = z.object({ title:z.string().trim().min(2).max(180), description:z.string().trim().max(2000).optional(), probability:z.number().int().min(1).max(5).optional(), impact:z.number().int().min(1).max(5).optional(), status:z.enum(["OPEN","MITIGATING","CLOSED"]).optional(), mitigation:z.string().trim().max(2000).optional(), ownerUserId:z.string().uuid().optional(), dueDate:z.string().date().optional() });
const changeOrderSchema = z.object({ changeNo:z.string().trim().min(1).max(50), title:z.string().trim().min(2).max(180), description:z.string().trim().max(2000).optional(), amount:z.number().min(0), costImpact:z.number().min(0).optional(), timeImpactDays:z.number().int().min(0).optional(), status:z.enum(["DRAFT","SUBMITTED","APPROVED","REJECTED","CANCELLED"]).optional(), requestedDate:z.string().date().optional() });
const checklistSchema = z.object({ phase:z.string().trim().min(2).max(60), title:z.string().trim().min(2).max(180), description:z.string().trim().max(1000).optional(), status:z.enum(["OPEN","IN_PROGRESS","DONE","SKIPPED"]).optional(), dueDate:z.string().date().optional(), assignedTo:z.string().uuid().optional() });
const siteSchema = z.object({ name: z.string().trim().min(2).max(180), address: z.string().trim().max(300).optional(), city: z.string().trim().max(100).optional(), state: z.string().trim().max(100).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), status: z.enum(["ACTIVE","INACTIVE","CLOSED"]).optional() });
const siteUpdateSchema = siteSchema.partial();
const teamSchema = z.object({ userId: z.string().uuid(), role: z.enum(["PROJECT_MANAGER","SITE_ENGINEER","SITE_SUPERVISOR","MEMBER","CLIENT"]) });
const milestoneSchema = z.object({ title: z.string().trim().min(2).max(180), description: z.string().trim().max(4000).optional(), dueDate: z.string().date().optional(), status: z.enum(["PENDING","IN_PROGRESS","COMPLETED","OVERDUE"]).optional(), progress: z.number().int().min(0).max(100).optional() });
const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), search: z.string().trim().max(100).optional(), status: z.enum(["PLANNING","ACTIVE","ON_HOLD","COMPLETED","CANCELLED"]).optional() });

export function createProjectsRouter({ projectService, authMiddleware, authorize }) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/companies/:companyId/projects", authorize("project:read"), async (req,res,next)=>{ try { const q=pageSchema.parse(req.query); res.json({success:true,data:await projectService.listProjects({companyId:req.params.companyId,...q})}); } catch(e){next(e);} });
  router.post("/companies/:companyId/projects", authorize("project:create"), async (req,res,next)=>{ try { const input=projectCreateSchema.parse(req.body); res.status(201).json({success:true,data:await projectService.createProject({companyId:req.params.companyId,userId:req.user.id,input}),message:"Project created successfully"}); } catch(e){next(e);} });
  router.get("/companies/:companyId/projects/:projectId", authorize("project:read"), async (req,res,next)=>{ try { const data=await projectService.getProject({companyId:req.params.companyId,projectId:req.params.projectId}); if(!data)return res.status(404).json({success:false,error:{code:"PROJECT_NOT_FOUND",message:"Project not found"}}); res.json({success:true,data}); } catch(e){next(e);} });
  router.patch("/companies/:companyId/projects/:projectId", authorize("project:update"), async (req,res,next)=>{ try { const input=projectUpdateSchema.parse(req.body); res.json({success:true,data:await projectService.updateProject({companyId:req.params.companyId,projectId:req.params.projectId,input}),message:"Project updated successfully"}); } catch(e){next(e);} });
  router.delete("/companies/:companyId/projects/:projectId", authorize("project:delete"), async (req,res,next)=>{ try { await projectService.deleteProject({companyId:req.params.companyId,projectId:req.params.projectId}); res.json({success:true,data:null,message:"Project deleted successfully"}); } catch(e){next(e);} });

  router.post("/companies/:companyId/projects/:projectId/status", authorize("project:transition"), async (req,res,next)=>{ try { const input=transitionSchema.parse(req.body); const data=await projectService.transitionProject({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,...input}); res.json({success:true,data,message:`Project status changed to ${data.status}`}); } catch(e){next(e);} });
  router.get("/companies/:companyId/projects/:projectId/control-center", authorize("project:read"), async (req,res,next)=>{ try { res.json({success:true,data:await projectService.getControlCenter({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e);} });
  router.get("/companies/:companyId/projects/:projectId/status-history", authorize("project:read"), async (req,res,next)=>{ try { res.json({success:true,data:await projectService.listStatusHistory({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e);} });
  router.get("/companies/:companyId/projects/:projectId/budget-lines", authorize("project:control"), async (req,res,next)=>{ try { res.json({success:true,data:await projectService.listBudgetLines({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e);} });
  router.post("/companies/:companyId/projects/:projectId/budget-lines", authorize("project:control"), async (req,res,next)=>{ try { const input=budgetLineSchema.parse(req.body); res.status(201).json({success:true,data:await projectService.createBudgetLine({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,input})}); } catch(e){next(e);} });
  router.get("/companies/:companyId/projects/:projectId/risks", authorize("project:control"), async (req,res,next)=>{ try { res.json({success:true,data:await projectService.listRisks({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e);} });
  router.post("/companies/:companyId/projects/:projectId/risks", authorize("project:control"), async (req,res,next)=>{ try { const input=riskSchema.parse(req.body); res.status(201).json({success:true,data:await projectService.createRisk({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,input})}); } catch(e){next(e);} });
  router.patch("/companies/:companyId/projects/:projectId/risks/:riskId", authorize("project:control"), async (req,res,next)=>{ try { const input=riskSchema.partial().parse(req.body); res.json({success:true,data:await projectService.updateRisk({companyId:req.params.companyId,projectId:req.params.projectId,riskId:req.params.riskId,input})}); } catch(e){next(e);} });
  router.get("/companies/:companyId/projects/:projectId/change-orders", authorize("project:control"), async (req,res,next)=>{ try { res.json({success:true,data:await projectService.listChangeOrders({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e);} });
  router.post("/companies/:companyId/projects/:projectId/change-orders", authorize("project:control"), async (req,res,next)=>{ try { const input=changeOrderSchema.parse(req.body); res.status(201).json({success:true,data:await projectService.createChangeOrder({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,input})}); } catch(e){next(e);} });
  router.patch("/companies/:companyId/projects/:projectId/change-orders/:changeOrderId", authorize("project:control"), async (req,res,next)=>{ try { const input=changeOrderSchema.partial().parse(req.body); if(input.status && input.status!=="DRAFT") { const data=await projectService.transitionChangeOrder({companyId:req.params.companyId,projectId:req.params.projectId,changeOrderId:req.params.changeOrderId,userId:req.user.id,status:input.status,approvalNotes:req.body.approvalNotes,clientApproved:req.body.clientApproved}); return res.json({success:true,data}); } const data=await projectService.updateChangeOrder({companyId:req.params.companyId,projectId:req.params.projectId,changeOrderId:req.params.changeOrderId,input}); res.json({success:true,data}); } catch(e){next(e);} });
  router.get("/companies/:companyId/projects/:projectId/checklists", authorize("project:control"), async (req,res,next)=>{ try { res.json({success:true,data:await projectService.listChecklists({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e);} });
  router.post("/companies/:companyId/projects/:projectId/checklists", authorize("project:control"), async (req,res,next)=>{ try { const input=checklistSchema.parse(req.body); res.status(201).json({success:true,data:await projectService.createChecklist({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,input})}); } catch(e){next(e);} });
  router.patch("/companies/:companyId/projects/:projectId/checklists/:checklistId", authorize("project:control"), async (req,res,next)=>{ try { const input=checklistSchema.partial().parse(req.body); res.json({success:true,data:await projectService.updateChecklist({companyId:req.params.companyId,projectId:req.params.projectId,checklistId:req.params.checklistId,input})}); } catch(e){next(e);} });

  router.get("/companies/:companyId/projects/:projectId/sites", authorize("site:read"), async (req,res,next)=>{ try { res.json({success:true,data:await projectService.listSites({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e);} });
  router.post("/companies/:companyId/projects/:projectId/sites", authorize("site:create"), async (req,res,next)=>{ try { const input=siteSchema.parse(req.body); res.status(201).json({success:true,data:await projectService.createSite({companyId:req.params.companyId,projectId:req.params.projectId,input}),message:"Site created successfully"}); } catch(e){next(e);} });
  router.patch("/companies/:companyId/projects/:projectId/sites/:siteId", authorize("site:update"), async (req,res,next)=>{ try { const input=siteUpdateSchema.parse(req.body); res.json({success:true,data:await projectService.updateSite({companyId:req.params.companyId,projectId:req.params.projectId,siteId:req.params.siteId,input}),message:"Site updated successfully"}); } catch(e){next(e);} });
  router.delete("/companies/:companyId/projects/:projectId/sites/:siteId", authorize("site:delete"), async (req,res,next)=>{ try { await projectService.deleteSite({companyId:req.params.companyId,projectId:req.params.projectId,siteId:req.params.siteId}); res.json({success:true,data:null,message:"Site deleted successfully"}); } catch(e){next(e);} });

  router.get("/companies/:companyId/projects/:projectId/team", authorize("project_team:read"), async (req,res,next)=>{ try { res.json({success:true,data:await projectService.listTeam({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e);} });
  router.post("/companies/:companyId/projects/:projectId/team", authorize("project_team:create"), async (req,res,next)=>{ try { const input=teamSchema.parse(req.body); res.status(201).json({success:true,data:await projectService.addTeamMember({companyId:req.params.companyId,projectId:req.params.projectId,...input}),message:"Project team member added"}); } catch(e){next(e);} });
  router.patch("/companies/:companyId/projects/:projectId/team/:userId", authorize("project_team:update"), async (req,res,next)=>{ try { const input=z.object({role:teamSchema.shape.role}).parse(req.body); res.json({success:true,data:await projectService.updateTeamMember({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.params.userId,role:input.role}),message:"Project team member updated"}); } catch(e){next(e);} });
  router.delete("/companies/:companyId/projects/:projectId/team/:userId", authorize("project_team:delete"), async (req,res,next)=>{ try { await projectService.removeTeamMember({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.params.userId}); res.json({success:true,data:null,message:"Project team member removed"}); } catch(e){next(e);} });

  router.get("/companies/:companyId/projects/:projectId/milestones", authorize("milestone:read"), async (req,res,next)=>{ try { res.json({success:true,data:await projectService.listMilestones({companyId:req.params.companyId,projectId:req.params.projectId})}); } catch(e){next(e);} });
  router.post("/companies/:companyId/projects/:projectId/milestones", authorize("milestone:create"), async (req,res,next)=>{ try { const input=milestoneSchema.parse(req.body); res.status(201).json({success:true,data:await projectService.createMilestone({companyId:req.params.companyId,projectId:req.params.projectId,userId:req.user.id,input}),message:"Milestone created successfully"}); } catch(e){next(e);} });
  router.patch("/companies/:companyId/projects/:projectId/milestones/:milestoneId", authorize("milestone:update"), async (req,res,next)=>{ try { const input=milestoneSchema.partial().parse(req.body); res.json({success:true,data:await projectService.updateMilestone({companyId:req.params.companyId,projectId:req.params.projectId,milestoneId:req.params.milestoneId,input}),message:"Milestone updated successfully"}); } catch(e){next(e);} });
  router.delete("/companies/:companyId/projects/:projectId/milestones/:milestoneId", authorize("milestone:delete"), async (req,res,next)=>{ try { await projectService.deleteMilestone({companyId:req.params.companyId,projectId:req.params.projectId,milestoneId:req.params.milestoneId}); res.json({success:true,data:null,message:"Milestone deleted successfully"}); } catch(e){next(e);} });

  return router;
}
