// @module templates/bin/task/cli/runtime
// @role 通用 task 工具執行期模組：讀取設定、解析遠端倉庫、呼叫 git 與 gh、管理目錄互斥鎖及統計任務分支差異
// @why 將有副作用的外部介面與檔案系統操作集中在執行期模組，讓判斷邏輯單一留在 lib.ts
// @forbid 禁止在此模組重複實作 lib.ts 的純判斷邏輯或寫死特定專案路徑

import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  TaskConfigError,
  countTextFileLines,
  createTaskLib,
  parseExternalDepartments,
  parseGitNumstatZ,
  parsePaginatedJsonArrays,
  parseUnifiedDiffU0Lines,
} from '../lib.ts';
import type {
  ChangedFileEntry,
  CollectIssueDiffSummaryOptions,
  CollectRepoDiffWithLockOptions,
  DirLockOptions,
  ExternalDepartment,
  FileLineWarning,
  GitCommandResult,
  GitHubComment,
  GitHubIssue,
  IssueDiffSummary,
  IssueRepoDiffInfo,
  LockOwnerMeta,
  PathRuleEntry,
  ProjectConfig,
  RepoDiffEntry,
  RepoDiffWithLockResult,
  RuntimeRepo,
  TaskContext,
  TaskLib,
} from '../types.ts';

const SPAWN_MAX_BUFFER = 64 * 1024 * 1024;
const DEFAULT_LOCK_STALE_MS = 10 * 60 * 1000;
const DEFAULT_LOCK_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_LOCK_POLL_MS = 250;
const MAX_POSIX_PID = 0x7fffffff;

/** 用法錯誤（結束代碼 2）。 */
export class CliUsageError extends Error {
  readonly code = 2;

  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

/** 任務執行失敗或被拒絕（結束代碼 1）。 */
export class TaskFailure extends Error {
  readonly code = 1;
  ghDetail?: string;
  nonRetryable?: boolean;

  constructor(message: string, options?: { ghDetail?: string; nonRetryable?: boolean }) {
    super(message);
    this.name = 'TaskFailure';
    if (options?.ghDetail !== undefined) this.ghDetail = options.ghDetail;
    if (options?.nonRetryable !== undefined) this.nonRetryable = options.nonRetryable;
  }
}

export function fail(message: string): never {
  throw new TaskFailure(message);
}

export function usageError(message: string): never {
  throw new CliUsageError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getErrnoCode(err: unknown): string | undefined {
  if (isRecord(err) && typeof err.code === 'string') return err.code;
  return undefined;
}

function isProjectConfigRecord(value: unknown): value is ProjectConfig {
  return isRecord(value) && Array.isArray(value.repos);
}

function isGitHubIssue(value: unknown): value is GitHubIssue {
  return isRecord(value) && !value.pull_request && typeof value.number === 'number' && typeof value.state === 'string';
}

function isGitHubComment(value: unknown): value is GitHubComment {
  return isRecord(value);
}

export function runGit(cwd: string, args: readonly string[]): GitCommandResult {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: SPAWN_MAX_BUFFER,
  });
  return {
    ok: r.status === 0,
    status: r.status ?? 1,
    stdout: (r.stdout || '').trimEnd(),
    stderr: (r.stderr || '').trimEnd(),
  };
}

function getGhBin(): string {
  return process.env.TASK_GH_BIN || 'gh';
}

export function runGh(args: readonly string[], stdinText?: string): string {
  const opts: SpawnSyncOptionsWithStringEncoding = {
    encoding: 'utf8',
    maxBuffer: SPAWN_MAX_BUFFER,
    stdio: stdinText !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  };
  if (stdinText !== undefined) opts.input = stdinText;
  const r = spawnSync(getGhBin(), args, opts);
  if (r.error || r.status !== 0) {
    const detail = r.error ? r.error.message : (r.stderr || r.stdout || `exit ${r.status}`).trim();
    throw new TaskFailure(`呼叫 gh 失敗（${args.join(' ')}）：${detail}`, { ghDetail: detail });
  }
  return r.stdout || '';
}

