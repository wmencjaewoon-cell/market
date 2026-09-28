const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(path.dirname(module.filename), '../lib/asInquiry.ts');
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const loaded = new Module(filename, module);
loaded._compile(compiled.outputText, filename);
const { AS_CATEGORIES, AS_HOME_CATEGORIES, buildAsInquiryText, getInitialAsCategory } = loaded.exports;

test('every home category opens a supported inquiry category', () => {
  for (const item of AS_HOME_CATEGORIES) {
    assert.ok(AS_CATEGORIES.includes(item.category));
    assert.equal(getInitialAsCategory(item.category), item.category);
  }
});

test('untrusted route parameters fall back to the default category', () => {
  for (const value of [undefined, '', [], 'unknown', ['unknown', '문/창호']]) {
    assert.equal(getInitialAsCategory(value), '간단 AS');
  }
  assert.equal(getInitialAsCategory(['문/창호', '누수/배관']), '문/창호');
});

const emptyInput = { title: '', description: '', categories: ['간단 AS'], symptoms: [], attachmentCount: 0 };

test('an empty inquiry stays invalid instead of inventing a defect', () => {
  assert.equal(buildAsInquiryText(emptyInput).description, '');
});

test('photo-only inquiries get a neutral body and category title', () => {
  assert.deepEqual(buildAsInquiryText({ ...emptyInput, categories: ['문/창호'], attachmentCount: 1 }), {
    title: '문/창호 문의', description: '사진·영상으로 접수한 AS 문의입니다.',
  });
});

test('selected symptoms and typed details are both saved; custom titles are preserved', () => {
  assert.deepEqual(buildAsInquiryText({ ...emptyInput, title: '  주방 수전 확인  ', description: '  어제부터 시작됨  ', symptoms: ['물이 새요', '소음·진동이 나요'] }), {
    title: '주방 수전 확인', description: '증상: 물이 새요, 소음·진동이 나요\n\n어제부터 시작됨',
  });
});

test('symptom-only and text-only inquiries remain valid without attachments', () => {
  assert.equal(buildAsInquiryText({ ...emptyInput, symptoms: ['물이 새요'] }).description, '증상: 물이 새요');
  assert.equal(buildAsInquiryText({ ...emptyInput, description: '책장 선반 수리' }).description, '책장 선반 수리');
});

test('unknown and repeated symptoms are not persisted', () => {
  assert.equal(buildAsInquiryText({ ...emptyInput, symptoms: ['물이 새요', '물이 새요', 'unknown'] }).description, '증상: 물이 새요');
});
