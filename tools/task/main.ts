// @module templates/bin/task/main
// @role 通用 task 工具命令列進入點：解析指令與參數、檢查基本用法並委派執行
// @why 將指令層與純判斷核心 lib.ts 串接為單一 CLI 工具，依設定支援單倉庫與多倉庫流程
// @forbid 禁止繞過子模組檢查或在此檔案寫入專案專屬特例

import { normalizeSessionId } from './lib.ts';
import { cmdAccept } from './cli/accept.ts';
import { cmdAgentCheck } from './cli/agents.ts';
import { cmdDocsCheck } from './cli/docs.ts';
import { cmdGateCheck } from './cli/gate.ts';
import { cmdMine, cmdScopeCheck, cmdStatus } from './cli/inspect.ts';
import { cmdKitCheck } from './cli/kitcheck.ts';
import { cmdKitOutdated } from './cli/kitoutdated.ts';
import { cmdFinish, cmdResume, cmdStart, cmdSubmit } from './cli/lifecycle.ts';
import { cmdMerge } from './cli/merge.ts';
import { cmdPropose } from './cli/propose.ts';
import { CliUsageError, TaskFailure, loadTaskContext, usageError } from './cli/runtime.ts';
import { cmdWait } from './cli/wait.ts';
import {
  MAX_TICKET_AGENT_CHARS,
  MAX_TICKET_NOTE_CHARS,
  TICKET_PHASES,
  countUnicodeChars,
  isTicketPhase,
} from './cli/heartbeat.ts';
import { cmdHeartbeat, cmdWorkerName, isValidWorkerName } from './cli/workers.ts';
import type {
  HeartbeatCommandArgs,
  ParsedCliCommand,
  ProposeArea,
  ProposeCommandArgs,
  ProposeRole,
  TicketPhase,
} from './types.ts';

const USAGE = [
  '用法：node task.mjs <start|resume|submit|finish|scope-check|status|mine|worker-name|heartbeat|wait|accept|merge|propose|kit-check|kit-outdated|agent-check|docs-check|gate-check> [選項]',
  '  wait --next --worker <代號> [--interval-sec 60] [--timeout-sec 300]',
  '  wait <N> [--since <ISO時間>] [--interval-sec 60] [--timeout-sec 7200] [--worker <代號>]',
  '  heartbeat --worker <代號> [--ticket <N> --phase <階段> [--agent <稱呼>] [--note <一句話>]]',
  '  accept <N> --as <驗收員代號> [--no-post]',
  '  merge <N> [--override <理由>] [--dry-run]',
  '  propose --title <標題> --target <規則或工具> --what <發生什麼> --suggest <建議> [--area rule|tool|template|other] [--ref <#N 或網址>]... [--role planner|implementer] [--worker <代號>] [--dry-run]',
  '  docs-check [--since <commit>]',
  '  gate-check [--staged | --range <基準>..<目標>] [--repo <name>] [--commit-msg <檔案>]',
].join('\n');

const WORKER_ALLOWED_CMDS = new Set(['start', 'resume', 'submit', 'heartbeat', 'wait', 'propose']);
const WORKER_REQUIRED_CMDS = new Set(['start', 'resume', 'submit', 'heartbeat']);
const ISSUE_CMDS = new Set(['start', 'resume', 'submit', 'finish', 'scope-check', 'accept', 'merge']);
const DRY_RUN_CMDS = new Set(['start', 'finish', 'merge', 'propose']);
const NO_ARG_CMDS = new Set(['status', 'worker-name', 'kit-check', 'kit-outdated', 'agent-check']);
const KNOWN_CMDS = new Set([
  'start',
  'resume',
  'submit',
  'finish',
  'scope-check',
  'status',
  'mine',
  'worker-name',
  'heartbeat',
  'wait',
  'accept',
  'merge',
  'propose',
  'kit-check',
  'kit-outdated',
  'agent-check',
  'docs-check',
]);
const VERIFIER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const PROPOSE_MAX_TOTAL_CHARS = 4000;
const PROPOSE_REF_ISSUE_RE = /^#[1-9]\d*$/;
const PROPOSE_REF_HTTP_RE = /^https?:\/\/\S+$/;

type ProposeScalarField = 'title' | 'target' | 'what' | 'suggest' | 'area' | 'role';

interface ProposeRawOptions {
  title: string | null;
  target: string | null;
  what: string | null;
  suggest: string | null;
  area: string | null;
  role: string | null;
  refs: string[];
}