function findConfigPath(startDir: string): string {
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

/** 從 GitHub remote URL（SSH 或 HTTPS）解析 `owner/name`。 */
export function parseGitHubIssueRepoFromUrl(remoteUrl: string | null | undefined): string | null {
  const text = String(remoteUrl || '').trim();
  const match = /github\.com[:/]([^/\s?#]+\/[^/\s?#]+)/i.exec(text);
  if (!match) return null;
  const cleaned = match[1].replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  return /^[^/\s]+\/[^/\s]+$/.test(cleaned) ? cleaned : null;
}

function resolveIssueRepo(config: ProjectConfig, repos: readonly RuntimeRepo[]): string {
  if (config.issueRepo !== undefined && config.issueRepo !== null) {
    if (typeof config.issueRepo !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(config.issueRepo.trim())) {
      fail(`設定檔的 issueRepo 格式錯誤（應為 owner/name）：${String(config.issueRepo)}`);
    }
    return config.issueRepo.trim();
  }

  const firstRepo = repos[0];
  if (firstRepo && fs.existsSync(firstRepo.mainRepoPath)) {
    const remoteRes = runGit(firstRepo.mainRepoPath, ['remote', 'get-url', 'origin']);
    if (remoteRes.ok) {
      const parsed = parseGitHubIssueRepoFromUrl(remoteRes.stdout);
      if (parsed) return parsed;
    }
  }
  fail('無法決定 GitHub 倉庫：設定檔缺少 issueRepo，且無法從第一個倉庫的 origin 網址解析 owner/name');
}

/** 載入並驗證專案設定，回傳執行期所需的路徑、倉庫清單與 lib 實例。 */
export function loadTaskContext(cwd = process.cwd()): TaskContext {
  const configPath = findConfigPath(cwd);
  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err: unknown) {
    fail(`無法解析設定檔 ${configPath}：${err instanceof Error ? err.message : String(err)}`);
  }

  let lib: TaskLib;
  try {
    lib = createTaskLib(rawConfig);
  } catch (err: unknown) {
    if (err instanceof TaskConfigError) usageError(`設定檔錯誤（${err.code}）：${err.message}`);
    throw err;
  }
  if (!isProjectConfigRecord(rawConfig)) {
    fail(`設定檔格式錯誤：${configPath} 必須是 JSON 物件`);
  }
  const config = rawConfig;

  const configDir = path.dirname(configPath);
  const project =
    typeof config.project === 'string' && config.project.trim()
      ? config.project.trim()
      : lib.repos[0].name;

  const repos: RuntimeRepo[] = lib.repos.map((r) => ({
    ...r,
    mainRepoPath: path.resolve(configDir, r.path),
  }));
  const repoByKey = new Map<string, RuntimeRepo>(repos.map((r) => [r.key, r]));

  const envWtRoot = process.env.TASK_WORKTREE_ROOT;
  const worktreeRoot =
    envWtRoot && envWtRoot.trim()
      ? path.resolve(cwd, envWtRoot.trim())
      : path.join(path.dirname(configDir), `${project}-wt`);

  const branchPattern =
    typeof config.branchPattern === 'string' && config.branchPattern.trim()
      ? config.branchPattern.trim()
      : `task/${project}-{N}`;

  const issueRepo = resolveIssueRepo(config, repos);
  const deptRes = parseExternalDepartments(config.externalDepartments, issueRepo);
  if (!deptRes.ok) {
    fail(deptRes.message);
  }

  return {
    config,
    configPath,
    configDir,
    project,
    issueRepo,
    externalDepartments: deptRes.departments,
    branchPattern,
    worktreeRoot,
    repos,
    repoByKey,
    lib,
  };
}

/** 供不呼叫 loadTaskContext 的指令在讀設定檔時驗證 `externalDepartments`（格式錯誤以 1 結束，不碰 GitHub）。 */
export function validateExternalDepartmentsInConfigFile(cwd = process.cwd()): void {
  let rawConfig: unknown;
  try {
    const configPath = findConfigPath(cwd);
    rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return;
  }
  if (!isRecord(rawConfig) || rawConfig.externalDepartments === undefined) return;
  const issueRepo =
    typeof rawConfig.issueRepo === 'string' && rawConfig.issueRepo.trim()
      ? rawConfig.issueRepo.trim()
      : null;
  const res = parseExternalDepartments(rawConfig.externalDepartments, issueRepo);
  if (!res.ok) {
    fail(res.message);
  }
}

export function resolveExternalDepartment(ctx: TaskContext, deptCode: string): ExternalDepartment {
  const found = ctx.externalDepartments.find((dept) => dept.code === deptCode);
  if (found) return found;
  const codes = ctx.externalDepartments.map((dept) => dept.code);
  const availableText = codes.length > 0 ? `已設定的部門代碼：${codes.join('、')}` : '目前未設定任何 externalDepartments';
  fail(`找不到外部部門「${deptCode}」（${availableText}）`);
}

export function fetchAllIssues(ctx: TaskContext, repo = ctx.issueRepo): GitHubIssue[] {
  const raw = runGh(['api', `repos/${repo}/issues?state=all&per_page=100`, '--paginate']);
  return parsePaginatedJsonArrays(raw).filter(isGitHubIssue);
}

export function fetchSingleIssue(ctx: TaskContext, issueNum: number, repo = ctx.issueRepo): GitHubIssue | null {
  try {
    const raw = runGh(['api', `repos/${repo}/issues/${issueNum}`]);
    const parsed: unknown = JSON.parse(raw);
    if (!isGitHubIssue(parsed)) return null;
    return parsed;
  } catch (err: unknown) {
    const detail =
      err instanceof TaskFailure
        ? err.ghDetail || err.message
        : err instanceof Error
          ? err.message
          : '';
    if (/\b404\b|Not Found/i.test(detail)) return null;
    throw err;
  }
}

export function fetchIssueComments(ctx: TaskContext, issueNum: number, repo = ctx.issueRepo): GitHubComment[] {
  const raw = runGh(['api', `repos/${repo}/issues/${issueNum}/comments?per_page=100`, '--paginate']);
  return parsePaginatedJsonArrays(raw).filter(isGitHubComment);
}

export function addIssueLabel(ctx: TaskContext, issueNum: number, label: string, repo = ctx.issueRepo): void {
  runGh(['api', '-X', 'POST', `repos/${repo}/issues/${issueNum}/labels`, '-f', `labels[]=${label}`]);
}

export function removeIssueLabel(ctx: TaskContext, issueNum: number, label: string, repo = ctx.issueRepo): void {
  runGh([
    'api',
    '-X',
    'DELETE',
    `repos/${repo}/issues/${issueNum}/labels/${encodeURIComponent(label)}`,
  ]);
}

export function postIssueComment(ctx: TaskContext, issueNum: number, body: string, repo = ctx.issueRepo): void {
  runGh(
    ['api', '-X', 'POST', `repos/${repo}/issues/${issueNum}/comments`, '-F', 'body=@-'],
    body,
  );
}

export function createRepoIssue(
  repo: string,
  payload: { title: string; body: string; labels: readonly string[] },
): number {
  const raw = runGh(
    ['api', '-X', 'POST', `repos/${repo}/issues`, '--input', '-'],
    JSON.stringify(payload),
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    fail(`解析 ${repo} 建立單回應失敗：${err instanceof Error ? err.message : String(err)}`);
  }
  const number = isRecord(parsed) ? parsed.number : undefined;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number <= 0) {
    fail(`${repo} 建立單回應缺少有效的單號：${raw}`);
  }
  return number;
}

export function closeRepoIssue(repo: string, issueNum: number): void {
  runGh([
    'api',
    '-X',
    'PATCH',
    `repos/${repo}/issues/${issueNum}`,
    '-f',
    'state=closed',
    '-f',
    'state_reason=completed',
  ]);
}

/** 先加新標籤再拿舊標籤；若拿舊標籤失敗則盡力還原新標籤。 */
export function swapIssueLabels(
  ctx: TaskContext,
  issueNum: number,
  addLabel: string,
  removeLabel: string,
  repo = ctx.issueRepo,
): void {
  addIssueLabel(ctx, issueNum, addLabel, repo);
  try {
    removeIssueLabel(ctx, issueNum, removeLabel, repo);
  } catch (err: unknown) {
    try {
      removeIssueLabel(ctx, issueNum, addLabel, repo);
    } catch {}
    throw err;
  }
}

function getEnvMs(name: string, fallback: number, allowZero = false): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (allowZero ? n >= 0 : n > 0) return n;
  return fallback;
}

function isLocalPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    // @why EPERM 代表程序存在但屬於其他權限上下文，仍視為活著；ESRCH 才表示程序已結束
    return getErrnoCode(err) === 'EPERM';
  }
}

type LockInfoResult =
  | { gone: true }
  | { gone: false; timestampMs: number; ownerAlive: boolean | null; desc: string };

function readLockInfo(lockDir: string): LockInfoResult {
  let meta: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(lockDir, 'owner.json'), 'utf8'));
    if (isRecord(parsed)) {
      meta = parsed;
    }
  } catch {}

  let statMtimeMs: number | null = null;
  try {
    statMtimeMs = fs.statSync(lockDir).mtimeMs;
  } catch (err: unknown) {
    if (getErrnoCode(err) === 'ENOENT') return { gone: true };
  }

  const startedAtMs = meta?.startedAtMs;
  const startedAt = meta?.startedAt;
  const parsedStartedMs =
    typeof startedAtMs === 'number' && Number.isFinite(startedAtMs)
      ? startedAtMs
      : typeof startedAt === 'string' && Number.isFinite(Date.parse(startedAt))
        ? Date.parse(startedAt)
        : null;
  const timestampMs = parsedStartedMs ?? statMtimeMs ?? Date.now();
  const parts: string[] = [];
  if (meta?.issueNum) parts.push(`#${String(meta.issueNum)}`);
  if (meta?.verifier) parts.push(`驗收員 ${String(meta.verifier)}`);
  if (meta?.pid) parts.push(`PID ${String(meta.pid)}`);
  if (typeof startedAt === 'string' && startedAt) parts.push(`開始於 ${startedAt}`);

  const pid = meta?.pid;
  const hasValidPid = typeof pid === 'number' && Number.isInteger(pid) && pid > 0 && pid <= MAX_POSIX_PID;
  const isSameHost = typeof meta?.hostname === 'string' && meta.hostname.length > 0 && meta.hostname === os.hostname();
  // @why 僅在同主機且具合法 PID 時用 kill(0) 判生死；別台機器或舊格式缺乏本機驗證依據，改走殘留時間規則
  const ownerAlive = hasValidPid && isSameHost ? isLocalPidAlive(pid) : null;

  return {
    gone: false,
    timestampMs,
    ownerAlive,
    desc: parts.length > 0 ? `（持有者：${parts.join('，')}）` : '',
  };
}

