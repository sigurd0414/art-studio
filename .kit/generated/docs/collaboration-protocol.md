# 協作協議

| 項目 | 內容 |
| :--- | :--- |
| 版本 | 由初始化套件 v0.2.11 產生 |
| 適用 | art-studio |

本協議只寫「工具管不到、要靠人或 agent 自己做對的事」。工具會自動擋下的檢查（範圍重疊、前置未完成、鎖定檔被改），以工具的錯誤訊息為準。

## 1. 角色

見 `AGENTS.md` 第 2 節。

## 2. 標籤與狀態機

| 類別 | 標籤 |
| :--- | :--- |
| 類型 | `type:feature`、`type:defect`、`type:immunity`（防再犯規則提案）、`type:chore`、`type:kit-feedback`（上游收到的套件回報） |
| 狀態 | `status:needs-acceptance` → `status:ready` → `status:in-progress` → `status:fixed` → 關閉；驗收不過改 `status:rework` |
| 嚴重度（defect） | `severity:blocker`、`severity:major`、`severity:minor` |
| 範圍 | `scope:broad`（大範圍單，需說明理由） |
| 急單 | `priority:rush` |
| 種類 | `kind:no-commit`（只整理本機環境、不產生提交的雜務單） |
| 審查門檻 | `merge:auto`（驗收 PASS 後由協調者自動合併；僅限未改門檻區域、保護檔、自動合併禁止路徑，且無需使用者看圖或核准的單） |
| 倉庫（多倉庫專案才用） | `repo:<代號>`，代號見 `project.config.json` |

同一張單同一時間只能有一個 `status:*` 標籤。

## 3. 單的固定段落

~~~markdown
Claude 負責對話：<主題>（<對話連結>）

## 目標
一句話。

## 必讀
（這張單一定要讀的規格、ADR、規範檔，寫到檔名）

## 影響範圍
```
<路徑>
```
（多倉庫專案寫成 `<倉庫代號>:<路徑>`）

## 鎖定的檔案
鎖定 commit：<sha>
- <驗收測試路徑>

## 要先完成
#<N>

## 驗收條件
- [ ] ...

## 不做
- ...
~~~

- **影響範圍要寫準**：寫到實際會改的檔或最小資料夾；`**` 前面除了容器資料夾（見 `project.config.json` 的 `containerDirs`）外至少再有一層；測試寫到檔名。真的要大範圍，加 `scope:broad` 並寫理由。
- **鎖定測試放哪裡**：實作前就能通過必跑檢查的驗收測試（例如還沒接進 `check.sh` 的測試）放 `main`；會讓 `main` 的必跑檢查失敗的（例如 Rust 測試引用還不存在的函式，整個工作區都編不過），Claude 先推一個只含測試的任務分支 `task/<project>-<N>`，鎖定 commit 寫那個分支上的 commit；`task start` 會從遠端已有的任務分支開始。鎖定前 Claude 先跑排版與靜態檢查。
- **新增能力**的單加一段 `## 三問`：組得出來嗎？能合併嗎？只能新增？
- **有畫面**的單：截圖條件寫明要附「事件時間」與「畫面時間」，驗收員據此判斷畫面是否反映該事件。
- **需要實機**的單：驗收條件分成「自動」與「實機（交給使用者）」兩段。

## 4. 門檻區域（必須先驗收才能動工）

見 `project.config.json` 的 `gatedPaths`（依倉庫特性自動帶入，可依專案需求增減例外）。每項可寫成字串或物件 `{ "path": "...", "on": "add" | "any" }`：

| 寫法 | 意思 |
| :--- | :--- |
| `"specs/"` | 這個資料夾和底下所有檔案 |
| `"src/**/*.ts"` | 符合樣式的檔案：`*` 是同一層內任意字元，`**` 是任意多層 |
| `"README.md"` | 沒有 `*`、結尾沒有 `/`：這個檔案，或以它為名的資料夾底下所有檔案 |
| `"!specs/contracts/*.json"` | 排除：符合的檔案不算門檻，不管寫在清單哪裡 |
| `"server:migrations/"` | 只對 `repos[]` 裡對應的倉庫有效；沒寫倉庫前綴的對所有倉庫有效（排除亦可加前綴，如 `"!migrate:**"`） |
| `{ "path": "app/**/*.ts", "on": "add" }` | 只有**新增**（含改名的新路徑）才算；`on` 預設 `"any"`（新增、修改、刪除都算） |

