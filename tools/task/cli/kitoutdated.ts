// @module templates/bin/task/cli/kitoutdated
// @role 通用 task 工具的套件更新檢查指令：實作 task kit-outdated（向 GitHub 上游比對版本與 CHANGELOG 專案動作）
// @why 讓專案在不手動翻查上游套件庫的情況下，知道是否有新版本以及升級前後須人工配合處理的步驟
// @forbid 禁止在此指令寫入或修改專案檔案、自動執行升級、或未設逾時呼叫外部程序

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { computeMarkdownFencedLines, splitTextLines } from './docs.ts';
import { findConfigPath, loadManifest } from './kitcheck.ts';
import { fail, usageError } from './runtime.ts';

const GH_API_TIMEOUT_MS = 30000;
const REPO_SLUG_RE = /^[^/\s]+\/[^/\s]+$/;
const ACTION_PREFIX = '- ⚠️ 需要專案動作：';
const VERSION_HEADING_RE = /^##\s+(\d+(?:\.\d+)*)(?=$|[^\d.])/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseVersionParts(raw: unknown): number[] | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^\d+(?:\.\d+)*$/.test(trimmed)) return null;
  return trimmed.split('.').map((part) => Number(part));
}

function compareVersionParts(aParts: readonly number[], bParts: readonly number[]): number {
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal !== bVal) return aVal < bVal ? -1 : 1;
  }
  return 0;
}

function fetchUpstreamRaw(kitUpstream: string, relPath: string): string {
  const ghBin = process.env.TASK_GH_BIN || 'gh';
  const endpoint = `repos/${kitUpstream}/contents/${relPath}`;
  // @why 外部 gh CLI 呼叫必須設定逾時與 SIGKILL，避免網路異常時卡死常駐對話
  const res = spawnSync(ghBin, ['api', endpoint, '-H', 'Accept: application/vnd.github.raw'], {
    encoding: 'utf8',
    timeout: GH_API_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (res.error || res.status !== 0) {
    const detail = res.error ? res.error.message : (res.stderr || res.stdout || `exit ${res.status}`).trim();
    fail(`無法從上游 ${kitUpstream} 讀取 ${relPath}：${detail}`);
  }
  return res.stdout || '';
}

function extractRequiredProjectActions(
  changelogText: string,
  localParts: readonly number[],
  latestParts: readonly number[],
): string[] {
  const lines = splitTextLines(changelogText);
  const fenced = computeMarkdownFencedLines(lines);
  const actions: string[] = [];
  let activeSectionVersion: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    if (fenced[i]) continue;
    const line = lines[i].trimEnd();

    if (line.startsWith('## ')) {
      const match = VERSION_HEADING_RE.exec(line);
      if (match) {
        const secVer = match[1];
        const secParts = parseVersionParts(secVer);
        const inRange =
          secParts !== null &&
          compareVersionParts(secParts, localParts) > 0 &&
          compareVersionParts(secParts, latestParts) <= 0;
        activeSectionVersion = inRange ? secVer : null;
      } else {
        activeSectionVersion = null;
      }
      continue;
    }

    if (activeSectionVersion !== null && line.startsWith(ACTION_PREFIX)) {
      const content = line.slice(ACTION_PREFIX.length).trim();
      if (content) {
        actions.push(`ACTION ${activeSectionVersion} ${content}`);
      }
    }
  }

  return actions;
}

/** 執行 `task kit-outdated`：比對本地 `.kit/manifest.json` 與上游 `kitUpstream` 的版本與必要動作。 */
export function cmdKitOutdated(cwd = process.cwd()): number {
  const configPath = findConfigPath(cwd);
  const configDir = path.dirname(configPath);

  let config: unknown;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err: unknown) {
    fail(`無法解析設定檔 ${configPath}：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(config)) {
    fail(`設定檔格式錯誤：${path.basename(configPath)} 必須是 JSON 物件`);
  }

  if (typeof config.kitUpstream !== 'string' || !REPO_SLUG_RE.test(config.kitUpstream.trim())) {
    usageError('用法錯誤：設定檔缺少或格式錯誤的 kitUpstream（應為 owner/name）');
  }
  const kitUpstream = config.kitUpstream.trim();

  const manifest = loadManifest(configDir);
  const localVersion = manifest.kitVersion.trim();
  const localParts = parseVersionParts(localVersion);
  if (!localParts) {
    fail(`.kit/manifest.json 的 kitVersion 格式錯誤：${localVersion}`);
  }

  const kitJsonRaw = fetchUpstreamRaw(kitUpstream, 'templates/kit.json');
  let upstreamKit: unknown;
  try {
    upstreamKit = JSON.parse(kitJsonRaw);
  } catch (err: unknown) {
    fail(`無法解析上游 templates/kit.json：${err instanceof Error ? err.message : String(err)}`);
  }
  const rawUpstreamVersion = isRecord(upstreamKit) ? upstreamKit.version : undefined;
  const latestVersion = typeof rawUpstreamVersion === 'string' ? rawUpstreamVersion.trim() : '';
  const latestParts = parseVersionParts(latestVersion);
  if (!latestParts) {
    fail(`無法解析上游 templates/kit.json 版本號：${String(rawUpstreamVersion ?? '')}`);
  }

  const changelogRaw = fetchUpstreamRaw(kitUpstream, 'templates/CHANGELOG.md');

  console.log(`KIT_VERSION=${localVersion}`);
  console.log(`KIT_LATEST=${latestVersion}`);

  if (compareVersionParts(latestParts, localParts) <= 0) {
    console.log('已是最新');
    return 0;
  }

  console.log(`KIT_UPDATE_AVAILABLE ${localVersion} → ${latestVersion}`);
  for (const actionLine of extractRequiredProjectActions(changelogRaw, localParts, latestParts)) {
    console.log(actionLine);
  }
  return 3;
}