/**
 * 以不可分割的 mkdir 取得目錄互斥鎖；本機持有者已結束或無從辨識且逾殘留時間才自動清除，逾時則拒絕並保留他人鎖。
 */
export async function acquireDirLock(
  lockDir: string,
  ownerMeta: LockOwnerMeta = {},
  { rejectLabel = '開工鎖', defaultTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS }: DirLockOptions = {},
): Promise<void> {
  const timeoutFallbackMs =
    typeof defaultTimeoutMs === 'number' && Number.isFinite(defaultTimeoutMs) && defaultTimeoutMs >= 0
      ? defaultTimeoutMs
      : DEFAULT_LOCK_TIMEOUT_MS;
  const staleMs = getEnvMs('TASK_LOCK_STALE_MS', DEFAULT_LOCK_STALE_MS);
  const waitTimeoutMs = getEnvMs('TASK_LOCK_TIMEOUT_MS', timeoutFallbackMs, true);
  const pollMs = getEnvMs('TASK_LOCK_POLL_MS', DEFAULT_LOCK_POLL_MS, true);
  const waitStartedAt = Date.now();

  fs.mkdirSync(path.dirname(lockDir), { recursive: true });

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      const nowMs = Date.now();
      const payload = {
        ...ownerMeta,
        pid: process.pid,
        hostname: os.hostname(),
        startedAt: new Date(nowMs).toISOString(),
        startedAtMs: nowMs,
      };
      fs.writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify(payload, null, 2));
      return;
    } catch (err: unknown) {
      const code = getErrnoCode(err);
      if (code === 'ENOENT') {
        fs.mkdirSync(path.dirname(lockDir), { recursive: true });
        continue;
      }
      if (code !== 'EEXIST') {
        const message = err instanceof Error ? err.message : String(err);
        fail(`拒絕操作：建立${rejectLabel}失敗（${lockDir}）：${message}`);
      }
      const info = readLockInfo(lockDir);
      if (info.gone) continue;

      let clearReason: string | null = null;
      if (info.ownerAlive === false) {
        clearReason = `清除持有者已結束的殘留${rejectLabel}`;
      } else if (info.ownerAlive === null && Date.now() - info.timestampMs > staleMs) {
        const staleMin = Math.round(staleMs / 60000);
        clearReason = `清除超過 ${staleMin} 分鐘的殘留${rejectLabel}`;
      }
      if (clearReason) {
        console.log(`${clearReason}：${lockDir}${info.desc}`);
        try {
          fs.rmSync(lockDir, { recursive: true, force: true });
        } catch {}
        continue;
      }

      const elapsedMs = Date.now() - waitStartedAt;
      if (elapsedMs >= waitTimeoutMs) {
        fail(`拒絕操作：${rejectLabel}被佔用，等候逾時（${lockDir}${info.desc}）`);
      }
      const sleepMs = pollMs === 0 ? 10 : Math.min(pollMs, Math.max(1, waitTimeoutMs - elapsedMs));
      await sleep(sleepMs);
    }
  }
}

