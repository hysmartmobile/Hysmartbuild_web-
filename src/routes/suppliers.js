import { Router } from "express";
import { z } from "zod";

const supplier = z.object({
  name:z.string().trim().min(2).max(180),
  contactName:z.string().trim().max(160).optional(),
  email:z.string().email().optional().nullable(),
  phone:z.string().trim().max(40).optional().nullable(),
  address:z.string().trim().max(400).optional().nullable(),
  taxId:z.string().trim().max(100).optional().nullable(),
  status:z.enum(["ACTIVE","INACTIVE","BLOCKED"]).optional(),
  notes:z.string().trim().max(2000).optional().nullable()
});
const query=z.object({
  page:z.coerce.number().int().min(1).default(1),
  pageSize:z.coerce.number().int().min(1).max(100).default(50),
  search:z.string().trim().max(100).optional(),
  status:z.enum(["ACTIVE","INACTIVE","BLOCKED"]).optional()
});

export function createSupplierRouter({ supplierService, authMiddleware, authorize }) {
  const r=Router(); r.use(authMiddleware);
  r.get("/companies/:companyId/suppliers",authorize("supplier:read"),async(req,res,next)=>{
    try{res.json({success:true,data:await supplierService.list({companyId:req.params.companyId,...query.parse(req.query)})});}catch(e){next(e);}
  });
  r.post("/companies/:companyId/suppliers",authorize("supplier:create"),async(req,res,next)=>{
    try{res.status(201).json({success:true,data:await supplierService.create({companyId:req.params.companyId,userId:req.user.id,input:supplier.parse(req.body)}),message:"Supplier created successfully"});}catch(e){next(e);}
  });
  r.patch("/companies/:companyId/suppliers/:supplierId",authorize("supplier:update"),async(req,res,next)=>{
    try{res.json({success:true,data:await supplierService.update({companyId:req.params.companyId,supplierId:req.params.supplierId,input:supplier.partial().parse(req.body)}),message:"Supplier updated successfully"});}catch(e){next(e);}
  });
  r.delete("/companies/:companyId/suppliers/:supplierId",authorize("supplier:delete"),async(req,res,next)=>{
    try{res.json({success:true,data:await supplierService.remove({companyId:req.params.companyId,supplierId:req.params.supplierId}),message:"Supplier deactivated successfully"});}catch(e){next(e);}
  });
  return r;
}