const PROPOSE_SCALAR_FLAGS: ReadonlyArray<{ flag: `--${ProposeScalarField}`; field: ProposeScalarField }> = [
  { flag: '--title', field: 'title' },
  { flag: '--target', field: 'target' },
  { flag: '--what', field: 'what' },
  { flag: '--suggest', field: 'suggest' },
  { flag: '--area', field: 'area' },
  { flag: '--role', field: 'role' },
];

function isProposeArea(value: string): value is ProposeArea {
  return value === 'rule' || value === 'tool' || value === 'template' || value === 'other';
}

function isProposeRole(value: string): value is ProposeRole {
  return value === 'planner' || value === 'implementer';
}

function takeOptionValue(argv: readonly string[], index: number, flagName: string): string {
  if (index + 1 >= argv.length) {
    usageError(`用法錯誤：${flagName} 缺少參數值\n${USAGE}`);
  }
  return argv[index + 1];
}

function parseNonNegativeNumber(raw: string, flagName: string): number {
  const text = String(raw ?? '').trim();
  if (!text) {
    usageError(`用法錯誤：${flagName} 缺少數值\n${USAGE}`);
  }
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) {
    usageError(`用法錯誤：${flagName} 必須是非負數字（收到「${raw}」）\n${USAGE}`);
  }
  return n;
}

function parsePositiveIssueNum(rawNum: string): number {
  if (!/^[1-9]\d*$/.test(rawNum)) {
    usageError(`用法錯誤：單號必須是正整數（收到「${rawNum}」）\n${USAGE}`);
  }
  const issueNum = Number(rawNum);
  if (!Number.isSafeInteger(issueNum)) {
    usageError(`用法錯誤：單號超出安全整數範圍（收到「${rawNum}」）\n${USAGE}`);
  }
  return issueNum;
}

type MatchedProposeOption =
  | { kind: 'ref'; value: string; consumed: number }
  | { kind: 'scalar'; field: ProposeScalarField; value: string; consumed: number };

function matchProposeValueOption(argv: readonly string[], index: number): MatchedProposeOption | null {
  const arg = argv[index];
  if (arg === '--ref') {
    return { kind: 'ref', value: takeOptionValue(argv, index, '--ref'), consumed: 1 };
  }
  if (arg.startsWith('--ref=')) {
    return { kind: 'ref', value: arg.slice('--ref='.length), consumed: 0 };
  }
  for (const { flag, field } of PROPOSE_SCALAR_FLAGS) {
    if (arg === flag) {
      return { kind: 'scalar', field, value: takeOptionValue(argv, index, flag), consumed: 1 };
    }
    if (arg.startsWith(`${flag}=`)) {
      return { kind: 'scalar', field, value: arg.slice(flag.length + 1), consumed: 0 };
    }
  }
  return null;
}

function readRequiredProposeField(raw: string | null, field: 'title' | 'target' | 'what' | 'suggest'): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    usageError(`用法錯誤：propose 缺少必要參數 --${field}\n${USAGE}`);
  }
  return text;
}

function validateProposeArgs(proposeOpts: ProposeRawOptions, worker: string, dryRun: boolean): ProposeCommandArgs {
  const title = readRequiredProposeField(proposeOpts.title, 'title');
  const target = readRequiredProposeField(proposeOpts.target, 'target');
  const what = readRequiredProposeField(proposeOpts.what, 'what');
  const suggest = readRequiredProposeField(proposeOpts.suggest, 'suggest');

  const totalLen = title.length + target.length + what.length + suggest.length;
  if (totalLen > PROPOSE_MAX_TOTAL_CHARS) {
    usageError(
      `用法錯誤：propose 的 --title／--target／--what／--suggest 合計超過 ${PROPOSE_MAX_TOTAL_CHARS} 字（目前 ${totalLen} 字）\n${USAGE}`,
    );
  }

  const areaRaw = proposeOpts.area === null ? 'other' : String(proposeOpts.area).trim();
  if (!isProposeArea(areaRaw)) {
    usageError(`用法錯誤：--area 只接受 rule|tool|template|other（收到「${proposeOpts.area}」）\n${USAGE}`);
  }

  const roleRaw = proposeOpts.role === null ? 'planner' : String(proposeOpts.role).trim();
  if (!isProposeRole(roleRaw)) {
    usageError(`用法錯誤：--role 只接受 planner|implementer（收到「${proposeOpts.role}」）\n${USAGE}`);
  }

  const refs: string[] = [];
  for (const rawRef of proposeOpts.refs) {
    const ref = String(rawRef).trim();
    if (!PROPOSE_REF_ISSUE_RE.test(ref) && !PROPOSE_REF_HTTP_RE.test(ref)) {
      usageError(`用法錯誤：--ref 只接受 #N 或 http(s) 網址（收到「${rawRef}」）\n${USAGE}`);
    }
    refs.push(ref);
  }

  return {
    cmd: 'propose',
    issueNum: null,
    sessionArg: '',
    worker: roleRaw === 'implementer' ? worker : '',
    dryRun,
    note: '',
    title,
    target,
    what,
    suggest,
    area: areaRaw,
    role: roleRaw,
    refs,
  };
}

