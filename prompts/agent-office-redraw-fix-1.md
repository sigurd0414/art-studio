# agent-office 六件超框素材補畫

版本：1.1。最後確認日期：2026-11-22。

需求來源：[agent-office#119](https://github.com/sigurd0414/agent-office/issues/119)；部門單：[art-studio#10](https://github.com/sigurd0414/art-studio/issues/10)。依單上規則1–8及S-043 T3。整理沿用[原圖去背](../skills/gpt-original-cutout.md)、[牆面方向自檢](../skills/wall-mounted-orientation.md)、[風格來源](../styles/agent-office.md)。

## 設計與完整範圍檢查

只用內建imagegen逐件補畫，附需求方同名底圖及原成品作參考。原圖1254×1254，保存生成輸出，不以程式縮放或修補物件。去背只將洋紅候選及目視確認背景混色樣本alpha設0並裁透明邊，可見RGBA與原圖相同。預覽才縮放。未改其他68件、程式、幾何表或驗收測試。

掃地機改成低圓盤，獨立複核發現側刷淡粉紅殘邊後再以內建生圖修正原圖；剩餘11個淡粉背景混色點以局部去背遮罩設alpha0，座標逐點列於validation.json，不改原圖與保留像素RGB；兩盆植物保留方橘盆／圓淺盆的身份；滅火器包含完整把手與軟管；傘架包含兩個鉤柄與底盤；時鐘保留銀框、米色面與指針，沿北牆。所有直邊照2:1，地板正面朝左下+gy。

規則8另外查整件物件外接長方形。從guide JSON的outline取左右上下極值，對原圖以洋紅去背候選與左上背景RGB總色差>120兩種方法量測輪廓，兩者聯集的所有物件像素都必須在外框內；不是只看free接地PASS。bounds-results.json列四向超出場景單位與像素數，六件均0，沒有使用1單位容許量。逐件在bounds/疊圖與bounds-preview.png目視確認葉尖、側刷、把手、傘鉤、鐘框完整且都在藍色外框內。藍框只畫在檢查預覽，未修改原圖或成品。

交件位置僅需求方media `sigurd0414/agent-office/119/redraw-fix/`。附原圖、去背圖、原版check疊圖、完整藍框疊圖、6件三欄總覽、跨批比例圖及時鐘北牆對照。本批全靜態，沒有動畫。既有overshoot.png為需求方問題對照圖，保留不動。

## 檢查結果

交件前在 agent-office 最新main `af6127d8fc024485f31a3724fcab4a217923734f` 跑原版check，6件全部PASS；另測完整外框0超出並逐張目視。最後畫風與比例由使用者本人看圖確認。

| 代碼 | 顯示寬×高 | 原圖px | 去背px | 原圖裁框 | 外框超出px |
| :--- | :--- | :--- | :--- | :--- | :--- |
| robot-vacuum | 32×22 | 1254×1254 | 577×345 | 314,475,891,820 | 0 |
| plant | 32×46 | 1254×1254 | 445×666 | 412,276,857,942 | 0 |
| potted-plant | 32×46 | 1254×1254 | 509×783 | 372,224,881,1007 | 0 |
| fire-extinguisher | 16×43 | 1254×1254 | 293×790 | 487,218,780,1008 | 0 |
| umbrella-stand | 16×53 | 1254×1254 | 242×849 | 507,216,749,1065 | 0 |
| clock | 32×32 | 1254×1254 | 518×648 | 356,211,874,859 | 0 |

```text
ALIGN key=robot-vacuum result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=5.44 outside=0
ALIGN key=plant result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=4.58 outside=0
ALIGN key=potted-plant result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=1.86 outside=0
ALIGN key=fire-extinguisher result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=1.49 outside=0
ALIGN key=umbrella-stand result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=1.65 outside=0
ALIGN key=clock result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=0.82 outside=0
```

## 採用提示詞

### robot-vacuum

```text
Usecase stylized-concept. ONE officepixelart robotvacuum onSAME1254x1254FF00FFmagenta. Image1 exactplacementguide, Image2 designreference. Draw VERYFLAT lowgray/taupe CIRCULARrobotvacuum disk viewed2:1isometric, tinyfrontblackbumper/cyanbutton, smallLOWlidarsensor. Entirevacuum includingbrush mustINSIDE rectangle x188..1066,y325..929. Positiondisccenter(627,675), width600pixels,height330pixels inclsensor; bottomaroundy840, farbacktoparoundy500. Thisis6sceneunits HIGH only, nottallcylinder. Contactpointsinsidefloorbasediamond, nothingbelowitsfrontedges. FrontfacesbottomLEFT+gy. Crisppixelsteppedoutline/flat3shades approvedstyle, no blur/shadows/extras. REMOVE ALLguidewires/text. Do not drawvacuumuphigh; restontheBASEdiamond.
Correction: Preciseobjectedit SAME1254canvas: make ENTIREvacuum25%SMALLER inwidthandheight, centeredat(627,660). Currentvacuumwidth800 becomes600; totalheight480 becomes360. Objecttop480bottom840, left327right927. Keepidentitycolorsshape; physicallyLOWflatdisk withbodythickness60pxandtopellipseheight240px. Brushmustalsoshrinkwithbody andfitwithinbottom840. VacatedbackgroundpureFF00FF. No crop/no zoom/no otherobjects.
Correction: Only TRANSLATE entirevacuum UP120pixels and LEFT40pixels within SAME1254canvas. Currenttopy602bottom946 becomesTOP482BOTTOM826. Currentleft378right956 becomes338..916. Keepvacuumsize/colors/designexactunchanged. VacatedareaFF00FF. Nozoom/noresizing/nootherchanges.
Correction: Tiny preciseobjectedit SAME1254canvas: REMOVE palePINKhighlight/residue immediatelyLEFT of smallsidebrushunderfront-rightvacuumrim, originalcoordinatesx670..710,y782..803. Thisisbackgroundcontamination, repaint gap PURE#FF00FF, not pink. Keepblackbrushoutline andtanplasticbrushmount intact. Entirevacuumposition/size/design/colors/backgroundelsewhereUNCHANGED. No shadow. Puremagentaemptygapnexttobrush, no pale pinkpixels.
Correction: Same1254canvas. Clean ONLY vacuum UNDERBODY immediatelyLEFTofsidebrush. There are still palePINKpixels atx670..710,y780..803. Replace ENTIREthatlittlepinkpatch with SOLIDBLACK underside matching adjacentblackoutline, so no pinkgap/reflection remains. Keepbrushandplasticmount andallrestunchanged. No pale pinkanywhere onvacuum. PureFF00FFbackground.
Correction: Final edgecleanup exactsame1254canvas andvacuumpositions. Remove ALLmagenta/pinkREFLECTION fromgrayvacuumoutline. Specifically pinkthinverticalSEAM at(712,787)and(712,789..794), pinkdots(770,786),(770,793),(845,556). Repaint these tinyoutlinecontaminations BLACKmatching adjacentoutline. No pinkgrayhue onbody, useBLACKandNEUTRALtan/gray. KeepmagentaBACKGROUNDpureFF00FF, preservebrushandbodygeometry. Nootherchanges.
```

### plant

```text
ONE officepixelart GREENPLANT orange squareterracottapot, designidentity reference2. SAME1254FF00FFcanvas, reference1 exactplacementguide. EntireplantincludingLEAFTIPS inside rectangle x322..932,y188..1066. Draw at x400..850,y240..1030; TOPleafnohigherthan240. Potbottomcenter(627,1020), width270, lowerpotcontactinsidebottomdiamond; naturalgreen5leavesdarkoutline/chunkyflat3shades. Planttotalheight780px notover900. 2:1isometric pot edges, verticalsvertical, frontbottomLEFT+gy. No shadows/floor/extras, no guidewires/text. Do notdrawleavesaboveframe. Maintainapprovedofficepixelstyle.
Correction: Same1254canvas preciseobjectedit: redraw ENTIREplantandpot at80% currentwidthandheight, centeredat(627,670). TargetallvisiblepixelsINSIDE x390..865,y325..1020. Highestleafy325, potbottomy1020. Keepdesigncolorspixelstyle, do notcropanything, pureFF00FFbackground. Smallerpotnoleafgoesoutside targetbounds. Nootherobjects.
Correction: Onlytranslate ENTIREplantandpot UP140originalpixels withinSAME1254canvas. Currentpotbottomy1127 becomesy987; highestleafy461 becomesy321. Keepwidth/height/design/colorsexactunchanged. Noresize/nozoom. FillvacatedareaFF00FF. Do notcenterindependently.
```

### potted-plant

```text
ONE officepixelart pottedplant on SAME1254x1254magentaFF00FFcanvas. Image1 placementguide; image2 styleidentityreference only. Greenbroadleaves terracottaRIM creamROUNDpot. Entireplantinclleaves INSIDE rectanglex322..932,y188..1066. Aim visiblebbox x400..850,y280..1000. Potbottomaroundy1000 andcenterx627, potwidth250px; leafcrownwidth450px. Realisticplantheight30sceneunits inclpot, NO leafaboveguide. Potgroundcontactinsidebasediamond. 2:1isometric edges, frontfacesbottomLEFT+gy. Crispdarksteppedoutlines flat3shadesmatchingreference, no blur/texture/shadow/extras. RemoveALLguidewires/text. Not fillbox, preserve naturalleaves.
Correction: Preciseedit same1254canvas: redrawentirepottedplantat85%currentwidthandheight, keepbottomCENTERanchor(627,1020). Targetbbox x385..865,y285..1020. Naturalroundedcreampot/orangerim andgreenleavesunchangeddesign. ALLleaf/potextentssafelyinsideguideouterrectanglex322..932,y188..1066. Do notcropanything, shrinkwholeplantincludingpot. PureFF00FFbackground no extras.
Correction: ONLYtranslateENTIREpottedplant UP85originalpixels withinSAME1254canvas. Currentbottomy1082 becomey997; currenthighestleafy299 becomes214. Keepwidthheightcolorsshapeexactlyunchanged. NOresizing, no recentering. VacatedareaFF00FF.
```

### fire-extinguisher

```text
ONE officepixelart ORANGE FIREEXTINGUISHER exactidentityreference2 blackhandles/silverpressuregauge/blackhose/whitefrontlabel. SAME1254magentaFF00FFcanvas. Guide1 placementbounds, entireobjectINCLUDINGhandleandhoseINSIDE x464..790,y188..1066, targetbbox x500..754,y240..1020. Center627; baseontheguidegrounddiamond, potbottomy1020. Fullheight35sceneunits includeshandle. FrontfacesbottomLEFT+gy, 2:1isometriclabel/bodyedges, verticalcylinder. Crispdarksteppedoutline flat3shadepalette, no blur/texture/shadow/extras. REMOVEALLguidewires/text. Do notenlargeorautocenterabovetop.
Correction: Same1254canvas, redrawwholeextinguisher includinghandleshoseandbase at85%currentwidthheight, centeredx627 withBASEbottomy1010. Targetbbox x490..765,y260..1010. Everythingmustinside x464..790,y188..1066. Preserveorangebodyblackhandlewhiteblanklabelsilverbasepixelartdesign, no cropping. BackgroundFF00FF.
Correction: ONLYtranslateENTIREfireextinguisher UP65originalpixels onSAME1254canvas. Currentbasebottomy1064 becomes999. Keepwidthheightdesigncolorssame. Highesthandlemovesfromy274toy209. No resizing/noautocenter. VacatedareaFF00FF.
```

### umbrella-stand

```text
ONEofficepixelart UMBRELLASTAND exactidentityreference2: narrowopenSILVERsquarecage,creamdriptray,redandblueclosedumbrellaswith2BLACKHOOKhandles. SAME1254magentaFF00FFcanvas. Guideplacementbounds ENTIREOBJECTincludingbothhooks INSIDE x495..759,y188..1066. Targetbbox x520..734,y240..1020, centered627, traygroundcontactonthebasediamond. Fullheight45sceneunits INCLUDESHOOKS. Hookscompactnarrow, nothingaboveguide. 2:1isometric squaretray/cagerims verticalposts, frontfacesbottomLEFT+gy. Crisppixeloutline flat3shades, openholesmagenta, no texture/blur/shadow/extras. RemoveALLguidelines/text.
Correction: Same1254canvas preciseedit: reduce ENTIREumbrella stand includinghookshandlescagetray to85%widthheight, keepcenterx627, BASEbottomy1015. Targetbboxx515..740,y225..1015. Preserveallsilhouette/designredblueumbrellassilverrails/openholes. No cropping/nochangedaspect. Everyhookandtrayinsideouterrectx495..759,y188..1066. PureFF00FFbackground.
Correction: ONLYtranslateENTIREumbrella stand UP25originalpixels withinSAME1254canvas, currentbasebottomy1069 becomes1044. Keepwidthheight/design/colorsunchanged. Highesthookcurrenty224 becomes199. Noresize/nocrop/norecenter. VacatedareaFF00FF.
```

### clock

```text
ONE officepixelart ROUND WALLCLOCK silverrim creamface blackhourmarks/hands redsecondhand sameidentityreference2. SAME1254FF00FFcanvas. NORTHwall plane edgesdownright2:1, clockcircleprojectedellipticalonthatplane, verticalclockaxisvertical. Guideexactplacementbounds: ENTIREclockincludingrimINSIDErectx188..1066,y188..1066. Targetclockbbox x430..824,y300..800, centered627,550. Enoughmarginabove/allsides, no clockaboveguide. ClockbottommustbeABOVEguidebottomslopededgeatcorrespondingx. Crisppixelsteppedoutlineflatcolors, no blur/texture/shadow/guidewires/text/extras. Naturalclocknotrectangularboard.
Correction: ONLYtranslateENTIREclock UP110originalpixels andLEFT30pixels withinSAME1254canvas. Currenthighesty312 becomes202; lowesty956 becomes846. Keepdiameters/rim/hands/colorsunchanged, noresizing. VacatedareaFF00FF. Nootherobjects.
```
