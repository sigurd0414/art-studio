// @module templates/bin/task/cli/heartbeat
// @role 通用 task 工具的協調者心跳上報模組：在實作者紀錄寫入後將最新狀態送往辦公室服務
// @why 將 HTTP 心跳送出、網址解析與逾時靜默忽略集中在獨立模組，避免本機狀態與鎖定流程耦合
// @forbid 禁止在心跳上報失敗或逾時時拋錯中斷 task 指令流程，或寫死特定專案與本機以外的預設網址

import type {
  HeartbeatPayload,
  HeartbeatTicketItem,
  TaskContext,
  TicketPhase,
  WorkerRecord,
} from '../types.ts';

export const DEFAULT_OFFICE_URL = 'http://127.0.0.1:47100';
export const HEARTBEAT_TIMEOUT_MS = 1500;
export const MAX_TICKET_AGENT_CHARS = 40;
export const MAX_TICKET_NOTE_CHARS = 80;

const TICKET_PHASE_MAP: Readonly<Record<TicketPhase, true>> = Object.freeze({
  implementing: true,
  checking: true,
  blocked: true,
  submitted: true,
  verifying: true,
  'awaiting-review': true,
  'verify-failed': true,
});

export const TICKET_PHASES: readonly TicketPhase[] = Object.freeze(
  Object.keys(TICKET_PHASE_MAP) as TicketPhase[],
);

/** 判斷字串是否為 S-033 規定的單階段代碼。 */
export function isTicketPhase(value: unknown): value is TicketPhase {
  return typeof value === 'string' && Object.hasOwn(TICKET_PHASE_MAP, value);
}

/** 依 Unicode 字元數計算長度（避免代理對拆半誤算）。 */
export function countUnicodeChars(text: string): number {
  return [...text].length;
}

/**
 * 解析辦公室服務的心跳目標網址；依序讀取環境變數 `TASK_OFFICE_URL`、設定檔 `officeUrl` 與預設本機網址。
 * 值為 `off`（不分大小寫）或網址格式無效時回傳 `null`（略過不送）。
 */
export function resolveOfficeHeartbeatUrl(ctx: Pick<TaskContext, 'config'> | null | undefined): string | null {
  const envUrl = typeof process.env.TASK_OFFICE_URL === 'string' ? process.env.TASK_OFFICE_URL.trim() : '';
  const cfgUrl = typeof ctx?.config?.officeUrl === 'string' ? ctx.config.officeUrl.trim() : '';
  const rawUrl = envUrl || cfgUrl || DEFAULT_OFFICE_URL;
  if (!rawUrl || rawUrl.toLowerCase() === 'off') return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/api/heartbeat`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function buildHeartbeatTickets(rawTickets: WorkerRecord['tickets'] | undefined): HeartbeatTicketItem[] {
  if (!rawTickets || typeof rawTickets !== 'object' || Array.isArray(rawTickets)) {
    return [];
  }
  const items: HeartbeatTicketItem[] = [];
  for (const [rawKey, entry] of Object.entries(rawTickets)) {
    if (!/^[1-9]\d*$/.test(rawKey)) continue;
    const issueNum = Number(rawKey);
    if (!Number.isSafeInteger(issueNum)) continue;
    if (!entry || typeof entry !== 'object' || !isTicketPhase(entry.phase)) continue;
    if (typeof entry.phaseAt !== 'string' || !entry.phaseAt) continue;

    const item: HeartbeatTicketItem = {
      number: issueNum,
      phase: entry.phase,
      phaseAt: entry.phaseAt,
    };
    if (typeof entry.agent === 'string' && entry.agent) {
      item.agent = entry.agent;
    }
    if (typeof entry.note === 'string' && entry.note) {
      item.note = entry.note;
    }
    items.push(item);
  }
  items.sort((a, b) => a.number - b.number);
  return items;
}

/** 將 `.workers/<代號>.json` 紀錄轉成 S-011／S-033 規定的心跳上報 JSON 本文；無單時不帶 `tickets` 欄位。 */
export function buildHeartbeatPayload(
  ctx: Pick<TaskContext, 'issueRepo'> | null | undefined,
  record: Partial<WorkerRecord> | null | undefined,
): HeartbeatPayload {
  const claims = Array.isArray(record?.claims) ? record.claims : [];
  const finished = Array.isArray(record?.finished) ? record.finished.length : 0;
  const businessLines =
    typeof record?.businessLines === 'number' && Number.isFinite(record.businessLines) && record.businessLines >= 0
      ? record.businessLines
      : 0;
  const at =
    typeof record?.heartbeatAt === 'string' && record.heartbeatAt
      ? record.heartbeatAt
      : new Date().toISOString();

  const payload: HeartbeatPayload = {
    repo: typeof ctx?.issueRepo === 'string' ? ctx.issueRepo : '',
    worker: typeof record?.name === 'string' ? record.name : '',
    role: record?.role === 'retired' ? 'retired' : 'active',
    claims,
    finished,
    businessLines,
    startedAt: typeof record?.startedAt === 'string' ? record.startedAt : at,
    overdueSince: typeof record?.overdueSince === 'string' && record.overdueSince ? record.overdueSince : null,
    at,
  };
  const tickets = buildHeartbeatTickets(record?.tickets);
  if (tickets.length > 0) {
    payload.tickets = tickets;
  }
  return payload;
}

/**
 * 送出一次協調者心跳到辦公室服務；連不上、逾時（1.5 秒）或非 2xx 回應一律靜默略過，不拋錯也不印出任何訊息。
 */
export async function sendWorkerHeartbeat(
  ctx: Pick<TaskContext, 'config' | 'issueRepo'> | null | undefined,
  record: WorkerRecord | null | undefined,
): Promise<void> {
  if (!record || typeof record !== 'object') return;
  const targetUrl = resolveOfficeHeartbeatUrl(ctx);
  if (!targetUrl) return;

  const payload = buildHeartbeatPayload(ctx, record);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (res?.body && typeof res.body.cancel === 'function') {
      await res.body.cancel().catch(() => {});
    }
  } catch {
    // @why 辦公室服務是選配的觀察端；連線失敗、逾時或非 2xx 皆須靜默略過，不得干擾 task 指令流程
  } finally {
    clearTimeout(timer);
  }
}
