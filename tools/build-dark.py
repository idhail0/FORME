"""Build dark.css from styles.css + pwa.css.

Usage (from the project root):  python tools/build-dark.py

Every declaration with a colour literal is re-emitted under
:root[data-theme="dark"] with a property-aware conversion (text -> light,
surfaces -> charcoal, shadows deeper, hairlines -> faint light lines, sage
kept for fills). tools/dark-overrides.css is appended last for hand tuning.
Run this again after changing colours in styles.css or pwa.css.
"""
import math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
inputs = [os.path.join(ROOT, 'styles.css'), os.path.join(ROOT, 'pwa.css')]
out_path = os.path.join(ROOT, 'dark.css')
overrides = os.path.join(ROOT, 'tools', 'dark-overrides.css')

def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin_to_srgb(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

def to_oklch(r, g, b):
    r, g, b = (srgb_to_lin(x / 255) for x in (r, g, b))
    l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
    m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
    s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b
    l, m, s = (math.copysign(abs(x) ** (1/3), x) for x in (l, m, s))
    L = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s
    a = 1.9779984951*l - 2.4285922050*m + 0.4505937099*s
    bb = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360

def from_oklch(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l = (L + 0.3963377774*a + 0.2158037573*b) ** 3
    m = (L - 0.1055613458*a - 0.0638541728*b) ** 3
    s = (L - 0.0894841775*a - 1.2914855480*b) ** 3
    r = 4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    bl = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    return tuple(round(lin_to_srgb(x) * 255) for x in (r, g, bl))

DARK = ':root[data-theme="dark"]'
SKIP_SELECTORS = ('.mq-shade', '.ambient:after', '.canvas-grain', '.mq-tone', '.swatch.', '.mannequin', '.figure-', '.arm', '.head-shine', '.body-seam')
NEUTRAL_H = 110

def clamp(x, a, b): return max(a, min(b, x))

def to_hex(rgb, a=None):
    h = '#' + ''.join(f'{v:02x}' for v in rgb)
    return h if a is None else h + a

# ---------------- colour conversion ----------------
def conv(rgb, alpha, role):
    """role: text | bg | drop | hairline | highlight | inner"""
    r, g, b = rgb
    L, C, H = to_oklch(r, g, b)
    neutral = C < 0.03
    if role == 'highlight':
        return (255, 255, 255), (alpha if alpha is not None else 1) * 0.1
    if role == 'hairline':
        if neutral:
            return (255, 255, 255), clamp((alpha if alpha is not None else 1) * 1.5, 0.05, 0.16)
        role = 'bg'
    if role in ('drop', 'inner'):
        if neutral or L < 0.4:
            return (0, 0, 0), clamp((alpha if alpha is not None else 0.3) * 1.8, 0.12, 0.75)
        return rgb, alpha  # coloured glows keep their hue
    if role == 'text':
        if neutral:
            if L > 0.85: return rgb, alpha                     # white text on fills stays white
            return from_oklch(clamp(1.14 - L * 0.9, 0.55, 0.95), 0.006, NEUTRAL_H), alpha
        return from_oklch(max(L, 0.78), min(C, 0.09), H), alpha
    # bg / border
    if neutral:
        if L >= 0.995: L2 = 0.205
        elif L > 0.5: L2 = clamp(0.155 + (0.985 - L) * 1.05, 0.12, 0.5)
        else: L2 = clamp(1.14 - L * 0.9, 0.55, 0.94)          # dark fills (ink pills) become light
        return from_oklch(L2, 0.007, NEUTRAL_H), alpha
    if L > 0.7:                                                  # pale tints -> deep tints
        return from_oklch(0.28, min(C * 1.1, 0.05), H), alpha
    return rgb, alpha                                            # mid accent fills keep their tone

COLOR_RE = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)|\b(?:white|black)\b')

def parse_color(tok):
    t = tok.lower()
    if t == 'white': return (255, 255, 255), None
    if t == 'black': return (0, 0, 0), None
    if t.startswith('#'):
        h = t[1:]
        if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else None
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)), a
    nums = [float(x) for x in re.findall(r'[\d.]+', t)]
    return tuple(int(n) for n in nums[:3]), (nums[3] if len(nums) > 3 else None)

