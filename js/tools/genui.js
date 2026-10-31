// Generative UI ("Dynamic View"): sandboxed interactive interfaces rendered inside
// the conversation — built-in widgets on-device, or full HTML apps written by Claude.
import { esc } from '../util.js';

export const UI_BASE_CSS = `
:root{--bg:#0a0e26;--card:#10163a;--card2:#161e4a;--border:rgba(138,150,255,.16);--text:#e9ebff;--muted:#aab1da;--accent:#8b6cff;--accent2:#5b84ff;--grad:linear-gradient(135deg,#2347e8,#5b2be0 55%,#9d4dff);--good:#4ade9b;--bad:#ff6b8a;--warn:#ffc861;color-scheme:dark}
[data-theme=light]{--bg:#fbfbff;--card:#fff;--card2:#f2f2fc;--border:rgba(30,40,120,.13);--text:#11143a;--muted:#555a85;--accent:#6d28d9;--accent2:#1d4ed8;color-scheme:light}
*{box-sizing:border-box}html,body{margin:0;background:transparent;color:var(--text);font:15px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{padding:16px}h1,h2,h3{margin:0 0 8px;line-height:1.25}h1{font-size:22px}h2{font-size:18px}h3{font-size:15px}p{margin:0 0 10px}
.muted{color:var(--muted)}.small{font-size:12.5px}.center{text-align:center}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px}
.grid{display:grid;gap:12px}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
@media(max-width:560px){.g3,.g4{grid-template-columns:repeat(2,minmax(0,1fr))}.g2.stack{grid-template-columns:1fr}}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.between{justify-content:space-between}.grow{flex:1}
.btn{border:0;border-radius:12px;padding:9px 16px;font:inherit;font-weight:600;color:#fff;background:var(--grad);cursor:pointer;transition:filter .15s,transform .1s}
.btn:hover{filter:brightness(1.1)}.btn:active{transform:scale(.97)}.btn.ghost{background:var(--card2);color:var(--text);border:1px solid var(--border)}.btn.sm{padding:6px 12px;font-size:13px}
input,select,textarea{font:inherit;color:var(--text);background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:8px 12px;outline:none;min-width:0}
input:focus,select:focus,textarea:focus{border-color:var(--accent)}input[type=range]{accent-color:var(--accent);padding:0;background:none;border:0;width:100%}
input[type=checkbox]{accent-color:var(--accent);width:17px;height:17px}input[type=color]{padding:2px;height:38px;width:52px}
label{font-size:13px;color:var(--muted);display:block;margin-bottom:4px}
.stat{background:var(--card2);border-radius:14px;padding:12px 14px}.stat b{display:block;font-size:22px;letter-spacing:-.3px}.stat span{font-size:12.5px;color:var(--muted)}
.big{font-size:42px;font-weight:750;letter-spacing:-1px;line-height:1.1}.grad-text{background:linear-gradient(90deg,#7d9bff,#b48cff 60%,#d3a6ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:var(--card2);cursor:pointer;font:inherit;font-size:13px;color:var(--text)}
.chip.on{background:var(--grad);color:#fff;border-color:transparent}
table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{padding:7px 8px;border-bottom:1px solid var(--border);text-align:right}th:first-child,td:first-child{text-align:left}th{color:var(--muted);font-weight:600}
.ask{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;font:inherit;font-size:13px;text-decoration:none}
.ask:hover{background:var(--card2);border-color:var(--accent)}
.fade{animation:fade .3s ease}@keyframes fade{from{opacity:0;transform:translateY(4px)}}
`;

const BRIDGE = `(function(){var id="__ID__";var last=0;function post(){var h=Math.ceil(Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0));if(Math.abs(h-last)>2){last=h;parent.postMessage({type:"nova-ui-size",id:id,height:h},"*")}}
window.nova={ask:function(t){parent.postMessage({type:"nova-ui-ask",id:id,text:String(t)},"*")},resize:post,open:function(u){parent.postMessage({type:"nova-ui-open",id:id,url:String(u)},"*")}};
addEventListener("load",post);try{new ResizeObserver(post).observe(document.documentElement)}catch(e){setInterval(post,500)}setTimeout(post,60);
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("[data-ask]");if(a){e.preventDefault();nova.ask(a.getAttribute("data-ask"));return}var l=e.target.closest&&e.target.closest("a[href]");if(l&&/^https?:/.test(l.href)){e.preventDefault();nova.open(l.href)}});
try{window.localStorage}catch(e){var m={};Object.defineProperty(window,"localStorage",{value:{getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}}}})}
})();`;

export function wrapUI(html, id, theme = 'dark') {
  const bridge = `<script>${BRIDGE.replace('__ID__', id)}<\/script>`;
  if (/<html[\s>]|<!doctype/i.test(html)) {
    let doc = html;
    if (/<head[^>]*>/i.test(doc)) doc = doc.replace(/<head([^>]*)>/i, `<head$1>${bridge}`);
    else doc = doc.replace(/<html([^>]*)>/i, `<html$1><head>${bridge}</head>`);
    return doc;
  }
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${UI_BASE_CSS}</style>${bridge}</head><body>${html}</body></html>`;
}

// ---------------------------------------------------------------------------
// Built-in widgets (on-device). Each returns an HTML fragment styled by UI_BASE_CSS.
// ---------------------------------------------------------------------------

const W = [];
const widget = (def) => W.push(def);

widget({
  id: 'calculator', title: 'Scientific calculator', re: /\bcalculator\b/,
  build: () => `
<style>.disp{background:var(--card2);border-radius:14px;padding:14px;text-align:right;margin-bottom:12px}.disp .e{color:var(--muted);min-height:20px;font-size:14px;word-break:break-all}.disp .r{font-size:34px;font-weight:600;overflow-x:auto}
.keys{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.keys button{height:48px;border-radius:12px;border:1px solid var(--border);background:var(--card2);color:var(--text);font:inherit;font-size:16px;cursor:pointer}
.keys button:hover{border-color:var(--accent)}.keys .op{background:var(--grad);color:#fff;border:0}.keys .fn{color:#b9a7ff;font-size:14px}</style>
<div class="card" style="max-width:420px;margin:auto">
<div class="disp"><div class="e" id="e"></div><div class="r" id="r">0</div></div>
<div class="keys" id="k"></div>
<div class="row between small muted" style="margin-top:10px"><span>Mode: <a href="#" id="mode" style="color:var(--accent)">DEG</a></span><span>Keyboard supported</span></div></div>
<script>
var keys=["sin","cos","tan","(",")","ln","log","√","^","!","7","8","9","÷","C","4","5","6","×","⌫","1","2","3","−","π","0",".","e","+","="];
var expr="",deg=true,k=document.getElementById("k");
keys.forEach(function(x){var b=document.createElement("button");b.textContent=x;if("÷×−+=".indexOf(x)>=0)b.className="op";else if(isNaN(x)&&x!=="."&&x!=="(" && x!==")")b.className="fn";b.onclick=function(){press(x)};k.appendChild(b)});
function fact(n){if(n<0||n%1)return NaN;var r=1;for(var i=2;i<=n;i++)r*=i;return r}
var OK=["sin","cos","tan","ln","log","sqrt","fact","PI","e"];
function evaluate(s){var t=s.replace(/×/g,"*").replace(/÷/g,"/").replace(/−/g,"-").replace(/π/g,"PI").replace(/√/g,"sqrt").replace(/\\^/g,"**").replace(/(\\d+(?:\\.\\d+)?)!/g,"fact($1)");
if(/[^0-9+\\-*\\/().\\sA-Za-z]/.test(t))throw 0;(t.match(/[A-Za-z]+/g)||[]).forEach(function(id){if(OK.indexOf(id)<0)throw 0});
var c=deg?Math.PI/180:1,f=new Function("sin","cos","tan","ln","log","sqrt","fact","PI","e","return ("+t+")");
return f(function(x){return Math.sin(x*c)},function(x){return Math.cos(x*c)},function(x){return Math.tan(x*c)},Math.log,Math.log10,Math.sqrt,fact,Math.PI,Math.E)}
function show(){document.getElementById("e").textContent=expr;try{var v=evaluate(expr);if(expr&&isFinite(v))document.getElementById("r").textContent=+v.toPrecision(12)}catch(e){}}
function press(x){if(x==="C"){expr="";document.getElementById("r").textContent="0"}else if(x==="⌫")expr=expr.slice(0,-1);else if(x==="="){try{var v=evaluate(expr);expr=String(+v.toPrecision(12));}catch(e){document.getElementById("r").textContent="Error";return}}
else if(["sin","cos","tan","ln","log","√"].indexOf(x)>=0)expr+=x+"(";else expr+=x;show()}
document.getElementById("mode").onclick=function(e){e.preventDefault();deg=!deg;this.textContent=deg?"DEG":"RAD";show()};
addEventListener("keydown",function(e){var m={"*":"×","/":"÷","-":"−",Enter:"=",Backspace:"⌫",Escape:"C"};var x=m[e.key]||e.key;if(/^[0-9.+()^!]$/.test(x)||"×÷−=⌫C".indexOf(x)>=0){e.preventDefault();press(x)}});
</script>`,
});

widget({
  id: 'mortgage', title: 'Loan & mortgage calculator', re: /\bmortgage|\bloans?\b|\bemi\b|car payment|monthly payment/,
  build: () => `
<div class="grid g2 stack">
<div class="card"><h2>Loan details</h2>
<label>Loan amount: <b id="aV"></b></label><input type="range" id="a" min="5000" max="2000000" step="5000" value="350000">
<label style="margin-top:10px">Interest rate: <b id="rV"></b></label><input type="range" id="r" min="0.5" max="15" step="0.05" value="6.5">
<label style="margin-top:10px">Term: <b id="yV"></b></label><input type="range" id="y" min="1" max="40" step="1" value="30">
<label style="margin-top:10px">Down payment: <b id="dV"></b></label><input type="range" id="d" min="0" max="50" step="1" value="20"></div>
<div class="card center"><span class="muted small">Monthly payment</span><div class="big grad-text" id="m"></div>
<svg id="donut" viewBox="0 0 120 120" width="150" height="150" style="display:block;margin:10px auto"></svg>
<div class="grid g2"><div class="stat"><b id="p"></b><span>Principal</span></div><div class="stat"><b id="i"></b><span>Total interest</span></div></div></div></div>
<div class="card" style="margin-top:12px"><h3>Amortization by year</h3><div style="max-height:220px;overflow:auto"><table id="t"></table></div></div>
<script>
var $=function(i){return document.getElementById(i)};var money=function(v){return v.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0})};
function arc(cx,cy,r,a0,a1){var x0=cx+r*Math.cos(a0),y0=cy+r*Math.sin(a0),x1=cx+r*Math.cos(a1),y1=cy+r*Math.sin(a1);return "M"+x0+" "+y0+" A"+r+" "+r+" 0 "+(a1-a0>Math.PI?1:0)+" 1 "+x1+" "+y1}
function calc(){var price=+$("a").value,rate=+$("r").value/1200,n=+$("y").value*12,down=price*$("d").value/100,P=price-down;
var m=rate?P*rate/(1-Math.pow(1+rate,-n)):P/n,total=m*n,interest=total-P;
$("aV").textContent=money(price);$("rV").textContent=$("r").value+"%";$("yV").textContent=$("y").value+" years";$("dV").textContent=$("d").value+"% ("+money(down)+")";
$("m").textContent=money(m);$("p").textContent=money(P);$("i").textContent=money(interest);
var f=P/total,a=-Math.PI/2,b=a+f*Math.PI*2*0.9999;$("donut").innerHTML='<circle cx="60" cy="60" r="46" fill="none" stroke="var(--card2)" stroke-width="16"/><path d="'+arc(60,60,46,a,b)+'" fill="none" stroke="#5b84ff" stroke-width="16"/><path d="'+arc(60,60,46,b,a+Math.PI*2*0.9999)+'" fill="none" stroke="#b16cff" stroke-width="16"/><text x="60" y="58" text-anchor="middle" font-size="11" fill="var(--muted)">principal</text><text x="60" y="73" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text)">'+Math.round(f*100)+'%</text>';
var bal=P,rows="<tr><th>Year</th><th>Principal</th><th>Interest</th><th>Balance</th></tr>";for(var y=1;y<=n/12;y++){var pi=0,ii=0;for(var k=0;k<12;k++){var it=bal*rate,pp=m-it;ii+=it;pi+=pp;bal=Math.max(0,bal-pp)}rows+="<tr><td>"+y+"</td><td>"+money(pi)+"</td><td>"+money(ii)+"</td><td>"+money(bal)+"</td></tr>"}$("t").innerHTML=rows}
["a","r","y","d"].forEach(function(i){$(i).oninput=calc});calc();
</script>`,
});

widget({
  id: 'compound', title: 'Compound interest & savings', re: /\bcompound interest|\binterest (rate )?calculator|\bsavings\b|\binvest(ment|ing)?\b|\bretire(ment)?\b|grow my money/,
  build: () => `
<div class="grid g2 stack">
<div class="card"><h2>Savings plan</h2>
<label>Starting amount: <b id="pV"></b></label><input type="range" id="p" min="0" max="200000" step="500" value="10000">
<label style="margin-top:10px">Monthly contribution: <b id="cV"></b></label><input type="range" id="c" min="0" max="5000" step="25" value="300">
<label style="margin-top:10px">Annual return: <b id="rV"></b></label><input type="range" id="r" min="0" max="15" step="0.1" value="7">
<label style="margin-top:10px">Years: <b id="yV"></b></label><input type="range" id="y" min="1" max="50" step="1" value="25"></div>
<div class="card"><span class="muted small">Future value</span><div class="big grad-text" id="fv"></div>
<div class="grid g2" style="margin-top:12px"><div class="stat"><b id="ct"></b><span>You contribute</span></div><div class="stat"><b id="gr" style="color:var(--good)"></b><span>Growth</span></div></div></div></div>
<div class="card" style="margin-top:12px"><div class="row between"><h3>Growth over time</h3><span class="small muted"><span style="color:#5b84ff">■</span> contributions <span style="color:#b16cff">■</span> growth</span></div><svg id="ch" viewBox="0 0 600 220" style="width:100%;height:auto"></svg></div>
<script>
var $=function(i){return document.getElementById(i)};var money=function(v){return v.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0})};
function calc(){var P=+$("p").value,C=+$("c").value,r=+$("r").value/100/12,Y=+$("y").value;$("pV").textContent=money(P);$("cV").textContent=money(C);$("rV").textContent=$("r").value+"%";$("yV").textContent=Y;
var bal=P,contrib=P,pts=[[0,P,P]];for(var m=1;m<=Y*12;m++){bal=bal*(1+r)+C;contrib+=C;if(m%12===0)pts.push([m/12,bal,contrib])}
$("fv").textContent=money(bal);$("ct").textContent=money(contrib);$("gr").textContent=money(bal-contrib);
var W=600,H=200,max=bal*1.05||1,x=function(i){return 30+i*(W-40)/Y},y=function(v){return H-v/max*(H-10)};
var a="M30 "+H,b="M30 "+H;pts.forEach(function(p){a+=" L"+x(p[0])+" "+y(p[1]);b+=" L"+x(p[0])+" "+y(p[2])});a+=" L"+x(Y)+" "+H+" Z";b+=" L"+x(Y)+" "+H+" Z";
var g="";for(var i=0;i<=4;i++){var v=max*i/4;g+='<line x1="30" x2="590" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--border)"/><text x="0" y="'+(y(v)+4)+'" font-size="10" fill="var(--muted)">'+(v>=1e6?(v/1e6).toFixed(1)+"M":Math.round(v/1e3)+"k")+'</text>'}
$("ch").innerHTML=g+'<path d="'+a+'" fill="#b16cff" opacity=".55"/><path d="'+b+'" fill="#5b84ff" opacity=".85"/><text x="590" y="216" font-size="10" fill="var(--muted)" text-anchor="end">year '+Y+'</text>'}
["p","c","r","y"].forEach(function(i){$(i).oninput=calc});calc();
</script>`,
});

widget({
  id: 'tip', title: 'Tip & bill splitter', re: /\btip\b|split (the )?bill|bill split/,
  build: () => `
