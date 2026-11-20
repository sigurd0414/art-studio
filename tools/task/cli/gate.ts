// @module templates/bin/task/cli/gate
// @role 通用 task 工具的門檻區域檢查模組：解析 gatedPaths 例外寫法、實作不連 GitHub 的 gate-check 與 task accept 門檻區域驗收檢查
// @why 將門檻路徑比對與例外規則集中在單一模組，讓本地提交掛鉤與驗收證據包共用同一套判斷邏輯，避免專案重複維護清單
// @forbid 禁止在此模組寫入檔案、呼叫 gh、連網或針對特定專案與測試資料寫死特例

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { extractSection, segmentListsOverlap } from '../lib.ts';
import type { AcceptRepoResult, RepoEntry, RuntimeRepo } from '../types.ts';
import {
  compareCodeUnit,
  escapeRegExp,
  isPlainObject,
  normalizePattern,
  parseNameStatusZ,
  resolveComparablePath,
} from './docs.ts';
import { findConfigPath } from './kitcheck.ts';
import { fail, parseLockCommitSha, runGit, splitNullSeparated, usageError } from './runtime.ts';

const GATE_USAGE =
  '用法：node task.mjs gate-check [--staged | --range <基準>..<目標>] [--repo <name>] [--commit-msg <檔案>]';
const REPO_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type GateChangeOn = 'add' | 'any';
export type GateChangeType = 'add' | 'delete' | 'modify';

export interface GateRule {
  negated: boolean;
  repoKey: string | null;
  on: GateChangeOn;
  variants: string[][];
}

export interface GateAcceptCheckResult {
  status: string;
  passed: boolean;
}

export interface CheckAcceptGateOptions {
  gateRules: readonly GateRule[];
  project: string;
  issueNum: number;
  issueBody: string | null | undefined;
  repoResults: readonly AcceptRepoResult[];
}

interface GateCheckParsedArgs {
  range: string | null;
  repo: string | null;
  commitMsg: string | null;
}

interface GateConfigData {
  project: string;
  repos: RuntimeRepo[];
  gateRules: GateRule[];
}

interface GateDiffResult {
  ok: boolean;
  errorDetail: string;
  gatedPaths: string[];
}

interface RepoGatedEntry {
  repo: RuntimeRepo;
  baseSha: string;
  headSha: string;
  gatedPaths: string[];
}

function findRepoByIdentifier<T extends RepoEntry>(repos: readonly T[], id: string): T | null {
  return repos.find((r) => r.name === id) || repos.find((r) => r.key === id) || null;
}

// 將門檻樣式編譯成供 segmentListsOverlap 使用的分段變體。
// @why 結尾帶 `/`（如 `crates/*/`、`specs/`）只代表目錄底下檔案；無 `*` 且無 `/` 結尾則相容單檔與同名目錄。
function compileGatePatternVariants(rawPattern: string, idx: number, rawPath: string): string[][] {
  const normalized = rawPattern.replace(/\\/g, '/').replace(/^(?:\.\/|\/)+/, '');
  const endsWithSlash = normalized.endsWith('/');
  const clean = normalized.replace(/\/+$/, '');
  const segs = clean.split('/').filter(Boolean);
  if (!clean || segs.length === 0) {
    usageError(`設定檔錯誤：gatedPaths[${idx}] 路徑樣式為空（${rawPath}）`);
  }

  if (endsWithSlash) {
    return [[...segs, '*', '**']];
  }
  if (clean.includes('*')) {
    return [segs];
  }
  return [segs, [...segs, '*', '**']];
}

