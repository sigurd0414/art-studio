# agent-office 重畫第一批：工位與桌上設備

版本：1.0。最後確認日期：2026-11-22。

需求來源：[agent-office#118](https://github.com/sigurd0414/agent-office/issues/118)；部門單：[art-studio#5](https://github.com/sigurd0414/art-studio/issues/5)。依需求方 S-043 T3、ADR-006 第4節，以定案幾何底圖重畫17件。範本參照 [agent-office 1.2](agent-office.md)，本批以線框對齊指令覆蓋共用方向與幾何；流程與來源沿用 [原圖去背](../skills/gpt-original-cutout.md)、[風格來源](../styles/agent-office.md)。

## 幾何與產圖紀錄

僅用對話內建 imagegen。每件附需求方 `media/sigurd0414/agent-office/118/guides/<代碼>.png` 作幾何參考；本機以最新 main 的工具生成底圖，17張均與需求方底圖逐檔位元相同。原圖同1254×1254，未縮放、置中、調色或重建像素。前四批用來理解清晰度、色彩與筆觸；失敗嘗試未交，完整採用提示詞見下。

所有顯示尺寸由幾何表計算，不使用前批建議尺寸。`box` 以線框底緣與立面為準；`free` 保留自由外形及接地範圍。為符合box，桌子採完整下方桌身／櫃體，螢幕採完整機殼，繪圖板帶底座；外觀是否適合場景仍交使用者看圖確認。

螢幕五格逐格附同一底圖與母圖，採共同原圖座標；原生生成的少量機殼像素／色階差異如實保留，不合成共用外殼（ADR-006第2節第4點）。

## 交件位置與檢查

成品只交 agent-office `media` 分支 `sigurd0414/agent-office/118/`：`gpt-originals/` 原圖、`gpt-cutout/` 原解析度去背裁圖、`align/` 工具疊圖、`align-results.txt` 逐件結果、`validation.json` 雜湊與像素核對；`compare-<代碼>.png` 三欄圖、`overview.png` 全批放大預覽、`scale-geometry.png` 同場景尺度預覽、`monitor-animation.gif` 五格動畫。`prompts.md` 與本文件相同。

原圖與工具輸出位元相同；去背只用共用流程設洋紅候選alpha為0、裁透明邊，保留RGBA逐像素相同。所有預覽縮放僅供審查，成品不重取樣。對齊以原圖跑 `node web/scripts/sprite-geometry.ts check <代碼> <原圖> --out <疊圖>`，17件全部PASS；沒有改幾何表、檢查器或測試。

| 代碼 | 安裝面 | 佔地 | 高度 | 朝向 | 外形 | 幾何顯示寬×高 | 原圖px | 去背px | 原圖裁框 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| desk | floor | 4×2 | 26 | +gy | box | 96×74 | 1254×1254 | 882×681 | 186,286,1068,967 |
| partition | floor | 4×0.5 | 44 | +gy | box | 72×80 | 1254×1254 | 792×882 | 231,186,1023,1068 |
| partition-side | floor | 0.5×2 | 44 | +gx | box | 40×64 | 1254×1254 | 554×883 | 350,185,904,1068 |
| chair | floor | 1×1 | 48 | +gx | free | 32×64 | 1254×1254 | 409×793 | 414,253,823,1046 |
| monitor-on | desk | 2×0.5 | 28 | +gy | box | 40×48 | 1254×1254 | 739×888 | 258,186,997,1074 |
| monitor-on-2 | desk | 2×0.5 | 28 | +gy | box | 40×48 | 1254×1254 | 740×887 | 257,187,997,1074 |
| monitor-boot-1 | desk | 2×0.5 | 28 | +gy | box | 40×48 | 1254×1254 | 739×887 | 257,187,996,1074 |
| monitor-boot-2 | desk | 2×0.5 | 28 | +gy | box | 40×48 | 1254×1254 | 739×887 | 257,187,996,1074 |
| monitor-off | desk | 2×0.5 | 28 | +gy | box | 40×48 | 1254×1254 | 740×886 | 257,187,997,1073 |
| monitor-crt | desk | 1×1 | 26 | +gy | box | 32×42 | 1254×1254 | 674×883 | 290,186,964,1069 |
| monitor-vertical | desk | 1×0.5 | 40 | +gy | box | 24×52 | 1254×1254 | 418×883 | 418,186,836,1069 |
| laptop | desk | 1×0.5 | 16 | +gy | box | 24×28 | 1254×1254 | 757×888 | 249,187,1006,1075 |
| drafting-board | desk | 2×1 | 24 | +gy | box | 48×48 | 1254×1254 | 884×883 | 185,188,1069,1071 |
| desk-lamp | desk | 0.5×0.5 | 22 | +gy | free | 16×30 | 1254×1254 | 443×739 | 401,312,844,1051 |
| headphones-mug | desk | 1×0.5 | 14 | +gy | free | 24×26 | 1254×1254 | 662×571 | 290,370,952,941 |
| pc-tower | floor | 1×0.5 | 25 | +gy | box | 24×37 | 1254×1254 | 575×882 | 341,187,916,1069 |
| power-strip | floor | 1×0.5 | 2 | +gy | free | 24×14 | 1254×1254 | 761×492 | 214,385,975,877 |

## 對齊結果

```text
ALIGN key=desk result=PASS match=99.3% left=0.28 right=0.28
ALIGN key=partition result=PASS match=99.5% left=0.14 right=0.14
ALIGN key=partition-side result=PASS match=98.6% left=0.23 right=0.23
ALIGN key=chair result=PASS match=100.0% left=0.00 right=0.00
ALIGN key=monitor-on result=PASS match=98.8% left=0.21 right=0.26
ALIGN key=monitor-on-2 result=PASS match=98.7% left=0.26 right=0.26
ALIGN key=monitor-boot-1 result=PASS match=98.8% left=0.26 right=0.21
ALIGN key=monitor-boot-2 result=PASS match=98.8% left=0.26 right=0.21
ALIGN key=monitor-off result=PASS match=98.7% left=0.26 right=0.26
ALIGN key=monitor-crt result=PASS match=98.8% left=0.15 right=0.15
ALIGN key=monitor-vertical result=PASS match=97.1% left=0.35 right=0.35
ALIGN key=laptop result=PASS match=99.1% left=0.07 right=0.11
ALIGN key=drafting-board result=PASS match=99.2% left=0.14 right=0.20
ALIGN key=desk-lamp result=PASS match=100.0% left=0.00 right=0.00
ALIGN key=headphones-mug result=PASS match=100.0% left=0.00 right=0.00
ALIGN key=pc-tower result=PASS match=98.8% left=0.08 right=0.20
ALIGN key=power-strip result=PASS match=100.0% left=0.00 right=0.00
```

## 採用提示詞

### desk

```text
Use case: stylized-concept. Paint ONLY the interior faces of this exact cuboid guide as office desk, caramel orange flat desktop, steelgray drawer/apron side panels, no thin legs. All guide OUTER lines already finalgeometry: retain the exactthin6px silhouette, no thickening outward. Pixel art texture INSIDE shape only: crisp squarepixel steps and3flatshades, dark#14121D edges. Strong2:1 dimetric, flat no gradients/grain/noise/vector. Same1254x1254canvas and exactposition, DO NOT centerorresize. Front+gy bottomLEFT. Solid complete cuboid fullheight fullwidth. No feet or shadows. Erase hiddeninterior wire andallcornerlabels/arrows. Pure#FF00FF outside. Shape geometry MUST remain exact guide; do not pad borders.
```

### partition

```text
Use case: stylized-concept. Paint ONLY the interior faces of this exact cuboid guide as orange cork office partition withsilver frame and2 blankcyan/yellow sticky notes. All guide OUTER lines already finalgeometry: retain the exactthin6px silhouette, no thickening outward. Pixel art texture INSIDE shape only: crisp squarepixel steps and3flatshades, dark#14121D edges. Strong2:1 dimetric, flat no gradients/grain/noise/vector. Same1254x1254canvas and exactposition, DO NOT centerorresize. Front+gy bottomLEFT. Solid complete cuboid fullheight fullwidth. No feet or shadows. Erase hiddeninterior wire andallcornerlabels/arrows. Pure#FF00FF outside. Shape geometry MUST remain exact guide; do not pad borders.
```

### partition-side

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. ONE solid single cork office divider board, +gx FRONT facesBOTTOMRIGHT. Orange broadface, silver frame and2tinyblankcyan/yellownotes. Fill fullwirecuboid. Not L-shaped, no feet; exact bottomguide.
```

### chair

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. FREE shape: black padded swivel office chair, silvergray fivecasterbase, armrests, +gx seating FRONT pointsBOTTOMRIGHT, seat/back aligned to2:1 grid. Do NOT fillguidebox. Feet andcasters entirely INSIDE guidefootprintdiamond, bottommost foot slightly ABOVE baseBottom, wholechair withinwirebounds and topbelowtopguide. Remove allwire, keepmagenta gapsbetweenlegs.
Edit: Use case: precise-object-edit. Keep same officechair identity andsource1254canvas, adjust ONLY chair width: pullrightarmrest andseat rightside inward so ALLpixels x<=825 (currently some reach850). Allchairpixels mustwithin x425..825, no re-center toothercanvas. Castersbasecontact insideguide diamond (627,846),(846,956),(627,1066),(408,956); bottommostcastery1030. Same+gx frontBOTTOMRIGHT, blackpaddedchair/caramelarmrests/steelbase, pixelstyle unchanged. No guidewires, floor,shadow. Puremagenta. Do notresize original byprogram; redraw narrower chair geometry.
```

### monitor-on

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. ONE chunky black desktop widescreen monitor unit, +gy screen facesBOTTOMLEFT, silvergray casingdepth, cyan code/task horizontalrows on darknavyscreen, tinygreenpowerLED. Fill entire wirecuboid tobottom with solid monitor casing (no thinstand or hollowbase), verticals exactguide, front screen insidefrontface, no text. Frame0 of5 animation, fixedcanvas.
```

### monitor-on-2

```text
Use case: precise-object-edit. Reference1 monitor-on is exactfixed enclosure and sourcecanvas; reference2 is samegeometryguide. Change ONLY SCREEN CONTENT to ON alternate: cyan code rows change lengths and bottom row tiny square cursor movesright. Everygrayframe/top/rightside/greenLED/outeroutline/position must remain identical. Same1254squarecanvas, no rescale/recenter/newstand. Preserve originalsteppedpixelstyle, pure#FF00FFbackground. No labels/arrows/text. No geometrychange. This is one of5samegroup frames.
```

### monitor-boot-1

```text
Use case: precise-object-edit. Reference1 monitor-on is exactfixed enclosure and sourcecanvas; reference2 is samegeometryguide. Change ONLY SCREEN CONTENT to BOOT early: nearlyblack navy screen with one tiny white horizontal dashcursor nearcenter. Everygrayframe/top/rightside/greenLED/outeroutline/position must remain identical. Same1254squarecanvas, no rescale/recenter/newstand. Preserve originalsteppedpixelstyle, pure#FF00FFbackground. No labels/arrows/text. No geometrychange. This is one of5samegroup frames.
```

### monitor-boot-2

```text
Use case: precise-object-edit. Reference1 monitor-on is exactfixed enclosure and sourcecanvas; reference2 is samegeometryguide. Change ONLY SCREEN CONTENT to BOOT later: darknavy screen with tiny cyan squarebooticon atcenter and shortcyan progressbarbelow, noletters. Everygrayframe/top/rightside/outeroutline/position must remain identical. Same1254squarecanvas, no rescale/recenter/newstand. Preserve originalsteppedpixelstyle, pure#FF00FFbackground. No labels/arrows/text. No geometrychange. One of5samegroup frames.
```

### monitor-off

```text
Use case: precise-object-edit. Reference1 monitor-on is exactfixed enclosure and sourcecanvas; reference2 is samegeometryguide. Change ONLY SCREEN CONTENT to OFF: screen uniformly verydark navyblack with subduedpixelreflection, greenLED now darkgray. Everygrayframe/top/rightside/outeroutline/position must remain identical. Same1254squarecanvas, no rescale/recenter/newstand. Preserve originalsteppedpixelstyle, pure#FF00FFbackground. No labels/arrows/text. No geometrychange. One of5samegroup frames.
```

### monitor-crt

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. BOX: chunky retro CRT monitor, silvergray deepcube housing, blackbezel, curved darknavy cyanterminal screen on +gy frontBOTTOMLEFT, smallblankbuttons. Complete solidcasing fills guide tobase, no standfeet or keyboard.
```

### monitor-vertical

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. BOX: tall portrait monitor, charcoalfrontbezel withcyan rows on darknavyscreen facing+gy BOTTOMLEFT, steelgraydepth. Complete cuboid fills guide allway tobase, no thinstand, geometryfromguide not a generic monitor.
```

### laptop

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. BOX geometry: one OPEN laptop with silvergray keyboard base filling exact footprintdiamond atbottom, raised darkscreen withcyan code facing+gy BOTTOMLEFT reaching guide topheight, chunky hinge. Keyboard keys blankpixelblocks. Guide box is outerenvelope: basebottom MUST follow guide polyline with no feet or shadow. Don't leave guidevisible, no annotations. Open screen occupies backplane, keyboard insidebase.
```

### drafting-board

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. BOX geometry: one desktop drafting board onsolidcaramel wedge pedestal, cream drawing surface withcyan blueprintlines andoneorange pencil alongrim. Front+gy BOTTOMLEFT. Pedestal bottom completely fills guide footprint, whole board fits exactcuboid. No separatelegs, floor or addeddesk.
```

### desk-lamp

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. FREE shape: small adjustable desk lamp withsilvergray articulatedstem, darkcharcoalshade pointingBOTTOMLEFT, warmyellowinside, small weightedbase. Do NOT fillguidebox. Allbasecontactpoints INSIDE footprintdiamond, bottommostpoint atcenterofdiamond notonbottomedge. Entire lamp insidewirebounds, magentagapsaroundarm. No castlight/glow.
```

### headphones-mug

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. FREE shape: compactpair of blackoverearheadphones restingbeside ONE teal ceramic mug, handlesmall. No desk. Put bothobjects together WITHIN dashedwirebounds, allcontactpoints INSIDE footprintdiamond with20pxmargin fromallbottomedges; objectheightbelowguidetop. +gy viewBOTTOMLEFT, no wireorcordoutsidebound.
Edit: Use case: precise-object-edit. Remove ONLY the entire surrounding black wireframe cuboid from image1, replace every one of those lines withpure#FF00FF. Keep ONLY headphones andtealmug exactpixels/positions/style, includingempty hole inheadband. No surroundingbox, border, floor,shadow or blackline outside objects. Exact1254squarecanvas unchanged. Image2guide geometryreferenceonly, mustNOTappear inoutput.
```

### pc-tower

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. BOX: silvergray/charcoal PC tower, +gy FRONT facesBOTTOMLEFT withblackopticaldrive, tinygreenpowerbutton, ventpixelrows; darkgrayrightdepthface. Solidtowerfills exactcuboidbase/height, no feet/cables beyondshape.
```

### power-strip

```text
Use case: stylized-concept. Paint ONLY interior of guide as the requested office game sprite. Exact1254square canvas, position and wire geometry are mandatory. Retain exactthin6px outer shape, no enlarging or padding or centering. Strict2:1 dimetric, gxrightdown/gybottomleft, parallels no perspective. Clean classic stepped squarepixel art, dark#14121D outline,3flatshades, caramelwood/coolgray palette, same prior office style. No gradients/grain/dither/blur/noise. Hidden wires and corner annotation/arrows MUST disappear, pure#FF00FF outside object. Geometry guide is exact truth, not a rough reference. FREE shape: ONE white officepowerstrip with3 darksocketpairs andsmallredrockerswitch, thinlow body lies along+gx/-gy axesinsideguidefootprint. Allbody and short foldedgraypowercord staywellWITHIN footprintdiamond with20pxmargin, no cordoutsidebounds. +gyfrontBOTTOMLEFT. Remove ALLguidewire/labels/arrows completely, onlypowerstriponpuremagenta. No shadow.
```
