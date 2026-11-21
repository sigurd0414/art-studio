// @module templates/bin/task/cli/workers
// @role 通用 task 工具的實作者紀錄與租約模組：管理 .workers/<代號>.json、並發鎖、發放代號、心跳、租約、開工交件記帳與輪替判斷
// @why 將多對話常駐接單所需的本機狀態與互斥控制集中在獨立模組，與 GitHub 輪詢及任務生命週期流程解耦
// @forbid 禁止在持有本機檔案鎖期間發送網路請求，或在 wait --next 以外的指令改寫 lastPollAt

import fs from 'node:fs';
import path from 'node:path';
import { getLabelNames } from '../lib.ts';
import type {
  GitHubIssue,
  HeartbeatCommandArgs,
  LockOwnerMeta,
  ProjectConfig,
  TakeoverEligibilityResult,
  TaskContext,
  TicketPhase,
  WorkerLease,
  WorkerLimits,
  WorkerLimitsConfig,
  WorkerRecord,
  WorkerRole,
  WorkerTicketState,
} from '../types.ts';
import { isTicketPhase, sendWorkerHeartbeat } from './heartbeat.ts';
import { acquireDirLock, fail, releaseDirLock, usageError } from './runtime.ts';

export const DEFAULT_WORKER_LIMITS: Readonly<WorkerLimits> = Object.freeze({
  maxTickets: 3,
  rotateAfterTickets: 12,
  rotateAfterHours: 8,
  heartbeatAliveMinutes: 15,
  pollFreshMinutes: 10,
  releaseAfterMinutes: 30,
});

export type AcquireWorkerLeaseResult =
  | { ok: true; token: string }
  | { ok: false; holderPid: number };

export type WaitStepResult =
  | { action: 'retire'; code: 4; reason: string; overdue?: boolean }
  | { action: 'busy'; code: 6; message: string; overdue?: boolean }
  | { action: 'extra'; code: 5; message: string; overdue?: boolean }
  | { action: 'proceed'; overdue: boolean };

interface LockOutcome<T> {
  result: T;
  writtenRecord?: WorkerRecord;
  extraRecords?: WorkerRecord[];
}

interface ApplyTicketPhaseOptions {
  phase: TicketPhase;
  nowIso: string;
  agent?: string;
  hasAgent?: boolean;
  note?: string;
  hasNote?: boolean;
  resetAgent?: boolean;
}

const WORKER_NAME_RE = /^A[1-9]\d*$/;
const WORKER_FILE_RE = /^A([1-9]\d*)\.json$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isValidWorkerName(name: unknown): boolean {
  return typeof name === 'string' && WORKER_NAME_RE.test(name);
}

function parsePositiveLimit(val: unknown, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : fallback;
}

/** 從專案設定讀取實作者輪替與並行上限，未設定欄位則採規格預設值；`releaseAfterMinutes` 須為大於 `heartbeatAliveMinutes` 的正整數。 */
export function loadWorkerLimits(config: Pick<ProjectConfig, 'workerLimits'> | null | undefined): WorkerLimits {
  const raw: WorkerLimitsConfig =
    config && typeof config.workerLimits === 'object' && config.workerLimits ? config.workerLimits : {};
  const heartbeatAliveMinutes = parsePositiveLimit(
    raw.heartbeatAliveMinutes,
    DEFAULT_WORKER_LIMITS.heartbeatAliveMinutes,
  );
  let releaseAfterMinutes = DEFAULT_WORKER_LIMITS.releaseAfterMinutes;
  if (raw.releaseAfterMinutes !== undefined) {
    if (
      typeof raw.releaseAfterMinutes !== 'number' ||
      !Number.isSafeInteger(raw.releaseAfterMinutes) ||
      raw.releaseAfterMinutes <= 0
    ) {
      usageError('設定檔錯誤：workerLimits.releaseAfterMinutes 必須是正整數');
    }
    releaseAfterMinutes = raw.releaseAfterMinutes;
  }
  if (releaseAfterMinutes <= heartbeatAliveMinutes) {
    usageError(
      `設定檔錯誤：workerLimits.releaseAfterMinutes（${releaseAfterMinutes}）必須大於 heartbeatAliveMinutes（${heartbeatAliveMinutes}）`,
    );
  }
  return {
    maxTickets: parsePositiveLimit(raw.maxTickets, DEFAULT_WORKER_LIMITS.maxTickets),
    rotateAfterTickets: parsePositiveLimit(raw.rotateAfterTickets, DEFAULT_WORKER_LIMITS.rotateAfterTickets),
    rotateAfterHours: parsePositiveLimit(raw.rotateAfterHours, DEFAULT_WORKER_LIMITS.rotateAfterHours),
    heartbeatAliveMinutes,
    pollFreshMinutes: parsePositiveLimit(raw.pollFreshMinutes, DEFAULT_WORKER_LIMITS.pollFreshMinutes),
    releaseAfterMinutes,
  };
}

