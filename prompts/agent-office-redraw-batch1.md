# agent-office 重畫第一批：工位與桌上設備

版本：2.0。最後確認日期：2026-11-22。

需求來源：[agent-office#118](https://github.com/sigurd0414/agent-office/issues/118)；部門單：[art-studio#5](https://github.com/sigurd0414/art-studio/issues/5)。依 S-043 T3、第3條退回規則重畫17件。範本參照 [agent-office 1.2](agent-office.md)，整理沿用 [原圖去背](../skills/gpt-original-cutout.md)、[風格來源](../styles/agent-office.md)。

## 本次修正

線框只代表擺放範圍，物件照合理結構設計。桌子為薄桌面、桌腳與放腳鏤空；七個螢幕均為free，LCD薄機殼帶底座、CRT保留自然背殼；隔板是有框薄板及腳座，繪圖板為開放A架。未為填滿線框畫成實心方塊。只用內建imagegen重畫；每件附原有同名1254底圖，其幾何未改。後續局部修正也只用內建imagegen，原檔不作程式縮放、位移、重建或改色。

螢幕五格沿用母圖與共同原畫布、共同位置，僅指定內容及電源變化；原生生成微差依ADR-006 §2.4保留，沒有合成共用外殼。完整採用提示詞列於下方。

## 成品與檢查

成品只交需求方media的 `sigurd0414/agent-office/118/`：17張原圖、原解析度去背裁圖、正式工具疊圖與ALIGN結果；附三欄圖、全批預覽、共同場景尺度圖與五格GIF。原圖與生圖輸出位元相同；去背只將洋紅候選alpha設0並裁透明邊，保留RGBA逐像素相同。預覽縮放不影響PNG成品。

正式檢查於 agent-office#127 合併後，拉最新 main `0e487e0`，在需求方主資料夾以原版 `node web/scripts/sprite-geometry.ts check` 逐件執行，17/17 全部 PASS、outside 均0。重產底圖與原有底圖的 points、bottom、outline、scale、displaySize 完全一致；新底圖新增擺放範圍註解及七個螢幕free標示，生成時參考舊底圖，最終驗證使用新幾何。檢查器、幾何與測試未改。box 的 match 僅供參考，桌腳及薄隔板沒有填滿底緣是合理鏤空，以新規定四項條件判定。

| 代碼 | 外形 | 顯示寬×高 | 原圖px | 去背px | 原圖裁框 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| desk | box | 96×74 | 1254×1254 | 882×683 | 186,286,1068,969 |
| monitor-on | free | 40×48 | 1254×1254 | 536×746 | 320,188,856,934 |
| partition | box | 72×80 | 1254×1254 | 797×878 | 229,190,1026,1068 |
| partition-side | box | 40×64 | 1254×1254 | 559×844 | 353,229,912,1073 |
| monitor-on-2 | free | 40×48 | 1254×1254 | 536×746 | 320,188,856,934 |
| monitor-boot-1 | free | 40×48 | 1254×1254 | 536×746 | 320,188,856,934 |
| monitor-boot-2 | free | 40×48 | 1254×1254 | 536×747 | 320,188,856,935 |
| monitor-off | free | 40×48 | 1254×1254 | 536×746 | 320,188,856,934 |
| monitor-crt | free | 32×42 | 1254×1254 | 647×772 | 305,260,952,1032 |
| monitor-vertical | free | 24×52 | 1254×1254 | 355×846 | 425,188,780,1034 |
| drafting-board | box | 48×48 | 1254×1254 | 891×875 | 177,193,1068,1068 |
| laptop | box | 24×28 | 1254×1254 | 757×861 | 249,231,1006,1092 |
| chair | free | 32×64 | 1254×1254 | 425×793 | 411,200,836,993 |
| desk-lamp | free | 16×30 | 1254×1254 | 442×735 | 402,313,844,1048 |
| headphones-mug | free | 24×26 | 1254×1254 | 659×582 | 290,356,949,938 |
| pc-tower | box | 24×37 | 1254×1254 | 575×894 | 341,187,916,1081 |
| power-strip | free | 24×14 | 1254×1254 | 760×490 | 215,386,975,876 |

## 正式對齊結果

```text
ALIGN key=desk result=PASS match=12.9% left=0.17 right=0.17 corners=3/3 top=0.35 outside=0
ALIGN key=monitor-on result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=0.03 outside=0
ALIGN key=partition result=PASS match=18.1% left=0.32 right=0.41 corners=3/3 top=0.13 outside=0
ALIGN key=partition-side result=PASS match=97.7% left=0.01 right=0.82 corners=3/3 top=2.95 outside=0
ALIGN key=monitor-on-2 result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=0.03 outside=0
ALIGN key=monitor-boot-1 result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=0.03 outside=0
ALIGN key=monitor-boot-2 result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=0.02 outside=0
ALIGN key=monitor-off result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=0.03 outside=0
ALIGN key=monitor-crt result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=3.42 outside=0
ALIGN key=monitor-vertical result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=0.04 outside=0
ALIGN key=drafting-board result=PASS match=96.3% left=0.63 right=0.14 corners=3/3 top=0.30 outside=0
ALIGN key=laptop result=PASS match=99.1% left=0.07 right=0.11 corners=3/3 top=1.35 outside=0
ALIGN key=chair result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=0.83 outside=0
ALIGN key=desk-lamp result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=4.22 outside=0
ALIGN key=headphones-mug result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=4.96 outside=0
ALIGN key=pc-tower result=PASS match=98.8% left=0.08 right=0.20 corners=3/3 top=0.07 outside=0
ALIGN key=power-strip result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=0.40 outside=0
```

## 採用提示詞

### desk

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. Design change: natural office desk with thin caramelwood top and FOUR slender steelgray legs, LARGE OPEN MAGENTA KNEE SPACE underneath. NO solidcabinet filling width. Small shallowdrawer justundertop optional. Keep exacttabletop diamond topTop(481,289),topLeft(188,435),topRight(1066,581),topBottom(773,728); lowerfoot contacts at(188,673),(773,965),(1066,819), fourth rearfoot hidden. Legs INSIDE envelope, bottomdarkoutline neveroutside. +gy FRONTBOTTOMLEFT. Exacttopheightandleft/right limits, hollowbetweenlegs.
Edit: Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. Use case edit: Keep desk designwithopenkneespace, tabletop andallotherlegs. Correct ONLY LEFTMOST leg: shorten its bottom by50pixels so leftfoot ends at(188,673), noty725. Front foot at(773,965),right footat(1066,819). Exactthreecontactcorners asguide. Nooutlineoutsidecube, cornersinside6px. Samecanvas1254.
```

### monitor-on

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. Draw a THIN modern LCD onslenderneck andsmall flatstand, NOT cuboid. It is a FREE object: occupy only CENTRAL70% of the guide's widthandheight, leaving large20% sideclearance. Screenfront+gyBOTTOMLEFT, horizontaledges2:1. Screen aroundx380..900,y300..850; smallfootaroundx600..760,y850..940, entirely insidebase diamond. Highestpanelnotaboveguide, lowestfootnotbelowdiamond. Cyanrows onnavyscreen, silverthinrim, greenLED. Do notcopy guidewire asoutline; onlyactualmonitoroutline. No boxfill, no labels.
Edit: Use case: precise-object-edit. Keep THIN LCD screen exactly asimage1. Replace ONLY baseplate/neck: baseplate must be a LONG NARROW PARALLELOGRAM, NOT a square diamond. Its fourcorners exactly(500,800),(700,900),(740,880),(540,780), 2:1 slope. Lowestplatepixel <=910. Shortneck reaches screenbottomcenter, no pixelbelowbase. This footprint is 2wide x0.5deep so squarebase iswrong. Preserve1254canvas,screenpixels,puremagenta. No guidewires,labels,floor,shadow.
Edit: Use case: precise-object-edit. Reposition WHOLE thin LCD sprite UPWARD by100 sourcepixels inside SAME1254x1254canvas. Keep its size,screen/standgeometry/style/colors. Current base sitsbelow guidefootprint, must lift wholeobject tofit. Puremagenta fillvacatedlowerarea, no crop orscale. Guide image2 positionenvelopeONLY; finalthinmonitor should lie with basewithinfootprint diamond and topstillinsideguide. Do not redrayoutside guide, no framewire/labels. This is positional correction via built-in generation, not standalonebackgroundcrop.
```

### partition

```text
Edit this guide IN PLACE, no resizing/recentering.1254x1254. Turn it into a pixel art orange office partition. Paint ONLY ONE vertical face as a THIN silver framed orange corkboard, two small blank cyan/yellow notes. Keep all original corner positions! Other vertical face must be EMPTY magenta, NOT solidvolume. Ground edge is two slim steel feet exactly following bottom outline (paint feet ABOVE outline, notbelow). Silverframe/darkcharcoal edge, cleansteppedpixels, flat3shades. Keep guideouterbounds andheight EXACT. Erase remaining guidewires and all text. PureFF00FF background. Footprint endpoints remain at originalguide corners; no extensions outside. Natural thinboard with open gapbelow, notcube.
Edit: Precise object edit. Remove ONLY the leftover BLACK wireframe scaffold: black top/back outline and black side upright are unwanted guide lines. Replace those black wires with pureFF00FF. Preserve orange board, silver actualframe andsilverfeet exactly; no newboxfaces orshadow. SAME1254canvasposition andpixelstyle. Natural thinboard remains.
Edit: Precise edit: make ONLY the orangeboard TALLER upward by 90 sourcepixels. Keep BOTTOMedge, FEET andcanvas coordinates EXACTLY fixed. Lift entiretopframe/upperedge 90px vertically, extendorangefaceupward, verticalsideframeslonger. Do notmoveorresizewholeobject. Same1254canvas. No scaffold/wires. Natural THINframedboard, no solidcube. Orangefaceflatclean3shades, no randomgrain/dots. PureFF00FF background.
Edit: Precise tinyedit SAMEcanvas: boardcurrentlytootall. LOWER ONLY TOPFRAME by60sourcepixels (topmosty150->210). Bottomframe/feet andnotesfixed. ShortentwosideverticalframesfromTOPonly. Topedge2:1sameangle, orangefacecleanflat. Do notmoveorrescaleentiresprite. PureFF00FF, natural thinboard.
Edit: Preciseedit: ONLY extendboardUPWARD35sourcepixels. Topframecurrentlyy244; targettopmosty210. Bottom/feet/notesandcanvasfixed. Lengthensidesfromtopby35, topedgesame2:1slope. No otherchange.
```

### partition-side

```text
Edit this guide IN PLACE, no resizing/recentering.1254x1254. Turn it into a pixel art orange office partition. Paint ONLY ONE vertical face as a THIN silver framed orange corkboard, two small blank cyan/yellow notes. Keep all original corner positions! Other vertical face must be EMPTY magenta, NOT solidvolume. Ground edge is two slim steel feet exactly following bottom outline (paint feet ABOVE outline, notbelow). Silverframe/darkcharcoal edge, cleansteppedpixels, flat3shades. Keep guideouterbounds andheight EXACT. Erase remaining guidewires and all text. PureFF00FF background. Footprint endpoints remain at originalguide corners; no extensions outside. Natural thinboard with open gapbelow, notcube.
Edit: Precise object edit. Remove ONLY the leftover BLACK wireframe scaffold: black top/back outline and black side upright are unwanted guide lines. Replace those black wires with pureFF00FF. Preserve orange board, silver actualframe andsilverfeet exactly; no newboxfaces orshadow. SAME1254canvasposition andpixelstyle. Natural thinboard remains.
Edit: Precise edit: make ONLY the orangeboard TALLER upward by 60 sourcepixels. Keep BOTTOMedge, FEET andcanvas coordinates EXACTLY fixed. Lift entiretopframe/upperedge 60px vertically, extendorangefaceupward, verticalsideframeslonger. Do notmoveorresizewholeobject. Same1254canvas. No scaffold/wires. Natural THINframedboard, no solidcube. Orangefaceflatclean3shades, no randomgrain/dots. PureFF00FF background.
Edit: Precise tinyedit SAMEcanvas: LOWER ONLY TOPFRAME by60sourcepixels (topmosty150->210), bottomframe/feet/notesfixed. ShortensidesfromTOPonly. Also liftRIGHTMOSTshortfoot end20pixels (y870->850), shortenrightfootstem only, leftfootfixed. Do notmoveentireboard. PureFF00FF. Keepnatural thinboard.
Edit: Preciseedit samecanvas. TOPEDGE haswrongangle: must2:1. Redrawtopframe LEFTendat(462,448), RIGHTendat(901,228), straight2:1 line (currentlylefttooHIGH). Extend/shortensideframesonlyfromtop, notes/bottomfixed. BottomRIGHT footcap toolow: itsBOTTOMmusty846 atx901, shortenitup25px andliftadjacentright10%ofbottomrail accordingly. Restunchanged. Thinboard notcube,puremagenta,no guidewires.
Edit: Tiny finishingedit same1254canvas. LiftTOPFRAMEONLY 8sourcepixels (topright230->222), sidesextendup8; everythingelsefixed. Also makeboth footcapsSLIMMER by6pixels vertically: remove6px fromBOTTOMofleftandrightfootcaps andbottomrail, replacewithmagenta. Keepnaturalfootstructure andsamepositions,width,board. No otherchange.
Edit: Precise tinyedit ONLY rightend footcap near(900,865). Shortenrightverticalpost/footcap fromBOTTOM by15pixels: no cap pixelbelow y855 at x890..910. Raise adjacent shortendofbottomrail15px asneeded. Do NOT changeboard/top/leftfoot/notes/overallposition. Same1254canvas/pureFF00FF. Retainoriginalstyle.
Edit: Tinyedit: shorten ONLY rightmost footcap bottom by another6pixels, atx890..912,y845..860. Erasebottom6px toFF00FF, keepthinsteelendcapnatural. Board/otherpixels/canvascompositionfixed. Same1254square, no resize/recenter.
Edit: Microscopicedit: topRIGHTtip at(900,219) hasamagentaantialiaspixel outside. Lower ONLY TOPFRAME by4sourcepixels, notfoot orwholeobject. Preserve2:1angle andbody. Toprightmustbe y224, lefttop y444. Keepcanvas1254/pureFF00FF/sameframedthinboard. Nootherchanges.
Edit: Precise colorcorrection ONLY maincorkpanelinsideframe: restore warmCARAMEL ORANGE (#DF841B mainshade), matchingotherorangeofficepartition. Itbecameyellowlastedit. Keepnotes cyan/yellow,silverframe,feet,OUTEREDGE andcanvaspositions EXACT, no geometrychange. Flatpixelart shades, pureFF00FF backdrop.
```

### monitor-on-2

```text
Use case: precise-object-edit. In reference1 THIN LCD change ONLYscreencontent to alternate ON cyanrows change lengths andbottomcursor. Preserveexactsame1254canvas, screenposition/outline/thickness, neck, flatstand, allstaticpixels andmagenta background. Geometryguide image2 sameenvelope, doNOTdrawguideorfillit. No recenter,rescale,newstand or solidcube. Samepixelart.
```

### monitor-boot-1

```text
Use case: precise-object-edit. In reference1 THIN LCD change ONLYscreencontent to BOOT1 screenalmostblack withtinywhitecursoratcenter. Preserveexactsame1254canvas, screenposition/outline/thickness, neck, flatstand, allstaticpixels andmagenta background. Geometryguide image2 sameenvelope, doNOTdrawguideorfillit. No recenter,rescale,newstand or solidcube. Samepixelart.
```

### monitor-boot-2

```text
Use case: precise-object-edit. Reference1 THINmonitor is fixedmother. Change ONLYscreen/powerstate to BOOT later: tinycyanbooticon andshortprogressbaronnavyscreen. Keep everyframe/neck/foot/color/pixelstyle and exactposition same, same1254squarecanvas. Reference2guide is placementenvelope notshape. Neveraddthickness/standheight or recenter, no guidewires/labels/floor/shadow. Puremagenta.
```

### monitor-off

```text
Use case: precise-object-edit. Reference1 THINmonitor is fixedmother. Change ONLYscreen/powerstate to OFF darknavyblackblankscreen andpowerLEDdarkgray. Keep everyframe/neck/foot/color/pixelstyle and exactposition same, same1254squarecanvas. Reference2guide is placementenvelope notshape. Neveraddthickness/standheight or recenter, no guidewires/labels/floor/shadow. Puremagenta.
```

### monitor-crt

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. FREE object: compactretro CRT display withrounded silvergrayback (actualmonitorhousing, notsolidcube), darkcurvednavyscreen/cyancursorfront+gyBOTTOMLEFT, smallswivelneck andlowfoot. Fit CENTRAL70% guide, base INSIDEfootprintdiamond wellabovelowerguideedge. Magenta visiblearoundneck. Do not fillguidevolume.
```

### monitor-vertical

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. FREEthin portraitmonitor onslenderneck andcompactbase. Wholeobject occupy CENTRAL80% guideheight, topnotabove y210 andbottomaroundy990. Allpixelsx455..795. Foot centered(650,960), compactfeet INSIDEguidebase diamond (559,863),(830,998),(695,1066),(424,931). Screenfront+gyBOTTOMLEFT, navy/cyanrows, silverthinrim, largegapsaroundneck. Not solidtower. No guidewires.
Edit: Use case: precise-object-edit. Tiny placementcorrection: redraw SAME monitor-vertical sprite only 30 sourcepixels HIGHER in SAME1254canvas, do notchangesize,design,style. Basecontactslightlytoo low, mustsitinsideguidefootprint. No crop/rescaleprogram, built-inredrawonly. Keep magentabackground, no guidewires. Movementissmall, notwholecell. Preserve '+gy' monitor or '+gx' chairface.
```

### drafting-board

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. Natural desktop draftingboard: THIN framed cream drawingpanel withcyanblueprint andoneorange pencil, tiltedon an OPEN steel foldingA-frame support. MAGENTA GAP underneath, no solidwoodpedestal orcube. +gyfrontBOTTOMLEFT. Boardtop andouterwidthreachesguideuppercorners; supportfeet at guidebasecorners (188,773),(773,1066),(1066,919), inside envelope. Wholemodelmatchesguideheight, footendsflush, frameparallel2:1.
Edit: Precise object edit: same1254canvas, same natural OPEN A-frame draftingboard andstyle. ONLY shortenlegs/movebottomrails up: leftfoot bottomat(188,773), frontfoot(773,1066), rightfoot(1066,919). Bottomrails TOP edgescurrently nearthese coordinates but must be BOTTOMedges instead: nofoot/railbelowline(188,773)->(773,1066)->(1066,919). Liftleftfoot40px, frontfoot25px,rightfoot25px, redrawconnectingrails. Keepboardtopunchanged, magentagaps, no solidpedestal. Pure#FF00FF.
Edit: Precise edit: same1254canvas draftingboard, only lift LEFTFRONT FOOT and attached leftendofbottomrail UP35sourcepixels. Keep boardtop, allotherfeet andframepositionsfixed. Currentleftfootbottomy825, targety785. Shortenleftsupport/redrawrail risingtoleft. No wires, naturalopenAframe andmagenta gap. Preservestyle.
Edit: Precise VERYtinyedit same1254canvas: LEFTMOST foot cap extends too farleft. Move ONLY leftmostfootcap 12 sourcepixels RIGHT and8pixels UP. Trimthiscap toinside x188..218,y760..791. Keep restAframe,board,allotherfeet unchanged. PureFF00FF, no wires.
```

### laptop

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. NaturalOPEN laptop with THIN displaylid, slimkeyboardbase, hingegap, charcoalbezel/cyanterminal screen, steelgraysides. No thickdesktopcube. Keepbasefootprint atguidevisiblebottomcorners andscreentopreachesguideheight; +gyfrontBOTTOMLEFT. Keyboardkeysblank. Rangeonly, emptyspacebehindtiltedlid allowed, actualthinbody notboxfill.
Edit: Precise object edit: SAME1254canvas andnatural thinopenlaptop. Extend RIGHT end ofkeyboardbase to x1003,y940 (currentlyx940,y940): rightbackcornerexact(1003,940), frontcorner(752,1066), leftcorner(250,815). Base remains THIN keyboardplane notsolidbox. Lid maystaywhereis, no repositionleft/front/top. Strict2:1 parallellines. Preservepixelart/cyanterminal/silvercharcoalidentity andpuremagenta. No guidewires.
```

### chair

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. FREE naturalblackpaddedoffice swivelchair, caramelarmrests, silvercasterbase,+gxFRONTBOTTOMRIGHT. Match oldidentity, redrawwithinrange x425..825,y250..1040. Allcastercontactinsidefootprint, no boxwire, gapbetweenlegs. Do notfillvolume.
Edit: Use case: precise-object-edit. Tiny placementcorrection: redraw SAME chair sprite only 15 sourcepixels HIGHER in SAME1254canvas, do notchangesize,design,style. Basecontactslightlytoo low, mustsitinsideguidefootprint. No crop/rescaleprogram, built-inredrawonly. Keep magentabackground, no guidewires. Movementissmall, notwholecell. Preserve '+gy' monitor or '+gx' chairface.
```

### desk-lamp

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. FREE naturalarticulatedsilvergraydesklamp withcharcoalshade/yellowinside andsmallcaramelbase. Matcholdidentity andguideplacement; footinsidebase diamond, supportarmsnotabox, magentagapsaroundarm. Straightedges2:1 whereapplicable.
```

### headphones-mug

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. FREE smallblackoverearheadphones withONE tealceramicmug, naturalcurvedshape andholeinheadband. Preserve approveddesign, both contactpointsinside footprintdiamondwithgenerous20pxmargin; no surroundingwirebox/cordoutside. +gyviewBOTTOMLEFT.
```

### pc-tower

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. NaturalsteelgrayPCtower withfrontopticaldrive/blankbuttons/greenpowerLED/vents, +gyfrontBOTTOMLEFT, actualcase haspanelseams andsmallfeet, notfeaturelesssolidcube. Its left/rightends,visiblebasecorners andtopreachguide, no pixeloutsideenvelope. Footcontacts atbaseguidecorners.
```

### power-strip

```text
Use case: stylized-concept. ONE office game sprite on SAME1254x1254 pure#FF00FF canvas. Guide image is PLACEMENT ENVELOPE ONLY, NOT objectshape: draw realistic recognizable design INSIDE it, NEVER fill as a solidcuboid. Exact2:1 dimetric, horizontal2pixels per1vertical, verticalsvertical, no perspective. Follow guideposition/height/footprint, do not recenter. Preserve approvedclean squaresteppedpixelart, dark#14121D outline, simpleflatsurface shades/caramelwood/steelgray colors, no grain/blur/dither. Erase ALLguidewires/annotation/arrows; no floor/castshadow/labels. FREE naturalwhitepowerstrip with3darksocketpairs, redrockerswitch andshortfoldedgraycord, lowthinbody angled2:1 +gyfrontBOTTOMLEFT. Matchapproveddesign. ENTIREcord/bodyinsideguidefootprintdiamond, no boxfill, no wires/annotation, no shadow. Basefitwith20pxmargin, nottouchcanvasbottom.
```