function validateHeartbeatArgs({
  worker,
  ticketRaw,
  phaseRaw,
  agent,
  hasAgentFlag,
  note,
  hasNoteFlag,
}: {
  worker: string;
  ticketRaw: string | null;
  phaseRaw: string | null;
  agent: string;
  hasAgentFlag: boolean;
  note: string;
  hasNoteFlag: boolean;
}): HeartbeatCommandArgs {
  const hasTicketFields = ticketRaw !== null || phaseRaw !== null || hasAgentFlag || hasNoteFlag;
  if (!hasTicketFields) {
    return {
      cmd: 'heartbeat',
      issueNum: null,
      sessionArg: '',
      worker,
      dryRun: false,
      note: '',
      hasNote: false,
      ticketNum: null,
      phase: null,
      agent: '',
      hasAgent: false,
    };
  }
  if (ticketRaw === null) {
    usageError(`用法錯誤：heartbeat 指定 --phase／--agent／--note 時必須同時指定 --ticket\n${USAGE}`);
  }
  if (phaseRaw === null) {
    usageError(`用法錯誤：heartbeat 指定 --ticket 時必須同時指定 --phase\n${USAGE}`);
  }
  const ticketNum = parsePositiveIssueNum(ticketRaw.trim());
  const phaseTrimmed = phaseRaw.trim();
  if (!isTicketPhase(phaseTrimmed)) {
    usageError(`用法錯誤：--phase 只接受 ${TICKET_PHASES.join('|')}（收到「${phaseRaw}」）\n${USAGE}`);
  }
  const phase: TicketPhase = phaseTrimmed;
  const trimmedAgent = agent.trim();
  if (hasAgentFlag && countUnicodeChars(trimmedAgent) > MAX_TICKET_AGENT_CHARS) {
    usageError(`用法錯誤：--agent 超過 ${MAX_TICKET_AGENT_CHARS} 字上限\n${USAGE}`);
  }
  const trimmedNote = note.trim();
  if (hasNoteFlag && countUnicodeChars(trimmedNote) > MAX_TICKET_NOTE_CHARS) {
    usageError(`用法錯誤：--note 超過 ${MAX_TICKET_NOTE_CHARS} 字上限\n${USAGE}`);
  }
  return {
    cmd: 'heartbeat',
    issueNum: null,
    sessionArg: '',
    worker,
    dryRun: false,
    note: trimmedNote,
    hasNote: hasNoteFlag,
    ticketNum,
    phase,
    agent: trimmedAgent,
    hasAgent: hasAgentFlag,
  };
}

