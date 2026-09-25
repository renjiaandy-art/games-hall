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


def run(cmd, cwd, env=None):
    print(f"  $ {cmd}", flush=True)
    subprocess.run(cmd, cwd=cwd, shell=True, check=True, env=env)


def node_env(major):
    """PATH with an official Node.js <major>.x prepended (some games need a newer Node than the runner's)."""
    import os
    base = WORK / f"node{major}"
    if not base.exists():
        base.mkdir(parents=True)
        run(f"curl -sSfL https://nodejs.org/dist/latest-v{major}.x/SHASUMS256.txt -o SHASUMS256.txt && "
            f"F=$(grep -o 'node-v[0-9.]*-linux-x64.tar.xz' SHASUMS256.txt | head -1) && "
            f"curl -sSfLO https://nodejs.org/dist/latest-v{major}.x/$F && grep \" $F$\" SHASUMS256.txt | sha256sum -c - && "
            f"tar -xJf $F --strip-components=1 && rm $F", base)
    env = dict(os.environ)
    env["PATH"] = f"{base / 'bin'}:{env['PATH']}"
    return env


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


def patch_dino_touch(dest, game):
    js = dest / "index.js"
    s = js.read_text(encoding="utf-8")
    old = "var IS_MOBILE = /Android/.test(window.navigator.userAgent) || IS_IOS;"
    assert old in s, "dino IS_MOBILE not found"
    # iPadOS reports navigator.platform "MacIntel": treat any touch device as mobile
    js.write_text(s.replace(old, "var IS_MOBILE = /Android/.test(window.navigator.userAgent) || IS_IOS || ('ontouchstart' in window);"), encoding="utf-8")
    idx = dest / "index.html"
    h = idx.read_text(encoding="utf-8")
    h2 = h.replace("Press Space to start", "点击屏幕或按空格开始", 1).replace(
        "</body>", "<script>document.addEventListener('touchstart',function(){var b=document.getElementById('messageBox');if(b)b.style.visibility='hidden';},{passive:true});</script></body>", 1)
    assert h2 != h, "dino message not found"
    idx.write_text(h2, encoding="utf-8")
    return ["index.js: any touch device counts as mobile (iPadOS fix)", "index.html: Chinese start hint, tap also dismisses it"]


DPAD = """<style id="rj-dpad-css">
#rj-dpad{position:fixed;right:14px;bottom:calc(env(safe-area-inset-bottom) + 14px);z-index:99999;display:none;
grid-template-columns:repeat(3,56px);grid-template-rows:repeat(3,56px);gap:6px;touch-action:none;user-select:none;-webkit-user-select:none}
#rj-dpad button{border:0;border-radius:16px;background:rgba(255,255,255,.28);color:#fff;font-size:22px;
-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 4px 14px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.5)}
#rj-dpad button:active{background:rgba(255,255,255,.5)}
#rj-dpad-extra{position:fixed;left:14px;bottom:calc(env(safe-area-inset-bottom) + 14px);z-index:99999;display:none;gap:8px}
#rj-dpad-extra button{border:0;border-radius:14px;padding:12px 16px;background:rgba(255,255,255,.28);color:#fff;font-size:15px;font-weight:600;
-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
@media (pointer:coarse){#rj-dpad{display:grid}#rj-dpad-extra{display:flex}}
</style>
<div id="rj-dpad"><span></span><button data-k="ArrowUp" data-c="38">▲</button><span></span>
<button data-k="ArrowLeft" data-c="37">◀</button><span></span><button data-k="ArrowRight" data-c="39">▶</button>
<span></span><button data-k="ArrowDown" data-c="40">▼</button><span></span></div>
<div id="rj-dpad-extra">__EXTRA__</div>
<script>(function(){
function key(k,c){['keydown','keyup'].forEach(function(t,i){setTimeout(function(){
var e=new KeyboardEvent(t,{key:k,code:k,bubbles:true,cancelable:true});
try{Object.defineProperty(e,'keyCode',{get:function(){return c}});Object.defineProperty(e,'which',{get:function(){return c}});}catch(_){}
var rp=document.querySelector('ruffle-player,ruffle-object');if(rp&&rp.focus)rp.focus();(rp||(document.activeElement&&document.activeElement!==document.body?document.activeElement:document)).dispatchEvent(e);},i*60);});}
document.querySelectorAll('#rj-dpad button,#rj-dpad-extra button').forEach(function(b){
b.addEventListener('touchstart',function(ev){ev.preventDefault();key(b.dataset.k,+b.dataset.c);},{passive:false});
b.addEventListener('click',function(){key(b.dataset.k,+b.dataset.c);});});
var sx=0,sy=0;document.addEventListener('touchstart',function(e){if(e.target.closest&&e.target.closest('#rj-dpad,#rj-dpad-extra'))return;sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
document.addEventListener('touchend',function(e){if(e.target.closest&&e.target.closest('#rj-dpad,#rj-dpad-extra'))return;var t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
if(Math.max(Math.abs(dx),Math.abs(dy))<30)return;if(Math.abs(dx)>Math.abs(dy))key(dx>0?'ArrowRight':'ArrowLeft',dx>0?39:37);else key(dy>0?'ArrowDown':'ArrowUp',dy>0?40:38);},{passive:true});
})();</script>
"""