- **開工與提交要求**：改到門檻區域的單，開工前單的內文必須有非空的 `## 驗收條件`，且有 `鎖定 commit：<sha>`（或 `## 鎖定的檔案` 以「無」開頭）。任務分支上每個改到門檻檔案的提交，訊息都要帶 `Refs: <project>#<單號>`。
- **提交掛鉤（`gate-check`）**：可把 `node tools/task.ts gate-check --staged --commit-msg "$1"` 接在 `commit-msg` 掛鉤，在本機不連 GitHub 即檢查；急修時主旨以 `hotfix:` 開頭放行（隔天補單），`Merge`、`Revert` 開頭同樣放行。也可用 `--range <基準>..<目標>` 與 `--repo <name>`（旁倉可設 `TASK_CONFIG` 指向設定檔）。
- **驗收檢查**：`task accept` 會檢查門檻區域（驗收條件、鎖定紀錄、每個相關提交的 `Refs:`），在證據包列出「門檻區域」結果；其餘（非門檻檔案的小改或微調）可直接做，事後稽核。

## 5. 傳話（全部在 GitHub issue）

- **派工**：Claude 加 `status:ready` 的同一步留派工留言，第一行 `🤖 Claude`、第二行 `📮 派工`，並依影響範圍與風險決定是否加上 `merge:auto`（只給沒碰門檻區域、保護檔或 `autoMergeDenyPaths`，無 `role:*` 與 `needs:*` 標籤，且不需要使用者看圖或核准的低風險單）。
- **提問**：實作者留言（第一行 `🛠️ <代號>`，寫清楚卡在哪、有哪些選項），然後執行 `task wait <N> --worker <代號>` 有上限地等回覆（自動切為 `blocked` 並持續送心跳；收到回覆時切回 `implementing`），不要停下來等人打字。
- **回覆**：Claude 一則留言講完。
- **交件**：`task submit <N>`（檢查範圍與行數、先跑規則檔保護與程式規則（沒過就拒絕交件並列出問題）、推任務分支、留「📦 交件」留言、標 `status:fixed`）。
- **收工**：合併後 `task finish <N>` 清掉工作資料夾與任務分支。
- **驗收**：
  1. 交件後由協調者另外叫起驗收員子代理（不得是實作的同一個子代理），跑 `task accept <N>`。工具在乾淨工作資料夾裡做範圍比對、鎖定檔比對（以單上的鎖定 commit 為準）、規則檔保護、必跑檢查（`acceptCommands` 在暫存區執行，暫存區不會自帶依賴，第一步放依賴安裝；跨倉庫的檢查用 `${ACCEPT_DIR}`／`TASK_ACCEPT_DIR` 找旁邊倉庫，不要從主資料夾推算）、暫時外部服務、效能量測，並把證據包張貼到單上（第一行 `🧪 驗收員`）。
  2. 驗收員另寫一則留言，依驗收條件逐條對照；有畫面時一併做視覺審查。工具結果與它的判斷分開寫。固定格式：第一行 `🧪 驗收員`，接著一行標題 `## 逐條驗收對照：#<N> → PASS`（有任何一條「不通過」就寫 `→ FAIL`；全形或半形冒號皆可，箭頭前後各一個空白），再接逐條表格（狀態欄填「通過」、「不通過」或「待使用者確認」；有「待使用者確認」但其餘都通過時標題仍寫 `PASS`，由規劃者與使用者確認後合併）。
  3. 單有 `merge:auto` 時，驗收 PASS 後由協調者自己執行 `node tools/task.ts merge <N> --worker <代號>`（不接受 `--override`；工具會檢查 `merge:auto`、無 `role:*`／`needs:*`、證據包與逐條對照皆 `PASS` 且無「待使用者確認」、未碰 `gatedPaths`／`protectedPaths`／`autoMergeDenyPaths`、交件者為自己且異於驗收員）；若工具拒絕或沒有 `merge:auto`，照常等 Claude 審證據包、逐條對照與程式差異後用 `node tools/task.ts merge <N>` 合併關單（規劃者合併前要有逐條對照，即最新證據包之後須有 `PASS` 的逐條驗收對照，含「待使用者確認」列仍可合併；證據包或逐條對照未通過／尚未出來但確定要先合併時可加 `--override "<理由>"`），不過就附編號問題清單改 `status:rework`。
  4. Claude 預設不重跑。只有證據包不對勁（數字對不上、結論和內容矛盾、工具報錯），或改到驗簽、權限、密鑰處理（以及有 `sensitive` 標記的倉庫）時才自己重跑。
  5. 效能數字一律由 `task accept` 在同一台機器量，證據包記下機器型號；不採用實作者自己量的數字。
  6. 退回 3 次轉回規劃（拆小或改規格）。