export function releaseDirLock(lockDir: string): void {
  try {
    fs.rmSync(lockDir, { recursive: true, force: true });
  } catch {}
}

export const DEFAULT_ACCEPTANCE_PATHS = Object.freeze([
  'tests/acceptance/**',
  '**/tests/acceptance/**',
  '**/tests/acceptance_*',
  'fixtures/*/expected/**',
]);

/** 決定性取得 repo 目前可用的基準分支名稱。 */
export function resolveBaseRef(mainRepoPath: string): 'origin/main' | 'main' {
  const hasOriginMain = runGit(mainRepoPath, ['rev-parse', '--verify', '-q', 'refs/remotes/origin/main']).ok;
  return hasOriginMain ? 'origin/main' : 'main';
}

/** 從 issue 內文解析 `鎖定 commit：<sha>`。 */
export function parseLockCommitSha(body: string | null | undefined): string | null {
  if (typeof body !== 'string' || !body) return null;
  for (const rawLine of body.replace(/\r\n/g, '\n').split('\n')) {
    const match = /^\s*(?:[-*•]\s*)?(?:\*\*)?鎖定\s*commit(?:\*\*)?\s*[:：]\s*`?([0-9a-fA-F]{7,40})`?(?=$|[^0-9a-fA-F])/.exec(
      rawLine,
    );
    if (match) return match[1].toLowerCase();
  }
  return null;
}

export function parsePathRuleEntries(
  rawList: unknown,
  defaultPatterns: readonly string[],
  repoByKey: ReadonlyMap<string, RuntimeRepo>,
  fieldName: string,
): PathRuleEntry[] {
  const rules: PathRuleEntry[] = defaultPatterns.map((pattern) => ({ repo: null, pattern }));
  if (rawList === undefined || rawList === null) return rules;
  if (!Array.isArray(rawList)) {
    fail(`設定檔錯誤：${fieldName} 必須是陣列`);
  }
  for (const item of rawList) {
    if (typeof item !== 'string' || !item.trim()) {
      fail(`設定檔錯誤：${fieldName} 項目必須是非空字串`);
    }
    const trimmed = item.trim();
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const prefix = trimmed.slice(0, colonIdx).trim();
      if (repoByKey.has(prefix)) {
        const pattern = trimmed.slice(colonIdx + 1).trim().replace(/^\/+|\/+$/g, '');
        if (!pattern) fail(`設定檔錯誤：${fieldName} 項目路徑樣式為空：${item}`);
        rules.push({ repo: prefix, pattern });
        continue;
      }
    }
    const pattern = trimmed.replace(/^\/+|\/+$/g, '');
    if (!pattern) fail(`設定檔錯誤：${fieldName} 項目路徑樣式為空：${item}`);
    rules.push({ repo: null, pattern });
  }
  return rules;
}

export function fileMatchesPathRules(
  lib: TaskLib,
  rules: readonly PathRuleEntry[],
  repoKey: string,
  filePath: string,
): boolean {
  return rules.some((rule) => {
    if (rule.repo !== null && rule.repo !== repoKey) return false;
    return lib.fileMatchesScopeEntry({ raw: `${repoKey}:${filePath}`, repo: repoKey, pattern: filePath }, { raw: `${repoKey}:${rule.pattern}`, repo: repoKey, pattern: rule.pattern });
  });
}

export function splitNullSeparated(raw: string | null | undefined): string[] {
  return String(raw || '').split('\0').filter(Boolean);
}