<div class="card" style="max-width:460px;margin:auto">
<h2>Tip calculator</h2><label>Bill amount</label><input type="number" id="b" value="84.50" min="0" step="0.01" style="width:100%">
<label style="margin-top:12px">Tip</label><div class="row" id="tips"></div>
<label style="margin-top:12px">People: <b id="nV">2</b></label><input type="range" id="n" min="1" max="20" value="2">
<div class="grid g2" style="margin-top:14px"><div class="stat"><b id="tp"></b><span>Tip per person</span></div><div class="stat"><b id="tt" class="grad-text"></b><span>Total per person</span></div></div>
<p class="small muted" style="margin-top:10px" id="sum"></p></div>
<script>
var pct=18,$=function(i){return document.getElementById(i)};[10,15,18,20,25].forEach(function(p){var c=document.createElement("button");c.className="chip"+(p===pct?" on":"");c.textContent=p+"%";c.onclick=function(){pct=p;document.querySelectorAll("#tips .chip").forEach(function(x){x.classList.remove("on")});c.classList.add("on");calc()};$("tips").appendChild(c)});
function calc(){var b=+$("b").value||0,n=+$("n").value,t=b*pct/100;$("nV").textContent=n;$("tp").textContent="$"+(t/n).toFixed(2);$("tt").textContent="$"+((b+t)/n).toFixed(2);$("sum").textContent="Bill $"+b.toFixed(2)+" + tip $"+t.toFixed(2)+" = $"+(b+t).toFixed(2)+" total"}
$("b").oninput=calc;$("n").oninput=calc;calc();
</script>`,
});

widget({
  id: 'bmi', title: 'BMI calculator', re: /\bbmi\b|body mass/,
  build: () => `
<div class="card" style="max-width:480px;margin:auto"><div class="row between"><h2>BMI calculator</h2><div class="row"><button class="chip on" id="met">Metric</button><button class="chip" id="imp">Imperial</button></div></div>
<label>Height <span id="hu">(cm)</span>: <b id="hV"></b></label><input type="range" id="h" min="120" max="220" value="175">
<label style="margin-top:10px">Weight <span id="wu">(kg)</span>: <b id="wV"></b></label><input type="range" id="w" min="30" max="200" value="70">
<div class="center" style="margin-top:16px"><div class="big" id="bmi"></div><div id="cat" style="font-weight:600"></div></div>
<svg viewBox="0 0 300 40" style="width:100%;margin-top:12px"><defs><linearGradient id="g"><stop offset="0" stop-color="#5b84ff"/><stop offset=".35" stop-color="#4ade9b"/><stop offset=".6" stop-color="#ffc861"/><stop offset="1" stop-color="#ff6b8a"/></linearGradient></defs><rect x="0" y="14" width="300" height="10" rx="5" fill="url(#g)"/><polygon id="pt" points="0,8 -6,0 6,0" fill="var(--text)"/></svg>
<div class="row between small muted"><span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span></div>
<p class="small muted" style="margin-top:10px">BMI is a screening estimate and doesn't account for muscle mass, age or body composition.</p></div>
<script>
var imp=false,$=function(i){return document.getElementById(i)};
function calc(){var h=+$("h").value,w=+$("w").value,hm=imp?h*0.0254:h/100,kg=imp?w*0.453592:w,b=kg/(hm*hm);
$("hV").textContent=imp?Math.floor(h/12)+"′"+(h%12)+"″":h+" cm";$("wV").textContent=imp?w+" lb":w+" kg";$("bmi").textContent=b.toFixed(1);
var c=b<18.5?["Underweight","#5b84ff"]:b<25?["Healthy weight","#4ade9b"]:b<30?["Overweight","#ffc861"]:["Obesity","#ff6b8a"];$("cat").textContent=c[0];$("cat").style.color=c[1];
var x=Math.max(0,Math.min(300,(b-15)/25*300));$("pt").setAttribute("transform","translate("+x+",6)")}
$("h").oninput=calc;$("w").oninput=calc;
function mode(i){imp=i;$("met").classList.toggle("on",!i);$("imp").classList.toggle("on",i);$("hu").textContent=i?"(ft/in)":"(cm)";$("wu").textContent=i?"(lb)":"(kg)";
if(i){$("h").min=48;$("h").max=86;$("h").value=69;$("w").min=66;$("w").max=440;$("w").value=154}else{$("h").min=120;$("h").max=220;$("h").value=175;$("w").min=30;$("w").max=200;$("w").value=70}calc()}
$("met").onclick=function(){mode(false)};$("imp").onclick=function(){mode(true)};calc();
</script>`,
});

widget({
  id: 'converter', title: 'Unit converter', re: /unit convert|converter|conversion (tool|app|widget)/,
  build: () => `
