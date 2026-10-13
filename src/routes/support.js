import {Router} from 'express';
import {z} from 'zod';
const companyId=z.string().uuid();
const ticketInput=z.object({companyId:companyId,category:z.enum(['HOW_TO','BUG','BILLING','ACCOUNT','UPLOADS','OTHER']).default('HOW_TO'),priority:z.enum(['LOW','NORMAL','HIGH','URGENT']).default('NORMAL'),subject:z.string().trim().min(4).max(180),description:z.string().trim().min(10).max(8000)});
const feedbackInput=z.object({companyId:companyId,rating:z.number().int().min(1).max(5),category:z.enum(['GENERAL','FEATURE_REQUEST','BUG_REPORT','USABILITY','BILLING']).default('GENERAL'),subject:z.string().trim().min(4).max(180),message:z.string().trim().min(10).max(8000)});
export function createSupportRouter({supportService,authMiddleware}){const r=Router();r.use(authMiddleware);
 r.get('/support/faqs',async(_req,res,next)=>{try{res.json({success:true,data:await supportService.faq()})}catch(e){next(e)}});
 r.post('/support/answer',async(req,res,next)=>{try{const input=z.object({question:z.string().trim().min(3).max(1000)}).parse(req.body);res.json({success:true,data:await supportService.answerQuestion(input.question)})}catch(e){next(e)}});
 r.get('/support/tickets',async(req,res,next)=>{try{const id=companyId.parse(req.query.companyId);res.json({success:true,data:await supportService.tickets({user:req.user,companyId:id})})}catch(e){next(e)}});
 r.post('/support/tickets',async(req,res,next)=>{try{const input=ticketInput.parse(req.body);const data=await supportService.createTicket({user:req.user,companyId:input.companyId,input});res.status(201).json({success:true,data,message:'Support ticket submitted'})}catch(e){next(e)}});
 r.get('/support/feedback',async(req,res,next)=>{try{const id=companyId.parse(req.query.companyId);res.json({success:true,data:await supportService.myFeedback({user:req.user,companyId:id})})}catch(e){next(e)}});
 r.post('/support/feedback',async(req,res,next)=>{try{const input=feedbackInput.parse(req.body);const data=await supportService.createFeedback({user:req.user,companyId:input.companyId,input});res.status(201).json({success:true,data,message:'Company feedback sent to HySmart platform administration'})}catch(e){next(e)}});
 return r;}
