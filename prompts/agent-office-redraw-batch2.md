# agent-office 重畫第二批：人物、匣子與小物

版本：1.0。最後確認日期：2026-11-22。

需求來源：[agent-office#119](https://github.com/sigurd0414/agent-office/issues/119)；部門單：[art-studio#6](https://github.com/sigurd0414/art-studio/issues/6)。依 S-043 T3 及修正版規則第3條；範本參照 [agent-office 1.2](agent-office.md)，整理沿用 [原圖去背](../skills/gpt-original-cutout.md)、[風格來源](../styles/agent-office.md)。

## 設計與整理

只用內建imagegen逐件重畫，每件附需求方同名1254底圖作擺放範圍參考，前四批作畫風與身份參考。站姿朝左下+gy、坐姿朝右下+gx；同姿勢三人共用位置與畫布，紫藍／橙／綠背心分角色，保留原生生成微差，未合成共用外殼。紙張及資料夾為薄片；托盤留開口、輸送帶有滾輪與腳，植物、掃具與掃地機保持自然外形。

17張採用原圖皆1254×1254，與工具輸出位元相同。去背只移除洋紅候選alpha並裁透明邊，保留RGBA逐像素相同，未程式縮放、改色、量化或修補物件。預覽才縮放；三欄以共同原畫布同倍率呈現；站、坐兩組GIF各3格共同座標，比例圖同時放第一批桌子／螢幕／椅子／隔板供比對。

成品只在 agent-office media `sigurd0414/agent-office/119/`：`gpt-originals/`、`gpt-cutout/`、`align/`、`align-results.txt`、`validation.json`、逐件`compare-<代碼>.png`、`overview.png`、`scale-geometry.png`、`workers-standing.gif`、`workers-seated.gif`、`prompts.md`。既有底圖與其他批次保留。

## 正式檢查

交件前在 agent-office 主資料夾拉最新 main `0e487e0`，以原版 `node web/scripts/sprite-geometry.ts check` 檢查17張採用原圖，全部 PASS。box接地角均3/3，outside全部0。未修改檢查器、幾何、業務程式或驗收測試。自然外形及同批比例最後交使用者看圖確認。

| 代碼 | 外形 | 顯示寬×高 | 原圖px | 去背px | 原圖裁框 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| worker-planner | free | 32×101 | 1254×1254 | 268×761 | 493,252,761,1013 |
| worker-planner-sit | free | 32×84 | 1254×1254 | 295×708 | 488,320,783,1028 |
| worker-coder | free | 32×101 | 1254×1254 | 268×762 | 493,251,761,1013 |
| worker-verifier | free | 32×101 | 1254×1254 | 268×762 | 493,251,761,1013 |
| worker-coder-sit | free | 32×84 | 1254×1254 | 296×709 | 488,319,784,1028 |
| worker-verifier-sit | free | 32×84 | 1254×1254 | 295×708 | 488,320,783,1028 |
| folder | box | 24×14 | 1254×1254 | 880×458 | 186,449,1066,907 |
| ticket-paper | box | 24×14 | 1254×1254 | 879×457 | 187,449,1066,906 |
| ticket-stack | box | 24×20 | 1254×1254 | 884×744 | 185,257,1069,1001 |
| in-tray | box | 48×28 | 1254×1254 | 884×513 | 185,372,1069,885 |
| conveyor | box | 48×30 | 1254×1254 | 883×551 | 185,354,1068,905 |
| paper-stack | box | 32×28 | 1254×1254 | 878×797 | 187,242,1065,1039 |
| rework-tray | box | 48×28 | 1254×1254 | 884×513 | 185,372,1069,885 |
| robot-vacuum | free | 32×22 | 1254×1254 | 822×538 | 216,134,1038,672 |
| broom-mop | free | 32×72 | 1254×1254 | 362×685 | 446,303,808,988 |
| plant | free | 32×46 | 1254×1254 | 608×885 | 319,42,927,927 |
| potted-plant | free | 32×46 | 1254×1254 | 585×896 | 333,36,918,932 |

```text
ALIGN key=worker-planner result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=7.29 outside=0
ALIGN key=worker-planner-sit result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=12.57 outside=0
ALIGN key=worker-coder result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=7.18 outside=0
ALIGN key=worker-verifier result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=7.29 outside=0
ALIGN key=worker-coder-sit result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=12.48 outside=0
ALIGN key=worker-verifier-sit result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=12.57 outside=0
ALIGN key=folder result=PASS match=99.5% left=0.07 right=0.02 corners=3/3 top=2.12 outside=0
ALIGN key=ticket-paper result=PASS match=99.7% left=0.04 right=0.02 corners=3/3 top=2.12 outside=0
ALIGN key=ticket-stack result=PASS match=99.1% left=0.10 right=0.10 corners=3/3 top=0.13 outside=0
ALIGN key=in-tray result=PASS match=99.1% left=0.20 right=0.20 corners=3/3 top=0.03 outside=0
ALIGN key=conveyor result=PASS match=99.4% left=0.14 right=0.09 corners=3/3 top=0.04 outside=0
ALIGN key=paper-stack result=PASS match=99.2% left=0.06 right=0.01 corners=3/3 top=0.09 outside=0
ALIGN key=rework-tray result=PASS match=99.1% left=0.20 right=0.20 corners=3/3 top=0.03 outside=0
ALIGN key=robot-vacuum result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=6.99 outside=0
ALIGN key=broom-mop result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=9.38 outside=0
ALIGN key=plant result=PASS match=100.0% left=0.17 right=0.00 corners=0/0 top=7.68 outside=0
ALIGN key=potted-plant result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=8.00 outside=0
```

## 採用提示詞

### worker-planner

```text
Redraw standingplanner onto EXACT1254x1254 SQUAREcanvas ofimage1, notportraitcanvas. Image2identityonly. Characterbodyx510..744, headwidth230, shoebottomsinsideguidebase at(585,1010),(665,1010), tophead250. FacingBOTTOMLEFT +gy. SamebrownhairedchibiwhitecollaredshirtVIOLETBLUEvest,charcoalpantsblackshoes, armsdown. Approvedcleanpixelartdarkoutline3flatshades. PureFF00FF,no wires/text/shadow. Freeobjectinsideguide, no cuboid. KeepwholecanvasSQUARE1254!
Edit: Precise tinyedit same1254SQUAREcanvas. ONLY make HEAD/HAIR 35pixels NARROWER overall, keepcenterx627: leftedgeat500,rightedge754. Currentheadleft480right775 too wide. Redrawheadnatural sameidentity/hairstyle faceLEFT, no otherbody/feet/positionchange. Headheightpreservedapproximately. PureFF00FF.
Edit: Tinyplacementedit SAME1254square: redraw SAMEwholecharacter 30sourcepixels HIGHER. Width/design/pose/sizeunchanged, onlyshiftup30. Shoescurrentlytoolow, shoebottomnewy1015. Keepmagenta, no annotations.
```

### worker-planner-sit

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 is1254square PLACEMENT ENVELOPE ONLY, image2 APPROVED STYLE/identityreference only. Redrawnewmatchingcleanpixelart: dark#14121D outline, flat3shades, crisp squaresteps, caramel/steelgraypalette, NO grain/noise/gradient. Strict2:1 dimetric, verticalsvertical, no perspectiveconvergence. SAME1254x1254canvas, exactguideposition. Pure#FF00FFbackground, eraseALLguidewires/labels/arrows, nofloor/shadow. Naturalrealobject INSIDEenvelope, NEVER fillvolumeasblock. SAMEbrownhairedchibiworker,violetBLUEvest/whiteshirt,charcoaltrousers, seatedinblackgraycasterchair handsforwardtyping. FACEBOTTOMRIGHT +gx sameasreference. Totalallpartsx480..775,y235..1030, shoeandcastercontactINSIDEbasediamondwith20pxmargin, frontcasterbottom(627,1035), sidecasters~(520,990),(730,990). No desk/keyboard, naturalopenchairgaps, no solidbox. Headnot oversizedbeyondguidewidth.
Edit: Preciseobjectredraw: subject tooWIDE forguide. Redraw SAME identity/pose/style MUCH NARROWER andslightlysmaller, wholemodelwidthMAX250px centeredx627 (x502..752). NOT current400px. Headwidth220px, shoulderwidth180px. Wholemodelheight~760px, top250, shoe/casterCONTACTbottomy1010. Feetmustcluster x570..685,y1005..1030, notspreadapart. SeatedchaircasterbaseMAX230px. Keep1254canvas andsamefaceorientation. Natural chibi proportions, no distortion/cuboid, preservepixelstyle/violetbluevest/brownhair. PureFF00FF.
```

### worker-coder

```text
Precise identity-preservingedit: SAME1254squarecanvas andexactcharacter/face/pose/position/proportions, ONLY change VEST andTIE color fromvioletblue toorange. Whitecollarandsleeves,brownhair,skin,blackpants/shoes,chairunchanged. No resize/recenter/addeditems. Samecrispflatpixelstyle,pureFF00FF background.
```

### worker-verifier

```text
Precise identity-preservingedit: SAME1254squarecanvas andexactcharacter/face/pose/position/proportions, ONLY change VEST andTIE color fromvioletblue toemeraldGREEN. Whitecollarandsleeves,brownhair,skin,blackpants/shoes,chairunchanged. No resize/recenter/addeditems. Samecrispflatpixelstyle,pureFF00FF background.
```

### worker-coder-sit

```text
Precise identity-preservingedit: SAME1254squarecanvas andexactcharacter/face/pose/position/proportions, ONLY change VEST andTIE color fromvioletblue toorange. Whitecollarandsleeves,brownhair,skin,blackpants/shoes,chairunchanged. No resize/recenter/addeditems. Samecrispflatpixelstyle,pureFF00FF background.
```

### worker-verifier-sit

```text
Precise identity-preservingedit: SAME1254squarecanvas andexactcharacter/face/pose/position/proportions, ONLY change VEST andTIE color fromvioletblue toemeraldGREEN. Whitecollarandsleeves,brownhair,skin,blackpants/shoes,chairunchanged. No resize/recenter/addeditems. Samecrispflatpixelstyle,pureFF00FF background.
```

### folder

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 is1254square PLACEMENT ENVELOPE ONLY, image2 APPROVED STYLE/identityreference only. Redrawnewmatchingcleanpixelart: dark#14121D outline, flat3shades, crisp squaresteps, caramel/steelgraypalette, NO grain/noise/gradient. Strict2:1 dimetric, verticalsvertical, no perspectiveconvergence. SAME1254x1254canvas, exactguideposition. Pure#FF00FFbackground, eraseALLguidewires/labels/arrows, nofloor/shadow. Naturalrealobject INSIDEenvelope, NEVER fillvolumeasblock. Draw ONLY a FLATthinmanilayellowfilefolder onBOTTOMDIAMOND ofguide, corners EXACT(188,590),(481,444),(1066,737),(773,883). TinyyellowtabINSIDEthispolygon. 4pxpaperedgeonly, NO raisedwalls/tray/box. LeavevolumeABOVE empty. Eraseallotherguidewires. Same1254SQUAREcanvas.
```

### ticket-paper

```text
Preciseedit ofTHIS1254x1254SQUAREimage: keepEXACTsamecanvas, paperposition/size/outline. ChangeONLY flatyellowfolderTOPsurface toWHITE, removetinybacktab, addonecyanheaderand3grayline marksparallelpaperedges. Thisisnowonetaskticketpaper. DoNOT crop, doNOT createwidecanvas, doNOT recenter/zoom. Retainall1254squaremagentaemptyspace. No container/frame. Pixelstyleunchanged.
```

### ticket-stack

```text
Preciseedit SAME1254squarecanvas andexactouteroutline. RemoveALL TAN/BROWN woodencontainer fromaroundpapers: replaceeverybrownface/rimwithWHITE/SILVERgray PAPER LAYERS soentireobjectisONLYstackofpaper, notpaperinsidebox. RaiseTOPpaperup tocurrentbackrimtop, fillbelowwithmanywhitepaperlayers tobasecorners. Keepcyanheaderandgraylines. No tan/brownanywhere. No crop/resize/recenter. PureFF00FF.
```

### in-tray

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 is1254square PLACEMENT ENVELOPE ONLY, image2 APPROVED STYLE/identityreference only. Redrawnewmatchingcleanpixelart: dark#14121D outline, flat3shades, crisp squaresteps, caramel/steelgraypalette, NO grain/noise/gradient. Strict2:1 dimetric, verticalsvertical, no perspectiveconvergence. SAME1254x1254canvas, exactguideposition. Pure#FF00FFbackground, eraseALLguidewires/labels/arrows, nofloor/shadow. Naturalrealobject INSIDEenvelope, NEVER fillvolumeasblock. NaturalEMPTY silvergraylowpaperINTRAY, hollowopenTOP, thinraisedside/backrims, frontopening. No paperinside, notsolidcube. Outline/basecorners/topheightmatchesguide. Placevisiblebasecorners/leftandrightends EXACTatguidecorners; outeredgesINSIDEguide, no thickeningoutside. +gyfrontBOTTOMLEFT. RemoveALLguidewires.
```

### conveyor

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 is1254square PLACEMENT ENVELOPE ONLY, image2 APPROVED STYLE/identityreference only. Redrawnewmatchingcleanpixelart: dark#14121D outline, flat3shades, crisp squaresteps, caramel/steelgraypalette, NO grain/noise/gradient. Strict2:1 dimetric, verticalsvertical, no perspectiveconvergence. SAME1254x1254canvas, exactguideposition. Pure#FF00FFbackground, eraseALLguidewires/labels/arrows, nofloor/shadow. Naturalrealobject INSIDEenvelope, NEVER fillvolumeasblock. NaturalshortROLLERCONVEYOR: steelgrayrails, sevenparallelcylindricalrollers,4shortlegswithopengapunder. RollertopatguideTOP, visiblefeetat3guideBASEcorners. NO solidpedestal/cube. +gyfrontBOTTOMLEFT. Exactguidewidthheight/position. DrawdarkoutlineINSIDEguideouterbounds; no outsidefeet/overhang. Eraseallguidewires.
Edit: Preciseedit SAME1254canvas same rollerconveyor. Only SHORTENthe3visibleLEGS frombottom: LEFTlegcurrentlybottomy670 mustbottomy609 (shorten60px). FRONTlegcurrentlyy920 targety901(shorten20). RIGHTlegcurrentlyy790 targety755(shorten35). Allbottomrails stay ABOVElinejoiningthose3footcontacts. Keeprollers/topunchanged. AlsorailsareSILVERSTEELgray nottanwood. Naturalopenlegstructure/nosolidblock. PureFF00FF, samepixelstyle, noresize/recenter/crop.
Edit: Preciseedit ONLY bottom LEFT LEG atx188..245,y600..680. ItistooLONG. Removebottom60pxofthisleg: newflatBOTTOM at y610, noty670. Shortenleftlegfrombottom, doNOTmoveupperrollers/frame. Keepallotherlegs/width/canvasunchanged. Same1254square, steelgrayrollerconveyor. Theleftmost footshouldonlyprotrude20pxbeneathrail. PureFF00FF.
Edit: Tinyfinishingedit SAME1254squarecanvas: shorten LEFTmostfoot another25pixels fromBOTTOM (x185..245,y620..655), footbottomnewy625. Shorten FRONTfoot another12pixels fromBOTTOM (x710..780,y890..915), bottomnewy900. Keepsteelrails/rollers/top/allotherpositionunchanged. No resizing. PureFF00FF.
Edit: Tinyedit ONLY LEFTMOSTLEG: erase protrudinglowerstub belowleftsideframe, atx185..230,y620..655, replacewithpureFF00FF. Leftendbottommustflataty620, no pixelsbelow620inthatregion. Keepallrollers/rails/otherfeetandcanvas1254unchanged. Thisisnotwholeobjectmove.
```

### paper-stack

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 is1254square PLACEMENT ENVELOPE ONLY, image2 APPROVED STYLE/identityreference only. Redrawnewmatchingcleanpixelart: dark#14121D outline, flat3shades, crisp squaresteps, caramel/steelgraypalette, NO grain/noise/gradient. Strict2:1 dimetric, verticalsvertical, no perspectiveconvergence. SAME1254x1254canvas, exactguideposition. Pure#FF00FFbackground, eraseALLguidewires/labels/arrows, nofloor/shadow. Naturalrealobject INSIDEenvelope, NEVER fillvolumeasblock. NaturalstackWHITEPAPER restingonTWOcyanBLUEringbinders, visiblepaperlayers, smallyellowbookmark, no tan/brown container orwoodframe. Outerextent/basecorners/topfollowguide, butrealisticpaper/bindersdetails. +gyfrontBOTTOMLEFT. DrawdarkoutlineINSIDEguideouterbounds; no outsidefeet/overhang. Eraseallguidewires.
```

### rework-tray

```text
Preciseedit SAME1254squarecanvas andexacttraygeometry/position. ChangeONLYsilvergrayplasticrims/base toREDplastic, shade3reds likeapprovedreworktray. OpenemptyTOP/frontopening unchanged. No resize/crop/recenter. PureFF00FF.
```

### robot-vacuum

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 is1254square PLACEMENT ENVELOPE ONLY, image2 APPROVED STYLE/identityreference only. Redrawnewmatchingcleanpixelart: dark#14121D outline, flat3shades, crisp squaresteps, caramel/steelgraypalette, NO grain/noise/gradient. Strict2:1 dimetric, verticalsvertical, no perspectiveconvergence. SAME1254x1254canvas, exactguideposition. Pure#FF00FFbackground, eraseALLguidewires/labels/arrows, nofloor/shadow. Naturalrealobject INSIDEenvelope, NEVER fillvolumeasblock. FREE naturalROUND lowsteelgrayrobotvacuum, smallraisedLIDARturret, tinycyanLED andshortblackbrush INSIDEfootprint. Ellipticaltopconsistent2:1camera, no cuboid. EntirebottomcontactsINSIDEbasediamondwith25pxmargin, do notfillcorners.
Edit: Placementcorrection: redraw SAMEobject 130sourcepixels HIGHER onSAME1254squarecanvas. Size,width,design,color,orientationunchanged. Wholeobjectcurrentlytoolow, moveup130pixels only. PureFF00FFbackground, no wires, no floor/shadow, preservepixelart. Do notcrop/recenter.
```

### broom-mop

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 is1254square PLACEMENT ENVELOPE ONLY, image2 APPROVED STYLE/identityreference only. Redrawnewmatchingcleanpixelart: dark#14121D outline, flat3shades, crisp squaresteps, caramel/steelgraypalette, NO grain/noise/gradient. Strict2:1 dimetric, verticalsvertical, no perspectiveconvergence. SAME1254x1254canvas, exactguideposition. Pure#FF00FFbackground, eraseALLguidewires/labels/arrows, nofloor/shadow. Naturalrealobject INSIDEenvelope, NEVER fillvolumeasblock. FREE naturalbroomwithcaramelhandle/yellowbristles, silvermopwithbluehead andSMALLgraybucket/yellowwringer, leaning together. NarrowgroupINSIDEguidewidth, allbristles/mop/bucketbottomINSIDEfootprintwith25pxmargin, magentagapsbetweenhandles. Fullheightnear guideupperlimit. No cuboid/enclosure.
Edit: RedrawTHISsamebroom/mop/bucketgroup25percentSMALLER overall onSAME1254SQUAREcanvas. Centerx627, wholeobjectx450..800, top270, lowestbristles/bucket/mopbottomy990. Allfeetfitwithinbasediamond. Preserveexactidentity/colors/pixelstyle, noextraobjects, magentagaps. Do notcroporchange1254canvas.
```

### plant

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 is1254square PLACEMENT ENVELOPE ONLY, image2 APPROVED STYLE/identityreference only. Redrawnewmatchingcleanpixelart: dark#14121D outline, flat3shades, crisp squaresteps, caramel/steelgraypalette, NO grain/noise/gradient. Strict2:1 dimetric, verticalsvertical, no perspectiveconvergence. SAME1254x1254canvas, exactguideposition. Pure#FF00FFbackground, eraseALLguidewires/labels/arrows, nofloor/shadow. Naturalrealobject INSIDEenvelope, NEVER fillvolumeasblock. FREE naturalGREENbroadleafhouseplant inORANGEterracottapot sameidentityreference. Leavesinsideguidewidthwith20pxmargin, potfootcontactINSIDEbase diamondwith30pxmargin, notatlowercorners. Entireplantheightnearupperrange. Recognizable leaveswithmagentagaps, no cubicpot.
Edit: Placementcorrection: redraw SAMEobject 80sourcepixels HIGHER onSAME1254squarecanvas. Size,width,design,color,orientationunchanged. Wholeobjectcurrentlytoolow, moveup80pixels only. PureFF00FFbackground, no wires, no floor/shadow, preservepixelart. Do notcrop/recenter.
```

### potted-plant

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 is1254square PLACEMENT ENVELOPE ONLY, image2 APPROVED STYLE/identityreference only. Redrawnewmatchingcleanpixelart: dark#14121D outline, flat3shades, crisp squaresteps, caramel/steelgraypalette, NO grain/noise/gradient. Strict2:1 dimetric, verticalsvertical, no perspectiveconvergence. SAME1254x1254canvas, exactguideposition. Pure#FF00FFbackground, eraseALLguidewires/labels/arrows, nofloor/shadow. Naturalrealobject INSIDEenvelope, NEVER fillvolumeasblock. FREE secondsmallhouseplant: roundedGREENleaveson3naturalstems inCREAMcylindricalceramicpot withcaramelrim, sameapprovedpixelstyle. Leaveswithinrange, potfootinsidebasediamondwith30pxmargin. Distinctfrombroadleaforangeplant, noflowers, no extraobjects. Naturalnotcuboid.
Edit: Placementcorrection: redraw SAMEobject 80sourcepixels HIGHER onSAME1254squarecanvas. Size,width,design,color,orientationunchanged. Wholeobjectcurrentlytoolow, moveup80pixels only. PureFF00FFbackground, no wires, no floor/shadow, preservepixelart. Do notcrop/recenter.
```
