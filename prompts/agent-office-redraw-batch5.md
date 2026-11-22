# agent-office 重畫第五批：北牆小物件

版本：1.0。最後確認日期：2026-11-22。

需求來源：[agent-office#122](https://github.com/sigurd0414/agent-office/issues/122)；部門單：[art-studio#9](https://github.com/sigurd0414/art-studio/issues/9)。依 S-043 T3，沿用[原圖去背](../skills/gpt-original-cutout.md)、[牆面方向自檢](../skills/wall-mounted-orientation.md)、[風格來源](../styles/agent-office.md)。

## 設計與整理

只用內建 imagegen。線框只作擺放範圍，物件保持真實設計。本批全部為北牆物件，邊線向右下降，2:1、垂直邊垂直。

本批6件皆北牆，畫框、證書、月曆、海報與冷氣保持自然設計；層架為木板、兩端金屬壁軌、小書本與盆栽，留鏤空，並未填滿線框。冷氣與海報下緣經生圖修正，所有物件邊線向右下降，垂直邊垂直。

6張原圖皆1254×1254，直接保存生成輸出。去背只移除洋紅候選alpha、裁透明邊；保留可見RGBA，不縮放、量化、改色、外框或程式修補。預覽才縮放，三欄為GPT原圖／去背深色底／去背淺色底。比例圖使用共同場景尺度並附第一批桌、螢幕、椅子、隔板；另附同牆方向對照；本批無動畫。

成品僅交需求方media `sigurd0414/agent-office/122/`，本倉庫只保存提示詞。原圖、去背、對齊疊圖、逐件三欄、總覽、比例圖、方向圖、檢查結果與validation.json齊備。

## 檢查

交件前拉 agent-office 最新 main `95bfed4f6d1c1a498b487797aa6e3d52c72680d4`，原版check檢查6張全部PASS，outside均0，box角均2/2。未改業務程式、檢查器、幾何或驗收測試。自然外形最後由使用者看圖確認。

| 代碼 | 顯示寬×高 | 原圖px | 去背px | 裁框 |
| :--- | :--- | :--- | :--- | :--- |
| wall-art | 48×42 | 1254×1254 | 883×773 | 186,241,1069,1014 |
| wall-shelf | 48×34 | 1254×1254 | 891×632 | 183,313,1074,945 |
| wall-ac | 48×38 | 1254×1254 | 884×701 | 185,279,1069,980 |
| certificate-frame | 32×38 | 1254×1254 | 744×887 | 255,186,999,1073 |
| wall-calendar | 32×42 | 1254×1254 | 676×901 | 289,185,965,1086 |
| wall-poster | 32×52 | 1254×1254 | 547×884 | 354,185,901,1069 |

```text
ALIGN key=wall-art result=PASS match=99.3% left=0.14 right=0.14 corners=2/2 top=0.13 outside=0
ALIGN key=wall-shelf result=PASS match=98.3% left=0.31 right=0.47 corners=2/2 top=0.20 outside=0
ALIGN key=wall-ac result=PASS match=99.2% left=0.14 right=0.20 corners=2/2 top=0.06 outside=0
ALIGN key=certificate-frame result=PASS match=99.2% left=0.13 right=0.13 corners=2/2 top=0.07 outside=0
ALIGN key=wall-calendar result=PASS match=98.5% left=0.20 right=0.20 corners=2/2 top=0.17 outside=0
ALIGN key=wall-poster result=PASS match=98.4% left=0.20 right=0.26 corners=2/2 top=0.21 outside=0
```

## 採用提示詞

### wall-art

```text
Use case stylized-concept. ONE agent-office sprite onSAME1254x1254magenta#FF00FFcanvas. ReferenceimageisEXACTplacementguideONLY, notobjectshape. Pixelart crispdark#14121Dsteppedoutline, flatsteelgray/caramel/cyan/red/yellowpalette,3shades, no grain/no blur/no texture/no gradient. Draw THINsilver/charcoal framedLANDSCAPEPAINTING: cyansky goldsunset greenmountains darkpinetrees. Followguideparallelogram EXACTLY inposition/width/height, ALLframeedges2:1DOWNRIGHT, verticalsvertical,no perspectiveconvergence. OuterframeINSIDEoutline, left/right/bottomcorners/topheightreachguide. RemoveALLguidewires/text/arrows,nofloor/noshadow/extras. PaintingallprintedflatonsameNORTHwallplane. Do notreduceangle: exactly2right1down.
```

### wall-shelf

```text
ONE NORTHwall empty bracketed SHELF officepixelart, same1254FF00FFcanvas. EXACT guide outerparallelogram bounds. Design: THIN honeywood board ALONG BOTTOM guideedge (188,499) to(1066,938), thickness20px ABOVEbottomline. Two narrowverticalSILVERwallmountbrackets INSIDEatleftandright, fromguideTOPcorners toboardBOTTOMcorners, each20pxwide. RestofinteriorPUREMAGENTAEMPTY. NO books, NO plant, NO backpanel, NO outlinearoundemptyspace. Thisisnaturalemptywallmountedfloating shelfwithsupportbrackets behindboard. Horizontalwoodedge2:1DOWNRIGHT, verticalbracketsvertical. Guideleft/right/top/bottomextentsmustmatch. Crisppixeloutline flatcolors, no shadow, removetext/wires. Do notmoveorcenter.
Correction: Edit same1254canvas: REMOVEONLY longthinBLACKdiagonal line acrossTOPemptyspace, replaceitpureFF00FF. Keepbothsilververticalwallmountbrackets andwoodenbottomshelf exactly. AddthreeTINY red/cyan/yellowbooks onLEFTwoodboard betweenx240and340, eachabout65pxhigh, allinsideemptyspace. AddTINY green succulentterracottapot onRIGHTboardaroundx970, totalheight70px, staysinsidebounds. Naturalpixelshelf, richer3shadewood, no newoutlineacrossemptyspace, FF00FF.
Correction: StylecorrectionONLY same1254canvas exactsilhouettepositionsunchanged. Convert shelf/books/plant into CRISP OFFICEPIXELART: chunkyblacksteppedoutlines, FLAT3colorvalues only per material, no woodgrain, no gradients, no specularsmoothshading. Woodhoneyorange/booksredcyan yellow/terracottapotgreensucculent. Identicalplacementdimensions, do notmoveorresizeanything, keepemptyspaceFF00FF. Silverwallrailskeepvertical, board2:1downright. No topconnectingline.
```

### wall-ac

```text
ONE NORTHwall officepixelart AIRCON same1254magentaFF00FFcanvas. Draw white slim wallmountairconditioner EXACTINSIDEattachedguidePARALLELOGRAM. Outerboundary MUSTmatchall4guidecornersandstraightedges; alltopandbottomedges2:1DOWNRIGHT, verticalleft/right. No roundedbodybelowguide, no sidefacethicknessoutsideguide. Whitefrontpanel with thinGRAYbottomventgrille andtinyCYANLED. Naturalwhiteplasticpanel seam, 3flatshades, darkpixeloutline. Allventslatsparallelguide. RemoveALLguidelines/text. No shadow/floor/extras. Guideisplacementbounds; realisticairconfrontdesign inside.
```

### certificate-frame

```text
ONE officepixelart sprite SAME1254squareFF00FFcanvas. Exactplacementguide boundsONLY. Draw thin GOLDWOOD framed CERTIFICATE, cream paper, short graytextlines and goldseal withredribbon. Followguideparallelogram EXACTLY: NORTHwall frameandALLpaper/textlines2:1DOWNRIGHT, verticalsvertical. Frameextremes/corners/topheight touchguide insidebounds. Natural thinframe, no thickcube. Crisp darksteppedoutline, flat3shadecolors goldcreamgrayred, no blur/no texture/no gradients/shadow. RemoveALLguidelines/text. Do notfollowoldreferenceangle, onlyguideangle.
Correction: Preciseedit same1254canvas: keepgoldframe/paper exactunchanged. Replace5GRAYtextlines with thin parallelogram strokes slopingDOWNRIGHT2:1, parallel topframe; verticalendsvertical. All printedtext must lieflatonsamepaperplane, no frontal horizontalstrokes. Goldseal too follows paperplane slightlyflattenedtilted. No otherchanges FF00FFbackground.
Correction: Samecanvas preciseedit ONLY graywriting andseal: increase downslope of5graywritinglines to MATCH GOLD FRAME exactly. Currentlineangletoo shallow: move EACHlineLEFTendpointUP60px andRIGHTendpointDOWN60px arounditscenter. Finaledge 2right1down, slope0.5, parallel goldtopedge. Graylineverticalendsremainvertical. Goldsealtilt sameplane. Frame/paper/position/backgroundunchanged.
```

### wall-calendar

```text
ONE officepixelart SAME1254squaremagentaFF00FFcanvas. Draw thin NORTHwall CALENDAR exactlyguideparallelogram. Redheaderstrip atTOPinsideguide, small darkbindingtabs entirelyinsideouterbounds, cream paperwith5x7grid and cyan/yellow/greenmarkedcells. ALLgrid/header/paperhorizontaledges slopeDOWNRIGHT2:1 parallelguide, verticalsvertical. Outerborder exactguideposition,width,height,left/right/bottomcorners/top touchguide. No protrudingringsoutsideguide. Crispdarksteppedoutline flat3shadecolors, no texture/blur/gradient. Removeguidewires/text, noextras.
```

### wall-poster

```text
Use case stylized-concept. ONE agent-office sprite SAME1254x1254magentaFF00FFcanvas. ReferenceEXACTplacementguideONLY. Draw thin cream office motivationPOSTER withdarkborder, cyanheader, smallgoldlightbulb andthreesmallgraywritingstrokes. Followguideparallelogram EXACTLYpositionwidthheight: ALLfourcornersandallfourborderedges coincidewithguide, includingBOTTOMedge2:1DOWNRIGHT. Verticaledgesvertical. Headerandwritingallparallelguide top2:1DOWNRIGHT. Crispdarksteppedpixeloutline, flat3shades, no grain/blur/texture/gradient/shadow. RemoveALLguidewires/text/arrows. No otherobjects/floor. Do notalterguideangleordimensions. Printedbulbfacesameplane.
Correction: Preciseedit ONLY3graycaptionstrokes. Theirdownslopeis too shallow. Make graystrokes PARALLEL posterTOPedge2:1downright: moveleftendUP40pixelsrightendDOWN40pixels aroundeachcenter, finalangle26.565degrees. ALLposteroutline/header/bulbpositionsunchanged. Exact1254canvas/FF00FFbackground.
```
