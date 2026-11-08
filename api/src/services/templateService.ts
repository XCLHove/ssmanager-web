/**
 * 服务器 JS 配置模板（ClashMeta）与 node:vm 沙箱。
 *
 * 模板签名：(function(ctx, h) { ... return object | string })
 * - 返回对象时用 h.yaml() 序列化；
 * - 沙箱不注入 require/process/console，禁用代码生成，执行超时 1000ms，代码上限 64KB。
 * - 编译结果按 port + code hash 缓存。
 */

import crypto from 'node:crypto';
import vm from 'node:vm';
import { stringify as yamlStringify } from 'yaml';
import { config } from '../config.js';
import { getServerRecord, saveServerTemplate } from '../serverStore.js';

const MAX_TEMPLATE_BYTES = 64 * 1024;
const EXECUTION_TIMEOUT_MS = 1000;

export class TemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TemplateError';
  }
}

export const DEFAULT_TEMPLATE_CODE = `function (ctx, h) {
  const proxy = {
    name: ctx.password.name,
    type: 'ss',
    server: ctx.server.host,
    port: ctx.server.port,
    cipher: ctx.server.method,
    password: ctx.server.password + ':' + ctx.password.psk,
    udp: true,
  };
  if (ctx.server.plugin) {
    proxy.plugin = ctx.server.plugin;
    if (ctx.server.pluginOpts) proxy['plugin-opts'] = ctx.server.pluginOpts;
  }
  return {
    'mixed-port': 7890,
    mode: 'rule',
    proxies: [proxy],
    'proxy-groups': [{ name: 'PROXY', type: 'select', proxies: [ctx.password.name] }],
    rules: ['MATCH,PROXY'],
  };
}`;

const HELPERS = Object.freeze({
  yaml: (obj) => yamlStringify(obj),
  json: (...args: Parameters<typeof JSON.stringify>) => JSON.stringify(...args),
  base64: (str) => Buffer.from(String(str), 'utf8').toString('base64'),
  base64url: (str) => Buffer.from(String(str), 'utf8').toString('base64url'),
  ssLink: ({ name, host, port, method, password }) => {
    const userinfo = Buffer.from(`${method}:${password}`, 'utf8').toString('base64url');
    const hostPart = String(host).includes(':') ? `[${host}]` : host;
    const fragment = name ? `#${encodeURIComponent(name)}` : '';
    return `ss://${userinfo}@${hostPart}:${port}${fragment}`;
  },
});

/** @type {Map<string, vm.Script>} */
const compileCache = new Map();

function compile(port, code) {
  if (typeof code !== 'string' || code.trim() === '') {
    throw new TemplateError('模板代码不能为空');
  }
  if (Buffer.byteLength(code, 'utf8') > MAX_TEMPLATE_BYTES) {
    throw new TemplateError('模板代码过大（最多 64KB）');
  }

  const key = `${port}:${crypto.createHash('sha256').update(code).digest('hex')}`;
  let script = compileCache.get(key);
  if (script) return script;

  try {
    script = new vm.Script(
      `(function () { const tpl = (${code}); if (typeof tpl !== 'function') throw new Error('模板必须是一个函数'); return tpl(ctx, h); })()`,
      { filename: `ssmanager-template-${port}.js` }
    );
  } catch (err) {
    throw new TemplateError(`模板语法错误: ${err.message}`);
  }

  compileCache.set(key, script);
  return script;
}

/** 仅校验模板可编译（不执行，不依赖服务器上下文）；供模板库保存使用 */
export function validateTemplateCode(code: string): void {
  compile(0, code);
}

function render(port, code, ctx) {
  const script = compile(port, code);

  const sandbox = Object.create(null);
  sandbox.ctx = ctx;
  sandbox.h = HELPERS;
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  // Node 会向 vm context 注入 console，这里移除，避免模板访问
  vm.runInContext('delete globalThis.console;', context, { timeout: 1000 });

  let result;
  try {
    result = script.runInContext(context, { timeout: EXECUTION_TIMEOUT_MS });
  } catch (err) {
    if (err?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || /timed out/i.test(err?.message || '')) {
      throw new TemplateError('模板执行超时（1000ms）');
    }
    throw new TemplateError(`模板执行失败: ${err.message}`);
  }

  if (typeof result === 'string') {
    if (result.trim() === '') throw new TemplateError('模板返回内容为空');
    return result;
  }
  if (result && typeof result === 'object') {
    return yamlStringify(result);
  }
  throw new TemplateError('模板必须返回对象或字符串');
}

function requireRecord(port) {
  const record = getServerRecord(port);
  if (!record) {
    throw new TemplateError('服务器不存在或缺少本地配置');
  }
  return record;
}

/** 预览/保存校验使用的假 ctx */
function buildPreviewContext(record) {
  const fakeServerPsk = Buffer.alloc(32, 1).toString('base64');
  const fakeUserPsk = Buffer.alloc(32, 2).toString('base64');
  const serverPsk = record.password || fakeServerPsk;

  return {
    server: {
      port: record.port,
      host: config.publicHost,
      method: record.method || '2022-blake3-aes-256-gcm',
      mode: record.mode,
      noDelay: record.noDelay,
      plugin: record.plugin,
      pluginOpts: record.pluginOpts,
      pluginMode: record.pluginMode,
      password: serverPsk,
    },
    user: { id: 1, username: 'preview' },
    password: {
      id: 1,
      slot: 1,
      psk: fakeUserPsk,
      name: 'ssm_u1_p1',
    },
    token: 'preview-token',
    generatedAt: Date.now(),
    format: 'clash',
  };
}

export function getTemplate(port) {
  const record = requireRecord(port);
  return {
    format: record.templateFormat || 'clash',
    code: record.templateCode ?? DEFAULT_TEMPLATE_CODE,
    defaultCode: DEFAULT_TEMPLATE_CODE,
    updatedAt: record.templateUpdatedAt,
  };
}

export function saveTemplate(port, format, code) {
  if (format !== 'clash') {
    throw new TemplateError('仅支持 clash 格式');
  }
  const record = requireRecord(port);
  render(record.port, code, buildPreviewContext(record));
  if (!saveServerTemplate(record.port, format, code)) {
    throw new TemplateError('服务器不存在或缺少本地配置');
  }
  return true;
}

export function previewTemplate(port, code) {
  const record = requireRecord(port);
  return render(record.port, code, buildPreviewContext(record));
}

/** 订阅渲染：优先本地自定义模板，否则使用内置默认模板 */
export function renderForPassword(port, ctx) {
  const record = requireRecord(port);
  return render(record.port, record.templateCode ?? DEFAULT_TEMPLATE_CODE, ctx);
}