function parseCliArgs(argv: readonly string[]): ParsedCliCommand {
  let dryRun = false;
  let workerFlag: string | null = null;
  let note = '';
  let hasNoteFlag = false;
  let ticketRaw: string | null = null;
  let phaseRaw: string | null = null;
  let agent = '';
  let hasAgentFlag = false;
  let nextMode = false;
  let intervalSec: number | null = null;
  let timeoutSec: number | null = null;
  let since: string | null = null;
  let asFlag: string | null = null;
  let noPost = false;
  let overrideReason: string | null = null;
  const proposeOpts: ProposeRawOptions = {
    title: null,
    target: null,
    what: null,
    suggest: null,
    area: null,
    role: null,
    refs: [],
  };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--next') {
      nextMode = true;
    } else if (arg === '--no-post') {
      noPost = true;
    } else if (arg === '--worker') {
      workerFlag = takeOptionValue(argv, i, '--worker');
      i += 1;
    } else if (arg.startsWith('--worker=')) {
      workerFlag = arg.slice('--worker='.length);
    } else if (arg === '--as') {
      asFlag = takeOptionValue(argv, i, '--as');
      i += 1;
    } else if (arg.startsWith('--as=')) {
      asFlag = arg.slice('--as='.length);
    } else if (arg === '--override') {
      overrideReason = takeOptionValue(argv, i, '--override');
      i += 1;
    } else if (arg.startsWith('--override=')) {
      overrideReason = arg.slice('--override='.length);
    } else if (arg === '--note') {
      note = takeOptionValue(argv, i, '--note');
      hasNoteFlag = true;
      i += 1;
    } else if (arg.startsWith('--note=')) {
      note = arg.slice('--note='.length);
      hasNoteFlag = true;
    } else if (arg === '--ticket') {
      ticketRaw = takeOptionValue(argv, i, '--ticket');
      i += 1;
    } else if (arg.startsWith('--ticket=')) {
      ticketRaw = arg.slice('--ticket='.length);
    } else if (arg === '--phase') {
      phaseRaw = takeOptionValue(argv, i, '--phase');
      i += 1;
    } else if (arg.startsWith('--phase=')) {
      phaseRaw = arg.slice('--phase='.length);
    } else if (arg === '--agent') {
      agent = takeOptionValue(argv, i, '--agent');
      hasAgentFlag = true;
      i += 1;
    } else if (arg.startsWith('--agent=')) {
      agent = arg.slice('--agent='.length);
      hasAgentFlag = true;
    } else if (arg === '--interval-sec') {
      intervalSec = parseNonNegativeNumber(takeOptionValue(argv, i, '--interval-sec'), '--interval-sec');
      i += 1;
    } else if (arg.startsWith('--interval-sec=')) {
      intervalSec = parseNonNegativeNumber(arg.slice('--interval-sec='.length), '--interval-sec');
    } else if (arg === '--timeout-sec') {
      timeoutSec = parseNonNegativeNumber(takeOptionValue(argv, i, '--timeout-sec'), '--timeout-sec');
      i += 1;
    } else if (arg.startsWith('--timeout-sec=')) {
      timeoutSec = parseNonNegativeNumber(arg.slice('--timeout-sec='.length), '--timeout-sec');
    } else if (arg === '--since') {
      since = takeOptionValue(argv, i, '--since');
      i += 1;
    } else if (arg.startsWith('--since=')) {
      since = arg.slice('--since='.length);
    } else if (arg.startsWith('-')) {
      const matched = matchProposeValueOption(argv, i);
      if (matched) {
        if (matched.kind === 'ref') {
          proposeOpts.refs.push(matched.value);
        } else {
          proposeOpts[matched.field] = matched.value;
        }
        i += matched.consumed;
      } else {
        usageError(`用法錯誤：不認得的選項 ${arg}\n${USAGE}`);
      }
    } else {
      positionals.push(arg);
    }
  }

  const cmd = positionals[0] || '';
  if (!KNOWN_CMDS.has(cmd)) {
    usageError(`用法錯誤：${cmd ? `不認得的指令「${cmd}」` : '缺少指令'}\n${USAGE}`);
  }

  const hasProposeFlags =
    proposeOpts.title !== null ||
    proposeOpts.target !== null ||
    proposeOpts.what !== null ||
    proposeOpts.suggest !== null ||
    proposeOpts.area !== null ||
    proposeOpts.role !== null ||
    proposeOpts.refs.length > 0;

  if (dryRun && !DRY_RUN_CMDS.has(cmd)) {
    usageError(`用法錯誤：${cmd} 不支援 --dry-run\n${USAGE}`);
  }
  if (hasNoteFlag && cmd !== 'submit' && cmd !== 'heartbeat') {
    usageError(`用法錯誤：只有 submit 與 heartbeat 支援 --note\n${USAGE}`);
  }
  if ((ticketRaw !== null || phaseRaw !== null || hasAgentFlag) && cmd !== 'heartbeat') {
    usageError(`用法錯誤：只有 heartbeat 支援 --ticket／--phase／--agent\n${USAGE}`);
  }
  if ((nextMode || intervalSec !== null || timeoutSec !== null) && cmd !== 'wait') {
    usageError(`用法錯誤：只有 wait 支援 --next／--interval-sec／--timeout-sec\n${USAGE}`);
  }
  if (since !== null && cmd !== 'wait' && cmd !== 'docs-check') {
    usageError(`用法錯誤：只有 wait 與 docs-check 支援 --since\n${USAGE}`);
  }
  if ((asFlag !== null || noPost) && cmd !== 'accept') {
    usageError(`用法錯誤：只有 accept 支援 --as／--no-post\n${USAGE}`);
  }
  if (overrideReason !== null && cmd !== 'merge') {
    usageError(`用法錯誤：只有 merge 支援 --override\n${USAGE}`);
  }
  if (cmd === 'merge' && overrideReason !== null && !String(overrideReason).trim()) {
    usageError(`用法錯誤：merge 的 --override 理由不可為空\n${USAGE}`);
  }
  if (hasProposeFlags && cmd !== 'propose') {
    usageError(`用法錯誤：只有 propose 支援 --title／--target／--what／--suggest／--area／--ref／--role\n${USAGE}`);
  }
  if (workerFlag !== null && !WORKER_ALLOWED_CMDS.has(cmd)) {
    usageError(`用法錯誤：${cmd} 不支援 --worker\n${USAGE}`);
  }

  let worker = '';
  if (WORKER_ALLOWED_CMDS.has(cmd)) {
    const rawWorker = workerFlag !== null ? workerFlag : process.env.TASK_WORKER;
    worker = typeof rawWorker === 'string' ? rawWorker.trim() : '';
    const proposeRole = cmd === 'propose' ? (proposeOpts.role === null ? 'planner' : proposeOpts.role.trim()) : '';
    const workerRequired =
      WORKER_REQUIRED_CMDS.has(cmd) ||
      (cmd === 'wait' && nextMode) ||
      (cmd === 'propose' && proposeRole === 'implementer');
    if (workerRequired && !isValidWorkerName(worker)) {
      usageError(`用法錯誤：${cmd} 需要符合 A<正整數> 格式的實作者代號（請設定 TASK_WORKER 或傳入 --worker <代號>）\n${USAGE}`);
    }
    const shouldCheckOptionalWorker =
      cmd === 'propose' ? workerFlag !== null : workerFlag !== null || worker !== '';
    if (!workerRequired && shouldCheckOptionalWorker && !isValidWorkerName(worker)) {
      usageError(`用法錯誤：實作者代號必須符合 A<正整數> 格式（收到「${worker}」）\n${USAGE}`);
    }
  }

  if (ISSUE_CMDS.has(cmd)) {
    if (positionals.length !== 2) {
      usageError(`用法錯誤：${cmd} 需要單一正整數單號\n${USAGE}`);
    }
    const issueNum = parsePositiveIssueNum(positionals[1]);
    if (cmd === 'accept') {
      if (asFlag === null || !VERIFIER_NAME_RE.test(asFlag)) {
        usageError(`用法錯誤：accept 需要符合 ^[A-Za-z0-9][A-Za-z0-9-]*$ 格式的 --as <驗收員代號>\n${USAGE}`);
      }
      return { cmd, issueNum, sessionArg: '', worker: '', dryRun: false, note: '', as: asFlag, noPost };
    }
    if (cmd === 'merge') {
      return {
        cmd,
        issueNum,
        sessionArg: '',
        worker: '',
        dryRun,
        note: '',
        override: overrideReason !== null ? String(overrideReason).trim() : null,
      };
    }
    if (cmd === 'start' || cmd === 'resume' || cmd === 'submit' || cmd === 'finish' || cmd === 'scope-check') {
      return { cmd, issueNum, sessionArg: '', worker, dryRun, note };
    }
  } else if (cmd === 'mine') {
    if (positionals.length !== 2 || !normalizeSessionId(positionals[1])) {
      usageError(`用法錯誤：mine 需要負責對話連結或代號\n${USAGE}`);
    }
    return { cmd, issueNum: null, sessionArg: positionals[1], worker, dryRun, note };
  } else if (cmd === 'heartbeat') {
    if (positionals.length !== 1) {
      usageError(`用法錯誤：heartbeat 不接受額外參數\n${USAGE}`);
    }
    return validateHeartbeatArgs({ worker, ticketRaw, phaseRaw, agent, hasAgentFlag, note, hasNoteFlag });
  } else if (NO_ARG_CMDS.has(cmd)) {
    if (positionals.length !== 1) {
      usageError(`用法錯誤：${cmd} 不接受額外參數\n${USAGE}`);
    }
    if (
      cmd === 'status' ||
      cmd === 'worker-name' ||
      cmd === 'kit-check' ||
      cmd === 'kit-outdated' ||
      cmd === 'agent-check'
    ) {
      return { cmd, issueNum: null, sessionArg: '', worker, dryRun, note };
    }
  } else if (cmd === 'propose') {
    if (positionals.length !== 1) {
      usageError(`用法錯誤：propose 不接受額外位置參數\n${USAGE}`);
    }
    return validateProposeArgs(proposeOpts, worker, dryRun);
  } else if (cmd === 'docs-check') {
    if (positionals.length !== 1) {
      usageError(`用法錯誤：docs-check 不接受額外位置參數\n${USAGE}`);
    }
    if (since !== null && !since.trim()) {
      usageError(`用法錯誤：docs-check 的 --since 不可為空\n${USAGE}`);
    }
    return {
      cmd,
      issueNum: null,
      sessionArg: '',
      worker: '',
      dryRun: false,
      note: '',
      since: since ? since.trim() : null,
    };
  } else if (cmd === 'wait') {
    if (nextMode) {
      if (positionals.length !== 1) {
        usageError(`用法錯誤：wait --next 不可同時指定單號\n${USAGE}`);
      }
      if (since !== null) {
        usageError(`用法錯誤：wait --next 不支援 --since\n${USAGE}`);
      }
      const effectiveTimeout = timeoutSec ?? 300;
      if (effectiveTimeout > 300) {
        usageError(`用法錯誤：wait --next 的 --timeout-sec 不得超過 300 秒（收到 ${effectiveTimeout}）\n${USAGE}`);
      }
      return {
        cmd,
        issueNum: null,
        sessionArg: '',
        worker,
        dryRun,
        note,
        nextMode: true,
        intervalSec: intervalSec ?? 60,
        timeoutSec: effectiveTimeout,
        since: null,
      };
    }

    if (positionals.length !== 2) {
      usageError(`用法錯誤：wait 需要單一正整數單號或 --next\n${USAGE}`);
    }
    const issueNum = parsePositiveIssueNum(positionals[1]);
    if (since !== null && (!since.trim() || !Number.isFinite(Date.parse(since)))) {
      usageError(`用法錯誤：--since 必須是有效的 ISO 時間（收到「${since}」）\n${USAGE}`);
    }
    return {
      cmd,
      issueNum,
      sessionArg: '',
      worker,
      dryRun,
      note,
      nextMode: false,
      intervalSec: intervalSec ?? 60,
      timeoutSec: timeoutSec ?? 7200,
      since: since ? since.trim() : null,
    };
  }

  usageError(USAGE);
}

