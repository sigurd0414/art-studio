# 決策紀錄

| 項目 | 內容 |
| :--- | :--- |
| 最後確認 | 2026-11-28 |

新的在上。每筆寫：日期、決定、誰決定、出處。需求方自己的決定（例如素材要什麼效果）記在需求方倉庫，這裡只記會影響部門做法的部分並附出處。

| 日期 | 決定 | 決定者 | 出處 |
| :--- | :--- | :--- | :--- |
| 2026-11-28 | 需求單部門檔改用 `task merge <N> --after-request` 合併，取代 `git merge --no-ff` 過渡做法 | Claude（總規劃，ADR-001 修訂） | ADR-001 第 2 節第 6 點、agent-office#115 |
| 2026-11-28 | `project.config.json` 登記「美編」角色（`designer`，代號字首 `G`，只接 `role:designer`）；套件雜務單沒有角色標籤，由 G1 以協調者身分處理 | Claude（總規劃，套件角色目錄設定） | art-studio#11 留言、`AGENTS.md` 專屬規則 |
| 2026-11-28 | 套件轉成引用模式（Home Repo）：工具與通用說明改由 agent-office 的 `kit-stable` 提供，發版即生效，不再逐版升級；不開 `specLinkage`（需求方的單沒有規格標籤） | 使用者（agent-office ADR-007）；設定細節 Claude | art-studio#11、agent-office ADR-007 |
| 2026-11-21 | 部門資產組織：`skills/`、`prompts/`（共用範本＋`batches/` 批次紀錄）、`styles/` 各有 `README.md` 當唯一索引；技能與範本標版本，批次紀錄合併後凍結；成品不進本倉庫；需求單上的部門檔等需求方判通過後由總規劃 `git merge --no-ff` 併入 `main`（工具支援前的過渡做法） | Claude（總規劃，`AGENTS.md` 第 3 節授權範圍） | ADR-001、S-001 |
| 2026-11-21 | 素材只要 GPT 原圖直接縮放：不取格、不換色、不限色、不加外框、不縮圖；去背只去洋紅與裁透明邊 | 使用者（需求方 agent-office 定案） | agent-office ADR-006、art-studio#1 內文 |
| 2026-11-21 | art-studio 成為美編部門倉庫，用初始化套件開局；需求方在本倉庫開單，成品交需求方 `media` 分支，驗收與關單權在需求方，視覺類由使用者本人確認 | 使用者 | agent-office ADR-004、`AGENTS.md` 第 10 節 |
| 2026-11-21 | 美編由使用者 Mac 上的 Codex（ChatGPT）擔任，對外稱 G1；產圖只用內建生圖技能，不寫程式呼叫生圖 API、不買素材包 | 使用者 | agent-office 決策紀錄、`AGENTS.md` 第 10 節 |

## 仍待確認

- 美編上崗測試要不要做（Codex 桌面版 vs `codex exec` 命令列版）。