<div class="card" style="max-width:560px;margin:auto"><h2>Unit converter</h2>
<div class="row" id="cats" style="margin-bottom:12px"></div>
<div class="grid g2"><div><label>From</label><input id="v" type="number" value="1" style="width:100%"><select id="f" style="width:100%;margin-top:6px"></select></div>
<div><label>To</label><input id="o" readonly style="width:100%;font-weight:700"><select id="t" style="width:100%;margin-top:6px"></select></div></div>
<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="sw">⇄ Swap</button><span class="small muted" id="formula"></span></div></div>
<script>
var U={Length:{m:1,km:1000,cm:.01,mm:.001,mi:1609.344,yd:.9144,ft:.3048,in:.0254},Weight:{kg:1,g:.001,mg:1e-6,lb:.453592,oz:.0283495,st:6.35029,t:1000},
Volume:{L:1,mL:.001,gal:3.78541,qt:.946353,pt:.473176,cup:.24,"fl oz":.0295735,tbsp:.0147868,tsp:.00492892},Speed:{"km/h":1,mph:1.609344,"m/s":3.6,knot:1.852},
Temperature:{"°C":0,"°F":0,K:0},Data:{B:1,KB:1e3,MB:1e6,GB:1e9,TB:1e12,KiB:1024,MiB:1048576,GiB:1073741824},Time:{s:1,min:60,h:3600,day:86400,week:604800,year:31556952}};
var cat="Length",$=function(i){return document.getElementById(i)};
Object.keys(U).forEach(function(c){var b=document.createElement("button");b.className="chip"+(c===cat?" on":"");b.textContent=c;b.onclick=function(){cat=c;document.querySelectorAll("#cats .chip").forEach(function(x){x.classList.toggle("on",x===b)});fill()};$("cats").appendChild(b)});
function fill(){var ks=Object.keys(U[cat]);$("f").innerHTML=$("t").innerHTML="";ks.forEach(function(k){$("f").add(new Option(k,k));$("t").add(new Option(k,k))});$("t").selectedIndex=1;calc()}
function temp(v,a,b){var c=a==="°C"?v:a==="°F"?(v-32)*5/9:v-273.15;return b==="°C"?c:b==="°F"?c*9/5+32:c+273.15}
function calc(){var v=+$("v").value,a=$("f").value,b=$("t").value,r=cat==="Temperature"?temp(v,a,b):v*U[cat][a]/U[cat][b];$("o").value=+r.toPrecision(10);$("formula").textContent="1 "+a+" = "+(+(cat==="Temperature"?temp(1,a,b):U[cat][a]/U[cat][b]).toPrecision(8))+" "+b}
$("v").oninput=calc;$("f").onchange=calc;$("t").onchange=calc;$("sw").onclick=function(){var i=$("f").selectedIndex;$("f").selectedIndex=$("t").selectedIndex;$("t").selectedIndex=i;calc()};fill();
</script>`,
});

widget({
  id: 'timer', title: 'Focus timer', re: /\btimer\b|\bstopwatch|\bpomodoro|countdown timer|focus session/,
  build: () => `
<style>.ring{position:relative;width:220px;height:220px;margin:8px auto}.ring svg{transform:rotate(-90deg)}.ring .t{position:absolute;inset:0;display:grid;place-items:center;font-size:42px;font-weight:300;font-variant-numeric:tabular-nums}</style>
<div class="card center" style="max-width:420px;margin:auto"><div class="row" style="justify-content:center" id="modes"></div>
<div class="ring"><svg viewBox="0 0 220 220" width="220" height="220"><circle cx="110" cy="110" r="98" fill="none" stroke="var(--card2)" stroke-width="12"/><circle id="arc" cx="110" cy="110" r="98" fill="none" stroke="url(#gg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="615.75" stroke-dashoffset="0"/><defs><linearGradient id="gg"><stop offset="0" stop-color="#3b6bff"/><stop offset="1" stop-color="#b16cff"/></linearGradient></defs></svg><div class="t" id="t">25:00</div></div>
<div class="row" style="justify-content:center" id="presets"></div>
<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="go">Start</button><button class="btn ghost" id="rs">Reset</button><button class="btn ghost" id="lap" hidden>Lap</button></div>
<div class="small muted" id="info" style="margin-top:10px"></div><ol id="laps" class="small" style="text-align:left;max-height:120px;overflow:auto"></ol></div>
<script>
var mode="Pomodoro",dur=1500,left=1500,run=false,last=0,el=0,sessions=0,$=function(i){return document.getElementById(i)};
var M={"Pomodoro":[1500,[25,15,5]],"Timer":[300,[1,5,10,30]],"Stopwatch":[0,[]]};
Object.keys(M).forEach(function(m){var b=document.createElement("button");b.className="chip"+(m===mode?" on":"");b.textContent=m;b.onclick=function(){setMode(m);document.querySelectorAll("#modes .chip").forEach(function(x){x.classList.toggle("on",x===b)})};$("modes").appendChild(b)});
function setMode(m){mode=m;run=false;$("go").textContent="Start";dur=left=M[m][0];el=0;$("lap").hidden=m!=="Stopwatch";$("laps").innerHTML="";$("presets").innerHTML="";M[m][1].forEach(function(p){var c=document.createElement("button");c.className="chip";c.textContent=p+" min";c.onclick=function(){dur=left=p*60;run=false;$("go").textContent="Start";draw()};$("presets").appendChild(c)});draw()}
function fmt(s){s=Math.max(0,s);var m=Math.floor(s/60),x=Math.floor(s%60);return String(m).padStart(2,"0")+":"+String(x).padStart(2,"0")+(mode==="Stopwatch"?"."+String(Math.floor(s*100)%100).padStart(2,"0"):"")}
function draw(){var v=mode==="Stopwatch"?el:left;$("t").textContent=fmt(v);$("arc").style.strokeDashoffset=mode==="Stopwatch"?615.75*(1-(el%60)/60):615.75*(1-left/dur);$("info").textContent=mode==="Pomodoro"?"Sessions completed: "+sessions:""}
function beep(){try{var a=new AudioContext(),o=a.createOscillator(),g=a.createGain();o.frequency.value=880;o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(.2,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+1.2);o.start();o.stop(a.currentTime+1.2)}catch(e){}}
function tick(t){if(!run)return;var dt=(t-last)/1000;last=t;if(mode==="Stopwatch")el+=dt;else{left-=dt;if(left<=0){left=0;run=false;$("go").textContent="Start";beep();if(mode==="Pomodoro")sessions++}}draw();requestAnimationFrame(tick)}
$("go").onclick=function(){run=!run;this.textContent=run?"Pause":"Start";if(run){if(mode!=="Stopwatch"&&left<=0)left=dur;last=performance.now();requestAnimationFrame(tick)}};
$("rs").onclick=function(){run=false;$("go").textContent="Start";left=dur;el=0;$("laps").innerHTML="";draw()};
$("lap").onclick=function(){var li=document.createElement("li");li.textContent=fmt(el);$("laps").prepend(li)};setMode("Pomodoro");
</script>`,
});

widget({
  id: 'todo', title: 'Task planner', re: /\bto-?do\b|\bchecklist|\btask (list|planner)|\bplanner\b/,
  build: (p = {}) => `
<div class="card" style="max-width:560px;margin:auto"><div class="row between"><h2>✦ ${esc(p.title || 'My plan')}</h2><span class="small muted" id="cnt"></span></div>
<div style="height:6px;border-radius:6px;background:var(--card2);margin:8px 0 14px;overflow:hidden"><i id="bar" style="display:block;height:100%;width:0;background:var(--grad);transition:width .3s"></i></div>
<form id="f" class="row"><input id="i" class="grow" placeholder="Add a task…"><select id="pr"><option>Normal</option><option>High</option><option>Low</option></select><button class="btn">Add</button></form>
<div id="l" style="margin-top:10px"></div></div>
<script>
var items=${JSON.stringify((p.items || ['Define the goal', 'Break it into steps', 'Do the first small step', 'Review progress']).map((t) => ({ t, d: false, p: 'Normal' })))};var $=function(i){return document.getElementById(i)};
function r(){var c={High:"var(--bad)",Normal:"var(--accent)",Low:"var(--muted)"};$("l").innerHTML="";items.forEach(function(x,k){var d=document.createElement("label");d.className="row fade";d.style.cssText="padding:10px;border-radius:12px;border:1px solid var(--border);margin-bottom:6px;cursor:pointer;"+(x.d?"opacity:.55":"");
d.innerHTML='<input type="checkbox" '+(x.d?"checked":"")+'><span style="width:8px;height:8px;border-radius:50%;background:'+c[x.p]+'"></span><span class="grow" style="'+(x.d?"text-decoration:line-through":"")+'"></span><button class="chip" style="padding:2px 8px">✕</button>';
d.querySelector(".grow").textContent=x.t;d.querySelector("input").onchange=function(){x.d=!x.d;r()};d.querySelector("button").onclick=function(e){e.preventDefault();items.splice(k,1);r()};$("l").appendChild(d)});
var done=items.filter(function(x){return x.d}).length;$("cnt").textContent=done+" / "+items.length+" done";$("bar").style.width=(items.length?done/items.length*100:0)+"%"}
$("f").onsubmit=function(e){e.preventDefault();var t=$("i").value.trim();if(!t)return;items.push({t:t,d:false,p:$("pr").value});$("i").value="";r()};r();
</script>`,
});

widget({
  id: 'password', title: 'Password generator', re: /password (generator|maker)|generate (a )?(strong |secure )?password|strong password/,
  build: () => `
<div class="card" style="max-width:520px;margin:auto"><h2>🔐 Password generator</h2>
<div class="row" style="background:var(--card2);border-radius:12px;padding:12px"><code id="pw" class="grow" style="font-size:18px;word-break:break-all;font-family:ui-monospace,monospace"></code><button class="btn sm" id="cp">Copy</button></div>
<div style="height:6px;border-radius:6px;background:var(--card2);margin:10px 0 4px;overflow:hidden"><i id="st" style="display:block;height:100%"></i></div><div class="small" id="sl"></div>
<label style="margin-top:12px">Length: <b id="lv"></b></label><input type="range" id="len" min="6" max="64" value="20">
<div class="grid g2" style="margin-top:10px"><label class="row"><input type="checkbox" id="lo" checked> Lowercase</label><label class="row"><input type="checkbox" id="up" checked> Uppercase</label><label class="row"><input type="checkbox" id="nu" checked> Numbers</label><label class="row"><input type="checkbox" id="sy" checked> Symbols</label></div>
<button class="btn" id="gen" style="margin-top:12px;width:100%">Generate new</button></div>
<script>
var $=function(i){return document.getElementById(i)};var S={lo:"abcdefghijkmnopqrstuvwxyz",up:"ABCDEFGHJKLMNPQRSTUVWXYZ",nu:"23456789",sy:"!@#$%^&*-_=+?"};
function rnd(n){return crypto.getRandomValues(new Uint32Array(1))[0]%n}
function gen(){var L=+$("len").value,pools=Object.keys(S).filter(function(k){return $(k).checked}).map(function(k){return S[k]});if(!pools.length){$("pw").textContent="Select at least one set";return}
var all=pools.join(""),c=pools.map(function(p){return p[rnd(p.length)]});while(c.length<L)c.push(all[rnd(all.length)]);for(var i=c.length-1;i>0;i--){var j=rnd(i+1),t=c[i];c[i]=c[j];c[j]=t}
$("pw").textContent=c.join("");$("lv").textContent=L;var bits=L*Math.log2(all.length),s=bits<40?["Weak","var(--bad)",25]:bits<64?["Fair","var(--warn)",50]:bits<90?["Strong","var(--good)",75]:["Very strong","var(--good)",100];
$("st").style.width=s[2]+"%";$("st").style.background=s[1];$("sl").innerHTML="<b style='color:"+s[1]+"'>"+s[0]+"</b> · ~"+Math.round(bits)+" bits of entropy"}
$("gen").onclick=gen;$("len").oninput=gen;["lo","up","nu","sy"].forEach(function(k){$(k).onchange=gen});
$("cp").onclick=function(){var t=$("pw").textContent;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){$("cp").textContent="Copied!"},function(){var r=document.createRange();r.selectNodeContents($("pw"));getSelection().removeAllRanges();getSelection().addRange(r);$("cp").textContent="Selected — ⌘/Ctrl+C"});setTimeout(function(){$("cp").textContent="Copy"},1500)};gen();
</script>`,
});

widget({
  id: 'palette', title: 'Color palette generator', re: /\bpalette|\bcolou?r scheme|\bcolou?r (combo|combination)/,
  build: () => `
