import { Router } from 'express';
import { z } from 'zod';
const query=z.object({projectId:z.string().uuid().optional(),siteId:z.string().uuid().optional(),fromDate:z.string().date().optional(),toDate:z.string().date().optional()});
const csvCell=v=>`"${String(v??'').replaceAll('"','""')}"`;
const toCsv=rows=>{if(!rows.length)return '';const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];return [keys.map(csvCell).join(','),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\n');};
export function createAnalyticsRouter({analyticsService,authMiddleware,authorize}){const r=Router();r.use(authMiddleware);
 r.get('/companies/:companyId/dashboard',authorize('report:analytics'),async(req,res,next)=>{try{const overview=await analyticsService.overview({companyId:req.params.companyId,...query.parse(req.query)});res.json({success:true,data:overview});}catch(e){next(e)}});
 r.get('/companies/:companyId/analytics/overview',authorize('report:analytics'),async(req,res,next)=>{try{res.json({success:true,data:await analyticsService.overview({companyId:req.params.companyId,...query.parse(req.query)})});}catch(e){next(e)}});
 r.get('/companies/:companyId/reports/:reportType.csv',authorize('report:export'),async(req,res,next)=>{try{const rows=await analyticsService.exportRows({companyId:req.params.companyId,reportType:req.params.reportType,...query.parse(req.query)});res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="hysmart-${req.params.reportType}-report.csv"`);res.send(toCsv(rows));}catch(e){next(e)}});
 return r;}
