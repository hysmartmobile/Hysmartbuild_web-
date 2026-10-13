import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd());
const service=fs.readFileSync(path.join(root,'src/services/companyService.js'),'utf8');
const route=fs.readFileSync(path.join(root,'src/routes/companies.js'),'utf8');
const accept=fs.readFileSync(path.join(root,'../HySmart-Build-Web/src/pages/InvitationAccept.jsx'),'utf8');
const layout=fs.readFileSync(path.join(root,'../HySmart-Build-Web/src/components/Layout.jsx'),'utf8');
const app=fs.readFileSync(path.join(root,'../HySmart-Build-Web/src/App.jsx'),'utf8');
test('invitation acceptance requires and persists a real full name',()=>{
 assert.match(route,/fullName:z\.string\(\)\.trim\(\)\.min\(2/);
 assert.match(route,/fullName:input\.fullName/);
 assert.match(service,/normalizedFullName/);
 assert.match(service,/from\("profiles"\)\.upsert\(\{ id:userId, full_name:normalizedFullName/);
 assert.match(service,/updateUserById\(userId, \{ user_metadata:\{ full_name:normalizedFullName \} \}\)/);
 assert.match(accept,/Enter your first and last name/);
});
test('company switching reloads company-scoped access, unread count, profile name and billing status',()=>{
 assert.match(layout,/addEventListener\('hysmart-company-change',refresh\)/);
 assert.match(layout,/Promise\.all\(\[api\.access\(\),api\.unreadCount\(\).*api\.me\(\)/);
 assert.match(layout,/setProfileName\(String\(m\?\.data\?\.profile\?\.full_name/);
 assert.match(layout,/function switchCompany\(c\).*setSelectedCompany\(c\.id\)/);
 assert.match(app,/addEventListener\('hysmart-company-change',onCompanyChanged\)/);
});
