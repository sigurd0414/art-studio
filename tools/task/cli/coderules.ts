// @module templates/bin/task/cli/coderules
// @role 通用 task 工具的程式規則檢查模組：在 task accept 階段檢查改動檔案的檔頭、@lock、禁用寫法、建置產物、前端跳脫、文件連結、@bridge 與 owns
// @why 只看任務分支改到的檔案與新增的行，將所有規則判斷與輸出排序集中一處，未啟用 codeRules 的專案完全不受影響
// @forbid 禁止掃描未改動的舊債檔案、對顯示文字做模糊比對、或引入特定專案與環境的特例

import fs from 'node:fs';
import path from 'node:path';
import { extractSection, parseGitNumstatZ } from '../lib.ts';
import type {
  ForbiddenPatternConfig,
  ProjectConfig,
  RepoConfigEntry,
  RuleCheckOutcome,
  RuntimeRepo,
  TaskLib,
} from '../types.ts';
import {
  EXTERNAL_OR_ANCHOR_RE,
  computeMarkdownFencedLines,
  escapeRegExp,
  extractLinkTargets,
  isPlainObject,
  matchesAnyPathPattern,
  normalizePattern,
  parseNameStatusZ,
  pushFinding,
  readWorktreeTextFile,
  resolveBranchLinkExists,
  sortFindings,
  splitTextLines,
} from './docs.ts';
import type { NameStatusEntry, RuleFinding } from './docs.ts';
import { fail, runGit } from './runtime.ts';

export const DEFAULT_HEADER_TAGS = Object.freeze(['@module', '@role', '@forbid']);
export const LIBRARY_EXTRA_HEADER_TAG = '@layer';
export const DEFAULT_HEADER_LINES = 40;
export const DEFAULT_SOURCE_EXTENSIONS = Object.freeze([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.rs', '.py', '.go', '.swift', '.kt', '.java',
  '.rb', '.php', '.cs', '.c', '.h', '.cpp', '.sh',
]);
export const DEFAULT_HEADER_EXEMPT = Object.freeze(['**/fixtures/**']);
export const DEFAULT_ARTIFACT_PATTERNS = Object.freeze([
  '**/dist/**',
  '**/build/**',
  '**/target/**',
  '**/node_modules/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/*.min.js',
  '**/.DS_Store',
]);
export const DEFAULT_ESCAPE_FUNCTION = 'escapeHtml';
const EMPTY_FORBIDDEN_PATTERNS: readonly ForbiddenPatternConfig[] = Object.freeze([]);
const EMPTY_GENERATED_PATHS: readonly string[] = Object.freeze([]);
export const DEFAULT_CODE_RULES = Object.freeze({
  headerTags: DEFAULT_HEADER_TAGS,
  forbiddenPatterns: EMPTY_FORBIDDEN_PATTERNS,
  generatedPaths: EMPTY_GENERATED_PATHS,
});

