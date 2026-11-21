// @module templates/bin/task/cli/wait
// @role 通用 task 工具的等待指令模組：實作 wait --next（常駐輪詢找下一張派工與主資料夾快轉）、wait <N>（等待規劃者或使用者回覆）與 wait --dept（等待外部部門交件或回覆）
// @why 將常駐接單的輪詢迴圈、主資料夾自動快轉、提問等待與跨部門需求等待集中於獨立模組，且保證 wait --next 與 wait --dept 不寫入 GitHub
// @forbid 禁止在 wait --next 或 wait --dept 寫入 GitHub，或針對特定專案與測試資料寫死特例

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { evaluateMainAutoSync, getLabelNames, parseGitAheadBehind } from '../lib.ts';
import type { GitHubComment, GitHubIssue, TaskContext, WaitCommandArgs } from '../types.ts';
import {
  TaskFailure,
  fetchAllIssues,
  fetchIssueComments,
  fetchSingleIssue,
  postIssueComment,
  resolveExternalDepartment,
  runGit,
  usageError,
} from './runtime.ts';
import {
  acquireWorkerLease,
  loadWorkerLimits,
  releaseWorkerLease,
  stepWorkerBeforeWaitRound,
  touchWorkerHeartbeatIfExists,
} from './workers.ts';

const MAX_CONSECUTIVE_FAILURES = 5;

const EXIT_CODE = Object.freeze({
  OK: 0,
  FAIL: 1,
  MAIN_UPDATED: 3,
  RETIRED: 4,
  EXTRA_WORKER: 5,
  BUSY: 6,
  TIMEOUT: 7,
  LEASE_IN_USE: 8,
});

interface CandidateIssue {
  issue: GitHubIssue;
  isBlocker: boolean;
  isRework: boolean;
}

type MatchedCandidate =
  | { kind: 'resume'; issue: GitHubIssue; pendingComments: GitHubComment[] }
  | { kind: 'start'; issue: GitHubIssue; dispatchComment: GitHubComment | null };

