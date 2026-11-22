# agent-office 重畫第四批：門、西牆與北牆主要物件

版本：1.0。最後確認日期：2026-11-22。

需求來源：[agent-office#121](https://github.com/sigurd0414/agent-office/issues/121)；部門單：[art-studio#8](https://github.com/sigurd0414/art-studio/issues/8)。依 S-043 T3，沿用[原圖去背](../skills/gpt-original-cutout.md)、[牆面方向自檢](../skills/wall-mounted-orientation.md)、[風格來源](../styles/agent-office.md)。

## 設計與整理

只用內建 imagegen。線框只作擺放範圍，物件保持真實設計。西牆邊線向右上升，北牆向右下降，2:1、垂直邊垂直。電視兩格共用畫布與位置，只改畫面內容。

依需求方最新確認，門改成平面內滑門：保留已通過關門原圖，後四格門板沿西牆平面滑進右側門框後方，左側門洞依序擴大，最後完全打開；框與出口燈位置固定，保留各張生成微差，不合成共用外殼。其餘12件沿用已通過原圖。

17張原圖皆1254×1254，直接保存生成輸出。去背只移除洋紅候選alpha、裁透明邊；保留可見RGBA，不縮放、量化、改色、外框或程式修補。預覽才縮放，三欄為GPT原圖／去背深色底／去背淺色底。比例圖使用共同場景尺度並附第一批桌、螢幕、椅子、隔板；另附同牆方向對照、門5格與電視2格GIF。

成品僅交需求方media `sigurd0414/agent-office/121/`，本倉庫只保存提示詞。原圖、去背、對齊疊圖、逐件三欄、總覽、比例圖、方向圖、GIF、檢查結果與validation.json齊備。舊診斷review-door-v1不是正式採用版本。

## 檢查

交件前拉 agent-office 最新 main `95bfed4f6d1c1a498b487797aa6e3d52c72680d4`，原版check檢查17張全部PASS，outside均0，box角均2/2。未改業務程式、檢查器、幾何或驗收測試。自然外形與動畫最後由使用者看圖確認。

| 代碼 | 顯示寬×高 | 原圖px | 去背px | 裁框 |
| :--- | :--- | :--- | :--- | :--- |
| window-blinds | 48×64 | 1254×1254 | 663×882 | 296,186,959,1068 |
| corkboard | 48×58 | 1254×1254 | 730×885 | 262,186,992,1071 |
| wall-notice | 64×62 | 1254×1254 | 880×856 | 187,201,1067,1057 |
| wall-vent | 32×28 | 1254×1254 | 883×775 | 186,241,1069,1016 |
| wall-outlet | 16×18 | 1254×1254 | 785×882 | 235,186,1020,1068 |
| whiteboard | 64×92 | 1254×1254 | 614×883 | 320,186,934,1069 |
| kanban-board | 96×100 | 1254×1254 | 848×881 | 203,187,1051,1068 |
| wall-tv | 64×54 | 1254×1254 | 882×747 | 186,255,1068,1002 |
| bar-chart | 48×48 | 1254×1254 | 882×899 | 186,189,1068,1088 |
| first-aid | 16×30 | 1254×1254 | 472×881 | 392,186,864,1067 |
| clock | 32×32 | 1254×1254 | 462×544 | 364,124,826,668 |
| wall-tv-2 | 64×54 | 1254×1254 | 882×747 | 186,255,1068,1002 |
| door | 48×152 | 1254×1254 | 266×869 | 495,197,761,1066 |
| door-open-1 | 48×152 | 1254×1254 | 265×870 | 496,196,761,1066 |
| door-open-2 | 48×152 | 1254×1254 | 265×869 | 496,196,761,1065 |
| door-open-3 | 48×152 | 1254×1254 | 265×869 | 496,196,761,1065 |
| door-open-4 | 48×152 | 1254×1254 | 265×869 | 496,196,761,1065 |

```text
ALIGN key=window-blinds result=PASS match=98.9% left=0.17 right=0.24 corners=2/2 top=0.12 outside=0
ALIGN key=corkboard result=PASS match=99.0% left=0.15 right=0.22 corners=2/2 top=0.17 outside=0
ALIGN key=wall-notice result=PASS match=99.5% left=0.12 right=0.12 corners=2/2 top=0.10 outside=0
ALIGN key=wall-vent result=PASS match=99.2% left=0.09 right=0.13 corners=2/2 top=0.09 outside=0
ALIGN key=wall-outlet result=PASS match=99.2% left=0.05 right=0.05 corners=2/2 top=0.03 outside=0
ALIGN key=whiteboard result=PASS match=99.0% left=0.23 right=0.23 corners=2/2 top=0.27 outside=0
ALIGN key=kanban-board result=PASS match=99.1% left=0.36 right=0.36 corners=2/2 top=0.18 outside=0
ALIGN key=wall-tv result=PASS match=99.3% left=0.19 right=0.19 corners=2/2 top=0.16 outside=0
ALIGN key=bar-chart result=PASS match=21.4% left=0.14 right=0.09 corners=2/2 top=0.02 outside=0
ALIGN key=first-aid result=PASS match=98.7% left=0.05 right=0.12 corners=2/2 top=0.09 outside=0
ALIGN key=clock result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=2.35 outside=0
ALIGN key=wall-tv-2 result=PASS match=99.4% left=0.19 right=0.12 corners=2/2 top=0.16 outside=0
ALIGN key=door result=PASS match=95.7% left=1.06 right=0.71 corners=2/2 top=1.45 outside=0
ALIGN key=door-open-1 result=PASS match=95.3% left=1.23 right=0.71 corners=2/2 top=1.45 outside=0
ALIGN key=door-open-2 result=PASS match=95.3% left=1.23 right=0.71 corners=2/2 top=1.28 outside=0
ALIGN key=door-open-3 result=PASS match=95.3% left=1.23 right=0.71 corners=2/2 top=1.45 outside=0
ALIGN key=door-open-4 result=PASS match=94.6% left=1.23 right=0.71 corners=2/2 top=1.45 outside=0
```

## 採用提示詞

### window-blinds

```text
Preciseobjectedit SAME1254canvas. KeepOUTERframeexactunchanged. REPLACEallcreamBLINDslats: currenthorizontalon-screenlinesWRONG. EachslatmustbeLONGDIAGONALSTRIPPARALLELTOP/BOTTOMframeedge, risingRIGHTatanangle26.565degrees(2right1up). DozenparallelrisingrightlineslikeventgrilleonWESTwall. Cordverticalunchanged. No horizontalon-screenlines. PureFF00FFbackground.
```

### corkboard

```text
Preciseedit SAME1254canvas. KeepOUTERcorkboard/frameposition/style/colorsidentical. SHEAR4whitePAPERNOTESandtheirblacktextlines toSTEEPERrisingRIGHT26.565degrees, EXACTPARALLELTOPFRAME. Noteverticaledgesstayvertical, allhorizontalpaperedges2right1up. CurrentpaperangletooSHALLOW, doubleit. Nootherchanges FF00FFbackground.
```

### wall-notice

```text
Preciseobjectedit: drasticallySHORTENRIGHTVERTICALSIDEofnoticeboardby25%, pullRIGHTBOTTOMcornerUP120pixels; leftside/topedgeunchanged. ThissteepensBOTTOMedge. DoNOTkeepoldshape. Entirelowerwoodframe mustriseSTEEPERtoRIGHT, matchtopedgeangle. AlsoanglepapersparallelTOPedge. Same1254canvas/background/colors/style.
```

### wall-vent

```text
Use case stylized-concept. ONE agent-office sprite onSAME1254x1254magenta#FF00FFcanvas. ReferenceimageisEXACTplacementguideONLY, notobjectshape. Pixelartlikeapprovedoffice: crispdark#14121Dsteppedoutline, flatsteelgray/caramel/cyan/red/yellowpalette,3shades, no grain/no blur/no texture/no gradient. FlatTHINwallmountedobject, realisticframe/panels, no thicksolidcube. Followguideparallelogram EXACTLY inposition/width/height, allwalllines2:1, verticalsvertical,no perspectiveconvergence. OuterframeINSIDEoutline, left/right/bottomcorners/topheightreachguide. RemoveALLguidewires/text/arrows,nofloor/noshadow/extras. WESTwallTHINsteelVENTgrille. AlllongslatsparallelTOPedge risingRIGHT2:1. 5darkparallelVENTslots,steelgrayframewith4cornerscrews, frameTHINinsidebounds. NOhorizontalon-screenstraightlines: ALLslatsdiagonalrisingright. Sameexactguideparallelogram.
```

### wall-outlet

```text
Use case stylized-concept. ONE agent-office sprite onSAME1254x1254magenta#FF00FFcanvas. ReferenceimageisEXACTplacementguideONLY, notobjectshape. Pixelartlikeapprovedoffice: crispdark#14121Dsteppedoutline, flatsteelgray/caramel/cyan/red/yellowpalette,3shades, no grain/no blur/no texture/no gradient. FlatTHINwallmountedobject, realisticframe/panels, no thicksolidcube. Followguideparallelogram EXACTLY inposition/width/height, allwalllines2:1, verticalsvertical,no perspectiveconvergence. OuterframeINSIDEoutline, left/right/bottomcorners/topheightreachguide. RemoveALLguidewires/text/arrows,nofloor/noshadow/extras. WESTwall creamTHINoutletfaceplate: TWOgraydarkrecessedpowerSOCKETS sidebyside, rectangularwhiteSWITCHandtinyGREENindicator onright, corner2smallscrews. ALLrecessedge/faceplateedgeparallelguide risingRIGHT2:1. No plug/cable. Thinplateinsidelimit, nooutsideextrusion.
```

### whiteboard

```text
FixONLYdiagramnodes'LEFT/RIGHTshortsides: theymustbeVERTICALstraightup/down, NOTslanted. Keepnodelongedgesattheircurrentdownrightangle, soeachnodeiswall-planeparallelogramwithVERTICALsides. ConnectorcrossbarsPARALLELboardtop. Keepboardouterframe/colors/position/sizeunchanged, same1254canvaspureFF00FFbackground.
```

### kanban-board

```text
Use case stylized-concept. ONE agent-office sprite onSAME1254x1254magenta#FF00FFcanvas. ReferenceimageisEXACTplacementguideONLY, notobjectshape. Pixelartlikeapprovedoffice: crispdark#14121Dsteppedoutline, flatsteelgray/caramel/cyan/red/yellowpalette,3shades, no grain/no blur/no texture/no gradient. FlatTHINwallmountedobject, realisticframe/panels, no thicksolidcube. Followguideparallelogram EXACTLY inposition/width/height, allwalllines2:1, verticalsvertical,no perspectiveconvergence. OuterframeINSIDEoutline, left/right/bottomcorners/topheightreachguide. RemoveALLguidewires/text/arrows,nofloor/noshadow/extras. NORTHwallTHINsteelgrayKANBANboardwith4columns. ColumnseparatorsVERTICAL, headeredgesandrowcardedgesSLOPEDDOWNRIGHTPARALLELboardedges2:1. Yellow/green/cyan/redcards3percolumn, tinyblackdashwritingfollowingcardangle. No flatfrontviewcards. Board/bodyoneflatplaneatguideangle, width/heightexact.
```

### wall-tv

```text
Use case stylized-concept. ONE agent-office sprite onSAME1254x1254magenta#FF00FFcanvas. ReferenceimageisEXACTplacementguideONLY, notobjectshape. Pixelartlikeapprovedoffice: crispdark#14121Dsteppedoutline, flatsteelgray/caramel/cyan/red/yellowpalette,3shades, no grain/no blur/no texture/no gradient. FlatTHINwallmountedobject, realisticframe/panels, no thicksolidcube. Followguideparallelogram EXACTLY inposition/width/height, allwalllines2:1, verticalsvertical,no perspectiveconvergence. OuterframeINSIDEoutline, left/right/bottomcorners/topheightreachguide. RemoveALLguidewires/text/arrows,nofloor/noshadow/extras. NORTHwallthinflatWALLTV, charcoalBEZEL/silverthinrim, BLACKtealscreenwith4cyanstatusBARSandgreen/yellowsquares. ALLscreenbarlongedgesSLOPEDDOWNRIGHT2:1parallelTVtop,barsprintedonsameflatplane,no screenhorizontalstraightlines. Sameexactguideparallelogram, no stand/cables, nodanglingextras.
```

### bar-chart

```text
Preciseedit SAME1254canvas. Keepchartframe/axes/gridlinecolors/positionunchanged. MakeTOPedgesof4coloredBARSslopeDOWNRIGHT26.565degrees(2right1down), parallelgraygridlines. EachbarflatPARALLELOGRAMwithverticalsides; nofrontalrectangularbarcaps. Also shortenframeBOTTOMRIGHTcornerby3pixelsupsooutlineinsideguide. Nootherchanges pureFF00FFbackground.
```

### first-aid

```text
Preciseedit SAME1254canvas. KeepcabinetandlatchOUTLINEexactfixed. REDCROSSonly: makeitsdownslopeDOUBLEcurrentangleto26.565degreesparallelcabinetTOP. ShiftleftcrossarmUP35pixelsandrightarmDOWN35pixels, keepingverticalstrokesvertical. Redcrosspaintedflatonthedoor, notfloatingfrontal. Nootherchanges.
```

### clock

```text
Preciseobjectedit: moveENTIREroundclockUP150originalpixelswithinSAME1254canvas. Noresizing/changeshape/colors/hands. Bottomcurrentlyy959becomesy809. ReplacevacatedareaFF00FF. KeepONLYclock,noextraobjects.
```

### wall-tv-2

```text
Animationframe2 SAME1254canvas. KeepTVouterBEZEL/size/position/outlineEXACTUNCHANGED. ChangeONLYscreen cyanstatusBARlengths: row1shorten30%,row2shorten10%,row3shorten45%,row4shorten20%; rightremainingportionDARKteal. SmallstatussquaresalternateGREEN/YELLOW. Preservebarangles2:1DOWNRIGHTparallelTVedge. Nootherchanges pureFF00FFbackground.
```

### door

```text
Preciseedit same1254canvas: moveONLYexitSIGN UP6originalpixels, keepitsleft/right extents andallotherpixelspositionsunchanged. Signhighestpixelmusty203, not217. Doorframe/panel stayfixed, pureFF00FF.
```

### door-open-1

```text
Precise sprite edit of attached 1254x1254 original, KEEP canvas size and exact object placement, entire silver frame, green EXIT sign and fixed right frame fittings unchanged. Convert ONLY BLUE DOOR PANEL to sliding door 25% OPEN: slide panel rigidly RIGHT and UP along the west-wall plane, disappearing behind right silver jamb. Reveal a dark empty doorway on LEFT quarter of the opening; remaining blue panel occupies right three quarters. Window and yellow handle translate with panel, not stationary, not scaled. All panel top/bottom edges stay parallel rising right at 2:1 slope. NO hinge rotation, NO protrusion into room. Pure #FF00FF background, identical pixel art style and outline. No new wall or objects. Frame and exit lamp must not shift even one pixel.
Correction: Tiny correction ONLY to blue panel bottom edge: extend blue panel downwards to meet silver threshold directly, removing black gap UNDER bluepanel. Keep left dark opening25%width unchanged. All frame/sign/window/handle/bluepanelleftedge positions unchanged,1254canvasunchanged,FF00FFbackgroundunchanged. Sliding door remains25%open, no rotation. Blue panel lower edge parallel and adjacent threshold risingright2:1.
```

### door-open-2

```text
Edit attached sliding-door sprite one animation step: same1254x1254canvas, exact fixed frame/sign/placement. Slide ONLY blue panel farther RIGHT-UP behind right jamb until doorway is 50% OPEN: left HALF completely dark empty opening, blue panel only right HALF. Panel translates rigidly along west-wall plane, top/bottom edges rise right2:1, no rotation. Window and handle move with panel and clip behind jamb; no compression/rescaling. Preserve all silver frame and EXIT lamp pixel positions and pureFF00FF background. No protruding door, no added wall.
Correction: Tiny correction ONLY to blue panel bottom edge: extend blue panel downwards to meet silver threshold directly, removing black gap UNDER bluepanel. Keep left dark opening50%width unchanged. All frame/sign/window/handle/bluepanelleftedge positions unchanged,1254canvasunchanged,FF00FFbackgroundunchanged. Sliding door remains50%open, no rotation. Blue panel lower edge parallel and adjacent threshold risingright2:1.
```

### door-open-3

```text
Next frame of same sliding door. Keep exact1254canvas, frame, EXIT lamp, position and background unchanged. Open75%: dark opening fills left threequarters, only a narrow BLUE PANEL STRIP visible at right quarter. Translate blue panel right-up parallel to west-wall plane behind right jamb, do not rotate. Its visible bottom edge must align directly with threshold (no black gap below blue strip); upperedge directly under upper jamb. Window mostly clipped behind right frame; handle moved near right frame partly clipped. PureFF00FF, identical style. No blue panel outsideframe.
```

### door-open-4

```text
Final frame fully OPEN sliding door. Exact same1254squarecanvas, fixed silver frame, green EXITlamp, frame fittings, threshold and position unchanged. Remove remaining blue doorpanel, window and yellowhandle completely into wall behind right jamb. Entire opening inside silver frame is now uniform dark empty doorway, 100%open. No panel protrudes anywhere. PureFF00FFbackground, samepixelart edges. Preserve all frame/sign geometry.
```
