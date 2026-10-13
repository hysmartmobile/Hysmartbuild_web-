import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CustomerCareLocalModel } from '../src/services/customerCareLocalModel.js';
import { SupportService } from '../src/services/supportService.js';

const articles = [{ id: 'daily-report', category: 'HOW_TO', question: 'How do I submit a report?', answer: 'Open Reports and submit the completed site report.' }];

test('uses Ollama native local chat API without external AI credentials', async () => {
  let sent;
  const model = new CustomerCareLocalModel({ baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:7b', fetchImpl: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(options.headers.Authorization, undefined);
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: { content: JSON.stringify({ answer: 'Open Reports, complete the site report fields, and submit it.', needsHumanSupport: false, matchedArticleId: 'daily-report' }) } }) };
  } });
  const result = await model.answer('How do I submit?', articles);
  assert.equal(result.mode, 'HYSMART_SELF_HOSTED_AI');
  assert.equal(result.matchedArticle.id, 'daily-report');
  assert.equal(sent.model, 'qwen2.5:7b');
  assert.equal(sent.stream, false);
  assert.match(sent.messages[1].content, /officialHySmartKnowledge/);
  assert.doesNotMatch(sent.messages[1].content, /company_members|billing_transactions|SUPABASE_SERVICE_ROLE_KEY/);
});

test('invalid local model output safely falls back to verified help articles', async () => {
  const model = new CustomerCareLocalModel({ fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: 'not json' } }) }) });
  await assert.rejects(() => model.answer('hello', articles));
  const service = new SupportService({ supabase: {}, aiProvider: { configured: true, answer: async () => { throw new Error('local model unavailable'); } } });
  const result = await service.answerQuestion('How do I submit a daily site report?');
  assert.equal(result.mode, 'VERIFIED_HELP_ARTICLES');
  assert.match(result.answer, /Open Reports/);
});

test('backend config selects a local model and contains no OpenAI endpoint or API key configuration', async () => {
  const env = await readFile(new URL('../src/config/env.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(env, /CUSTOMER_CARE_LOCAL_MODEL_URL/);
  assert.match(env, /CUSTOMER_CARE_LOCAL_MODEL_NAME/);
  assert.match(app, /new CustomerCareLocalModel/);
  assert.doesNotMatch(env, /CUSTOMER_CARE_AI_API_KEY|api\.openai\.com/);
  assert.match(readme, /Ollama's native `\/api\/chat` endpoint/);
});

test('assistant retrieves guide knowledge and labels the answer as self-hosted AI', async () => {
  let supplied;
  const provider = { configured: true, answer: async (question, knowledge) => { supplied = knowledge; return { mode: 'HYSMART_SELF_HOSTED_AI', answer: 'Check your role permissions and selected company.', matchedArticle: { id: knowledge[0].id, question: knowledge[0].question }, needsHumanSupport: false }; } };
  const service = new SupportService({ supabase: {}, aiProvider: provider });
  const result = await service.answerQuestion('Why can I not see my accounting dashboard?');
  assert.equal(result.mode, 'HYSMART_SELF_HOSTED_AI');
  assert.ok(supplied.some(item => item.category === 'PRODUCT_GUIDE'));
  assert.ok(supplied.length <= 8);
});
