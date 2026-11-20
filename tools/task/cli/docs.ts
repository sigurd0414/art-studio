// @module templates/bin/task/cli/docs
// @role 通用 task 工具的文件相依檢查模組：實作 task docs-check 與 task accept 的「文件相依」檢查，並提供共用的文字、路徑樣式與連結解析工具
// @why 將文件相依檢查集中於單一模組並與程式規則模組共用底層純函式，避免重複造輪子，同時支援不含 repos 欄位的設定檔執行 docs-check
// @forbid 禁止在此模組寫入檔案、呼叫 gh 或連網，或針對特定專案與測試資料寫死特例

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandPathPattern, segmentListsOverlap } from '../lib.ts';
import type { AcceptRepoResult, DocRegistryConfig, RuleCheckOutcome, TaskContext } from '../types.ts';
import { formatLocalToday, isValidIsoDate } from './agents.ts';
import { findConfigPath } from './kitcheck.ts';
import { fail, runGit, splitNullSeparated, usageError } from './runtime.ts';

export const DEFAULT_DOC_SCAN = Object.freeze(['**/*.md']);
export const DEFAULT_DOC_IGNORE = Object.freeze([
  '**/node_modules/**',
  '**/target/**',
  '.kit/**',
  '**/archive/**',
]);
export const DEFAULT_WHEN_LINES = 20;
export const DEFAULT_KEY_PATTERN = '^([A-Za-z]+-\\d+[A-Za-z]?)';
export const DEFAULT_PENDING_MAX_DAYS = 14;
const EMPTY_DOC_REGISTRIES: readonly DocRegistryConfig[] = Object.freeze([]);
export const DEFAULT_DOC_RULES = Object.freeze({ registries: EMPTY_DOC_REGISTRIES });
export const EXTERNAL_OR_ANCHOR_RE = /^(?:https?:\/\/|mailto:|#)/i;
export const FILE_URL_RE = /^file:/i;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MARKDOWN_LINK_RE = /(?<!\\)\[(?:[^\]\\]|\\.)*\]\(([^)\n]+)\)/g;

export interface NameStatusEntry {
  status: string;
  filePath: string;
}

export interface RuleFinding {
  repoIndex: number;
  filePath: string;
  lineNo: number | null;
  code: string;
  text: string;
}

export interface ParsedDocPending {
  when: RegExp;
  maxDays: number;
}

export interface ParsedDocRegistry {
  id: string;
  files: string[];
  whenLines: number;
  when: RegExp | null;
  key: RegExp;
  mustAppearIn: string[];
  pending: ParsedDocPending | null;
}

export interface ParsedDocRulesConfig {
  scan: string[];
  ignore: string[];
  registries: ParsedDocRegistry[];
}

export interface DocRepoRootInput {
  key?: string | number | null;
  dir: string;
}

export interface ComparableOtherRepo {
  key: string;
  dirComparable: string;
  exists: boolean;
}

export interface CrossRepoLinkResolution {
  matched: boolean;
  exists: boolean;
  missingRepoKey: string | null;
}

export interface EvaluateDocRulesOptions {
  rootDir: string;
  configBaseDir?: string;
  repoRoots?: readonly DocRepoRootInput[];
  rawDocRules: unknown;
  deletedPaths?: readonly string[];
  repoIndex?: number;
  displayPrefix?: string;
  includeStale?: boolean;
  today?: string | null;
}

export interface EvaluateDocRulesResult {
  rules: ParsedDocRulesConfig;
  findings: RuleFinding[];
  staleLines: string[];
}

interface DeletedPathMatcher {
  delPath: string;
  re: RegExp;
}

interface StaleDocItem {
  filePath: string;
  regId: string;
  text: string;
}

export function escapeRegExp(text: string): string {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

export function normalizePattern(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/|\/)+/, '')
    .replace(/\/+$/, '');
}

/** 比對正規化後的相對路徑是否符合單一路徑樣式（不依賴 createTaskLib）。 */
export function matchPathPattern(filePath: string, pattern: string): boolean {
  const cleanFile = normalizePattern(filePath);
  const cleanPattern = normalizePattern(pattern);
  if (!cleanFile || !cleanPattern) return false;
  const fileSegs = cleanFile.split('/').filter(Boolean);
  if (fileSegs.length === 0) return false;
  return expandPathPattern(cleanPattern).some((patSegs) => segmentListsOverlap(fileSegs, patSegs));
}

export function matchesAnyPathPattern(filePath: string, patterns: readonly string[] | null | undefined): boolean {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  return patterns.some((pattern) => matchPathPattern(filePath, pattern));
}

export function parseNameStatusZ(raw: string | null | undefined): NameStatusEntry[] {
  const parts = splitNullSeparated(raw);
  const entries: NameStatusEntry[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const status = parts[i];
    if (!status) continue;
    if (status.startsWith('R') || status.startsWith('C')) {
      const oldPath = normalizePattern(parts[i + 1] || '');
      const newPath = normalizePattern(parts[i + 2] || '');
      i += 2;
      if (oldPath) entries.push({ status: 'D', filePath: oldPath });
      if (newPath) entries.push({ status: 'A', filePath: newPath });
      continue;
    }
    const filePath = normalizePattern(parts[i + 1] || '');
    i += 1;
    if (filePath) entries.push({ status: status[0], filePath });
  }
  return entries;
}

