const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

// Native modules are stubbed only for the upload boundary; the production TypeScript is executed unchanged.
function loadTypeScript(relativePath, mocks = {}) {
  const filename = path.resolve(path.dirname(module.filename), '..', relativePath);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = new Module(filename, module);
  loaded.require = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected runtime import: ${name}`);
  };
  loaded._compile(compiled.outputText, filename);
  return loaded.exports;
}

const media = loadTypeScript('lib/mediaAttachments.ts');
const asset = (overrides = {}) => ({ uri: 'file:///clip.mp4', type: 'video', mimeType: 'video/mp4', ...overrides });

test('video extensions include MOV and signed URLs, but not query-string lookalikes', () => {
  for (const name of ['a.mp4', 'a.MOV', 'a.m4v', 'a.webm?token=123', 'a.mp4#t=3']) {
    assert.equal(media.isVideoAttachment(name), true, name);
  }
  for (const name of ['photo.jpg', 'photo.jpg?name=clip.mp4', 'clip.mp4.jpg', '']) {
    assert.equal(media.isVideoAttachment(name), false, name);
  }
});

test('original JPEG/PNG and MOV use their real MIME and extension', () => {
  assert.deepEqual(media.getMediaFormat(asset()), { kind: 'video', extension: 'mp4', contentType: 'video/mp4' });
  assert.equal(media.getMediaFormat(asset({ mimeType: 'video/quicktime', fileName: 'IMG_001.MOV' })).extension, 'mov');
  assert.equal(media.getMediaFormat(asset({ type: 'image', mimeType: 'image/png', uri: 'file:///a.png' })).extension, 'png');
  assert.equal(media.getMediaFormat(asset({ type: 'image', mimeType: 'image/jpeg', fileName: 'old.heic' })).extension, 'jpg');
  assert.equal(media.getMediaFormat(asset({ mimeType: null, uri: 'file:///clip.MOV' })).contentType, 'video/quicktime');
});

test('unsupported media and videos disguised as images are rejected', () => {
  assert.throws(() => media.getMediaFormat(asset({ mimeType: 'video/avi', uri: 'file:///a.avi' })));
  assert.throws(() => media.getMediaFormat(asset({ mimeType: 'image/jpeg', uri: 'file:///a.jpg' })));
});

test('size limits accept their exact boundary and reject empty, invalid, or oversized files', () => {
  media.validateMediaSize('image', media.IMAGE_MAX_BYTES);
  media.validateMediaSize('video', media.VIDEO_MAX_BYTES);
  assert.throws(() => media.validateMediaSize('image', media.IMAGE_MAX_BYTES + 1));
  assert.throws(() => media.validateMediaSize('video', media.VIDEO_MAX_BYTES + 1));
  for (const size of [0, -1, NaN, Infinity]) assert.throws(() => media.validateMediaSize('video', size));
});

test('video messages round-trip while legacy text/photos remain untouched', () => {
  const payload = { url: 'https://example.com/chat-images/room/a.mp4', name: 'repair.mp4', duration: 90123 };
  assert.deepEqual(media.parseVideoMessage(media.makeVideoMessage(payload)), payload);
  assert.equal(media.parseVideoMessage('hello'), null);
  assert.equal(media.parseVideoMessage('\u{1f4f7} 이미지묶음\n[]'), null);
  assert.equal(media.parseVideoMessage(`${media.VIDEO_MESSAGE_PREFIX}{broken`), null);
  for (const url of ['javascript:alert(1)', 'file:///a.mp4', 'data:video/mp4;base64,', null]) {
    assert.equal(media.parseVideoMessage(media.makeVideoMessage({ url })), null);
  }
});

test('untrusted labels and durations are normalized', () => {
  const parsed = media.parseVideoMessage(media.makeVideoMessage({ url: 'https://example.com/a.mp4', name: 'a'.repeat(300), duration: -10 }));
  assert.equal(parsed.name.length, 200);
  assert.equal(parsed.duration, undefined);
  assert.equal(media.formatVideoDuration(90123), '1:30');
  for (const value of [null, -1, Infinity]) assert.equal(media.formatVideoDuration(value), '');
});

function uploadHarness({ size = 128, platform = 'ios', uploadError = null } = {}) {
  const calls = [];
  const storage = {
    upload: async (path, data, options) => { calls.push({ path, data, options }); return { error: uploadError }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://example.com/${path}` } }),
    remove: async (paths) => { calls.push({ removed: paths }); return { error: null }; },
  };
  class File {
    size = size;
    async arrayBuffer() { calls.push('read'); return new ArrayBuffer(size); }
  }
  const upload = loadTypeScript('lib/mediaUpload.ts', {
    'expo-file-system': { File },
    'react-native': { Platform: { OS: platform } },
    './mediaAttachments': media,
    './supabase': { supabase: { storage: { from: (bucket) => { assert.ok(['chat-images', 'estimate-images'].includes(bucket)); return storage; } } } },
  });
  return { calls, ...upload };
}

test('native upload uses binary data and retains room/path and MOV MIME', async () => {
  const upload = uploadHarness();
  const result = await upload.uploadMediaAsset('chat-images', 'room/unique', asset({ mimeType: 'video/quicktime' }));
  assert.equal(result.path, 'room/unique.mov');
  assert.equal(result.kind, 'video');
  assert.equal(upload.calls[1].options.contentType, 'video/quicktime');
  assert.equal(upload.calls[1].options.upsert, false);
  assert.ok(upload.calls[1].data instanceof ArrayBuffer);
});

test('oversized native video is rejected before binary allocation or upload', async () => {
  const upload = uploadHarness({ size: media.VIDEO_MAX_BYTES + 1 });
  await assert.rejects(upload.uploadMediaAsset('estimate-images', 'user/request/file', asset()));
  assert.deepEqual(upload.calls, []);
});

test('web uploads use selected Blob without native file reads', async () => {
  const upload = uploadHarness({ platform: 'web' });
  const file = new Blob(['video'], { type: 'video/mp4' });
  await upload.uploadMediaAsset('chat-images', 'room/file', asset({ file }));
  assert.equal(upload.calls.length, 1);
  assert.equal(upload.calls[0].data, file);
});

test('storage errors propagate and only explicitly requested orphan paths are removed', async () => {
  const failure = new Error('RLS denied');
  const upload = uploadHarness({ uploadError: failure });
  await assert.rejects(upload.uploadMediaAsset('chat-images', 'room/file', asset()), failure);
  await upload.removeUploadedMedia('chat-images', ['room/orphan.mp4']);
  assert.deepEqual(upload.calls.at(-1), { removed: ['room/orphan.mp4'] });
});