<style>.sw{height:120px;border-radius:14px;display:flex;align-items:flex-end;padding:8px;cursor:pointer;transition:transform .15s;font-family:ui-monospace,monospace;font-size:12px}.sw:hover{transform:translateY(-3px)}.sw span{background:rgba(0,0,0,.45);color:#fff;padding:2px 8px;border-radius:8px}</style>
<div class="card"><div class="row between"><h2>🎨 Palette generator</h2><div class="row"><input type="color" id="base" value="#6d3df5"><select id="h"><option>Analogous</option><option>Complementary</option><option>Triadic</option><option>Monochrome</option><option>Split complementary</option></select><button class="btn sm" id="rnd">Random</button></div></div>
<div class="grid g4" id="sw" style="margin-top:12px;grid-template-columns:repeat(5,1fr)"></div><p class="small muted" style="margin-top:10px">Click a swatch to copy its hex code. Press space for a random palette.</p>
<div class="card" id="prev" style="margin-top:6px"></div></div>
<script>
var $=function(i){return document.getElementById(i)};
function hsl2hex(h,s,l){h=(h%360+360)%360;s/=100;l/=100;var k=function(n){return(n+h/30)%12},a=s*Math.min(l,1-l),f=function(n){return l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)))};return"#"+[f(0),f(8),f(4)].map(function(x){return Math.round(x*255).toString(16).padStart(2,"0")}).join("")}
function hex2hsl(H){var r=parseInt(H.substr(1,2),16)/255,g=parseInt(H.substr(3,2),16)/255,b=parseInt(H.substr(5,2),16)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),h=0,s=0,l=(mx+mn)/2;if(mx!==mn){var d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60}return[h,s*100,l*100]}
function make(){var c=hex2hsl($("base").value),h=c[0],s=c[1],l=c[2],t=$("h").value,cols;
if(t==="Analogous")cols=[[h-40,s,l],[h-20,s,l],[h,s,l],[h+20,s,l],[h+40,s,l]];else if(t==="Complementary")cols=[[h,s,l-20],[h,s,l],[h,s*.6,l+20],[h+180,s,l],[h+180,s,l-20]];
else if(t==="Triadic")cols=[[h,s,l],[h+120,s,l],[h+240,s,l],[h,s*.5,l+25],[h,s,l-25]];else if(t==="Monochrome")cols=[[h,s,15],[h,s,30],[h,s,l],[h,s,70],[h,s,88]];else cols=[[h,s,l],[h+150,s,l],[h+210,s,l],[h,s,l+20],[h,s,l-20]];
var hex=cols.map(function(c){return hsl2hex(c[0],Math.max(0,Math.min(100,c[1])),Math.max(5,Math.min(95,c[2])))});
$("sw").innerHTML=hex.map(function(x){return'<div class="sw" style="background:'+x+'" data-h="'+x+'"><span>'+x+'</span></div>'}).join("");
$("prev").style.background="linear-gradient(135deg,"+hex[0]+","+hex[2]+","+hex[4]+")";$("prev").innerHTML='<h2 style="color:#fff;margin:0">Preview headline</h2><p style="color:#fff;opacity:.85;margin:6px 0 10px">How your palette feels together.</p><span class="chip" style="background:'+hex[3]+';color:#fff;border:0">Button</span>';
document.querySelectorAll(".sw").forEach(function(e){e.onclick=function(){var v=e.dataset.h;try{navigator.clipboard.writeText(v)}catch(x){}e.querySelector("span").textContent="Copied!";setTimeout(function(){e.querySelector("span").textContent=v},900)}})}
$("base").oninput=make;$("h").onchange=make;$("rnd").onclick=function(){$("base").value=hsl2hex(Math.random()*360,50+Math.random()*40,40+Math.random()*25);make()};
addEventListener("keydown",function(e){if(e.code==="Space"){e.preventDefault();$("rnd").click()}});make();
</script>`,
});

widget({
  id: 'random', title: 'Dice, coins & random picker', re: /\bdice\b|roll (a|the|some)|flip a coin|coin flip|random (number|picker|choice)|pick (a )?random|spin the wheel|decide for me/,
  build: () => `
<style>.die{width:64px;height:64px;border-radius:16px;background:var(--card2);border:1px solid var(--border);display:grid;place-items:center;font-size:30px;font-weight:700}.roll{animation:roll .5s ease}@keyframes roll{0%{transform:rotate(0) scale(.6)}60%{transform:rotate(300deg) scale(1.1)}100%{transform:rotate(360deg) scale(1)}}</style>
<div class="grid g2 stack"><div class="card center"><h3>🎲 Dice</h3><div class="row" style="justify-content:center;min-height:70px" id="dice"></div><div class="row" style="justify-content:center;margin-top:8px"><select id="n"><option>1</option><option selected>2</option><option>3</option><option>4</option><option>5</option></select><select id="s"><option>4</option><option selected>6</option><option>8</option><option>10</option><option>12</option><option>20</option></select><button class="btn" id="rd">Roll</button></div><div class="small muted" id="tot"></div></div>
<div class="card center"><h3>🪙 Coin</h3><div class="die" id="coin" style="margin:6px auto;border-radius:50%;font-size:22px">?</div><button class="btn" id="fl">Flip</button><div class="small muted" id="hist" style="margin-top:6px"></div></div></div>
<div class="card" style="margin-top:12px"><h3>🎯 Random picker</h3><textarea id="opts" rows="3" style="width:100%" placeholder="One option per line">Pizza
Sushi
Tacos
Ramen</textarea><div class="row" style="margin-top:8px"><button class="btn" id="pk">Pick one</button><label class="row" style="margin:0">Number between <input id="a" type="number" value="1" style="width:70px"> and <input id="b" type="number" value="100" style="width:80px"></label><button class="btn ghost" id="num">Go</button></div><div class="big grad-text center" id="res" style="margin-top:10px;min-height:46px"></div></div>
<script>
var $=function(i){return document.getElementById(i)},F=["","⚀","⚁","⚂","⚃","⚄","⚅"],h=[];function r(n){return 1+Math.floor(Math.random()*n)}
$("rd").onclick=function(){var n=+$("n").value,s=+$("s").value,t=0;$("dice").innerHTML="";for(var i=0;i<n;i++){var v=r(s);t+=v;var d=document.createElement("div");d.className="die roll";d.textContent=s===6?F[v]:v;$("dice").appendChild(d)}$("tot").textContent="Total: "+t};
$("fl").onclick=function(){var c=$("coin"),v=Math.random()<.5?"Heads":"Tails";c.classList.remove("roll");void c.offsetWidth;c.classList.add("roll");c.textContent=v[0];h.unshift(v);$("hist").textContent=v+" · last: "+h.slice(1,6).map(function(x){return x[0]}).join(" ")};
function spin(list){var i=0,n=0,res=$("res"),iv=setInterval(function(){res.textContent=list[i++%list.length];if(++n>14){clearInterval(iv);res.textContent="✦ "+list[Math.floor(Math.random()*list.length)]}},60)}
$("pk").onclick=function(){var l=$("opts").value.split("\\n").map(function(x){return x.trim()}).filter(Boolean);if(l.length)spin(l)};
$("num").onclick=function(){var a=Math.ceil(+$("a").value),b=Math.floor(+$("b").value);if(b<a){var t=a;a=b;b=t}$("res").textContent=a+Math.floor(Math.random()*(b-a+1))};$("rd").click();
</script>`,
});

widget({
  id: 'budget', title: 'Monthly budget planner', re: /\bbudget|\bexpenses?\b|spending plan|personal finance/,
  build: () => `
