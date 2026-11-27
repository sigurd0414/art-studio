# S-001：部門資產結構

| 項目 | 內容 |
| :--- | :--- |
| 依據 | [ADR-001](../docs/adr/ADR-001-department-assets.md) |
| 負責 | art-studio 總規劃（claude.ai 專案「art-studio」的對話，https://claude.ai/code/session_014wJVwstFL3pSvKBbsbftWQ） |
| 狀態 | 進行中（T1、T2 完成；T3 補收編） |
| 最後確認 | 2026-11-28 |

## 1. 目標

讓 `skills/`、`prompts/`、`styles/` 照 ADR-001 有索引、有範本、有版本，第三、四批的部門檔收編成固定檔名，之後每張需求單都照同一套寫。

## 2.〔T1〕建立資產結構與索引、收編第三、四批

**單**：art-studio#3（實作：美編 G1）

**要先完成**：art-studio#1、#2 的部門檔已由總規劃合併進 `main`（ADR-001 第 2 節第 6 點）。✅ 2026-11-21 已合併（95bcdc5、b93f5c5）。

**結果**：✅ 2026-11-21 17:3x 合併（a0e9c18）。驗收工具「文件相依」把本規格、ADR-001 與交接文件裡記錄改名前舊路徑的 6 處判為失效引用，屬刻意保留的歷史紀錄，以 override 合併。本任務已凍結。

**要做的事**

1. 建三份索引：`skills/README.md`、`prompts/README.md`、`styles/README.md`。每份一張表，列出該資料夾每個檔（`README.md` 本身除外）：檔名連結、一句話用途、目前版本、最後確認日期。批次紀錄另列一張表：需求方單、部門單、用的範本版本。
2. 改名（用 `git mv`，內容不改，只更新檔內互相引用的路徑）：
   - `prompts/agent-office-batch3.md` → `prompts/batches/agent-office-99.md`
   - `prompts/agent-office-batch4.md` → `prompts/batches/agent-office-100.md`
3. 新增共用提示詞範本 `prompts/agent-office.md`：
   - 開頭表格：`版本`、`最後確認`、`適用`、`不適用`。
   - 版本 1.0：agent-office 第一批（agent-office#92）的共用提示詞，原文照 art-studio#1 內文附錄；寫出處，不另抄第一批的逐件紀錄（連到 agent-office 的 `web/sprites-src/prompts.md`）。
   - 版本 1.1：第三批實際使用的共用前綴（從 `prompts/batches/agent-office-99.md` 逐件提示詞裡共同的那一段取出），以及動畫逐格編輯用的寫法；寫明和 1.0 差在哪、為什麼改。
   - 檔尾「版本紀錄」。
4. 兩份批次紀錄開頭各補一列「範本：`prompts/agent-office.md` 版本 1.x」（只加這一列，其餘內容不改，屬 ADR-001 第 2 節第 4 點允許的修正）。
5. `skills/gpt-original-cutout.md`、`styles/agent-office.md` 開頭改成 ADR-001 第 2 節第 3 點的表格格式，檔尾加「版本紀錄」；內容不改，版本號維持 1.0。
6. 在 `project.config.json` 的 `docRules.registries` 陣列尾端加上下面四筆（本單明確授權只改這一處，其他設定不動）。工具的檔名樣式不支援排除，所以用 `when` 只挑開頭有 `| 版本 |` 表格列（技能、範本、風格）或有「需求來源」（批次紀錄）的檔，`README.md` 開頭不要放 `| 版本 |` 這一列：

```json
{ "id": "skill", "files": "skills/*.md", "when": "^\\| 版本 \\|", "mustAppearIn": ["skills/README.md"] },
{ "id": "prompt-template", "files": "prompts/*.md", "when": "^\\| 版本 \\|", "mustAppearIn": ["prompts/README.md"] },
{ "id": "prompt-batch", "files": "prompts/batches/*.md", "when": "需求來源", "mustAppearIn": ["prompts/README.md"] },
{ "id": "style", "files": "styles/*.md", "when": "^\\| 版本 \\|", "mustAppearIn": ["styles/README.md"] }
```

7. 跑 `node tools/task.mjs docs-check`，必須通過。

**影響範圍**

```
skills/README.md
skills/gpt-original-cutout.md
prompts/README.md
prompts/agent-office.md
prompts/agent-office-batch3.md
prompts/agent-office-batch4.md
prompts/batches/agent-office-99.md
prompts/batches/agent-office-100.md
styles/README.md
styles/agent-office.md
project.config.json
```