export function splitTextLines(text: string | null | undefined): string[] {
  return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

export function readWorktreeTextFile(wtReal: string, filePath: string): string | null {
  const fullPath = path.resolve(wtReal, ...filePath.split('/'));
  const relBack = path.relative(wtReal, fullPath);
  if (!relBack || relBack.startsWith('..') || path.isAbsolute(relBack)) return null;

  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(fullPath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const buf = fs.readFileSync(fullPath);
  if (buf.includes(0)) return null;
  return buf.toString('utf8');
}

/**
 * 計算 Markdown 檔案每一行是否位於圍欄程式碼區塊內。
 * @why 僅讀取單 Diff 區塊時無法得知上方是否已開啟圍欄，從頭掃描可避免範例程式碼中的假連結誤報。
 */
export function computeMarkdownFencedLines(lines: readonly string[]): boolean[] {
  const fenced: boolean[] = new Array<boolean>(lines.length).fill(false);
  let fence: { ch: string; len: number } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trimStart();
    if (!fence) {
      const openMatch = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
      if (openMatch && !(openMatch[1][0] === '`' && openMatch[2].includes('`'))) {
        fence = { ch: openMatch[1][0], len: openMatch[1].length };
        fenced[i] = true;
      }
      continue;
    }

    fenced[i] = true;
    if (new RegExp(`^${fence.ch}{${fence.len},}\\s*$`).test(trimmed)) {
      fence = null;
    }
  }
  return fenced;
}

export function extractLinkTargets(line: string): string[] {
  // @why 行內反引號範例常寫 `[文字](目標)`，先移除成對行內反引號內容以免誤報為真實連結
  const stripped = line.replace(/(?<!`)(`+)(?!`)[^\n]*?(?<!`)\1(?!`)/g, '');
  const targets: string[] = [];
  MARKDOWN_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_RE.exec(stripped)) !== null) {
    const inside = match[1].trim();
    if (!inside) continue;
    let rawTarget: string;
    if (inside.startsWith('<')) {
      const closeIdx = inside.indexOf('>');
      rawTarget = closeIdx === -1 ? inside.slice(1) : inside.slice(1, closeIdx);
    } else {
      rawTarget = inside.split(/\s+/)[0];
    }
    if (rawTarget) targets.push(rawTarget);
  }
  return targets;
}

export function isInsideWorktree(wtReal: string, targetPath: string): boolean {
  const rel = path.relative(wtReal, targetPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  if (!fs.existsSync(targetPath)) return false;
  try {
    const relReal = path.relative(wtReal, fs.realpathSync(targetPath));
    return !relReal.startsWith('..') && !path.isAbsolute(relReal);
  } catch {
    return false;
  }
}

function resolveLinkCandidatePath(wtReal: string, mdDir: string, candidate: string): string {
  return candidate.startsWith('/')
    ? path.resolve(wtReal, candidate.slice(1))
    : path.resolve(mdDir, candidate);
}

function getTargetCandidates(relTarget: string): string[] {
  const candidates = [relTarget];
  try {
    const decoded = decodeURIComponent(relTarget);
    if (decoded !== relTarget) candidates.push(decoded);
  } catch {}
  return candidates;
}

export function resolveBranchLinkExists(wtReal: string, mdFilePath: string, relTarget: string): boolean {
  const mdDir = path.dirname(path.resolve(wtReal, ...mdFilePath.split('/')));
  return getTargetCandidates(relTarget).some((candidate) =>
    isInsideWorktree(wtReal, resolveLinkCandidatePath(wtReal, mdDir, candidate)),
  );
}

/**
 * 將目標路徑正規化為可跨是否存在目錄比對的真實路徑。
 * @why 目標倉庫或檔案可能不在本機，無法直接取 realpath；向上尋最近已存在父目錄再接回相對路徑，確保符號連結前綴一致。
 */
export function resolveComparablePath(targetPath: string): string {
  const absTarget = path.resolve(targetPath);
  if (fs.existsSync(absTarget)) {
    try {
      return fs.realpathSync(absTarget);
    } catch {
      return absTarget;
    }
  }
  let ancestor = path.dirname(absTarget);
  while (true) {
    if (fs.existsSync(ancestor)) {
      try {
        const realAncestor = fs.realpathSync(ancestor);
        return path.join(realAncestor, path.relative(ancestor, absTarget));
      } catch {
        return absTarget;
      }
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return absTarget;
    ancestor = parent;
  }
}

export function isRelativeTargetOutsideRoot(wtReal: string, mdFilePath: string, relTarget: string): boolean {
  if (relTarget.startsWith('/')) return false;
  const mdDir = path.dirname(path.resolve(wtReal, ...mdFilePath.split('/')));
  return getTargetCandidates(relTarget).some((candidate) => {
    const targetPath = path.resolve(mdDir, candidate);
    const rel = path.relative(wtReal, targetPath);
    return rel.startsWith('..') || path.isAbsolute(rel);
  });
}

export function resolveCrossRepoLink(
  configBaseReal: string,
  otherRepos: readonly ComparableOtherRepo[],
  mdFilePath: string,
  relTarget: string,
): CrossRepoLinkResolution {
  const baseMdDir = path.dirname(path.resolve(configBaseReal, ...mdFilePath.split('/')));
  let missingRepoKey: string | null = null;

  for (const candidate of getTargetCandidates(relTarget)) {
    const rawTargetPath = path.resolve(baseMdDir, candidate);
    const targetPath = resolveComparablePath(rawTargetPath);
    const repo = otherRepos.find((r) => {
      const rel = path.relative(r.dirComparable, targetPath);
      return !rel.startsWith('..') && !path.isAbsolute(rel);
    });
    if (!repo) continue;
    if (!repo.exists) {
      if (!missingRepoKey) missingRepoKey = repo.key;
      continue;
    }
    if (isInsideWorktree(repo.dirComparable, rawTargetPath)) {
      return { matched: true, exists: true, missingRepoKey: null };
    }
  }

  if (missingRepoKey) {
    return { matched: true, exists: false, missingRepoKey };
  }
  return { matched: false, exists: false, missingRepoKey: null };
}

/** 將 Markdown 相對連結目標解析為相對 `wtReal` 的正規化 POSIX 路徑，超出邊界則回傳 `null`。 */
export function resolveRelativeLinkRepoPath(wtReal: string, mdFilePath: string, relTarget: string): string | null {
  const mdDir = path.dirname(path.resolve(wtReal, ...mdFilePath.split('/')));
  const targetPath = resolveLinkCandidatePath(wtReal, mdDir, relTarget);
  const rel = path.relative(wtReal, targetPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return normalizePattern(rel.split(path.sep).join('/')) || null;
}

export function compareCodeUnit(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function sortFindings(findings: readonly RuleFinding[]): RuleFinding[] {
  // @why 規格要求依字元碼順序比對路徑，不可用受語系與標點影響的 localeCompare
  return findings.slice().sort((a, b) => {
    if (a.repoIndex !== b.repoIndex) return a.repoIndex - b.repoIndex;
    const fileCmp = compareCodeUnit(a.filePath, b.filePath);
    if (fileCmp !== 0) return fileCmp;
    const lineA = a.lineNo ?? -1;
    const lineB = b.lineNo ?? -1;
    if (lineA !== lineB) return lineA - lineB;
    return compareCodeUnit(a.code, b.code);
  });
}

export function pushFinding(
  findings: RuleFinding[],
  repoIndex: number,
  filePath: string,
  lineNo: number | null,
  code: string,
  text: string,
): void {
  findings.push({ repoIndex, filePath, lineNo, code, text });
}

function parseDocPatternList(
  rawList: unknown,
  defaultList: readonly string[],
  fieldName: string,
  { allowEmpty = true }: { allowEmpty?: boolean } = {},
): string[] {
  if (rawList === undefined || rawList === null) return [...defaultList];
  if (!Array.isArray(rawList)) {
    usageError(`設定檔錯誤：${fieldName} 必須是陣列`);
  }
  const out = rawList.map((item) => {
    if (typeof item !== 'string' || !item.trim()) {
      usageError(`設定檔錯誤：${fieldName} 項目必須是非空字串`);
    }
    const normalized = normalizePattern(item);
    if (!normalized) {
      usageError(`設定檔錯誤：${fieldName} 項目內容為空`);
    }
    return normalized;
  });
  if (!allowEmpty && out.length === 0) {
    usageError(`設定檔錯誤：${fieldName} 不可為空陣列`);
  }
  return out;
}

function compileStatelessRegExp(patternStr: unknown, fieldName: string): RegExp {
  if (typeof patternStr !== 'string' || !patternStr.trim()) {
    usageError(`設定檔錯誤：${fieldName} 必須是非空字串`);
  }
  try {
    const compiled = new RegExp(patternStr);
    // @why 重複呼叫 .test()/.exec() 若保留狀態旗標會受 lastIndex 累積影響，驗證語法後移除 g/y 旗標
    return new RegExp(compiled.source, compiled.flags.replace(/[gy]/g, ''));
  } catch (err: unknown) {
    usageError(
      `設定檔錯誤：${fieldName} 正規表示式無效（${err instanceof Error ? err.message : String(err)}）`,
    );
  }
}

function parseDocRegistryEntry(raw: unknown, idx: number): ParsedDocRegistry {
  if (!isPlainObject(raw)) {
    usageError(`設定檔錯誤：docRules.registries[${idx}] 必須是物件`);
  }
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) {
    usageError(`設定檔錯誤：docRules.registries[${idx}] 缺少 id`);
  }

  let rawFiles: unknown;
  if (typeof raw.files === 'string') {
    rawFiles = [raw.files];
  } else if (Array.isArray(raw.files)) {
    rawFiles = raw.files;
  } else {
    usageError(`設定檔錯誤：docRules.registries[${id}].files 必須是字串或字串陣列`);
  }
  const files = parseDocPatternList(rawFiles, [], `docRules.registries[${id}].files`, { allowEmpty: false });

  let whenLines = DEFAULT_WHEN_LINES;
  if (raw.whenLines !== undefined && raw.whenLines !== null) {
    if (typeof raw.whenLines !== 'number' || !Number.isSafeInteger(raw.whenLines) || raw.whenLines <= 0) {
      usageError(`設定檔錯誤：docRules.registries[${id}].whenLines 必須是正整數`);
    }
    whenLines = raw.whenLines;
  }

  const when =
    raw.when === undefined || raw.when === null
      ? null
      : compileStatelessRegExp(raw.when, `docRules.registries[${id}].when`);

  const key =
    raw.key === undefined || raw.key === null
      ? compileStatelessRegExp(DEFAULT_KEY_PATTERN, `docRules.registries[${id}].key`)
      : compileStatelessRegExp(raw.key, `docRules.registries[${id}].key`);

  if (raw.mustAppearIn === undefined || raw.mustAppearIn === null) {
    usageError(`設定檔錯誤：docRules.registries[${id}] 缺少 mustAppearIn`);
  }
  const mustAppearIn = parseDocPatternList(
    raw.mustAppearIn,
    [],
    `docRules.registries[${id}].mustAppearIn`,
    { allowEmpty: false },
  );

  let pending: ParsedDocPending | null = null;
  if (raw.pending !== undefined && raw.pending !== null) {
    if (!isPlainObject(raw.pending)) {
      usageError(`設定檔錯誤：docRules.registries[${id}].pending 必須是物件`);
    }
    const pendingWhen = compileStatelessRegExp(
      raw.pending.when,
      `docRules.registries[${id}].pending.when`,
    );
    let maxDays = DEFAULT_PENDING_MAX_DAYS;
    if (raw.pending.maxDays !== undefined && raw.pending.maxDays !== null) {
      if (typeof raw.pending.maxDays !== 'number' || !Number.isSafeInteger(raw.pending.maxDays) || raw.pending.maxDays <= 0) {
        usageError(`設定檔錯誤：docRules.registries[${id}].pending.maxDays 必須是正整數`);
      }
      maxDays = raw.pending.maxDays;
    }
    pending = { when: pendingWhen, maxDays };
  }

  return { id, files, whenLines, when, key, mustAppearIn, pending };
}

/** 解析並驗證 `project.config.json` 的 `docRules` 設定，失敗時以結束代碼 2 結束。 */
export function parseDocRulesConfig(rawDocRules: unknown): ParsedDocRulesConfig {
  if (!isPlainObject(rawDocRules)) {
    usageError('設定檔錯誤：docRules 必須是物件');
  }
  const scan = parseDocPatternList(rawDocRules.scan, DEFAULT_DOC_SCAN, 'docRules.scan');
  const ignore = parseDocPatternList(rawDocRules.ignore, DEFAULT_DOC_IGNORE, 'docRules.ignore');

  let registries: ParsedDocRegistry[] = [];
  if (rawDocRules.registries !== undefined && rawDocRules.registries !== null) {
    if (!Array.isArray(rawDocRules.registries)) {
      usageError('設定檔錯誤：docRules.registries 必須是陣列');
    }
    registries = rawDocRules.registries.map((raw, idx) => parseDocRegistryEntry(raw, idx));
  }

  return { scan, ignore, registries };
}

function isDirectoryAlwaysIgnored(relDir: string, ignorePatterns: readonly string[]): boolean {
  const dirSegs = relDir.split('/').filter(Boolean);
  if (dirSegs.length === 0) return false;
  return ignorePatterns.some((pattern) => {
    if (!pattern.includes('*')) {
      const patSegs = pattern.split('/').filter(Boolean);
      return patSegs.length > 0 && segmentListsOverlap(dirSegs, patSegs);
    }
    if (pattern.endsWith('/**') || pattern === '**') {
      const patSegs = pattern.split('/').filter(Boolean);
      return segmentListsOverlap(dirSegs, patSegs);
    }
    return false;
  });
}

function collectRegularFiles(rootReal: string, ignorePatterns: readonly string[]): string[] {
  const files: string[] = [];
  function walk(absDir: string, relPrefix: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        // @why 提前跳過整層必定被 ignore 排除的大型目錄（如 node_modules、target），避免全倉掃描拖慢檢查
        if (!isDirectoryAlwaysIgnored(relPath, ignorePatterns)) {
          walk(path.join(absDir, entry.name), relPath);
        }
      } else if (entry.isFile()) {
        files.push(relPath);
      }
    }
  }
  walk(rootReal, '');
  return files.sort(compareCodeUnit);
}

function checkDocScanFile({
  rootReal,
  configBaseReal = rootReal,
  otherRepos = [],
  filePath,
  displayPath,
  deletedSet,
  deletedMatchers,
  repoIndex,
  findings,
}: {
  rootReal: string;
  configBaseReal?: string;
  otherRepos?: readonly ComparableOtherRepo[];
  filePath: string;
  displayPath: string;
  deletedSet: ReadonlySet<string>;
  deletedMatchers: readonly DeletedPathMatcher[];
  repoIndex: number;
  findings: RuleFinding[];
}): void {
  const text = readWorktreeTextFile(rootReal, filePath);
  if (text === null) return;
  const lines = splitTextLines(text);
  const fenced = computeMarkdownFencedLines(lines);

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNo = idx + 1;
    const line = lines[idx];
    const targets = fenced[idx] ? [] : extractLinkTargets(line);
    const danglingDeletedOnLine = new Set<string>();
    const danglingRawTargetsOnLine = new Set<string>();

    if (deletedSet.size > 0 && targets.length > 0) {
      for (const rawTarget of targets) {
        if (EXTERNAL_OR_ANCHOR_RE.test(rawTarget) || FILE_URL_RE.test(rawTarget)) continue;
        const relTarget = rawTarget.split('#')[0];
        if (!relTarget) continue;
        for (const candidate of getTargetCandidates(relTarget)) {
          const resolvedRel = resolveRelativeLinkRepoPath(rootReal, filePath, candidate);
          if (resolvedRel && deletedSet.has(resolvedRel)) {
            danglingDeletedOnLine.add(resolvedRel);
            danglingRawTargetsOnLine.add(rawTarget);
            break;
          }
        }
      }
    }

    for (const { delPath, re } of deletedMatchers) {
      if (re.test(line)) {
        danglingDeletedOnLine.add(delPath);
      }
    }

    for (const delPath of [...danglingDeletedOnLine].sort(compareCodeUnit)) {
      pushFinding(findings, repoIndex, filePath, lineNo, 'dangling', `dangling ${displayPath}:${lineNo} 指向已刪除的 ${delPath}`);
    }

    for (const rawTarget of targets) {
      if (EXTERNAL_OR_ANCHOR_RE.test(rawTarget) || danglingRawTargetsOnLine.has(rawTarget)) continue;
      if (FILE_URL_RE.test(rawTarget)) {
        pushFinding(
          findings,
          repoIndex,
          filePath,
          lineNo,
          'local-link',
          `local-link ${displayPath}:${lineNo} 本機絕對路徑，請改成相對路徑：${rawTarget}`,
        );
        continue;
      }
      const relTarget = rawTarget.split('#')[0];
      if (!relTarget) continue;
      if (!resolveBranchLinkExists(rootReal, filePath, relTarget)) {
        if (otherRepos.length > 0 && isRelativeTargetOutsideRoot(rootReal, filePath, relTarget)) {
          const cross = resolveCrossRepoLink(configBaseReal, otherRepos, filePath, relTarget);
          if (cross.matched && cross.exists) continue;
          if (cross.matched && cross.missingRepoKey) {
            pushFinding(
              findings,
              repoIndex,
              filePath,
              lineNo,
              'link',
              `link ${displayPath}:${lineNo} 找不到 ${rawTarget}（倉庫 ${cross.missingRepoKey} 不在本機）`,
            );
            continue;
          }
        }
        pushFinding(findings, repoIndex, filePath, lineNo, 'link', `link ${displayPath}:${lineNo} 找不到 ${rawTarget}`);
      }
    }
  }
}

function parseIsoDateUtcMs(str: string): number | null {
  if (!isValidIsoDate(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function resolveTodayStr(explicitToday?: string | null): string {
  const raw = explicitToday ?? process.env.TASK_TODAY;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const trimmed = String(raw).trim();
    if (!isValidIsoDate(trimmed)) {
      usageError(`TASK_TODAY 日期格式錯誤（應為 YYYY-MM-DD）：${trimmed}`);
    }
    return trimmed;
  }
  return formatLocalToday();
}

function getFileLastCommitDateStr(rootReal: string, filePath: string): string | null {
  const res = runGit(rootReal, ['log', '-1', '--format=%cs', '--', filePath]);
  if (!res.ok) return null;
  const dateStr = res.stdout.trim();
  return dateStr || null;
}

function checkPendingStale({
  rootReal,
  reg,
  filePath,
  displayPath,
  headLines,
  getTodayMs,
  staleItems,
}: {
  rootReal: string;
  reg: ParsedDocRegistry;
  filePath: string;
  displayPath: string;
  headLines: readonly string[];
  getTodayMs: () => number;
  staleItems: StaleDocItem[];
}): void {
  const pending = reg.pending;
  if (!pending || !headLines.some((l) => pending.when.test(l))) return;
  const commitDateStr = getFileLastCommitDateStr(rootReal, filePath);
  const commitMs = commitDateStr ? parseIsoDateUtcMs(commitDateStr) : null;
  const days = commitMs === null ? 0 : Math.round((getTodayMs() - commitMs) / MS_PER_DAY);
  if (days > pending.maxDays) {
    staleItems.push({
      filePath,
      regId: reg.id,
      text: `STALE ${displayPath} 待決已 ${days} 天（${reg.id}）`,
    });
  }
}

function checkDocRegistry({
  rootReal,
  reg,
  activeFiles,
  displayPrefix,
  repoIndex,
  regContentCache,
  findings,
  includeStale = false,
  getTodayMs = null,
  staleItems = null,
}: {
  rootReal: string;
  reg: ParsedDocRegistry;
  activeFiles: readonly string[];
  displayPrefix: string;
  repoIndex: number;
  regContentCache: Map<string, string | null>;
  findings: RuleFinding[];
  includeStale?: boolean;
  getTodayMs?: (() => number) | null;
  staleItems?: StaleDocItem[] | null;
}): void {
  const matchedFiles = activeFiles.filter((f) => matchesAnyPathPattern(f, reg.files));
  for (const filePath of matchedFiles) {
    const text = readWorktreeTextFile(rootReal, filePath);
    if (text === null) continue;
    const lines = splitTextLines(text);
    const headLines = lines.slice(0, reg.whenLines);
    const displayPath = displayPrefix ? `${displayPrefix}:${filePath}` : filePath;

    if (includeStale && staleItems && getTodayMs) {
      checkPendingStale({
        rootReal,
        reg,
        filePath,
        displayPath,
        headLines,
        getTodayMs,
        staleItems,
      });
    }

    const whenRe = reg.when;
    if (whenRe && !headLines.some((l) => whenRe.test(l))) {
      continue;
    }

    const baseName = path.posix.basename(filePath);
    const keyMatch = reg.key.exec(baseName);
    const keyName = keyMatch?.[1] || baseName.replace(/\.[^.]+$/, '');
    const keyRe = new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegExp(keyName)}(?=$|[^A-Za-z0-9_])`);

    for (const regFile of reg.mustAppearIn) {
      let regContent = regContentCache.get(regFile);
      if (regContent === undefined) {
        regContent = readWorktreeTextFile(rootReal, regFile);
        regContentCache.set(regFile, regContent);
      }
      if (regContent === null) {
        pushFinding(findings, repoIndex, filePath, null, 'registry', `registry ${displayPath} 登記檔不存在：${regFile}`);
      } else if (!keyRe.test(regContent)) {
        pushFinding(findings, repoIndex, filePath, null, 'registry', `registry ${displayPath} 沒登記在 ${regFile}`);
      }
    }
  }
}

/** 在指定目錄執行 S-018 文件相依檢查（相對連結、登記關係與已刪除路徑殘留引用）。 */
export function evaluateDocRulesOnDir({
  rootDir,
  configBaseDir = rootDir,
  repoRoots = [],
  rawDocRules,
  deletedPaths = [],
  repoIndex = 0,
  displayPrefix = '',
  includeStale = false,
  today,
}: EvaluateDocRulesOptions): EvaluateDocRulesResult {
  const rules = parseDocRulesConfig(rawDocRules);
  const rootReal = fs.realpathSync(rootDir);
  const configBaseReal = resolveComparablePath(configBaseDir);
  const otherRepos: ComparableOtherRepo[] = [];
  if (Array.isArray(repoRoots)) {
    for (const r of repoRoots) {
      if (!r || !r.dir) continue;
      const key =
        typeof r.key === 'string'
          ? r.key.trim()
          : r.key !== undefined && r.key !== null
            ? String(r.key).trim()
            : '';
      if (!key) continue;
      const dirComparable = resolveComparablePath(r.dir);
      if (dirComparable === configBaseReal) continue;
      let exists = false;
      try {
        exists = fs.existsSync(dirComparable) && fs.statSync(dirComparable).isDirectory();
      } catch {
        exists = false;
      }
      otherRepos.push({ key, dirComparable, exists });
    }
  }
  const allFiles = collectRegularFiles(rootReal, rules.ignore);
  const activeFiles = allFiles.filter((f) => !matchesAnyPathPattern(f, rules.ignore));
  const scanFiles = activeFiles.filter((f) => matchesAnyPathPattern(f, rules.scan));

  const deletedList = [...new Set(deletedPaths.map(normalizePattern).filter(Boolean))].sort(compareCodeUnit);
  const deletedSet = new Set(deletedList);
  const deletedMatchers: DeletedPathMatcher[] = deletedList.map((delPath) => ({
    delPath,
    re: new RegExp(`(?:^|[^A-Za-z0-9_./-])${escapeRegExp(delPath)}(?=$|[^A-Za-z0-9_.-])`),
  }));

  const findings: RuleFinding[] = [];
  for (const filePath of scanFiles) {
    const displayPath = displayPrefix ? `${displayPrefix}:${filePath}` : filePath;
    checkDocScanFile({
      rootReal,
      configBaseReal,
      otherRepos,
      filePath,
      displayPath,
      deletedSet,
      deletedMatchers,
      repoIndex,
      findings,
    });
  }

  const regContentCache = new Map<string, string | null>();
  const staleItems: StaleDocItem[] = [];
  let cachedTodayMs: number | null = null;
  // @why 僅在實際需要計算待決天數時才解析 TASK_TODAY，避免未設定 pending 時受無關環境變數影響
  const getTodayMs = (): number => {
    if (cachedTodayMs === null) {
      const todayStr = resolveTodayStr(today);
      cachedTodayMs = parseIsoDateUtcMs(todayStr);
      if (cachedTodayMs === null) {
        usageError(`TASK_TODAY 日期格式錯誤（應為 YYYY-MM-DD）：${todayStr}`);
      }
    }
    return cachedTodayMs;
  };

  for (const reg of rules.registries) {
    checkDocRegistry({
      rootReal,
      reg,
      activeFiles,
      displayPrefix,
      repoIndex,
      regContentCache,
      findings,
      includeStale,
      getTodayMs,
      staleItems,
    });
  }

  const sortedStale = staleItems
    .slice()
    .sort((a, b) => compareCodeUnit(a.filePath, b.filePath) || compareCodeUnit(a.regId, b.regId));

  return {
    rules,
    findings: sortFindings(findings),
    staleLines: sortedStale.map((s) => s.text),
  };
}

function collectDeletedPathsFromDiff(
  repoDir: string,
  diffTarget: string,
): { ok: boolean; deletedPaths: string[]; errorDetail: string } {
  const diffRes = runGit(repoDir, [
    '-c',
    'core.quotepath=false',
    '-c',
    'diff.noprefix=false',
    '-c',
    'diff.mnemonicPrefix=false',
    'diff',
    '--name-status',
    '-z',
    diffTarget,
  ]);
  if (!diffRes.ok) {
    return { ok: false, deletedPaths: [], errorDetail: diffRes.stderr || diffRes.stdout || '未知錯誤' };
  }
  const deletedPaths = parseNameStatusZ(diffRes.stdout)
    .filter((e) => e.status === 'D')
    .map((e) => e.filePath);
  return { ok: true, deletedPaths, errorDetail: '' };
}

/** 執行 `task docs-check [--since <commit>]`（不依賴 repos、issueRepo 或 gh）。 */
export function cmdDocsCheck(
  cwd = process.cwd(),
  { since = null }: { since?: string | null } = {},
): number {
  const configPath = findConfigPath(cwd);
  const configDir = path.dirname(configPath);

  let config: unknown;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err: unknown) {
    fail(`無法解析設定檔 ${configPath}：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isPlainObject(config)) {
    fail(`設定檔格式錯誤：${path.basename(configPath)} 必須是 JSON 物件`);
  }

  if (config.docRules === undefined || config.docRules === null) {
    console.log('docRules 未設定，略過');
    return 0;
  }

  parseDocRulesConfig(config.docRules);

  let deletedPaths: string[] = [];
  if (since) {
    const diffRes = collectDeletedPathsFromDiff(configDir, since);
    if (!diffRes.ok) {
      fail(`比對 git 差異失敗（--since ${since}）：${diffRes.errorDetail}`);
    }
    deletedPaths = diffRes.deletedPaths;
  }

  const repoRoots: DocRepoRootInput[] = [];
  if (Array.isArray(config.repos)) {
    for (const r of config.repos) {
      if (!isPlainObject(r)) continue;
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      const key =
        r.key !== undefined && r.key !== null && String(r.key).trim() ? String(r.key).trim() : name;
      const relPath = typeof r.path === 'string' && r.path.trim() ? r.path.trim() : '.';
      if (key) {
        repoRoots.push({ key, dir: path.resolve(configDir, relPath) });
      }
    }
  }

  const { rules, findings, staleLines } = evaluateDocRulesOnDir({
    rootDir: configDir,
    configBaseDir: configDir,
    repoRoots,
    rawDocRules: config.docRules,
    deletedPaths,
    includeStale: true,
  });

  console.log(`DOC_RULES=${rules.registries.map((r) => r.id).join(',')}`);
  for (const f of findings) {
    console.log(f.text);
  }
  for (const line of staleLines) {
    console.log(line);
  }
  if (findings.length === 0) {
    console.log('文件相依檢查通過');
    return 0;
  }
  return 3;
}

function findingComparisonKey(f: RuleFinding): string {
  if (f.lineNo === null || f.lineNo === undefined) {
    return `${f.code}\0${f.filePath}\0${f.text}`;
  }
  const searchFrom = typeof f.code === 'string' ? f.code.length + 1 : 0;
  const marker = `${f.filePath}:${f.lineNo} `;
  const idx = f.text.indexOf(marker, searchFrom);
  if (idx !== -1) {
    return `${f.code}\0${f.filePath}\0${f.text.slice(idx + marker.length)}`;
  }
  const lineToken = `:${f.lineNo} `;
  const tokenIdx = f.text.indexOf(lineToken, searchFrom);
  const desc =
    tokenIdx !== -1
      ? `${f.text.slice(0, tokenIdx)} ${f.text.slice(tokenIdx + lineToken.length)}`
      : f.text;
  return `${f.code}\0${f.filePath}\0${desc}`;
}

/** 供 `task accept` 在暫存工作資料夾執行 S-018 文件相依檢查（只計比基準新增的問題）。 */
export function checkAcceptDocRules({
  ctx,
  repoResults,
}: {
  ctx: Pick<TaskContext, 'config' | 'configDir' | 'repos'>;
  repoResults: readonly AcceptRepoResult[];
}): RuleCheckOutcome {
  if (!ctx.config || ctx.config.docRules === undefined || ctx.config.docRules === null) {
    return { status: '不適用', passed: true, outputLines: [], existingOutputLines: [] };
  }

  const configDirReal = fs.existsSync(ctx.configDir)
    ? fs.realpathSync(ctx.configDir)
    : path.resolve(ctx.configDir);

  let targetResult: AcceptRepoResult | null = null;
  for (const r of Array.isArray(repoResults) ? repoResults : []) {
    const mainRepoReal = fs.existsSync(r.repo.mainRepoPath)
      ? fs.realpathSync(r.repo.mainRepoPath)
      : path.resolve(r.repo.mainRepoPath);
    const relFromMain = path.relative(mainRepoReal, configDirReal);
    if (!relFromMain.startsWith('..') && !path.isAbsolute(relFromMain)) {
      targetResult = r;
      break;
    }
  }

  if (!targetResult) {
    return { status: '不適用', passed: true, outputLines: [], existingOutputLines: [] };
  }
  if (!targetResult.ok || !targetResult.wtPath || !targetResult.baseSha || !targetResult.headSha) {
    return { status: 'FAIL', passed: false, outputLines: [], existingOutputLines: [] };
  }

  const { wtPath, baseSha, headSha, repo, fromLockPaths } = targetResult;
  const diffRes = collectDeletedPathsFromDiff(repo.mainRepoPath, `${baseSha}..${headSha}`);
  if (!diffRes.ok) {
    return { status: 'FAIL', passed: false, outputLines: [], existingOutputLines: [] };
  }

  const lockSet = fromLockPaths || new Set<string>();
  const deletedPaths = diffRes.deletedPaths.filter((p) => !lockSet.has(p));

  const repoRoots: DocRepoRootInput[] = Array.isArray(ctx.repos)
    ? ctx.repos.map((r) => ({ key: r.key, dir: r.mainRepoPath }))
    : [];
  const displayPrefix = ctx.repos.length > 1 ? repo.key : '';

  const { findings: branchFindings } = evaluateDocRulesOnDir({
    rootDir: wtPath,
    configBaseDir: repo.mainRepoPath,
    repoRoots,
    rawDocRules: ctx.config.docRules,
    deletedPaths,
    repoIndex: 0,
    displayPrefix,
  });

  const rawTmp = os.tmpdir();
  fs.mkdirSync(rawTmp, { recursive: true });
  const baseTmpRoot = fs.mkdtempSync(path.join(fs.realpathSync(rawTmp), 'task-accept-docbase-'));
  const baseRepoDirName = path.basename(String(repo.name || 'repo')) || 'repo';
  const baseWtPath = path.join(baseTmpRoot, baseRepoDirName);
  let baseFindings: RuleFinding[];
  try {
    const wtAddRes = runGit(repo.mainRepoPath, [
      'worktree',
      'add',
      '-q',
      '--detach',
      baseWtPath,
      baseSha,
    ]);
    if (!wtAddRes.ok) {
      return { status: 'FAIL', passed: false, outputLines: [], existingOutputLines: [] };
    }
    // @why 基準版本尚未刪除分支刪掉的檔案，deletedPaths 傳空陣列只盤點原本就壞掉的連結或登記缺漏
    ({ findings: baseFindings } = evaluateDocRulesOnDir({
      rootDir: baseWtPath,
      configBaseDir: repo.mainRepoPath,
      repoRoots,
      rawDocRules: ctx.config.docRules,
      deletedPaths: [],
      repoIndex: 0,
      displayPrefix,
    }));
  } finally {
    runGit(repo.mainRepoPath, ['worktree', 'remove', '--force', baseWtPath]);
    try {
      fs.rmSync(baseTmpRoot, { recursive: true, force: true });
    } catch {}
    runGit(repo.mainRepoPath, ['worktree', 'prune']);
  }

  const baseCounts = new Map<string, number>();
  for (const f of baseFindings) {
    if (f.code === 'dangling') continue;
    const key = findingComparisonKey(f);
    baseCounts.set(key, (baseCounts.get(key) || 0) + 1);
  }

  const addedFindings: RuleFinding[] = [];
  const existingFindings: RuleFinding[] = [];
  for (const f of branchFindings) {
    if (f.code === 'dangling') {
      addedFindings.push(f);
      continue;
    }
    const key = findingComparisonKey(f);
    const remaining = baseCounts.get(key) || 0;
    if (remaining > 0) {
      baseCounts.set(key, remaining - 1);
      existingFindings.push(f);
    } else {
      addedFindings.push(f);
    }
  }

  const passed = addedFindings.length === 0;
  return {
    status: passed ? 'PASS' : 'FAIL',
    passed,
    outputLines: addedFindings.map((f) => f.text),
    existingOutputLines: existingFindings.map((f) => f.text),
  };
}
