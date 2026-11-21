# agent-office 第三批提示詞與交付表

範本：[prompts/agent-office.md](../agent-office.md) 版本 1.1。

版本：1.1（門西牆角度重修）。最後確認日期：2026-11-21。

需求來源：[agent-office#99](https://github.com/sigurd0414/agent-office/issues/99)，部門需求：[art-studio#1](https://github.com/sigurd0414/art-studio/issues/1)。本檔為部門保留的提示詞資產，成品只交需求方 media 分支。

## 生成與整理

使用 Codex 內建 image_gen，一次一件；初版附 reference-office 風格圖與第一批物件。門重修改附舊門作西牆方向參考、第一批櫃子作風格參考，後續開門格附新版前格與關門格。同組動畫附前一格。沒有程式呼叫生圖 API、沒有付費素材包，也沒有從參考圖切圖或描圖。

原圖原檔保留。去背僅以洋紅色鍵設透明及裁透明邊框，所有留下的 RGBA 樣本均與原圖相同。不取格、不換色、不限色、不加外框、不縮放。通用方法見 `../../skills/gpt-original-cutout.md`；來源與使用條款見 `../../styles/agent-office.md`。

## 交付位置與尺寸

需求方 `sigurd0414/agent-office` 的 `media` 分支根路徑：`sigurd0414/agent-office/99/`。每件為 `gpt-originals/<代碼>.png` 與 `gpt-cutout/<代碼>.png`。本表顯示格數只是場景縮放建議，沒有寫回 PNG。

| 代碼 | 原圖尺寸 px | 去背尺寸 px | 建議顯示格數 寬×高 | 原圖裁框 x,y,right,bottom |
| :--- | :--- | :--- | :--- | :--- |
| `door` | 1254×1254 | 466×1136 | 67×164 | 394,55,860,1191 |
| `door-open-1` | 1254×1254 | 466×1137 | 67×164 | 394,54,860,1191 |
| `door-open-2` | 1254×1254 | 467×1135 | 67×164 | 394,55,861,1190 |
| `door-open-3` | 1254×1254 | 466×1135 | 67×164 | 394,55,860,1190 |
| `door-open-4` | 1254×1254 | 466×1135 | 67×164 | 394,55,860,1190 |
| `shelf` | 948×1660 | 641×1372 | 62×133 | 155,134,796,1506 |
| `coffee-machine` | 982×1601 | 551×1252 | 34×77 | 216,178,767,1430 |
| `water-dispenser-2` | 1254×1254 | 439×1082 | 37×93 | 405,92,844,1174 |
| `robot-vacuum` | 1536×1024 | 830×586 | 30×21 | 352,228,1182,814 |
| `conveyor` | 1655×950 | 1355×780 | 40×23 | 152,112,1507,892 |
| `drafting-board` | 1341×1173 | 924×1016 | 44×48 | 191,85,1115,1101 |
| `recycle-bin` | 1086×1448 | 623×787 | 24×30 | 227,360,850,1147 |
| `umbrella-stand` | 887×1774 | 560×1238 | 26×57 | 165,274,725,1512 |
| `broom-mop` | 887×1774 | 754×1282 | 45×76 | 65,243,819,1525 |
| `fire-extinguisher` | 887×1774 | 566×1349 | 18×43 | 160,206,726,1555 |
| `file-boxes` | 1219×1290 | 713×875 | 32×39 | 250,233,963,1108 |
| `binder-rack` | 1216×1294 | 952×922 | 32×31 | 144,186,1096,1108 |

門五格均使用1254×1254原圖畫布，共用67×164顯示配置；門框、門檻與出口燈沿西牆向右上斜升，與舊門同方向；門框與標誌維持同一構圖，只有門板逐步打開。門框外緣仍有生成器造成的原解析度1～2px微差，原圖如實保留，未合成外框。載入端應保留表列裁框偏移，以共同原畫布作定位，不能逐格置中。

門含標誌總高164格，門洞高約101格，可容納第一批101格站姿人物。層架133格略高於第一批122格櫃子；清潔組76格、咖啡站77格，設備相對尺度見比例圖。

飲水機第二格以第一批原圖為底，只要求增加瓶內氣泡／漣漪，原圖同為1254×1254、裁框同為439×1082、建議37×93。

審查附件：`compare-<代碼>.png` 每件三欄（原圖／深色底／淺色底，物件同高）、`overview.jpg`、`scale-first-and-third-batch.png`（第一批全12件加本批17件，每格4預覽像素）、`door-opening.gif`（5格）、`water-dispenser-bubbles.gif`（2格）。GIF共同原座標，不逐格重新置中。

`validation.json` 記錄原檔及去背雜湊、裁框、保留像素數。原圖與內建工具輸出逐檔位元相同，所有非透明 RGBA 樣本逐一核對。

## 最終採用提示詞

每個區塊為採用原圖的提示詞。2026-11-21使用者退回僅門角度，重做西牆斜向門框及同面出口燈；其餘12件原圖、去背及各別三欄圖不變。門提示詞包括生成及關門格幾何修正兩步。

### `door`

```text
Use case: stylized-concept. Single office game door sprite, closed frame 0 of a 5-frame animation. Reference1 old tiny door is GEOMETRY/ORIENTATION reference; reference2 cabinet is PIXEL STYLE/material/lineweight reference; reference3 is previous design identity ONLY, improve angle. Draw unmistakable elevated 2:1 dimetric WEST-WALL door, parallel to old reference door: horizontal lintel and threshold rise to the RIGHT by exactly one pixel per two pixels right. Left jamb bottom is lower than right jamb bottom. Both jambs vertical. Door plane faces diagonally right/down into room. Strong visible top rim and left depth edge, never frontal elevation. Silver steel frame, blue door panel, slim cyan window, gold lever left side, hinges right. Green exit sign with white running-person pictogram above door; its top/bottom edges parallel lintel, same slope -0.5, NOT facing camera. Clean chunky classic pixel art, dark #14121D outlines and flat3shades per surface, match cabinet reference. No texture/grain/dither/blur/readable text. Full door+sign centered on square1254x1254 pure #FF00FF canvas; occupy x330..920 and y100..1150 approximately. No floor, wall, shadow or other object. Keep enough margin for door opening. One object only.
Geometry correction: Use case: precise-object-edit. Correct ONLY geometry of this door sprite to strict2:1 WEST wall plane. Current horizontal edges too shallow; increase slope to EXACTLY 1up per2right: lintel left front corner(435,500), right front corner(835,300); threshold left(435,1150),right(835,950). Both jambs vertical650px. Exit sign parallel same slope, left bottom(505,370),right bottom(785,230), top edges same slope. No perspective convergence. Preserve blue panel/silver frame/gold lever/green sign identity and clean chunky pixel style. Square1254 canvas pure#FF00FF. Full object fits margins. Only one CLOSED door, no floor or wall. This is geometry correction, do not keep previous shallow top-edge angle.
```

### `door-open-1`

```text
Use case: precise-object-edit. Frame1 of5 opening animation. Edit reference1 closed door ONLY blue moving door leaf and attached window/handle: swing it inward about20degrees on RIGHT vertical hinges, free LEFT edge moves right/up into doorway revealing narrow dark recess along LEFT jamb. Keep rigid surrounding silver jambs, lintel, threshold, hinge locations, exit sign and supports PIXEL IDENTICAL and at EXACT same coordinates, square1254x1254 magenta canvas. Preserve west-wall2:1 view, all fixed wall-plane edges rise2right/1up. No camera/scale/recenter or color/style change, no new objects. Reference2 old door is orientation only. Original chunky pixel art, pure#FF00FF background.
```

### `door-open-2`

```text
Use case: precise-object-edit. Animation FRAME2 of5. Reference1 is preceding frame1, reference2 closed frame0. Open ONLY blue door leaf substantially farther inward to45degrees around same RIGHT vertical hinges. Free LEFT edge moves to x610 approx (was~490), exposing broad dark doorway on left. Door panel visibly narrower, window and gold lever move with panel; preserve physical hinge joint. Keep entire silver doorframe, threshold, green exit sign/supports, all fixed pixels EXACTLY same coords as reference1. Same1254square canvas, no recenter/rescale/camera change. West wall2:1 elevated dimetric unchanged. Pure#FF00FF background; chunky stepped pixel style. Not sliding door.
```

### `door-open-3`

```text
Use case: precise-object-edit. Animation FRAME3 of5. Reference1 preceding frame2,reference2 closed. Swing blue leaf farther inward to70degrees around RIGHT vertical hinges. Leaf narrow, its free LEFT edge at x710 approximately, broad dark open doorway now occupies most width left of leaf. Window/gold lever move with leaf. Keep silver frame, jambs, threshold, hinges, green exit sign/supports PIXEL IDENTICAL at same coordinates. No rescale/recenter/camera movement. Same1254x1254 pure#FF00FF canvas, west-wall2:1 elevated pixel art. Only moving leaf changes, not sliding.
```

### `door-open-4`

```text
Use case: precise-object-edit. Animation FRAME4 final fully open90degrees. Reference1 preceding70degree frame, reference2 closed. Rotate ONLY blue door leaf inward around SAME RIGHT vertical hinge axis to90degrees, very narrow side-on blue leaf beside right jamb, free edge near x780; large unobstructed dark doorway. Gold lever/window foreshortened attached leaf. Preserve all fixed silver jambs/lintel/threshold/hinges and exit sign/supports exactly same pixels/positions. Same square1254x1254 pure#FF00FF canvas, no camera/recenter/rescale, west-wall2:1 pixel art unchanged. No other objects.
```

### `shelf`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: a tall four-tier open office shelf, cool dark steel corner posts and honey-caramel wood shelves, colored ring binders red/teal/yellow on upper shelves, tan archive boxes below, two paper reams on bottom. Original arrangement, no plant/medical symbols. Physical scale about65x114 logical cells, aboutas tall as first batch wooden storage cabinet122 high.
```

### `coffee-machine`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: a compact office coffee station: small dark charcoal espresso machine with cool silver front, red top accent, coffee spout and dark driptray, one tiny teal mug on tray; machine rests on a narrow caramel wooden pedestal/counter with one cabinet door. Overall station about38x62 logical cells, shorter than first batch water cooler93 high. No letters logos text steam background or extra room furniture.
```

### `water-dispenser-2`

```text
Use case: precise-object-edit. ONE animation frame2 of approved first-batch water-dispenser. First image water-dispenser.png is EDIT TARGET/previous frame. Second office image STYLE ONLY. Change ONLY inside the blue bottle: add three small white/cyan pixel bubble blocks rising through water and a small flat ripple near water surface. Keep bottle silhouette, highlights, darkoutline, white cabinet, red/blue taps, driptray, vent, handle, exact canvas1254x1254 and all absolute positions EXACTLY unchanged. No other object/cup/splash outside bottle. Do not resize recenter crop recolor or redraw exterior. Same source block-pixel art. Preserve pure magenta background. This must animate with given original, not redesign dispenser.
```

### `robot-vacuum`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: a low round robotic floor vacuum, charcoal circular disk with cool silver outer bumper, flat medium-gray top lid, small raised round lidar puck toward back, bright cyan power dot, subtle dark front sensor slot and tiny side brush. About30x20 logical cells, far shorter than first batch office chair72 high. No floor, motion trails, cast shadow, dust or extra props.
```

### `conveyor`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one short straight office document conveyor roller-track segment, low dark charcoal support frame, silver-gray side rails with bold clean edges, six clearly separated cool-gray rollers across track. No packages, paper, moving parts outside segment, floor or attached furniture. About40x23 logical cells, tray-height low profile.
```

### `drafting-board`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one desktop tilted architect drafting display board on small dark steel easel legs, warm honey-caramel wooden frame, ocean-blue screen showing crisp pale cyan geometric blueprint rectangles and simple white diagram lines without letters, one silver stylus on bottom ledge. View facing bottom-left, board tilted back. About46x42 logical cells so it fits on first batch desk103x73. No desk included, no monitor keyboard person or extra props.
```

### `recycle-bin`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one tapered rectangular open-top office recycling bin, ocean-blue plastic body, emerald green thick rim, small simple three-arrow green recycling icon on front, two crumpled pale paper pieces and one red soda can peeking from top (no text). Low compact bin about24x34 logical art cells, less thanhalf height of office chair72. No trash on ground, floor or shadow.
```

### `umbrella-stand`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one compact entryway umbrella stand, cylindrical dark steel open basket with vertical ribs and silver driptray base, holding TWO closed folded umbrellas protruding above: one blue with caramel wooden J handle and one red with charcoal curved handle. About26x58 logical cells, total height below approved chair72. Clear umbrella shapes, no floor droplets or extra props.
```

### `broom-mop`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one office cleaning-corner tool group: compact silver-gray mop bucket with yellow wringer, one upright caramel wooden-handle broom with tan bristle head, one blue microfiber mop leaning alongside, grouped neatly. Two long handles clearly separate, bucket small. Overall about30x76 logical cells, aboutsame height as first batch chair72. No labels text water puddle floor or shadow.
```

### `fire-extinguisher`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one upright red office fire extinguisher, cylindrical bright crimson tank with two flat darker-red shadow shades, dark valve handle, small round pressure gauge, yellow safety-pin dot, short black curved rubber hose down right side, one small blank off-white label panel (NO letters). About18x40 logical cells, below chairseat-to-back height, no wall bracket floor sign or props.
```

### `file-boxes`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one small stack of TWO archive storage boxes: larger tan caramel corrugated banker box below with dark packing-tape strip, blank white side label and handle cutout; smaller off-white lidded archive box on top with muted steel-blue lid rim and handle hole. About36x38 logical cells, similar width to first batch filing cabinet34cells but less thanhalf its91cell height. No visible text floor shelves or extra objects.
```

### `binder-rack`

```text
Use case: stylized-concept. ONE original standalone office game sprite. reference-office.png is STYLE ONLY, approved first-batch furniture images are material/linework/proportion references ONLY; never trace or crop the room and never include reference furniture unless specified. Match classic clean stepped hand-placed pixel art, true2:1 dimetric view facing bottom-left, dark #14121D one-art-pixel outline, 3 flat shades per surface, regular square chunky art pixels about8x8 source blocks. No grain, wood texture, noise, dither, gradients, antialiasing, blur, readable lettering or watermark. Full object centered filling70% canvas on uniform pure #FF00FF magenta, no floor or cast shadow. Subject: one compact tabletop metal magazine file holder rack, cool steel-gray base and side supports, holding FOUR upright colored ring binders red, blue, yellow and teal with blank pale spine labels and circular finger holes. Match binder materials/colors from approved first batch storage-cabinet reference. About30x32 logical cells, desktop-sized, no desk shelf floor letters or extra props.
```
