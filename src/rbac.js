export const ROLES = Object.freeze([
  "SUPER_ADMIN",
  "COMPANY_OWNER",
  "COMPANY_ADMIN",
  "DIRECTOR",
  "PROJECT_MANAGER",
  "SITE_ENGINEER",
  "SITE_SUPERVISOR",
  "ACCOUNTANT",
  "STOREKEEPER",
  "HR_MANAGER",
  "WORKER",
  "CLIENT",
  "CEO",
  "CIVIL_ENGINEER",
  "MANAGEMENT",
  "COMMERCIAL_MANAGER",
  "QUANTITY_SURVEYOR",
  "PROCUREMENT_OFFICER"
]);

export const PERMISSIONS = Object.freeze([
  "company:read", "company:update",
  "user:create", "user:read", "user:update",
  "project:create", "project:read", "project:update", "project:delete",
  "report:create", "report:read", "report:update", "report:approve", "report:print",
  "expense:create", "expense:read", "expense:approve", "expense:pay", "finance:create", "finance:read",
  "material:create", "material:read", "material:issue", "material:receive",
  "site:create", "site:read", "site:update", "site:delete",
  "project_team:create", "project_team:read", "project_team:update", "project_team:delete",
  "milestone:create", "milestone:read", "milestone:update", "milestone:delete",
  "worker:create", "worker:read", "worker:update", "worker:delete", "worker:assign",
  "attendance:create", "attendance:read", "attendance:update",
  "document:create", "document:read", "document:delete", "client:manage", "client:read", "message:create", "message:read", "notification:read", "notification:update", "billing:read", "billing:checkout", "billing:manage", "billing:admin", "task:create", "task:read", "task:update", "task:delete", "issue:create", "issue:read", "issue:update", "issue:delete", "activity:read", "material:request", "material:approve", "report:analytics", "report:export", "sync:push", "sync:read", "user:invite", "user:invite:read", "audit:read", "supplier:create", "supplier:read", "supplier:update", "supplier:delete", "procurement:read", "procurement:create", "procurement:approve", "procurement:receive", "procurement:pay", "accounting:read", "accounting:create", "accounting:post", "accounting:manage", "accounting:print", "ar:create", "ar:read", "ar:pay", "payroll:create", "payroll:approve", "bank:read", "bank:manage", "tax:manage", "schedule:read", "schedule:manage", "schedule:approve", "execution:read", "execution:manage", "quality:read", "quality:manage", "quality:approve", "safety:read", "safety:manage", "compliance:read", "compliance:manage", "collaboration:read", "collaboration:manage", "collaboration:approve", "collaboration:comment", "collaboration:respond", "collaboration:comment:manage", "workflow:read", "workflow:manage", "workflow:execute", "workflow:update", "executive:read", "executive:manage", "control-tower:read", "control-tower:manage", "recovery:read", "recovery:manage", "commercial-intelligence:read", "commercial-intelligence:manage", "production:read", "production:manage", "operating-system:read", "financial-intelligence:read", "financial-intelligence:manage", "lifecycle:read", "lifecycle:manage", "lifecycle:approve", "ai-assistant:use", "intelligence-predictions:read", "intelligence-alerts:read",
  "boq:read", "boq:manage", "inventory:read", "inventory:manage", "field:read", "field:manage",
  "dashboard:executive", "dashboard:finance", "dashboard:workforce", "dashboard:field"
]);

export const ROLE_LABELS = Object.freeze({
  SUPER_ADMIN: "Super Admin",
  COMPANY_OWNER: "Company Owner",
  COMPANY_ADMIN: "Company Admin",
  DIRECTOR: "Director",
  PROJECT_MANAGER: "Project Manager",
  SITE_ENGINEER: "Site Engineer",
  SITE_SUPERVISOR: "Site Supervisor",
  ACCOUNTANT: "Accountant",
  STOREKEEPER: "Storekeeper",
  HR_MANAGER: "HR Manager",
  WORKER: "Worker",
  CLIENT: "Client",
  CEO: "Chief Executive Officer",
  CIVIL_ENGINEER: "Civil Engineer",
  MANAGEMENT: "Management",
  COMMERCIAL_MANAGER: "Commercial Manager",
  QUANTITY_SURVEYOR: "Quantity Surveyor",
  PROCUREMENT_OFFICER: "Procurement Officer"
});

export function hasPermission(permissions, requiredPermission) {
  return permissions?.includes(requiredPermission) ?? false;
}
