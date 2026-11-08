/**
 * 应用版本号。
 *
 * 由 scripts/build.mjs 通过 esbuild define 注入（CI 中使用 Release tag），
 * 源码开发模式下回退为 "dev"。
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;