export function getWorkersDir(worktreeRoot: string): string {
  return path.join(worktreeRoot, '.workers');
}

export function getWorkersLockDir(worktreeRoot: string): string {
  return path.join(getWorkersDir(worktreeRoot), '.lock');
}

export function getWorkerStatePath(worktreeRoot: string, workerName: string): string {
  return path.join(getWorkersDir(worktreeRoot), `${workerName}.json`);
}

export function getWorkerLeasePath(worktreeRoot: string, workerName: string): string {
  return path.join(getWorkersDir(worktreeRoot), `${workerName}.lease.json`);
}

export function isPidAlive(pid: unknown): boolean {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    // @why EPERM 代表程序存在但屬於其他權限上下文，仍視為活著；ESRCH 才表示程序已結束
    return isRecord(err) && err.code === 'EPERM';
  }
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

function readJsonLoose(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePositiveIntList(raw: unknown, fieldName: string, filePath: string): number[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    fail(`實作者紀錄壞掉（${filePath}）：${fieldName} 必須是陣列`);
  }
  const out: number[] = [];
  for (const item of raw) {
    if (typeof item !== 'number' || !Number.isSafeInteger(item) || item <= 0) {
      fail(`實作者紀錄壞掉（${filePath}）：${fieldName} 含無效單號`);
    }
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function parseOptionalTimestamp(val: unknown, fieldName: string, filePath: string): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'string' || !Number.isFinite(Date.parse(val))) {
    fail(`實作者紀錄壞掉（${filePath}）：${fieldName} 格式無效`);
  }
  return val;
}

function normalizeTicketsMap(raw: unknown, filePath: string): Record<string, WorkerTicketState> {
  if (raw === undefined) return {};
  if (!isRecord(raw)) {
    fail(`實作者紀錄壞掉（${filePath}）：tickets 必須是物件`);
  }
  const tickets: Record<string, WorkerTicketState> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!/^[1-9]\d*$/.test(key) || !Number.isSafeInteger(Number(key))) {
      fail(`實作者紀錄壞掉（${filePath}）：tickets 含無效單號 ${key}`);
    }
    if (!isRecord(val) || !isTicketPhase(val.phase)) {
      fail(`實作者紀錄壞掉（${filePath}）：tickets[${key}].phase 無效`);
    }
    if (typeof val.phaseAt !== 'string' || !Number.isFinite(Date.parse(val.phaseAt))) {
      fail(`實作者紀錄壞掉（${filePath}）：tickets[${key}].phaseAt 格式無效`);
    }
    if (val.agent !== undefined && typeof val.agent !== 'string') {
      fail(`實作者紀錄壞掉（${filePath}）：tickets[${key}].agent 必須是字串`);
    }
    if (val.note !== undefined && typeof val.note !== 'string') {
      fail(`實作者紀錄壞掉（${filePath}）：tickets[${key}].note 必須是字串`);
    }
    const entry: WorkerTicketState = {
      phase: val.phase,
      phaseAt: val.phaseAt,
    };
    if (typeof val.agent === 'string' && val.agent) entry.agent = val.agent;
    if (typeof val.note === 'string' && val.note) entry.note = val.note;
    tickets[key] = entry;
  }
  return tickets;
}