**驗收條件**

- [ ] 三份 `README.md` 存在，每個資料夾裡的檔（`README.md` 除外）都列在對應索引，連結都點得開。
- [ ] `prompts/batches/agent-office-99.md`、`prompts/batches/agent-office-100.md` 存在，`git log --follow` 看得到是從舊檔名改過來的；舊檔名已不存在；除了檔內路徑與「範本」那一列外，內容跟改名前逐字相同。
- [ ] `prompts/agent-office.md` 有版本 1.0 與 1.1，各自寫明出處與差異；1.0 的提示詞跟 art-studio#1 內文附錄逐字相同。
- [ ] 每份技能、範本、風格檔開頭都有 `版本`、`最後確認`、`適用`、`不適用`，檔尾有「版本紀錄」。
- [ ] `project.config.json` 只多了上面四筆登記規則；`node tools/task.mjs docs-check` 通過，輸出的 `DOC_RULES=` 含 `skill,prompt-template,prompt-batch,style`。
- [ ] 沒有任何圖片檔進倉庫；沒有改到影響範圍以外的檔。

**不做**

- 不重寫或「改良」既有提示詞與流程內容（改進留給之後的範本新版本）。
- 不把需求方的成品、審查圖或參考圖複製進本倉庫。
- 不改 `docs/`、`specs/`、`AGENTS.md`；`project.config.json` 只加第 6 點的四筆。

## 3.〔T2〕牆面物件方向自檢

**單**：art-studio#4（實作：美編 G1）

**為什麼**：第三批的門（art-studio#1）和第四批 8 件牆面物件（art-studio#2）都因「貼在哪面牆、角度對不對」被需求方退回一次，畫風與比例都沒問題。原因有兩個：共用前綴 1.1 固定寫 `facing bottom-left`，沒有依牆面換方向；交件前也沒有拿需求方場景裡同一面牆的物件並排比對。第二次重交時 G1 附了「與北牆對照物同張」的檢查圖，一次就通過，這個做法要變成固定流程。

**要先完成**：〔T1〕（art-studio#3，已合併）。

**結果**：✅ 2026-11-21 18:1x 合併（驗收證據包 PASS，驗收員 A1-V 逐條通過）。本任務已凍結。

**要做的事**

1. 新增技能 `skills/wall-mounted-orientation.md`（開頭照 ADR-001 第 2 節第 3 點的表格，版本 1.0），寫清楚：
   - 牆面對照表：西牆（畫面左側，牆面朝右下，水平邊往右上升 2:1）、北牆（畫面右側，牆面朝左下，水平邊往右下降 2:1）、地面物件（不貼牆）。等角投影沒有近大遠小。
   - 開工前：從需求單找出每件的牆面；單上沒寫或寫得不清楚，先在單上提問，不要自己猜。
   - 提示詞：方向寫成依牆面替換的一段（見第 2 點），不要沿用別件的方向字樣。
   - 交件前自我檢查：每件和需求方**已核准**的同牆對照物放在同一張預覽圖（同尺度），確認水平邊斜向一致；這張圖跟成品一起交，交件留言附連結；交件表的牆面欄與提示詞方向要和成品一致。
   - 案例：#1 門（應為西牆、畫成正面平視）、#2 8 件（應為北牆、畫成西牆），各一行加連結。
2. 共用範本 `prompts/agent-office.md` 加版本 1.2：把 1.1 前綴裡的 `facing bottom-left` 改成依牆面替換的位置，並附三段可直接替換的英文方向句（西牆、北牆、地面物件）。1.0、1.1 原文不改；檔尾版本紀錄加一列。
3. `skills/gpt-original-cutout.md` 升到版本 1.1：只在流程第 2 步（生成）與第 8 步（審查圖）各加一句「牆面物件照 `skills/wall-mounted-orientation.md`」，其餘內容不改；版本紀錄加一列。
4. 更新 `skills/README.md`、`prompts/README.md` 的版本與新檔列。
5. 跑 `node tools/task.mjs docs-check`，必須通過。

**影響範圍**

```
skills/wall-mounted-orientation.md
skills/gpt-original-cutout.md
skills/README.md
prompts/agent-office.md
prompts/README.md
```

**驗收條件**