export function resolveCommitInRepo(mainRepoPath: string, sha: string | null | undefined): string | null {
  if (!sha) return null;
  let res = runGit(mainRepoPath, ['rev-parse', '--verify', '-q', `${sha}^{commit}`]);
  if (!res.ok && /^[0-9a-f]{40}$/.test(sha)) {
    runGit(mainRepoPath, ['fetch', '-q', 'origin', sha]);
    res = runGit(mainRepoPath, ['rev-parse', '--verify', '-q', `${sha}^{commit}`]);
  }
  return res.ok ? res.stdout.trim() : null;
}

export function resolveMergeBase(
  mainRepoPath: string,
  commitA: string | null | undefined,
  commitB: string | null | undefined,
): string | null {
  if (!commitA || !commitB) return null;
  const res = runGit(mainRepoPath, ['merge-base', commitA, commitB]);
  return res.ok ? res.stdout.trim() : null;
}

export function isFileUnchangedBetween(
  mainRepoPath: string,
  commitA: string,
  commitB: string,
  filePath: string,
): boolean {
  return runGit(mainRepoPath, ['diff', '--quiet', commitA, commitB, '--', filePath]).ok;
}

/**
 * 判斷檔案在分支 commit 是否與單上鎖定 commit 內容完全相同。
 * @why 讓 task accept 與 submit／scope-check 共用同一套鎖定檔判定，避免鎖定測試放在任務分支時誤擋交件。
 */
export function isFileSameAsLockCommit(
  mainRepoPath: string,
  lockFullSha: string | null,
  headSha: string,
  filePath: string,
): boolean {
  if (!lockFullSha) return false;
  if (!runGit(mainRepoPath, ['cat-file', '-e', `${lockFullSha}:${filePath}`]).ok) return false;
  return isFileUnchangedBetween(mainRepoPath, lockFullSha, headSha, filePath);
}

/**
 * 判斷鎖定 commit 中的驗收檔是否在分歧點之後於 origin/main 更新過，且分支內容與 origin/main 一致。
 * @why 避免規劃者鎖定後又在 main 更新驗收檔時誤判為實作者改動，
 *      同時防止分支把驗收檔還原為鎖定前舊版或刪除分支新增的鎖定檔。
 */
export function isFileSameAsUpdatedMain(
  mainRepoPath: string,
  lockMainBaseSha: string | null,
  originMainSha: string | null,
  headSha: string,
  filePath: string,
): boolean {
  if (!originMainSha) return false;
  if (lockMainBaseSha) {
    if (lockMainBaseSha === originMainSha || isFileUnchangedBetween(mainRepoPath, lockMainBaseSha, originMainSha, filePath)) {
      return false;
    }
  } else if (!runGit(mainRepoPath, ['cat-file', '-e', `${originMainSha}:${filePath}`]).ok) {
    return false;
  }
  return isFileUnchangedBetween(mainRepoPath, originMainSha, headSha, filePath);
}

export function listLockedAcceptanceFiles(
  lib: TaskLib,
  acceptanceRules: readonly PathRuleEntry[],
  repo: RuntimeRepo,
  lockFullSha: string | null,
): string[] {
  if (!lockFullSha) return [];
  const lsTreeRes = runGit(repo.mainRepoPath, [
    '-c',
    'core.quotepath=false',
    'ls-tree',
    '-r',
    '--name-only',
    '-z',
    lockFullSha,
  ]);
  const allLockFiles = lsTreeRes.ok ? splitNullSeparated(lsTreeRes.stdout) : [];
  return allLockFiles.filter((f) => fileMatchesPathRules(lib, acceptanceRules, repo.key, f));
}

/**
 * 讀取單一倉庫在指定 diff 範圍內的變更檔與增刪統計，並依鎖定 commit 排除未改動的鎖定檔。
 * @why 讓 accept、scope-check 與 submit 共用同一套「和鎖定 commit 相同不算變更／範圍外」的過濾邏輯。
 */