def fmt(rgb, a):
    if a is None or a >= 0.999: return to_hex(rgb)
    return f'rgba({rgb[0]},{rgb[1]},{rgb[2]},{round(a, 3)})'

def convert_value(value, role):
    return COLOR_RE.sub(lambda m: fmt(*conv(*parse_color(m.group(0)), role)), value)

def split_top(value, sep=','):
    parts, depth, cur = [], 0, ''
    for ch in value:
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        if ch == sep and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    return parts

def convert_shadow(value):
    out = []
    for layer in split_top(value):
        s = layer.strip()
        if s.startswith('inset 0 1px 0'): role = 'highlight'
        elif s.startswith('inset 0 0 0') or s.startswith('0 0 0 1px'): role = 'hairline'
        elif s.startswith('inset'): role = 'inner'
        elif re.match(r'0 0 0 \d', s): role = 'bg'                 # focus rings keep accent
        else: role = 'drop'
        out.append(convert_value(layer, role))
    return ','.join(out)

TEXT_VARS = ('text', 'muted', 'faint', 'ink')
def convert_decl(prop, value):
    p = prop.strip().lower()
    if not COLOR_RE.search(value): return None
    if p.startswith('--'):
        name = p[2:]
        if name in ('lift', 'lift-lg', 'shadow') or name.startswith('edge'): return convert_shadow(value)
        if any(k in name for k in TEXT_VARS) and 'solid' not in name: return convert_value(value, 'text')
        if name == 'glass-solid-light': return convert_value(value, 'bg')
        return convert_value(value, 'bg')
    if p in ('color', 'caret-color', '-webkit-text-fill-color', 'stroke', 'text-decoration-color'): return convert_value(value, 'text')
    if p in ('box-shadow', '-webkit-box-shadow', 'text-shadow'): return convert_shadow(value)
    if p == 'filter' or p == '-webkit-filter': return convert_value(value, 'drop')
    if p.startswith('outline'): return convert_value(value, 'bg')
    return convert_value(value, 'bg')

# ---------------- tiny CSS parser ----------------
def strip_comments(css): return re.sub(r'/\*.*?\*/', '', css, flags=re.S)

def parse(css):
    nodes, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0: break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        body = css[j + 1:k - 1]
        if prelude.startswith('@'):
            if prelude.startswith(('@media', '@supports')):
                nodes.append(('at', prelude, parse(body)))
        else:
            nodes.append(('rule', prelude, body))
        i = k
    return nodes

def prefix(selector):
    out = []
    for sel in split_top(selector):
        s = sel.strip()
        if not s: continue
        if s.startswith(':root'): out.append(DARK + s[5:])
        elif s.startswith('html'): out.append('html[data-theme="dark"]' + s[4:])
        else: out.append(DARK + ' ' + s)
    return ','.join(out)

def emit(nodes):
    css = []
    for node in nodes:
        if node[0] == 'at':
            inner = emit(node[2])
            if inner: css.append(node[1] + '{' + inner + '}')
            continue
        _, sel, body = node
        if any(x in sel for x in SKIP_SELECTORS): continue
        decls = []
        for d in split_top(body, ';'):
            if ':' not in d: continue
            prop, value = d.split(':', 1)
            if 'url(' in value: continue
            new = convert_decl(prop, value)
            if new is not None and new.strip() != value.strip():
                decls.append(prop.strip() + ':' + new.strip())
            elif new is not None and prop.strip().startswith('--'):
                decls.append(prop.strip() + ':' + new.strip())
        if 'color-scheme' in body: decls.append('color-scheme:dark')
        if decls: css.append(prefix(sel) + '{' + ';'.join(decls) + '}')
    return '\n'.join(css)

all_css = []
for f in inputs:
    all_css.append(f'/* ---- from {os.path.basename(f)} ---- */\n' + emit(parse(strip_comments(open(f, encoding='utf-8').read()))))
header = '/* FORME dark appearance — GENERATED by tools/build-dark.py from styles.css + pwa.css, followed by\n   tools/dark-overrides.css. Do not edit by hand; edit those files and re-run. Applied when <html data-theme="dark">. */\n'
extra = open(overrides, encoding='utf-8').read() if os.path.exists(overrides) else ''
open(out_path, 'w', encoding='utf-8', newline='').write(header + '\n'.join(all_css) + '\n' + extra)
print('wrote', out_path, sum(len(c) for c in all_css), 'chars')
