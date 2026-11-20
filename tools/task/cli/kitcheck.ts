// @module templates/bin/task/cli/kitcheck
// @role 通用 task 工具的套件異動檢查指令：實作 task kit-check（比對 .kit/manifest.json 找出專案改過、遺失、過時設定鍵或版本不一致的套件檔案）
// @why 在不依賴 GitHub（issueRepo／gh）且不寫檔的前提下，偵測專案是否私自修改規則或工具、殘留過時設定鍵、版本號分岔並提醒回報或升級
// @forbid 禁止在此指令寫入檔案、呼叫 gh、連網或將 KEPT 檔案判定為需要失敗的改動

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { KitManifest } from '../types.ts';
import { runAgentCheck } from './agents.ts';
import { computeMarkdownFencedLines } from './docs.ts';
import { fail } from './runtime.ts';

const AGENTS_KIT_VERSION_RE = /(由初始化套件 v)(\d+(?:\.\d+)*(?:[-+][0-9A-Za-z.+-]+)?)( 產生)/;

interface KitCheckItem {
  relPath: string;
  line: string;
  isDiff: boolean;
}

interface AgentsVersionMatch {
  lineIndex: number;
  version: string;
}

interface ProjectRulesParts {
  before: string[];
  section: string[] | null;
  after: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isKitManifest(value: unknown): value is KitManifest {
  return (
    isRecord(value) &&
    typeof value.kitVersion === 'string' &&
    value.kitVersion.trim().length > 0 &&
    isRecord(value.files) &&
    (value.kept === undefined ||
      (Array.isArray(value.kept) && value.kept.every((item) => typeof item === 'string' && item.trim().length > 0)))
  );
}

export function findConfigPath(startDir: string): string {
  const envPath = process.env.TASK_CONFIG;
  if (envPath && envPath.trim()) {
    const resolved = path.resolve(startDir, envPath.trim());
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      fail(`找不到指定的設定檔 TASK_CONFIG：${resolved}`);
    }
    return resolved;
  }

  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, 'project.config.json');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  fail('找不到 project.config.json（請在專案資料夾內執行或設定 TASK_CONFIG）');
}

export function findConfigDir(startDir: string): string {
  return path.dirname(findConfigPath(startDir));
}

function compareCodeUnit(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function loadManifest(configDir: string): KitManifest {
  const manifestPath = path.join(configDir, '.kit', 'manifest.json');
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
    fail('找不到 .kit/manifest.json（這個專案不是用套件初始化的）');
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err: unknown) {
    fail(`無法解析 .kit/manifest.json：${err instanceof Error ? err.message : String(err)}`);
  }

  if (!isKitManifest(manifest)) {
    fail('.kit/manifest.json 格式錯誤');
  }

  return manifest;
}

function resolveProjectFile(configDir: string, relPath: string): string {
  if (typeof relPath !== 'string' || !relPath || path.isAbsolute(relPath)) {
    fail(`.kit/manifest.json 含無效檔案路徑：${String(relPath)}`);
  }
  const resolved = path.resolve(configDir, ...relPath.split('/'));
  const relBack = path.relative(configDir, resolved);
  if (!relBack || relBack.startsWith('..') || path.isAbsolute(relBack)) {
    fail(`.kit/manifest.json 含超出專案目錄的路徑：${relPath}`);
  }
  return resolved;
}

/**
 * 將 AGENTS.md 依非圍欄內的「## 10. 本專案專屬規則」到下一個非圍欄內的 `## ` 切分為 { before, section, after }。
 * @why 追蹤圍欄程式碼區塊（```）避免規則範例內的 `## ` 被誤認為下一個二級標題，供移除與替換第 10 節共用。
 */
function splitProjectRulesSection(markdownText: string | null | undefined): ProjectRulesParts {
  const lines = String(markdownText || '').split('\n');
  const before: string[] = [];
  const section: string[] = [];
  const after: string[] = [];
  let inFence = false;
  let state: 'before' | 'section' | 'after' = 'before';

  for (const line of lines) {
    const trimmed = line.replace(/\r$/, '');
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
    }

    if (!inFence) {
      if (state === 'before' && /^## 10\. 本專案專屬規則\s*$/.test(trimmed)) {
        state = 'section';
        section.push(line);
        continue;
      }
      if (state === 'section' && /^## /.test(trimmed)) {
        state = 'after';
      }
    }

    if (state === 'before') {
      before.push(line);
    } else if (state === 'section') {
      section.push(line);
    } else {
      after.push(line);
    }
  }

  return {
    before,
    section: section.length > 0 ? section : null,
    after,
  };
}

