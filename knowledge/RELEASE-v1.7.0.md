# HySmart Build Web PWA v1.7.0

Project Operations Control Center upgrade.

## Included
- Full V1.6.2 Web PWA source retained
- Project lifecycle actions: Start, Hold, Resume, Complete, Cancel
- Project status history
- Project control center
- Budget and cost baseline UI
- Risk register UI
- Change order UI
- Project readiness checklist UI
- Project portfolio status filters
- Expanded project creation form
- API integration with V1.7 project-operation endpoints

## Database
Apply backend migration `20261003220000_v1_7_project_operations.sql` after the existing V1.6.x migrations/repairs.

## Run
`npm install`
`npm run dev`
