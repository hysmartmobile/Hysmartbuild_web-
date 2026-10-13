import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CustomerCareLocalModel } from '../src/services/customerCareLocalModel.js';
import { SupportService } from '../src/services/supportService.js';

const articles = [{ id: 'daily-report', category: 'HOW_TO', question: 'How do I submit a report?', answer: 'Open Reports and submit the completed site report.' }];

test('Customer Care uses a self-hosted model with no API key or authorization header', async () => {
  let request;
  const model = new CustomerCareLocalModel({ fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ message: { content: JSON.stringify({ answer: 'Open Reports and submit the completed site report.', needsHumanSupport: false, matchedArticleId: 'daily-report' }) } }) };
  } });
  const result = await model.answer('How do I submit?', articles);
  assert.equal(result.mode, 'HYSMART_SELF_HOSTED_AI');
  assert.equal(result.matchedArticle.id, 'daily-report');
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.options.headers.Authorization, undefined);
});

test('unavailable local inference safely falls back to verified help articles', async () => {
  const service = new SupportService({ supabase: {}, aiProvider: { configured: true, answer: async () => { throw new Error('local model unavailable'); } } });
  const result = await service.answerQuestion('How do I submit a daily site report?');
  assert.equal(result.mode, 'VERIFIED_HELP_ARTICLES');
  assert.match(result.answer, /Open Reports/);
});

test('runtime config contains no OpenAI API integration and selects local inference', async () => {
  const env = await readFile(new URL('../src/config/env.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const web = await readFile(new URL('../../HySmart-Build-Web/src/pages/CustomerCare.jsx', import.meta.url), 'utf8');
  assert.match(env, /CUSTOMER_CARE_LOCAL_MODEL_URL/);
  assert.match(app, /new CustomerCareLocalModel/);
  assert.doesNotMatch(env, /CUSTOMER_CARE_AI_API_KEY|api\.openai\.com/);
  assert.doesNotMatch(web, /CUSTOMER_CARE_AI_API_KEY/);
});

test('Customer Care retrieves broad About and User Guide sections', async () => {
  let supplied;
  const provider = { configured: true, answer: async (question, knowledge) => { supplied = knowledge; return { mode: 'HYSMART_SELF_HOSTED_AI', answer: 'Check the selected company and your role permissions.', matchedArticle: { id: knowledge[0].id, question: knowledge[0].question }, needsHumanSupport: false }; } };
  const service = new SupportService({ supabase: {}, aiProvider: provider });
  const result = await service.answerQuestion('Why can I not see my company accounting dashboard?');
  assert.equal(result.mode, 'HYSMART_SELF_HOSTED_AI');
  assert.ok(supplied.some(item => item.category === 'PRODUCT_GUIDE'));
  assert.ok(supplied.length <= 8);
});