function parseSingleGateEntry(rawItem: unknown, idx: number, repos: readonly RepoEntry[]): GateRule {
  let rawPath: unknown;
  let on: GateChangeOn = 'any';

  if (typeof rawItem === 'string') {
    rawPath = rawItem;
  } else if (isPlainObject(rawItem)) {
    rawPath = rawItem.path;
    if (rawItem.on !== undefined) {
      if (rawItem.on !== 'add' && rawItem.on !== 'any') {
        usageError(`設定檔錯誤：gatedPaths[${idx}].on 只接受 "add" 或 "any"（收到「${String(rawItem.on)}」）`);
      }
      on = rawItem.on;
    }
  } else {
    usageError(`設定檔錯誤：gatedPaths[${idx}] 必須是字串或物件`);
  }

  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    usageError(`設定檔錯誤：gatedPaths[${idx}] 的 path 不可為空`);
  }

  let rest = rawPath.trim();
  const negated = rest.startsWith('!');
  if (negated) {
    rest = rest.slice(1).trim();
  }
  if (!rest) {
    usageError(`設定檔錯誤：gatedPaths[${idx}] 路徑樣式為空（${rawPath}）`);
  }

  let repoKey: string | null = null;
  let rawPattern = rest;
  const colonIdx = rest.indexOf(':');
  if (colonIdx !== -1) {
    const repoPrefix = rest.slice(0, colonIdx).trim();
    const matchedRepo = findRepoByIdentifier(repos, repoPrefix);
    if (!repoPrefix || !matchedRepo) {
      usageError(`設定檔錯誤：gatedPaths[${idx}] 的倉庫前綴「${repoPrefix}」不在 repos[] 中（${rawPath}）`);
    }
    repoKey = matchedRepo.key;
    rawPattern = rest.slice(colonIdx + 1).trim();
  }

  const variants = compileGatePatternVariants(rawPattern, idx, rawPath);
  return { negated, repoKey, on, variants };
}

/** 解析並驗證 `project.config.json` 的 `gatedPaths` 設定，失敗時拋出結束代碼 2 的用法錯誤。 */
export function parseGatedPaths(rawGatedPaths: unknown, repos: readonly RepoEntry[]): GateRule[] {
  if (rawGatedPaths === undefined || rawGatedPaths === null) return [];
  if (!Array.isArray(rawGatedPaths)) {
    usageError('設定檔錯誤：gatedPaths 必須是陣列');
  }
  return rawGatedPaths.map((item, idx) => parseSingleGateEntry(item, idx, repos));
}

function statusToChangeType(status: string): GateChangeType {
  if (status === 'A') return 'add';
  if (status === 'D') return 'delete';
  return 'modify';
}

function ruleMatchesEntry(
  rule: GateRule,
  repoKey: string,
  fileSegs: readonly string[],
  changeType: GateChangeType,
): boolean {
  if (rule.repoKey !== null && rule.repoKey !== repoKey) return false;
  if (rule.on !== 'any' && rule.on !== changeType) return false;
  return rule.variants.some((patSegs) => segmentListsOverlap(fileSegs, patSegs));
}

function evaluateGateChange(
  gateRules: readonly GateRule[],
  repoKey: string,
  filePath: string,
  changeType: GateChangeType,
): boolean {
  const fileSegs = normalizePattern(filePath).split('/').filter(Boolean);
  if (fileSegs.length === 0) return false;
  const included = gateRules.some((r) => !r.negated && ruleMatchesEntry(r, repoKey, fileSegs, changeType));
  if (!included) return false;
  return !gateRules.some((r) => r.negated && ruleMatchesEntry(r, repoKey, fileSegs, changeType));
}

function collectGatedFilesFromDiff(
  repoDir: string,
  repoKey: string,
  diffArgs: readonly string[],
  gateRules: readonly GateRule[],
  lockSet: ReadonlySet<string> | null = null,
): GateDiffResult {
  const res = runGit(repoDir, ['-c', 'core.quotepath=false', 'diff', '--no-renames', '--name-status', '-z', ...diffArgs]);
  if (!res.ok) {
    return { ok: false, errorDetail: res.stderr || res.stdout || '未知錯誤', gatedPaths: [] };
  }
  const gatedSet = new Set<string>();
  for (const entry of parseNameStatusZ(res.stdout)) {
    if (lockSet && lockSet.has(entry.filePath)) continue;
    if (evaluateGateChange(gateRules, repoKey, entry.filePath, statusToChangeType(entry.status))) {
      gatedSet.add(entry.filePath);
    }
  }
  return { ok: true, errorDetail: '', gatedPaths: [...gatedSet].sort(compareCodeUnit) };
}