function normalizeWorkerRecordStrict(raw: unknown, expectedName: string, filePath: string): WorkerRecord {
  if (!isRecord(raw)) {
    fail(`實作者紀錄壞掉（${filePath}）：內容必須是 JSON 物件`);
  }
  const roleRaw = raw.role === undefined ? 'active' : raw.role;
  if (roleRaw !== 'active' && roleRaw !== 'retired') {
    fail(`實作者紀錄壞掉（${filePath}）：role 無效（${String(raw.role)}）`);
  }
  const role: WorkerRole = roleRaw;
  if (typeof raw.startedAt !== 'string' || !Number.isFinite(Date.parse(raw.startedAt))) {
    fail(`實作者紀錄壞掉（${filePath}）：startedAt 缺少或格式無效`);
  }
  let heartbeatAt = raw.startedAt;
  if (raw.heartbeatAt !== undefined) {
    if (typeof raw.heartbeatAt !== 'string' || !Number.isFinite(Date.parse(raw.heartbeatAt))) {
      fail(`實作者紀錄壞掉（${filePath}）：heartbeatAt 格式無效`);
    }
    heartbeatAt = raw.heartbeatAt;
  }
  let businessLines = 0;
  if (raw.businessLines !== undefined) {
    if (typeof raw.businessLines !== 'number' || !Number.isFinite(raw.businessLines) || raw.businessLines < 0) {
      fail(`實作者紀錄壞掉（${filePath}）：businessLines 無效`);
    }
    businessLines = raw.businessLines;
  }
  const overdueSince = parseOptionalTimestamp(raw.overdueSince, 'overdueSince', filePath) ?? null;
  const lastPollAt = parseOptionalTimestamp(raw.lastPollAt, 'lastPollAt', filePath);

  const record: WorkerRecord = {
    name: typeof raw.name === 'string' && raw.name ? raw.name : expectedName,
    role,
    startedAt: raw.startedAt,
    heartbeatAt,
    claims: normalizePositiveIntList(raw.claims, 'claims', filePath),
    finished: normalizePositiveIntList(raw.finished, 'finished', filePath),
    businessLines,
    overdueSince,
    tickets: normalizeTicketsMap(raw.tickets, filePath),
  };
  if (lastPollAt !== undefined) {
    record.lastPollAt = lastPollAt;
  }
  if (typeof raw.retiredAt === 'string' && raw.retiredAt) {
    record.retiredAt = raw.retiredAt;
  }
  return record;
}

function readWorkerRecordStrict(worktreeRoot: string, workerName: string): WorkerRecord | null {
  const filePath = getWorkerStatePath(worktreeRoot, workerName);
  if (!fs.existsSync(filePath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err: unknown) {
    fail(`實作者紀錄壞掉（${filePath}）：${err instanceof Error ? err.message : String(err)}`);
  }
  return normalizeWorkerRecordStrict(parsed, workerName, filePath);
}

function createFreshWorkerRecord(workerName: string, nowIso: string): WorkerRecord {
  return {
    name: workerName,
    role: 'active',
    startedAt: nowIso,
    heartbeatAt: nowIso,
    claims: [],
    finished: [],
    businessLines: 0,
    overdueSince: null,
    tickets: {},
  };
}

function listWorkerEntries(worktreeRoot: string): fs.Dirent[] {
  const dir = getWorkersDir(worktreeRoot);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() &&
        e.name.endsWith('.json') &&
        !e.name.endsWith('.lease.json') &&
        !e.name.startsWith('.') &&
        !e.name.startsWith('_'),
    );
}

function compareWorkerNames(a: string, b: string): number {
  const ma = /^A([1-9]\d*)$/.exec(a);
  const mb = /^A([1-9]\d*)$/.exec(b);
  if (ma && mb) return Number(ma[1]) - Number(mb[1]);
  return a.localeCompare(b);
}

function listAllWorkerRecordsSafe(worktreeRoot: string): { records: WorkerRecord[]; broken: string[] } {
  const dir = getWorkersDir(worktreeRoot);
  const records: WorkerRecord[] = [];
  const broken: string[] = [];
  for (const entry of listWorkerEntries(worktreeRoot)) {
    const filePath = path.join(dir, entry.name);
    const expectedName = entry.name.slice(0, -'.json'.length);
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      records.push(normalizeWorkerRecordStrict(raw, expectedName, filePath));
    } catch {
      broken.push(expectedName);
    }
  }
  records.sort((a, b) => compareWorkerNames(a.name, b.name));
  broken.sort(compareWorkerNames);
  return { records, broken };
}

export function isWorkerAlive(worker: WorkerRecord | null | undefined, nowMs: number, limits: WorkerLimits): boolean {
  if (!worker || worker.role !== 'active') return false;
  const hbMs = Date.parse(worker.heartbeatAt || '');
  if (!Number.isFinite(hbMs)) return false;
  return nowMs - hbMs <= limits.heartbeatAliveMinutes * 60 * 1000;
}

/**
 * 依 S-040 第 3.2 節判定進行中的單是否可由 `currentWorker` 接手；只讀取本機 `.workers/` 紀錄。
 * @why `wait --next` 與 `resume` 共用同一份判定邏輯，避免搶單與實際接手條件不一致或誤搶別台機器上的協調者。
 */
