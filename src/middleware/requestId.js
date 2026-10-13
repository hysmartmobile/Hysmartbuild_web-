import { randomUUID } from "node:crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,80}$/;

export function requestId(req, res, next) {
  const supplied = req.header("x-request-id");
  // Do not reflect arbitrary client input into response headers or structured logs.
  const id = typeof supplied === "string" && SAFE_REQUEST_ID.test(supplied)
    ? supplied
    : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