export function collectRepoDiffWithLock({
  lib,
  repo,
  diffRange,
  headSha,
  originMainSha,
  lockSha,
  acceptanceRules,
}: CollectRepoDiffWithLockOptions): RepoDiffWithLockResult {
  let repoLockFullSha: string | null = null;
  let lockMainBaseSha: string | null = null;
  let lockedAcceptanceFiles: string[] = [];
  if (lockSha) {
    repoLockFullSha = resolveCommitInRepo(repo.mainRepoPath, lockSha);
    if (repoLockFullSha) {
      lockMainBaseSha = originMainSha ? resolveMergeBase(repo.mainRepoPath, repoLockFullSha, originMainSha) : null;
      lockedAcceptanceFiles = acceptanceRules
        ? listLockedAcceptanceFiles(lib, acceptanceRules, repo, repoLockFullSha)
        : [];
    }
  }
  const lockedAcceptanceSet = new Set(lockedAcceptanceFiles);

  const nameRes = runGit(repo.mainRepoPath, ['-c', 'core.quotepath=false', 'diff', '--name-only', '-z', diffRange]);
  if (!nameRes.ok) {
    return { ok: false, errorKind: 'name', errorDetail: nameRes.stderr || nameRes.stdout };
  }

  const numstatRes = runGit(repo.mainRepoPath, [
    '-c',
    'core.quotepath=false',
    'diff',
    '--numstat',
    '-M',
    '-z',
    diffRange,
  ]);
  if (!numstatRes.ok) {
    return { ok: false, errorKind: 'numstat', errorDetail: numstatRes.stderr || numstatRes.stdout };
  }

  const u0Res = runGit(repo.mainRepoPath, ['-c', 'core.quotepath=false', 'diff', '-M', '-U0', '--no-color', diffRange]);
  if (!u0Res.ok) {
    return { ok: false, errorKind: 'u0', errorDetail: u0Res.stderr || u0Res.stdout };
  }

  const rawChangedPaths = splitNullSeparated(nameRes.stdout);
  const fromLockPaths = new Set<string>();
  const changedFiles: ChangedFileEntry[] = [];
  for (const filePath of rawChangedPaths) {
    // @why 鎖定 commit 疊在實作 commit 之上時，只有驗收測試或鎖定時內容就與基準分支相同的檔案才算從鎖定來的
    const unchangedFromLock =
      isFileSameAsLockCommit(repo.mainRepoPath, repoLockFullSha, headSha, filePath) &&
      (lockedAcceptanceSet.has(filePath) ||
        (repoLockFullSha !== null &&
          originMainSha !== null &&
          isFileUnchangedBetween(repo.mainRepoPath, repoLockFullSha, originMainSha, filePath)));
    const unchangedFromUpdatedMain =
      Boolean(originMainSha) &&
      lockedAcceptanceSet.has(filePath) &&
      isFileSameAsUpdatedMain(repo.mainRepoPath, lockMainBaseSha, originMainSha, headSha, filePath);
    if (unchangedFromLock || unchangedFromUpdatedMain) {
      fromLockPaths.add(filePath);
      continue;
    }
    changedFiles.push({
      repo: repo.key,
      repoName: repo.name,
      pattern: filePath,
      raw: `${repo.key}:${filePath}`,
    });
  }

  const numstatEntries = parseGitNumstatZ(numstatRes.stdout).filter((e) => !fromLockPaths.has(e.path));
  const diffByFile = parseUnifiedDiffU0Lines(u0Res.stdout);
  for (const lockedPath of fromLockPaths) {
    diffByFile.addedByFile.delete(lockedPath);
    diffByFile.deletedByFile.delete(lockedPath);
  }

  return {
    ok: true,
    repoLockFullSha,
    lockMainBaseSha,
    lockedAcceptanceFiles,
    fromLockPaths,
    changedFiles,
    numstatEntries,
    diffByFile,
  };
}

/**
 * 統計任務分支相對於基準分支的變更檔、業務程式新增行數、單檔軟上限警告與各倉 merge-base／HEAD／鎖定檔集合。
 * @why 讓 scope-check、submit 與交件前檢查共用同一套 git diff 取樣與 lib.ts 行數計算邏輯，避免重複計算。
 */