export function evaluateTicketTakeover(
  worktreeRoot: string,
  target: GitHubIssue | null | undefined,
  currentWorker: string,
  limits: WorkerLimits,
  nowMs = Date.now(),
): TakeoverEligibilityResult {
  if (!target) {
    return { ok: false, reasonCode: 'not-found', reason: '找不到 issue' };
  }
  if (target.state !== 'open') {
    return { ok: false, reasonCode: 'closed', reason: `issue #${target.number} 已關閉` };
  }
  const labels = getLabelNames(target);
  if (!labels.includes('status:in-progress') || labels.includes('status:rework') || labels.includes('status:fixed')) {
    return { ok: false, reasonCode: 'not-in-progress', reason: `issue #${target.number} 不是可接手的進行中單` };
  }

  const { records } = listAllWorkerRecordsSafe(worktreeRoot);
  const holders = records.filter((rec) => rec.claims.includes(target.number));
  if (holders.length === 0) {
    return {
      ok: false,
      reasonCode: 'unclaimed',
      reason: `本機沒有任何實作者紀錄持有 #${target.number}`,
    };
  }

  const selfHolder = holders.find((rec) => rec.name === currentWorker);
  if (selfHolder) {
    return {
      ok: false,
      reasonCode: 'self-claimed',
      reason: `#${target.number} 目前正由自己（${currentWorker}，最後心跳 ${selfHolder.heartbeatAt}）持有`,
    };
  }

  const releaseAfterMs = limits.releaseAfterMinutes * 60 * 1000;
  for (const holder of holders) {
    if (holder.role === 'retired') continue;
    const hbMs = Date.parse(holder.heartbeatAt || '');
    if (Number.isFinite(hbMs) && nowMs - hbMs <= releaseAfterMs) {
      const elapsedMin = Math.max(0, Math.floor((nowMs - hbMs) / 60000));
      return {
        ok: false,
        reasonCode: 'worker-active',
        reason: `${holder.name} 心跳 ${elapsedMin} 分鐘前還在（最後心跳 ${holder.heartbeatAt}），未超過 ${limits.releaseAfterMinutes} 分鐘`,
      };
    }
  }

  const prev = holders[0];
  return {
    ok: true,
    prevWorker: prev.name,
    prevRole: prev.role,
    prevHeartbeatAt: prev.heartbeatAt,
  };
}

/** 檢查實作者最近是否仍有回來找單（只看 lastPollAt；沒有該欄代表從未透過 wait --next 找單，不算輪詢中）。 */
export function isWorkerPollFresh(
  worker: WorkerRecord | null | undefined,
  nowMs: number,
  limits: Pick<WorkerLimits, 'pollFreshMinutes'> | null | undefined,
): boolean {
  if (!worker || worker.role !== 'active' || !worker.lastPollAt) return false;
  const pollMs = Date.parse(worker.lastPollAt);
  const freshMinutes = limits?.pollFreshMinutes ?? DEFAULT_WORKER_LIMITS.pollFreshMinutes;
  return Number.isFinite(pollMs) && nowMs - pollMs <= freshMinutes * 60 * 1000;
}

export function shouldWorkerRotate(
  worker: WorkerRecord | null | undefined,
  nowMs: number,
  limits: WorkerLimits,
): boolean {
  if (!worker) return false;
  const finishedCount = Array.isArray(worker.finished) ? worker.finished.length : 0;
  const startMs = Date.parse(worker.startedAt || '');
  const elapsedHours = Number.isFinite(startMs) ? Math.max(0, (nowMs - startMs) / (60 * 60 * 1000)) : 0;
  return finishedCount >= limits.rotateAfterTickets || elapsedHours >= limits.rotateAfterHours;
}

/**
 * 在實作者鎖內執行紀錄讀寫後先釋放鎖，若有寫入紀錄再把最新狀態送到辦公室服務。
 * @why 避免在持有本機檔案鎖期間等待最多 1.5 秒的 HTTP 上報，讓多個對話同時領代號時不互相阻塞。
 */
async function withWorkerLockAndHeartbeat<T>(
  ctx: TaskContext,
  ownerMeta: LockOwnerMeta,
  fn: () => LockOutcome<T>,
): Promise<T> {
  const lockDir = getWorkersLockDir(ctx.worktreeRoot);
  await acquireDirLock(lockDir, ownerMeta, { rejectLabel: '實作者鎖' });
  let outcome: LockOutcome<T>;
  try {
    outcome = fn();
  } finally {
    releaseDirLock(lockDir);
  }
  if (outcome.extraRecords) {
    for (const extra of outcome.extraRecords) {
      await sendWorkerHeartbeat(ctx, extra);
    }
  }
  if (outcome.writtenRecord) {
    await sendWorkerHeartbeat(ctx, outcome.writtenRecord);
  }
  return outcome.result;
}

