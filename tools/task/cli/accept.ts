// @module templates/bin/task/cli/accept
// @role 通用 task 工具的驗收指令模組：實作 task accept（檢查影響範圍、規則檔保護、鎖定 commit、業務程式行數、單檔行數與執行驗收指令並產出證據包）
// @why 將專案無關的本地驗收與證據包產出整合為單一命令，避免實作者與驗收員混同並確保暫存工作區與逾時程序完全清除
// @forbid 禁止在未取得互斥鎖下共用固定驗收工作資料夾、跳過影響範圍或鎖定檔驗證，或讓逾時子程序殘留
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { countTextFileLines, extractSection, getLabelNames } from '../lib.ts';
import type {
  AcceptChildExecResult,
  AcceptCommandArgs,
  AcceptCommandRule,
  AcceptLogSection,
  AcceptOutcome,
  AcceptProcessGroupOptions,
  AcceptRepoResult,
  CheckoutSiblingRepoOptions,
  CreatedWorktree,
  EvidencePackageParams,
  GitHubComment,
  InspectAffectedRepoOptions,
  NoCommitCommandResult,
  NoCommitEvidenceParams,
  ProjectConfig,
  RegisterAcceptChildFn,
  RuleCheckOutcome,
  RunNoCommitAcceptOptions,
  SiblingCheckout,
  TaskContext,
} from '../types.ts';
import { checkAcceptRuleSizes } from './agents.ts';
import { checkAcceptCodeRules } from './coderules.ts';
import { checkAcceptDocRules } from './docs.ts';
import { checkAcceptGate, parseGatedPaths } from './gate.ts';
import { parseValidatedScope } from './inspect.ts';
import { findProtectedPathViolations, parseProtectedPathRules } from './precheck.ts';
import {
  DEFAULT_ACCEPTANCE_PATHS,
  acquireDirLock,
  collectRepoDiffWithLock,
  fail,
  fetchIssueComments,
  fetchSingleIssue,
  isFileSameAsUpdatedMain,
  isFileUnchangedBetween,
  parseLockCommitSha,
  parsePathRuleEntries,
  postIssueComment,
  releaseDirLock,
  runGit,
} from './runtime.ts';
import { setAcceptTicketPhase } from './workers.ts';
import { formatTaskBranch, getAffectedRepoKeys } from './worktrees.ts';

const DEFAULT_ACCEPT_COMMANDS: readonly AcceptCommandRule[] = Object.freeze([
  { name: 'check', run: './tools/check.sh', timeoutSec: 1500, when: ['if-exists:tools/check.sh'], env: {} },
  { name: 'check-db', run: './tools/check-db.sh', timeoutSec: 1200, when: ['if-exists:tools/check-db.sh'], env: {} },
  { name: 'bench', run: './tools/bench.sh', timeoutSec: 1800, when: ['perf', 'if-exists:tools/bench.sh'], env: {} },
]);

const DEFAULT_HARD_FILE_LINE_LIMIT = 1800;
const DEFAULT_COMMAND_TIMEOUT_SEC = 1500;
const NO_COMMIT_COMMAND_TIMEOUT_SEC = 300;
const ACCEPT_LOCK_TIMEOUT_MS = 30 * 60 * 1000;
const NO_COMMIT_NOT_APPLICABLE = '不適用（零提交）';
const MISSING_NO_COMMIT_CMD_MSG = '零提交雜務單要在 ## 驗收指令 寫出檢查方式';
const LOG_TAIL_LINES = 40;
const KILL_GRACE_MS = 1000;
const ORIGIN_MAIN_REF = 'refs/remotes/origin/main';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function findLatestSubmitter(ctx: TaskContext, comments: readonly GitHubComment[]): string | null {
  const sorted = (Array.isArray(comments) ? comments : [])
    .filter((c): c is GitHubComment => Boolean(c && typeof c === 'object'))
    .slice()
    .sort((a, b) => (Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0));

  let latestSubmitter: string | null = null;
  for (const comment of sorted) {
    if (ctx.lib.commentRole(comment) !== 'implementer') continue;
    const lines = String(comment.body || '').replace(/\r\n/g, '\n').split('\n');
    if (lines.length < 2) continue;
    const secondLine = lines[1].trim();
    if (secondLine !== '📦 交件' && secondLine !== '📦 交件（零提交）') continue;
    const match = /^🛠️\s+(\S+)/.exec(lines[0].trimStart());
    if (match) latestSubmitter = match[1];
  }
  return latestSubmitter;
}

function parseWhenConditions(rawWhen: unknown, cmdName: string): string[] {
  if (rawWhen === undefined || rawWhen === null || rawWhen === 'always') return [];
  const items: unknown[] = Array.isArray(rawWhen) ? rawWhen : [rawWhen];
  const conditions: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string' || !item.trim()) {
      fail(`設定檔錯誤：acceptCommands[${cmdName}].when 格式錯誤`);
    }
    const token = item.trim();
    if (token === 'always') continue;
    if (token === 'perf' || token.startsWith('if-exists:')) {
      if (token.startsWith('if-exists:') && !token.slice('if-exists:'.length).trim()) {
        fail(`設定檔錯誤：acceptCommands[${cmdName}].when 缺少檔案路徑`);
      }
      conditions.push(token);
      continue;
    }
    fail(`設定檔錯誤：acceptCommands[${cmdName}].when 不認得「${token}」`);
  }
  return conditions;
}