def patch_dpad(dest, game):
    """Keyboard-only game: add a glass on-screen d-pad (touch devices only) plus swipe → arrow keys."""
    idx = dest / "index.html"
    h = idx.read_text(encoding="utf-8")
    extra = "".join(f'<button data-k="{k}" data-c="{c}">{html.escape(label)}</button>' for label, k, c in game.get("dpad_extra", []))
    block = DPAD.replace("__EXTRA__", extra)
    h2 = h.replace("</body>", block + "</body>", 1) if "</body>" in h else h + block
    idx.write_text(h2, encoding="utf-8")
    return ["index.html: on-screen d-pad + swipe for touch devices" + (f" (+{[x[0] for x in game.get('dpad_extra', [])]})" if game.get("dpad_extra") else "")]


RUFFLE_WRAPPER = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>__TITLE__</title>
<style>
html,body{margin:0;height:100%;background:#111;color:#fff;font-family:-apple-system,"PingFang SC",sans-serif;overflow:hidden}
#bar{position:fixed;top:0;left:0;right:0;z-index:10;display:flex;gap:12px;align-items:center;padding:calc(env(safe-area-inset-top) + 6px) 12px 6px;
background:linear-gradient(#000a,#0000);font-size:13px}
#bar a{color:#fff;text-decoration:none;opacity:.85} #bar span{opacity:.6}
#stage{position:absolute;inset:0;padding-top:calc(env(safe-area-inset-top) + 30px)}
ruffle-player,ruffle-object{width:100%;height:100%;display:block}
</style></head><body>
<div id="bar"><a href="../">‹ 游戏大厅</a><span>__TITLE__ · Flash（Ruffle 模拟）· <a href="https://github.com/__UPSTREAM__" target="_blank" rel="noopener">源码</a>（__LICENSE__）</span></div>
<div id="stage"></div>
<script>window.RufflePlayer=window.RufflePlayer||{};window.RufflePlayer.config={publicPath:"__RUFFLE__",autoplay:"on",unmuteOverlay:"hidden",letterbox:"on",splashScreen:true,warnOnUnsupportedContent:false,contextMenu:"rightClickOnly",showSwfDownload:false};</script>
<script src="__RUFFLE__ruffle.js"></script>
<script>
window.addEventListener("load",function(){var r=window.RufflePlayer.newest();var p=r.createPlayer();document.getElementById("stage").appendChild(p);
p.ruffle().load({url:"__SWF__",base:"./"});p.focus&&p.focus();});
</script>
</body></html>
"""

FLASH_PLAYER = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Flash 播放器</title>
<style>
body{margin:0;min-height:100vh;color:#fff;font-family:-apple-system,"PingFang SC",sans-serif;background:linear-gradient(160deg,#2a1a5e,#1a2a6e) fixed}
.wrap{max-width:900px;margin:0 auto;padding:calc(env(safe-area-inset-top) + 16px) 16px 30px}
a{color:#fff} h1{font-size:24px;margin:10px 0 4px} p{opacity:.8;font-size:14px;line-height:1.6}
.card{margin:14px 0;padding:14px;border-radius:18px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);
-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
input[type=url]{flex:1;min-width:200px;height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.4);background:rgba(0,0,0,.2);color:#fff;padding:0 12px;font-size:15px}
button,label.btn{height:40px;padding:0 16px;border-radius:12px;border:0;background:#0a84ff;color:#fff;font-size:15px;font-weight:600;display:inline-flex;align-items:center;cursor:pointer}
input[type=file]{display:none}
#stage{margin-top:14px;height:70vh;min-height:320px;border-radius:14px;overflow:hidden;background:#000;display:none}
ruffle-player{width:100%;height:100%;display:block}
</style></head><body><div class="wrap">
<a href="../">‹ 游戏大厅</a>
<h1>⚡ Flash 播放器</h1>
<p>用开源的 <a href="https://ruffle.rs" target="_blank" rel="noopener">Ruffle</a> 在浏览器里运行 Flash 游戏（.swf），不用装 Flash 插件，手机也能用。
选的文件只在你自己的浏览器里运行，不会上传到任何地方。</p>
<div class="card"><div class="row">
<label class="btn" for="file">打开本机的 .swf 文件</label><input type="file" id="file" accept=".swf,application/x-shockwave-flash">
</div>
<div class="row" style="margin-top:10px"><input type="url" id="url" placeholder="或者粘贴一个 .swf 链接"><button id="go">播放</button></div>
<p style="font-size:12.5px;margin:10px 0 0">提示：粘贴链接时，对方网站要允许跨域访问才能加载；不行的话就先把 .swf 下载到手机/电脑，再用上面的按钮打开。</p></div>
<div id="stage"></div>
</div>
<script>window.RufflePlayer=window.RufflePlayer||{};window.RufflePlayer.config={publicPath:"./ruffle/",autoplay:"on",unmuteOverlay:"hidden",letterbox:"on",warnOnUnsupportedContent:false};</script>
<script src="./ruffle/ruffle.js"></script>
<script>
var player=null;function stage(){var s=document.getElementById("stage");s.style.display="block";if(!player){player=window.RufflePlayer.newest().createPlayer();s.appendChild(player);}s.scrollIntoView({behavior:"smooth"});return player;}
document.getElementById("file").addEventListener("change",function(e){var f=e.target.files[0];if(!f)return;f.arrayBuffer().then(function(b){stage().ruffle().load({data:new Uint8Array(b),swfFileName:f.name});});});
document.getElementById("go").addEventListener("click",function(){var u=document.getElementById("url").value.trim();if(!/^https?:\\/\\//i.test(u)){alert("请输入 http(s):// 开头的 .swf 链接");return;}stage().ruffle().load({url:u});});
</script></body></html>
"""


def fetch_ruffle():
    """Latest Ruffle self-hosted build (MIT/Apache-2.0) into site/flash/ruffle/, shared by all Flash games."""
    dest = SITE / "flash" / "ruffle"
    if dest.exists():
        return
    tmp = WORK / "ruffle"
    tmp.mkdir(parents=True, exist_ok=True)
    run("gh release download --repo ruffle-rs/ruffle --pattern '*web-selfhosted.zip' --dir . --clobber "
        "$(gh release list --repo ruffle-rs/ruffle --limit 1 --json tagName -q '.[0].tagName')", tmp)
    run("unzip -q -o *web-selfhosted.zip -d out", tmp)
    shutil.copytree(tmp / "out", dest)
    (SITE / "flash" / "index.html").write_text(FLASH_PLAYER, encoding="utf-8")


def patch_flash_wrapper(dest, game):
    fetch_ruffle()
    page = (RUFFLE_WRAPPER.replace("__TITLE__", html.escape(game["name"])).replace("__SWF__", game["swf"])
            .replace("__RUFFLE__", "../flash/ruffle/").replace("__UPSTREAM__", game["upstream"]).replace("__LICENSE__", game["license"]))
    (dest / "index.html").write_text(page, encoding="utf-8")
    return [f"index.html: Ruffle wrapper for {game['swf']}"]


PATCHES = {
    "flash": patch_flash_wrapper,
    "dpad": patch_dpad,
    "dino_touch": patch_dino_touch,
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
    env = node_env(game["node"]) if game.get("node") else None
    for cmd in game.get("build", []):
        run(cmd, repo_dir, env)
    dest = SITE / game["slug"]
    if game.get("include"):
        for rel in game["include"]:
            src = repo_dir / game["dir"] / rel
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            if src.is_dir():
                copy_tree(src, target)
            else:
                shutil.copyfile(src, target)
    else:
        copy_tree(repo_dir / game["dir"], dest)
    patches = game.get("patch") or []
    for name in ([patches] if isinstance(patches, str) else patches):
        notes += PATCHES[name](dest, game)
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
    if (SITE / "flash" / "index.html").exists():
        ok.append({"slug": "flash", "name": "Flash 播放器", "desc": "打开自己的 .swf 小游戏（Ruffle）", "icon": "⚡",
                   "upstream": "ruffle-rs/ruffle", "license": "MIT/Apache-2.0"})
    cards = "".join(
        f'<a class="card" href="{g["slug"]}/{g.get("entry", "")}"><div class="icon">{g["icon"]}</div>'
        f'<div class="name">{html.escape(g["name"])}</div><div class="desc">{html.escape(g["desc"])}</div></a>'
        for g in ok)
    sources = "<br>".join(
        f'{html.escape(g["name"])}：<a href="https://github.com/{g["upstream"]}" target="_blank" rel="noopener">{g["upstream"]}</a>（{g["license"]}）'
        for g in ok)
    n_games = sum(1 for g in ok if g["slug"] != "flash")
    (SITE / "index.html").write_text(HALL.replace("{count}", str(n_games)).replace("{cards}", cards).replace("{sources}", sources), encoding="utf-8")
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
