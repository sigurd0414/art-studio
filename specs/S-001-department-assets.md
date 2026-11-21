# S-001：部門資產結構

| 項目 | 內容 |
| :--- | :--- |
| 依據 | [ADR-001](../docs/adr/ADR-001-department-assets.md) |
| 負責 | art-studio 總規劃（claude.ai 專案「art-studio」的對話，https://claude.ai/code/session_014wJVwstFL3pSvKBbsbftWQ） |
| 狀態 | 進行中 |
| 最後確認 | 2026-11-21 |

## 1. 目標

讓 `skills/`、`prompts/`、`styles/` 照 ADR-001 有索引、有範本、有版本，第三、四批的部門檔收編成固定檔名，之後每張需求單都照同一套寫。

## 2.〔T1〕建立資產結構與索引、收編第三、四批

**單**：art-studio#3（實作：美編 G1）

**要先完成**：art-studio#1、#2 的部門檔已由總規劃合併進 `main`（ADR-001 第 2 節第 6 點）。✅ 2026-11-21 16:3x 已合併（95bcdc5、b93f5c5）。

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