- **零提交雜務單（`kind:no-commit`）**：只整理本機環境、不產生提交的單加 `kind:no-commit` 標籤，內文須有 `## 驗收指令`（程式碼區塊每行寫一條檢查指令）；交件用 `task submit <N> --note "<做了什麼>"`，`task accept` 會在設定檔所在資料夾跑 `## 驗收指令`，`task merge` 不合併倉庫直接關單。

## 6. 常駐接單

目的：使用者只開一次常駐對話，之後不必逐張轉述。

1. 協調者開場跑 `task worker-name` 領代號，之後 `task wait`：它會挑 `status:ready`（有派工留言、前置都已關閉、範圍不和進行中的單重疊）、可接手的 `status:in-progress`（本機紀錄持有者心跳超過 `workerLimits.releaseAfterMinutes` 分鐘或已退休）與 `status:rework` 的單，排序為 `severity:blocker` → 可接手 → `status:rework` → `status:ready`。
2. 接到單後依 `NEXT_KIND` 處理：`start` 跑 `task start <N>`（標 `status:in-progress`、留「🔁 接手」並建工作資料夾）；`resume` 或 `takeover` 跑 `task resume <N>`（退回單改為 `status:in-progress`，`NEXT_KIND=takeover` 時維持 `status:in-progress` 不換標籤並留「🔁 接手（交接自 `<X>`）」；本機已有工作資料夾就沿用，否則從遠端任務分支或 `origin/main` 重建），不在主資料夾切分支。每張單派一個新的實作子代理；`NEXT_KIND=takeover` 時派子代理在沿用或重建的工作資料夾接著做，並先看任務分支上已有的提交與單上留言。可同時接最多 `workerLimits.maxTickets` 張；兩張單改到同一個檔案時，後交件的先合併 `main` 再跑必跑檢查。
3. 沒有單就繼續 `task wait`（每次保證在 5 分鐘內結束），**不因閒置收工**；只有工具回報「別的對話手上有單、最近也有回來找單、這個對話是多出來的」才收工，收工時留一句話。派出實作子代理後不要等它做完，立刻回到下一輪找單。
4. 協調者做滿 `workerLimits.rotateAfterTickets` 張或連續 `workerLimits.rotateAfterHours` 小時，且有別的活著的協調者可以接班時，才在兩張單之間退休，留交接留言後結束；只剩自己時不退休，繼續接單，等新的協調者上線再退休；實作子代理單張超過 `workerLimits.maxBusinessLines` 行就停下建議拆單。
5. **階段心跳與定時回報**：協調者定時送心跳（`task heartbeat --worker <代號>`）；派實作子代理時要給它子代理代號（例如 `A4-1`），並在指令寫明：
   - 開始跑必跑檢查前，執行 `task heartbeat --worker <代號> --ticket <N> --phase checking --agent <子代理代號>` 回報 `checking`。
   - 在單上提問後，執行 `task wait <N> --worker <代號>` 等回覆（等待期間自動設 `blocked` 並持續送心跳；拿到回覆會自動切回 `implementing`）。
   - 實作期間**每 10 分鐘至少回報一次**目前階段（`task heartbeat --worker <代號> --ticket <N> --phase <階段> --agent <子代理代號> [--note "<一句話>"]`），`--agent` 填子代理代號、`--note` 最多 80 字。
   - `start`／`resume` 自動設 `implementing`、`submit` 自動設 `submitted`、`accept` 開始與結束自動設 `verifying` 與 `awaiting-review`／`verify-failed`，`finish`、退休或被別的代號 `resume` 時自動從清單移除。