function getCommitNonCommentLines(msgText: string): string[] {
  return String(msgText || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'));
}

function isGateBypassSubject(msgText: string): boolean {
  const nonComment = getCommitNonCommentLines(msgText);
  const subject = (nonComment.find((line) => line.trim() !== '') || '').trimStart();
  return /^(?:hotfix:|Merge(?=$|[\s:])|Revert(?=$|[\s:]))/.test(subject);
}

function hasCommitRefs(msgText: string, project: string, issueNum: number | null = null): boolean {
  const nonComment = getCommitNonCommentLines(msgText);
  const issuePattern = issueNum !== null ? String(issueNum) : '[1-9]\\d*';
  const re = new RegExp(
    `^\\s*Refs:\\s*(?:[^\\n]*[\\s,，;；])?${escapeRegExp(project)}#${issuePattern}(?=$|[\\s,，;；.)）])`,
  );
  return nonComment.some((line) => re.test(line));
}

function parseGateCheckArgs(argv: readonly string[]): GateCheckParsedArgs {
  let values: {
    staged?: boolean;
    range?: string;
    repo?: string;
    'commit-msg'?: string;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        staged: { type: 'boolean', default: false },
        range: { type: 'string' },
        repo: { type: 'string' },
        'commit-msg': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err: unknown) {
    usageError(`用法錯誤：${err instanceof Error ? err.message : String(err)}\n${GATE_USAGE}`);
  }

  if (values.staged && values.range !== undefined) {
    usageError(`用法錯誤：--staged 與 --range 不可同時使用\n${GATE_USAGE}`);
  }

  let range: string | null = null;
  if (values.range !== undefined) {
    range = values.range.trim();
    const dotsIdx = range.indexOf('..');
    if (!range || dotsIdx <= 0 || range.endsWith('..')) {
      usageError(`用法錯誤：--range 格式必須為 <基準>..<目標>（收到「${values.range}」）\n${GATE_USAGE}`);
    }
  }

  let repo: string | null = null;
  if (values.repo !== undefined) {
    repo = values.repo.trim();
    if (!repo) {
      usageError(`用法錯誤：--repo 不可為空\n${GATE_USAGE}`);
    }
  }

  let commitMsg: string | null = null;
  if (values['commit-msg'] !== undefined) {
    commitMsg = values['commit-msg'].trim();
    if (!commitMsg) {
      usageError(`用法錯誤：--commit-msg 不可為空\n${GATE_USAGE}`);
    }
  }

  return { range, repo, commitMsg };
}

function loadGateConfig(cwd: string): GateConfigData {
  const configPath = findConfigPath(cwd);
  const configDir = path.dirname(configPath);
  let config: unknown;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err: unknown) {
    fail(`無法解析設定檔 ${configPath}：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isPlainObject(config)) {
    usageError(`設定檔格式錯誤：${path.basename(configPath)} 必須是 JSON 物件`);
  }
  if (!Array.isArray(config.repos) || config.repos.length === 0) {
    usageError('設定檔缺少至少一個倉庫（repos）');
  }

  const repos: RuntimeRepo[] = [];
  const seenKeys = new Set<string>();
  for (const item of config.repos) {
    if (!isPlainObject(item)) {
      usageError('設定檔錯誤：repos 項目必須是物件');
    }
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const key = item.key !== undefined && item.key !== null ? String(item.key).trim() : name;
    if (!REPO_KEY_RE.test(key)) {
      usageError(`設定檔錯誤：倉庫代號「${key}」格式不合法`);
    }
    if (seenKeys.has(key)) {
      usageError(`設定檔錯誤：倉庫代號「${key}」重複`);
    }
    seenKeys.add(key);
    const relPath = typeof item.path === 'string' && item.path.trim() ? item.path.trim() : '.';
    repos.push({
      key,
      name: name || key,
      path: relPath,
      mainRepoPath: path.resolve(configDir, relPath),
    });
  }

  const project =
    typeof config.project === 'string' && config.project.trim()
      ? config.project.trim()
      : repos[0].name;
  const gateRules = parseGatedPaths(config.gatedPaths, repos);
  return { project, repos, gateRules };
}

function resolveGitCommonDir(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const res = runGit(dir, ['rev-parse', '--git-common-dir']);
  if (!res.ok) return null;
  return resolveComparablePath(path.resolve(dir, res.stdout.trim()));
}

function resolveTargetRepo(
  cwd: string,
  repos: readonly RuntimeRepo[],
  repoArg: string | null,
): { repo: RuntimeRepo; gitDir: string } {
  if (repoArg !== null) {
    const matched = findRepoByIdentifier(repos, repoArg);
    if (!matched) {
      usageError(`找不到指定的倉庫「${repoArg}」`);
    }
    if (!fs.existsSync(matched.mainRepoPath) || !runGit(matched.mainRepoPath, ['rev-parse', '--git-dir']).ok) {
      usageError(`倉庫資料夾無效或不是 Git 倉庫：${matched.mainRepoPath}`);
    }
    return { repo: matched, gitDir: matched.mainRepoPath };
  }

  const topRes = runGit(cwd, ['rev-parse', '--show-toplevel']);
  if (!topRes.ok) {
    usageError('目前所在資料夾不是 Git 倉庫，且未指定 --repo');
  }
  const topReal = resolveComparablePath(topRes.stdout.trim());

  const byRoot = repos.find((r) => resolveComparablePath(r.mainRepoPath) === topReal);
  if (byRoot) {
    return { repo: byRoot, gitDir: topReal };
  }

  // @why 在獨立 worktree 內執行 gate-check 時，--show-toplevel 會指向 worktree 而非主倉庫，需以共用 git 目錄對應 repos[]
  const cwdCommon = resolveGitCommonDir(topReal);
  if (cwdCommon) {
    const byCommon = repos.find((r) => resolveGitCommonDir(r.mainRepoPath) === cwdCommon);
    if (byCommon) {
      return { repo: byCommon, gitDir: topReal };
    }
  }

  usageError(`目前倉庫（${topReal}）不在設定檔的 repos[] 中`);
}

/** 執行 `task gate-check`：在本機不連 GitHub 檢查已暫存或指定區間是否改到門檻區域。 */
export function cmdGateCheck(cwd = process.cwd(), argv: readonly string[] = []): number {
  const { range, repo: repoArg, commitMsg } = parseGateCheckArgs(argv);
  const { project, repos, gateRules } = loadGateConfig(cwd);
  const { repo, gitDir } = resolveTargetRepo(cwd, repos, repoArg);

  let commitMsgText: string | null = null;
  if (commitMsg !== null) {
    const resolvedMsgPath = path.resolve(cwd, commitMsg);
    if (!fs.existsSync(resolvedMsgPath) || !fs.statSync(resolvedMsgPath).isFile()) {
      usageError(`找不到提交訊息檔案：${resolvedMsgPath}`);
    }
    commitMsgText = fs.readFileSync(resolvedMsgPath, 'utf8');
  }

  const diffArgs = range !== null ? [range] : ['--cached'];
  const diffRes = collectGatedFilesFromDiff(gitDir, repo.key, diffArgs, gateRules);
  if (!diffRes.ok) {
    fail(`比對 git 差異失敗：${diffRes.errorDetail}`);
  }

  if (diffRes.gatedPaths.length === 0) {
    console.log('GATE_CLEAR');
    return 0;
  }

  for (const filePath of diffRes.gatedPaths) {
    console.log(`GATED ${repo.name}:${filePath}`);
  }

  if (commitMsgText !== null && !isGateBypassSubject(commitMsgText) && !hasCommitRefs(commitMsgText, project)) {
    fail(`❌ 改到門檻區域，提交訊息要帶 Refs: ${project}#<單號>（急修的主旨用 hotfix: 開頭，隔天補單）`);
  }

  return 0;
}

function isNoLockedFilesSection(section: string): boolean {
  const trimmed = String(section || '').trim();
  if (!trimmed) return false;
  return trimmed.startsWith('無') || /^[-*•]\s*`?無(?=$|[\s。，,（(：:`])/.test(trimmed);
}