function formatDurationZh(sec: number): string {
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60} 分鐘`;
  if (sec >= 60) return `${(sec / 60).toFixed(1)} 分鐘`;
  return `${sec} 秒`;
}

function formatElapsedZh(elapsedMs: number): string {
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  if (elapsedSec < 60) return `${elapsedSec} 秒`;
  return `${Math.floor(elapsedSec / 60)} 分鐘`;
}

function isImplementerNoticeBody(ctx: TaskContext, comment: GitHubComment): boolean {
  if (ctx.lib.commentRole(comment) !== 'implementer') return false;
  const lines = String(comment?.body || '').replace(/\r\n/g, '\n').split('\n');
  return lines.some((line) => line.trimStart().startsWith('🔁'));
}

function resolveMainConfigRepoPath(ctx: TaskContext): string {
  const configDirResolved = path.resolve(ctx.configDir);
  const matched = ctx.repos.find((r) => path.resolve(r.mainRepoPath) === configDirResolved);
  return matched ? matched.mainRepoPath : ctx.configDir;
}

/**
 * 檢查設定檔所在的主資料夾是否落後 `origin/main`；只有在乾淨且可快轉時執行 `git pull --ff-only`。
 */
function syncMainRepoBeforeWaitNext(ctx: TaskContext): { updated: boolean } {
  const mainDir = resolveMainConfigRepoPath(ctx);
  if (!fs.existsSync(mainDir)) {
    const decision = evaluateMainAutoSync({ exists: false });
    if (decision.shouldNotify && decision.message) console.log(decision.message);
    return { updated: false };
  }

  const workTreeRes = runGit(mainDir, ['rev-parse', '--is-inside-work-tree']);
  if (!workTreeRes.ok || workTreeRes.stdout.trim() !== 'true') {
    const decision = evaluateMainAutoSync({ exists: true, isGitRepo: false });
    if (decision.shouldNotify && decision.message) console.log(decision.message);
    return { updated: false };
  }

  const branchRes = runGit(mainDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchRes.ok ? branchRes.stdout.trim() : '';
  const statusRes = runGit(mainDir, ['status', '--porcelain']);
  const originRes = runGit(mainDir, ['remote', 'get-url', 'origin']);
  const hasOrigin = originRes.ok && Boolean(originRes.stdout.trim());

  let fetchOk = true;
  let fetchError = '';
  if (hasOrigin) {
    const fetchRes = runGit(mainDir, ['fetch', '--no-tags', '--quiet', 'origin', 'main']);
    fetchOk = fetchRes.ok;
    fetchError = fetchRes.stderr || fetchRes.stdout;
  }

  const originMainRes = runGit(mainDir, ['rev-parse', '--verify', '-q', 'refs/remotes/origin/main']);
  const hasOriginMain = originMainRes.ok;
  let aheadCount = 0;
  let behindCount = 0;
  if (hasOriginMain) {
    const countsRes = runGit(mainDir, ['rev-list', '--left-right', '--count', 'HEAD...origin/main']);
    const parsedCounts = countsRes.ok ? parseGitAheadBehind(countsRes.stdout) : null;
    if (parsedCounts) {
      aheadCount = parsedCounts.ahead;
      behindCount = parsedCounts.behind;
    }
  }

  const decision = evaluateMainAutoSync({
    exists: true,
    isGitRepo: true,
    hasOrigin,
    branch,
    statusOk: statusRes.ok,
    porcelain: statusRes.stdout,
    fetchOk,
    fetchError,
    hasOriginMain,
    aheadCount,
    behindCount,
  });

  if (decision.action !== 'pull') {
    if (decision.shouldNotify && decision.message) console.log(decision.message);
    return { updated: false };
  }

  const oldShaRes = runGit(mainDir, ['rev-parse', 'HEAD']);
  const oldSha = oldShaRes.ok ? oldShaRes.stdout.trim() : '';

  const pullRes = runGit(mainDir, ['pull', '--ff-only', '--quiet', 'origin', 'main']);
  if (!pullRes.ok) {
    const errFirstLine = (pullRes.stderr || pullRes.stdout || '未知錯誤').split('\n')[0];
    console.log(`主資料夾落後 origin/main ${decision.behindCount} 個提交，未自動更新：無法快轉（${errFirstLine}）`);
    return { updated: false };
  }

  const newShaRes = runGit(mainDir, ['rev-parse', 'HEAD']);
  const newSha = newShaRes.ok ? newShaRes.stdout.trim() : '';
  if (newSha && newSha !== oldSha) {
    console.log(
      `已自動快轉主資料夾至最新（${oldSha.slice(0, 7) || 'unknown'} → ${newSha.slice(0, 7)}，前進 ${decision.behindCount} 個提交），結束本次等待以便重啟套用新版規則。`,
    );
    return { updated: true };
  }
  return { updated: false };
}

function sortCandidateIssues(allIssues: readonly GitHubIssue[]): CandidateIssue[] {
  const candidates: CandidateIssue[] = [];
  for (const issue of allIssues) {
    if (!issue || typeof issue !== 'object' || issue.state !== 'open') continue;
    const labels = getLabelNames(issue);
    if (labels.includes('status:in-progress')) continue;
    const isRework = labels.includes('status:rework');
    const isReady = labels.includes('status:ready');
    if (!isRework && !isReady) continue;
    candidates.push({
      issue,
      isBlocker: labels.includes('severity:blocker'),
      isRework,
    });
  }
  candidates.sort((a, b) => {
    if (a.isBlocker !== b.isBlocker) return a.isBlocker ? -1 : 1;
    if (a.isRework !== b.isRework) return a.isRework ? -1 : 1;
    return a.issue.number - b.issue.number;
  });
  return candidates;
}

function findNextCandidate(ctx: TaskContext, seenSkipped: Set<number>): MatchedCandidate | null {
  const allIssues = fetchAllIssues(ctx);
  const issuesByNumber = new Map<number, GitHubIssue>(allIssues.map((it) => [it.number, it]));
  const candidates = sortCandidateIssues(allIssues);

  for (const item of candidates) {
    const { issue, isRework } = item;
    const comments = fetchIssueComments(ctx, issue.number);

    if (isRework) {
      const check = ctx.lib.evaluateIssueCanResume(issue, { comments });
      if (check.ok) {
        return { kind: 'resume', issue, pendingComments: check.pendingComments };
      }
      if (!seenSkipped.has(issue.number)) {
        console.log(`SKIP #${issue.number}：${check.reason}`);
        seenSkipped.add(issue.number);
      }
    } else {
      const check = ctx.lib.evaluateIssueCanStart(issue, {
        issueNum: issue.number,
        issuesLookup: issuesByNumber,
        activeIssues: allIssues,
        comments,
        requireDispatch: true,
      });
      if (check.ok) {
        return { kind: 'start', issue, dispatchComment: check.dispatchComment };
      }
      if (!seenSkipped.has(issue.number)) {
        console.log(`SKIP #${issue.number}：${check.reason}`);
        seenSkipped.add(issue.number);
      }
    }
  }
  return null;
}