6. Claude 端：有單在進行時，每 5 分鐘巡一次：回答提問、審證據包、合併並派下一張。

### 協調者開場指示（參考）

開常駐對話時可附上以下指示，讓協調者與子代理依上述規則運作：

> 切回最新 `main` 並跑 `node tools/task.ts worker-name` 領取協調者代號 `A<n>`，之後反覆跑 `node tools/task.ts wait --next --worker A<n> --timeout-sec 300` 找單（先為已關閉的單跑 `finish`）。
> 接到單後依 `NEXT_KIND` 跑 `start`／`resume`（`NEXT_KIND=takeover` 一樣跑 `resume <N>`）建或沿用工作資料夾，每張單派一個實作子代理（代號如 `A<n>-1`；`NEXT_KIND=takeover` 時要它在工作資料夾接著做，並先看任務分支上已有的提交與單上留言），派完立刻回頭找下一張；交件 `submit` 後直接叫驗收員子代理跑 `accept <N> --as A<n>-V`。驗收 PASS 且單有 `merge:auto` 時，由協調者執行 `node tools/task.ts merge <N> --worker A<n>`（若工具拒絕就照常等規劃者處理）。
> 派實作子代理時務必告訴它：① 開始跑必跑檢查時執行 `node tools/task.ts heartbeat --worker A<n> --ticket <N> --phase checking --agent <子代理代號>`；② 在單上提問後用 `node tools/task.ts wait <N> --worker A<n>` 等回覆；③ 每 10 分鐘至少執行一次 `task heartbeat` 回報目前階段並把子代理代號寫進 `--agent`。

## 7. 事件區塊

每則 Claude、實作者、驗收員留言的最後可附一段 HTML 註解（GitHub 上不顯示），讓監控不必猜文字；格式見套件的事件格式說明。

## 8. 多個 Claude 對話

每張單只有一個負責對話（內文第一行），只有它能派工、回答、驗收、關單。接手要先在單上留言「🔁 接手」並改內文。

**跨對話提問要開成單，不要只留言在自己的單**（2026-11-19 起，使用者核准）：要別的 Claude 對話或套件上游回答、決定、處理的事，一律開成**對方看得到的單**——對套件上游用 `task propose`；對同專案的另一個對話，另開一張內文第一行寫明負責對話的單（`type:chore`），把問題寫成可以直接回答的選項。只在自己的追蹤單留言「請某某對話告訴我」，對方不會被通知，兩邊會互相空等。發問後用 `task wait` 等，逾時仍沒回覆就再問一次並在 Agent Office 的決策匣提醒使用者。

## 9. 防再犯

Claude 驗收發現的問題若能通則化，開 `type:immunity` 單提出「規則＋觸發點＋自動檢查」，使用者核准後才落地。規則沒有觸發點與自動檢查，不算落地。

## 10. 規範活性

套件裡每條規則都記在 `docs/rules-registry.md`：觸發點、機器檢查、最後確認日期。每日稽核列出 30 天沒被引用或確認的規則，由 Claude 決定修好觸發點或歸檔。

## 11. 回報給套件上游

規則或工具有問題、或想到別的專案也用得到的改進，用 `task propose` 回報給套件上游（設定的 `kitUpstream`）。只寫摘要並附本專案的單號，不貼程式碼；同一件事工具會自動合併成同一張單。