function findMissingRefsCommits(
  repo: RuntimeRepo,
  baseSha: string,
  headSha: string,
  gatedSet: ReadonlySet<string>,
  project: string,
  issueNum: number,
): { ok: boolean; missing: string[] } {
  const revRes = runGit(repo.mainRepoPath, ['rev-list', '--reverse', `${baseSha}..${headSha}`]);
  if (!revRes.ok) return { ok: false, missing: [] };

  const shas = revRes.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const missing: string[] = [];

  for (const fullSha of shas) {
    // @why 加上 -c 僅列出合併提交本身額外改動的路徑，避免把乾淨合入 origin/main 帶來的檔案算到任務分支頭上
    const dtRes = runGit(repo.mainRepoPath, [
      '-c',
      'core.quotepath=false',
      'diff-tree',
      '-c',
      '--no-commit-id',
      '--name-only',
      '-r',
      '--no-renames',
      '--root',
      '-z',
      fullSha,
    ]);
    if (!dtRes.ok) return { ok: false, missing: [] };

    const touched = splitNullSeparated(dtRes.stdout).map(normalizePattern).filter(Boolean);
    if (!touched.some((p) => gatedSet.has(p))) continue;

    const msgRes = runGit(repo.mainRepoPath, ['log', '-1', '--format=%B', fullSha]);
    if (!msgRes.ok) return { ok: false, missing: [] };

    if (!hasCommitRefs(msgRes.stdout, project, issueNum)) {
      missing.push(fullSha.slice(0, 7));
    }
  }

  return { ok: true, missing };
}