function parseAcceptCommands(config: ProjectConfig): readonly AcceptCommandRule[] {
  const rawCommands: unknown = config.acceptCommands;
  if (rawCommands === undefined || rawCommands === null) {
    return DEFAULT_ACCEPT_COMMANDS;
  }
  if (!Array.isArray(rawCommands)) {
    fail('設定檔錯誤：acceptCommands 必須是陣列');
  }
  return rawCommands.map((raw: unknown, idx: number): AcceptCommandRule => {
    if (!isRecord(raw)) {
      fail(`設定檔錯誤：acceptCommands[${idx}] 必須是物件`);
    }
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const run = typeof raw.run === 'string' ? raw.run.trim() : '';
    if (!name) fail(`設定檔錯誤：acceptCommands[${idx}] 缺少 name`);
    if (!run) fail(`設定檔錯誤：acceptCommands[${name}] 缺少 run`);

    let timeoutSec = DEFAULT_COMMAND_TIMEOUT_SEC;
    if (raw.timeoutSec !== undefined && raw.timeoutSec !== null) {
      if (typeof raw.timeoutSec !== 'number' || !Number.isFinite(raw.timeoutSec) || raw.timeoutSec <= 0) {
        fail(`設定檔錯誤：acceptCommands[${name}].timeoutSec 必須是正數`);
      }
      timeoutSec = raw.timeoutSec;
    }

    const env: Record<string, string> = {};
    if (raw.env !== undefined && raw.env !== null) {
      if (!isRecord(raw.env)) {
        fail(`設定檔錯誤：acceptCommands[${name}].env 必須是物件`);
      }
      for (const [k, v] of Object.entries(raw.env)) {
        env[k] = String(v ?? '');
      }
    }

    return {
      name,
      run,
      timeoutSec,
      when: parseWhenConditions(raw.when, name),
      env,
    };
  });
}

function killProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined || !Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {}
  }
}

function evaluateCommandWhen(conditions: readonly string[], wtPath: string, hasPerfSection: boolean): boolean {
  for (const cond of conditions) {
    if (cond === 'perf' && !hasPerfSection) return false;
    if (cond.startsWith('if-exists:')) {
      const rel = cond.slice('if-exists:'.length).trim();
      const target = path.resolve(wtPath, rel);
      const wtResolved = path.resolve(wtPath);
      if (target !== wtResolved && !target.startsWith(`${wtResolved}${path.sep}`)) return false;
      if (!fs.existsSync(target)) return false;
    }
  }
  return true;
}

function buildCommandEnv(
  envOverrides: Readonly<Record<string, string>> | undefined,
  mainRealDir: string,
  acceptRealDir: string,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {
    ...process.env,
    TASK_ACCEPT_DIR: acceptRealDir,
    TASK_MAIN_DIR: mainRealDir,
  };
  for (const [k, v] of Object.entries(envOverrides || {})) {
    out[k] = String(v).replace(
      /\$\{(MAIN_DIR|ACCEPT_DIR)\}/g,
      (_, name: string) => (name === 'MAIN_DIR' ? mainRealDir : acceptRealDir),
    );
  }
  return out;
}

async function runCommandInProcessGroup(
  command: string,
  { cwd, env, logPath, timeoutSec, registerChild, shell = 'sh' }: AcceptProcessGroupOptions,
): Promise<AcceptChildExecResult> {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const fd = fs.openSync(logPath, 'w');
  let fdClosed = false;
  const closeFd = (): void => {
    if (!fdClosed) {
      fdClosed = true;
      try {
        fs.closeSync(fd);
      } catch {}
    }
  };

  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(shell, ['-c', command], {
        cwd,
        env,
        detached: true,
        stdio: ['ignore', fd, fd],
      });
    } catch (err: unknown) {
      closeFd();
      try {
        fs.writeFileSync(logPath, `啟動指令失敗：${err instanceof Error ? err.message : String(err)}\n`);
      } catch {}
      resolve({ exitCode: 1, signal: null, timedOut: false });
      return;
    }

    const unregister = registerChild(child.pid);
    let settled = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | undefined;
    const timeoutMs = Math.max(1, Math.round(timeoutSec * 1000));

    const finish = (exitCode: number, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      if (timedOut) {
        // @why 確保與 shell 同屬一個程序群組的子程序在逾時後全部結束，避免鎖住暫存工作資料夾
        killProcessGroup(child.pid, 'SIGKILL');
      }
      unregister();
      closeFd();
      resolve({ exitCode, signal, timedOut });
    };

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid, 'SIGTERM');
      killTimer = setTimeout(() => {
        killProcessGroup(child.pid, 'SIGKILL');
      }, KILL_GRACE_MS);
      killTimer.unref();
    }, timeoutMs);

    child.once('error', (err: unknown) => {
      try {
        fs.appendFileSync(logPath, `\n執行指令錯誤：${err instanceof Error ? err.message : String(err)}\n`);
      } catch {}
      finish(1, null);
    });

    child.once('exit', (code, signal) => {
      finish(code ?? 1, signal);
    });
  });
}

function summarizeLogFile(logPath: string): { sha256: string; tail: string } {
  const buf = fs.readFileSync(logPath);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const normalized = buf.toString('utf8').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const tail = lines.slice(-LOG_TAIL_LINES).join('\n');
  return { sha256, tail };
}

function sanitizeLogToken(name: string): string {
  return String(name || 'cmd').replace(/[^A-Za-z0-9._-]/g, '_');
}

function formatExecutionEnvironment(): string {
  const osLabel = `${os.type()} ${os.arch()}`;
  const cpuModel = os.cpus()?.[0]?.model?.trim() || 'unknown';
  const utcNow = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return `${osLabel}；${cpuModel}；${utcNow}`;
}

function resolveSafeChildPath(parentDir: string, childName: string, label: string): string {
  const name = String(childName || '').trim();
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    fail(`拒絕驗收：${label}名稱不合法（${childName}）`);
  }
  const resolved = path.resolve(parentDir, name);
  const rel = path.relative(parentDir, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    fail(`拒絕驗收：${label}路徑超出範圍（${childName}）`);
  }
  return resolved;
}