| 時機 | 誰 | 做什麼 |
| :--- | :--- | :--- |
| 寫防再犯規則（`type:immunity`），且這條規則別的專案也適用 | Claude | `propose --area rule` |
| `task` 工具出錯，或擋下的判斷事後證明是誤判 | 碰到的人 | `propose --area tool`，附那張單 |
| 協調者退休前 | 協調者 | 把這段期間碰到的工具或規則問題各送一則 |
| 改了套件產生的規則檔 | Claude | `propose --area template`，說明為什麼要改 |
| 需要套件上游回答或決定（例如工具行為怎麼處理） | 任何對話 | `propose`，不要只在本專案的單留言 |

## 12. 規則檔大小

各 agent 工具讀規則檔有上限（例如會截斷超過某個大小的檔案），而且上限會隨工具版本改變。套件把上限記在 `kit.json` 的 `agentTools`（含資料來源與查證日期），專案在設定的 `agentTools` 宣告用了哪些工具。`task kit-check` 與改到規則檔的 `task accept` 會依最嚴格的上限檢查；查證日期超過 90 天就提醒重新核對官方文件，有變就用 `task propose` 回報。規則檔放不下時，把細節移到另一份文件並在規則檔留連結，不要刪規則。

## 13. 文件相依

同一件事記在兩份文件，或文件裡引用了別的檔案時，單靠人記很容易一改另一邊就失真。專案在 `project.config.json` 的 `docRules` 設定要掃描的文件路徑與登記關係：

- 新增會被登記的文件類型（例如新的規格、ADR 或對外介面清單）時，要同時在 `project.config.json` 的 `docRules.registries` 宣告它必須登記在哪幾份文件。
- `task docs-check`（加上 `--since <commit>` 還會檢查是否有文件指向已被刪除的檔案）與 `task accept` 會共用同一套檢查；規劃者直接提交到 `main` 前要跑專案的必跑檢查（設定檔 `acceptCommands` 列的指令）；專案沒有必跑檢查腳本時，至少跑 `node tools/task.ts docs-check`，確保 `main` 上的文件連結與登記關係一直是乾淨的。

## 14. 跨專案需求單

- 需求方在 `project.config.json` 的 `externalDepartments` 登記部門（代碼、倉庫、職務）；部門清單只記這一處。
- 需求方 Claude 用 `task request --dept <代碼> --from <原單號> --title <標題> (--body <文字> | --body-file <檔案>)` 在部門倉庫開需求單：內文第一行 `需求來源：<owner>/<repo>#<N>`，一定要有 `## 驗收條件`。工具會在原單留言連結。
- 部門照自己倉庫的規範接單。成品放到需求方約定的位置（例如需求方的 `media` 分支，路徑用需求方單號），在部門單留言 `📦 交件`，並在需求方原單留一則交件留言；跨倉庫留言的身分寫成 `<身分>（<部門倉庫名>）`（例如 `🎨 G1（<部門倉庫名>）`）。
- 需求方 Claude 用 `task wait --dept <代碼> <部門單號>` 等交件或提問。驗收權在需求方：視覺類一定要使用者本人確認。結果用 `task request-result` 回寫（通過就關部門單；退回改 `status:rework`）。部門不得自己關需求單。
- 通過後由需求方把交付物搬進自己的倉庫（實作單），部門倉庫只留該職務的共用資產、技能、提示詞與流程。

## 15. 執行環境

本套件的 `tools/task.ts` 需要 Node `22.18` 以上（直接執行 `.ts`，各平台與終端機用同一行 `node tools/task.ts …`；專案根目錄的 `.nvmrc` 記著這個版本）。

1. **開局與新同事加入時**：先在任何終端機（Mac、Linux、Windows cmd／PowerShell）跑 `node -v`，確認版本達到 Node `22.18` 以上。
2. **沒有 Node 或版本太舊**：
   - Mac：`brew install node`（或 nvm／fnm，進專案資料夾跑 `nvm use`／`fnm use`）。
   - Windows：`winget install OpenJS.NodeJS`（或官方安裝檔）。
   - Linux：發行版套件或 nvm／fnm。
3. **常見問題**：看到 `Unknown file extension ".ts"` 就是 Node 太舊；`node tools/task.ts kit-check` 在版本太舊時列 `NODE-TOO-OLD` 並以 3 結束。
