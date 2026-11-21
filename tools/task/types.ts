// @module templates/bin/task/types
// @role 通用 task 工具共用型別定義：集中定義設定檔、倉庫、單與留言、實作者紀錄、差異統計、執行期上下文及證據包型別
// @forbid 禁止在此模組放入執行期程式碼、使用未定型別逃生寫法、或依賴檔案系統與外部程序

export type TaskConfigErrorCode = 'no-repos' | 'bad-repo-key' | 'duplicate-repo-key' | 'bad-entry';

export interface RepoConfigEntry {
  readonly name?: string;
  readonly key?: string | number;
  readonly path?: string;
  readonly traits?: readonly string[];
  readonly containerDirs?: readonly string[];
  readonly owns?: readonly string[];
}

export interface FileLineLimitsConfig {
  readonly soft?: number;
  readonly hard?: number;
}

export interface WorkerLimitsConfig {
  readonly maxTickets?: number;
  readonly maxBusinessLines?: number;
  readonly rotateAfterTickets?: number;
  readonly rotateAfterHours?: number;
  readonly heartbeatAliveMinutes?: number;
  readonly pollFreshMinutes?: number;
  readonly releaseAfterMinutes?: number;
}

export interface AcceptCommandConfig {
  readonly name?: string;
  readonly run?: string;
  readonly timeoutSec?: number;
  readonly when?: string | readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface ForbiddenPatternConfig {
  readonly id?: string;
  readonly regex?: string;
  readonly flags?: string;
  readonly paths?: readonly string[];
  readonly message?: string;
}

export interface CodeRulesConfig {
  readonly headerTags?: readonly string[];
  readonly headerLines?: number;
  readonly sourceExtensions?: readonly string[];
  readonly headerExempt?: readonly string[];
  readonly forbiddenPatterns?: readonly ForbiddenPatternConfig[];
  readonly generatedPaths?: readonly string[];
  readonly artifactPatterns?: readonly string[];
  readonly escapeFunction?: string;
}

export interface DocPendingConfig {
  readonly when?: string;
  readonly maxDays?: number;
}

export interface DocRegistryConfig {
  readonly id?: string;
  readonly files?: string | readonly string[];
  readonly when?: string;
  readonly keyPattern?: string;
  readonly mustAppearIn?: readonly string[];
  readonly pending?: DocPendingConfig;
}

export interface DocRulesConfig {
  readonly registries?: readonly DocRegistryConfig[];
  readonly scan?: readonly string[];
  readonly ignore?: readonly string[];
  readonly whenLines?: number;
}

export interface ExternalDepartmentConfig {
  readonly code?: string;
  readonly repo?: string;
  readonly role?: string;
  readonly label?: string;
}

export interface ExternalDepartment {
  readonly code: string;
  readonly repo: string;
  readonly role: string;
  readonly label?: string;
}

export interface ProjectConfig {
  readonly kitVersion?: string;
  readonly project?: string;
  readonly issueRepo?: string;
  readonly kitUpstream?: string;
  readonly officeUrl?: string;
  readonly repos: readonly RepoConfigEntry[];
  readonly externalDepartments?: readonly ExternalDepartmentConfig[];
  readonly sensitive?: boolean;
  readonly public?: boolean;
  readonly containerDirs?: readonly string[];
  readonly gatedPaths?: readonly string[];
  readonly acceptancePaths?: readonly string[];
  readonly protectedPaths?: readonly string[];
  readonly autoMergeDenyPaths?: readonly string[];
  readonly sharedGenerated?: readonly string[];
  readonly evidencePaths?: readonly string[];
  readonly threeQuestionsPaths?: readonly string[];
  readonly generatedPaths?: readonly string[];
  readonly lineCountExclude?: readonly string[];
  readonly checks?: readonly string[];
  readonly branchPattern?: string;
  readonly fileLineLimits?: FileLineLimitsConfig;
  readonly businessLineLimit?: number;
  readonly reworkGraceMinutes?: number;
  readonly workerLimits?: WorkerLimitsConfig;
  readonly acceptCommands?: readonly AcceptCommandConfig[];
  readonly codeRules?: CodeRulesConfig;
  readonly docRules?: DocRulesConfig;
}

export interface RepoEntry {
  key: string;
  name: string;
  path: string;
}

export interface RuntimeRepo extends RepoEntry {
  mainRepoPath: string;
}

export interface ScopeEntry {
  raw: string;
  repo: string;
  pattern: string;
}

export interface ScopeParseResult {
  hasSection: boolean;
  entries: ScopeEntry[];
  invalidRepo: string | null;
}

export type ScopeInput =
  | readonly (string | ScopeEntry)[]
  | { readonly entries?: readonly (string | ScopeEntry)[] }
  | null
  | undefined;

export type GitHubLabel = string | { readonly name?: string | null } | null | undefined;

export interface IssueWithLabels {
  readonly labels?: readonly GitHubLabel[];
}

export interface GitHubIssue {
  number: number;
  state: string;
  title?: string | null;
  body?: string | null;
  labels?: readonly GitHubLabel[];
  pull_request?: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface GitHubComment {
  id?: number;
  body?: string | null;
  created_at?: string;
  updated_at?: string;
  user?: { readonly login?: string } | null;
}

export type CommentRole = 'planner' | 'verifier' | 'implementer' | 'user';

export type OwnedIssueAction = '驗收' | '回覆' | '認領' | '寫驗收';

export interface OwnedIssueClassification {
  action: OwnedIssueAction | null;
  reason: string;
}

export interface ScopePrecisionViolation {
  raw: string;
  reason: string;
}

export type ScopePrecisionResult =
  | {
      ok: true;
      violations: [];
    }
  | {
      ok: false;
      reasonCode: 'broad-scope';
      violations: ScopePrecisionViolation[];
      reason: string;
    };

export type ThreeQuestionsResult =
  | {
      ok: true;
      required: boolean;
      count: number;
    }
  | {
      ok: false;
      required: true;
      reasonCode: 'missing-three-questions' | 'incomplete-three-questions';
      count: number;
      reason: string;
    };

export type EvaluateStartFailureCode =
  | 'not-found'
  | 'closed'
  | 'not-ready'
  | 'no-dispatch'
  | 'invalid-scope'
  | 'missing-scope'
  | 'broad-scope'
  | 'missing-three-questions'
  | 'incomplete-three-questions'
  | 'prereq-open'
  | 'scope-overlap';

export interface EvaluateStartOptions {
  issueNum?: number;
  issuesLookup?: Map<number, GitHubIssue> | readonly GitHubIssue[] | null;
  activeIssues?: readonly GitHubIssue[];
  comments?: readonly GitHubComment[] | null;
  requireDispatch?: boolean;
  requireScope?: boolean;
}

export type EvaluateStartResult =
  | {
      ok: true;
      scope: ScopeParseResult;
      prereqNums: number[];
      dispatchComment: GitHubComment | null;
      threeQuestions: ThreeQuestionsResult;
    }
  | {
      ok: false;
      reasonCode: EvaluateStartFailureCode;
      reason: string;
      violations?: ScopePrecisionViolation[];
      threeQuestions?: ThreeQuestionsResult;
      prereqNum?: number;
      conflictIssueNum?: number;
    };

export type EvaluateResumeFailureCode = 'not-found' | 'closed' | 'not-rework' | 'no-rework-note' | 'grace';

export interface EvaluateResumeOptions {
  comments?: readonly GitHubComment[];
  nowMs?: number;
  graceMs?: number;
}

export type EvaluateResumeResult =
  | {
      ok: true;
      pendingComments: GitHubComment[];
    }
  | {
      ok: false;
      reasonCode: EvaluateResumeFailureCode;
      reason: string;
    };

export interface GitNumstatEntry {
  path: string;
  oldPath: string | null;
  added: number;
  deleted: number;
  binary: boolean;
}

export interface UnifiedDiffLines {
  addedByFile: Map<string, string[]>;
  deletedByFile: Map<string, string[]>;
}

export interface GitAheadBehind {
  ahead: number;
  behind: number;
}

export interface RepoDiffEntry {
  repo: string;
  numstatEntries: readonly GitNumstatEntry[];
  diffByFile?: UnifiedDiffLines;
}

export interface AnalyzeBusinessLinesOptions {
  repoEntries?: readonly RepoDiffEntry[];
  defaultLimit?: number;
  limitOverride?: number | null;
}

export interface BusinessLineFileStat {
  repo: string;
  path: string;
  raw: string;
  rawAdded: number;
  movedCount: number;
  added: number;
}

export interface BusinessLineAnalysis {
  limit: number;
  totalAdded: number;
  totalRawAdded: number;
  totalMoved: number;
  exceeded: boolean;
  files: BusinessLineFileStat[];
}

export type MainAutoSyncAction = 'skip' | 'noop' | 'pull';

export type MainAutoSyncReasonCode =
  | 'not-git-repo'
  | 'status-error'
  | 'not-main'
  | 'dirty'
  | 'no-origin'
  | 'fetch-failed'
  | 'no-origin-main'
  | 'cannot-ff'
  | 'behind'
  | 'up-to-date';

export interface MainAutoSyncInput {
  exists?: boolean;
  isGitRepo?: boolean;
  hasOrigin?: boolean;
  branch?: string;
  statusOk?: boolean;
  porcelain?: string;
  fetchOk?: boolean;
  fetchError?: string;
  hasOriginMain?: boolean;
  aheadCount?: number;
  behindCount?: number;
}

export interface MainAutoSyncDecision {
  action: MainAutoSyncAction;
  reasonCode: MainAutoSyncReasonCode;
  shouldNotify: boolean;
  behindCount: number;
  message: string | null;
}

export interface TaskLib {
  readonly repos: RepoEntry[];
  readonly defaultRepo: string | null;
  readonly businessLineLimit: number;
  readonly softFileLineLimit: number;
  readonly reworkGraceMs: number;
  commentRole: (comment: GitHubComment | null | undefined) => CommentRole;
  findLatestDispatchComment: (comments: readonly GitHubComment[] | null | undefined) => GitHubComment | null;
  parseScopeSection: (body: string | null | undefined) => ScopeParseResult;
  scopeEntriesOverlap: (entryA: ScopeEntry | null | undefined, entryB: ScopeEntry | null | undefined) => boolean;
  fileMatchesScopeEntry: (fileEntry: ScopeEntry | null | undefined, scopeEntry: ScopeEntry | null | undefined) => boolean;
  findOutOfScopeFiles: <T extends ScopeEntry>(changedFiles: readonly T[] | null | undefined, scopeEntries: ScopeInput) => T[];
  checkScopePrecision: (
    scope: ScopeInput,
    labels?: readonly GitHubLabel[],
    body?: string | null,
  ) => ScopePrecisionResult;
  requiresThreeQuestionsCheck: (scope: ScopeInput, labels?: readonly GitHubLabel[]) => boolean;
  checkThreeQuestions: (
    scope: ScopeInput,
    labels?: readonly GitHubLabel[],
    body?: string | null,
  ) => ThreeQuestionsResult;
  evaluateIssueCanStart: (
    target: GitHubIssue | null | undefined,
    options?: EvaluateStartOptions,
  ) => EvaluateStartResult;
  evaluateIssueCanResume: (
    target: GitHubIssue | null | undefined,
    options?: EvaluateResumeOptions,
  ) => EvaluateResumeResult;
  isIssueOwnedBySession: (issue: GitHubIssue | null | undefined, sessionId: string) => boolean;
  classifyOwnedIssue: (
    issue: GitHubIssue | null | undefined,
    comments: readonly GitHubComment[] | null | undefined,
  ) => OwnedIssueClassification;
  parseBusinessLineLimit: (body: string | null | undefined, defaultLimit?: number) => number;
  isExcludedFromBusinessLineCount: (filePath: string) => boolean;
  analyzeBusinessAddedLines: (options?: AnalyzeBusinessLinesOptions) => BusinessLineAnalysis;
}

export interface GitCommandResult {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
}

export interface PathRuleEntry {
  repo: string | null;
  pattern: string;
}

export interface ChangedFileEntry extends ScopeEntry {
  repoName: string;
}

export type RepoDiffWithLockResult =
  | {
      ok: true;
      repoLockFullSha: string | null;
      lockMainBaseSha: string | null;
      lockedAcceptanceFiles: string[];
      fromLockPaths: Set<string>;
      changedFiles: ChangedFileEntry[];
      numstatEntries: GitNumstatEntry[];
      diffByFile: UnifiedDiffLines;
    }
  | {
      ok: false;
      errorKind: 'name' | 'numstat' | 'u0';
      errorDetail: string;
    };

export interface CollectRepoDiffWithLockOptions {
  lib: TaskLib;
  repo: RuntimeRepo;
  diffRange: string;
  headSha: string;
  originMainSha: string | null;
  lockSha: string | null;
  acceptanceRules: readonly PathRuleEntry[] | null;
}

export interface FileLineWarning {
  raw: string;
  lineCount: number;
}

export interface IssueRepoDiffInfo {
  repo: RuntimeRepo;
  baseSha: string | null;
  headSha: string;
  wtPath: string | null;
  fromLockPaths: Set<string>;
}

export interface IssueDiffSummary {
  checkedBranches: number;
  changedFiles: ChangedFileEntry[];
  fileLineWarnings: FileLineWarning[];
  lineCheck: BusinessLineAnalysis;
  repoDiffs: IssueRepoDiffInfo[];
}

export interface CollectIssueDiffSummaryOptions {
  issueNum: number;
  targetBody?: string | null;
  branchName: string;
  taskDir: string;
  checkSoftLineLimit?: boolean;
}

export interface DirLockOptions {
  rejectLabel?: string;
  defaultTimeoutMs?: number;
}

export interface LockOwnerMeta {
  issueNum?: number;
  action?: string;
  verifier?: string;
  worker?: string;
  [key: string]: unknown;
}

export interface TaskContext {
  config: ProjectConfig;
  configPath: string;
  configDir: string;
  project: string;
  issueRepo: string;
  externalDepartments: ExternalDepartment[];
  branchPattern: string;
  worktreeRoot: string;
  repos: RuntimeRepo[];
  repoByKey: Map<string, RuntimeRepo>;
  lib: TaskLib;
}

export type WorkerRole = 'active' | 'retired';

export type TicketPhase =
  | 'implementing'
  | 'checking'
  | 'blocked'
  | 'submitted'
  | 'verifying'
  | 'awaiting-review'
  | 'verify-failed';

export interface WorkerTicketState {
  phase: TicketPhase;
  phaseAt: string;
  agent?: string;
  note?: string;
}

export interface HeartbeatTicketItem {
  number: number;
  phase: TicketPhase;
  phaseAt: string;
  agent?: string;
  note?: string;
}

export interface WorkerRecord {
  name: string;
  role: WorkerRole;
  startedAt: string;
  heartbeatAt: string;
  lastPollAt?: string;
  retiredAt?: string;
  overdueSince?: string | null;
  claims: number[];
  finished: number[];
  businessLines: number;
  tickets: Record<string, WorkerTicketState>;
}

export interface WorkerLimits {
  maxTickets: number;
  rotateAfterTickets: number;
  rotateAfterHours: number;
  heartbeatAliveMinutes: number;
  pollFreshMinutes: number;
  releaseAfterMinutes: number;
}

export type TakeoverEligibilityFailureCode =
  | 'not-found'
  | 'closed'
  | 'not-in-progress'
  | 'unclaimed'
  | 'self-claimed'
  | 'worker-active';

export type TakeoverEligibilityResult =
  | {
      ok: true;
      prevWorker: string;
      prevRole: WorkerRole;
      prevHeartbeatAt: string;
    }
  | {
      ok: false;
      reasonCode: TakeoverEligibilityFailureCode;
      reason: string;
    };

export interface WorkerLease {
  worker: string;
  pid: number;
  startedAt: string;
  token: string;
}

export interface HeartbeatPayload {
  repo: string;
  worker: string;
  role: WorkerRole;
  claims: number[];
  finished: number;
  businessLines: number;
  startedAt: string;
  overdueSince: string | null;
  at: string;
  tickets?: HeartbeatTicketItem[];
}

export type AcceptCommandStatus = 'PASS' | 'FAIL' | '逾時' | '不適用';

export interface AcceptCommandResult {
  name: string;
  status: AcceptCommandStatus;
  sha256: string | null;
  tail: string;
}

export interface AcceptFileLineFinding {
  raw: string;
  lineCount: number;
  kind: 'soft' | 'hard';
  limit: number;
}

export interface AcceptRepoResult {
  repo: RuntimeRepo;
  ok: boolean;
  errorReason: string;
  baseSha: string | null;
  headSha: string | null;
  wtPath: string | null;
  repoLockFullSha: string | null;
  fromLockPaths: Set<string>;
  changedFiles: ChangedFileEntry[];
  scopeViolations: string[];
  protectedViolations: string[];
  lockViolations: string[];
  fileLineFindings: AcceptFileLineFinding[];
  diffEntry: RepoDiffEntry | null;
  commandResults: AcceptCommandResult[];
}

export interface SiblingCheckout {
  repo: RuntimeRepo;
  sha: string;
  wtPath: string;
}

export interface RuleCheckOutcome {
  status: string;
  passed: boolean;
  outputLines: string[];
  existingOutputLines?: string[];
}

export interface EvidencePackageParams {
  issueNum: number;
  verdict: 'PASS' | 'FAIL';
  verifier: string;
  submitter: string;
  branchName: string;
  lockSha: string | null;
  scopeStatus: string;
  protectedStatus: string;
  gateStatus: string;
  lockStatus: string;
  lineCheck: BusinessLineAnalysis;
  fileLineStatus: string;
  codeRuleStatus: string;
  docRuleStatus: string;
  ruleSizeStatus: string;
  siblingCheckouts?: readonly SiblingCheckout[];
  envText: string;
  repoResults: readonly AcceptRepoResult[];
  outOfScopeList: readonly string[];
  protectedAndLockList: readonly string[];
  exceededFileList: readonly string[];
  codeRuleOutputLines: readonly string[];
  docRuleOutputLines: readonly string[];
  docRuleExistingOutputLines?: readonly string[];
  ruleSizeOutputLines: readonly string[];
}

export interface NoCommitCommandResult {
  cmd: string;
  status: 'PASS' | 'FAIL' | '逾時';
  sha256: string | null;
  tail: string;
}

export interface NoCommitEvidenceParams {
  issueNum: number;
  verdict: 'PASS' | 'FAIL';
  verifier: string;
  submitter: string;
  lineLimit: number;
  envText: string;
  commandResults: readonly NoCommitCommandResult[];
  missingCommands: boolean;
}

export type ProposeArea = 'rule' | 'tool' | 'template' | 'other';
export type ProposeRole = 'planner' | 'implementer';

export interface IssueCommandArgs {
  cmd: 'start' | 'resume' | 'submit' | 'finish' | 'scope-check';
  issueNum: number;
  sessionArg: string;
  worker: string;
  dryRun: boolean;
  note: string;
}

export interface NoArgCommandArgs {
  cmd: 'status' | 'worker-name' | 'kit-check' | 'kit-outdated' | 'agent-check';
  issueNum: null;
  sessionArg: string;
  worker: string;
  dryRun: boolean;
  note: string;
}

export interface HeartbeatCommandArgs {
  cmd: 'heartbeat';
  issueNum: null;
  sessionArg: string;
  worker: string;
  dryRun: boolean;
  note: string;
  hasNote: boolean;
  ticketNum: number | null;
  phase: TicketPhase | null;
  agent: string;
  hasAgent: boolean;
}

export interface MineCommandArgs {
  cmd: 'mine';
  issueNum: null;
  sessionArg: string;
  worker: string;
  dryRun: boolean;
  note: string;
}

export interface AcceptCommandArgs {
  cmd: 'accept';
  issueNum: number;
  sessionArg: string;
  worker: string;
  dryRun: false;
  note: string;
  as: string;
  noPost: boolean;
}

export interface MergeCommandArgs {
  cmd: 'merge';
  issueNum: number;
  sessionArg: string;
  worker: string;
  dryRun: boolean;
  note: string;
  override: string | null;
}

export interface DocsCheckCommandArgs {
  cmd: 'docs-check';
  issueNum: null;
  sessionArg: string;
  worker: string;
  dryRun: false;
  note: string;
  since: string | null;
}

export type RequestResultValue = 'pass' | 'fail';

export interface WaitCommandArgs {
  cmd: 'wait';
  issueNum: number | null;
  sessionArg: string;
  worker: string;
  dryRun: boolean;
  note: string;
  nextMode: boolean;
  dept: string | null;
  intervalSec: number;
  timeoutSec: number;
  since: string | null;
}

export interface RequestCommandArgs {
  cmd: 'request';
  issueNum: null;
  sessionArg: string;
  worker: string;
  dryRun: boolean;
  note: string;
  dept: string;
  from: number;
  title: string;
  body: string | null;
  bodyFile: string | null;
}

export interface RequestResultCommandArgs {
  cmd: 'request-result';
  issueNum: number;
  sessionArg: string;
  worker: string;
  dryRun: false;
  note: string;
  dept: string;
  result: RequestResultValue;
}

export interface ProposeCommandArgs {
  cmd: 'propose';
  issueNum: null;
  sessionArg: string;
  worker: string;
  dryRun: boolean;
  note: string;
  title: string;
  target: string;
  what: string;
  suggest: string;
  area: ProposeArea;
  role: ProposeRole;
  refs: string[];
}

export type ParsedCliCommand =
  | IssueCommandArgs
  | NoArgCommandArgs
  | HeartbeatCommandArgs
  | MineCommandArgs
  | AcceptCommandArgs
  | MergeCommandArgs
  | DocsCheckCommandArgs
  | WaitCommandArgs
  | RequestCommandArgs
  | RequestResultCommandArgs
  | ProposeCommandArgs;

export interface KitManifest {
  kitVersion: string;
  nodeMin?: string;
  project?: unknown;
  traits?: unknown;
  files: Record<string, unknown>;
  kept?: string[];
  [key: string]: unknown;
}

export interface AcceptCommandRule {
  readonly name: string;
  readonly run: string;
  readonly timeoutSec: number;
  readonly when: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface AcceptOutcome {
  passed: boolean;
  evidence: string;
}

export interface CreatedWorktree {
  mainRepoPath: string;
  wtPath: string;
}

export interface InspectAffectedRepoOptions {
  ctx: TaskContext;
  repo: RuntimeRepo;
  branchName: string;
  wtPath: string;
  scope: ScopeParseResult;
  lockSha: string | null;
  protectedRules: readonly PathRuleEntry[];
  acceptanceRules: readonly PathRuleEntry[];
  hardFileLineLimit: number;
  createdWorktrees: CreatedWorktree[];
}

export interface CheckoutSiblingRepoOptions {
  repo: RuntimeRepo;
  wtPath: string;
  createdWorktrees: CreatedWorktree[];
}

export type RegisterAcceptChildFn = (pid: number | undefined) => () => void;

export interface AcceptProcessGroupOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  logPath: string;
  timeoutSec: number;
  registerChild: RegisterAcceptChildFn;
  shell?: string;
}

export interface AcceptChildExecResult {
  exitCode: number;
  signal: string | null;
  timedOut: boolean;
}

export interface AcceptLogSection {
  label: string;
  sha256: string | null;
  tail: string;
}

export interface RunNoCommitAcceptOptions {
  ctx: TaskContext;
  issueNum: number;
  target: GitHubIssue;
  verifier: string;
  submitter: string;
  logDir: string;
  registerChild: RegisterAcceptChildFn;
  cleanupAll: () => void;
}