- [ ] `skills/wall-mounted-orientation.md` 存在，開頭有 `版本`／`最後確認`／`適用`／`不適用` 表格、檔尾有版本紀錄，內容涵蓋第 1 點五項，案例連結點得開。
- [ ] 牆面對照表的方向與 #1、#2 需求方退回留言一致（西牆往右上升、北牆往右下降）。
- [ ] `prompts/agent-office.md` 有版本 1.2，含三段方向句；1.0、1.1 的提示詞與改前逐字相同。
- [ ] `skills/gpt-original-cutout.md` 版本 1.1，只多兩句引用與一列版本紀錄。
- [ ] 兩份索引已更新；`node tools/task.mjs docs-check` 通過。
- [ ] 沒有圖片進倉庫；沒有改到影響範圍以外的檔（批次紀錄已凍結，不改）。

**不做**

- 不改 `prompts/batches/` 的批次紀錄（ADR-001 第 2 節第 4 點）。
- 不重畫任何素材、不動需求方倉庫。

## 4.〔T3〕收編重畫批次紀錄、補索引漏洞

**單**：art-studio#12（實作：美編 G1；同時當作 #11 轉成引用模式後的第一張試跑單）

**為什麼**：art-studio#5～#10 的部門檔（需求方已判通過，2026-11-28 合併）放在 `prompts/` 底下、用 `agent-office-redraw-*` 命名，沒照 ADR-001 第 2 節第 1 點放進 `prompts/batches/`，也沒列進 `prompts/README.md`。`docs-check` 沒擋下來，因為 `prompt-template` 登記規則只看開頭有 `| 版本 |` 的檔，`prompt-batch` 只看 `prompts/batches/`，放錯位置的批次紀錄兩邊都掃不到。

**要先完成**：art-studio#11（轉成引用模式；本單的工具流程要在新模式下跑一次）。

**要做的事**

1. 用 `git mv` 改名，內容只改檔內互相引用的相對路徑（例如 `agent-office.md` → `../agent-office.md`、`../skills/` → `../../skills/`）：
   | 舊檔名（原在 `prompts/` 底下） | 新檔名 | 部門單／需求方單 |
   | :--- | :--- | :--- |
   | `agent-office-redraw-batch1.md` | `prompts/batches/agent-office-118.md` | #5／agent-office#118 |
   | `agent-office-redraw-batch2.md` | `prompts/batches/agent-office-119.md` | #6／agent-office#119 |
   | `agent-office-redraw-batch3.md` | `prompts/batches/agent-office-120.md` | #7／agent-office#120 |
   | `agent-office-redraw-batch4.md` | `prompts/batches/agent-office-121.md` | #8／agent-office#121 |
   | `agent-office-redraw-batch5.md` | `prompts/batches/agent-office-122.md` | #9／agent-office#122 |
   | `agent-office-redraw-fix-1.md` | `prompts/batches/agent-office-119-fix-1.md` | #10／agent-office#119（同一需求單的第二次需求） |
2. `prompts/README.md` 兩張表補上這六份（批次紀錄的「目前版本」欄填 `—`；範本版本記在批次表）；順手把 #1、#2 兩列的「目前版本」也改成 `—`（#3 合併留言的建議）。
3. `project.config.json` 的 `prompt-template` 登記規則 `when` 改成 `^\\| 版本 \\||需求來源`（本單明確授權只改這一個值），讓放錯在 `prompts/` 底下的批次紀錄也必須登記在索引。
4. `node tools/task.ts docs-check` 通過。

**影響範圍**：以 art-studio#12 內文的「影響範圍」為準（改名前的舊路徑只列在單上，不寫進本規格，以免規格裡出現已刪除檔的路徑）。

**驗收條件**

- [ ] 六份新檔存在、舊檔名不存在，`git log --follow` 看得到改名；除了相對路徑外內容與改名前逐字相同，檔內連結都點得開。
- [ ] `prompts/README.md` 兩張表列出全部八份批次紀錄（含 #1、#2），批次紀錄的「目前版本」欄都是 `—`。
- [ ] `project.config.json` 與 `main` 相比只改了 `prompt-template` 的 `when`；`docs-check` 通過，且把任一份批次紀錄暫時搬回 `prompts/` 底下、不列索引時 `docs-check` 會失敗（驗收員自行試、不提交）。
- [ ] 本單的 `worker-name`、`start`、`submit`、`accept`、逐條對照都在引用模式下完成，驗收員在逐條對照寫一行實際用的套件版本。
- [ ] 沒有圖片；沒有改到影響範圍以外的檔。

**不做**

- 不改批次紀錄的提示詞內容（ADR-001 第 2 節第 4 點）。
