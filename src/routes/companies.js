import { Router } from "express";
import { z } from "zod";
import { ROLES } from "../rbac.js";

const updateCompanySchema = z.object({ countryCode: z.string().trim().length(2).transform(v=>v.toUpperCase()).optional(), billingCountryCode: z.string().trim().length(2).transform(v=>v.toUpperCase()).optional(), taxCountryCode: z.string().trim().length(2).transform(v=>v.toUpperCase()).optional(), currencyCode: z.string().trim().length(3).transform(v=>v.toUpperCase()).optional(), timezone: z.string().trim().max(80).optional(), locale: z.string().trim().max(20).optional(), unitSystem: z.enum(["METRIC","IMPERIAL"]).optional(), name: z.string().trim().min(2).max(160).optional(), legalName: z.string().trim().max(200).optional(), phone: z.string().trim().max(40).optional(), email: z.string().email().optional().nullable(), industry: z.string().trim().min(2).max(120).optional().nullable() });
const invitationSchema=z.object({email:z.string().email(),role:z.enum(ROLES.filter((role)=>!["SUPER_ADMIN","COMPANY_OWNER"].includes(role))),expiresInDays:z.coerce.number().int().min(1).max(30).optional()});
const acceptInvitationSchema=z.object({token:z.string().trim().min(20).max(200),fullName:z.string().trim().min(2,"Enter your full name").max(120)});
const tokenSchema=z.object({token:z.string().trim().min(20).max(200)});
const createCompanySchema = z.object({ name: z.string().trim().min(2).max(160), legalName: z.string().trim().max(200).optional(), phone: z.string().trim().max(40).optional(), email: z.string().email().optional(), industry: z.string().trim().min(2).max(120).optional(), countryCode: z.string().trim().length(2).transform(v=>v.toUpperCase()), currencyCode: z.string().trim().length(3).transform(v=>v.toUpperCase()).optional(), timezone: z.string().trim().max(80).optional(), locale: z.string().trim().max(20).optional(), billingCountryCode: z.string().trim().length(2).transform(v=>v.toUpperCase()).optional(), taxCountryCode: z.string().trim().length(2).transform(v=>v.toUpperCase()).optional(), unitSystem: z.enum(["METRIC","IMPERIAL"]).optional() });

export function createCompaniesRouter({ companyService, authMiddleware, authorize, auditService }) {
  const router = Router();
  router.get("/invitations/preview", async (req,res,next)=>{try{const input=tokenSchema.parse(req.query);const result=await companyService.previewInvitation(input);res.json({success:true,data:result});}catch(e){next(e)}});

  router.use(authMiddleware);

  router.get("/", async (req, res, next) => {
    try { res.json({ success: true, data: await companyService.listForUser(req.user.id) }); } catch (error) { next(error); }
  });

  router.post("/", async (req, res, next) => {
    try {
      const input = createCompanySchema.parse(req.body);
      const company = await companyService.createCompany({ userId: req.user.id, ...input });
      res.status(201).json({ success: true, data: company, message: "Company created successfully" });
    } catch (error) {
      if (error?.code === "23505" || error?.code === "COMPANY_CREATION_LIMIT_REACHED") return res.status(409).json({ success:false, error:{ code:"COMPANY_CREATION_LIMIT_REACHED", message:"You can create only one company. You can join additional companies by invitation." } });
      next(error);
    }
  });

  router.post("/invitations/accept", async (req,res,next)=>{try{const input=acceptInvitationSchema.parse(req.body);const result=await companyService.acceptInvitation({userId:req.user.id,email:req.user.email,token:input.token,fullName:input.fullName});res.json({success:true,data:result,message:"Invitation accepted"});}catch(e){next(e)}});

  router.post("/:companyId/invitations", authorize("user:invite"), async (req,res,next)=>{try{const input=invitationSchema.parse(req.body);const result=await companyService.createInvitation({companyId:req.params.companyId,invitedBy:req.user.id,...input});res.status(201).json({success:true,data:result,message:"Invitation created"});}catch(e){next(e)}});

  router.get("/:companyId/invitations", authorize("user:invite:read"), async (req,res,next)=>{try{const page=Math.max(1,Number(req.query.page||1));const pageSize=Math.min(100,Math.max(1,Number(req.query.pageSize||50)));res.json({success:true,data:await companyService.listInvitations({companyId:req.params.companyId,page,pageSize})});}catch(e){next(e)}});
  router.post("/:companyId/invitations/:invitationId/revoke", authorize("user:invite"), async (req,res,next)=>{try{const reason=z.object({reason:z.string().trim().min(3).max(1000)}).parse(req.body).reason;res.json({success:true,data:await companyService.revokeInvitation({companyId:req.params.companyId,invitationId:req.params.invitationId,actorUserId:req.user.id,reason}),message:"Invitation revoked"});}catch(e){next(e)}});
  router.patch("/:companyId/members/:userId/access", authorize("user:manage"), async (req,res,next)=>{try{const input=z.object({action:z.enum(["SUSPEND","REACTIVATE"]),reason:z.string().trim().min(3).max(1000)}).parse(req.body);res.json({success:true,data:await companyService.updateMemberAccess({companyId:req.params.companyId,userId:req.params.userId,actorUserId:req.user.id,...input}),message:input.action==='SUSPEND'?"Member access suspended":"Member access reactivated"});}catch(e){next(e)}});
  router.get("/:companyId/access-lifecycle", authorize("user:read"), async (req,res,next)=>{try{const page=Math.max(1,Number(req.query.page||1));const pageSize=Math.min(100,Math.max(1,Number(req.query.pageSize||25)));res.json({success:true,data:await companyService.listAccessLifecycleEvents({companyId:req.params.companyId,page,pageSize})});}catch(e){next(e)}});

  router.get("/:companyId/members", authorize("user:read"), async (req, res, next) => {
    try { const page = Math.max(1, Number(req.query.page || 1)); const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 50))); res.json({ success:true, data: await companyService.listMembers({ companyId:req.params.companyId, page, pageSize, search:req.query.search }) }); } catch(error){ next(error); }
  });

  router.patch("/:companyId", authorize("company:update"), async (req,res,next)=>{
    try {
      const input=updateCompanySchema.parse(req.body);
      res.json({success:true,data:await companyService.updateCompany({companyId:req.params.companyId,input}),message:"Company updated successfully"});
    } catch(error){ next(error); }
  });


  router.get("/:companyId/audit-logs", authorize("audit:read"), async (req,res,next)=>{
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 50)));
      res.json({ success:true, data: await auditService.list({
        companyId:req.params.companyId,
        page,pageSize,
        action:req.query.action,
        entityType:req.query.entityType,
        actorUserId:req.query.actorUserId
      })});
    } catch(error){ next(error); }
  });

  router.get("/:companyId/membership", async (req, res, next) => {
    try {
      const membership = await companyService.getMembership({ userId: req.user.id, companyId: req.params.companyId });
      if (!membership) return res.status(404).json({ success: false, error: { code: "COMPANY_ACCESS_DENIED", message: "Company not found or access denied" } });
      res.json({ success: true, data: membership });
    } catch (error) { next(error); }
  });

  return router;
}
