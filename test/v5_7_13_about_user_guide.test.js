import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd(),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('About and User Guide is registered as an authenticated workspace route',()=>{
 const app=read('HySmart-Build-Web/src/App.jsx');
 const layout=read('HySmart-Build-Web/src/components/Layout.jsx');
 assert.match(app,/import AboutUserGuide from '\.\/pages\/AboutUserGuide\.jsx'/);
 assert.match(app,/<Route path="user-guide" element={<AboutUserGuide\/>}\/>/);
 assert.match(layout,/\['\/user-guide','About & User Guide',BookOpen,null\]/);
});
test('guide covers product purpose, construction problems, benefits, workflows, roles and support',()=>{
 const guide=read('HySmart-Build-Web/src/pages/AboutUserGuide.jsx');
 for(const phrase of ['What is HySmart Build?','Problems HySmart Build is designed to address','Why it matters to construction companies','Getting started: first-day checklist','Module-by-module user guide','Recommended daily workflow','Roles, dashboards and company access','Troubleshooting and frequently asked questions','Open Customer Care']) assert.ok(guide.includes(phrase),`Missing guide topic: ${phrase}`);
});
test('guide offers searchable modules and FAQs without changing backend permissions',()=>{
 const guide=read('HySmart-Build-Web/src/pages/AboutUserGuide.jsx');
 assert.match(guide,/useMemo/);assert.match(guide,/aria-label="Search user guide"/);assert.match(guide,/to="\/customer-care"/);
 assert.doesNotMatch(guide,/supabase\.from\(|fetch\(/);
});