/** 更新單張單的階段狀態；階段改變且未指定 `--note` 時清除舊的 `note`。 */
function applyTicketPhaseUpdate(
  tickets: Record<string, WorkerTicketState>,
  ticketKey: string,
  {
    phase,
    nowIso,
    agent = '',
    hasAgent = false,
    note = '',
    hasNote = false,
    resetAgent = false,
  }: ApplyTicketPhaseOptions,
): void {
  const prev = Object.hasOwn(tickets, ticketKey) ? tickets[ticketKey] : undefined;
  const phaseChanged = !prev || prev.phase !== phase;
  const next: WorkerTicketState = { phase, phaseAt: nowIso };

  const resolvedAgent = hasAgent ? agent : resetAgent ? undefined : prev?.agent;
  if (resolvedAgent) {
    next.agent = resolvedAgent;
  }

  const resolvedNote = hasNote ? note : !phaseChanged ? prev?.note : undefined;
  if (resolvedNote) {
    next.note = resolvedNote;
  }

  tickets[ticketKey] = next;
}

function removeIssueFromWorkerFile(filePath: string, expectedName: string, issueNum: number): WorkerRecord | null {
  const raw = readJsonLoose(filePath);
  if (!raw) return null;
  const ticketKey = String(issueNum);
  const hasClaim = Array.isArray(raw.claims) && raw.claims.includes(issueNum);
  const hasTicket = isRecord(raw.tickets) && Object.hasOwn(raw.tickets, ticketKey);
  if (!hasClaim && !hasTicket) return null;

  if (Array.isArray(raw.claims)) {
    raw.claims = raw.claims.filter((n) => n !== issueNum);
  }
  if (isRecord(raw.tickets)) {
    delete raw.tickets[ticketKey];
  }
  writeJsonAtomic(filePath, raw);

  try {
    return normalizeWorkerRecordStrict(raw, expectedName, filePath);
  } catch {
    return null;
  }
}

/**
 * 發放從未用過的實作者代號 `A<n>`（現有含已退休最大號加一），並在鎖內建立紀錄。
 */
export async function cmdWorkerName(ctx: TaskContext): Promise<number> {
  return withWorkerLockAndHeartbeat(ctx, { action: 'worker-name' }, () => {
    let maxNum = 0;
    const dir = getWorkersDir(ctx.worktreeRoot);
    for (const entry of listWorkerEntries(ctx.worktreeRoot)) {
      const fileMatch = WORKER_FILE_RE.exec(entry.name);
      if (fileMatch) {
        const n = Number(fileMatch[1]);
        if (Number.isSafeInteger(n) && n > maxNum) maxNum = n;
      }
      const raw = readJsonLoose(path.join(dir, entry.name));
      const nameMatch = typeof raw?.name === 'string' ? /^A([1-9]\d*)$/.exec(raw.name) : null;
      if (nameMatch) {
        const n = Number(nameMatch[1]);
        if (Number.isSafeInteger(n) && n > maxNum) maxNum = n;
      }
    }

    let candidateNum = maxNum + 1;
    while (fs.existsSync(getWorkerStatePath(ctx.worktreeRoot, `A${candidateNum}`))) {
      candidateNum += 1;
    }
    const workerName = `A${candidateNum}`;
    const nowIso = new Date().toISOString();
    const record = createFreshWorkerRecord(workerName, nowIso);
    writeJsonAtomic(getWorkerStatePath(ctx.worktreeRoot, workerName), record);
    console.log(`WORKER_NAME=${workerName}`);
    return { result: 0, writtenRecord: record };
  });
}

/** 更新指定實作者的心跳時間或特定單的階段；沒有紀錄時回 1，單不在自己名下時回 3 且不改紀錄。 */
export async function cmdHeartbeat(
  ctx: TaskContext,
  {
    worker,
    ticketNum = null,
    phase = null,
    agent = '',
    hasAgent = false,
    note = '',
    hasNote = false,
  }: Pick<HeartbeatCommandArgs, 'worker'> &
    Partial<Pick<HeartbeatCommandArgs, 'ticketNum' | 'phase' | 'agent' | 'hasAgent' | 'note' | 'hasNote'>>,
): Promise<number> {
  return withWorkerLockAndHeartbeat(ctx, { worker, action: 'heartbeat' }, () => {
    const record = readWorkerRecordStrict(ctx.worktreeRoot, worker);
    if (!record) {
      fail(`找不到實作者 ${worker} 的紀錄，請先執行 worker-name`);
    }
    const nowIso = new Date().toISOString();

    if (ticketNum !== null && phase !== null) {
      const ticketKey = String(ticketNum);
      const ownsTicket = record.claims.includes(ticketNum) || Object.hasOwn(record.tickets, ticketKey);
      if (!ownsTicket) {
        console.error(`實作者 ${worker} 沒有 #${ticketNum}（不在 claims 也不在已交件保留的 tickets 中）`);
        return { result: 3 };
      }
      applyTicketPhaseUpdate(record.tickets, ticketKey, {
        phase,
        nowIso,
        agent,
        hasAgent,
        note,
        hasNote,
      });
      record.heartbeatAt = nowIso;
      writeJsonAtomic(getWorkerStatePath(ctx.worktreeRoot, worker), record);
      console.log(`PHASE ${ticketNum} ${phase}`);
      return { result: 0, writtenRecord: record };
    }

    record.heartbeatAt = nowIso;
    writeJsonAtomic(getWorkerStatePath(ctx.worktreeRoot, worker), record);
    console.log(`已更新心跳：${worker}（${nowIso}）`);
    return { result: 0, writtenRecord: record };
  });
}

