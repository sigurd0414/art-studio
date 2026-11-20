// @module templates/bin/task/cli/agents
// @role 通用 task 工具的 agent 規則檔上限檢查與環境偵測模組：實作 task agent-check、初始化環境偵測及 accept 規則檔檢查
// @why 將各 agent 工具的規則檔上限、一層 @ 引入展開、大小估計與版本偵測集中一處，供 init、kit-check 與 accept 共用
// @forbid 禁止執行環境偵測指令時不設逾時或針對特定專案與測試資料寫死特例

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countTextFileLines, segmentListsOverlap, singleSegmentOverlap } from '../lib.ts';
import type { RuleCheckOutcome } from '../types.ts';
import { findConfigPath } from './kitcheck.ts';
import { fail, usageError } from './runtime.ts';

export const WARN_THRESHOLD_PERCENT = 85;
export const STALE_CHECK_DAYS = 90;
export const DETECT_TIMEOUT_MS = 3000;
const BYTES_PER_ASCII_TOKEN = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PERCENT_BASE = 100;
const AGENT_TOOLS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'agent-tools.json');
const AGENT_ENV_REL_PATH = '.kit/agent-env.json';
const OVER_LIMIT_ADVICE = '提醒：把細節移到另一份文件並在規則檔留連結，不要刪規則';
const SKIP_GLOB_DIRS = new Set(['.git', 'node_modules', 'target']);

export type AgentLimitStatus = 'OK' | 'INFO' | 'WARN' | 'FAIL';

export interface AgentToolLimit {
  id: string;
  scope?: string;
  unit: string;
  max: number;
  effect: string;
  note?: string;
}

export interface AgentToolDetect {
  command?: string | null;
  versionArgs?: readonly string[];
  homePaths?: readonly string[];
}

export interface AgentToolDef {
  label?: string;
  rulesFiles?: readonly string[];
  followImports?: boolean;
  limits?: readonly AgentToolLimit[];
  source?: string;
  checkedAt?: string;
  detect?: AgentToolDetect | null;
}

export interface AgentToolsData {
  tools: Record<string, AgentToolDef>;
}

export interface DetectedToolStatus {
  detected: boolean;
  version: string | null;
}

export interface AgentEnvData {
  detectedAt: string;
  tools: Record<string, DetectedToolStatus>;
}

export interface AgentCheckResult {
  exitCode: number;
  hasFail: boolean;
  lines: string[];
  declaredTools: string[];
}

