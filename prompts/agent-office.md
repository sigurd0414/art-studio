# agent-office 共用提示詞範本

| 項目 | 內容 |
| :--- | :--- |
| 版本 | 1.2 |
| 最後確認 | 2026-11-21 |
| 適用 | agent-office 既有像素畫風、GPT 原圖直接縮放的單件素材與逐格動畫；依需求單附參考圖及物件描述 |
| 不適用 | 另有取格、像素重建、限色要求或其他畫風的需求單；範本不能代替個別單的牆面方向及動畫定位要求 |

## 版本 1.0：第一批共用提示詞

出處：[art-studio#1 內文附錄](https://github.com/sigurd0414/art-studio/issues/1)，與 agent-office 第一批 #92 共用提示詞相同。下段逐字保留附錄原文。第一批逐件紀錄只連到需求方 [web/sprites-src/prompts.md](https://github.com/sigurd0414/agent-office/blob/main/web/sprites-src/prompts.md)，不另複製。

```text
Pixel art game sprite, single object only. Match the attached reference image exactly in style: clean hand-placed pixel art like a classic isometric room asset pack, 2:1 isometric (dimetric) view, crisp 1-pixel dark outline (#14121D) around every shape, flat color fills with at most 3 shades per surface (base, shadow, highlight), no dithering, no texture noise, no wood grain, no gradients, no anti-aliasing, no blur. Every pixel sits on a strict square grid; draw each art pixel as an 8x8 block of one identical color. Centered, filling about 70% of the canvas, on a plain solid magenta (#FF00FF) background, no floor, no shadow on the background, no text, no extra objects.
```

## 版本 1.1：第三批實際使用前綴與動畫寫法

出處：[第三批批次紀錄](batches/agent-office-99.md) 的 `shelf`、`coffee-machine` 等單件完整提示詞；下段擷取各件 `Subject:` 前的共同前綴，未改寫原文。接在前綴後的 `Subject:` 仍由需求單決定；重修的門另採幾何與身份保留提示詞，不宣稱所有物件都套用了這段。

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow.
```

與 1.0 的差異：加上 `Use case` 與參考圖用途，明說只參考風格、材質、線條和比例，不能描圖或裁房間；指定每件只有一個物件、約 8×8 原圖像素塊、原圖留洋紅背景，並明寫不產生可讀文字與浮水印。這些補充來自第三批實際提示詞，目的是讓參考圖與單件主體的角色清楚，減少把房間或參考家具一起生成。這裡的配色與像素風描述是生圖指令，不授權後製限色或取格。

前綴中的 `facing bottom-left` 是第三批原文，不能直接當作每面牆的方向答案。牆面與動作仍照需求單指定；實際採用的逐件方向與重修指令留在批次紀錄。第四批的北牆重修與原 9 件提示詞見[第四批紀錄](batches/agent-office-100.md)。

### 動畫逐格編輯寫法

出處同第三批 `door-open-1` 採用提示詞，逐字保留作已用過的寫法。每次附前格與必要參考；後續格只改指定的活動部分、開啟幅度，固定畫布、靜態框架及座標。物件名稱、牆面、尺寸與幅度要依單填寫，不能照抄門的座標到別的物件。

```text
Use case: precise-object-edit. Frame1 of5 opening animation. Edit reference1 closed door ONLY blue moving door leaf and attached window/handle: swing it inward about20degrees on RIGHT vertical hinges, free LEFT edge moves right/up into doorway revealing narrow dark recess along LEFT jamb. Keep rigid surrounding silver jambs, lintel, threshold, hinge locations, exit sign and supports PIXEL IDENTICAL and at EXACT same coordinates, square1254x1254 magenta canvas. Preserve west-wall2:1 view, all fixed wall-plane edges rise2right/1up. No camera/scale/recenter or color/style change, no new objects. Reference2 old door is orientation only. Original chunky pixel art, pure#FF00FF background.
```

這是相對 1.0 新增的編輯用途：1.0 只描述單件外觀，1.1 另以編輯指令列出活動區、固定區與禁止縮放／置中／改鏡頭，讓逐格動畫沿用母圖座標。生圖工具仍可能產生微差；處理與如實揭露方式沿用[原圖去背流程](../skills/gpt-original-cutout.md)，不能把提示詞要求寫成實際逐像素一致的保證。

## 版本 1.2：依牆面替換方向

依據：art-studio#4、S-001 T2，以及 #1 門與 #2 八件牆面素材的退回案例。保留 1.0、1.1 的歷史原文；新單改用下列前綴，把 `{ORIENTATION}` 整段替換為一段英文方向句，再接該件的 `Subject:`。不可留下替換記號，也不可同時混用兩面牆的方向。

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view {ORIENTATION}, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow.
```

### 西牆方向句

```text
mounted flush on the WEST wall at the LEFT side of the room, with its face oriented toward bottom-right; all top and bottom horizontal edges rise to the RIGHT at a strict 2:1 ratio (two pixels right, one pixel up), left corners lower than right corners; vertical sides are parallel and equal in height, with no perspective convergence
```

### 北牆方向句

```text
mounted flush on the NORTH wall at the RIGHT side of the room, with its face oriented toward bottom-left; all top and bottom horizontal edges descend to the RIGHT at a strict 2:1 ratio (two pixels right, one pixel down), left corners higher than right corners; vertical sides are parallel and equal in height, with no perspective convergence
```

### 地面物件方向句

```text
freestanding on the ground plane, not mounted on any wall; match the approved ground-object reference and the placement specified in the request, using the two 2:1 dimetric ground axes with parallel edges, equal vertical heights and no perspective convergence
```

與 1.1 的差異只有共用前綴的固定 `facing bottom-left` 改成方向替換位置，另補三種方向句；不改原圖保留、畫風、背景與單件限制。開工前先確認需求單的牆面，描述不明先提問，不自行選方向；交件前依[牆面方向自檢](../skills/wall-mounted-orientation.md)將每件與已核准同牆對照物放在同尺度預覽裡，核對成品、牆面欄與提示詞一致，隨交件附圖連結。

## 版本紀錄

| 版本 | 最後確認 | 內容與依據 |
| :--- | :--- | :--- |
| 1.0 | 2026-11-21 | 收錄 art-studio#1 附錄的第一批共用原文；由 art-studio#3 整理索引與出處。 |
| 1.1 | 2026-11-21 | 收錄第三批實際共用前綴與門逐格編輯寫法，說明參考用途、單件約束及版本差異；art-studio#3，S-001 T1。 |
| 1.2 | 2026-11-21 | art-studio#4，S-001 T2：以可替換方向段取代固定朝向，新增西牆／北牆／地面方向句與交件自檢連結；1.0、1.1 原文不變。 |