/**
 * 供 `task accept` 執行 S-028 門檻區域檢查，回傳證據包「門檻區域」列的狀態文字與通過與否。
 */
export function checkAcceptGate({
  gateRules,
  project,
  issueNum,
  issueBody,
  repoResults,
}: CheckAcceptGateOptions): GateAcceptCheckResult {
  if (!Array.isArray(gateRules) || !gateRules.some((r) => !r.negated)) {
    return { status: '不適用', passed: true };
  }

  if (!Array.isArray(repoResults) || repoResults.some((r) => !r.ok || !r.baseSha || !r.headSha)) {
    return { status: 'FAIL（無法讀取任務分支差異）', passed: false };
  }

  const repoGatedList: RepoGatedEntry[] = [];
  let totalGatedCount = 0;

  for (const r of repoResults) {
    if (!r.baseSha || !r.headSha) {
      return { status: 'FAIL（無法讀取任務分支差異）', passed: false };
    }
    const diffRes = collectGatedFilesFromDiff(
      r.repo.mainRepoPath,
      r.repo.key,
      [`${r.baseSha}..${r.headSha}`],
      gateRules,
      r.fromLockPaths || null,
    );
    if (!diffRes.ok) {
      return { status: 'FAIL（讀取變更清單失敗）', passed: false };
    }
    if (diffRes.gatedPaths.length > 0) {
      totalGatedCount += diffRes.gatedPaths.length;
      repoGatedList.push({ repo: r.repo, baseSha: r.baseSha, headSha: r.headSha, gatedPaths: diffRes.gatedPaths });
    }
  }

  if (totalGatedCount === 0) {
    return { status: '不適用', passed: true };
  }

  const reasons: string[] = [];
  const acceptSection = extractSection(issueBody, '驗收條件');
  if (acceptSection === null || !acceptSection.trim()) {
    reasons.push('沒有驗收條件');
  }

  const lockSha = parseLockCommitSha(issueBody);
  const lockedSection = extractSection(issueBody, '鎖定的檔案');
  const hasNoLockNote = lockedSection !== null && isNoLockedFilesSection(lockedSection);
  if (!lockSha && !hasNoLockNote) {
    reasons.push('沒有鎖定 commit（或 ## 鎖定的檔案 未寫無）');
  }

  for (const item of repoGatedList) {
    const commitCheck = findMissingRefsCommits(
      item.repo,
      item.baseSha,
      item.headSha,
      new Set(item.gatedPaths),
      project,
      issueNum,
    );
    if (!commitCheck.ok) {
      return { status: 'FAIL（讀取任務分支提交紀錄失敗）', passed: false };
    }
    for (const shortSha of commitCheck.missing) {
      reasons.push(`提交 ${shortSha} 沒有 Refs: ${project}#${issueNum}`);
    }
  }

  if (reasons.length === 0) {
    return { status: `PASS（${totalGatedCount} 個檔案）`, passed: true };
  }
  return { status: `FAIL（${reasons.join('；')}）`, passed: false };
}