function getAcceptBaseDir(ctx: TaskContext): string {
  const rawTmp = os.tmpdir();
  fs.mkdirSync(rawTmp, { recursive: true });
  const tmpRoot = fs.realpathSync(rawTmp);
  return resolveSafeChildPath(path.join(tmpRoot, 'task-accept'), ctx.project, '專案');
}

function getFixedWorktreePath(acceptBaseDir: string, repoName: string): string {
  const wtPath = resolveSafeChildPath(acceptBaseDir, repoName, '倉庫');
  if (wtPath === path.join(acceptBaseDir, '.lock') || wtPath === path.join(acceptBaseDir, '.logs')) {
    fail(`拒絕驗收：倉庫名稱不可與內部保留目錄衝突（${repoName}）`);
  }
  return wtPath;
}

function getRepoWtPath(wtPathByRepoKey: ReadonlyMap<string, string>, repoKey: string): string {
  const wtPath = wtPathByRepoKey.get(repoKey);
  if (!wtPath) fail(`拒絕驗收：找不到倉庫 ${repoKey} 的工作資料夾路徑`);
  return wtPath;
}

function pathExistsIncludingSymlink(targetPath: string): boolean {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 清除固定路徑上的驗收工作資料夾（含上次殘留與壞掉的符號連結），並修剪主倉庫 worktree 紀錄。
 * @why 固定路徑可讓共用的編譯快取（如 CARGO_TARGET_DIR）內寫死的原始碼路徑在每次驗收時重現，但開跑前與結束後都必須清乾淨。
 */
function clearFixedWorktree(mainRepoPath: string, wtPath: string): void {
  if (pathExistsIncludingSymlink(wtPath)) {
    if (mainRepoPath && fs.existsSync(mainRepoPath)) {
      runGit(mainRepoPath, ['worktree', 'remove', '--force', wtPath]);
    }
    try {
      fs.rmSync(wtPath, { recursive: true, force: true });
    } catch {}
  }
  if (mainRepoPath && fs.existsSync(mainRepoPath)) {
    runGit(mainRepoPath, ['worktree', 'prune']);
  }
}

function inspectAffectedRepo({
  ctx,
  repo,
  branchName,
  wtPath,
  scope,
  lockSha,
  protectedRules,
  acceptanceRules,
  hardFileLineLimit,
  createdWorktrees,
}: InspectAffectedRepoOptions): AcceptRepoResult {
  const result: AcceptRepoResult = {
    repo,
    ok: false,
    errorReason: '',
    headSha: null,
    baseSha: null,
    wtPath: null,
    repoLockFullSha: null,
    scopeViolations: [],
    protectedViolations: [],
    lockViolations: [],
    fileLineFindings: [],
    changedFiles: [],
    fromLockPaths: new Set(),
    diffEntry: null,
    commandResults: [],
  };

  if (!fs.existsSync(repo.mainRepoPath)) {
    result.errorReason = `找不到倉庫資料夾 ${repo.mainRepoPath}`;
    return result;
  }

  const fetchMain = runGit(repo.mainRepoPath, ['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  if (!fetchMain.ok) {
    result.errorReason = `抓取 origin/main 失敗：${fetchMain.stderr || fetchMain.stdout || '未知錯誤'}`;
    return result;
  }

  const fetchBranch = runGit(repo.mainRepoPath, [
    'fetch',
    '-q',
    'origin',
    `+refs/heads/${branchName}:refs/remotes/origin/${branchName}`,
  ]);
  if (!fetchBranch.ok) {
    result.errorReason = `遠端沒有任務分支 origin/${branchName}`;
    return result;
  }

  const originMainRes = runGit(repo.mainRepoPath, ['rev-parse', '--verify', ORIGIN_MAIN_REF]);
  if (!originMainRes.ok) {
    result.errorReason = '無法讀取 origin/main 的 commit';
    return result;
  }
  const originMainSha = originMainRes.stdout.trim();

  const headRes = runGit(repo.mainRepoPath, ['rev-parse', '--verify', `refs/remotes/origin/${branchName}`]);
  if (!headRes.ok) {
    result.errorReason = `無法讀取 origin/${branchName} 的 commit`;
    return result;
  }
  const headSha = headRes.stdout.trim();
  result.headSha = headSha;

  const baseRes = runGit(repo.mainRepoPath, ['merge-base', originMainSha, headSha]);
  if (!baseRes.ok) {
    result.errorReason = `無法計算 merge-base：${baseRes.stderr || baseRes.stdout || '未知錯誤'}`;
    return result;
  }
  const baseSha = baseRes.stdout.trim();
  result.baseSha = baseSha;

  clearFixedWorktree(repo.mainRepoPath, wtPath);
  createdWorktrees.push({ mainRepoPath: repo.mainRepoPath, wtPath });
  const wtAddRes = runGit(repo.mainRepoPath, ['worktree', 'add', '-q', '--detach', wtPath, headSha]);
  if (!wtAddRes.ok) {
    result.errorReason = `建立暫存工作資料夾失敗：${wtAddRes.stderr || wtAddRes.stdout || '未知錯誤'}`;
    return result;
  }
  result.wtPath = wtPath;
  result.ok = true;

  const diffRange = `${baseSha}..${headSha}`;
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
    result.ok = false;
    const errorLabel =
      diffResult.errorKind === 'numstat'
        ? '讀取變更行數失敗'
        : diffResult.errorKind === 'u0'
          ? '讀取差異內容失敗'
          : '讀取變更清單失敗';
    result.errorReason = `${errorLabel}：${diffResult.errorDetail}`;
    return result;
  }

  const repoLockFullSha = diffResult.repoLockFullSha;
  result.repoLockFullSha = repoLockFullSha;
  result.changedFiles = diffResult.changedFiles;
  result.fromLockPaths = diffResult.fromLockPaths;
  result.protectedViolations = findProtectedPathViolations(ctx.lib, protectedRules, result.changedFiles, scope);

  result.scopeViolations = ctx.lib.findOutOfScopeFiles(result.changedFiles, scope.entries).map((f) => f.raw);

  if (repoLockFullSha) {
    if (diffResult.lockedAcceptanceFiles.length === 0) {
      result.lockViolations.push(`${repo.key}：鎖定 commit ${lockSha} 中沒有任何驗收檔`);
    } else {
      for (const f of diffResult.lockedAcceptanceFiles) {
        const sameAsLock = isFileUnchangedBetween(repo.mainRepoPath, repoLockFullSha, headSha, f);
        const sameAsUpdatedMain = isFileSameAsUpdatedMain(
          repo.mainRepoPath,
          diffResult.lockMainBaseSha,
          originMainSha,
          headSha,
          f,
        );
        if (!sameAsLock && !sameAsUpdatedMain) {
          result.lockViolations.push(`${repo.key}:${f}（和鎖定 commit ${lockSha} 及 origin/main 都不同）`);
        }
      }
    }
  }

  result.diffEntry = {
    repo: repo.key,
    numstatEntries: diffResult.numstatEntries,
    diffByFile: diffResult.diffByFile,
  };

  const binaryPaths = new Set(diffResult.numstatEntries.filter((e) => e.binary).map((e) => e.path));
  for (const fileEntry of result.changedFiles) {
    const filePath = fileEntry.pattern;
    if (binaryPaths.has(filePath) || ctx.lib.isExcludedFromBusinessLineCount(filePath)) continue;
    const showRes = runGit(repo.mainRepoPath, ['cat-file', '-p', `${headSha}:${filePath}`]);
    if (!showRes.ok || showRes.stdout.includes('\0')) continue;
    const lineCount = countTextFileLines(showRes.stdout);
    if (lineCount > hardFileLineLimit) {
      result.fileLineFindings.push({
        raw: fileEntry.raw,
        lineCount,
        kind: 'hard',
        limit: hardFileLineLimit,
      });
    } else if (lineCount > ctx.lib.softFileLineLimit) {
      result.fileLineFindings.push({
        raw: fileEntry.raw,
        lineCount,
        kind: 'soft',
        limit: ctx.lib.softFileLineLimit,
      });
    }
  }

  return result;
}

/**
 * 將未受影響的同專案倉庫一併檢出到固定暫存路徑（停在各自的 origin/main），供受影響倉庫的測試跨倉讀取。
 * @why 驗收期間多倉庫測試需要依設定檔相對路徑找到旁邊的倉庫，但不對未改動倉庫做範圍、鎖定或指令驗收。
 */
function checkoutSiblingRepo({ repo, wtPath, createdWorktrees }: CheckoutSiblingRepoOptions): SiblingCheckout {
  if (!fs.existsSync(repo.mainRepoPath)) {
    fail(`拒絕驗收：找不到一併檢出的倉庫資料夾 ${repo.mainRepoPath}`);
  }
  const fetchMain = runGit(repo.mainRepoPath, ['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  if (!fetchMain.ok) {
    fail(
      `拒絕驗收：一併檢出 ${repo.name} 抓取 origin/main 失敗：${fetchMain.stderr || fetchMain.stdout || '未知錯誤'}`,
    );
  }
  const originMainRes = runGit(repo.mainRepoPath, ['rev-parse', '--verify', ORIGIN_MAIN_REF]);
  if (!originMainRes.ok) {
    fail(`拒絕驗收：無法讀取一併檢出倉庫 ${repo.name} 的 origin/main commit`);
  }
  const sha = originMainRes.stdout.trim();
  clearFixedWorktree(repo.mainRepoPath, wtPath);
  createdWorktrees.push({ mainRepoPath: repo.mainRepoPath, wtPath });
  const wtAddRes = runGit(repo.mainRepoPath, ['worktree', 'add', '-q', '--detach', wtPath, sha]);
  if (!wtAddRes.ok) {
    fail(
      `拒絕驗收：建立一併檢出倉庫 ${repo.name} 的暫存工作資料夾失敗：${wtAddRes.stderr || wtAddRes.stdout || '未知錯誤'}`,
    );
  }
  return { repo, sha, wtPath };
}

function appendCodeBlockSection(lines: string[], title: string, items: readonly string[]): void {
  if (items.length === 0) return;
  lines.push('', `**${title}**`, '```text', ...items, '```');
}

function evaluateAcceptRuleSizes(ctx: TaskContext, repoResults: readonly AcceptRepoResult[]): RuleCheckOutcome {
  const configDirReal = fs.existsSync(ctx.configDir)
    ? fs.realpathSync(ctx.configDir)
    : path.resolve(ctx.configDir);
  const configFileName = path.basename(ctx.configPath);

  for (const r of repoResults) {
    if (!r.ok || !r.wtPath) continue;
    const mainRepoReal = fs.existsSync(r.repo.mainRepoPath)
      ? fs.realpathSync(r.repo.mainRepoPath)
      : path.resolve(r.repo.mainRepoPath);
    const relFromMain = path.relative(mainRepoReal, configDirReal);
    if (relFromMain.startsWith('..') || path.isAbsolute(relFromMain)) continue;

    const wtConfigDir = relFromMain === '' ? r.wtPath : path.join(r.wtPath, relFromMain);
    const wtConfigPath = path.join(wtConfigDir, configFileName);
    const relPrefix = relFromMain === '' ? '' : `${relFromMain.split(path.sep).join('/')}/`;
    const changedRelPaths: string[] = [];
    for (const f of r.changedFiles) {
      if (!relPrefix) {
        changedRelPaths.push(f.pattern);
      } else if (f.pattern.startsWith(relPrefix)) {
        changedRelPaths.push(f.pattern.slice(relPrefix.length));
      }
    }
    return checkAcceptRuleSizes({ configPath: wtConfigPath, changedRelPaths });
  }

  return { status: '不適用', passed: true, outputLines: [] };
}

function buildEvidencePackage({
  issueNum,
  verdict,
  verifier,
  submitter,
  branchName,
  lockSha,
  scopeStatus,
  protectedStatus,
  gateStatus,
  lockStatus,
  lineCheck,
  fileLineStatus,
  codeRuleStatus,
  docRuleStatus,
  ruleSizeStatus,
  siblingCheckouts = [],
  envText,
  repoResults,
  outOfScopeList,
  protectedAndLockList,
  exceededFileList,
  codeRuleOutputLines,
  docRuleOutputLines,
  docRuleExistingOutputLines = [],
  ruleSizeOutputLines,
}: EvidencePackageParams): string {
  const siblingCheckoutText =
    siblingCheckouts.length > 0
      ? siblingCheckouts.map((s) => `${s.repo.name}@${s.sha.slice(0, 7)}`).join('、')
      : '（無）';

  const lines = [
    '🧪 驗收員',
    `## 驗收證據包：#${issueNum} → ${verdict}`,
    '',
    '| 項目 | 內容 |',
    '| :--- | :--- |',
    `| 驗收員代號／交件者代號 | \`${verifier}\`／\`${submitter}\` |`,
    `| 範圍比對 | ${scopeStatus} |`,
    `| 規則檔保護 | ${protectedStatus} |`,
    `| 門檻區域 | ${gateStatus} |`,
    `| 鎖定 commit | ${lockStatus}${lockSha ? `（\`${lockSha}\`）` : ''} |`,
    `| 業務程式新增行數 | ${lineCheck.totalAdded}／${lineCheck.limit} 行${lineCheck.exceeded ? '（超過上限）' : ''} |`,
    `| 單檔行數 | ${fileLineStatus} |`,
    `| 程式規則 | ${codeRuleStatus} |`,
    `| 文件相依 | ${docRuleStatus} |`,
    `| 規則檔大小 | ${ruleSizeStatus} |`,
    `| 一併檢出 | ${siblingCheckoutText} |`,
    `| 執行環境 | ${envText} |`,
  ];

  const multiRepo = repoResults.length > 1;
  const logSections: AcceptLogSection[] = [];

  for (const r of repoResults) {
    lines.push('', `### 倉庫：${r.repo.name}（\`${r.repo.key}\`）`, '');
    if (!r.ok) {
      lines.push(
        '| 項目 | 內容 |',
        '| :--- | :--- |',
        `| 任務分支 | \`${branchName}\` |`,
        `| 分支 commit | — |`,
        `| 比對基準（merge-base） | — |`,
        `| 狀態 | FAIL（${r.errorReason}） |`,
      );
      continue;
    }

    const rScope = r.scopeViolations.length === 0 ? 'PASS' : 'FAIL';
    const rProtected = r.protectedViolations.length === 0 ? 'PASS' : 'FAIL';
    const rLock = !lockSha ? 'PASS' : !r.repoLockFullSha ? '不適用' : r.lockViolations.length === 0 ? 'PASS' : 'FAIL';
    const rFileLines = r.fileLineFindings.some((x) => x.kind === 'hard') ? 'FAIL' : 'PASS';

    lines.push(
      '| 項目 | 內容 |',
      '| :--- | :--- |',
      `| 分支 commit | \`${r.headSha}\` |`,
      `| 比對基準（merge-base） | \`${r.baseSha}\` |`,
      `| 範圍比對 | ${rScope} |`,
      `| 規則檔保護 | ${rProtected} |`,
      `| 鎖定 commit | ${rLock} |`,
      `| 單檔行數 | ${rFileLines} |`,
    );

    for (const cmdRes of r.commandResults) {
      const hashText = cmdRes.sha256 ? `（SHA-256：\`${cmdRes.sha256}\`）` : '';
      lines.push(`| ${cmdRes.name} | ${cmdRes.status}${hashText} |`);
      if (cmdRes.status !== '不適用') {
        const label = multiRepo ? `${r.repo.key}:${cmdRes.name}.log` : `${cmdRes.name}.log`;
        logSections.push({ label, sha256: cmdRes.sha256, tail: cmdRes.tail });
      }
    }
  }

  appendCodeBlockSection(lines, '範圍外的檔案', outOfScopeList);
  appendCodeBlockSection(lines, '被改的規則檔或鎖定檔', protectedAndLockList);
  appendCodeBlockSection(lines, '超過行數的檔案', exceededFileList);
  appendCodeBlockSection(lines, '程式規則的問題', codeRuleOutputLines);
  appendCodeBlockSection(lines, '文件相依的問題', docRuleOutputLines);
  appendCodeBlockSection(lines, '文件相依（既有，不影響判定）', docRuleExistingOutputLines);
  appendCodeBlockSection(lines, '規則檔大小檢查輸出', ruleSizeOutputLines);

  for (const logSec of logSections) {
    lines.push(
      '',
      `<details><summary>${logSec.label} 最後 ${LOG_TAIL_LINES} 行（SHA-256：${logSec.sha256}）</summary>`,
      '',
      '~~~~text',
      logSec.tail || '（無輸出）',
      '~~~~',
      '</details>',
    );
  }

  lines.push('', '驗收員的逐條對照與審查另寫一則留言，和本證據包分開。');
  return lines.join('\n');
}

function parseNoCommitAcceptCommands(body: string | null | undefined): string[] {
  const section = extractSection(body, '驗收指令');
  if (section === null) return [];
  const fencedLines: string[] = [];
  const plainLines: string[] = [];
  let fenceChar: string | null = null;
  let fenceLen = 0;
  let hasFence = false;

  for (const rawLine of section.split('\n')) {
    const trimmed = rawLine.trim();
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fenceMatch) {
      const ch = fenceMatch[1][0];
      const len = fenceMatch[1].length;
      if (!fenceChar) {
        fenceChar = ch;
        fenceLen = len;
        hasFence = true;
        continue;
      }
      if (ch === fenceChar && len >= fenceLen && trimmed === fenceMatch[1]) {
        fenceChar = null;
        fenceLen = 0;
        continue;
      }
    }
    if (fenceChar) fencedLines.push(trimmed);
    else plainLines.push(trimmed);
  }

  return (hasFence ? fencedLines : plainLines).filter(Boolean);
}

