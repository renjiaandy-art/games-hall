#!/usr/bin/env python3
"""Assemble the games hall: clone each game's fork, build if needed, strip trackers/ads,
apply small patches, copy into site/<slug>/, and generate the hall index page."""
import html
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SITE = ROOT / "site"
WORK = ROOT / "work"
OWNER = "renjiaandy-art"
GAMES = json.loads((ROOT / "games.json").read_text(encoding="utf-8"))

TRACKER = re.compile(
    r"googletagmanager\.com|google-analytics\.com|hm\.baidu\.com|pagead2\.googlesyndication\.com"
    r"|adsbygoogle|cnzz\.com|\b51\.la\b|umami\.is|plausible\.io|clarity\.ms"
    r"|passer-by\.com/static/script/|buttons\.github\.io",
    re.I,
)
INLINE_TRACKER = re.compile(r"gtag\(|GoogleAnalyticsObject|_hmt|adsbygoogle|window\.dataLayer|\bga\(\s*['\"](create|send)", re.I)
SCRIPT_BLOCK = re.compile(r"<script\b([^>]*)>(.*?)</script\s*>", re.I | re.S)
AD_INS = re.compile(r"<ins\b[^>]*adsbygoogle[^>]*>.*?</ins\s*>", re.I | re.S)
EXT_LINK = re.compile(r"<link\b[^>]*href=[\"'][^\"']*passer-by\.com[^\"']*[\"'][^>]*>", re.I)
SKIP = {".git", ".github", "node_modules", ".gitignore", ".gitattributes"}


def run(cmd, cwd):
    print(f"  $ {cmd}", flush=True)
    subprocess.run(cmd, cwd=cwd, shell=True, check=True)


def sanitize_html_text(s):
    removed = []

    def script(m):
        attrs, body = m.group(1), m.group(2)
        src = re.search(r"\bsrc=[\"']([^\"']+)", attrs, re.I)
        if src and (TRACKER.search(src.group(1)) or re.search(r"\bdata-website-id=", attrs, re.I)):
            removed.append("script src=" + src.group(1))
            return ""
        if not src and INLINE_TRACKER.search(body):
            removed.append("inline script: " + " ".join(body.split())[:60])
            return ""
        return m.group(0)

    s = SCRIPT_BLOCK.sub(script, s)
    s, n = AD_INS.subn("", s)
    if n:
        removed.append(f"{n} adsbygoogle <ins>")
    s, n = EXT_LINK.subn("", s)
    if n:
        removed.append(f"{n} passer-by.com <link>")
    return s, removed


def sanitize_tree(root):
    removed = []
    for p in root.rglob("*.htm*"):
        s = p.read_text(encoding="utf-8", errors="replace")
        s2, r = sanitize_html_text(s)
        if r:
            p.write_text(s2, encoding="utf-8")
            removed += [f"{p.relative_to(root)}: {x}" for x in r]
    return removed