/** 若該實作者紀錄存在則更新本機心跳，並視需要更新指定單的階段（供 wait <N> 使用，無紀錄時不報錯）。 */
export async function touchWorkerHeartbeatIfExists(
  ctx: TaskContext,
  worker: string,
  ticketUpdate?: { ticketNum: number; phase: TicketPhase },
): Promise<void> {
  if (!worker) return;
  await withWorkerLockAndHeartbeat<void>(ctx, { worker, action: 'heartbeat' }, () => {
    const filePath = getWorkerStatePath(ctx.worktreeRoot, worker);
    const record = readWorkerRecordStrict(ctx.worktreeRoot, worker);
    if (!record) return { result: undefined };
    const nowIso = new Date().toISOString();
    record.heartbeatAt = nowIso;
    if (ticketUpdate) {
      const ticketKey = String(ticketUpdate.ticketNum);
      if (record.claims.includes(ticketUpdate.ticketNum) || Object.hasOwn(record.tickets, ticketKey)) {
        applyTicketPhaseUpdate(record.tickets, ticketKey, { phase: ticketUpdate.phase, nowIso });
      }
    }
    writeJsonAtomic(filePath, record);
    return { result: undefined, writtenRecord: record };
  });
}

/**
 * 在實作者鎖內取得 `.workers/<代號>.lease.json`；若屬於另一個活著的程序則拒絕（不覆蓋、不刪除原租約）。
 */
export async function acquireWorkerLease(ctx: TaskContext, worker: string): Promise<AcquireWorkerLeaseResult> {
  const lockDir = getWorkersLockDir(ctx.worktreeRoot);
  await acquireDirLock(lockDir, { worker, action: 'acquire-lease' }, { rejectLabel: '實作者鎖' });
  try {
    const leasePath = getWorkerLeasePath(ctx.worktreeRoot, worker);
    const existing = readJsonLoose(leasePath);
    if (existing && typeof existing.pid === 'number' && isPidAlive(existing.pid) && existing.pid !== process.pid) {
      return { ok: false, holderPid: existing.pid };
    }
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const lease: WorkerLease = {
      worker,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      token,
    };
    writeJsonAtomic(leasePath, lease);
    return { ok: true, token };
  } finally {
    releaseDirLock(lockDir);
  }
}

/** 僅在 PID 與 token 皆相符時移除自己的租約檔。 */
export async function releaseWorkerLease(ctx: TaskContext, worker: string, token: string): Promise<void> {
  if (!worker || !token) return;
  const lockDir = getWorkersLockDir(ctx.worktreeRoot);
  await acquireDirLock(lockDir, { worker, action: 'release-lease' }, { rejectLabel: '實作者鎖' });
  try {
    const leasePath = getWorkerLeasePath(ctx.worktreeRoot, worker);
    const existing = readJsonLoose(leasePath);
    if (existing && existing.pid === process.pid && existing.token === token) {
      fs.rmSync(leasePath, { force: true });
    }
  } finally {
    releaseDirLock(lockDir);
  }
}

/**
 * 執行 `wait --next` 每輪開頭的 1～4 步：更新心跳、檢查輪替與接班者、滿載與多出來的對話。
 */
