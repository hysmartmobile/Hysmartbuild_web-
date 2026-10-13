# HySmart Build Backend v2.7.0

## Workflow Automation & Command Centre

- Cross-module workflow action inbox
- Built-in risk scans for overdue schedule activities, NCRs, RFIs, material readiness and low productivity
- Deduplicated action generation
- Action acknowledgement/completion/dismissal workflow
- Configurable workflow rules and severity
- Automation run history
- In-app notification fan-out for assigned actions
- Management digest endpoint
- Tenant-safe composite foreign keys and RLS
- Dedicated workflow RBAC permissions

## Verification

- Backend regression: 158/158 tests passing
- Modified backend JavaScript syntax checks: passing
- Web production build: not verified in this environment because the offline npm cache is missing `yallist@3.1.1`.

Production CI must run:

```bash
npm ci
npm run build
```