function buildNoCommitEvidencePackage({
  issueNum,
  verdict,
  verifier,
  submitter,
  lineLimit,
  envText,
  commandResults,
  missingCommands,
}: NoCommitEvidenceParams): string {
  const lines = [
    '🧪 驗收員',
    `## 驗收證據包：#${issueNum} → ${verdict}`,
    '',
    '| 項目 | 內容 |',
    '| :--- | :--- |',
    `| 驗收員代號／交件者代號 | \`${verifier}\`／\`${submitter}\` |`,
    `| 範圍比對 | ${NO_COMMIT_NOT_APPLICABLE} |`,
    `| 規則檔保護 | ${NO_COMMIT_NOT_APPLICABLE} |`,
    `| 門檻區域 | ${NO_COMMIT_NOT_APPLICABLE} |`,
    `| 鎖定 commit | ${NO_COMMIT_NOT_APPLICABLE} |`,
    `| 業務程式新增行數 | 0／${lineLimit} 行 |`,
    `| 單檔行數 | ${NO_COMMIT_NOT_APPLICABLE} |`,
    `| 程式規則 | ${NO_COMMIT_NOT_APPLICABLE} |`,
    `| 文件相依 | ${NO_COMMIT_NOT_APPLICABLE} |`,
    `| 規則檔大小 | ${NO_COMMIT_NOT_APPLICABLE} |`,
    '| 一併檢出 | （無） |',
    `| 執行環境 | ${envText} |`,
  ];

  if (missingCommands) {
    lines.push('', MISSING_NO_COMMIT_CMD_MSG);
  } else if (commandResults.length > 0) {
    lines.push('', '| 指令 | 結果 |', '| :--- | :--- |');
    for (const r of commandResults) {
      lines.push(`| ${r.cmd} | ${r.status} |`);
    }
    for (let i = 0; i < commandResults.length; i += 1) {
      const r = commandResults[i];
      if (r.status === 'PASS') continue;
      lines.push(
        '',
        `<details><summary>指令 #${i + 1}（${r.status}）最後 ${LOG_TAIL_LINES} 行（SHA-256：${r.sha256}）</summary>`,
        '',
        '~~~~text',
        r.tail || '（無輸出）',
        '~~~~',
        '</details>',
      );
    }
  }

  lines.push('', '驗收員的逐條對照與審查另寫一則留言，和本證據包分開。');
  return lines.join('\n');
}