function printMatchedCandidate(candidate: MatchedCandidate): void {
  console.log(`NEXT_ISSUE=${candidate.issue.number}`);
  console.log(`NEXT_KIND=${candidate.kind}`);
  console.log('---');
  if (candidate.kind === 'start') {
    console.log(candidate.dispatchComment?.body ?? '');
    return;
  }
  for (let i = 0; i < candidate.pendingComments.length; i += 1) {
    if (i > 0) console.log('---');
    console.log(candidate.pendingComments[i]?.body ?? '');
  }
}

async function runWaitForNextIssue(
  ctx: TaskContext,
  { worker, intervalSec, timeoutSec }: Pick<WaitCommandArgs, 'worker' | 'intervalSec' | 'timeoutSec'>,
): Promise<number> {
  const limits = loadWorkerLimits(ctx.config);
  const lease = await acquireWorkerLease(ctx, worker);
  if (!lease.ok) {
    console.error(`實作者 ${worker} 正被另一個活著的程序（PID ${lease.holderPid}）使用中。`);
    return EXIT_CODE.LEASE_IN_USE;
  }

  const startedAtMs = Date.now();
  const intervalMs = intervalSec * 1000;
  const deadlineMs = startedAtMs + timeoutSec * 1000;
  const timeoutLabel = formatDurationZh(timeoutSec);
  const intervalLabel = intervalSec >= 120 ? formatDurationZh(intervalSec) : `${intervalSec} 秒`;

  console.log(`等待下一張派工（${worker}）：每 ${intervalLabel}查一次，最多等 ${timeoutLabel}。`);

  const seenSkipped = new Set<number>();
  let printedOverdue = false;
  let consecutiveFailures = 0;

  try {
    while (true) {
      const step = await stepWorkerBeforeWaitRound(ctx, worker, limits);
      if (step.overdue && !printedOverdue) {
        console.log('OVERDUE=1');
        printedOverdue = true;
      }
      if (step.action === 'retire') {
        console.log('RETIRE=1');
        console.log(`${worker} 已達輪替條件（${step.reason}），停止接單並退休。`);
        return EXIT_CODE.RETIRED;
      }
      if (step.action === 'busy') {
        console.log(step.message);
        return EXIT_CODE.BUSY;
      }
      if (step.action === 'extra') {
        console.log(step.message);
        return EXIT_CODE.EXTRA_WORKER;
      }

      const sync = syncMainRepoBeforeWaitNext(ctx);
      if (sync.updated) {
        return EXIT_CODE.MAIN_UPDATED;
      }

      try {
        const matched = findNextCandidate(ctx, seenSkipped);
        consecutiveFailures = 0;
        if (matched) {
          printMatchedCandidate(matched);
          return EXIT_CODE.OK;
        }
        console.log(`仍在等待…（已等 ${formatElapsedZh(Date.now() - startedAtMs)}）`);
      } catch (err: unknown) {
        if (!(err instanceof TaskFailure) && !(err instanceof SyntaxError)) {
          throw err;
        }
        consecutiveFailures += 1;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`查詢可接單失敗（第 ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} 次）：${msg}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`連續 ${MAX_CONSECUTIVE_FAILURES} 次查詢失敗，中止等待：${msg}`);
          return EXIT_CODE.FAIL;
        }
      }

      const remainingMs = deadlineMs - Date.now();
      if (remainingMs <= 0) {
        console.error(`等待下一張派工逾時（已等 ${timeoutLabel}），結束等待。`);
        return EXIT_CODE.TIMEOUT;
      }

      const waitMs = intervalMs === 0 ? 10 : Math.min(intervalMs, remainingMs);
      await sleep(waitMs);
    }
  } finally {
    await releaseWorkerLease(ctx, worker, lease.token);
  }
}

async function sleepIssueWaitWithHeartbeat(
  ctx: TaskContext,
  {
    waitMs,
    worker,
    issueNum,
    heartbeatAliveMinutes,
  }: { waitMs: number; worker: string; issueNum: number; heartbeatAliveMinutes: number },
): Promise<void> {
  if (!worker) {
    await sleep(waitMs);
    return;
  }
  const maxSliceMs = Math.max(10, Math.floor((heartbeatAliveMinutes * 60 * 1000) / 3));
  let sleptMs = 0;
  while (sleptMs < waitMs) {
    const chunkMs = Math.min(maxSliceMs, waitMs - sleptMs);
    await sleep(chunkMs);
    sleptMs += chunkMs;
    if (sleptMs < waitMs) {
      await touchWorkerHeartbeatIfExists(ctx, worker, { ticketNum: issueNum, phase: 'blocked' });
    }
  }
}

function findFirstPlannerOrUserReply(
  ctx: TaskContext,
  comments: readonly GitHubComment[],
  sinceMs: number,
): GitHubComment | null {
  const replies = comments
    .filter((comment) => {
      if (!comment || typeof comment !== 'object') return false;
      const role = ctx.lib.commentRole(comment);
      if (role !== 'planner' && role !== 'user') return false;
      const ms = Date.parse(comment.created_at || '');
      // @why GitHub 時間精度只到秒，同一秒內的回覆仍須視為有效回覆
      return Number.isFinite(ms) && ms >= sinceMs;
    })
    .sort((a, b) => Date.parse(a.created_at || '') - Date.parse(b.created_at || ''));
  return replies.length > 0 ? replies[0] : null;
}

async function runPollingWaitLoop({
  intervalSec,
  timeoutSec,
  failPrefix,
  timeoutMessage,
  beforePoll,
  checkOnce,
  onTimeout,
  sleepStep,
}: {
  intervalSec: number;
  timeoutSec: number;
  failPrefix: string;
  timeoutMessage: string;
  beforePoll?: () => Promise<void>;
  checkOnce: (startedAtMs: number) => Promise<number | null>;
  onTimeout?: () => void;
  sleepStep: (waitMs: number) => Promise<void>;
}): Promise<number> {
  const startedAtMs = Date.now();
  const intervalMs = intervalSec * 1000;
  const deadlineMs = startedAtMs + timeoutSec * 1000;
  let consecutiveFailures = 0;

  while (true) {
    if (beforePoll) {
      await beforePoll();
    }

    try {
      const doneCode = await checkOnce(startedAtMs);
      if (doneCode !== null) {
        return doneCode;
      }
      consecutiveFailures = 0;
    } catch (err: unknown) {
      const nonRetryable = err instanceof TaskFailure && Boolean(err.nonRetryable);
      if (nonRetryable || (!(err instanceof TaskFailure) && !(err instanceof SyntaxError))) {
        throw err;
      }
      consecutiveFailures += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${failPrefix}（第 ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} 次）：${msg}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`連續 ${MAX_CONSECUTIVE_FAILURES} 次查詢失敗，中止等待：${msg}`);
        return EXIT_CODE.FAIL;
      }
    }

    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      if (onTimeout) {
        onTimeout();
      }
      console.error(timeoutMessage);
      return EXIT_CODE.TIMEOUT;
    }

    const waitMs = intervalMs === 0 ? 10 : Math.min(intervalMs, remainingMs);
    await sleepStep(waitMs);
  }
}

async function runWaitForIssue(
  ctx: TaskContext,
  {
    issueNum,
    worker,
    since,
    intervalSec,
    timeoutSec,
  }: Pick<WaitCommandArgs, 'worker' | 'since' | 'intervalSec' | 'timeoutSec'> & { issueNum: number },
): Promise<number> {
  const limits = loadWorkerLimits(ctx.config);
  const timeoutLabel = formatDurationZh(timeoutSec);

  console.log(`等待 #${issueNum} 的回覆：每 ${intervalSec} 秒查一次，最多等 ${timeoutLabel}。`);

  let sinceMs: number | null = since ? Date.parse(since) : null;

  return runPollingWaitLoop({
    intervalSec,
    timeoutSec,
    failPrefix: `查詢 #${issueNum} 留言失敗`,
    timeoutMessage: `等待 #${issueNum} 回覆逾時（已等 ${timeoutLabel}），結束等待。`,
    beforePoll: worker
      ? () => touchWorkerHeartbeatIfExists(ctx, worker, { ticketNum: issueNum, phase: 'blocked' })
      : undefined,
    checkOnce: async (startedAtMs) => {
      const comments = fetchIssueComments(ctx, issueNum);
      if (sinceMs === null) {
        let latestImplMs: number | null = null;
        for (const comment of comments) {
          if (ctx.lib.commentRole(comment) !== 'implementer' || isImplementerNoticeBody(ctx, comment)) continue;
          const ms = Date.parse(comment?.created_at || '');
          if (!Number.isFinite(ms)) continue;
          if (latestImplMs === null || ms > latestImplMs) {
            latestImplMs = ms;
          }
        }
        sinceMs = latestImplMs !== null ? latestImplMs : startedAtMs;
      }

      const reply = findFirstPlannerOrUserReply(ctx, comments, sinceMs);
      if (reply) {
        if (worker) {
          await touchWorkerHeartbeatIfExists(ctx, worker, { ticketNum: issueNum, phase: 'implementing' });
        }
        console.log(reply.body ?? '');
        return EXIT_CODE.OK;
      }

      const issue = fetchSingleIssue(ctx, issueNum);
      if (!issue) {
        throw new TaskFailure(`找不到 issue #${issueNum}`, { nonRetryable: true });
      }
      if (issue.state === 'closed') {
        if (worker) {
          await touchWorkerHeartbeatIfExists(ctx, worker, { ticketNum: issueNum, phase: 'implementing' });
        }
        const lastPlanner = comments
          .filter((c) => c && typeof c === 'object' && ctx.lib.commentRole(c) === 'planner')
          .sort((a, b) => (Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0))
          .pop();
        console.log(`#${issueNum} 已關閉，不再等待。`);
        if (lastPlanner) console.log(lastPlanner.body ?? '');
        return EXIT_CODE.OK;
      }

      console.log(`仍在等待…（已等 ${formatElapsedZh(Date.now() - startedAtMs)}）`);
      return null;
    },
    onTimeout: worker
      ? () => {
          try {
            postIssueComment(
              ctx,
              issueNum,
              [
                `🛠️ ${worker}`,
                `⏳ 等待逾時：已等 ${timeoutLabel}，#${issueNum} 仍沒有規劃者或使用者的新回覆。`,
                '請負責這張單的對話回覆；若問題要問別的對話，請照協議開成對方看得到的單。',
              ].join('\n'),
            );
          } catch (err: unknown) {
            console.error(`寫入逾時留言失敗：${err instanceof Error ? err.message : String(err)}`);
          }
        }
      : undefined,
    sleepStep: (waitMs) =>
      sleepIssueWaitWithHeartbeat(ctx, {
        waitMs,
        worker,
        issueNum,
        heartbeatAliveMinutes: limits.heartbeatAliveMinutes,
      }),
  });
}

function isClaudeDeptComment(comment: GitHubComment): boolean {
  const firstLine = String(comment.body ?? '').replace(/\r\n/g, '\n').split('\n')[0].trimStart();
  return firstLine.startsWith('🤖 Claude');
}

function hasDeptDeliveryMarker(comment: GitHubComment): boolean {
  const lines = String(comment.body ?? '').replace(/\r\n/g, '\n').split('\n');
  return lines.some((line) => line.trim() === '📦 交件');
}

function resolveDeptWaitSinceMs(
  issue: GitHubIssue,
  sortedComments: readonly GitHubComment[],
  explicitSinceMs: number | null,
  startedAtMs: number,
): number {
  if (explicitSinceMs !== null) {
    return explicitSinceMs;
  }
  let latestClaudeMs: number | null = null;
  for (const comment of sortedComments) {
    if (!isClaudeDeptComment(comment)) continue;
    const ms = Date.parse(comment.created_at || '');
    if (Number.isFinite(ms) && (latestClaudeMs === null || ms > latestClaudeMs)) {
      latestClaudeMs = ms;
    }
  }
  if (latestClaudeMs !== null) {
    return latestClaudeMs;
  }
  const createdMs = Date.parse(issue.created_at || '');
  return Number.isFinite(createdMs) ? createdMs : startedAtMs;
}

async function runWaitForDept(
  ctx: TaskContext,
  {
    deptCode,
    issueNum,
    since,
    intervalSec,
    timeoutSec,
  }: Pick<WaitCommandArgs, 'since' | 'intervalSec' | 'timeoutSec'> & { deptCode: string; issueNum: number },
): Promise<number> {
  const dept = resolveExternalDepartment(ctx, deptCode);
  const timeoutLabel = formatDurationZh(timeoutSec);
  const explicitSinceMs = since ? Date.parse(since) : null;

  console.error(`等待部門 ${dept.code}（${dept.repo}#${issueNum}）：每 ${intervalSec} 秒查一次，最多等 ${timeoutLabel}。`);

  return runPollingWaitLoop({
    intervalSec,
    timeoutSec,
    failPrefix: `查詢 ${dept.repo}#${issueNum} 留言失敗`,
    timeoutMessage: `等待 ${dept.repo}#${issueNum} 回覆逾時（已等 ${timeoutLabel}），結束等待。`,
    checkOnce: async (startedAtMs) => {
      const issue = fetchSingleIssue(ctx, issueNum, dept.repo);
      if (!issue) {
        throw new TaskFailure(`找不到 ${dept.repo}#${issueNum}`, { nonRetryable: true });
      }
      const sortedComments = fetchIssueComments(ctx, issueNum, dept.repo)
        .filter((c) => c && typeof c === 'object')
        .sort((a, b) => (Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0));

      const sinceMs = resolveDeptWaitSinceMs(issue, sortedComments, explicitSinceMs, startedAtMs);
      const newNonClaudeComments = sortedComments.filter((comment) => {
        if (isClaudeDeptComment(comment)) return false;
        const ms = Date.parse(comment.created_at || '');
        return Number.isFinite(ms) && ms > sinceMs;
      });

      const deliveredComments = newNonClaudeComments.filter(hasDeptDeliveryMarker);
      if (deliveredComments.length > 0) {
        const delivered = deliveredComments[deliveredComments.length - 1];
        console.log('DEPT_EVENT=delivered');
        console.log(delivered.body ?? '');
        return EXIT_CODE.OK;
      }

      if (newNonClaudeComments.length > 0) {
        console.log('DEPT_EVENT=comment');
        console.log(newNonClaudeComments[0].body ?? '');
        return EXIT_CODE.OK;
      }

      if (issue.state === 'closed') {
        console.log('DEPT_EVENT=closed');
        console.log(`${dept.repo}#${issueNum} 已關閉，不再等待。`);
        return EXIT_CODE.OK;
      }

      console.error(`仍在等待…（已等 ${formatElapsedZh(Date.now() - startedAtMs)}）`);
      return null;
    },
    sleepStep: (waitMs) => sleep(waitMs),
  });
}

export async function cmdWait(ctx: TaskContext, opts: WaitCommandArgs): Promise<number> {
  if (opts.nextMode) {
    return runWaitForNextIssue(ctx, opts);
  }
  if (opts.issueNum === null) {
    usageError('用法錯誤：wait 需要單一正整數單號或 --next');
  }
  if (opts.dept !== null) {
    return runWaitForDept(ctx, { ...opts, deptCode: opts.dept, issueNum: opts.issueNum });
  }
  return runWaitForIssue(ctx, { ...opts, issueNum: opts.issueNum });
}