def patch_mumuy_clean_index(dest, game):
    """mumuy's pages redirect away from any host but passer-by.com and load its stats script:
    keep only the game (canvas + local scripts/styles)."""
    orig = (dest / "index.html").read_text(encoding="utf-8")
    local_css = re.findall(r"<link[^>]*rel=\"stylesheet\"[^>]*href=\"(\./[^\"]+)\"", orig)
    local_js = re.findall(r"<script[^>]*src=\"(\./[^\"]+)\"", orig)
    canvas = re.search(r"<canvas[^>]*>.*?</canvas>", orig, re.S).group(0)
    title = html.escape(game["name"])
    css = "".join(f'<link rel="stylesheet" href="{c}">' for c in local_css)
    js = "".join(f'<script src="{j}"></script>' for j in local_js)
    (dest / "index.html").write_text(f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=0">
<title>{title}</title><link rel="shortcut icon" href="favicon.png">{css}
<style>
html,body{{margin:0;background:#1b1f3a;color:#fff;font-family:-apple-system,"PingFang SC",sans-serif}}
.wrap{{max-width:980px;margin:0 auto;padding:12px}}
.wrap canvas{{display:block;width:100%;height:auto;border-radius:12px}}
.back{{display:inline-block;margin:0 0 10px;color:#fff;text-decoration:none;opacity:.8;font-size:14px}}
.src{{margin-top:10px;font-size:12px;opacity:.6}} .src a{{color:#fff}}
</style></head>
<body><div class="wrap"><a class="back" href="../">‹ 游戏大厅</a>
<div class="mod-panel"><div class="inner"><div class="bd">{canvas}</div></div></div>
<p class="src">源码：<a href="https://github.com/{game['upstream']}" target="_blank" rel="noopener">github.com/{game['upstream']}</a>（{game['license']}）</p>
</div>{js}</body></html>
""", encoding="utf-8")
    return [f"index.html rebuilt: kept {local_css + local_js}, dropped passer-by.com redirect/nav/stat.js"]


def patch_adarkroom_mobile(dest, game):
    p = dest / "script" / "engine.js"
    s = p.read_text(encoding="utf-8")
    new = s.replace("if(Engine.isMobile()) {", "if(false && Engine.isMobile()) {", 1)
    assert new != s, "adarkroom isMobile check not found"
    p.write_text(new, encoding="utf-8")
    return ["engine.js: mobile redirect to mobileWarning.html disabled"]


def patch_td_index(dest, game):
    td = (dest / "td.html").read_text(encoding="utf-8")
    (dest / "index.html").write_text(td.replace("td-pkg-en-min.js", "td-pkg-zh-min.js"), encoding="utf-8")
    return ["index.html = td.html using the Chinese package"]


def patch_hextris_ga(dest, game):
    p = dest / "js" / "initialization.js"
    s = p.read_text(encoding="utf-8")
    new, n = re.subn(r"\(function\(i, s, o, g, r, a, m\) \{.*?ga\('send', 'pageview'\);", "", s, count=1, flags=re.S)
    assert n == 1, "hextris GA loader not found"
    p.write_text(new, encoding="utf-8")
    return ["js/initialization.js: runtime Google Analytics loader + ga() calls removed"]


def patch_minesweeper(dest, game):
    notes = []
    idx = dest / "index.html"
    s = idx.read_text(encoding="utf-8")
    s2 = s.replace('id="twemoji" checked>', 'id="twemoji">', 1).replace('id="emoji"> Native emoji', 'id="emoji" checked> Native emoji', 1)
    assert s2 != s, "minesweeper emoji radios not found"
    s3 = re.sub(r"\s*if \(navigator\.serviceWorker\) navigator\.serviceWorker\.register\([^)]*\)", "", s2, count=1)
    idx.write_text(s3, encoding="utf-8")
    notes.append("index.html: default to native emoji" + ("; service worker registration removed (hard-coded /emoji-minesweeper/ path)" if s3 != s2 else ""))
    tw = dest / "twemoji.js"
    t = tw.read_text(encoding="utf-8")
    t2 = t.replace('"//twemoji.maxcdn.com/"', '"//cdn.jsdelivr.net/gh/twitter/twemoji@v1.4.2/"', 1)
    assert t2 != t, "twemoji maxcdn base not found"
    tw.write_text(t2, encoding="utf-8")
    notes.append("twemoji.js: dead twemoji.maxcdn.com -> jsDelivr twitter/twemoji@v1.4.2")
    return notes


def patch_xqwlight_index(dest, game):
    shutil.copyfile(dest / "index.htm", dest / "index.html")
    return ["index.htm copied to index.html (Pages only serves index.html as directory index)"]


PATCHES = {
    "minesweeper": patch_minesweeper,
    "xqwlight_index": patch_xqwlight_index,
    "hextris_ga": patch_hextris_ga,
    "mumuy_clean_index": patch_mumuy_clean_index,
    "adarkroom_mobile": patch_adarkroom_mobile,
    "td_index": patch_td_index,
}


def copy_tree(src, dst):
    def ignore(d, names):
        return [n for n in names if n in SKIP]
    shutil.copytree(src, dst, ignore=ignore)


def build_game(game):
    print(f"== {game['slug']} ({OWNER}/{game['repo']})", flush=True)
    repo_dir = WORK / game["slug"]
    run(f"git clone --depth 1 https://github.com/{OWNER}/{game['repo']}.git {repo_dir}", ROOT)
    notes = []
    for rel in game.get("prebuild_sanitize", []):
        p = repo_dir / rel
        s2, r = sanitize_html_text(p.read_text(encoding="utf-8"))
        p.write_text(s2, encoding="utf-8")
        notes += [f"(pre-build) {rel}: {x}" for x in r]
    for cmd in game.get("build", []):
        run(cmd, repo_dir)
    dest = SITE / game["slug"]
    copy_tree(repo_dir / game["dir"], dest)
    if game.get("patch"):
        notes += PATCHES[game["patch"]](dest, game)
    notes += sanitize_tree(dest)
    files = [p for p in dest.rglob("*") if p.is_file()]
    size = sum(p.stat().st_size for p in files)
    big = [f"{p.relative_to(SITE)} {p.stat().st_size}" for p in files if p.stat().st_size > 25 * 1024 * 1024]
    residue = []
    for p in files:
        if p.suffix.lower() in (".html", ".htm", ".js", ".mjs"):
            t = p.read_text(encoding="utf-8", errors="replace")
            for m in TRACKER.finditer(t):
                residue.append(f"{p.relative_to(dest)}: {m.group(0)}")
    return {"slug": game["slug"], "files": len(files), "mb": round(size / 1048576, 1), "big": big,
            "removed": notes, "tracker_residue": sorted(set(residue))[:10]}


HALL = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1b1f3a"><title>游戏大厅</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🎮%3C/text%3E%3C/svg%3E">
<style>
:root{--glass:rgba(255,255,255,.16);--border:rgba(255,255,255,.38)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;min-height:100vh;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
background:radial-gradient(60% 55% at 18% 18%,#ff9d6c 0%,transparent 60%),radial-gradient(55% 60% at 85% 15%,#b86bff 0%,transparent 62%),
radial-gradient(70% 60% at 70% 90%,#3f6bff 0%,transparent 65%),linear-gradient(160deg,#2a1a5e,#1a2a6e) fixed #1b1f3a}
.wrap{max-width:1000px;margin:0 auto;padding:calc(env(safe-area-inset-top) + 20px) 16px 40px}
h1{font-size:30px;margin:6px 4px 4px;font-weight:700} .sub{margin:0 4px 20px;opacity:.75;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.card{display:flex;flex-direction:column;gap:6px;padding:16px;border-radius:22px;text-decoration:none;color:#fff;
background:var(--glass);border:1px solid var(--border);-webkit-backdrop-filter:blur(22px) saturate(170%);backdrop-filter:blur(22px) saturate(170%);
box-shadow:0 10px 30px rgba(10,14,40,.25),inset 0 1px 0 rgba(255,255,255,.5);transition:transform .15s}
.card:active{transform:scale(.97)} @media(hover:hover){.card:hover{transform:translateY(-3px)}}
.icon{font-size:38px;line-height:1} .name{font-weight:700;font-size:16px} .desc{font-size:12.5px;opacity:.78;line-height:1.4}
.foot{margin-top:28px;font-size:12px;opacity:.6;line-height:1.7} .foot a{color:#fff}
</style></head><body><div class="wrap">
<h1>🎮 游戏大厅</h1><p class="sub">{count} 款开源小游戏，全部在浏览器里运行，无广告、无统计</p>
<div class="grid">{cards}</div>
<div class="foot">每款游戏都来自 GitHub 开源项目（已去掉原版的广告和统计代码）：<br>{sources}</div>
</div></body></html>
"""


def main():
    shutil.rmtree(SITE, ignore_errors=True)
    shutil.rmtree(WORK, ignore_errors=True)
    SITE.mkdir()
    WORK.mkdir()
    report, ok = [], []
    for g in GAMES:
        try:
            r = build_game(g)
            report.append(r)
            if r["big"]:
                print(f"!! {g['slug']} has files over 25MiB: {r['big']}")
                shutil.rmtree(SITE / g["slug"])
            else:
                ok.append(g)
        except Exception as e:  # one broken game must not sink the whole hall
            print(f"!! {g['slug']} FAILED: {e}", flush=True)
            report.append({"slug": g["slug"], "error": str(e)})
            shutil.rmtree(SITE / g["slug"], ignore_errors=True)
    cards = "".join(
        f'<a class="card" href="{g["slug"]}/{g.get("entry", "")}"><div class="icon">{g["icon"]}</div>'
        f'<div class="name">{html.escape(g["name"])}</div><div class="desc">{html.escape(g["desc"])}</div></a>'
        for g in ok)
    sources = "<br>".join(
        f'{html.escape(g["name"])}：<a href="https://github.com/{g["upstream"]}" target="_blank" rel="noopener">{g["upstream"]}</a>（{g["license"]}）'
        for g in ok)
    (SITE / "index.html").write_text(HALL.replace("{count}", str(len(ok))).replace("{cards}", cards).replace("{sources}", sources), encoding="utf-8")
    (SITE / "games.json").write_text(json.dumps([{k: g[k] for k in ("slug", "name", "desc", "icon", "upstream", "license")} | {"entry": g.get("entry", "")} for g in ok], ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(1 for p in SITE.rglob("*") if p.is_file())
    print("\n==== REPORT ====")
    for r in report:
        print(json.dumps(r, ensure_ascii=False))
    print(f"TOTAL files={total} games_ok={len(ok)}/{len(GAMES)}")
    if total > 20000:
        sys.exit("too many files for Pages")


if __name__ == "__main__":
    main()
