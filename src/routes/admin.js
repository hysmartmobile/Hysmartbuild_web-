import { Router } from "express";
import { z } from "zod";

const page=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(50),search:z.string().trim().max(100).optional(),status:z.string().optional()});
const planPatch=z.object({name:z.string().trim().min(2).max(100).optional(),description:z.string().trim().max(1000).optional(),maxUsers:z.number().int().positive().optional(),maxProjects:z.number().int().positive().optional(),maxStorageMb:z.number().int().positive().optional(),active:z.boolean().optional()});
const price=z.object({currencyCode:z.string().length(3),monthlyAmount:z.number().nonnegative(),yearlyAmount:z.number().nonnegative(),active:z.boolean().optional()});
const routePatch=z.object({priority:z.number().int().positive().optional(),active:z.boolean().optional()});
const status=z.object({status:z.enum(["TRIAL","ACTIVE","PAST_DUE","GRACE_PERIOD","SUSPENDED","CANCELLED","EXPIRED"]),reason:z.string().trim().max(500).optional()});

export function createAdminRouter({adminService,supportService,authMiddleware}) {
  const r=Router();r.use(authMiddleware);
  const admin=async(req,res,next)=>{try{await adminService.assertAdmin(req.user.id);next();}catch(e){next(e);}};
  r.use("/admin", admin);
  r.get("/admin/overview",async(_req,res,next)=>{try{res.json({success:true,data:await adminService.platformOverview()});}catch(e){next(e)}});
  r.get("/admin/payments",async(req,res,next)=>{try{res.json({success:true,data:await adminService.adminPayments(page.parse(req.query))});}catch(e){next(e)}});
  r.get("/admin/support/tickets",async(req,res,next)=>{try{res.json({success:true,data:await supportService.adminTickets(page.parse(req.query))});}catch(e){next(e)}});
  r.patch("/admin/support/tickets/:ticketId",async(req,res,next)=>{try{const input=z.object({status:z.enum(["OPEN","IN_PROGRESS","WAITING_FOR_USER","RESOLVED","CLOSED"]),response:z.string().trim().min(2).max(8000)}).parse(req.body);res.json({success:true,data:await supportService.respondTicket({ticketId:req.params.ticketId,userId:req.user.id,input})});}catch(e){next(e)}});
  r.get("/admin/feedback",async(req,res,next)=>{try{res.json({success:true,data:await supportService.adminFeedback(page.parse(req.query))});}catch(e){next(e)}});
  r.patch("/admin/feedback/:feedbackId",async(req,res,next)=>{try{const input=z.object({status:z.enum(["NEW","REVIEWING","PLANNED","IN_PROGRESS","COMPLETED","DECLINED"]),response:z.string().trim().max(8000).optional()}).parse(req.body);res.json({success:true,data:await supportService.updateFeedback({feedbackId:req.params.feedbackId,userId:req.user.id,input})});}catch(e){next(e)}});
  r.get("/admin/companies",async(req,res,next)=>{try{res.json({success:true,data:await adminService.companies(page.parse(req.query))});}catch(e){next(e)}});
  r.get("/admin/subscriptions",async(req,res,next)=>{try{res.json({success:true,data:await adminService.subscriptions(page.parse(req.query))});}catch(e){next(e)}});
  r.get("/admin/plans",async(_req,res,next)=>{try{res.json({success:true,data:await adminService.plans()});}catch(e){next(e)}});
  r.patch("/admin/plans/:planId",async(req,res,next)=>{try{res.json({success:true,data:await adminService.updatePlan({planId:req.params.planId,input:planPatch.parse(req.body)})});}catch(e){next(e)}});
  r.put("/admin/plans/:planId/prices/:countryCode",async(req,res,next)=>{try{res.json({success:true,data:await adminService.updatePrice({planId:req.params.planId,countryCode:req.params.countryCode,input:price.parse(req.body)})});}catch(e){next(e)}});
  r.get("/admin/billing/routes",async(_req,res,next)=>{try{res.json({success:true,data:await adminService.routes()});}catch(e){next(e)}});
  r.patch("/admin/billing/routes/:routeId",async(req,res,next)=>{try{res.json({success:true,data:await adminService.updateRoute({routeId:req.params.routeId,input:routePatch.parse(req.body)})});}catch(e){next(e)}});
  r.post("/admin/companies/:companyId/subscription/status",async(req,res,next)=>{try{const input=status.parse(req.body);res.json({success:true,data:await adminService.setSubscriptionStatus({companyId:req.params.companyId,...input}),message:"Subscription status updated"});}catch(e){next(e)}});
  return r;
}
