# HySmart Build Web PWA V1.4.0 deployment checklist

1. Run `npm install`.
2. Copy `.env.example` to `.env` and configure the production Node API and Supabase public values.
3. Run `npm run build` and deploy the generated `dist` directory to the selected static host.
4. Verify the browser calls `/api/v1` on the production backend.
5. Verify that mobile-created offline field records appear in the same company workspace after synchronization.
6. Verify the top-bar sync indicator reports conflicts when the backend has recorded one.

Never expose backend service-role, Paystack secret, or Flutterwave secret credentials in this application.