async function main(): Promise<unknown> {
  const argv = process.argv.slice(2);
  if (argv[0] === 'gate-check') {
    return cmdGateCheck(process.cwd(), argv.slice(1));
  }
  const parsed = parseCliArgs(argv);
  if (parsed.cmd === 'kit-check') {
    return cmdKitCheck(process.cwd());
  }
  if (parsed.cmd === 'kit-outdated') {
    return cmdKitOutdated(process.cwd());
  }
  if (parsed.cmd === 'agent-check') {
    return cmdAgentCheck(process.cwd());
  }
  if (parsed.cmd === 'docs-check') {
    return cmdDocsCheck(process.cwd(), { since: parsed.since });
  }
  const ctx = loadTaskContext(process.cwd());

  switch (parsed.cmd) {
    case 'start':
      return cmdStart(ctx, parsed);
    case 'resume':
      return cmdResume(ctx, parsed);
    case 'submit':
      return cmdSubmit(ctx, parsed);
    case 'finish':
      return cmdFinish(ctx, parsed);
    case 'scope-check':
      return cmdScopeCheck(ctx, parsed);
    case 'status':
      return cmdStatus(ctx);
    case 'mine':
      return cmdMine(ctx, parsed);
    case 'worker-name':
      return cmdWorkerName(ctx);
    case 'heartbeat':
      return cmdHeartbeat(ctx, parsed);
    case 'wait':
      return cmdWait(ctx, parsed);
    case 'accept':
      return cmdAccept(ctx, parsed);
    case 'merge':
      return cmdMerge(ctx, parsed);
    case 'propose':
      return cmdPropose(ctx, parsed);
    default:
      usageError(USAGE);
  }
}

try {
  const code = await main();
  process.exitCode = typeof code === 'number' && Number.isInteger(code) ? code : 0;
} catch (err: unknown) {
  if (err instanceof CliUsageError) {
    console.error(err.message);
    process.exitCode = err.code;
  } else if (err instanceof TaskFailure) {
    console.error(err.message);
    process.exitCode = err.code;
  } else {
    throw err;
  }
}
