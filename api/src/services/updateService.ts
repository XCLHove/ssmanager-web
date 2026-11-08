/**
 * 版本检查：从 GitHub 获取最新 Release，并与当前构建版本比较。
 *
 * - 结果缓存 15 分钟，避免触发 GitHub API 频率限制。
 * - 私有仓库需要配置 githubToken。
 */

import { config } from '../config.js';
import { APP_VERSION } from '../version.js';

export interface LatestRelease {
  tag: string;
  name: string | null;
  body: string | null;
  url: string;
  publishedAt: string | null;
}

export interface VersionInfo {
  current: string;
  latest: LatestRelease | null;
  hasUpdate: boolean;
  error: string | null;
}

const CACHE_TTL_MS = 15 * 60 * 1000;

let cache: { at: number; value: VersionInfo } | null = null;

function normalize(tag: string): string {
  return String(tag ?? '')
    .trim()
    .replace(/^v/i, '');
}

function parseVersion(value: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(normalize(value));
  if (!match) return null;
  return match.slice(1, 4).map((part) => Number(part));
}

/** 仅比较 major.minor.patch；无法解析时视为不更新 */
function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

/** 拉取当前版本到最新版本之间的提交，作为 Release 说明缺失时的补充 */
async function fetchCompareCommits(
  current: string,
  latestTag: string
): Promise<string[] | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ssmanager-web',
  };
  if (config.githubToken) {
    headers.Authorization = `Bearer ${config.githubToken}`;
  }

  const fromCandidates = [`v${current}`, current];
  for (const from of fromCandidates) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${config.githubRepo}/compare/${encodeURIComponent(
          from
        )}...${encodeURIComponent(latestTag)}`,
        { headers, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;

      const data = (await res.json()) as { commits?: Array<Record<string, unknown>> };
      if (!Array.isArray(data.commits)) continue;

      return data.commits.map((item) => {
        const commit = (item.commit ?? {}) as Record<string, unknown>;
        const message = String(commit.message ?? '').split('\n')[0].trim();
        const sha = String(item.sha ?? '').slice(0, 7);
        return `- ${message} (\`${sha}\`)`;
      });
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchLatestRelease(): Promise<LatestRelease> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ssmanager-web',
  };
  if (config.githubToken) {
    headers.Authorization = `Bearer ${config.githubToken}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${config.githubRepo}/releases/latest`,
    { headers, signal: AbortSignal.timeout(8000) }
  );

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('未找到最新 Release（私有仓库请配置 githubToken）');
    }
    throw new Error(`GitHub API 返回 ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    tag: String(data.tag_name ?? ''),
    name: data.name ? String(data.name) : null,
    body: data.body ? String(data.body) : null,
    url: String(data.html_url ?? ''),
    publishedAt: data.published_at ? String(data.published_at) : null,
  };
}

export async function getVersionInfo(): Promise<VersionInfo> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  let latest: LatestRelease | null = null;
  let error: string | null = null;

  try {
    latest = await fetchLatestRelease();
  } catch (err) {
    error = err instanceof Error ? err.message : '检查新版本失败';
  }

  const current = normalize(APP_VERSION);
  const hasUpdate = Boolean(latest?.tag && isNewer(latest.tag, current));

  // 旧版本的 Release 说明可能只有 Full Changelog 链接；
  // 有新版本但说明中没有提交列表时，用 compare API 补充提交记录。
  if (latest && hasUpdate && !/^\s*-\s/m.test(latest.body ?? '')) {
    const commits = await fetchCompareCommits(current, latest.tag);
    if (commits && commits.length > 0) {
      latest = {
        ...latest,
        body:
          `${commits.join('\n')}\n\n` +
          `**完整对比**: https://github.com/${config.githubRepo}/compare/` +
          `${encodeURIComponent(`v${current}`)}...${encodeURIComponent(latest.tag)}`,
      };
    }
  }

  const value: VersionInfo = { current, latest, hasUpdate, error };

  cache = { at: Date.now(), value };
  return value;
}
