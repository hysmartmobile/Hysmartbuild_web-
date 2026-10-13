import crypto from "node:crypto";

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) {
    const error = new Error(body?.message || `Payment provider request failed (${response.status})`);
    error.status = 502; error.code = "PAYMENT_PROVIDER_ERROR"; error.providerResponse = body; throw error;
  }
  return body;
}
function safeEqualText(a,b){const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
const stripeMinor=(amount,currency)=>new Set(["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]).has(String(currency).toUpperCase())?Math.round(Number(amount)):Math.round(Number(amount)*100);

export class PaystackProvider {
  constructor({secretKey,callbackUrl}){this.secretKey=secretKey;this.callbackUrl=callbackUrl;}
  async createPlan({name,amountMinor,currency,interval}){const body=await requestJson("https://api.paystack.co/plan",{method:"POST",headers:{Authorization:`Bearer ${this.secretKey}`,"Content-Type":"application/json"},body:JSON.stringify({name,amount:String(amountMinor),currency,interval,send_invoices:true})});if(!body.status||!body.data?.plan_code)throw new Error("Paystack did not return a plan code");return{planCode:body.data.plan_code};}
  async initialize({email,amountMinor,currency,reference,metadata,planCode}){const body=await requestJson("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:`Bearer ${this.secretKey}`,"Content-Type":"application/json"},body:JSON.stringify({email,amount:String(amountMinor),currency,reference,callback_url:this.callbackUrl,metadata,plan:planCode||undefined})});if(!body.status||!body.data?.authorization_url)throw new Error("Paystack did not return a checkout URL");return{checkoutUrl:body.data.authorization_url,accessCode:body.data.access_code,reference:body.data.reference};}
  async verify(reference){const body=await requestJson(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${this.secretKey}`}});return body.data;}
  verifyWebhook(rawBody,signature){if(!signature)return false;const digest=crypto.createHmac("sha512",this.secretKey).update(rawBody).digest("hex");return safeEqualText(digest,signature);}
}

export class FlutterwaveProvider {
  constructor({secretKey,secretHash,callbackUrl}){this.secretKey=secretKey;this.secretHash=secretHash;this.callbackUrl=callbackUrl;}
  async createPlan({name,amount,currency,interval}){const body=await requestJson("https://api.flutterwave.com/v3/payment-plans",{method:"POST",headers:{Authorization:`Bearer ${this.secretKey}`,"Content-Type":"application/json"},body:JSON.stringify({name,amount,currency,interval})});if(body.status!=="success"||!body.data?.id)throw new Error("Flutterwave did not return a payment plan ID");return{planId:Number(body.data.id)};}
  async initialize({email,amount,currency,reference,name,phone,metadata,paymentPlan}){const body=await requestJson("https://api.flutterwave.com/v3/payments",{method:"POST",headers:{Authorization:`Bearer ${this.secretKey}`,"Content-Type":"application/json"},body:JSON.stringify({tx_ref:reference,amount,currency,redirect_url:this.callbackUrl,customer:{email,name,phonenumber:phone||undefined},meta:metadata,customizations:{title:"HySmart Build Subscription"},payment_plan:paymentPlan||undefined})});if(body.status!=="success"||!body.data?.link)throw new Error("Flutterwave did not return a checkout URL");return{checkoutUrl:body.data.link,reference};}
  async verify(transactionId){const body=await requestJson(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,{headers:{Authorization:`Bearer ${this.secretKey}`}});return body.data;}
  verifyWebhook(rawBody,signature){if(!signature||!this.secretHash)return false;if(safeEqualText(this.secretHash,signature))return true;const digest=crypto.createHmac("sha256",this.secretHash).update(rawBody).digest("base64");return safeEqualText(digest,signature);}
}

export class StripeProvider {
  constructor({secretKey,callbackUrl,webhookSecret}){this.secretKey=secretKey;this.callbackUrl=callbackUrl;this.webhookSecret=webhookSecret;}
  async api(path,options={}){const headers={Authorization:`Bearer ${this.secretKey}`,...(options.headers||{})};return requestJson(`https://api.stripe.com/v1${path}`,{...options,headers});}
  async createProduct({name,description}){const body=await this.api("/products",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({name,description:description||"HySmart Build subscription"}).toString()});return{productId:body.id};}
  async createPrice({productId,amount,currency,interval}){const body=await this.api("/prices",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({currency:currency.toLowerCase(),unit_amount:String(stripeMinor(amount,currency)),"recurring[interval]":interval==='YEARLY'?'year':'month',product:productId}).toString()});return{priceId:body.id};}
  async initialize({priceId,reference,companyId}){const success=`${this.callbackUrl}?provider=STRIPE&session_id={CHECKOUT_SESSION_ID}&companyId=${encodeURIComponent(companyId)}&reference=${encodeURIComponent(reference)}`;const cancel=`${this.callbackUrl}?provider=STRIPE&cancelled=1&companyId=${encodeURIComponent(companyId)}`;const body=await this.api("/checkout/sessions",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({mode:"subscription",success_url:success,cancel_url:cancel,"line_items[0][price]":priceId,"line_items[0][quantity]":"1","metadata[reference]":reference,"metadata[companyId]":companyId}).toString()});if(!body.url)throw new Error("Stripe did not return a checkout URL");return{checkoutUrl:body.url,sessionId:body.id};}
  async verifySession(sessionId){return this.api(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=customer&expand[]=subscription`);}
  verifyWebhook(rawBody,signature){
    if(!this.webhookSecret||!signature)return false;
    const parts=String(signature).split(",");
    const timestamp=parts.find(x=>x.startsWith("t="))?.slice(2);
    const signatures=parts.filter(x=>x.startsWith("v1=")).map(x=>x.slice(3));
    if(!timestamp||!signatures.length)return false;
    const ts=Number(timestamp);
    if(!Number.isFinite(ts)||Math.abs(Date.now()/1000-ts)>300)return false;
    const expected=crypto.createHmac("sha256",this.webhookSecret).update(`${timestamp}.${rawBody.toString()}`).digest("hex");
    return signatures.some(s=>safeEqualText(expected,s));
  }
}
