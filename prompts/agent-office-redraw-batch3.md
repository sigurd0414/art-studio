# agent-office 重畫第三批：地板設備與收納

版本：1.0。最後確認日期：2026-11-22。

需求來源：[agent-office#120](https://github.com/sigurd0414/agent-office/issues/120)；部門單：[art-studio#7](https://github.com/sigurd0414/art-studio/issues/7)。依 S-043 T3 及修正版規則第3條；範本參照 [agent-office 1.2](agent-office.md)，整理沿用 [原圖去背](../skills/gpt-original-cutout.md)、[風格來源](../styles/agent-office.md)。

## 設計與整理

只用內建imagegen逐件重畫，每件附需求方同名1254底圖作擺放範圍參考，前四批作畫風與身份參考。所有設備正面朝左下+gy；飲水機兩格共用位置與畫布，只改水桶氣泡，保留原生生成微差，未合成共用外殼。紙張及資料夾為薄片；托盤留開口、輸送帶有滾輪與腳，植物、掃具與掃地機保持自然外形。

17張採用原圖皆1254×1254，與工具輸出位元相同。去背只移除洋紅候選alpha並裁透明邊，保留RGBA逐像素相同，未程式縮放、改色、量化或修補物件。預覽才縮放；三欄以共同原畫布同倍率呈現；站、坐兩組GIF各3格共同座標，比例圖同時放第一批桌子／螢幕／椅子／隔板供比對。

成品只在 agent-office media `sigurd0414/agent-office/119/`：`gpt-originals/`、`gpt-cutout/`、`align/`、`align-results.txt`、`validation.json`、逐件`compare-<代碼>.png`、`overview.png`、`scale-geometry.png`、`workers-standing.gif`、`workers-seated.gif`、`prompts.md`。既有底圖與其他批次保留。

## 正式檢查

交件前在 agent-office 主資料夾拉最新 main `0e487e0`，以原版 `node web/scripts/sprite-geometry.ts check` 檢查17張採用原圖，全部 PASS。box接地角均3/3，outside全部0。未修改檢查器、幾何、業務程式或驗收測試。自然外形及同批比例最後交使用者看圖確認。

| 代碼 | 外形 | 顯示寬×高 | 原圖px | 去背px | 原圖裁框 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| filing-cabinet | box | 32×88 | 1254×1254 | 324×877 | 465,187,789,1064 |
| storage-cabinet | box | 48×120 | 1254×1254 | 359×875 | 447,186,806,1061 |
| water-dispenser | box | 32×93 | 1254×1254 | 306×866 | 474,205,780,1071 |
| coffee-machine | box | 32×76 | 1254×1254 | 375×884 | 440,185,815,1069 |
| shelf | box | 48×124 | 1254×1254 | 344×881 | 455,187,799,1068 |
| printer | box | 48×64 | 1254×1254 | 658×877 | 298,171,956,1048 |
| binder-rack | box | 32×32 | 1254×1254 | 874×884 | 190,188,1064,1072 |
| file-boxes | box | 32×40 | 1254×1254 | 720×893 | 267,185,987,1078 |
| cardboard-box | box | 32×38 | 1254×1254 | 748×884 | 253,187,1001,1071 |
| utility-cart | box | 48×54 | 1254×1254 | 802×862 | 226,190,1028,1052 |
| lounge-table | box | 64×54 | 1254×1254 | 884×746 | 185,256,1069,1002 |
| projector-stand | box | 32×46 | 1254×1254 | 628×892 | 313,186,941,1078 |
| recycle-bin | box | 16×26 | 1254×1254 | 551×886 | 352,187,903,1073 |
| trash-bin | box | 16×26 | 1254×1254 | 552×891 | 351,186,903,1077 |
| fire-extinguisher | free | 16×43 | 1254×1254 | 316×888 | 471,88,787,976 |
| umbrella-stand | free | 16×53 | 1254×1254 | 251×1020 | 502,43,753,1063 |
| water-dispenser-2 | box | 32×93 | 1254×1254 | 306×866 | 474,205,780,1071 |

```text
ALIGN key=filing-cabinet result=PASS match=98.2% left=0.29 right=0.29 corners=3/3 top=0.16 outside=0
ALIGN key=storage-cabinet result=PASS match=97.5% left=0.68 right=0.54 corners=3/3 top=0.36 outside=0
ALIGN key=water-dispenser result=PASS match=98.1% left=0.26 right=0.26 corners=3/3 top=1.84 outside=0
ALIGN key=coffee-machine result=PASS match=98.1% left=0.23 right=0.32 corners=3/3 top=0.23 outside=0
ALIGN key=shelf result=PASS match=98.3% left=0.37 right=0.37 corners=3/3 top=0.08 outside=0
ALIGN key=printer result=PASS match=80.3% left=0.02 right=0.02 corners=3/3 top=1.28 outside=0
ALIGN key=binder-rack result=PASS match=99.8% left=0.05 right=0.05 corners=3/3 top=0.02 outside=0
ALIGN key=file-boxes result=PASS match=97.2% left=0.43 right=0.43 corners=3/3 top=0.12 outside=0
ALIGN key=cardboard-box result=PASS match=98.7% left=0.21 right=0.21 corners=3/3 top=0.07 outside=0
ALIGN key=utility-cart result=PASS match=19.9% left=0.70 right=0.70 corners=3/3 top=0.09 outside=0
ALIGN key=lounge-table result=PASS match=14.6% left=0.26 right=0.26 corners=3/3 top=0.09 outside=0
ALIGN key=projector-stand result=PASS match=96.8% left=0.48 right=0.48 corners=3/3 top=0.08 outside=0
ALIGN key=recycle-bin result=PASS match=97.5% left=0.16 right=0.19 corners=3/3 top=0.05 outside=0
ALIGN key=trash-bin result=PASS match=97.5% left=0.19 right=0.19 corners=3/3 top=0.05 outside=0
ALIGN key=fire-extinguisher result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=4.98 outside=0
ALIGN key=umbrella-stand result=PASS match=100.0% left=0.00 right=0.00 corners=0/0 top=8.79 outside=0
ALIGN key=water-dispenser-2 result=PASS match=98.1% left=0.26 right=0.26 corners=3/3 top=1.74 outside=0
```

## 採用提示詞

### filing-cabinet

```text
Preciseobjectedit: REMOVEALL3SMALLFEETunderfilingcabinet, leavingflushcabinetflatbottom. KeepSAME1254squarecanvas, samebodytop/sides/drawers/position/colors. ReplaceonlyprotrudingfootpixelswithpureFF00FF. No movingorresizingcabinet.
```

### storage-cabinet

```text
Preciseobjectedit SAME1254canvas: extendONLYcabinetBOTTOMdown20pixels soflushbottomendsatfront(686,1066),left(451,949),right(803,1007), currentlybottomis20pixelsTOOHIGH. Extendwoodbottomplinth20pixels, keepalltopdoors/colors/outlinewidthunchanged. No danglingfeet, keep2:1bottomedges, pureFF00FFbackground.
```

### water-dispenser

```text
Use case precise-object-edit. SAME1254x1254squarecanvas, SAMEcabinet/jugposition/design/colors/pixelstyle. ChangeONLY the veryTOPofbluejug: extend the roundedbluejug crown UPWARDS by5originalpixels, from y217 to y212, keepallotherjugedgesandallcabinetpixelspositionunchanged. PureFF00FFbackground, noframe/noextras.
```

### coffee-machine

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 exact1254square placementguide ONLY; Image2 approvedSTYLE/identityreference ONLY, notoldposition. SAME1254x1254square canvas, exactguideposition. Drawnaturalrealisticconstruction INSIDEenvelope, notfeaturelesssolidblock. +gy FRONT BOTTOMLEFT, allstraightfloorlines2:1 dimetric, verticalsvertical, no perspectiveconvergence. Sameapproved crisp squaresteppedpixelart,dark#14121Doutline, flat3shades, caramel/steelgraypalette, no grain/blur/noise/gradient. ReachguideLEFT/RIGHTextremes, 3visibleBASEcorners, TOPheight; outeroutlineINSIDEguide nooutsidepadding. EraseALLguidewires/labels/arrows. Pure#FF00FFbackground,no floor/castshadow/extras. DrawonlyINSIDEguide naturalcharcoalcoffeemachine/redtop/3buttons/tealmug/silverdriptray ONcaramelwoodsingleDOORcabinet. MACHINEFRONTandcabinetDOORonLEFTvisibleplane facingBOTTOMLEFT +gy; RIGHTplaneisSIDEwithvents. Topreachguideheight, cabinet3basecornersreachguide. No floor/shadow, no solidblankcube.
```

### shelf

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 exact1254square placementguide ONLY; Image2 approvedSTYLE/identityreference ONLY, notoldposition. SAME1254x1254square canvas, exactguideposition. Drawnaturalrealisticconstruction INSIDEenvelope, notfeaturelesssolidblock. +gy FRONT BOTTOMLEFT, allstraightfloorlines2:1 dimetric, verticalsvertical, no perspectiveconvergence. Sameapproved crisp squaresteppedpixelart,dark#14121Doutline, flat3shades, caramel/steelgraypalette, no grain/blur/noise/gradient. ReachguideLEFT/RIGHTextremes, 3visibleBASEcorners, TOPheight; outeroutlineINSIDEguide nooutsidepadding. EraseALLguidewires/labels/arrows. Pure#FF00FFbackground,no floor/castshadow/extras. DrawONLYINSIDEthisguide: SLIMOPENstorageSHELF, 4steelpostsand4caramelwoodboards, smallred/cyan/yellowbinders,2tanboxes,paperbundles. Magentagapsbetweenshelves, no solidback. FRONTonLEFTplane bottomLEFT. COPYguideouterdimensions/position exactly, notoldreferenceproportions. No outsidepostorfeet. Keep1254square.
```

### printer

```text
Preciseobjectedit SAME1254canvas. TWOsmallgeometryfixesonly: 1) upperpaperFEEDERatx775..825y290..320 protrudesaboverightslopingtopedge; lowerthatlittlefeederpart25pixels. 2) ExtendRIGHTSIDEcabinetBOTTOM30pixels atfarRIGHTcornerx954 soendaty950(currenty917), blendingnewbottomdiagonaltoFRONTbottom(710,1042). KeepLEFTdrawerfacebottom/top/design/colors/positionunchanged. PureFF00FF noextras.
```

### binder-rack

```text
Preciseobjectedit: MIRRORentireobjectLEFT-RIGHT aroundcenterx627onSAME1254squarecanvas. Spines/whitelabels/fingerholesmustfaceBOTTOMLEFTnow,instead ofbottomright. Keepwidthheightallbasecornersidentical, samecolorspixelstylepureFF00FFbackground,noextras.
```

### file-boxes

```text
Preciseobjectedit SAME1254squarecanvas. KeepTOPcorner y188 andalltopblueLID/upperwhiteboxUNCHANGED. SHORTENLOWERcaramelBOX by55pixelsinverticalheight: bottomfrontcornery1118 becomes1063, bottomleft/rightcornersy945 become890. Keepwidthx276..978 andfrontx627, slopes2:1 unchanged. ThismeansshrinkONLYlowerboxwallheight vertically, no shiftentireobject. PureFF00FFbackground, samepixelstyle noframes.
```

### cardboard-box

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 exact1254square placementguide ONLY; Image2 approvedSTYLE/identityreference ONLY, notoldposition. SAME1254x1254square canvas, exactguideposition. Drawnaturalrealisticconstruction INSIDEenvelope, notfeaturelesssolidblock. +gy FRONT BOTTOMLEFT, allstraightfloorlines2:1 dimetric, verticalsvertical, no perspectiveconvergence. Sameapproved crisp squaresteppedpixelart,dark#14121Doutline, flat3shades, caramel/steelgraypalette, no grain/blur/noise/gradient. ReachguideLEFT/RIGHTextremes, 3visibleBASEcorners, TOPheight; outeroutlineINSIDEguide nooutsidepadding. EraseALLguidewires/labels/arrows. Pure#FF00FFbackground,no floor/castshadow/extras. NaturalSINGLEclosedCARDBOARDshippingbox, carameltanpapertextureFLAT, topfoldseam withbrowntapecross, smallblankwhitefrontlabel onLEFTplane. Boxflaps/tapeareclearlypaperconstruction. Baseandtopcornersfollowguideexact, nofloor/shadow.
```

### utility-cart

```text
Repaircartgeometryusingthisdiagnosticoverlay. SAME1254canvas, outputfullcolorPUREFF00FFbackground. CYANframeandGREENgroundlineareplacementonly; removeallcyan/green/redmarks. RedhighlightedCASTERSarebelowground: raiseLOWERTRAYandWHEELSby100pixels, shorteningsteelposts accordingly. Toptrayexactunchanged. AllcasterbottomswithinGREENline: leftwheelbottomy806,righty936,fronty1066. Natural2tieropensteelcart,keepwoodhandles/colors/pixelstyle.
```

### lounge-table

```text
Preciseobjectedit SAME1254canvas: removeONLY thetwoverythinblackdiagonalGUIDELINES onfloorconnecting left/front/rightfeet under table. ReplacewirepixelswithpureFF00FF, leave4legs/tabletop/style/size/positionunaltered. No otherchange.
```

### projector-stand

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 exact1254square placementguide ONLY; Image2 approvedSTYLE/identityreference ONLY, notoldposition. SAME1254x1254square canvas, exactguideposition. Drawnaturalrealisticconstruction INSIDEenvelope, notfeaturelesssolidblock. +gy FRONT BOTTOMLEFT, allstraightfloorlines2:1 dimetric, verticalsvertical, no perspectiveconvergence. Sameapproved crisp squaresteppedpixelart,dark#14121Doutline, flat3shades, caramel/steelgraypalette, no grain/blur/noise/gradient. ReachguideLEFT/RIGHTextremes, 3visibleBASEcorners, TOPheight; outeroutlineINSIDEguide nooutsidepadding. EraseALLguidewires/labels/arrows. Pure#FF00FFbackground,no floor/castshadow/extras. NaturalPROJECTORSTAND, a smallWHITEprojectorwithblackroundlens facingBOTTOMLEFT onthinsteelTOPTRAY, fourSLIMsteellegs/openframe, lowthinbasebarsand3visiblefeetatguidebasecorners. EMPTYMAGENTAairundertray, no solidcabinet. Projectortopreachguideheight, overallwidthguide, feetinside. No floorwires, noextracontent.
```

### recycle-bin

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 exact1254square placementguide ONLY; Image2 approvedSTYLE/identityreference ONLY, notoldposition. SAME1254x1254square canvas, exactguideposition. Drawnaturalrealisticconstruction INSIDEenvelope, notfeaturelesssolidblock. +gy FRONT BOTTOMLEFT, allstraightfloorlines2:1 dimetric, verticalsvertical, no perspectiveconvergence. Sameapproved crisp squaresteppedpixelart,dark#14121Doutline, flat3shades, caramel/steelgraypalette, no grain/blur/noise/gradient. ReachguideLEFT/RIGHTextremes, 3visibleBASEcorners, TOPheight; outeroutlineINSIDEguide nooutsidepadding. EraseALLguidewires/labels/arrows. Pure#FF00FFbackground,no floor/castshadow/extras. NaturalOPENblueRECYCLINGBIN withGREENthickrim, hollowdarkinside, smallgreenrecyclingsymbol onLEFTfrontplane, straightverticalsides/closedrealbottom, subtlepanelmouldings. ReachallguidecornersbutNOwire. Same1254squareposition, nofloor/nocastshadow.
```

### trash-bin

```text
Use case: stylized-concept. ONE agent-office game sprite. Image1 exact1254square placementguide ONLY; Image2 approvedSTYLE/identityreference ONLY, notoldposition. SAME1254x1254square canvas, exactguideposition. Drawnaturalrealisticconstruction INSIDEenvelope, notfeaturelesssolidblock. +gy FRONT BOTTOMLEFT, allstraightfloorlines2:1 dimetric, verticalsvertical, no perspectiveconvergence. Sameapproved crisp squaresteppedpixelart,dark#14121Doutline, flat3shades, caramel/steelgraypalette, no grain/blur/noise/gradient. ReachguideLEFT/RIGHTextremes, 3visibleBASEcorners, TOPheight; outeroutlineINSIDEguide nooutsidepadding. EraseALLguidewires/labels/arrows. Pure#FF00FFbackground,no floor/castshadow/extras. NaturalOPENsteelgrayWASTEBIN, charcoalrim,darkhollowinside, 2smallwhitecrumpledpaperballsINSIDEonlybelowrim, silvergraystraightwalls, smallsidegrips,NOrecyclinglogo. Basecornersandtoprimreachguidewithinbounds,realcontainer. Same1254squareposition.
```

### fire-extinguisher

```text
Preciseobjectedit SAME1254squarecanvas. Makeentireextinguisher10%NARROWER horizontallyaroundx627 (allpixelsnowx450..800mustwithinx475..780). Keepheightandverticalpositionexactlyunchanged (top85,bottom978), samedesign/colors/pixelstyle. PureFF00FFbackground, noextras.
```

### umbrella-stand

```text
Preciseobjectedit SAME1254squarecanvas. ChangeONLYleftredumbrellacurvedHANDLE: narrow/shortenitsleftwardhookby20pixels soleftmostblackpixelx505ratherthan485. Allotherpixelsposition/size/design/colorsidentical. PureFF00FFbackground,nootherchanges.
```

### water-dispenser-2

```text
Animationframe2. SAME1254squarecanvas exactdispenserposition/size/outline/cabinet/jug. ChangeONLYwaterjuginterior: add2smallwhitepaleBLUEairbubblesandshiftonehighlight slightly toshowgentlewatermotion. Keepallcabinet,background,outerjugshapeunchanged. PureFF00FFbackground. No movement/resize.
```
