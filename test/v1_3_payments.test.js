import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PaystackProvider, FlutterwaveProvider } from "../src/services/paymentProviders.js";

const hmac=(algo,key,data,enc)=>crypto.createHmac(algo,key).update(data).digest(enc);

test("Paystack webhook signature validates exact raw payload",()=>{
 const p=new PaystackProvider({secretKey:"sk_test_secret",callbackUrl:"http://localhost/callback"});
 const raw=Buffer.from('{"event":"charge.success","data":{"reference":"HS-1"}}');
 const sig=hmac("sha512","sk_test_secret",raw,"hex");
 assert.equal(p.verifyWebhook(raw,sig),true);
 assert.equal(p.verifyWebhook(raw,"bad"),false);
});

test("Flutterwave v4 webhook signature validates HMAC-SHA256 base64",()=>{
 const p=new FlutterwaveProvider({secretKey:"flw_secret",secretHash:"webhook-secret",callbackUrl:"http://localhost/callback"});
 const raw=Buffer.from('{"type":"charge.completed","id":"wbk_1"}');
 const sig=hmac("sha256","webhook-secret",raw,"base64");
 assert.equal(p.verifyWebhook(raw,sig),true);
 assert.equal(p.verifyWebhook(raw,"bad"),false);
});

test("Flutterwave legacy verif-hash is accepted by the route contract",()=>{
 const p=new FlutterwaveProvider({secretKey:"flw_secret",secretHash:"legacy-hash",callbackUrl:"http://localhost/callback"});
 const raw=Buffer.from("payload");
 // Legacy dashboard configurations can send the configured secret directly; the route accepts it,
 // while current v4 configurations should use flutterwave-signature/HMAC.
 assert.equal(p.verifyWebhook(raw,"legacy-hash"),true);
});