export function collectIssueDiffSummary(
  ctx: TaskContext,
  {
    targetBody = '',
    branchName,
    taskDir,
    checkSoftLineLimit = false,
  }: CollectIssueDiffSummaryOptions,
): IssueDiffSummary {
  const changedFiles: ChangedFileEntry[] = [];
  const repoDiffEntries: RepoDiffEntry[] = [];
  const fileLineWarnings: FileLineWarning[] = [];
  const repoDiffs: IssueRepoDiffInfo[] = [];
  let checkedBranches = 0;

  const lockSha = parseLockCommitSha(targetBody);
  const acceptanceRules = lockSha
    ? parsePathRuleEntries(ctx.config?.acceptancePaths, DEFAULT_ACCEPTANCE_PATHS, ctx.repoByKey, 'acceptancePaths')
    : null;

  for (const repo of ctx.repos) {
    if (!fs.existsSync(repo.mainRepoPath)) continue;

    const wtPath = path.join(taskDir, repo.name);
    const hasLocalBranch = runGit(repo.mainRepoPath, ['rev-parse', '--verify', '-q', `refs/heads/${branchName}`]).ok;
    const hasRemoteBranch = runGit(repo.mainRepoPath, ['rev-parse', '--verify', '-q', `refs/remotes/origin/${branchName}`]).ok;

    // 工作資料夾的本機分支優先，其次遠端分支
    let targetRef: string | null = null;
    if (fs.existsSync(wtPath) && hasLocalBranch) {
      targetRef = `refs/heads/${branchName}`;
    } else if (hasRemoteBranch) {
      targetRef = `refs/remotes/origin/${branchName}`;
    } else if (hasLocalBranch) {
      targetRef = `refs/heads/${branchName}`;
    }
    if (!targetRef) continue;

    const headRes = runGit(repo.mainRepoPath, ['rev-parse', '--verify', '-q', `${targetRef}^{commit}`]);
    if (!headRes.ok) {
      fail(`無法讀取 ${repo.name} 的 ${targetRef} commit：${headRes.stderr || headRes.stdout}`);
    }
    const headSha = headRes.stdout.trim();

    const baseRef = resolveBaseRef(repo.mainRepoPath);
    const baseMainRef = baseRef === 'origin/main' ? 'refs/remotes/origin/main' : 'refs/heads/main';
    const baseMainRes = runGit(repo.mainRepoPath, ['rev-parse', '--verify', '-q', `${baseMainRef}^{commit}`]);
    const originMainSha = baseMainRes.ok ? baseMainRes.stdout.trim() : null;
    const baseSha = resolveMergeBase(repo.mainRepoPath, originMainSha, headSha);

    const diffRange = baseSha ? `${baseSha}..${headSha}` : `${baseRef}...${targetRef}`;
    const diffResult = collectRepoDiffWithLock({
      lib: ctx.lib,
      repo,
      diffRange,
      headSha,
      originMainSha,
      lockSha,
      acceptanceRules,
    });
    if (!diffResult.ok) {
      const errorLabel =
        diffResult.errorKind === 'numstat'
          ? `統計 ${repo.name} 的變更行數失敗`
          : diffResult.errorKind === 'u0'
            ? `比對 ${repo.name} 的搬移內容失敗`
            : `比對 ${repo.name} 的 ${targetRef} 與 ${baseRef} 失敗`;
      fail(`${errorLabel}：${diffResult.errorDetail}`);
    }
    checkedBranches += 1;

    repoDiffs.push({
      repo,
      baseSha,
      headSha,
      wtPath: fs.existsSync(wtPath) ? wtPath : null,
      fromLockPaths: diffResult.fromLockPaths,
    });

    repoDiffEntries.push({
      repo: repo.key,
      numstatEntries: diffResult.numstatEntries,
      diffByFile: diffResult.diffByFile,
    });

    const binaryPaths = new Set(diffResult.numstatEntries.filter((e) => e.binary).map((e) => e.path));
    for (const fileEntry of diffResult.changedFiles) {
      changedFiles.push(fileEntry);
      const filePath = fileEntry.pattern;
      if (checkSoftLineLimit && !binaryPaths.has(filePath) && !ctx.lib.isExcludedFromBusinessLineCount(filePath)) {
        const showRes = runGit(repo.mainRepoPath, ['cat-file', '-p', `${headSha}:${filePath}`]);
        if (showRes.ok && !showRes.stdout.includes('\0')) {
          const lineCount = countTextFileLines(showRes.stdout);
          if (lineCount > ctx.lib.softFileLineLimit) {
            fileLineWarnings.push({ raw: fileEntry.raw, lineCount });
          }
        }
      }
    }
  }

  const lineLimit = targetBody ? ctx.lib.parseBusinessLineLimit(targetBody) : null;
  const lineCheck = ctx.lib.analyzeBusinessAddedLines({
    repoEntries: repoDiffEntries,
    limitOverride: lineLimit,
  });

  return { checkedBranches, changedFiles, fileLineWarnings, lineCheck, repoDiffs };
}