export async function stepWorkerBeforeWaitRound(
  ctx: TaskContext,
  worker: string,
  limits: WorkerLimits,
): Promise<WaitStepResult> {
  return withWorkerLockAndHeartbeat<WaitStepResult>(ctx, { worker, action: 'wait-step' }, () => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const statePath = getWorkerStatePath(ctx.worktreeRoot, worker);
    const record = readWorkerRecordStrict(ctx.worktreeRoot, worker) || createFreshWorkerRecord(worker, nowIso);
    record.heartbeatAt = nowIso;
    record.lastPollAt = nowIso;

    if (record.role === 'retired') {
      return { result: { action: 'retire', code: 4, reason: `${worker} 已是退休狀態` } };
    }

    const { records } = listAllWorkerRecordsSafe(ctx.worktreeRoot);
    const isSuccessor = (other: WorkerRecord): boolean =>
      other.name !== worker && isWorkerAlive(other, nowMs, limits) && !shouldWorkerRotate(other, nowMs, limits);

    const elapsedHours = Math.max(0, (nowMs - Date.parse(record.startedAt)) / (60 * 60 * 1000));
    const shouldRetire = shouldWorkerRotate(record, nowMs, limits);
    let overdue = false;

    if (shouldRetire) {
      const hasSuccessor = records.some(isSuccessor);
      if (hasSuccessor) {
        if (record.claims.length === 0) {
          record.role = 'retired';
          record.retiredAt = nowIso;
          record.tickets = {};
          writeJsonAtomic(statePath, record);
          const reasons: string[] = [];
          if (record.finished.length >= limits.rotateAfterTickets) {
            reasons.push(`已完成 ${record.finished.length}／${limits.rotateAfterTickets} 張`);
          }
          if (elapsedHours >= limits.rotateAfterHours) {
            reasons.push(`已執行 ${elapsedHours.toFixed(1)}／${limits.rotateAfterHours} 小時`);
          }
          return {
            result: { action: 'retire', code: 4, reason: reasons.join('、') },
            writtenRecord: record,
          };
        }
        writeJsonAtomic(statePath, record);
        return {
          result: {
            action: 'busy',
            code: 6,
            message: `${worker} 已達輪替條件且有接班者，但手上仍有 ${record.claims.map((n) => `#${n}`).join('、')}，請先完成手上的單。`,
          },
          writtenRecord: record,
        };
      }

      if (!record.overdueSince) {
        record.overdueSince = nowIso;
      }
      overdue = true;
    }

    if (record.claims.length >= limits.maxTickets) {
      writeJsonAtomic(statePath, record);
      return {
        result: {
          action: 'busy',
          code: 6,
          overdue,
          message: `${worker} 手上已有 ${record.claims.length}／${limits.maxTickets} 張單，已滿載，請先完成手上的單。`,
        },
        writtenRecord: record,
      };
    }

    if (record.claims.length === 0) {
      const activeWithRoom = records.find(
        (other) =>
          isSuccessor(other) &&
          isWorkerPollFresh(other, nowMs, limits) &&
          other.claims.length > 0 &&
          other.claims.length < limits.maxTickets,
      );
      if (activeWithRoom) {
        writeJsonAtomic(statePath, record);
        return {
          result: {
            action: 'extra',
            code: 5,
            overdue,
            message: `${activeWithRoom.name} 仍在線且手上尚有空位（${activeWithRoom.claims.length}／${limits.maxTickets}），${worker} 為多出來的對話，收工結束。`,
          },
          writtenRecord: record,
        };
      }
    }

    writeJsonAtomic(statePath, record);
    return { result: { action: 'proceed', overdue }, writtenRecord: record };
  });
}

/** `start` 或 `resume` 成功後將單號記進實作者的 `claims` 與 `tickets`（設 `implementing`）並從他處移除。 */
export async function recordWorkerClaim(
  ctx: TaskContext,
  { worker, issueNum }: { worker: string; issueNum: number },
): Promise<void> {
  await withWorkerLockAndHeartbeat<void>(ctx, { worker, issueNum, action: 'claim' }, () => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const limits = loadWorkerLimits(ctx.config);
    const dir = getWorkersDir(ctx.worktreeRoot);
    const extraRecords: WorkerRecord[] = [];
    for (const entry of listWorkerEntries(ctx.worktreeRoot)) {
      const otherName = entry.name.slice(0, -'.json'.length);
      if (otherName === worker) continue;
      const other = removeIssueFromWorkerFile(path.join(dir, entry.name), otherName, issueNum);
      if (other && isWorkerAlive(other, nowMs, limits)) {
        extraRecords.push(other);
      }
    }

    const statePath = getWorkerStatePath(ctx.worktreeRoot, worker);
    const record = readWorkerRecordStrict(ctx.worktreeRoot, worker) || createFreshWorkerRecord(worker, nowIso);
    if (!record.claims.includes(issueNum)) {
      record.claims.push(issueNum);
    }
    applyTicketPhaseUpdate(record.tickets, String(issueNum), {
      phase: 'implementing',
      nowIso,
      resetAgent: true,
    });
    record.heartbeatAt = nowIso;
    writeJsonAtomic(statePath, record);
    return { result: undefined, writtenRecord: record, extraRecords };
  });
}