<div class="grid g2 stack"><div class="card"><h2>💸 Monthly budget</h2><label>Monthly income</label><input id="inc" type="number" value="4200" style="width:100%">
<div id="rows" style="margin-top:12px"></div><form id="add" class="row" style="margin-top:8px"><input id="cn" placeholder="Category" class="grow"><input id="ca" type="number" placeholder="Amount" style="width:110px"><button class="btn sm">Add</button></form></div>
<div class="card center"><svg id="pie" viewBox="0 0 200 200" width="210" height="210" style="display:block;margin:auto"></svg><div class="grid g2" style="margin-top:10px"><div class="stat"><b id="sp"></b><span>Spent</span></div><div class="stat"><b id="lf"></b><span>Left over</span></div></div><div class="small muted" id="tip" style="margin-top:10px"></div></div></div>
<script>
var C=["#3b6bff","#8b5cf6","#b16cff","#5b84ff","#4ade9b","#ffc861","#ff6b8a","#22d3ee","#f472b6","#a3e635"];
var cats=[["Housing",1400],["Food",550],["Transport",280],["Utilities",190],["Fun",250],["Savings",600]];var $=function(i){return document.getElementById(i)};
function money(v){return"$"+Math.round(v).toLocaleString()}
function arc(a0,a1){var r=80,cx=100,cy=100;var x0=cx+r*Math.cos(a0),y0=cy+r*Math.sin(a0),x1=cx+r*Math.cos(a1),y1=cy+r*Math.sin(a1);return"M"+cx+" "+cy+" L"+x0+" "+y0+" A"+r+" "+r+" 0 "+(a1-a0>Math.PI?1:0)+" 1 "+x1+" "+y1+" Z"}
function draw(){var inc=+$("inc").value||0,tot=cats.reduce(function(s,c){return s+(+c[1]||0)},0);$("rows").innerHTML="";
cats.forEach(function(c,i){var d=document.createElement("div");d.className="row";d.style.marginBottom="6px";d.innerHTML='<span style="width:10px;height:10px;border-radius:3px;background:'+C[i%C.length]+'"></span><span class="grow"></span><input type="number" style="width:100px" value="'+c[1]+'"><button class="chip" style="padding:2px 8px">✕</button>';d.querySelector(".grow").textContent=c[0];d.querySelector("input").oninput=function(e){c[1]=+e.target.value;paint()};d.querySelector("button").onclick=function(){cats.splice(i,1);draw()};$("rows").appendChild(d)});paint()}
function paint(){var inc=+$("inc").value||0,tot=cats.reduce(function(s,c){return s+(+c[1]||0)},0),a=-Math.PI/2,svg="";var base=Math.max(tot,inc);
cats.forEach(function(c,i){var f=(+c[1]||0)/base;if(f<=0)return;var b=a+f*Math.PI*2;svg+='<path d="'+arc(a,Math.min(b,a+Math.PI*2-1e-4))+'" fill="'+C[i%C.length]+'"><title>'+c[0]+": "+money(c[1])+'</title></path>';a=b});
if(inc>tot){svg+='<path d="'+arc(a,Math.PI*1.5-1e-4)+'" fill="var(--card2)"/>'}svg+='<circle cx="100" cy="100" r="46" fill="var(--card)"/><text x="100" y="98" text-anchor="middle" font-size="11" fill="var(--muted)">of income</text><text x="100" y="116" text-anchor="middle" font-size="18" font-weight="700" fill="var(--text)">'+(inc?Math.round(tot/inc*100):0)+'%</text>';
$("pie").innerHTML=svg;$("sp").textContent=money(tot);$("lf").textContent=money(inc-tot);$("lf").style.color=inc-tot<0?"var(--bad)":"var(--good)";
var sav=(cats.find(function(c){return/sav/i.test(c[0])})||[0,0])[1];$("tip").textContent=inc-tot<0?"You're over budget — trim the largest category first.":"50/30/20 check: savings are "+(inc?Math.round(sav/inc*100):0)+"% of income (target 20%)."}
$("inc").oninput=paint;$("add").onsubmit=function(e){e.preventDefault();if(!$("cn").value)return;cats.push([$("cn").value,+$("ca").value||0]);$("cn").value=$("ca").value="";draw()};draw();
</script>`,
});

widget({
  id: 'solar', title: 'Solar system explorer', re: /\bsolar system\b|\bplanet(s|ary)? (orbits?|simulation|simulator|explorer|model)|\borbit simulation/,
  build: () => `
<div class="card" style="padding:0;overflow:hidden;position:relative"><canvas id="c" style="width:100%;height:420px;display:block;background:radial-gradient(circle at 50% 50%,#0d1240,#03040f)"></canvas>
<div style="position:absolute;top:12px;left:14px;right:14px" class="row between"><h3 style="margin:0;color:#fff">☀️ Solar system</h3><label class="row" style="margin:0;color:#cfd3ff">Speed <input type="range" id="sp" min="0" max="5" step=".1" value="1" style="width:110px"></label></div>
<div id="info" class="card" style="position:absolute;left:12px;bottom:12px;max-width:280px;background:rgba(16,22,58,.85);backdrop-filter:blur(6px)"><b>Click a planet</b><div class="small muted">to learn about it.</div></div></div>
<script>
var P=[["Mercury",.39,88,3,"#b5a7a1","Smallest planet; a year lasts just 88 days."],["Venus",.72,225,5,"#e8c27a","Hottest planet — thick CO₂ clouds trap heat (~465 °C)."],["Earth",1,365,5.3,"#5b9dff","Our home: liquid water oceans and a protective magnetic field."],["Mars",1.52,687,4,"#e0684b","The red planet, home to Olympus Mons, the tallest volcano known."],
["Jupiter",5.2,4333,11,"#d9b38c","Largest planet; the Great Red Spot is a storm bigger than Earth."],["Saturn",9.58,10759,9.5,"#e8d39c","Famous for its rings of ice and rock; less dense than water."],["Uranus",19.2,30687,7,"#9fe3ef","Rotates on its side with a tilt of ~98°."],["Neptune",30.05,60190,7,"#5a7dff","Windiest planet — gusts over 2,000 km/h."]];
var c=document.getElementById("c"),x=c.getContext("2d"),t=0,sel=null,stars=[];for(var i=0;i<200;i++)stars.push([Math.random(),Math.random(),Math.random()]);
function size(){c.width=c.clientWidth*devicePixelRatio;c.height=c.clientHeight*devicePixelRatio}size();addEventListener("resize",size);
function rad(i){var m=Math.min(c.width,c.height)/2-20*devicePixelRatio;return(28+Math.sqrt(P[i][1])*(m-28)/Math.sqrt(30.05))*1}
var pos=[];function loop(){t+=+document.getElementById("sp").value;x.clearRect(0,0,c.width,c.height);var cx=c.width/2,cy=c.height/2,d=devicePixelRatio;
stars.forEach(function(s){x.fillStyle="rgba(220,215,255,"+(.3+s[2]*.6)+")";x.fillRect(s[0]*c.width,s[1]*c.height,d,d)});
var g=x.createRadialGradient(cx,cy,2,cx,cy,22*d);g.addColorStop(0,"#fff6c2");g.addColorStop(.4,"#ffc23d");g.addColorStop(1,"rgba(255,140,0,0)");x.fillStyle=g;x.beginPath();x.arc(cx,cy,22*d,0,7);x.fill();
P.forEach(function(p,i){var r=rad(i),a=t/p[2]*6+i;x.strokeStyle=sel===i?"rgba(177,108,255,.7)":"rgba(140,150,255,.18)";x.lineWidth=d;x.beginPath();x.arc(cx,cy,r,0,7);x.stroke();
var px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;pos[i]=[px,py];x.fillStyle=p[4];x.beginPath();x.arc(px,py,p[3]*d*.8,0,7);x.fill();
if(p[0]==="Saturn"){x.strokeStyle="rgba(232,211,156,.7)";x.beginPath();x.ellipse(px,py,p[3]*d*1.6,p[3]*d*.6,.4,0,7);x.stroke()}
if(sel===i){x.fillStyle="#fff";x.font=(12*d)+"px system-ui";x.fillText(p[0],px+10*d,py-8*d)}});requestAnimationFrame(loop)}
c.onclick=function(e){var r=c.getBoundingClientRect(),mx=(e.clientX-r.left)*devicePixelRatio,my=(e.clientY-r.top)*devicePixelRatio,best=-1,bd=1e9;pos.forEach(function(p,i){var dd=Math.hypot(p[0]-mx,p[1]-my);if(dd<bd){bd=dd;best=i}});
if(bd<30*devicePixelRatio){sel=best;var p=P[best];document.getElementById("info").innerHTML="<b>"+p[0]+"</b><div class='small muted'>"+p[1]+" AU from the Sun · year = "+p[2].toLocaleString()+" Earth days</div><p class='small' style='margin:6px 0'>"+p[5]+"</p><a href='#' class='ask' data-ask='Tell me more about the planet "+p[0]+"'>Ask Nova about "+p[0]+" →</a>"}};loop();
</script>`,
});

widget({
  id: 'physics', title: 'Gravity playground', re: /\bphysics (sim|simulation|playground|sandbox)|\bgravity\b|\bbouncing balls?|\bpendulum|\bparticle (sim|simulation|system)/,
  build: () => `
<div class="card" style="padding:0;overflow:hidden"><canvas id="c" style="width:100%;height:360px;display:block;background:linear-gradient(#0b1033,#141b4d);cursor:crosshair"></canvas>
<div class="row" style="padding:12px"><label class="row" style="margin:0">Gravity <input type="range" id="g" min="0" max="30" step=".5" value="9.8" style="width:110px"></label><label class="row" style="margin:0">Bounciness <input type="range" id="e" min="0.1" max="1" step=".05" value=".8" style="width:110px"></label><button class="btn sm" id="add">+ 10 balls</button><button class="btn ghost sm" id="clr">Clear</button><span class="small muted">Click or drag to throw balls</span></div></div>
<script>
var c=document.getElementById("c"),x=c.getContext("2d"),B=[],d=devicePixelRatio,drag=null;function size(){c.width=c.clientWidth*d;c.height=c.clientHeight*d}size();addEventListener("resize",size);
var C=["#3b6bff","#8b5cf6","#b16cff","#5b84ff","#c4b5fd","#7dd3fc"];function add(px,py,vx,vy){B.push({x:px,y:py,vx:vx||(Math.random()-.5)*400*d,vy:vy||0,r:(8+Math.random()*14)*d,c:C[B.length%C.length]})}
for(var i=0;i<12;i++)add(Math.random()*c.width,Math.random()*c.height*.5);var last=performance.now();
function loop(t){var dt=Math.min(.03,(t-last)/1000);last=t;var g=+document.getElementById("g").value*60*d,e=+document.getElementById("e").value;x.fillStyle="rgba(11,16,51,.35)";x.fillRect(0,0,c.width,c.height);
B.forEach(function(b){b.vy+=g*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.y+b.r>c.height){b.y=c.height-b.r;b.vy*=-e;b.vx*=.99}if(b.x-b.r<0){b.x=b.r;b.vx*=-e}if(b.x+b.r>c.width){b.x=c.width-b.r;b.vx*=-e}if(b.y-b.r<0){b.y=b.r;b.vy*=-e}});
for(var i=0;i<B.length;i++)for(var j=i+1;j<B.length;j++){var a=B[i],b=B[j],dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy),m=a.r+b.r;if(dist<m&&dist>0){var nx=dx/dist,ny=dy/dist,o=(m-dist)/2;a.x-=nx*o;a.y-=ny*o;b.x+=nx*o;b.y+=ny*o;var p=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(p>0){a.vx-=p*nx*e;a.vy-=p*ny*e;b.vx+=p*nx*e;b.vy+=p*ny*e}}}
B.forEach(function(b){var gr=x.createRadialGradient(b.x-b.r/3,b.y-b.r/3,1,b.x,b.y,b.r);gr.addColorStop(0,"#fff");gr.addColorStop(.25,b.c);gr.addColorStop(1,"#1e1b4b");x.fillStyle=gr;x.beginPath();x.arc(b.x,b.y,b.r,0,7);x.fill()});
if(drag){x.strokeStyle="#c4b5fd";x.lineWidth=2*d;x.beginPath();x.moveTo(drag.x,drag.y);x.lineTo(drag.mx,drag.my);x.stroke()}requestAnimationFrame(loop)}requestAnimationFrame(loop);
function pt(e){var r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*d,y:(e.clientY-r.top)*d}}
c.onpointerdown=function(e){var p=pt(e);drag={x:p.x,y:p.y,mx:p.x,my:p.y}};c.onpointermove=function(e){if(drag){var p=pt(e);drag.mx=p.x;drag.my=p.y}};c.onpointerup=function(){if(drag){add(drag.x,drag.y,(drag.x-drag.mx)*4,(drag.y-drag.my)*4);drag=null}};
document.getElementById("add").onclick=function(){for(var i=0;i<10;i++)add(Math.random()*c.width,20*d)};document.getElementById("clr").onclick=function(){B=[]};
</script>`,
});

widget({
  id: 'draw', title: 'Sketch pad', re: /drawing (pad|app|board)|sketch ?pad|whiteboard|paint app|doodle/,
  build: () => `