const ORIGIN_MAIN_REF = 'refs/remotes/origin/main';
const LOCK_COMMENT_LINE_RE = /^\s*(?:\/\/|#|\/\*|\*|--|<!--)\s*@lock(?=$|[^A-Za-z0-9_])/;
const MAX_LOCK_LABEL_LEN = 40;
const NON_HASH_COMMENT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.rs', '.go', '.swift', '.kt', '.java', '.cs', '.c', '.h', '.cpp',
]);
const DASH_COMMENT_EXTS = new Set(['.sql', '.lua', '.hs', '.elm', '.ada', '.vhd', '.vhdl']);
const RUST_CHAR_LITERAL_RE = /^'(?:\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F_]+\}|.)|[^'\\])'/;
const ESCAPED_ANNOTATION_RE = /(?:^|[^A-Za-z0-9_])@escaped(?=$|[^A-Za-z0-9_])/;
const BRIDGE_ANNOTATION_RE = /(?:^|[^A-Za-z0-9_])@bridge\s+([A-Za-z0-9][A-Za-z0-9._-]*):([^\s#]+)#([A-Za-z0-9_$]+)/g;
const TRAILING_COMMENT_RE = /(?:(?:^|[\s;])\/\/[^\n]*|\{\s*\/\*[^\n]*\*\/\s*\}|\/\*[^\n]*\*\/|<!--[^\n]*-->)\s*$/;
const MARKDOWN_EXT_RE = /\.(?:md|markdown)$/i;
const DIFF_HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export interface CodeRuleRepoInput {
  repoKey: string;
  ok: boolean;
  baseSha: string | null;
  headSha: string | null;
  wtPath: string | null;
  fromLockPaths?: ReadonlySet<string>;
}

export interface CheckAcceptCodeRulesOptions {
  config?: Pick<ProjectConfig, 'codeRules' | 'generatedPaths' | 'repos'> | null;
  lib?: TaskLib;
  repos: readonly RuntimeRepo[];
  issueBody: string | null | undefined;
  repoInputs: readonly CodeRuleRepoInput[];
}

interface CompiledForbiddenPattern {
  id: string;
  regex: RegExp;
  paths: string[] | null;
  message: string;
}

interface ParsedCodeRules {
  headerTags: string[];
  headerLines: number;
  sourceExtensions: Set<string>;
  headerExempt: string[];
  forbiddenPatterns: CompiledForbiddenPattern[];
  generatedPaths: string[];
  artifactPatterns: string[];
  escapeFunction: string;
}

interface RepoMetadata {
  repoIndex: number;
  repo: RuntimeRepo;
  traits: Set<string>;
  owns: string[] | null;
}

interface AddedLineWithNumber {
  lineNo: number;
  text: string;
}

interface RepoDiffForCodeRules {
  changedEntries: NameStatusEntry[];
  binaryPaths: Set<string>;
  addedLinesByFile: Map<string, AddedLineWithNumber[]>;
}

interface CodeRulesCheckContext {
  rules: ParsedCodeRules;
  isMultiRepo: boolean;
  unlockLines: string[] | null;
  bridgeTargetHasSymbol: (targetKey: string, targetPath: string, symbol: string) => boolean;
  findings: RuleFinding[];
}

interface CodeRulesRepoContext extends RepoMetadata {
  baseSha: string;
  wtReal: string;
  diffData: RepoDiffForCodeRules;
  requiredHeaderTags: string[];
}

type CommentScanState = 'none' | 'block' | 'html';
type QuoteKind = "'" | '"' | '`';

interface LockSegment {
  lockLineKey: string;
  declLabel: string;
  text: string;
}

function parseStringList(
  rawList: unknown,
  defaultList: readonly string[],
  fieldName: string,
  transform: ((item: string) => string) | null = null,
): string[] {
  if (rawList === undefined || rawList === null) return [...defaultList];
  if (!Array.isArray(rawList)) {
    fail(`設定檔錯誤：${fieldName} 必須是陣列`);
  }
  return rawList.map((item) => {
    if (typeof item !== 'string' || !item.trim()) {
      fail(`設定檔錯誤：${fieldName} 項目必須是非空字串`);
    }
    const val = transform ? transform(item) : item.trim();
    if (!val) {
      fail(`設定檔錯誤：${fieldName} 項目內容為空`);
    }
    return val;
  });
}

function parsePatternList(rawList: unknown, defaultList: readonly string[], fieldName: string): string[] {
  return parseStringList(rawList, defaultList, fieldName, normalizePattern);
}

function parseForbiddenPatterns(rawList: unknown): CompiledForbiddenPattern[] {
  if (rawList === undefined || rawList === null) return [];
  if (!Array.isArray(rawList)) {
    fail('設定檔錯誤：codeRules.forbiddenPatterns 必須是陣列');
  }
  return rawList.map((raw, idx) => {
    if (!isPlainObject(raw)) {
      fail(`設定檔錯誤：codeRules.forbiddenPatterns[${idx}] 必須是物件`);
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const regexStr = typeof raw.regex === 'string' ? raw.regex : '';
    const flags = raw.flags === undefined || raw.flags === null ? '' : raw.flags;
    const message = typeof raw.message === 'string' ? raw.message.trim() : '';
    if (!id) fail(`設定檔錯誤：codeRules.forbiddenPatterns[${idx}] 缺少 id`);
    if (!regexStr) fail(`設定檔錯誤：codeRules.forbiddenPatterns[${id}] 缺少 regex`);
    if (typeof flags !== 'string') fail(`設定檔錯誤：codeRules.forbiddenPatterns[${id}].flags 必須是字串`);
    if (!message) fail(`設定檔錯誤：codeRules.forbiddenPatterns[${id}] 缺少 message`);

    try {
      new RegExp(regexStr, flags);
    } catch (err: unknown) {
      fail(
        `設定檔錯誤：codeRules.forbiddenPatterns[${id}].regex 無效（${err instanceof Error ? err.message : String(err)}）`,
      );
    }

    // @why 逐行呼叫 .test() 若保留 g/y 旗標會因 lastIndex 狀態累積而漏判，驗證語法後移除狀態旗標
    const regex = new RegExp(regexStr, flags.replace(/[gy]/g, ''));
    const paths =
      raw.paths === undefined || raw.paths === null
        ? null
        : parsePatternList(raw.paths, [], `codeRules.forbiddenPatterns[${id}].paths`);

    return { id, regex, paths, message };
  });
}

function parseCodeRulesConfig(
  rawCodeRules: unknown,
  fullConfig?: Pick<ProjectConfig, 'generatedPaths'> | null,
): ParsedCodeRules {
  if (!isPlainObject(rawCodeRules)) {
    fail('設定檔錯誤：codeRules 必須是物件');
  }

  let headerLines = DEFAULT_HEADER_LINES;
  if (rawCodeRules.headerLines !== undefined && rawCodeRules.headerLines !== null) {
    if (typeof rawCodeRules.headerLines !== 'number' || !Number.isSafeInteger(rawCodeRules.headerLines) || rawCodeRules.headerLines <= 0) {
      fail('設定檔錯誤：codeRules.headerLines 必須是正整數');
    }
    headerLines = rawCodeRules.headerLines;
  }

  const rawExts = parseStringList(
    rawCodeRules.sourceExtensions,
    DEFAULT_SOURCE_EXTENSIONS,
    'codeRules.sourceExtensions',
  );
  const sourceExtensions = new Set(
    rawExts.map((ext) => (ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`)),
  );

  let escapeFunction = DEFAULT_ESCAPE_FUNCTION;
  if (rawCodeRules.escapeFunction !== undefined && rawCodeRules.escapeFunction !== null) {
    if (typeof rawCodeRules.escapeFunction !== 'string' || !rawCodeRules.escapeFunction.trim()) {
      fail('設定檔錯誤：codeRules.escapeFunction 必須是非空字串');
    }
    escapeFunction = rawCodeRules.escapeFunction.trim();
  }

  const fallbackGenerated = Array.isArray(fullConfig?.generatedPaths) ? fullConfig.generatedPaths : [];
  return {
    headerTags: parseStringList(rawCodeRules.headerTags, DEFAULT_HEADER_TAGS, 'codeRules.headerTags'),
    headerLines,
    sourceExtensions,
    headerExempt: parsePatternList(rawCodeRules.headerExempt, DEFAULT_HEADER_EXEMPT, 'codeRules.headerExempt'),
    forbiddenPatterns: parseForbiddenPatterns(rawCodeRules.forbiddenPatterns),
    generatedPaths: parsePatternList(rawCodeRules.generatedPaths, fallbackGenerated, 'codeRules.generatedPaths'),
    artifactPatterns: parsePatternList(
      rawCodeRules.artifactPatterns,
      DEFAULT_ARTIFACT_PATTERNS,
      'codeRules.artifactPatterns',
    ),
    escapeFunction,
  };
}

function buildRepoMetadataMap(
  configRepos: readonly RepoConfigEntry[] | undefined,
  runtimeRepos: readonly RuntimeRepo[],
): Map<string, RepoMetadata> {
  const rawByKey = new Map<string, RepoConfigEntry>();
  for (const item of Array.isArray(configRepos) ? configRepos : []) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const name = typeof item.name === 'string' ? item.name : '';
    const key = item.key !== undefined && item.key !== null ? String(item.key) : name;
    if (key) rawByKey.set(key, item);
  }

  const metaByKey = new Map<string, RepoMetadata>();
  runtimeRepos.forEach((repo, repoIndex) => {
    const raw = rawByKey.get(repo.key);
    const traits =
      raw && Array.isArray(raw.traits) ? raw.traits.map((t) => String(t).trim()).filter(Boolean) : [];
    const owns =
      !raw || raw.owns === undefined || raw.owns === null
        ? null
        : parsePatternList(raw.owns, [], `repos[${repo.key}].owns`);
    metaByKey.set(repo.key, { repoIndex, repo, traits: new Set(traits), owns });
  });
  return metaByKey;
}

function parseDiffHeaderPath(rawTarget: string): string | null {
  let target = rawTarget.trim();
  if (target === '/dev/null') return null;
  if (target.startsWith('"') && target.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(target);
      target = typeof parsed === 'string' ? parsed : target.slice(1, -1);
    } catch {
      target = target.slice(1, -1);
    }
  }
  if (target.startsWith('a/') || target.startsWith('b/')) {
    target = target.slice(2);
  }
  return normalizePattern(target);
}

/** 解析 `git diff --no-renames -U0` 輸出，保留任務分支版本中每個新增行的精確行號。 */
function parseDiffAddedLinesWithNumbers(diffText: string): Map<string, AddedLineWithNumber[]> {
  const addedByFile = new Map<string, AddedLineWithNumber[]>();
  let currentFile: string | null = null;
  let inHunk = false;
  let currentLineNo = 0;

  for (const line of String(diffText || '').split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      currentFile = null;
      inHunk = false;
      currentLineNo = 0;
      continue;
    }
    if (!inHunk) {
      if (line.startsWith('+++ ')) {
        currentFile = parseDiffHeaderPath(line.slice(4));
      } else {
        const hunkMatch = DIFF_HUNK_HEADER_RE.exec(line);
        if (hunkMatch) {
          inHunk = true;
          currentLineNo = Number(hunkMatch[1]);
        }
      }
      continue;
    }

    const hunkMatch = DIFF_HUNK_HEADER_RE.exec(line);
    if (hunkMatch) {
      currentLineNo = Number(hunkMatch[1]);
      continue;
    }
    if (line.startsWith('+') && currentFile) {
      let list = addedByFile.get(currentFile);
      if (!list) {
        list = [];
        addedByFile.set(currentFile, list);
      }
      list.push({ lineNo: currentLineNo, text: line.slice(1) });
      currentLineNo += 1;
    }
  }

  return addedByFile;
}

function readGitBlobText(mainRepoPath: string, commitish: string, filePath: string): string | null {
  const cleanPath = normalizePattern(filePath);
  if (!cleanPath) return null;
  const spec = `${commitish}:${cleanPath}`;
  const typeRes = runGit(mainRepoPath, ['cat-file', '-t', spec]);
  if (!typeRes.ok || typeRes.stdout.trim() !== 'blob') return null;
  const res = runGit(mainRepoPath, ['cat-file', '-p', spec]);
  if (!res.ok || res.stdout.includes('\0')) return null;
  return res.stdout;
}

function parseUnlockLines(issueBody: string | null | undefined): string[] | null {
  const section = extractSection(issueBody, '解鎖');
  if (section === null) return null;
  return splitTextLines(section).map((raw) =>
    raw.trim().replace(/^-\s+/, '').trim().replace(/^`|`$/g, '').trim(),
  );
}

function isFileUnlocked(
  unlockLines: readonly string[] | null,
  repoKey: string,
  filePath: string,
  isMultiRepo: boolean,
): boolean {
  if (!unlockLines) return false;
  const scopedPath = `${repoKey}:${filePath}`;
  return isMultiRepo
    ? unlockLines.includes(scopedPath)
    : unlockLines.includes(filePath) || unlockLines.includes(scopedPath);
}

function hasHeaderTag(headerLinesList: readonly string[], tag: string): boolean {
  const tagRe = new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegExp(tag)}(?=$|[^A-Za-z0-9_])`);
  return headerLinesList.some((line) => tagRe.test(line));
}

function hasUnescapedHtml(line: string, escapeFunction: string): boolean {
  const hasSink =
    /\.(?:innerHTML|outerHTML)\s*=(?!=)/.test(line) ||
    /\binsertAdjacentHTML\s*\(/.test(line) ||
    /\bdangerouslySetInnerHTML\b/.test(line);
  if (!hasSink) return false;

  const escapeCallRe = new RegExp(`(?:^|[^A-Za-z0-9_$])${escapeRegExp(escapeFunction)}\\s*\\(`);
  if (escapeCallRe.test(line)) return false;

  const trailingComment = TRAILING_COMMENT_RE.exec(line);
  if (trailingComment && ESCAPED_ANNOTATION_RE.test(trailingComment[0])) return false;

  const hasEmptyDomAssignment =
    /\.(?:innerHTML|outerHTML)\s*=\s*(?:''|""|``)\s*;?\s*(?:(?:^|[\s;])\/\/.*|\/\*.*\*\/\s*)?$/.test(line) &&
    !/\bdangerouslySetInnerHTML\b/.test(line) &&
    !/\binsertAdjacentHTML\s*\(/.test(line);
  if (hasEmptyDomAssignment) return false;

  const hasEmptyDangerouslySet =
    /\bdangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*(?:''|""|``)\s*\}\s*\}/.test(line) &&
    !/\.(?:innerHTML|outerHTML)\s*=(?!=)/.test(line) &&
    !/\binsertAdjacentHTML\s*\(/.test(line);
  return !hasEmptyDangerouslySet;
}

function createBridgeChecker(
  metaByKey: ReadonlyMap<string, RepoMetadata>,
  preFetchedRepos: readonly string[],
): (targetKey: string, targetPath: string, symbol: string) => boolean {
  const fetchedOriginMain = new Set(preFetchedRepos);
  const blobCache = new Map<string, string | null>();

  function loadOriginMainBlob(targetKey: string, targetPath: string): string | null {
    const cleanPath = normalizePattern(targetPath);
    const cacheKey = `${targetKey}:${cleanPath}`;
    const cached = blobCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const meta = metaByKey.get(targetKey);
    if (!meta || !cleanPath || !fs.existsSync(meta.repo.mainRepoPath)) {
      blobCache.set(cacheKey, null);
      return null;
    }

    // @why hub 單可能未異動目標倉庫，須先對目標倉庫抓取 origin/main 才能比對最新主線符號
    if (!fetchedOriginMain.has(targetKey)) {
      fetchedOriginMain.add(targetKey);
      runGit(meta.repo.mainRepoPath, ['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
    }

    const content = readGitBlobText(meta.repo.mainRepoPath, ORIGIN_MAIN_REF, cleanPath);
    blobCache.set(cacheKey, content);
    return content;
  }

  return function targetHasSymbol(targetKey: string, targetPath: string, symbol: string): boolean {
    const content = loadOriginMainBlob(targetKey, targetPath);
    if (content === null) return false;
    const symbolRe = new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegExp(symbol)}(?=$|[^A-Za-z0-9_])`);
    return symbolRe.test(content);
  };
}

function collectRepoDiffForCodeRules(
  repo: RuntimeRepo,
  baseSha: string,
  headSha: string,
  fromLockPaths?: ReadonlySet<string>,
): RepoDiffForCodeRules | null {
  const diffRange = `${baseSha}..${headSha}`;
  const runDiff = (extraArgs: readonly string[]) =>
    runGit(repo.mainRepoPath, [
      '-c',
      'core.quotepath=false',
      '-c',
      'diff.noprefix=false',
      '-c',
      'diff.mnemonicPrefix=false',
      'diff',
      '--no-renames',
      ...extraArgs,
      diffRange,
    ]);

  const statusRes = runDiff(['--name-status', '-z']);
  const numstatRes = runDiff(['--numstat', '-z']);
  const u0Res = runDiff(['-U0', '--no-color']);
  if (!statusRes.ok || !numstatRes.ok || !u0Res.ok) return null;

  const lockSet = fromLockPaths || new Set<string>();
  return {
    changedEntries: parseNameStatusZ(statusRes.stdout).filter((e) => !lockSet.has(e.filePath)),
    binaryPaths: new Set(parseGitNumstatZ(numstatRes.stdout).filter((e) => e.binary).map((e) => e.path)),
    addedLinesByFile: parseDiffAddedLinesWithNumbers(u0Res.stdout),
  };
}

function checkHeaderRule(
  ctx: CodeRulesCheckContext,
  repoCtx: CodeRulesRepoContext,
  filePath: string,
  displayPath: string,
  headLines: readonly string[],
): void {
  const ext = path.posix.extname(filePath).toLowerCase();
  const { rules, findings } = ctx;
  const { repoIndex, requiredHeaderTags } = repoCtx;
  if (!rules.sourceExtensions.has(ext)) return;
  if (
    matchesAnyPathPattern(filePath, rules.headerExempt) ||
    matchesAnyPathPattern(filePath, rules.generatedPaths) ||
    matchesAnyPathPattern(filePath, rules.artifactPatterns)
  ) {
    return;
  }

  const headerSlice = headLines.slice(0, rules.headerLines);
  const missingTags = requiredHeaderTags.filter((tag) => !hasHeaderTag(headerSlice, tag));
  if (missingTags.length > 0) {
    pushFinding(findings, repoIndex, filePath, null, 'header', `header ${displayPath} 缺 ${missingTags.join(', ')}`);
  }
}

function checkBridgeRule(
  ctx: CodeRulesCheckContext,
  repoCtx: CodeRulesRepoContext,
  filePath: string,
  displayPath: string,
  headLines: readonly string[],
): void {
  if (!repoCtx.traits.has('hub')) return;
  for (let idx = 0; idx < headLines.length; idx += 1) {
    const lineNo = idx + 1;
    BRIDGE_ANNOTATION_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BRIDGE_ANNOTATION_RE.exec(headLines[idx])) !== null) {
      const [, targetKey, targetPath, symbol] = match;
      if (!ctx.bridgeTargetHasSymbol(targetKey, targetPath, symbol)) {
        pushFinding(
          ctx.findings,
          repoCtx.repoIndex,
          filePath,
          lineNo,
          'bridge',
          `bridge ${displayPath}:${lineNo} 找不到 ${targetKey}:${targetPath}#${symbol}`,
        );
      }
    }
  }
}

function checkAddedLinesRules(
  ctx: CodeRulesCheckContext,
  repoCtx: CodeRulesRepoContext,
  filePath: string,
  displayPath: string,
  headLines: readonly string[],
  addedLines: readonly AddedLineWithNumber[],
): void {
  if (addedLines.length === 0) return;

  const { rules, findings } = ctx;
  const { repoIndex, wtReal, traits } = repoCtx;
  const activeForbidden = rules.forbiddenPatterns.filter(
    (p) => p.paths === null || matchesAnyPathPattern(filePath, p.paths),
  );
  const isFrontend = traits.has('frontend');
  const isMarkdown = MARKDOWN_EXT_RE.test(filePath);
  const mdFencedLines = isMarkdown ? computeMarkdownFencedLines(headLines) : null;

  for (const { lineNo, text } of addedLines) {
    for (const p of activeForbidden) {
      if (p.regex.test(text)) {
        pushFinding(findings, repoIndex, filePath, lineNo, p.id, `${p.id} ${displayPath}:${lineNo} ${p.message}`);
      }
    }

    if (isFrontend && hasUnescapedHtml(text, rules.escapeFunction)) {
      pushFinding(
        findings,
        repoIndex,
        filePath,
        lineNo,
        'unescaped-html',
        `unescaped-html ${displayPath}:${lineNo} 未跳脫的 HTML 輸出（請使用 ${rules.escapeFunction}(...) 或標註 @escaped）`,
      );
    }

    if (!mdFencedLines || mdFencedLines[lineNo - 1]) continue;
    for (const rawTarget of extractLinkTargets(text)) {
      if (EXTERNAL_OR_ANCHOR_RE.test(rawTarget)) continue;
      const relTarget = rawTarget.split('#')[0];
      if (!relTarget) continue;
      if (!resolveBranchLinkExists(wtReal, filePath, relTarget)) {
        pushFinding(findings, repoIndex, filePath, lineNo, 'link', `link ${displayPath}:${lineNo} 找不到 ${rawTarget}`);
      }
    }
  }
}

function truncateLockLabel(raw: string): string {
  const trimmed = raw.trim();
  const chars = Array.from(trimmed);
  return chars.length > MAX_LOCK_LABEL_LEN ? `${chars.slice(0, MAX_LOCK_LABEL_LEN).join('')}…` : trimmed;
}

function consumePureCommentLine(
  line: string,
  initialState: CommentScanState,
  allowHash: boolean,
  allowDash: boolean,
): { isCommentOnly: boolean; nextState: CommentScanState } {
  let state: CommentScanState = initialState;
  let pos = 0;

  while (pos < line.length) {
    if (state === 'block') {
      const closeIdx = line.indexOf('*/', pos);
      if (closeIdx === -1) return { isCommentOnly: true, nextState: 'block' };
      state = 'none';
      pos = closeIdx + 2;
      continue;
    }
    if (state === 'html') {
      const closeIdx = line.indexOf('-->', pos);
      if (closeIdx === -1) return { isCommentOnly: true, nextState: 'html' };
      state = 'none';
      pos = closeIdx + 3;
      continue;
    }

    while (pos < line.length && /\s/.test(line[pos])) pos += 1;
    if (pos >= line.length) return { isCommentOnly: true, nextState: 'none' };

    const rest = line.slice(pos);
    if (rest.startsWith('//') || (allowHash && rest.startsWith('#')) || (allowDash && rest.startsWith('--'))) {
      return { isCommentOnly: true, nextState: 'none' };
    }
    if (rest.startsWith('/*')) {
      state = 'block';
      pos += 2;
      continue;
    }
    if (rest.startsWith('<!--')) {
      state = 'html';
      pos += 4;
      continue;
    }
    return { isCommentOnly: false, nextState: 'none' };
  }

  return { isCommentOnly: true, nextState: state };
}

function findLockDeclarationIndex(lines: readonly string[], lockLineIdx: number, ext: string): number | null {
  const lockLine = lines[lockLineIdx];
  const lockTrimmed = lockLine.trimStart();
  const allowHash = !NON_HASH_COMMENT_EXTS.has(ext) || lockTrimmed.startsWith('#');
  const allowDash = DASH_COMMENT_EXTS.has(ext) || lockTrimmed.startsWith('--');
  // @why `* @lock` 可能位於已開啟的多行區塊註解內，需先以 block 狀態掃描本行以確認是否續接後續註解行
  const startState: CommentScanState = lockTrimmed.startsWith('*') && !lockTrimmed.startsWith('*/') ? 'block' : 'none';
  let state = consumePureCommentLine(lockLine, startState, allowHash, allowDash).nextState;

  for (let i = lockLineIdx + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '') return null;
    const scanned = consumePureCommentLine(lines[i], state, allowHash, allowDash);
    if (!scanned.isCommentOnly) return i;
    state = scanned.nextState;
  }

  return null;
}

function measureIndentColumns(line: string): number {
  let cols = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === ' ') {
      cols += 1;
    } else if (ch === '\t') {
      cols += 8 - (cols % 8);
    } else {
      break;
    }
  }
  return cols;
}

function findPythonDeclEnd(lines: readonly string[], declIdx: number): number {
  const declIndent = measureIndentColumns(lines[declIdx]);
  let endIdx = declIdx;
  // @why Python 區段結束於第一個縮排不深於宣告行的非空行；僅推進非空行可把段內空行算入、同時避免把段尾分隔空行誤算進範圍
  for (let i = declIdx + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '') continue;
    if (measureIndentColumns(lines[i]) <= declIndent) break;
    endIdx = i;
  }
  return endIdx;
}

