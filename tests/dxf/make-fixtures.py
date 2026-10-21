#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""產生 tests/dxf/fixtures/ 下的 DXF 測試檔。

    pip install ezdxf
    python3 tests/dxf/make-fixtures.py

產出的檔案已進版控，平常跑 `npm run test:dxf` 不需要 Python；
只有要新增或調整測試檔時才需要重跑這支腳本。
"""
import math
import os
import sys

import ezdxf
from ezdxf.enums import TextEntityAlignment

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
os.makedirs(OUT, exist_ok=True)


def save(doc, name, encoding=None, fmt='asc'):
    path = os.path.join(OUT, name)
    if encoding:
        doc.encoding = encoding
    doc.saveas(path, fmt=fmt)
    print('寫出', name, os.path.getsize(path), 'bytes')


def new(version, insunits=None, codepage=None):
    doc = ezdxf.new(version)
    if insunits is not None:
        doc.header['$INSUNITS'] = insunits
    if codepage:
        doc.header['$DWGCODEPAGE'] = codepage
    return doc


# ---------------------------------------------------------------------------
# 1. 三個版本的基本圖元
# ---------------------------------------------------------------------------
def basic_entities(doc, with_modern=True):
    """同一組圖元：LINE×4（矩形 4000×3000）、CIRCLE、ARC、閉合多段線（含 bulge）、TEXT、
    （R2000+）LWPOLYLINE、ELLIPSE、SPLINE、MTEXT、HATCH"""
    msp = doc.modelspace()
    doc.layers.add('WALL')
    doc.layers.add('FURN')
    doc.layers.add('TEXT')
    # 4 條牆線：4000 × 3000
    pts = [(0, 0), (4000, 0), (4000, 3000), (0, 3000)]
    for i in range(4):
        msp.add_line(pts[i], pts[(i + 1) % 4], dxfattribs={'layer': 'WALL'})
    msp.add_circle((1000, 1000), 300, dxfattribs={'layer': 'FURN'})
    msp.add_arc((2000, 1000), 500, 0, 90, dxfattribs={'layer': 'FURN'})
    msp.add_text('ROOM A', height=200, dxfattribs={'layer': 'TEXT'}).set_placement((500, 2500))
    if with_modern:
        # 閉合 LWPOLYLINE：矩形 1000×600，右邊那段是半圓（bulge = 1）
        lw = msp.add_lwpolyline([(2500, 2000, 0, 0, 0), (3500, 2000, 0, 0, 1), (3500, 2600, 0, 0, 0), (2500, 2600, 0, 0, 0)],
                                format='xyseb', close=True, dxfattribs={'layer': 'FURN'})
        msp.add_ellipse((1000, 2200), major_axis=(400, 0), ratio=0.5, dxfattribs={'layer': 'FURN'})
        msp.add_spline(fit_points=[(200, 200), (600, 500), (1000, 300), (1400, 600)], dxfattribs={'layer': 'FURN'})
        msp.add_mtext('第一行\\P第二行', dxfattribs={'layer': 'TEXT', 'char_height': 150}).set_location((2600, 800))
        h = msp.add_hatch(color=7, dxfattribs={'layer': 'FURN'})
        h.paths.add_polyline_path([(3600, 200), (3900, 200), (3900, 500), (3600, 500)], is_closed=True)
    else:
        # R12：舊式 POLYLINE／VERTEX／SEQEND，同樣的矩形＋半圓
        pl = msp.add_polyline2d([(2500, 2000), (3500, 2000), (3500, 2600), (2500, 2600)], format='xy', close=True, dxfattribs={'layer': 'FURN'})
        pl.vertices[1].dxf.bulge = 1.0


doc = new('R12')
basic_entities(doc, with_modern=False)
save(doc, 'r12_basic.dxf')

doc = new('R2000', insunits=4)
basic_entities(doc)
save(doc, 'r2000_entities.dxf')

doc = new('R2018', insunits=4)
basic_entities(doc)
save(doc, 'r2018_entities.dxf')

# R2000 也存一份舊式 POLYLINE（含 bulge、閉合）與 3D POLYLINE／多面網格（應略過不崩潰）
doc = new('R2000', insunits=4)
msp = doc.modelspace()
doc.layers.add('WALL')
pl = msp.add_polyline2d([(0, 0), (4000, 0), (4000, 3000), (0, 3000)], format='xy', close=True, dxfattribs={'layer': 'WALL'})
pl.vertices[1].dxf.bulge = 0.4142135623730951   # 90° 圓弧段：tan(90°/4)
msp.add_polyline3d([(100, 100, 0), (500, 100, 200), (500, 500, 400)], dxfattribs={'layer': 'WALL'})
mesh = msp.add_polymesh((2, 2), dxfattribs={'layer': 'WALL'})
mesh.set_mesh_vertex((0, 0), (1000, 1000, 0)); mesh.set_mesh_vertex((0, 1), (1000, 1500, 0))
mesh.set_mesh_vertex((1, 0), (1500, 1000, 0)); mesh.set_mesh_vertex((1, 1), (1500, 1500, 0))
save(doc, 'polyline_old.dxf')

# ---------------------------------------------------------------------------
# 2. 圖塊：縮放、旋轉、巢狀、鏡射、陣列
# ---------------------------------------------------------------------------
doc = new('R2000', insunits=4)
msp = doc.modelspace()
doc.layers.add('BLK')
A = doc.blocks.new('CHAIR', base_point=(0, 0))
A.add_line((0, 0), (100, 0), dxfattribs={'layer': 'BLK'})          # 底邊
A.add_line((100, 0), (100, 50), dxfattribs={'layer': 'BLK'})
A.add_circle((50, 25), 10, dxfattribs={'layer': 'BLK'})
B = doc.blocks.new('TABLE', base_point=(0, 0))
B.add_line((0, 0), (0, 200), dxfattribs={'layer': 'BLK'})
B.add_blockref('CHAIR', (300, 0), dxfattribs={'xscale': 2, 'yscale': 2, 'rotation': 90})   # 巢狀：CHAIR 放大 2 倍轉 90°
msp.add_blockref('CHAIR', (1000, 500))                                                        # 原尺寸
msp.add_blockref('CHAIR', (2000, 500), dxfattribs={'xscale': 3, 'yscale': 3, 'rotation': 45})   # 縮放＋旋轉
msp.add_blockref('TABLE', (5000, 1000), dxfattribs={'xscale': 1.5, 'yscale': 1.5, 'rotation': 30})  # 巢狀＋縮放旋轉
msp.add_blockref('CHAIR', (8000, 0), dxfattribs={'xscale': -1, 'yscale': 1})                   # X 鏡射
# 陣列插入（MINSERT）：2 欄 × 3 列，間距 500／400
ref = msp.add_blockref('CHAIR', (0, 5000))
ref.grid(size=(3, 2), spacing=(400, 500))   # rows=3, cols=2
# 以圖塊基準點不在原點的圖塊
C = doc.blocks.new('BASE', base_point=(100, 100))
C.add_line((100, 100), (200, 100), dxfattribs={'layer': 'BLK'})
msp.add_blockref('BASE', (3000, 3000))
# 找不到的圖塊（應有警告、不崩潰）
msp.add_blockref('MISSING', (0, 0))

# 用 ezdxf 展開一次，印出預期座標給 run.js 對照
from ezdxf.math import Matrix44  # noqa
print('--- 圖塊展開預期（ezdxf virtual_entities）---')
for ins in msp.query('INSERT'):
    if ins.dxf.name == 'MISSING':
        continue
    for e in ins.virtual_entities():
        if e.dxftype() == 'INSERT':
            for e2 in e.virtual_entities():
                print(ins.dxf.name, '>', e.dxf.name, e2.dxftype(), e2.dxf.start if e2.dxftype() == 'LINE' else e2.dxf.center, e2.dxf.end if e2.dxftype() == 'LINE' else e2.dxf.radius)
        elif e.dxftype() == 'LINE':
            print(ins.dxf.name, 'LINE', e.dxf.start, e.dxf.end)
        elif e.dxftype() == 'CIRCLE':
            print(ins.dxf.name, 'CIRCLE', e.dxf.center, e.dxf.radius)
save(doc, 'blocks_nested.dxf')

# ---------------------------------------------------------------------------
# 3. 中文圖層名：UTF-8（R2018）與 Big5／CP950（R2000）
# ---------------------------------------------------------------------------
def chinese_layers(doc):
    msp = doc.modelspace()
    for name in ['牆', '門窗', '文字標註', '家具-沙發']:
        doc.layers.add(name)
    msp.add_line((0, 0), (3000, 0), dxfattribs={'layer': '牆'})
    msp.add_line((3000, 0), (3000, 2000), dxfattribs={'layer': '牆'})
    msp.add_line((500, 0), (1400, 0), dxfattribs={'layer': '門窗'})
    msp.add_circle((1500, 1000), 200, dxfattribs={'layer': '家具-沙發'})
    msp.add_text('客廳', height=200, dxfattribs={'layer': '文字標註'}).set_placement((1000, 1500))
    msp.add_mtext('主臥室\\P衛浴', dxfattribs={'layer': '文字標註', 'char_height': 150}).set_location((2000, 1500))


doc = new('R2018', insunits=4)
chinese_layers(doc)
save(doc, 'layers_utf8.dxf')

doc = new('R2000', insunits=4, codepage='ANSI_950')
chinese_layers(doc)
save(doc, 'layers_big5.dxf', encoding='cp950')

# 沒寫 $DWGCODEPAGE 的 Big5 檔（某些國產 CAD 匯出會這樣）：ezdxf 會自動補上，存完再把它拿掉
doc = new('R2000', insunits=4)
chinese_layers(doc)
save(doc, 'layers_big5_nocodepage.dxf', encoding='cp950')
p = os.path.join(OUT, 'layers_big5_nocodepage.dxf')
raw = open(p, 'rb').read()
assert b'$DWGCODEPAGE' in raw
raw = raw.replace(b'  9\n$DWGCODEPAGE\n  3\nANSI_950\n', b'')
assert b'$DWGCODEPAGE' not in raw
open(p, 'wb').write(raw)
# 字碼頁標錯（寫 ANSI_1252 但內容是 Big5）：中文 Windows 以外的環境另存常見
p2 = os.path.join(OUT, 'layers_big5_wrongcodepage.dxf')
open(p2, 'wb').write(open(os.path.join(OUT, 'layers_big5.dxf'), 'rb').read().replace(b'ANSI_950', b'ANSI_1252'))
print('寫出 layers_big5_nocodepage.dxf（已移除 $DWGCODEPAGE）、layers_big5_wrongcodepage.dxf')

# 簡體 GBK（$DWGCODEPAGE ANSI_936）
doc = new('R2000', insunits=4, codepage='ANSI_936')
msp = doc.modelspace()
doc.layers.add('墙体')
msp.add_line((0, 0), (3000, 0), dxfattribs={'layer': '墙体'})
save(doc, 'layers_gbk.dxf', encoding='gbk')

# AutoCAD 跨編碼時用 \M+1xxxx（Big5 碼）與 \U+xxxx 轉義：手動塞進字串
doc = new('R2000', insunits=4, codepage='ANSI_950')
msp = doc.modelspace()
doc.layers.add('WALL')
msp.add_line((0, 0), (3000, 0), dxfattribs={'layer': 'WALL'})
msp.add_text('\\M+1C0F0\\U+9580', height=200, dxfattribs={'layer': 'WALL'}).set_placement((100, 100))   # 牆門
save(doc, 'text_escapes.dxf')

# ---------------------------------------------------------------------------
# 4. 單位：同一個 4 m × 3 m 房間，各以 mm／cm／m／inch 畫，與缺 $INSUNITS
# ---------------------------------------------------------------------------
def room(doc, k):
    msp = doc.modelspace()
    doc.layers.add('WALL')
    w, h = 4000 * k, 3000 * k
    pts = [(0, 0), (w, 0), (w, h), (0, h)]
    for i in range(4):
        msp.add_line(pts[i], pts[(i + 1) % 4], dxfattribs={'layer': 'WALL'})


for name, ins, k in [('units_mm', 4, 1), ('units_cm', 5, 0.1), ('units_m', 6, 0.001), ('units_inch', 1, 1 / 25.4)]:
    doc = new('R2000', insunits=ins)
    room(doc, k)
    save(doc, name + '.dxf')

doc = new('R2000', insunits=0)   # $INSUNITS = 0（無單位）；圖以 cm 畫 → 應由圖幅推測
room(doc, 0.1)
save(doc, 'units_none_cm.dxf')

doc = new('R12')                 # R12 根本沒有 $INSUNITS；圖以 mm 畫
room(doc, 1)
save(doc, 'units_none_r12_mm.dxf')

# ---------------------------------------------------------------------------
# 5. 二進位 DXF
# ---------------------------------------------------------------------------
doc = new('R2000', insunits=4)
room(doc, 1)
save(doc, 'binary_r2000.dxf', fmt='bin')

# ---------------------------------------------------------------------------
# 6. 真實尺寸的簡單住宅平面（mm）：雙線牆、門弧、窗線、房間名稱
# ---------------------------------------------------------------------------
doc = new('R2018', insunits=4)
msp = doc.modelspace()
for name in ['牆', '門', '窗', '文字', '家具']:
    doc.layers.add(name)
T = 150   # 外牆厚
t = 120   # 內牆厚
# 外框：內緣 9000 × 6000，牆厚 150
W, H = 9000, 6000
# 外牆內緣（切開門口給大門：在下牆 x 1000～1900）
wall = lambda a, b: msp.add_line(a, b, dxfattribs={'layer': '牆'})
# 下牆內緣（門口 1000～1900）
wall((0, 0), (1000, 0)); wall((1900, 0), (W, 0))
wall((W, 0), (W, H))
wall((W, H), (0, H))
wall((0, H), (0, 0))
# 外緣（門口同樣斷開）
wall((-T, -T), (1000, -T)); wall((1900, -T), (W + T, -T))
wall((W + T, -T), (W + T, H + T))
wall((W + T, H + T), (-T, H + T))
wall((-T, H + T), (-T, -T))
# 門口側邊
wall((1000, 0), (1000, -T)); wall((1900, 0), (1900, -T))
# 內牆 1：x = 5000（厚 120），把平面分成左右；中間留門口 y 2500～3400
wall((5000, 0), (5000, 2500)); wall((5000, 3400), (5000, H))
wall((5000 + t, 0), (5000 + t, 2500)); wall((5000 + t, 3400), (5000 + t, H))
wall((5000, 2500), (5000 + t, 2500)); wall((5000, 3400), (5000 + t, 3400))
# 內牆 2：右半部 y = 3000 分成上下；門口 x 7000～7800
wall((5000 + t, 3000), (7000, 3000)); wall((7800, 3000), (W, 3000))
wall((5000 + t, 3000 + t), (7000, 3000 + t)); wall((7800, 3000 + t), (W, 3000 + t))
wall((7000, 3000), (7000, 3000 + t)); wall((7800, 3000), (7800, 3000 + t))
# 門弧（鉸鏈在門口一側、半徑＝門寬）
msp.add_arc((1000, 0), 900, 0, 90, dxfattribs={'layer': '門'})
msp.add_line((1000, 0), (1000, 900), dxfattribs={'layer': '門'})
msp.add_arc((5000, 2500), 900, 90, 180, dxfattribs={'layer': '門'})
msp.add_arc((7000, 3000 + t), 800, 0, 90, dxfattribs={'layer': '門'})
# 窗（窗圖層線條橫過牆帶）
for x0, x1 in [(2000, 3500), (6000, 7500)]:
    msp.add_line((x0, H), (x1, H), dxfattribs={'layer': '窗'})
    msp.add_line((x0, H + T / 2), (x1, H + T / 2), dxfattribs={'layer': '窗'})
    msp.add_line((x0, H + T), (x1, H + T), dxfattribs={'layer': '窗'})
# 房間名稱
msp.add_mtext('客廳', dxfattribs={'layer': '文字', 'char_height': 300}).set_location((2500, 3000))
msp.add_text('主臥', height=300, dxfattribs={'layer': '文字'}).set_placement((7000, 4500), align=TextEntityAlignment.MIDDLE_CENTER)
msp.add_text('浴室', height=300, dxfattribs={'layer': '文字'}).set_placement((7000, 1500), align=TextEntityAlignment.MIDDLE_CENTER)
# 家具圖塊
SOFA = doc.blocks.new('SOFA', base_point=(0, 0))
SOFA.add_lwpolyline([(0, 0), (2000, 0), (2000, 900), (0, 900)], close=True, dxfattribs={'layer': '家具'})
msp.add_blockref('SOFA', (500, 500))
save(doc, 'house_plan.dxf')

# ---------------------------------------------------------------------------
# 7. SketchUp 風格匯出：LINE 帶 Z、3DFACE、R12
# ---------------------------------------------------------------------------
doc = new('R12')
msp = doc.modelspace()
doc.layers.add('Layer0')
pts = [(0, 0, 0), (4000, 0, 0), (4000, 3000, 0), (0, 3000, 0)]
for i in range(4):
    msp.add_line(pts[i], pts[(i + 1) % 4], dxfattribs={'layer': 'Layer0'})
msp.add_line((0, 0, 0), (0, 0, 2800), dxfattribs={'layer': 'Layer0'})   # 垂直線（投影後長度 0）
msp.add_3dface([(0, 0, 0), (4000, 0, 0), (4000, 0, 2800), (0, 0, 2800)], dxfattribs={'layer': 'Layer0'})
save(doc, 'sketchup_r12.dxf')

# ---------------------------------------------------------------------------
# 8. 擠出方向 (0,0,-1)：鏡射過的圓／弧／多段線（AutoCAD MIRROR 常見）
# ---------------------------------------------------------------------------
doc = new('R2000', insunits=4)
msp = doc.modelspace()
doc.layers.add('WALL')
msp.add_circle((1000, 500), 200, dxfattribs={'layer': 'WALL', 'extrusion': (0, 0, -1)})   # 實際位置 (-1000, 500)
msp.add_arc((2000, 500), 300, 0, 90, dxfattribs={'layer': 'WALL', 'extrusion': (0, 0, -1)})
msp.add_lwpolyline([(0, 0), (500, 0), (500, 300)], dxfattribs={'layer': 'WALL', 'extrusion': (0, 0, -1)})
msp.add_line((0, 0), (1000, 0), dxfattribs={'layer': 'WALL'})
save(doc, 'extrusion_mirror.dxf')

# ---------------------------------------------------------------------------
# 9. 只有配置（圖紙空間）有東西、模型空間是空的
# ---------------------------------------------------------------------------
doc = new('R2000', insunits=4)
doc.layers.add('WALL')
doc.paperspace().add_line((0, 0), (100, 0), dxfattribs={'layer': 'WALL'})
save(doc, 'empty_modelspace.dxf')

# ---------------------------------------------------------------------------
# 10. 手寫 ASCII：CRLF、群組碼補空白、沒有 HEADER／TABLES、沒有 EOF（極簡 R12 式）
# ---------------------------------------------------------------------------
minimal = '\r\n'.join([
    '  0', 'SECTION', '  2', 'ENTITIES',
    '  0', 'LINE', '  8', 'WALL', ' 10', '0.0', ' 20', '0.0', ' 11', '4000.0', ' 21', '0.0',
    '  0', 'LINE', '  8', 'WALL', ' 10', '4000.0', ' 20', '0.0', ' 11', '4000.0', ' 21', '3000.0',
    '  0', 'LWPOLYLINE', '  8', 'WALL', ' 90', '3', ' 70', '0', ' 10', '0', ' 20', '3000', ' 10', '4000', ' 20', '3000', ' 10', '4000', ' 20', '0',
    '  0', 'ENDSEC',
]) + '\r\n'
with open(os.path.join(OUT, 'minimal_crlf.dxf'), 'wb') as f:
    f.write(minimal.encode('ascii'))
print('寫出 minimal_crlf.dxf')

# 11. 不是 DXF 的檔案（例如使用者誤選 DWG）
with open(os.path.join(OUT, 'not_a_dxf.dwg'), 'wb') as f:
    f.write(b'AC1015' + bytes(range(256)) * 4)
print('寫出 not_a_dxf.dwg')

# 12. MTEXT 長字串分段（code 3）＋格式碼＋直書字型
doc = new('R2000', insunits=4)
msp = doc.modelspace()
doc.layers.add('TEXT')
long = '{\\fArial|b1|i0;粗體}一般\\P' + 'ABCDEFGHIJ' * 30
msp.add_mtext(long, dxfattribs={'layer': 'TEXT', 'char_height': 100}).set_location((0, 0))
msp.add_mtext('\\f@標楷體|c136;直書', dxfattribs={'layer': 'TEXT', 'char_height': 100}).set_location((1000, 0))
msp.add_line((0, 0), (100, 0), dxfattribs={'layer': 'TEXT'})
save(doc, 'mtext_long.dxf')

print('完成，共', len(os.listdir(OUT)), '個檔案')