<div class="card" style="padding:0;overflow:hidden"><div class="row" style="padding:10px 12px;border-bottom:1px solid var(--border)"><input type="color" id="col" value="#8b6cff"><label class="row" style="margin:0">Size <input type="range" id="sz" min="1" max="40" value="6" style="width:100px"></label><button class="chip" id="er">Eraser</button><button class="chip" id="un">Undo</button><button class="chip" id="cl">Clear</button><button class="btn sm" id="dl">Download PNG</button></div>
<canvas id="c" style="width:100%;height:380px;display:block;background:#fff;touch-action:none;cursor:crosshair"></canvas></div>
<script>
var c=document.getElementById("c"),x=c.getContext("2d"),d=devicePixelRatio,er=false,hist=[],drawing=false;function size(){var img=c.width?x.getImageData(0,0,c.width,c.height):null;c.width=c.clientWidth*d;c.height=c.clientHeight*d;x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);if(img)x.putImageData(img,0,0)}size();
function p(e){var r=c.getBoundingClientRect();return[(e.clientX-r.left)*d,(e.clientY-r.top)*d]}
c.onpointerdown=function(e){hist.push(x.getImageData(0,0,c.width,c.height));if(hist.length>30)hist.shift();drawing=true;var q=p(e);x.beginPath();x.moveTo(q[0],q[1]);x.lineCap=x.lineJoin="round";x.strokeStyle=er?"#fff":document.getElementById("col").value;x.lineWidth=document.getElementById("sz").value*d;x.lineTo(q[0]+.1,q[1]);x.stroke()};
c.onpointermove=function(e){if(!drawing)return;var q=p(e);x.lineTo(q[0],q[1]);x.stroke()};addEventListener("pointerup",function(){drawing=false});
document.getElementById("er").onclick=function(){er=!er;this.classList.toggle("on",er)};document.getElementById("un").onclick=function(){if(hist.length)x.putImageData(hist.pop(),0,0)};
document.getElementById("cl").onclick=function(){hist.push(x.getImageData(0,0,c.width,c.height));x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height)};
document.getElementById("dl").onclick=function(){var a=document.createElement("a");a.href=c.toDataURL("image/png");a.download="sketch.png";a.click()};
</script>`,
});

widget({
  id: 'tictactoe', title: 'Tic-tac-toe', re: /tic.?tac.?toe|noughts and crosses/,
  build: () => `
<style>.b{display:grid;grid-template-columns:repeat(3,90px);gap:8px;justify-content:center;margin:12px 0}.b button{height:90px;border-radius:16px;border:1px solid var(--border);background:var(--card2);font-size:40px;font-weight:800;color:var(--text);cursor:pointer}.b button:hover{border-color:var(--accent)}.b .X{color:#7d9bff}.b .O{color:#d3a6ff}.b .win{background:var(--grad);color:#fff}</style>
<div class="card center" style="max-width:380px;margin:auto"><h2>Tic-tac-toe</h2><div class="row" style="justify-content:center"><button class="chip on" id="e">vs Nova (hard)</button><button class="chip" id="f">2 players</button></div>
<div class="b" id="b"></div><div id="s" style="font-weight:600;min-height:24px"></div><div class="small muted" id="sc"></div><button class="btn" id="r" style="margin-top:10px">New game</button></div>
<script>
var B,turn,ai=true,over,score={X:0,O:0,D:0},L=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]],$=function(i){return document.getElementById(i)};
function win(b){for(var i=0;i<8;i++){var l=L[i];if(b[l[0]]&&b[l[0]]===b[l[1]]&&b[l[0]]===b[l[2]])return l}return null}
function mm(b,p){var w=win(b);if(w)return{s:b[w[0]]==="O"?10:-10};if(b.every(Boolean))return{s:0};var best={s:p==="O"?-99:99};
for(var i=0;i<9;i++)if(!b[i]){b[i]=p;var r=mm(b,p==="O"?"X":"O");b[i]=null;r.s+=(r.s>0?-1:r.s<0?1:0);if(p==="O"?r.s>best.s:r.s<best.s)best={s:r.s,i:i}}return best}
function draw(wl){$("b").innerHTML="";B.forEach(function(v,i){var c=document.createElement("button");c.textContent=v||"";if(v)c.className=v;if(wl&&wl.indexOf(i)>=0)c.className+=" win";c.onclick=function(){play(i)};$("b").appendChild(c)});$("sc").textContent="X "+score.X+" · O "+score.O+" · draws "+score.D}
function play(i){if(over||B[i])return;B[i]=turn;check();if(!over){turn=turn==="X"?"O":"X";if(ai&&turn==="O"){setTimeout(function(){B[mm(B,"O").i]="O";check();turn="X";if(!over)$("s").textContent="Your move (X)";draw(win(B))},250)}}draw(win(B))}
function check(){var w=win(B);if(w){over=true;score[B[w[0]]]++;$("s").textContent=(ai?(B[w[0]]==="X"?"You win! 🎉":"Nova wins ✦"):B[w[0]]+" wins!")}else if(B.every(Boolean)){over=true;score.D++;$("s").textContent="It's a draw."}else $("s").textContent=(ai?"Your move (X)":turn==="X"?"O to move":"X to move")}
function reset(){B=Array(9).fill(null);turn="X";over=false;$("s").textContent=ai?"Your move (X)":"X to move";draw()}
$("r").onclick=reset;$("e").onclick=function(){ai=true;this.classList.add("on");$("f").classList.remove("on");reset()};$("f").onclick=function(){ai=false;this.classList.add("on");$("e").classList.remove("on");reset()};reset();
</script>`,
});

widget({
  id: 'piano', title: 'Piano synth', re: /\bpiano\b|\bsynth(esizer)?\b|keyboard instrument|play music|music maker/,
  build: () => `
<style>.kb{position:relative;height:180px;display:flex;user-select:none;margin-top:10px}.w{flex:1;border:1px solid #c9c9d9;background:linear-gradient(#fff,#e9e9f5);border-radius:0 0 10px 10px;position:relative;display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px;font-size:11px;color:#667;cursor:pointer}
.w.on{background:linear-gradient(#d9ccff,#b9a7ff)}.k{position:absolute;width:5.5%;height:110px;background:linear-gradient(#2a2f55,#0b0e26);border-radius:0 0 8px 8px;z-index:2;cursor:pointer;color:#aab;font-size:10px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px}.k.on{background:linear-gradient(#6d3df5,#2347e8)}</style>
<div class="card"><div class="row between"><h2>🎹 Nova synth</h2><div class="row"><select id="wv"><option value="triangle">Soft</option><option value="sine">Pure</option><option value="sawtooth">Bright</option><option value="square">Retro</option></select><label class="row" style="margin:0">Vol <input type="range" id="vol" min="0" max="1" step=".05" value=".5" style="width:90px"></label></div></div>
<div class="kb" id="kb"></div><p class="small muted" style="margin-top:8px">Play with your mouse, touch, or keyboard: <b>A W S E D F T G Y H U J K</b></p></div>
<script>
var ac,names=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],keys="awsedftgyhujkolp;",kb=document.getElementById("kb"),wi=0,whites=[];
for(var i=0;i<17;i++){var n=names[i%12],black=n.length>1,el=document.createElement("div");el.dataset.i=i;el.textContent=keys[i]?keys[i].toUpperCase():"";if(black){el.className="k";el.style.left=(wi*100/10-2.75)+"%"}else{el.className="w";wi++}kb.appendChild(el)}
function freq(i){return 261.63*Math.pow(2,i/12)}var active={};
function on(i){ac=ac||new AudioContext();if(active[i])return;var o=ac.createOscillator(),g=ac.createGain();o.type=document.getElementById("wv").value;o.frequency.value=freq(i);g.gain.setValueAtTime(0,ac.currentTime);g.gain.linearRampToValueAtTime(+document.getElementById("vol").value*.4,ac.currentTime+.01);o.connect(g);g.connect(ac.destination);o.start();active[i]={o:o,g:g};var el=kb.querySelector('[data-i="'+i+'"]');el&&el.classList.add("on")}
function off(i){var a=active[i];if(!a)return;a.g.gain.cancelScheduledValues(ac.currentTime);a.g.gain.setTargetAtTime(0,ac.currentTime,.12);a.o.stop(ac.currentTime+.6);delete active[i];var el=kb.querySelector('[data-i="'+i+'"]');el&&el.classList.remove("on")}
kb.onpointerdown=function(e){var i=e.target.dataset.i;if(i!=null){on(+i);var up=function(){off(+i);removeEventListener("pointerup",up)};addEventListener("pointerup",up)}};
addEventListener("keydown",function(e){var i=keys.indexOf(e.key.toLowerCase());if(i>=0&&!e.repeat)on(i)});addEventListener("keyup",function(e){var i=keys.indexOf(e.key.toLowerCase());if(i>=0)off(i)});
</script>`,
});

widget({
  id: 'typing', title: 'Typing speed test', re: /typing (test|speed|game|practice)|\bwpm\b/,
  build: () => `
<div class="card" style="max-width:640px;margin:auto"><div class="row between"><h2>⌨️ Typing test</h2><div class="row"><div class="stat" style="padding:6px 12px"><b id="wpm">0</b><span>WPM</span></div><div class="stat" style="padding:6px 12px"><b id="acc">100%</b><span>accuracy</span></div><div class="stat" style="padding:6px 12px"><b id="tm">30</b><span>sec</span></div></div></div>
<div id="txt" style="font-size:19px;line-height:1.7;margin:14px 0;font-family:ui-monospace,monospace;letter-spacing:.2px"></div><input id="in" style="width:100%" placeholder="Start typing to begin…" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn ghost sm" id="re" style="margin-top:10px">Restart</button></div>
<script>
var S=["The quick brown fox jumps over the lazy dog while the stars glow softly above the quiet city.","Nova turns curious questions into clear answers, playful ideas into real projects, and blank pages into stories.","Practice makes progress, not perfection, so keep your eyes on the words and let your fingers find the rhythm.","Deep blue oceans and violet skies meet at the horizon, where every wave carries a small piece of the light."];
var t,txt,start=null,left=30,timer,done=false,$=function(i){return document.getElementById(i)};
function reset(){txt=S[Math.floor(Math.random()*S.length)];start=null;left=30;done=false;clearInterval(timer);$("in").value="";$("in").disabled=false;$("tm").textContent=30;$("wpm").textContent=0;$("acc").textContent="100%";render("")}
function render(v){var h="";for(var i=0;i<txt.length;i++){var ch=txt[i],c=i<v.length?(v[i]===ch?"var(--good)":"var(--bad)"):"var(--muted)";h+='<span style="color:'+c+(i===v.length?";border-bottom:2px solid var(--accent)":"")+'">'+(ch===" "?"&nbsp;":ch.replace(/</g,"&lt;"))+"</span>"}$("txt").innerHTML=h}
function stats(){var v=$("in").value,ok=0;for(var i=0;i<v.length;i++)if(v[i]===txt[i])ok++;var mins=(30-left)/60||1/60;$("wpm").textContent=Math.round(ok/5/mins);$("acc").textContent=(v.length?Math.round(ok/v.length*100):100)+"%"}
$("in").oninput=function(){if(done)return;if(!start){start=Date.now();timer=setInterval(function(){left--;$("tm").textContent=left;stats();if(left<=0){done=true;clearInterval(timer);$("in").disabled=true}},1000)}render(this.value);stats();if(this.value.length>=txt.length){done=true;clearInterval(timer);$("in").disabled=true;stats()}};
$("re").onclick=reset;reset();
</script>`,
});

widget({
  id: 'worldclock', title: 'World clock', re: /\bworld clock|\btime ?zones?\b/,
  build: () => `
<div class="card"><div class="row between"><h2>🌍 World clock</h2><select id="add"><option value="">+ Add city</option></select></div><div class="grid g3" id="g" style="margin-top:12px"></div></div>
<script>
var Z={"New York":"America/New_York","Los Angeles":"America/Los_Angeles","London":"Europe/London","Paris":"Europe/Paris","Berlin":"Europe/Berlin","Dubai":"Asia/Dubai","Mumbai":"Asia/Kolkata","Singapore":"Asia/Singapore","Tokyo":"Asia/Tokyo","Sydney":"Australia/Sydney","São Paulo":"America/Sao_Paulo","Mexico City":"America/Mexico_City","Toronto":"America/Toronto","Cairo":"Africa/Cairo","Lagos":"Africa/Lagos","Seoul":"Asia/Seoul","Beijing":"Asia/Shanghai","Moscow":"Europe/Moscow","Honolulu":"Pacific/Honolulu","Auckland":"Pacific/Auckland"};
var sel=["Local","New York","London","Tokyo","Sydney","Dubai"];Object.keys(Z).forEach(function(k){document.getElementById("add").add(new Option(k,k))});
document.getElementById("add").onchange=function(){if(this.value&&sel.indexOf(this.value)<0)sel.push(this.value);this.value="";draw()};
function draw(){var g=document.getElementById("g"),now=new Date();g.innerHTML="";sel.forEach(function(c,i){var tz=c==="Local"?undefined:Z[c],h=+new Intl.DateTimeFormat("en",{hour:"numeric",hourCycle:"h23",timeZone:tz}).format(now),day=h>=6&&h<18;
var d=document.createElement("div");d.className="stat";d.style.position="relative";d.innerHTML='<span>'+(day?"☀️":"🌙")+" "+c+'</span><b style="font-size:26px;font-variant-numeric:tabular-nums">'+now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:tz})+'</b><span>'+now.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric",timeZone:tz})+'</span>'+(c!=="Local"?'<button class="chip" style="position:absolute;top:8px;right:8px;padding:0 7px">✕</button>':"");
var b=d.querySelector("button");if(b)b.onclick=function(){sel.splice(i,1);draw()};g.appendChild(d)})}draw();setInterval(draw,1000);
</script>`,
});

widget({
  id: 'chart', title: 'Chart builder', re: /chart builder|make (a |me a )?(chart|graph)|plot (my|this|some) data|data visuali[sz]/,
  build: () => `