function findBracketDeclEnd(lines: readonly string[], declIdx: number, ext: string): number {
  let depth = 0;
  let sawOpen = false;
  let activeQuote: QuoteKind | null = null;

  for (let i = declIdx; i < lines.length; i += 1) {
    const line = lines[i];
    let lastCodeChar = '';

    for (let j = 0; j < line.length; j += 1) {
      const ch = line[j];
      if (activeQuote !== null) {
        if (ch === '\\') {
          j += 1;
          continue;
        }
        if (ch === activeQuote) {
          activeQuote = null;
          lastCodeChar = ch;
        }
        continue;
      }

      if (ch === '/' && line[j + 1] === '/') break;
      if (ch === "'") {
        if (ext === '.rs') {
          // @why Rust 單引號可能是生命週期或標籤（如 `'a`），僅完整字元常數才視為字串略過
          const charMatch = RUST_CHAR_LITERAL_RE.exec(line.slice(j));
          if (charMatch) {
            j += charMatch[0].length - 1;
            lastCodeChar = "'";
          } else {
            lastCodeChar = ch;
          }
          continue;
        }
        activeQuote = "'";
        continue;
      }
      if (ch === '"' || ch === '`') {
        activeQuote = ch;
        continue;
      }
      if (ch === '{' || ch === '[' || ch === '(') {
        depth += 1;
        sawOpen = true;
        lastCodeChar = ch;
        continue;
      }
      if (ch === '}' || ch === ']' || ch === ')') {
        if (depth > 0) depth -= 1;
        lastCodeChar = ch;
        continue;
      }
      if (!/\s/.test(ch)) {
        lastCodeChar = ch;
      }
    }

    // @why 單引號與雙引號字串不跨行（僅反引號樣板／原始字串跨行），可避免未閉合的引號吞掉後續整檔
    if (activeQuote !== '`') activeQuote = null;

    if (activeQuote === null && depth === 0 && (sawOpen || lastCodeChar === ';' || lastCodeChar === ',')) {
      return i;
    }
  }

  return lines.length - 1;
}