/**
 * 移除 AGENTS.md 的「## 10. 本專案專屬規則」段落（從該標題到下一個 `## ` 標題之前）。
 */
export function stripProjectRulesSection(markdownText: string | null | undefined): string {
  const { before, after } = splitProjectRulesSection(markdownText);
  return [...before, ...after].join('\n');
}

/**
 * 若新舊 AGENTS.md 皆有「## 10. 本專案專屬規則」段落，將舊檔第 10 節原樣替換進新版第 10 節位置。
 */
export function replaceProjectRulesSection(
  newMarkdownText: string | null | undefined,
  currentMarkdownText: string | null | undefined,
): string {
  const nextParts = splitProjectRulesSection(newMarkdownText);
  const currentParts = splitProjectRulesSection(currentMarkdownText);
  if (!nextParts.section || !currentParts.section) {
    return String(newMarkdownText || '');
  }
  return [...nextParts.before, ...currentParts.section, ...nextParts.after].join('\n');
}

export function isAgentsMdUnchanged(
  configDir: string,
  currentBuf: Buffer,
  expectedHash: string,
): boolean {
  if (!Buffer.isBuffer(currentBuf)) {
    return false;
  }
  const genAgentsPath = path.join(configDir, '.kit', 'generated', 'AGENTS.md');
  if (!fs.existsSync(genAgentsPath) || !fs.statSync(genAgentsPath).isFile()) {
    return false;
  }
  const genBuf = fs.readFileSync(genAgentsPath);
  if (sha256Hex(genBuf) !== expectedHash) {
    return false;
  }
  const strippedCurrent = stripProjectRulesSection(currentBuf.toString('utf8'));
  const strippedGenerated = stripProjectRulesSection(genBuf.toString('utf8'));
  return (
    sha256Hex(Buffer.from(strippedCurrent, 'utf8')) ===
    sha256Hex(Buffer.from(strippedGenerated, 'utf8'))
  );
}

function findAgentsKitVersion(markdownText: string | null | undefined): AgentsVersionMatch | null {
  const lines = String(markdownText || '').split('\n');
  // @why 忽略圍欄程式碼區塊內的規則範例，避免誤判或誤改範例文字
  const fenced = computeMarkdownFencedLines(lines.map((line) => line.replace(/\r$/, '')));
  for (let i = 0; i < lines.length; i += 1) {
    if (fenced[i]) continue;
    const match = AGENTS_KIT_VERSION_RE.exec(lines[i]);
    if (match) {
      return { lineIndex: i, version: match[2] };
    }
  }
  return null;
}

/** 從 AGENTS.md 讀取「由初始化套件 v<版本> 產生」的版本號。 */
export function extractAgentsKitVersion(markdownText: string | null | undefined): string | null {
  return findAgentsKitVersion(markdownText)?.version ?? null;
}

/** 只把 AGENTS.md 裡「由初始化套件 v<版本> 產生」的版本號換成新版，其餘字元原樣保留。 */
export function replaceAgentsKitVersion(markdownText: string, nextVersion: string): string {
  const found = findAgentsKitVersion(markdownText);
  if (!found || found.version === nextVersion) {
    return markdownText;
  }
  const lines = markdownText.split('\n');
  lines[found.lineIndex] = lines[found.lineIndex].replace(
    AGENTS_KIT_VERSION_RE,
    (_full, prefix: string, _oldVer: string, suffix: string) => `${prefix}${nextVersion}${suffix}`,
  );
  return lines.join('\n');
}