<div class="grid g2 stack"><div class="card"><h3>Data</h3><textarea id="d" rows="8" style="width:100%;font-family:ui-monospace,monospace">Mon, 12
Tue, 19
Wed, 8
Thu, 15
Fri, 22
Sat, 30
Sun, 17</textarea><div class="row" style="margin-top:8px" id="types"></div><input id="title" value="Weekly activity" style="width:100%;margin-top:8px"></div>
<div class="card"><h3 id="tt"></h3><svg id="ch" viewBox="0 0 400 260" style="width:100%"></svg></div></div>
<script>
var type="Bar",C=["#3b6bff","#6d3df5","#b16cff","#5b84ff","#c4b5fd","#22d3ee","#f472b6","#4ade9b"],$=function(i){return document.getElementById(i)};
["Bar","Line","Pie"].forEach(function(t){var b=document.createElement("button");b.className="chip"+(t===type?" on":"");b.textContent=t;b.onclick=function(){type=t;document.querySelectorAll("#types .chip").forEach(function(x){x.classList.toggle("on",x===b)});draw()};$("types").appendChild(b)});
function draw(){var rows=$("d").value.split("\\n").map(function(l){var p=l.split(/[,\\t:]/);return[p[0].trim(),parseFloat(p[1])]}).filter(function(r){return r[0]&&!isNaN(r[1])});$("tt").textContent=$("title").value;
var max=Math.max.apply(null,rows.map(function(r){return r[1]}).concat([1])),W=400,H=230,s="";if(type==="Pie"){var tot=rows.reduce(function(a,r){return a+r[1]},0),a=-Math.PI/2;rows.forEach(function(r,i){var f=r[1]/tot,b=a+f*Math.PI*2,x0=200+100*Math.cos(a),y0=120+100*Math.sin(a),x1=200+100*Math.cos(b),y1=120+100*Math.sin(b);s+='<path d="M200 120 L'+x0+" "+y0+" A100 100 0 "+(f>.5?1:0)+" 1 "+x1+" "+y1+' Z" fill="'+C[i%C.length]+'"><title>'+r[0]+": "+r[1]+'</title></path>';var m=(a+b)/2;s+='<text x="'+(200+125*Math.cos(m))+'" y="'+(124+125*Math.sin(m))+'" font-size="10" text-anchor="middle" fill="var(--muted)">'+r[0]+'</text>';a=b})}
else{for(var g=0;g<=4;g++){var y=H-g*(H-20)/4;s+='<line x1="34" x2="396" y1="'+y+'" y2="'+y+'" stroke="var(--border)"/><text x="28" y="'+(y+3)+'" font-size="9" text-anchor="end" fill="var(--muted)">'+Math.round(max*g/4)+'</text>'}var bw=(W-44)/rows.length;
if(type==="Bar")rows.forEach(function(r,i){var h=r[1]/max*(H-20);s+='<rect x="'+(40+i*bw+bw*.15)+'" y="'+(H-h)+'" width="'+bw*.7+'" height="'+h+'" rx="5" fill="url(#gr)"><title>'+r[0]+": "+r[1]+'</title></rect>'});
else{var pth="",area="";rows.forEach(function(r,i){var x=40+i*bw+bw/2,y=H-r[1]/max*(H-20);pth+=(i?"L":"M")+x+" "+y;s+='<circle cx="'+x+'" cy="'+y+'" r="4" fill="#b16cff"><title>'+r[0]+": "+r[1]+'</title></circle>'});area=pth+"L"+(40+(rows.length-1)*bw+bw/2)+" "+H+"L"+(40+bw/2)+" "+H+"Z";s='<path d="'+area+'" fill="url(#gr)" opacity=".3"/><path d="'+pth+'" fill="none" stroke="#8b6cff" stroke-width="2.5"/>'+s}
rows.forEach(function(r,i){s+='<text x="'+(40+i*bw+bw/2)+'" y="'+(H+16)+'" font-size="10" text-anchor="middle" fill="var(--muted)">'+r[0]+'</text>'})}
$("ch").innerHTML='<defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b16cff"/><stop offset="1" stop-color="#3b6bff"/></linearGradient></defs>'+s}
$("d").oninput=draw;$("title").oninput=draw;draw();
</script>`,
});

widget({
  id: 'countdown', title: 'Countdown', re: /countdown to|days (until|till|left)|how long until|count ?down/,
  build: (p = {}) => `
<div class="card center" style="max-width:560px;margin:auto"><h2 id="lbl">${esc(p.label || 'New Year')}</h2><input type="datetime-local" id="dt"><div class="grid g4" style="margin-top:16px" id="g"></div><p class="small muted" id="when" style="margin-top:10px"></p></div>
<script>
var $=function(i){return document.getElementById(i)};var target=${p.date ? JSON.stringify(p.date) : 'null'};if(!target){var n=new Date();target=new Date(n.getFullYear()+1,0,1).toISOString()}
function pad(x){return String(x).padStart(2,"0")}var d0=new Date(target);$("dt").value=d0.getFullYear()+"-"+pad(d0.getMonth()+1)+"-"+pad(d0.getDate())+"T"+pad(d0.getHours())+":"+pad(d0.getMinutes());
function tick(){var t=new Date($("dt").value)-new Date(),neg=t<0;t=Math.abs(t);var v=[Math.floor(t/864e5),Math.floor(t/36e5)%24,Math.floor(t/6e4)%60,Math.floor(t/1e3)%60];
$("g").innerHTML=["Days","Hours","Minutes","Seconds"].map(function(l,i){return'<div class="stat"><b class="big grad-text" style="font-size:34px">'+v[i]+'</b><span>'+l+'</span></div>'}).join("");$("when").textContent=(neg?"Since ":"Until ")+new Date($("dt").value).toLocaleString([], {dateStyle:"full",timeStyle:"short"})}
setInterval(tick,1000);$("dt").oninput=tick;tick();
</script>`,
});

widget({
  id: 'habit', title: 'Habit tracker', re: /\bhabits?\b/,
  build: () => `