function extractLockSegments(lines: readonly string[], ext: string): LockSegment[] {
  const wholeFileText = lines.join('\n');
  const segments: LockSegment[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!LOCK_COMMENT_LINE_RE.test(lines[i])) continue;
    const lockLineKey = lines[i].trim();
    const declIdx = findLockDeclarationIndex(lines, i, ext);
    if (declIdx === null) {
      segments.push({ lockLineKey, declLabel: '整個檔案', text: wholeFileText });
      continue;
    }
    const endIdx = ext === '.py' ? findPythonDeclEnd(lines, declIdx) : findBracketDeclEnd(lines, declIdx, ext);
    segments.push({
      lockLineKey,
      declLabel: truncateLockLabel(lines[declIdx]),
      text: lines.slice(i, endIdx + 1).join('\n'),
    });
  }

  return segments;
}

function checkLockRule(
  ctx: CodeRulesCheckContext,
  repoCtx: CodeRulesRepoContext,
  filePath: string,
  displayPath: string,
  headLines: readonly string[] | null,
): void {
  const ext = path.posix.extname(filePath).toLowerCase();
  const { rules, isMultiRepo, unlockLines, findings } = ctx;
  const { repoIndex, repo, baseSha } = repoCtx;
  if (!rules.sourceExtensions.has(ext) || isFileUnlocked(unlockLines, repo.key, filePath, isMultiRepo)) return;

  const baseText = readGitBlobText(repo.mainRepoPath, baseSha, filePath);
  if (baseText === null) return;
  const baseSegments = extractLockSegments(splitTextLines(baseText), ext);
  if (baseSegments.length === 0) return;

  const headQueuesByKey = new Map<string, LockSegment[]>();
  for (const seg of headLines === null ? [] : extractLockSegments(headLines, ext)) {
    let queue = headQueuesByKey.get(seg.lockLineKey);
    if (!queue) {
      queue = [];
      headQueuesByKey.set(seg.lockLineKey, queue);
    }
    queue.push(seg);
  }

  for (const baseSeg of baseSegments) {
    const headSeg = headQueuesByKey.get(baseSeg.lockLineKey)?.shift();
    if (!headSeg) {
      pushFinding(
        findings,
        repoIndex,
        filePath,
        null,
        'lock',
        `lock ${displayPath} 拿掉了 @lock 標記「${baseSeg.lockLineKey}」但單上沒有 ## 解鎖`,
      );
      continue;
    }
    if (headSeg.text !== baseSeg.text) {
      pushFinding(
        findings,
        repoIndex,
        filePath,
        null,
        'lock',
        `lock ${displayPath} 改到 @lock 範圍「${baseSeg.declLabel}」但單上沒有 ## 解鎖`,
      );
    }
  }
}

