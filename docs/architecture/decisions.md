# Architecture decisions

## React instead of Next.js

The requested product stack explicitly specifies React.js PWA and React Native. The web app therefore uses React + Vite rather than replacing the requested stack with Next.js.

## Express instead of NestJS

The requested backend is Node.js + Express.js. The server is modularized with routes, middleware and a service layer rather than introducing NestJS.

## Supabase without Edge Functions

Supabase is used for database/platform capabilities. Application business logic remains in Node.js/Express and `service.js`, as requested.

## V0.1 scope

Only foundation and infrastructure are implemented. Business modules are intentionally deferred so that every later version can be tested against a stable base.
