# agent-office 第四批：牆面與小物件

範本：[prompts/agent-office.md](../agent-office.md) 版本 1.1。

版本：1.1（北牆方向重修）；最後確認日期：2026-11-21。

需求來源：[agent-office#100](https://github.com/sigurd0414/agent-office/issues/100)；部門單：[art-studio#2](https://github.com/sigurd0414/art-studio/issues/2)。

使用內建 imagegen 逐件生成，初版以需求方 reference-office 與第一批核准原圖作風格、線條和比例參考；本次8件改附原圖作身份參考、kanban-board作北牆方向與風格參考，未使用外部生圖 API。沿用[原圖去背流程](https://github.com/sigurd0414/art-studio/blob/f90ab46/skills/gpt-original-cutout.md)與[風格及來源說明](https://github.com/sigurd0414/art-studio/blob/f90ab46/styles/agent-office.md)。

## 交件與保留原圖

成品只交需求方 media 分支 `sigurd0414/agent-office/100/`。`gpt-originals/` 保存工具輸出原檔；`gpt-cutout/` 只移除洋紅背景及裁掉透明邊界，保留原解析度與所有保留像素的 RGBA。沒有取格子、限色、換色、加框或縮圖。下表顯示格數只是建議顯示尺寸，不是轉製後的像素檔。

`compare-<代號>.png` 三欄為 GPT 原圖／去背深色底／去背淺色底。`overview.jpg` 是總覽，`scale-first-and-fourth-batch.png` 把第一批與本批以每顯示格 4 預覽像素放在一起。預覽縮放不影響原檔。`wall-tv-animation.gif` 為兩格電視畫面動畫，使用共同原圖座標，不逐張重新置中；兩格原畫布與裁框相同；生成器造成的機殼局部色階／原生像素微差保留，不共用或合成機殼。`validation.json` 記錄檔案雜湊與逐件檢查結果。

2026-11-21使用者確認畫風及比例，退回8件牆面方向。前版這8件提示詞及成品均採西牆，現已依場景改成北牆：上下邊左高右低，與kanban-board、clock同面；原9件保持不變。`north-wall-direction-check.png` 將8件與這兩個對照物放在同圖供方向審查。牆面物件依表列方向；紙張與收件盤採低平水平面。時鐘只留刻度，沒有指針。紙堆是辦公用紙，與工作票紙堆分開。

## 原解析度與建議顯示格數

|代號|原圖 px|去背 px|建議顯示格數|安裝平面|原圖裁切框 x0,y0,x1,y1|
|---|---|---|---|---|---|
|bar-chart|1254×1254|978×965|48×47|右側北牆／邊線向右下|138,153,1116,1118|
|clock|1216×1293|902×999|26×29|右側北牆／邊線向右下|136,152,1038,1151|
|wall-tv|1254×1254|970×738|60×46|右側北牆／邊線向右下|142,260,1112,998|
|wall-tv-2|1254×1254|970×738|60×46|右側北牆／邊線向右下|142,260,1112,998|
|certificate-frame|1388×1133|979×913|36×34|右側北牆／邊線向右下|204,129,1183,1042|
|wall-art|1254×1254|968×940|44×43|右側北牆／邊線向右下|143,157,1111,1097|
|wall-calendar|1254×1254|966×1073|34×38|右側北牆／邊線向右下|144,108,1110,1181|
|wall-outlet|1254×1254|858×901|18×19|右側北牆／邊線向右下|198,171,1056,1072|
|wall-shelf|1254×1254|1070×773|44×32|右側北牆／邊線向右下|91,258,1161,1031|
|wall-notice|1435×1096|741×756|60×61|右側北牆／邊線向右下|347,188,1088,944|
|first-aid|1159×1356|761×888|26×30|右側北牆／邊線向右下|199,245,960,1133|
|in-tray|1454×1082|1172×487|36×15|水平桌面／地面|141,301,1313,788|
|rework-tray|1454×1082|1171×485|36×15|水平桌面／地面|142,303,1313,788|
|folder|1659×948|1325×584|28×12|水平桌面／地面|162,186,1487,770|
|ticket-paper|1774×887|1472×575|28×11|水平桌面／地面|137,200,1609,775|
|ticket-stack|1619×971|1097×612|30×17|水平桌面／地面|251,208,1348,820|
|paper-stack|1385×1136|1103×844|36×28|水平桌面／地面|143,171,1246,1015|

## 採用的完整提示詞

每段對應一張原圖；參考圖僅供風格與比例，不裁切或描摹他人作品。

### bar-chart

```text
Use case: precise-object-edit. Redraw ONLY orientation of reference1 asset onto NORTH wall (right side room wall), same plane as reference2 kanban-board. Top and bottom horizontal edges descend to RIGHT, left corners HIGHER than right, strict2right/1down dimetric. Both vertical sides parallel and equal height, NO perspective convergence. Match clean chunky hand-placed pixel style, dark#14121D outline, flatshades, no texture/blur/dither/gradient. Preserve original object's identity/material/colors/details, not its wrong west-wall angle. One object only centered on pure#FF00FF square1254x1254 canvas, no room/wall/floor/castshadow/text/watermark. Reference2 only orientation/style, do not include it. Subject: silver-framed bar chart, off-white paper,dark L-shaped axis, three green/red/gold bars. All chart paper edges and frame rails run DOWN toRIGHT, same as kanban. No numbers.
```

### clock

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one flat round analog office clock mounted on RIGHT/NORTH wall: face plane has top/bottom tangent direction DOWNWARD toRIGHT (+0.5 slope). Steel-gray beveled ring, off-white face, four dark tick marks at12/3/6/9. NO hands, NO digits, no text. Round face appears perspective ellipse, no stand wall shadow or props. Projected about28x30 logical cells.
```

### wall-tv

```text
Use case: precise-object-edit. Redraw ONLY orientation of reference1 asset onto NORTH wall (right side room wall), same plane as reference2 kanban-board. Top and bottom horizontal edges descend to RIGHT, left corners HIGHER than right, strict2right/1down dimetric. Both vertical sides parallel and equal height, NO perspective convergence. Match clean chunky hand-placed pixel style, dark#14121D outline, flatshades, no texture/blur/dither/gradient. Preserve original object's identity/material/colors/details, not its wrong west-wall angle. One object only centered on pure#FF00FF square1254x1254 canvas, no room/wall/floor/castshadow/text/watermark. Reference2 only orientation/style, do not include it. Subject: one wall mounted black widescreen TV with steel rim, dark screen showing cyan task rows and small green/yellow status squares, greenpowerLED. Horizontal TV top and bottom edges DOWN toRIGHT, equal vertical sides. This frame0 is fixed master for a2frame animation; generous square margins, no stand.
```

### wall-tv-2

```text
Use case: precise-object-edit. Make frame1 of2 from reference1 NORTH-wall TV frame0. Change ONLY cyan row completion lengths inside screen: top row55%, second90%, third45%, fourth80%; small status lights remain. Preserve black/silver TV enclosure, LED, screen boundary, outline, perspective, position, native1254square canvas and every background pixel EXACTLY unchanged. Top/bottom edges descendRIGHT, same as reference2 kanban direction. No recenter, resize, new text or object, pure#FF00FF background. Same pixel art.
```

### certificate-frame

```text
Use case: precise-object-edit. Redraw ONLY orientation of reference1 asset onto NORTH wall (right side room wall), same plane as reference2 kanban-board. Top and bottom horizontal edges descend to RIGHT, left corners HIGHER than right, strict2right/1down dimetric. Both vertical sides parallel and equal height, NO perspective convergence. Match clean chunky hand-placed pixel style, dark#14121D outline, flatshades, no texture/blur/dither/gradient. Preserve original object's identity/material/colors/details, not its wrong west-wall angle. One object only centered on pure#FF00FF square1254x1254 canvas, no room/wall/floor/castshadow/text/watermark. Reference2 only orientation/style, do not include it. Subject: golden wood framed certificate, cream paper with gray abstract lines and a gold seal/red ribbons lowerRIGHT; no readable letters. Reorient entire frame,paper,seal to NORTH wall. Top/bottom rails descendRIGHT; keep wide landscape certificate identity.
```

### wall-art

```text
Use case: precise-object-edit. Redraw ONLY orientation of reference1 asset onto NORTH wall (right side room wall), same plane as reference2 kanban-board. Top and bottom horizontal edges descend to RIGHT, left corners HIGHER than right, strict2right/1down dimetric. Both vertical sides parallel and equal height, NO perspective convergence. Match clean chunky hand-placed pixel style, dark#14121D outline, flatshades, no texture/blur/dither/gradient. Preserve original object's identity/material/colors/details, not its wrong west-wall angle. One object only centered on pure#FF00FF square1254x1254 canvas, no room/wall/floor/castshadow/text/watermark. Reference2 only orientation/style, do not include it. Subject: Silver/gray framed landscape painting, cyan sky, ochre hills and dark evergreen trees. Frame and painted scene both project onto NORTH wall, rails descendRIGHT.
```

### wall-calendar

```text
Use case: precise-object-edit. Redraw ONLY orientation of reference1 asset onto NORTH wall (right side room wall), same plane as reference2 kanban-board. Top and bottom horizontal edges descend to RIGHT, left corners HIGHER than right, strict2right/1down dimetric. Both vertical sides parallel and equal height, NO perspective convergence. Match clean chunky hand-placed pixel style, dark#14121D outline, flatshades, no texture/blur/dither/gradient. Preserve original object's identity/material/colors/details, not its wrong west-wall angle. One object only centered on pure#FF00FF square1254x1254 canvas, no room/wall/floor/castshadow/text/watermark. Reference2 only orientation/style, do not include it. Subject: Wall spiral calendar, red header, gray metal top rings, cream month grid with sparse cyan/yellow/green squares, no numbers. Whole sheet/header/rows top edge descendRIGHT, equal vertical sides; no stand.
```

### wall-outlet

```text
Use case: precise-object-edit. Redraw ONLY orientation of reference1 asset onto NORTH wall (right side room wall), same plane as reference2 kanban-board. Top and bottom horizontal edges descend to RIGHT, left corners HIGHER than right, strict2right/1down dimetric. Both vertical sides parallel and equal height, NO perspective convergence. Match clean chunky hand-placed pixel style, dark#14121D outline, flatshades, no texture/blur/dither/gradient. Preserve original object's identity/material/colors/details, not its wrong west-wall angle. One object only centered on pure#FF00FF square1254x1254 canvas, no room/wall/floor/castshadow/text/watermark. Reference2 only orientation/style, do not include it. Subject: One small cream wall outlet plate with two stacked darkgray sockets atLEFT, white rocker switchRIGHT and tiny green indicator. Entire plate lies NORTH wall, top/bottom edges descendRIGHT; sockets and switch on same plane. No wire.
```

### wall-shelf

```text
Use case: precise-object-edit. Redraw ONLY orientation of reference1 asset onto NORTH wall (right side room wall), same plane as reference2 kanban-board. Top and bottom horizontal edges descend to RIGHT, left corners HIGHER than right, strict2right/1down dimetric. Both vertical sides parallel and equal height, NO perspective convergence. Match clean chunky hand-placed pixel style, dark#14121D outline, flatshades, no texture/blur/dither/gradient. Preserve original object's identity/material/colors/details, not its wrong west-wall angle. One object only centered on pure#FF00FF square1254x1254 canvas, no room/wall/floor/castshadow/text/watermark. Reference2 only orientation/style, do not include it. Subject: One orange wood wall shelf with two metal triangular brackets, three upright red/teal/gold books and tiny succulent in terracotta pot on it. Rear long edge where shelf attaches to NORTH wall descendsRIGHT, FRONT long edge parallel also descendsRIGHT. Shelf short depth edges riseRIGHT toward back. Books stand on shelf with front spines matching NORTH plane. Preserve recognizable original shelf design, no wall.
```

### wall-notice

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one flat wall-mounted notice board for RIGHT/NORTH wall. TOP and BOTTOM long edges slope DOWNWARD toRIGHT at2:1, left cornersHIGHER than right. Warm caramel wood frame, light cork/off-white backing, four colored blank pinned index cards pale cyan/gold/green/coral and tiny red pin dots. No lettering. About60x46 logical cells, smaller than first batch kanban107x100. No wall stand feet or background shadow.
```

### first-aid

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one small flat wall-mounted first-aid cabinet for RIGHT/NORTH wall: top/bottom edges slopeDOWN toRIGHT at2:1; off-white shallow enamel box, cool-gray side and bevel, bold simple RED medical plus emblem centered on front, small dark latch on side. No letters brand or text. About26x30 logical art cells. No wall stand feet or other props.
```

### in-tray

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: ONE EMPTY low-profile office document IN-TRAY basket, viewed from above in2:1 dimetric. Off-white/light-gray thin tray base, very low back/side lips, front lip cut away, open empty interior. Footprint about36 logical cells wide x22 projected deep; side lips ONLY2-3 art pixels tall. It MUST look like a FLAT paper tray, never a cube, drawer or deep bin. Dark clean stepped outline, cool-gray inner shading. No papers contents, labels, table floor shadow or props. Keep low horizontal silhouette.
```

### rework-tray

```text
Use case: precise-object-edit. Create ONE rework-tray game sprite using in-tray.png as exact shape/low-profile reference; office reference STYLE ONLY. Same empty FLAT shallow paper tray: low2-3art-pixel side/back lips and cutaway front, same footprint, perspective, outline and relative canvas placement. Change tray material from off-white to bright alert-red painted metal with salmon top-rim highlight and darkred interior shadow. Keep flat thin silhouette, never a cube/deep bin. No paper, text, labels or extra props; pure #FF00FF background. Generate directly with built-in image tool, no procedural recolor.
```

### folder

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: ONE flat closed office file folder lying on a tabletop plane, light warm-cream/manila single thin document sleeve with small raised tab on back-left edge, crisp dark one-art-pixel outline, subtle palegray lower edge ONLYone artpixel thick. True2:1 dimetric diamond/parallelogram footprint about28x16 logical cells. It MUST read as thin flat folder, no upright face, no cube, no stack or thick binder. No letters symbols table floor shadow or props.
```

### ticket-paper

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: ONE SINGLE white work-order paper sheet lying FLAT on horizontal desk plane in2:1 dimetric view. Thin diamond/parallelogram about28x14 logical cells, paper thickness ONLYone artpixel, small folded corner, one tiny pale-cyan header rectangle and three short gray abstract line marks so it is visibly a form, NO legible letters or numbers. Wide silhouette width abouttwice projected height. Not a cube, not a book, not a stack; no upright side wall. No desk floor cast shadow or other objects.
```

### ticket-stack

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: ONE small FLAT stack of exactlyFOUR white work-order sheets lying on horizontal desk plane, same2:1 dimetric diamond footprint, visible thin gray horizontal layer separations, one pale-cyan header block and three short gray marks on top sheet, tiny folded corner. About30x18 logical cells; physical sheet thickness total3artpixels maximum, wide and low, never cube/book/box. No readable letters, desk floor shadows or props.
```

### paper-stack

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: ONE small floor/tabletop group of office printer paper supplies: two low sky-blue-and-white wrapped paper reams below, one modest stack of loose white copy paper on top with crisp horizontal sheet-layer lines, tiny yellow divider tab sticking out. Flat horizontal rectangular paper sheets in2:1 dimetric perspective are clearly readable, no tall cubic boxes, no upright books or papers. Overall about34x28 logical cells, low squat silhouette, each sheetthin. No letters brands text, table floor cast shadow or other props.
```