function checkSingleChangedFile(
  ctx: CodeRulesCheckContext,
  repoCtx: CodeRulesRepoContext,
  entry: NameStatusEntry,
): void {
  const { status, filePath } = entry;
  const { repoIndex, repo, owns, wtReal, diffData } = repoCtx;
  const { rules, isMultiRepo, findings } = ctx;
  const displayPath = isMultiRepo ? `${repo.key}:${filePath}` : filePath;
  const isDeleted = status === 'D';
  const isAdded = status === 'A';
  const isModified = !isDeleted && !isAdded;

  if (owns !== null && !matchesAnyPathPattern(filePath, owns)) {
    pushFinding(findings, repoIndex, filePath, null, 'owns', `owns ${displayPath} 不在這個倉庫負責的範圍`);
  }

  if (isDeleted) return;

  if (
    isAdded &&
    matchesAnyPathPattern(filePath, rules.artifactPatterns) &&
    !matchesAnyPathPattern(filePath, rules.generatedPaths)
  ) {
    pushFinding(findings, repoIndex, filePath, null, 'artifact', `artifact ${displayPath} 建置產物不進版本控制`);
  }

  if (diffData.binaryPaths.has(filePath)) return;

  const headText = readWorktreeTextFile(wtReal, filePath);
  const headLines = headText === null ? null : splitTextLines(headText);

  if (isModified) {
    checkLockRule(ctx, repoCtx, filePath, displayPath, headLines);
  }

  if (headLines === null) return;

  checkHeaderRule(ctx, repoCtx, filePath, displayPath, headLines);
  checkBridgeRule(ctx, repoCtx, filePath, displayPath, headLines);
  checkAddedLinesRules(ctx, repoCtx, filePath, displayPath, headLines, diffData.addedLinesByFile.get(filePath) || []);
}