async function runNoCommitAccept({
  ctx,
  issueNum,
  target,
  verifier,
  submitter,
  logDir,
  registerChild,
  cleanupAll,
}: RunNoCommitAcceptOptions): Promise<AcceptOutcome> {
  const commands = parseNoCommitAcceptCommands(target.body);
  const lineLimit = ctx.lib.parseBusinessLineLimit(target.body);
  const commandResults: NoCommitCommandResult[] = [];

  try {
    try {
      fs.rmSync(logDir, { recursive: true, force: true });
    } catch {}

    for (let i = 0; i < commands.length; i += 1) {
      const cmd = commands[i];
      const logPath = path.join(logDir, `nocommit-${i}.log`);
      const execRes = await runCommandInProcessGroup(cmd, {
        cwd: ctx.configDir,
        env: { ...process.env },
        logPath,
        timeoutSec: NO_COMMIT_COMMAND_TIMEOUT_SEC,
        registerChild,
        shell: 'bash',
      });
      const { sha256, tail } = summarizeLogFile(logPath);
      const status = execRes.timedOut ? '逾時' : execRes.exitCode === 0 ? 'PASS' : 'FAIL';
      commandResults.push({ cmd, status, sha256, tail });
    }
  } finally {
    cleanupAll();
  }

  const missingCommands = commands.length === 0;
  const passed = !missingCommands && commandResults.every((r) => r.status === 'PASS');
  const evidence = buildNoCommitEvidencePackage({
    issueNum,
    verdict: passed ? 'PASS' : 'FAIL',
    verifier,
    submitter,
    lineLimit,
    envText: formatExecutionEnvironment(),
    commandResults,
    missingCommands,
  });
  return { passed, evidence };
}