interface TextStats {
  bytes: number;
  chars: number;
  lines: number;
  ascii: number;
  nonAscii: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function formatLocalToday(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 驗證 YYYY-MM-DD 格式與真實曆法日期，避免無效日期（如 02-30）通過。 */
export function isValidIsoDate(str: unknown): str is string {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseIsoDateUtcMs(str: unknown): number | null {
  if (!isValidIsoDate(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function resolveToday(explicitToday?: string | null): string {
  const raw = explicitToday ?? process.env.TASK_TODAY;
  if (raw !== undefined && String(raw).trim() !== '') {
    const trimmed = String(raw).trim();
    if (!isValidIsoDate(trimmed)) {
      fail(`TASK_TODAY 日期格式錯誤（應為 YYYY-MM-DD）：${trimmed}`);
    }
    return trimmed;
  }
  return formatLocalToday();
}

function isRegularFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function isExecutableFile(filePath: string): boolean {
  if (!isRegularFile(filePath)) return false;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizePatternSegments(rawPattern: string): string[] {
  return String(rawPattern || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
}

function matchRuleFilePatterns(relPath: string, patterns?: readonly string[]): boolean {
  const fileSegs = normalizePatternSegments(relPath);
  if (fileSegs.length === 0) return false;
  return (Array.isArray(patterns) ? patterns : []).some((pat) => {
    const patSegs = normalizePatternSegments(pat);
    return patSegs.length > 0 && segmentListsOverlap(fileSegs, patSegs);
  });
}

function walkFixedDepthGlob(
  dir: string,
  patSegs: readonly string[],
  idx: number,
  prefixSegs: readonly string[],
  out: string[],
): void {
  let names: string[];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return;
  }
  const pat = patSegs[idx];
  const isLeaf = idx === patSegs.length - 1;
  for (const name of names) {
    if (!singleSegmentOverlap(name, pat)) continue;
    const full = path.join(dir, name);
    const nextSegs = [...prefixSegs, name];
    if (isLeaf) {
      if (isRegularFile(full)) out.push(nextSegs.join('/'));
    } else if (isDirectory(full)) {
      walkFixedDepthGlob(full, patSegs, idx + 1, nextSegs, out);
    }
  }
}

function walkRecursiveGlob(
  dir: string,
  fullPatSegs: readonly string[],
  currentSegs: readonly string[],
  out: string[],
): void {
  let names: string[];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    const nextSegs = [...currentSegs, name];
    if (isDirectory(full)) {
      if (SKIP_GLOB_DIRS.has(name) && !fullPatSegs.includes(name)) continue;
      walkRecursiveGlob(full, fullPatSegs, nextSegs, out);
    } else if (isRegularFile(full) && segmentListsOverlap(nextSegs, fullPatSegs)) {
      out.push(nextSegs.join('/'));
    }
  }
}

function findRulePatternFiles(configDir: string, rawPattern: string): string[] {
  const segs = normalizePatternSegments(rawPattern);
  if (segs.length === 0 || segs.includes('..')) return [];

  if (!segs.some((s) => s.includes('*'))) {
    const full = path.join(configDir, ...segs);
    return isRegularFile(full) ? [segs.join('/')] : [];
  }

  const firstWildcard = segs.findIndex((s) => s.includes('*'));
  const fixedPrefix = segs.slice(0, firstWildcard);
  const startDir = fixedPrefix.length > 0 ? path.join(configDir, ...fixedPrefix) : configDir;
  if (!isDirectory(startDir)) return [];

  const matches: string[] = [];
  if (segs.includes('**')) {
    walkRecursiveGlob(startDir, segs, fixedPrefix, matches);
  } else {
    // @why 固定深度萬用字元只走訪符合的目錄層，避免掃描專案內的大型建置或相依目錄
    walkFixedDepthGlob(startDir, segs, firstWildcard, fixedPrefix, matches);
  }
  return matches.sort();
}

function extractOneLevelImports(configDir: string, sourceRelPath: string): string[] {
  const sourceFullPath = path.join(configDir, ...sourceRelPath.split('/'));
  let raw: string;
  try {
    raw = fs.readFileSync(sourceFullPath, 'utf8');
  } catch {
    return [];
  }
  const sourceDir = path.dirname(sourceFullPath);
  const imports: string[] = [];
  let inFence = false;

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (/^(?:```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!trimmed.startsWith('@') || trimmed.length < 2 || /\s/.test(trimmed[1])) continue;
    const target = trimmed.slice(1).trim();
    const resolved = path.resolve(sourceDir, target);
    const rel = path.relative(configDir, resolved);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    imports.push(rel.split(path.sep).join('/'));
  }
  return imports;
}

function collectToolRuleFiles(
  configDir: string,
  toolDef: AgentToolDef,
): { existingFiles: string[]; referencedPaths: Set<string> } {
  const existingSet = new Set<string>();
  const referencedSet = new Set<string>();
  const directFiles: string[] = [];

  for (const pattern of Array.isArray(toolDef.rulesFiles) ? toolDef.rulesFiles : []) {
    for (const rel of findRulePatternFiles(configDir, pattern)) {
      if (!existingSet.has(rel)) {
        existingSet.add(rel);
        referencedSet.add(rel);
        directFiles.push(rel);
      }
    }
  }

  if (toolDef.followImports) {
    for (const directRel of directFiles) {
      for (const impRel of extractOneLevelImports(configDir, directRel)) {
        referencedSet.add(impRel);
        const full = path.join(configDir, ...impRel.split('/'));
        if (!existingSet.has(impRel) && isRegularFile(full)) {
          existingSet.add(impRel);
        }
      }
    }
  }

  return {
    existingFiles: [...existingSet],
    referencedPaths: referencedSet,
  };
}

function parseAgentToolLimit(raw: unknown): AgentToolLimit {
  if (!isRecord(raw)) {
    return { id: '', unit: '', max: 0, effect: '' };
  }
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    scope: typeof raw.scope === 'string' ? raw.scope : undefined,
    unit: typeof raw.unit === 'string' ? raw.unit : '',
    max: typeof raw.max === 'number' ? raw.max : Number(raw.max),
    effect: typeof raw.effect === 'string' ? raw.effect : '',
    note: typeof raw.note === 'string' ? raw.note : undefined,
  };
}

function parseAgentToolDef(raw: unknown): AgentToolDef {
  if (!isRecord(raw)) return {};
  const detectRaw = isRecord(raw.detect) ? raw.detect : null;
  const detect: AgentToolDetect | undefined = detectRaw
    ? {
        command: typeof detectRaw.command === 'string' ? detectRaw.command : null,
        versionArgs: Array.isArray(detectRaw.versionArgs) ? detectRaw.versionArgs.map(String) : undefined,
        homePaths: Array.isArray(detectRaw.homePaths)
          ? detectRaw.homePaths.filter((p): p is string => typeof p === 'string')
          : undefined,
      }
    : undefined;
  return {
    label: typeof raw.label === 'string' ? raw.label : undefined,
    rulesFiles: Array.isArray(raw.rulesFiles)
      ? raw.rulesFiles.filter((p): p is string => typeof p === 'string')
      : undefined,
    followImports: Boolean(raw.followImports),
    limits: Array.isArray(raw.limits) ? raw.limits.map(parseAgentToolLimit) : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : undefined,
    detect,
  };
}

export function loadAgentTools(): AgentToolsData {
  if (!isRegularFile(AGENT_TOOLS_PATH)) {
    fail(`找不到 agent 工具上限資料：${AGENT_TOOLS_PATH}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(AGENT_TOOLS_PATH, 'utf8'));
  } catch (err: unknown) {
    fail(`無法解析 ${AGENT_TOOLS_PATH}：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(data) || !isRecord(data.tools)) {
    fail('agent-tools.json 格式錯誤：缺少 tools 物件');
  }
  const tools: Record<string, AgentToolDef> = {};
  for (const [toolId, rawDef] of Object.entries(data.tools)) {
    tools[toolId] = parseAgentToolDef(rawDef);
  }
  return { tools };
}

export function resolveDeclaredAgentTools(
  config: unknown,
  toolsMap: Readonly<Record<string, AgentToolDef>>,
): string[] {
  if (!isRecord(config)) {
    fail('project.config.json 格式錯誤');
  }
  if (config.agentTools === undefined) {
    return Object.keys(toolsMap);
  }
  if (!Array.isArray(config.agentTools)) {
    usageError('設定檔錯誤：agentTools 必須是字串陣列');
  }
  const declared: string[] = [];
  const seen = new Set<string>();
  for (const rawId of config.agentTools) {
    if (typeof rawId !== 'string' || !Object.hasOwn(toolsMap, rawId)) {
      usageError(`設定檔錯誤：agentTools 包含不認得的工具代碼「${String(rawId)}」`);
    }
    if (!seen.has(rawId)) {
      seen.add(rawId);
      declared.push(rawId);
    }
  }
  return declared;
}

function findCommandOnPath(command: string | null | undefined): string | null {
  if (typeof command !== 'string' || !command.trim()) return null;
  if (command.includes('/') || command.includes('\\')) {
    return isExecutableFile(command) ? command : null;
  }
  const pathEnv = process.env.PATH || '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

function detectCommandVersion(commandPath: string, versionArgs?: readonly string[]): string | null {
  const args = Array.isArray(versionArgs) ? versionArgs.map(String) : [];
  const res = spawnSync(commandPath, args, {
    encoding: 'utf8',
    timeout: DETECT_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.error || res.status !== 0) return null;
  const firstLine = String(res.stdout || '').split(/\r?\n/)[0].trim();
  return firstLine || null;
}

function detectSingleTool(toolDef: AgentToolDef | null | undefined): DetectedToolStatus {
  const detect = toolDef?.detect || {};
  const commandPath = findCommandOnPath(detect.command);
  const homeDir = process.env.HOME !== undefined ? process.env.HOME : os.homedir();
  const homeFound =
    Boolean(homeDir) &&
    Array.isArray(detect.homePaths) &&
    detect.homePaths.some((rel) => typeof rel === 'string' && rel.trim() && fs.existsSync(path.resolve(homeDir, rel)));
  const detected = Boolean(commandPath) || homeFound;
  const version = commandPath ? detectCommandVersion(commandPath, detect.versionArgs) : null;
  return { detected, version };
}

/** 依 agent-tools.json 的工具順序偵測目前環境，並產生可寫入 .kit/agent-env.json 的資料。 */
export function detectAgentEnv({
  toolsMap,
  today,
}: {
  toolsMap?: Readonly<Record<string, AgentToolDef>>;
  today?: string | null;
} = {}): AgentEnvData {
  const resolvedTools = toolsMap || loadAgentTools().tools;
  const detectedAt = resolveToday(today);
  const tools: Record<string, DetectedToolStatus> = {};
  for (const [toolId, toolDef] of Object.entries(resolvedTools)) {
    tools[toolId] = detectSingleTool(toolDef);
  }
  return { detectedAt, tools };
}

/** 將環境偵測結果寫入指定專案根目錄的 .kit/agent-env.json。 */
export function writeAgentEnv(rootDir: string, { today }: { today?: string | null } = {}): AgentEnvData {
  const envData = detectAgentEnv({ today });
  const envPath = path.join(rootDir, ...AGENT_ENV_REL_PATH.split('/'));
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, `${JSON.stringify(envData, null, 2)}\n`, 'utf8');
  return envData;
}

function measureTextStats(text: string): TextStats {
  const bytes = Buffer.byteLength(text, 'utf8');
  const lines = countTextFileLines(text);
  let chars = 0;
  let ascii = 0;
  for (const ch of text) {
    chars += 1;
    const cp = ch.codePointAt(0);
    if (cp !== undefined && cp <= 0x7f) ascii += 1;
  }
  return { bytes, chars, lines, ascii, nonAscii: chars - ascii };
}

function sumStats(statsList: readonly TextStats[]): TextStats {
  const total: TextStats = { bytes: 0, chars: 0, lines: 0, ascii: 0, nonAscii: 0 };
  for (const s of statsList) {
    total.bytes += s.bytes;
    total.chars += s.chars;
    total.lines += s.lines;
    total.ascii += s.ascii;
    total.nonAscii += s.nonAscii;
  }
  return total;
}

function getMetricValue(stats: TextStats, unit: string): number {
  switch (unit) {
    case 'bytes':
      return stats.bytes;
    case 'chars':
      return stats.chars;
    case 'lines':
      return stats.lines;
    case 'tokens':
      return Math.ceil(stats.ascii / BYTES_PER_ASCII_TOKEN) + stats.nonAscii;
    default:
      fail(`agent-tools.json 含未知的度量單位「${unit}」`);
  }
}

function evaluateLimitStatus(value: number, limit: AgentToolLimit): AgentLimitStatus {
  switch (limit.effect) {
    case 'skip':
    case 'truncate':
    case 'budget':
      if (value > limit.max) return 'FAIL';
      if (value * PERCENT_BASE >= limit.max * WARN_THRESHOLD_PERCENT) return 'WARN';
      return 'OK';
    case 'warn':
      return value > limit.max ? 'WARN' : 'OK';
    case 'advice':
      return value > limit.max ? 'INFO' : 'OK';
    default:
      fail(`agent-tools.json 含未知的上限效果「${limit.effect}」`);
  }
}

function formatLimitLine(
  status: AgentLimitStatus,
  toolId: string,
  limit: AgentToolLimit,
  fileLabel: string,
  value: number,
): string {
  const suffix = limit.unit === 'tokens' ? ' 估計' : '';
  return `${status} ${toolId} ${limit.id} ${fileLabel} ${value}/${limit.max} ${limit.unit}${suffix}`;
}

function readJsonObject(filePath: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err: unknown) {
    fail(`無法解析 ${label}：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(parsed)) {
    fail(`${label} 格式錯誤`);
  }
  return parsed;
}

function appendEnvDriftLines(
  lines: string[],
  configDir: string,
  toolsMap: Readonly<Record<string, AgentToolDef>>,
  declaredSet: ReadonlySet<string>,
): void {
  const envPath = path.join(configDir, ...AGENT_ENV_REL_PATH.split('/'));
  if (!isRegularFile(envPath)) return;

  const envData = readJsonObject(envPath, AGENT_ENV_REL_PATH);
  const recordedTools = isRecord(envData.tools) ? envData.tools : {};

  for (const [toolId, toolDef] of Object.entries(toolsMap)) {
    const recorded = recordedTools[toolId];
    if (!isRecord(recorded)) continue;
    if (recorded.detected === true && !declaredSet.has(toolId)) {
      lines.push(`UNDECLARED ${toolId}`);
    }
    if (toolDef?.detect?.command && (declaredSet.has(toolId) || recorded.detected === true)) {
      const live = detectSingleTool(toolDef);
      const oldVer = typeof recorded.version === 'string' ? recorded.version : null;
      const newVer = live.version ?? null;
      if (oldVer !== newVer) {
        lines.push(`VERSION-CHANGED ${toolId} ${oldVer ?? '無'}→${newVer ?? '無'}`);
      }
    }
  }
}

/** 執行規則檔大小與環境漂移檢查（不寫檔、不呼叫 gh），回傳輸出列與結束代碼。 */
export function runAgentCheck({
  configPath,
  today,
}: {
  configPath: string;
  today?: string | null;
}): AgentCheckResult {
  const config = readJsonObject(configPath, path.basename(configPath));
  const configDir = path.dirname(configPath);
  const { tools: toolsMap } = loadAgentTools();
  const declaredTools = resolveDeclaredAgentTools(config, toolsMap);
  const declaredSet = new Set(declaredTools);
  const todayStr = resolveToday(today);
  const todayMs = parseIsoDateUtcMs(todayStr);

  const lines = [`AGENT_TOOLS=${declaredTools.join(',')}`];
  const statsCache = new Map<string, TextStats>();
  const getFileStats = (relPath: string): TextStats => {
    const cached = statsCache.get(relPath);
    if (cached !== undefined) return cached;
    const content = fs.readFileSync(path.join(configDir, ...relPath.split('/')), 'utf8');
    const stats = measureTextStats(content);
    statsCache.set(relPath, stats);
    return stats;
  };

  let hasFail = false;
  for (const toolId of declaredTools) {
    const toolDef = toolsMap[toolId];
    const { existingFiles } = collectToolRuleFiles(configDir, toolDef);
    const fileStats = existingFiles.map((rel) => ({ rel, stats: getFileStats(rel) }));
    const totalStats = sumStats(fileStats.map((x) => x.stats));

    for (const limit of Array.isArray(toolDef.limits) ? toolDef.limits : []) {
      if (limit.scope === 'total') {
        const value = getMetricValue(totalStats, limit.unit);
        const status = evaluateLimitStatus(value, limit);
        if (status === 'FAIL') hasFail = true;
        lines.push(formatLimitLine(status, toolId, limit, '(total)', value));
      } else {
        for (const item of fileStats) {
          const value = getMetricValue(item.stats, limit.unit);
          const status = evaluateLimitStatus(value, limit);
          if (status === 'FAIL') hasFail = true;
          lines.push(formatLimitLine(status, toolId, limit, item.rel, value));
        }
      }
    }
  }

  for (const toolId of declaredTools) {
    const toolDef = toolsMap[toolId];
    const checkedMs = parseIsoDateUtcMs(toolDef.checkedAt);
    if (todayMs !== null && checkedMs !== null && todayMs - checkedMs > STALE_CHECK_DAYS * MS_PER_DAY) {
      lines.push(`STALE ${toolId} checkedAt=${toolDef.checkedAt} source=${toolDef.source}`);
    }
  }

  appendEnvDriftLines(lines, configDir, toolsMap, declaredSet);

  if (hasFail) {
    lines.push(OVER_LIMIT_ADVICE);
  }
  return { exitCode: hasFail ? 3 : 0, hasFail, lines, declaredTools };
}

/** 執行 `task agent-check` 命令。 */
export function cmdAgentCheck(cwd = process.cwd()): number {
  const configPath = findConfigPath(cwd);
  const res = runAgentCheck({ configPath });
  console.log(res.lines.join('\n'));
  return res.exitCode;
}

/**
 * 供 `task accept` 在暫存工作資料夾檢查規則檔大小：
 * 只有分支實際改到已宣告工具的規則檔（含一層引入或刪除）時才執行 `agent-check`，否則回傳「不適用」。
 */
export function checkAcceptRuleSizes({
  configPath,
  changedRelPaths,
}: {
  configPath?: string | null;
  changedRelPaths?: readonly string[];
}): RuleCheckOutcome {
  if (!configPath || !isRegularFile(configPath)) {
    return { status: '不適用', passed: true, outputLines: [] };
  }
  const config = readJsonObject(configPath, path.basename(configPath));
  const configDir = path.dirname(configPath);
  const { tools: toolsMap } = loadAgentTools();
  const declaredTools = resolveDeclaredAgentTools(config, toolsMap);

  const normalizedChanged = (Array.isArray(changedRelPaths) ? changedRelPaths : [])
    .map((p) => normalizePatternSegments(p).join('/'))
    .filter(Boolean);

  let touchedRuleFiles = false;
  for (const toolId of declaredTools) {
    const toolDef = toolsMap[toolId];
    const { referencedPaths } = collectToolRuleFiles(configDir, toolDef);
    if (
      normalizedChanged.some(
        (rel) => referencedPaths.has(rel) || matchRuleFilePatterns(rel, toolDef.rulesFiles),
      )
    ) {
      touchedRuleFiles = true;
      break;
    }
  }

  if (!touchedRuleFiles) {
    return { status: '不適用', passed: true, outputLines: [] };
  }

  const res = runAgentCheck({ configPath });
  if (res.hasFail) {
    return { status: 'FAIL', passed: false, outputLines: res.lines };
  }
  return { status: 'PASS', passed: true, outputLines: [] };
}