<div class="card"><div class="row between"><h2>🔥 Habit tracker</h2><form id="f" class="row"><input id="n" placeholder="New habit"><button class="btn sm">Add</button></form></div><div id="g" style="margin-top:12px;overflow-x:auto"></div></div>
<script>
var H=[["Drink water 💧",[1,1,0,1,1,0,0]],["Read 20 min 📚",[1,0,1,1,0,0,0]],["Move 30 min 🏃",[0,1,1,0,1,0,0]]],D=[],now=new Date();for(var i=6;i>=0;i--){var d=new Date(now);d.setDate(now.getDate()-i);D.push(d.toLocaleDateString([],{weekday:"short"}))}
function streak(a){var s=0;for(var i=a.length-1;i>=0&&a[i];i--)s++;return s}
function draw(){var h='<table><tr><th>Habit</th>'+D.map(function(d){return"<th style='text-align:center'>"+d+"</th>"}).join("")+'<th>Streak</th></tr>';H.forEach(function(x,i){h+="<tr><td></td>"+x[1].map(function(v,j){return'<td style="text-align:center"><button data-i="'+i+'" data-j="'+j+'" class="chip'+(v?" on":"")+'" style="width:30px;height:30px;padding:0;justify-content:center">'+(v?"✓":"")+'</button></td>'}).join("")+"<td>"+streak(x[1])+" 🔥</td></tr>"});
document.getElementById("g").innerHTML=h+"</table>";document.querySelectorAll("#g tr td:first-child").forEach(function(td,i){td.textContent=H[i][0]});document.querySelectorAll("#g button").forEach(function(b){b.onclick=function(){var x=H[b.dataset.i][1];x[b.dataset.j]=x[b.dataset.j]?0:1;draw()}})}
document.getElementById("f").onsubmit=function(e){e.preventDefault();var n=document.getElementById("n");if(n.value.trim())H.push([n.value.trim(),[0,0,0,0,0,0,0]]);n.value="";draw()};draw();
</script>`,
});

export const WIDGETS = W;

export function matchWidget(text) {
  const t = text.toLowerCase();
  // Specific tools (mortgage, tip, BMI, budget…) win over generic calculator/planner matches.
  const generic = ['calculator', 'todo'];
  return W.find((w) => !generic.includes(w.id) && w.re.test(t)) || W.find((w) => generic.includes(w.id) && w.re.test(t)) || null;
}

export function buildWidget(id, params) {
  const w = W.find((x) => x.id === id);
  return w ? { title: w.title, html: w.build(params) } : null;
}

// ---------------------------------------------------------------------------
// Data-driven widgets built from live sources
// ---------------------------------------------------------------------------

export function weatherWidget({ place, data, wmo }) {
  const c = data.current;
  const now = wmo(c.weather_code, !!c.is_day);
  const d = data.daily;
  const hourly = data.hourly;
  const unit = data.current_units?.temperature_2m || '°C';
  const days = d.time.map((t, i) => ({
    day: i === 0 ? 'Today' : new Date(t + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' }),
    hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]), w: wmo(d.weather_code[i]), rain: d.precipitation_probability_max?.[i] ?? 0,
  }));
  const lo = Math.min(...days.map((x) => x.lo)), hi = Math.max(...days.map((x) => x.hi));
  const hours = (hourly?.time || []).slice(0, 24).map((t, i) => ({ h: new Date(t).toLocaleTimeString(undefined, { hour: 'numeric' }), t: hourly.temperature_2m[i], w: wmo(hourly.weather_code[i]) }));
  const tMin = Math.min(...hours.map((x) => x.t)), tMax = Math.max(...hours.map((x) => x.t));
  const pts = hours.map((x, i) => `${10 + i * (580 / Math.max(1, hours.length - 1))},${90 - ((x.t - tMin) / Math.max(1, tMax - tMin)) * 60}`).join(' ');
  const bg = c.is_day ? 'linear-gradient(160deg,#1d4ed8,#6d28d9 70%,#9d4dff)' : 'linear-gradient(160deg,#0b1846,#2c1d6b 70%,#4c1d95)';
  return `
<div class="card fade" style="background:${bg};border:0;color:#fff">
  <div class="row between"><div><div style="font-size:15px;opacity:.85">📍 ${esc(place.name)}${place.admin1 ? ', ' + esc(place.admin1) : ''}${place.country ? ', ' + esc(place.country) : ''}</div>
  <div class="row" style="gap:14px;margin-top:4px"><span style="font-size:64px;line-height:1">${now.emoji}</span><div><div class="big" style="font-size:56px">${Math.round(c.temperature_2m)}${esc(unit)}</div><div style="opacity:.9">${esc(now.text)} · feels like ${Math.round(c.apparent_temperature)}${esc(unit)}</div></div></div></div>
  <div style="text-align:right;opacity:.9;font-size:13.5px;line-height:1.9">💧 Humidity ${c.relative_humidity_2m}%<br>🌬️ Wind ${Math.round(c.wind_speed_10m)} km/h<br>☔ Precip ${c.precipitation} mm<br>🔆 UV ${d.uv_index_max?.[0] ?? '—'}</div></div>
  <svg viewBox="0 0 600 120" style="width:100%;margin-top:10px"><polyline points="${pts}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.5" stroke-linejoin="round"/>${hours.filter((_, i) => i % 3 === 0).map((x, k) => { const i = k * 3; const X = 10 + i * (580 / Math.max(1, hours.length - 1)); const Y = 90 - ((x.t - tMin) / Math.max(1, tMax - tMin)) * 60; return `<text x="${X}" y="${Y - 10}" font-size="12" text-anchor="middle" fill="#fff">${Math.round(x.t)}°</text><text x="${X}" y="114" font-size="11" text-anchor="middle" fill="rgba(255,255,255,.75)">${esc(x.h)}</text>`; }).join('')}</svg>
</div>
<div class="card" style="margin-top:12px"><h3>7-day forecast</h3>
${days.map((x) => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--border)"><span style="width:56px">${esc(x.day)}</span><span style="width:32px;font-size:20px">${x.w.emoji}</span><span class="small muted" style="width:46px">${x.rain ? '☔' + x.rain + '%' : ''}</span><span class="muted" style="width:36px;text-align:right">${x.lo}°</span>
<span class="grow" style="height:6px;border-radius:6px;background:var(--card2);position:relative"><i style="position:absolute;left:${((x.lo - lo) / Math.max(1, hi - lo)) * 100}%;right:${100 - ((x.hi - lo) / Math.max(1, hi - lo)) * 100}%;top:0;bottom:0;border-radius:6px;background:linear-gradient(90deg,#5b84ff,#b16cff)"></i></span><span style="width:36px">${x.hi}°</span></div>`).join('')}
<div class="row" style="margin-top:10px"><a class="ask" href="#" data-ask="What should I wear in ${esc(place.name)} today?">👕 What should I wear?</a><a class="ask" href="#" data-ask="Plan a day of activities in ${esc(place.name)} based on this weather">🗺️ Plan my day</a></div>
<p class="small muted" style="margin:8px 0 0">Live data from Open-Meteo · updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>`;
}

/** "Visual layout" explorer for a topic, built from a Wikipedia article. */
export function explorerWidget({ article, images = [], related = [], quiz = [] }) {
  const sections = article.sections.filter((s) => s.text.length > 80).slice(0, 8);
  const overview = sections[0]?.text || '';
  const facts = (overview.match(/[^.!?]+[.!?]/g) || []).slice(1, 5).map((s) => s.trim());
  const tabs = sections.slice(1, 7);
  const data = { tabs: tabs.map((s) => ({ t: s.title, x: s.text.split('\n').filter(Boolean).slice(0, 3).join('\n\n').slice(0, 1400) })), quiz };
  return `
<style>.hero{position:relative;border-radius:18px;overflow:hidden;min-height:200px;display:flex;align-items:flex-end;background:var(--grad)}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55}.hero .in{position:relative;padding:18px;color:#fff;background:linear-gradient(transparent,rgba(5,8,24,.85));width:100%}
.tabs{display:flex;gap:6px;overflow-x:auto;margin:14px 0 10px}.panel{white-space:pre-line;line-height:1.65}.gal{display:flex;gap:8px;overflow-x:auto}.gal img{height:110px;border-radius:12px;object-fit:cover}</style>
<div class="hero fade">${article.thumb ? `<img src="${esc(article.thumb)}" alt="">` : ''}<div class="in"><div class="small" style="opacity:.8">✦ Nova visual layout</div><h1 style="font-size:28px;margin:4px 0">${esc(article.title)}</h1><div style="opacity:.9">${esc(article.description || '')}</div></div></div>
<div class="grid g2 stack" style="margin-top:12px"><div class="card"><h3>Overview</h3><p style="line-height:1.65">${esc((overview.match(/[^.!?]+[.!?]/g) || [overview]).slice(0, 2).join(' '))}</p></div>
<div class="card"><h3>Key facts</h3>${facts.map((f) => `<div class="row" style="align-items:flex-start;margin-bottom:6px"><span style="color:var(--accent)">✦</span><span class="grow small">${esc(f)}</span></div>`).join('') || '<p class="muted small">—</p>'}</div></div>
${tabs.length ? `<div class="card" style="margin-top:12px"><div class="tabs" id="tabs"></div><div class="panel" id="panel"></div></div>` : ''}
${images.length ? `<div class="card" style="margin-top:12px"><h3>Gallery</h3><div class="gal">${images.map((i) => `<img src="${esc(i.src)}" alt="" loading="lazy">`).join('')}</div></div>` : ''}
${quiz.length ? `<div class="card" style="margin-top:12px"><div class="row between"><h3>Quick check</h3><span class="small muted" id="qs"></span></div><div id="quiz"></div></div>` : ''}
<div class="card" style="margin-top:12px"><h3>Keep exploring</h3><div class="row">${related.map((r) => `<a class="ask" href="#" data-ask="Tell me about ${esc(r)}">${esc(r)} →</a>`).join('')}<a class="ask" href="#" data-ask="Explain ${esc(article.title)} like I'm 10">🧒 Explain simply</a><a class="ask" href="#" data-ask="Make me a timeline of ${esc(article.title)}">🕰️ Timeline</a></div>
<p class="small muted" style="margin:10px 0 0">Source: <a href="${esc(article.url)}" style="color:var(--accent)">Wikipedia — ${esc(article.title)}</a> (CC BY-SA)</p></div>
<script>
var D=${JSON.stringify(data).replace(/</g, '\\u003c')};
(function(){var t=document.getElementById("tabs");if(t){D.tabs.forEach(function(s,i){var b=document.createElement("button");b.className="chip"+(i?"":" on");b.textContent=s.t;b.onclick=function(){t.querySelectorAll(".chip").forEach(function(x){x.classList.toggle("on",x===b)});document.getElementById("panel").textContent=s.x};t.appendChild(b)});document.getElementById("panel").textContent=D.tabs[0].x}
var q=document.getElementById("quiz");if(q){var score=0,n=0;D.quiz.forEach(function(item,i){var d=document.createElement("div");d.style.marginBottom="12px";var p=document.createElement("p");p.style.fontWeight="600";p.textContent=(i+1)+". "+item.q;d.appendChild(p);var r=document.createElement("div");r.className="row";item.choices.forEach(function(c,k){var b=document.createElement("button");b.className="chip";b.textContent=c;b.onclick=function(){if(d.dataset.done)return;d.dataset.done=1;n++;if(k===item.a){score++;b.style.background="var(--good)";b.style.color="#04120a"}else{b.style.background="var(--bad)";b.style.color="#fff";r.children[item.a].style.background="var(--good)";r.children[item.a].style.color="#04120a"}document.getElementById("qs").textContent=score+" / "+n+" correct"};r.appendChild(b)});d.appendChild(r);q.appendChild(d)})}})();
</script>`;
}