/** `submit` 成功後將單號從 `claims` 移至 `finished`、保留在 `tickets` 並設為 `submitted`。 */
export async function recordWorkerSubmit(
  ctx: TaskContext,
  { worker, issueNum, addedLines = 0 }: { worker: string; issueNum: number; addedLines?: number },
): Promise<void> {
  await withWorkerLockAndHeartbeat<void>(ctx, { worker, issueNum, action: 'submit' }, () => {
    const nowIso = new Date().toISOString();
    const statePath = getWorkerStatePath(ctx.worktreeRoot, worker);
    const record = readWorkerRecordStrict(ctx.worktreeRoot, worker) || createFreshWorkerRecord(worker, nowIso);
    record.claims = record.claims.filter((n) => n !== issueNum);
    if (!record.finished.includes(issueNum)) {
      record.finished.push(issueNum);
      record.businessLines += Math.max(0, Number(addedLines) || 0);
    }
    applyTicketPhaseUpdate(record.tickets, String(issueNum), {
      phase: 'submitted',
      nowIso,
    });
    record.heartbeatAt = nowIso;
    writeJsonAtomic(statePath, record);
    return { result: undefined, writtenRecord: record };
  });
}

/** `finish` 完成或釋放單據時，從所有實作者紀錄的 `claims` 與 `tickets` 移除該單並同步活著者的心跳。 */
export async function releaseTicketFromWorkers(ctx: TaskContext, issueNum: number): Promise<void> {
  if (!fs.existsSync(getWorkersDir(ctx.worktreeRoot))) return;
  await withWorkerLockAndHeartbeat<void>(ctx, { issueNum, action: 'release-ticket' }, () => {
    const nowMs = Date.now();
    const limits = loadWorkerLimits(ctx.config);
    const dir = getWorkersDir(ctx.worktreeRoot);
    const extraRecords: WorkerRecord[] = [];
    for (const entry of listWorkerEntries(ctx.worktreeRoot)) {
      const name = entry.name.slice(0, -'.json'.length);
      const updated = removeIssueFromWorkerFile(path.join(dir, entry.name), name, issueNum);
      if (updated && isWorkerAlive(updated, nowMs, limits)) {
        extraRecords.push(updated);
      }
    }
    return { result: undefined, extraRecords };
  });
}

/** `accept` 開始或結束時從實作者紀錄找交件者更新階段並送心跳；找不到時安全略過。 */
export async function setAcceptTicketPhase(
  ctx: TaskContext,
  issueNum: number,
  submitter: string,
  phase: TicketPhase,
): Promise<void> {
  if (!fs.existsSync(getWorkersDir(ctx.worktreeRoot))) return;
  await withWorkerLockAndHeartbeat<void>(ctx, { issueNum, action: 'accept-phase' }, () => {
    const { records } = listAllWorkerRecordsSafe(ctx.worktreeRoot);
    const ticketKey = String(issueNum);
    const matches = records.filter(
      (rec) => rec.claims.includes(issueNum) || Object.hasOwn(rec.tickets, ticketKey),
    );
    if (matches.length === 0) return { result: undefined };

    const target =
      matches.find((rec) => rec.name === submitter) ||
      matches.find((rec) => rec.role === 'active') ||
      matches[0];
    const nowIso = new Date().toISOString();
    applyTicketPhaseUpdate(target.tickets, ticketKey, { phase, nowIso });
    target.heartbeatAt = nowIso;
    writeJsonAtomic(getWorkerStatePath(ctx.worktreeRoot, target.name), target);
    return { result: undefined, writtenRecord: target };
  });
}

/** 產生 `status` 指令的「實作者」段落輸出行（不含任何內部資料夾名稱）。 */
export function formatWorkersStatusLines(ctx: TaskContext): string[] {
  const lines = ['\n=== 實作者 ==='];
  const { records, broken } = listAllWorkerRecordsSafe(ctx.worktreeRoot);
  if (records.length === 0 && broken.length === 0) {
    lines.push('（無）');
    return lines;
  }

  const nowMs = Date.now();
  const limits = loadWorkerLimits(ctx.config);
  for (const w of records) {
    const statusLabel = w.role === 'retired' ? '已退休' : isWorkerAlive(w, nowMs, limits) ? '活著' : '無心跳';
    const overdueTag = w.role === 'active' && w.overdueSince ? '｜該輪替續做' : '';
    const claimsText = w.claims.length > 0 ? w.claims.map((n) => `#${n}`).join('、') : '無';
    lines.push(
      `- ${w.name} [${statusLabel}${overdueTag}]：手上 ${claimsText}｜完成 ${w.finished.length} 張｜累計 ${w.businessLines} 行｜最後心跳 ${w.heartbeatAt}`,
    );
  }
  for (const name of broken) {
    lines.push(`- ${name} [紀錄壞掉]`);
  }
  return lines;
}
