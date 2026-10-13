export function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err?.statusCode) ? err.statusCode : (Number.isInteger(err?.status) ? err.status : (err?.name === "ZodError" ? 400 : 500));
  const code = err?.code || (err?.name === "ZodError" ? "VALIDATION_ERROR" : (status === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR"));
  const expectedClientCodes = new Set(["INVITATION_INVALID", "INVITATION_EXPIRED", "INVITATION_EMAIL_MISMATCH", "INVITATION_ALREADY_USED", "INVITATION_REVOKED", "ALREADY_COMPANY_MEMBER"]);
  console.error(JSON.stringify({ level:"error", requestId:req.requestId, method:req.method, path:req.path || "/", message:err?.message || "Internal server error", code, stack:(process.env.NODE_ENV === "production" || expectedClientCodes.has(code)) ? undefined : err?.stack }));
  res.status(status).json({ success:false, error:{ code, message: status === 500 && process.env.NODE_ENV === "production" ? "An unexpected error occurred" : (err?.message || "Request failed") } });
}
