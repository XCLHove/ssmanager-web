/**
 * esbuild 单文件打包：把 express/cors/yaml 等全部内联到 dist/server.mjs。
 *
 * unix-dgram 保持 external，并在构建后把该可选原生模块及其运行期依赖复制到
 * dist/node_modules/，使携带 Unix socket 支持的部署目录无需再 npm install。
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const DIST_NODE_MODULES = path.join(DIST_DIR, 'node_modules');
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));

fs.rmSync(DIST_DIR, { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/server.mjs',
  external: ['unix-dgram'],
  logLevel: 'info',
  // 部分 CJS 依赖（如 debug）会动态 require 内置模块；ESM 产物需要注入 require
  banner: {
    js: "import { createRequire as __esbuildCreateRequire } from 'node:module'; const require = __esbuildCreateRequire(import.meta.url);",
  },
});

/** 递归复制一个包及其 package.json dependencies 到 dist/node_modules */
function copyPackage(name, fromDir, seen, copied) {
  if (seen.has(name)) return;
  seen.add(name);

  let pkgJsonPath;
  try {
    pkgJsonPath = createRequire(path.join(fromDir, 'package.json')).resolve(
      `${name}/package.json`
    );
  } catch (err) {
    console.warn(`[build] 无法解析依赖 ${name}，已跳过: ${err.message}`);
    return;
  }

  const sourceDir = path.dirname(pkgJsonPath);
  const destDir = path.join(DIST_NODE_MODULES, name);
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.cpSync(sourceDir, destDir, { recursive: true, dereference: true, force: true });

  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  copied.push(`${pkg.name}@${pkg.version}`);

  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    copyPackage(dep, sourceDir, seen, copied);
  }
}

/** 查找目录下是否存在 .node 原生二进制 */
function findNodeBinary(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.node')) return full;
    if (entry.isDirectory()) {
      const found = findNodeBinary(full);
      if (found) return found;
    }
  }
  return null;
}

function copyUnixDgram() {
  const source = path.join(ROOT, 'node_modules', 'unix-dgram');
  if (!fs.existsSync(source)) {
    console.warn(
      '[build] 未找到 node_modules/unix-dgram，跳过复制；UDP 模式不受影响，Unix socket 模式在部署机不可用'
    );
    return;
  }

  fs.rmSync(DIST_NODE_MODULES, { recursive: true, force: true });
  fs.mkdirSync(DIST_NODE_MODULES, { recursive: true });

  const copied = [];
  copyPackage('unix-dgram', ROOT, new Set(), copied);

  const binary = findNodeBinary(path.join(DIST_NODE_MODULES, 'unix-dgram'));
  const platform = `${process.platform}/${process.arch}, Node ABI ${process.versions.modules}`;
  if (binary) {
    console.log(`[build] 已复制 unix-dgram 及依赖: ${copied.join(', ')}`);
    console.log(`[build] 包含原生二进制: ${path.relative(DIST_DIR, binary)} (${platform})`);
  } else {
    console.warn(
      `[build] 警告: dist 中 unix-dgram 未包含可用 .node 二进制（${platform}），Unix socket 模式在部署机不可用；` +
        '请在目标平台执行 pnpm approve-builds + pnpm rebuild unix-dgram 后重新构建。UDP 模式不受影响。'
    );
    console.warn(`[build] 已复制的模块: ${copied.join(', ')}`);
  }
}

try {
  copyUnixDgram();
} catch (err) {
  console.warn(`[build] 复制 unix-dgram 失败（不影响构建）: ${err.message}`);
}