async function publishAcceptEvidence(
  ctx: TaskContext,
  issueNum: number,
  submitter: string,
  { passed, evidence }: AcceptOutcome,
  noPost: boolean,
): Promise<number> {
  console.log(evidence);
  if (!noPost) {
    postIssueComment(ctx, issueNum, evidence);
    console.log(`（已張貼到 #${issueNum}）`);
  }
  await setAcceptTicketPhase(ctx, issueNum, submitter, passed ? 'awaiting-review' : 'verify-failed');
  return passed ? 0 : 1;
}

export async function cmdAccept(
  ctx: TaskContext,
  { issueNum, as: verifier, noPost = false }: Pick<AcceptCommandArgs, 'issueNum' | 'as'> & { noPost?: boolean },
): Promise<number> {
  const acceptBaseDir = getAcceptBaseDir(ctx);
  const lockDir = path.join(acceptBaseDir, '.lock');
  await acquireDirLock(
    lockDir,
    { issueNum, verifier, action: 'accept' },
    { rejectLabel: '驗收鎖', defaultTimeoutMs: ACCEPT_LOCK_TIMEOUT_MS },
  );

  const logDir = path.join(acceptBaseDir, '.logs');
  const createdWorktrees: CreatedWorktree[] = [];
  const activePids = new Set<number>();

  const registerChild: RegisterAcceptChildFn = (pid) => {
    if (pid !== undefined && Number.isInteger(pid) && pid > 0) activePids.add(pid);
    return () => {
      if (pid !== undefined && Number.isInteger(pid) && pid > 0) activePids.delete(pid);
    };
  };

  const cleanupAll = (): void => {
    for (const pid of activePids) {
      killProcessGroup(pid, 'SIGKILL');
    }
    activePids.clear();
    for (const { mainRepoPath, wtPath } of createdWorktrees) {
      clearFixedWorktree(mainRepoPath, wtPath);
    }
    createdWorktrees.length = 0;
    try {
      fs.rmSync(logDir, { recursive: true, force: true });
    } catch {}
  };

  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    const handler = (): void => {
      cleanupAll();
      releaseDirLock(lockDir);
      process.exit(sig === 'SIGINT' ? 130 : 143);
    };
    signalHandlers.set(sig, handler);
    process.on(sig, handler);
  }

  let evidence: string;
  let passed = false;

  try {
    const target = fetchSingleIssue(ctx, issueNum);
    if (!target) {
      fail(`拒絕驗收：找不到 issue #${issueNum}`);
    }

    const comments = fetchIssueComments(ctx, issueNum);
    const submitter = findLatestSubmitter(ctx, comments);
    if (!submitter) {
      fail(`拒絕驗收：issue #${issueNum} 找不到實作者的交件留言（第二行為「📦 交件」或「📦 交件（零提交）」）`);
    }
    if (submitter === verifier) {
      fail(`拒絕驗收：驗收員代號（${verifier}）不可與交件者（${submitter}）相同`);
    }

    await setAcceptTicketPhase(ctx, issueNum, submitter, 'verifying');

    if (getLabelNames(target).includes('kind:no-commit')) {
      const noCommitOutcome = await runNoCommitAccept({
        ctx,
        issueNum,
        target,
        verifier,
        submitter,
        logDir,
        registerChild,
        cleanupAll,
      });
      return await publishAcceptEvidence(ctx, issueNum, submitter, noCommitOutcome, noPost);
    }

    const scope = parseValidatedScope(ctx.lib, issueNum, target.body, '拒絕驗收');
    const affectedKeys = getAffectedRepoKeys(scope);
    const affectedRepos = ctx.repos.filter((r) => affectedKeys.has(r.key));
    const unaffectedRepos = ctx.repos.filter((r) => !affectedKeys.has(r.key));
    const branchName = formatTaskBranch(ctx, issueNum);
    const lockSha = parseLockCommitSha(target.body);
    const hasPerfSection = extractSection(target.body, '效能') !== null;

    const protectedRules = parseProtectedPathRules(ctx);
    const acceptanceRules = parsePathRuleEntries(
      ctx.config.acceptancePaths,
      DEFAULT_ACCEPTANCE_PATHS,
      ctx.repoByKey,
      'acceptancePaths',
    );
    const gateRules = parseGatedPaths(ctx.config.gatedPaths, ctx.repos);
    const acceptCommands = parseAcceptCommands(ctx.config);
    const rawHardLimit = ctx.config.fileLineLimits?.hard;
    const hardFileLineLimit =
      typeof rawHardLimit === 'number' && Number.isSafeInteger(rawHardLimit) && rawHardLimit > 0
        ? rawHardLimit
        : DEFAULT_HARD_FILE_LINE_LIMIT;

    const wtPathByRepoKey = new Map<string, string>();
    const seenWtPaths = new Set<string>();
    for (const repo of ctx.repos) {
      const wtPath = getFixedWorktreePath(acceptBaseDir, repo.name);
      if (seenWtPaths.has(wtPath)) {
        fail(`拒絕驗收：多個倉庫共用相同名稱「${repo.name}」，無法建立固定路徑工作資料夾`);
      }
      seenWtPaths.add(wtPath);
      wtPathByRepoKey.set(repo.key, wtPath);
    }

    try {
      try {
        fs.rmSync(logDir, { recursive: true, force: true });
      } catch {}
      for (const repo of ctx.repos) {
        clearFixedWorktree(repo.mainRepoPath, getRepoWtPath(wtPathByRepoKey, repo.key));
      }

      const repoResults = affectedRepos.map((repo) =>
        inspectAffectedRepo({
          ctx,
          repo,
          branchName,
          wtPath: getRepoWtPath(wtPathByRepoKey, repo.key),
          scope,
          lockSha,
          protectedRules,
          acceptanceRules,
          hardFileLineLimit,
          createdWorktrees,
        }),
      );

      const siblingCheckouts = unaffectedRepos.map((repo) =>
        checkoutSiblingRepo({
          repo,
          wtPath: getRepoWtPath(wtPathByRepoKey, repo.key),
          createdWorktrees,
        }),
      );

      const outOfScopeList = repoResults.flatMap((r) => r.scopeViolations);
      const protectedList = repoResults.flatMap((r) => r.protectedViolations);
      const lockList = repoResults.flatMap((r) => r.lockViolations);
      if (lockSha && !repoResults.some((r) => r.repoLockFullSha)) {
        lockList.push(`找不到鎖定 commit ${lockSha}`);
      }

      const fileLineFindings = repoResults.flatMap((r) => r.fileLineFindings);
      const exceededFileList = fileLineFindings.map((f) =>
        f.kind === 'hard'
          ? `${f.raw}：${f.lineCount} 行（超過硬上限 ${f.limit} 行）`
          : `${f.raw}：${f.lineCount} 行（超過軟上限 ${f.limit} 行）`,
      );

      const lineLimit = ctx.lib.parseBusinessLineLimit(target.body);
      const lineCheck = ctx.lib.analyzeBusinessAddedLines({
        repoEntries: repoResults.flatMap((r) => (r.diffEntry ? [r.diffEntry] : [])),
        limitOverride: lineLimit,
      });

      const acceptRealDir = fs.realpathSync(acceptBaseDir);
      for (const r of repoResults) {
        if (!r.ok || !r.wtPath) continue;
        const mainRealDir = fs.realpathSync(r.repo.mainRepoPath);
        for (let i = 0; i < acceptCommands.length; i += 1) {
          const cmd = acceptCommands[i];
          if (!evaluateCommandWhen(cmd.when, r.wtPath, hasPerfSection)) {
            r.commandResults.push({ name: cmd.name, status: '不適用', sha256: null, tail: '' });
            continue;
          }
          const logPath = path.join(logDir, `${r.repo.key}-${i}-${sanitizeLogToken(cmd.name)}.log`);
          const cmdEnv = buildCommandEnv(cmd.env, mainRealDir, acceptRealDir);
          const execRes = await runCommandInProcessGroup(cmd.run, {
            cwd: r.wtPath,
            env: cmdEnv,
            logPath,
            timeoutSec: cmd.timeoutSec,
            registerChild,
          });
          const { sha256, tail } = summarizeLogFile(logPath);
          const status = execRes.timedOut ? '逾時' : execRes.exitCode === 0 ? 'PASS' : 'FAIL';
          r.commandResults.push({ name: cmd.name, status, sha256, tail });
        }
      }

      const codeRuleInput = {
        config: ctx.config,
        lib: ctx.lib,
        repos: ctx.repos,
        issueBody: target.body,
        repoInputs: repoResults.map((r) => ({
          repoKey: r.repo.key,
          ok: r.ok,
          baseSha: r.baseSha,
          headSha: r.headSha,
          wtPath: r.wtPath,
          fromLockPaths: r.fromLockPaths,
        })),
      };
      const codeRuleCheck = checkAcceptCodeRules(codeRuleInput);
      const docRuleCheck = checkAcceptDocRules({ ctx, repoResults });
      const ruleSizeCheck = evaluateAcceptRuleSizes(ctx, repoResults);
      const gateCheck = checkAcceptGate({
        gateRules,
        project: ctx.project,
        issueNum,
        issueBody: target.body,
        repoResults,
      });

      const hasRepoError = repoResults.some((r) => !r.ok);
      const scopeOk = !hasRepoError && outOfScopeList.length === 0;
      const protectedOk = !hasRepoError && protectedList.length === 0;
      const gateOk = gateCheck.passed;
      const lockOk = !hasRepoError && lockList.length === 0;
      const fileLinesOk = !hasRepoError && !fileLineFindings.some((x) => x.kind === 'hard');
      const businessLinesOk = !hasRepoError && !lineCheck.exceeded;
      const codeRulesOk = codeRuleCheck.passed;
      const docRulesOk = docRuleCheck.passed;
      const ruleSizeOk = ruleSizeCheck.passed;
      const commandsOk = repoResults.every((r) =>
        r.commandResults.every((c) => c.status === 'PASS' || c.status === '不適用'),
      );

      passed =
        scopeOk &&
        protectedOk &&
        gateOk &&
        lockOk &&
        fileLinesOk &&
        businessLinesOk &&
        codeRulesOk &&
        docRulesOk &&
        ruleSizeOk &&
        commandsOk;
      const verdict = passed ? 'PASS' : 'FAIL';

      evidence = buildEvidencePackage({
        issueNum,
        verdict,
        verifier,
        submitter,
        branchName,
        lockSha,
        scopeStatus: scopeOk ? 'PASS' : 'FAIL',
        protectedStatus: protectedOk ? 'PASS' : 'FAIL',
        gateStatus: gateCheck.status,
        lockStatus: lockOk ? 'PASS' : 'FAIL',
        lineCheck,
        fileLineStatus: fileLinesOk ? 'PASS' : 'FAIL',
        codeRuleStatus: codeRuleCheck.status,
        docRuleStatus: docRuleCheck.status,
        ruleSizeStatus: ruleSizeCheck.status,
        siblingCheckouts,
        envText: formatExecutionEnvironment(),
        repoResults,
        outOfScopeList,
        protectedAndLockList: [...protectedList, ...lockList],
        exceededFileList,
        codeRuleOutputLines: codeRuleCheck.outputLines,
        docRuleOutputLines: docRuleCheck.outputLines,
        docRuleExistingOutputLines: docRuleCheck.existingOutputLines || [],
        ruleSizeOutputLines: ruleSizeCheck.outputLines,
      });
    } finally {
      cleanupAll();
    }

    return await publishAcceptEvidence(ctx, issueNum, submitter, { passed, evidence }, noPost);
  } finally {
    for (const [sig, handler] of signalHandlers.entries()) {
      process.off(sig, handler);
    }
    cleanupAll();
    releaseDirLock(lockDir);
  }
}