function readConfigObject(configPath: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err: unknown) {
    fail(`無法解析設定檔 ${configPath}：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(parsed)) {
    fail(`設定檔格式錯誤：${path.basename(configPath)} 必須是 JSON 物件`);
  }
  return parsed;
}

function collectObsoleteConfigItems(configPath: string): KitCheckItem[] {
  const config = readConfigObject(configPath);
  if (!Object.hasOwn(config, 'kitVersion')) {
    return [];
  }
  const configName = path.basename(configPath);
  return [
    {
      relPath: configName,
      line: `CONFIG-OBSOLETE ${configName} kitVersion（套件版本以 .kit/manifest.json 為準，跑 init --upgrade 移除）`,
      isDiff: true,
    },
  ];
}

function collectVersionMismatches(configDir: string, manifestVersion: string): KitCheckItem[] {
  const mismatches: KitCheckItem[] = [];
  const agentsPath = path.join(configDir, 'AGENTS.md');
  if (fs.existsSync(agentsPath) && fs.statSync(agentsPath).isFile()) {
    const agentsVersion = extractAgentsKitVersion(fs.readFileSync(agentsPath, 'utf8'));
    if (agentsVersion !== null && agentsVersion !== manifestVersion) {
      mismatches.push({
        relPath: 'AGENTS.md',
        line: `VERSION-MISMATCH AGENTS.md ${agentsVersion}（manifest ${manifestVersion}）`,
        isDiff: true,
      });
    }
  }

  mismatches.sort((a, b) => compareCodeUnit(a.relPath, b.relPath));
  return mismatches;
}

/** 執行 `task kit-check`：依 `.kit/manifest.json` 檢查套件產生檔案的遺失、修改、過時設定鍵與 AGENTS.md 版本一致，並接著執行 `agent-check`。 */
export function cmdKitCheck(cwd = process.cwd()): number {
  const configPath = findConfigPath(cwd);
  const configDir = path.dirname(configPath);
  const manifest = loadManifest(configDir);
  const manifestVersion = manifest.kitVersion.trim();
  const filePaths = Object.keys(manifest.files).sort(compareCodeUnit);
  const items: KitCheckItem[] = [];

  for (const relPath of filePaths) {
    const expectedHash = manifest.files[relPath];
    if (typeof expectedHash !== 'string' || !expectedHash) {
      fail(`.kit/manifest.json 檔案雜湊格式錯誤：${relPath}`);
    }
    const fullPath = resolveProjectFile(configDir, relPath);
    if (!fs.existsSync(fullPath)) {
      items.push({ relPath, line: `MISSING ${relPath}`, isDiff: true });
      continue;
    }
    if (!fs.statSync(fullPath).isFile()) {
      items.push({ relPath, line: `MODIFIED ${relPath}`, isDiff: true });
      continue;
    }
    const currentBuf = fs.readFileSync(fullPath);
    if (sha256Hex(currentBuf) === expectedHash) {
      continue;
    }
    if (relPath === 'AGENTS.md' && isAgentsMdUnchanged(configDir, currentBuf, expectedHash)) {
      continue;
    }
    items.push({ relPath, line: `MODIFIED ${relPath}`, isDiff: true });
  }

  for (const relPath of manifest.kept ?? []) {
    items.push({ relPath, line: `KEPT ${relPath}`, isDiff: false });
  }
  // @why 規格要求依字元碼字典序排序所有輸出項目，避免受語系影響
  items.sort((a, b) => compareCodeUnit(a.relPath, b.relPath));
  const obsoleteConfigItems = collectObsoleteConfigItems(configPath);
  const versionMismatches = collectVersionMismatches(configDir, manifestVersion);

  console.log(`KIT_VERSION=${manifestVersion}`);
  let kitExit = 0;
  if (items.length === 0 && obsoleteConfigItems.length === 0 && versionMismatches.length === 0) {
    console.log(`所有套件產生的檔案皆與基準一致（共 ${filePaths.length} 個檔案）。`);
  } else {
    for (const item of items) {
      console.log(item.line);
    }
    if (items.some((item) => item.isDiff)) {
      console.log(
        '提醒：偵測到套件檔案與初始化基準不一致，請用 task propose --area template 說明為什麼要改，避免各專案默默分岔。',
      );
      kitExit = 3;
    }
    if (items.some((item) => !item.isDiff)) {
      console.log('提醒：這些檔案保留專案原本的版本，套件版本在 .kit/proposed/，要對齊時手動合併。');
    }
    for (const item of obsoleteConfigItems) {
      console.log(item.line);
      kitExit = 3;
    }
    for (const mismatch of versionMismatches) {
      console.log(mismatch.line);
    }
    if (versionMismatches.length > 0) {
      console.log('提醒：偵測到套件版本不一致，請跑 `init --upgrade` 或手動改成一致。');
      kitExit = 3;
    }
  }

  const agentRes = runAgentCheck({ configPath });
  console.log(agentRes.lines.join('\n'));
  return kitExit === 3 || agentRes.exitCode === 3 ? 3 : 0;
}
