import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, LoaderCircle } from "lucide-react";
import { api } from "../lib/api";
export default function BillingCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [state, setState] = useState("verifying");
  const [msg, setMsg] = useState("Verifying your payment with the provider…");
  useEffect(() => {
    (async () => {
      try {
        if (params.get("cancelled")) {
          setState("failed");
          setMsg(
            "Checkout was cancelled. Your subscription was not activated.",
          );
          return;
        }
       
const provider = (
  params.get('provider')
  || (params.get('tx_ref') ? 'FLUTTERWAVE'
    : params.get('session_id') ? 'STRIPE'
    : 'PAYSTACK')
).toUpperCase();

const reference =
  params.get('reference')
  || params.get('trxref')
  || params.get('tx_ref')
  || undefined;

        const transactionId = params.get("transaction_id");
        const sessionId = params.get("session_id");
        if (provider === "STRIPE" && !sessionId)
          throw new Error("Stripe checkout session was not returned");
        if (provider !== "STRIPE" && !reference)
          throw new Error("Payment reference was not returned by the gateway");
        const r = await api.verifyPayment({
          provider,
          reference: reference || `STRIPE-${sessionId}`,
          transactionId: transactionId || undefined,
          sessionId: sessionId || undefined,
        });
        if (r.data?.status === "SUCCESS") {
          setState("success");
          setMsg(
            "Payment verified. Your subscription is now active. Redirecting to your workspace…",
          );
          window.setTimeout(() => window.location.assign("/"), 1200);
        } else {
          setState("failed");
          setMsg(
            "The payment was not completed. Your subscription was not activated.",
          );
        }
      } catch (e) {
        setState("failed");
        setMsg(e.message);
      }
    })();
  }, [params]);
  return (
    <div className="onboard">
      <div className="onboard-card" style={{ textAlign: "center" }}>
        {state === "verifying" ? (
          <LoaderCircle className="spin" size={40} />
        ) : state === "success" ? (
          <CheckCircle2 size={40} />
        ) : (
          <XCircle size={40} />
        )}
        <h1>
          {state === "verifying"
            ? "Verifying payment"
            : state === "success"
              ? "Payment successful"
              : "Payment not completed"}
        </h1>
        <p className="lead">{msg}</p>
        <button className="btn primary wide" onClick={() => nav("/billing")}>
          Return to billing
        </button>
      </div>
    </div>
  );
}