/**
 * 執行 S-016 程式規則檢查（供 `task accept` 在暫存工作資料夾驗收時呼叫）。
 * 未設定 `codeRules` 時直接回傳「不適用」，不改變既有專案行為。
 */
export function checkAcceptCodeRules({
  config,
  repos,
  issueBody,
  repoInputs,
}: CheckAcceptCodeRulesOptions): RuleCheckOutcome {
  if (!config || config.codeRules === undefined || config.codeRules === null) {
    return { status: '不適用', passed: true, outputLines: [] };
  }

  const rules = parseCodeRulesConfig(config.codeRules, config);
  const metaByKey = buildRepoMetadataMap(config.repos, repos);
  const ctx: CodeRulesCheckContext = {
    rules,
    isMultiRepo: repos.length > 1,
    unlockLines: parseUnlockLines(issueBody),
    bridgeTargetHasSymbol: createBridgeChecker(metaByKey, repoInputs.filter((r) => r.ok).map((r) => r.repoKey)),
    findings: [],
  };
  let hasRepoError = false;

  for (const input of repoInputs) {
    if (!input.ok || !input.wtPath || !input.baseSha || !input.headSha) {
      hasRepoError = true;
      continue;
    }

    const meta = metaByKey.get(input.repoKey);
    if (!meta) continue;

    const diffData = collectRepoDiffForCodeRules(meta.repo, input.baseSha, input.headSha, input.fromLockPaths);
    if (!diffData) {
      hasRepoError = true;
      continue;
    }

    const isLibrary = meta.traits.has('library');
    const repoCtx: CodeRulesRepoContext = {
      ...meta,
      baseSha: input.baseSha,
      wtReal: fs.realpathSync(input.wtPath),
      diffData,
      requiredHeaderTags:
        isLibrary && !rules.headerTags.includes(LIBRARY_EXTRA_HEADER_TAG)
          ? [...rules.headerTags, LIBRARY_EXTRA_HEADER_TAG]
          : rules.headerTags,
    };

    for (const entry of diffData.changedEntries) {
      checkSingleChangedFile(ctx, repoCtx, entry);
    }
  }

  const sorted = sortFindings(ctx.findings);
  const passed = !hasRepoError && sorted.length === 0;
  return {
    status: passed ? 'PASS' : 'FAIL',
    passed,
    outputLines: sorted.map((f) => f.text),
  };
}
