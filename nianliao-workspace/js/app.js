/* ================================================================
   年辽的知识工作台 · 核心逻辑
   纯本地运行，数据存于浏览器 localStorage
   ================================================================ */
"use strict";

/* ---------------- 四大分区定义（含阶段拆解模板与权重） ---------------- */
const ZONES = [
  { id:"research", name:"药剂学研究", glyph:"研",
    desc:"课题、处方、实验与论文——严谨优先，阶段环环相扣。",
    phases:[["文献调研",.18],["实验设计",.17],["实验实施",.30],["数据分析",.15],["论文撰写",.14],["修改投稿",.06]] },
  { id:"diary", name:"日记写作", glyph:"记",
    desc:"私人书房的文字流水线：从素材到定稿，允许慢，不允许散。",
    phases:[["素材积累",.25],["结构大纲",.18],["初稿写作",.30],["打磨修订",.17],["排版归档",.10]] },
  { id:"aistudy", name:"AI药学自学", glyph:"智",
    desc:"人工智能 × 药学交叉自学：规划、研读、动手、复盘、输出。",
    phases:[["学习规划",.12],["课程研读",.28],["动手实践",.30],["阶段复盘",.15],["输出笔记",.15]] },
  { id:"video", name:"AI视频自媒体", glyph:"影",
    desc:"内容生产编辑部：选题到发布是一条可复查的流水线。",
    phases:[["选题策划",.15],["脚本撰写",.25],["素材与AI生成",.25],["剪辑包装",.22],["发布复盘",.13]] },
];
const zoneById = id => ZONES.find(z => z.id === id);

/* 灵感自动归类词典 */
const IDEA_CATS = [
  { cat:"药剂学", kw:["药剂","处方","缓释","控释","靶向","纳米","脂质体","微球","乳剂","凝胶","崩解","溶出","包封","药动","生物利用","制剂","实验","文献","论文","课题","色谱","hplc","透析"] },
  { cat:"AI与自学", kw:["ai","人工智能","模型","机器学习","深度学习","提示词","prompt","大模型","gpt","算法","python","神经网络","训练","智能体","rag","微调"] },
  { cat:"写作", kw:["日记","随笔","散文","文稿","文章","章节","叙事","文笔","记录","排版","比喻","开头","结尾"] },
  { cat:"视频创作", kw:["视频","镜头","脚本","剪辑","分镜","自媒体","短视频","发布","流量","运镜","配音","字幕","封面","爆款"] },
];
const IDEA_DEFAULT = "生活随想";

/* ---------------- 存储 ---------------- */
const STORE_KEY = "nianliao…h-v1";
let S = { projects:[], tasks:[], ideas:[], materials:[],
  meta:{ updatedAt:0 },
  config:{ ai:{on:true, relay:"", model:"qwen3.8-flash"}, sync:{on:false, token:"", gist:""} } };

/* 配置永远只存本机：同步时从数据里剥离 */
const LOCAL_ONLY = ["config"];
function normalize(){
  S.config = Object.assign({ ai:{on:true, relay:"", model:"qwen3.8-flash"}, sync:{on:false, token:"", gist:""} }, S.config||{});
  S.meta = S.meta || { updatedAt:0 };
}

function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){ S = JSON.parse(raw); normalize(); return; }
  }catch(e){/* 数据损坏则重置 */}
  if(!sessionStorage.getItem("nianliao-no-seed")) seed(); // 刚清空过则保持空白书房
  normalize();
}
function save(){
  normalize(); // 兼容旧数据 / seed 刚重建的 S
  S.meta.updatedAt = Date.now();
  localStorage.setItem(STORE_KEY, JSON.stringify(S));
  scheduleSync();
}

/* ---------------- 小工具 ---------------- */
const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-3);
const pad = n => String(n).padStart(2,"0");
const esc = s => String(s??"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function isoOf(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function today(){ return isoOf(new Date()); }
function addDays(iso, n){ const d=new Date(iso+"T00:00:00"); d.setDate(d.getDate()+n); return isoOf(d); }
function daysBetween(a,b){ return Math.round((new Date(b+"T00:00:00") - new Date(a+"T00:00:00"))/86400000); }
const WD = ["日","一","二","三","四","五","六"];
function fmtCN(iso){ const d=new Date(iso+"T00:00:00"); return `${d.getMonth()+1}月${d.getDate()}日`; }
function fmtShort(iso){ return iso.slice(5).replace("-","."); }
function relDead(iso){
  const n = daysBetween(today(), iso);
  if(n<0)  return {txt:`逾期 ${-n} 天`, urgent:true};
  if(n===0)return {txt:"今天截止", urgent:true};
  if(n<=7) return {txt:`剩 ${n} 天`, urgent:true};
  return {txt:`剩 ${n} 天`, urgent:false};
}
function greeting(){
  const h = new Date().getHours();
  if(h<6)  return "凌晨好，灯下慎行";
  if(h<9)  return "清晨好，先读一页";
  if(h<12) return "上午好，正事当先";
  if(h<14) return "午间小憩，笔不停";
  if(h<18) return "下午好，深耕之时";
  if(h<22) return "夜晚好，收束一日";
  return "深夜了，写几行再睡";
}

/* ---------------- 自动拆解 ---------------- */
/* 项目 → 阶段里程碑时间线 */
function buildMilestones(zone, startISO, endISO){
  const total = Math.max(2, daysBetween(startISO, endISO));
  let acc = startISO, list = [];
  zone.phases.forEach((ph,i)=>{
    let len = Math.max(1, Math.round(ph[1]*total));
    if(i === zone.phases.length-1){ len = Math.max(1, daysBetween(acc, endISO)); } // 末段对齐截止日
    const end = i === zone.phases.length-1 ? endISO : addDays(acc, len-1);
    list.push({ id:uid(), name:ph[0], start:acc, end, done:false });
    acc = addDays(end, 1);
    if(acc > endISO && i < zone.phases.length-1) acc = endISO;
  });
  return list;
}
/* 单任务 → 执行步骤（按剩余天数铺日期） */
const DECOMP = [["构思与准备",.15],["核心工作·第一段",.4],["核心工作·第二段",.65],["检查完善与交付",.92]];
function decomposeTask(title, zoneId, dueISO){
  const start = today(), span = Math.max(1, daysBetween(start, dueISO));
  return DECOMP.map(d=>({
    id:uid(), title:`${title} · ${d[0]}`, zone:zoneId,
    due: addDays(start, Math.round(d[1]*span)), done:false, projectId:null
  }));
}
/* 灵感 → 自动归类 + 抽标签 */
function classify(text){
  const low = text.toLowerCase();
  let best = {cat:IDEA_DEFAULT, hits:[]};
  for(const c of IDEA_CATS){
    const hits = c.kw.filter(k=>low.includes(k));
    if(hits.length > best.hits.length) best = {cat:c.cat, hits};
  }
  return { cat:best.cat, tags:best.hits.slice(0,4) };
}

/* ---------------- 图标 ---------------- */
const ICONS = {
  home:'<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-7h6v7"/></svg>',
  zones:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  ideas:'<svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.5-1 2.5h-6c0-1-.2-1.8-1-2.5A6 6 0 0 1 12 3z"/><path d="M10 19h4M11 22h2"/></svg>',
  materials:'<svg viewBox="0 0 24 24"><path d="M4 4h16v5H4zM3 9h18v11H3z"/><path d="M10 14h4"/></svg>',
  search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .33 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.33 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .33-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.33-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.33h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.33 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>',
};
const NAV = [
  ["home","书房今日"],["zones","四大分区"],["ideas","灵感库"],
  ["materials","资料归档"],["search","全文检索"],["settings","设置"],
];

/* ---------------- 路由 ---------------- */
let route = { view:"home", zone:"research", project:null, ideaFilter:"全部", q:"" };

/* ---------------- 渲染入口 ---------------- */
function render(){
  // 导航高亮
  const html = NAV.map(([v,label]) =>
    `<button class="navbtn ${route.view===v||(route.view==="project"&&v==="zones")?"active":""}" data-action="nav" data-view="${v}">
       ${ICONS[v]}<span>${label}</span></button>`).join("");
  document.getElementById("desktop-nav").innerHTML = html;
  document.getElementById("mobile-nav").innerHTML = NAV.map(([v,label]) =>
    `<button class="bbtn ${route.view===v||(route.view==="project"&&v==="zones")?"active":""}" data-action="nav" data-view="${v}">
       ${ICONS[v]}<span>${label}</span></button>`).join("");

  const d = new Date();
  document.getElementById("topdate").innerHTML =
    `${d.getFullYear()} 年 ${d.getMonth()+1} 月 ${d.getDate()} 日 · 星期${WD[d.getDay()]} <em>｜ ${greeting()}</em>`;

  const view = document.getElementById("view");
  if(route.view==="home")       view.innerHTML = renderHome();
  else if(route.view==="zones") view.innerHTML = renderZones();
  else if(route.view==="project") view.innerHTML = renderProject();
  else if(route.view==="ideas") view.innerHTML = renderIdeas();
  else if(route.view==="materials") view.innerHTML = renderMaterials();
  else if(route.view==="search")  view.innerHTML = renderSearch();
  else if(route.view==="settings") view.innerHTML = renderSettings();
  if(route.view==="settings") bindSettings();
  updateSyncDots();
  window.scrollTo(0,0);
}

/* ---------------- 视图：书房今日 ---------------- */
function taskRow(t){
  const z = zoneById(t.zone);
  const r = relDead(t.due);
  return `<div class="taskrow ${t.done?"done":""}">
    <span class="chk ${t.done?"on":""}" data-action="toggle-task" data-id="${t.id}" title="标记完成"></span>
    <div>
      <div class="t-title">${esc(t.title)}</div>
      <div class="t-meta"><span class="zonechip">${z?z.name:"随办"}</span>
        <span class="${!t.done&&r.urgent?(daysBetween(today(),t.due)<0?"late":"soon"):""}">${t.due?fmtCN(t.due)+" · "+r.txt:"无期限"}</span>
        ${t.projectId?" · 隶属项目":""}</div>
    </div>
    <button class="del" data-action="del-task" data-id="${t.id}" title="删除">✕</button>
  </div>`;
}
function projCard(p){
  const done = p.milestones.filter(m=>m.done).length;
  const pct = Math.round(100*done/Math.max(1,p.milestones.length));
  const r = relDead(p.deadline);
  const z = zoneById(p.zone);
  return `<div class="projcard" data-action="open-project" data-id="${p.id}">
    <div class="p-head"><span class="zonechip">${z.name}</span>
      <span class="p-title">${esc(p.title)}</span>
      <span class="p-dead ${r.urgent?"urgent":""}">${r.txt}</span></div>
    <div class="pbar"><i style="width:${pct}%"></i></div>
    <div class="pbar-note"><span>${done}/${p.milestones.length} 阶段完成</span><span>截止 ${fmtCN(p.deadline)}</span></div>
  </div>`;
}
function renderHome(){
  const td = today();
  const open = S.tasks.filter(t=>!t.done);
  const overdue = open.filter(t=>t.due && t.due < td).sort((a,b)=>a.due<b.due?-1:1);
  const todayT = open.filter(t=>t.due === td);
  const noDue  = open.filter(t=>!t.due);
  const doneT  = S.tasks.filter(t=>t.done && t.due===td);

  const list = [...overdue, ...todayT, ...noDue, ...doneT];
  const listHtml = list.length ? list.map(taskRow).join("")
    : `<div class="empty">今日尚无任务 —— 点击右上角「新建项目 / 记灵感」，或添加一条小任务</div>`;

  // 未来七天排期条
  let strip = "";
  for(let i=0;i<7;i++){
    const iso = addDays(td,i);
    const d = new Date(iso+"T00:00:00");
    const n = open.filter(t=>t.due===iso).length;
    strip += `<div class="wday ${i===0?"today":""}">
      <span>${i===0?"今天":i===1?"明天":("周"+WD[d.getDay()])}</span>
      <b>${d.getDate()}</b><div class="dots">${"<i></i>".repeat(Math.min(n,4))}</div></div>`;
  }

  const active = S.projects.filter(p=>p.status!=="archived")
    .sort((a,b)=>a.deadline<b.deadline?-1:1);
  const activeHtml = active.slice(0,4).map(projCard).join("")
    || `<div class="empty">还没有项目 · 新建一个，系统会自动拆出阶段时间线</div>`;

  const recentIdeas = S.ideas.slice(0,2).map(it=>
    `<div style="font-size:.84rem;color:var(--ink-soft);padding:7px 0;border-bottom:1px dashed var(--line-soft)">
      <span class="cat" style="color:var(--wine)">${it.cat}</span> ｜ ${esc(it.text.slice(0,42))}${it.text.length>42?"…":""}
    </div>`).join("");

  return `
  <div class="greet"><h2>${greeting()}，<span>年辽</span></h2>
    <p>${new Date().getFullYear()} 年 ${new Date().getMonth()+1} 月 ${new Date().getDate()} 日 · 把日子过成手稿</p></div>

  <div class="card"><div class="sec-title">一周排期 <span class="hint">未来七日 · 每日任务数</span></div>
    <div class="weekstrip">${strip}</div></div>

  <div class="home-grid">
    <div class="home-col">
      <div class="card">
        <div class="sec-title">当日任务 <span class="hint">逾期 ${overdue.length} · 今日 ${todayT.length} · 完成 ${doneT.length}</span>
          <span class="right"><button class="btn small ghost" data-action="new-task">+ 记任务</button></span></div>
        ${listHtml}
      </div>
      <div class="card">
        <div class="sec-title">灵感速记 <span class="hint">落笔即归档，自动归类</span></div>
        <div class="quicknote">
          <textarea id="quick-idea" placeholder="此刻的念头，先接住它……"></textarea>
          <button class="btn" data-action="quick-idea">存入</button>
        </div>
        ${recentIdeas}
      </div>
    </div>
    <div class="home-col">
      <div class="card">
        <div class="sec-title">进行中的项目 <span class="hint">按截止排序</span>
          <span class="right"><button class="btn small" data-action="new-project">+ 新建项目</button></span></div>
        ${activeHtml}
      </div>
    </div>
  </div>`;
}

/* ---------------- 视图：四大分区 ---------------- */
function renderZones(){
  const tabs = ZONES.map(z=>{
    const cnt = S.projects.filter(p=>p.zone===z.id && p.status!=="archived").length;
    return `<button class="ztab ${route.zone===z.id?"active":""}" data-action="zone-tab" data-zone="${z.id}">
      【${z.glyph}】${z.name}<span class="cnt">${cnt}</span></button>`;
  }).join("");
  const z = zoneById(route.zone);
  const projs = S.projects.filter(p=>p.zone===z.id).sort((a,b)=>a.deadline<b.deadline?-1:1);
  const tasks = S.tasks.filter(t=>t.zone===z.id && !t.done).sort((a,b)=>(a.due||"9999")<(b.due||"9999")?-1:1);

  return `
  <div class="sec-title" style="font-size:1.2rem">四大分区 <span class="hint">研究 · 写作 · 自学 · 创作</span></div>
  <div class="zone-tabs">${tabs}</div>
  <div class="zone-intro">${esc(z.desc)}<br>
    <span style="font-size:.76rem;color:var(--brown)">项目阶段模板：${z.phases.map(p=>p[0]).join(" → ")}</span></div>

  <div class="card">
    <div class="sec-title">${z.name} · 项目
      <span class="right"><button class="btn small" data-action="new-project" data-zone="${z.id}">+ 新建并自动拆进度</button></span></div>
    ${projs.map(projCard).join("") || `<div class="empty">此区暂无项目</div>`}
  </div>

  <div class="card">
    <div class="sec-title">${z.name} · 待办
      <span class="right"><button class="btn small ghost" data-action="new-task" data-zone="${z.id}">+ 记任务</button></span></div>
    ${tasks.map(taskRow).join("") || `<div class="empty">此区暂无待办</div>`}
  </div>`;
}

/* ---------------- 视图：项目详情（时间线） ---------------- */
function renderProject(){
  const p = S.projects.find(x=>x.id===route.project);
  if(!p) { route.view="home"; return renderHome(); }
  const z = zoneById(p.zone);
  const done = p.milestones.filter(m=>m.done).length;
  const pct = Math.round(100*done/Math.max(1,p.milestones.length));
  const r = relDead(p.deadline);
  const td = today();

  const t0 = new Date(p.milestones[0].start+"T00:00:00");
  const t1 = new Date(p.milestones[p.milestones.length-1].end+"T00:00:00");
  const span = Math.max(1, (t1-t0)/86400000);
  const todayPct = Math.min(100, Math.max(0, (new Date(td+"T00:00:00")-t0)/86400000/span*100));

  const rows = p.milestones.map(m=>{
    const left = (new Date(m.start+"T00:00:00")-t0)/86400000/span*100;
    const w = Math.max(4,(new Date(m.end+"T00:00:00")-new Date(m.start+"T00:00:00"))/86400000/span*100+2);
    const late = !m.done && m.end < td;
    return `<div class="tl-row">
      <div class="tl-label"><span class="chk ${m.done?"on":""} ms-check" data-action="toggle-ms" data-pid="${p.id}" data-id="${m.id}"></span> ${esc(m.name)}</div>
      <div class="tl-track"><div class="tl-bar ${m.done?"done":""} ${late?"late":""}" style="left:${left}%;width:${w}%">
        ${fmtShort(m.start)}–${fmtShort(m.end)}${late?" · 滞后":""}</div></div>
    </div>`;
  }).join("");

  const ptasks = S.tasks.filter(t=>t.projectId===p.id);
  return `
  <button class="btn small ghost" data-action="back-zones" style="margin-bottom:16px">← 返回分区</button>
  <div class="card">
    <div class="p-head" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
      <span class="zonechip">${z.name}</span>
      <span style="font-size:1.25rem;font-weight:700">${esc(p.title)}</span>
      <span class="p-dead ${r.urgent?"urgent":""}" style="margin-left:auto">${r.txt} · 截止 ${fmtCN(p.deadline)}</span>
    </div>
    ${p.desc?`<p style="color:var(--ink-soft);font-size:.88rem;margin-top:8px">${esc(p.desc)}</p>`:""}
    <div class="pbar" style="margin-top:16px"><i style="width:${pct}%"></i></div>
    <div class="pbar-note"><span>总进度 ${pct}%</span><span>${done}/${p.milestones.length} 阶段</span></div>
  </div>

  <div class="card">
    <div class="sec-title">阶段时间线 <span class="hint">自动拆解生成 · 红针为今日 · 点击方框勾选阶段</span></div>
    <div class="tl-grid" style="position:relative">${rows}
      <div class="todayline" style="left:calc(118px + (100% - 130px)*${todayPct/100})"></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn small" data-action="gen-today-task" data-id="${p.id}">为当前阶段生成本周任务</button>
      <button class="btn small ghost wine" data-action="del-project" data-id="${p.id}">删除项目</button>
    </div>
  </div>

  ${ptasks.length?`<div class="card"><div class="sec-title">项目相关任务</div>${ptasks.map(taskRow).join("")}</div>`:""}`;
}

/* ---------------- 视图：灵感库 ---------------- */
function renderIdeas(){
  const cats = ["全部", ...IDEA_CATS.map(c=>c.cat), IDEA_DEFAULT];
  const chips = cats.map(c=>{
    const n = c==="全部" ? S.ideas.length : S.ideas.filter(i=>i.cat===c).length;
    return `<button class="chip ${route.ideaFilter===c?"active":""}" data-action="idea-chip" data-cat="${c}">${c} ${n}</button>`;
  }).join("");
  const list = (route.ideaFilter==="全部" ? S.ideas : S.ideas.filter(i=>i.cat===route.ideaFilter));
  const cards = list.map(it=>`
    <div class="idea-card">
      <div class="i-text">${esc(it.text)}</div>
      <div class="i-foot"><span class="cat">${it.cat}</span>
        ${it.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join("")}
        <span style="margin-left:auto">${fmtCN(it.date)}</span></div>
      <button class="del" data-action="del-idea" data-id="${it.id}" title="删除">✕</button>
    </div>`).join("");
  return `
  <div class="sec-title" style="font-size:1.2rem">灵感库 <span class="hint">随手接住 · 自动归类入架</span>
    <span class="right"><button class="btn small" data-action="new-idea">+ 记灵感</button></span></div>
  <div class="chips">${chips}</div>
  ${cards ? `<div class="idea-grid">${cards}</div>` : `<div class="empty">这一架还空着 · 点「记灵感」，系统会替你分类</div>`}`;
}

/* ---------------- 视图：资料归档 ---------------- */
const MAT_TYPES = ["文献","课程","模板","链接","手记"];
function renderMaterials(){
  const rows = S.materials.map(m=>`
    <div class="matrow">
      <div class="mat-type">${m.type}</div>
      <div style="min-width:0">
        <div class="m-title">${esc(m.title)}</div>
        ${m.note?`<div class="m-note">${esc(m.note)}</div>`:""}
        <div class="m-meta">${zoneById(m.zone)?zoneById(m.zone).name+" · ":""}${fmtCN(m.date)}
          ${m.tags.length?" · 标签: "+m.tags.map(esc).join(" / "):""}</div>
      </div>
      <button class="del" data-action="del-mat" data-id="${m.id}" title="删除">✕</button>
    </div>`).join("");
  return `
  <div class="sec-title" style="font-size:1.2rem">资料归档 <span class="hint">文献、课程、模板、链接、手记</span>
    <span class="right"><button class="btn small" data-action="new-material">+ 归档资料</button></span></div>
  <div class="card">${rows || `<div class="empty">尚无归档 · 一份资料一句话，日后才找得回</div>`}</div>`;
}

/* ---------------- 视图：全文检索 ---------------- */
function highlight(text, q){
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if(i<0) return esc(text);
  return esc(text.slice(0,i)) + "<mark>" + esc(text.slice(i,i+q.length)) + "</mark>" + esc(text.slice(i+q.length));
}
function searchAll(q){
  const low = q.toLowerCase();
  const hit = s => String(s||"").toLowerCase().includes(low);
  return {
    tasks: S.tasks.filter(t=>hit(t.title)),
    projects: S.projects.filter(p=>hit(p.title)||hit(p.desc)),
    ideas: S.ideas.filter(i=>hit(i.text)||hit(i.tags.join(" "))),
    materials: S.materials.filter(m=>hit(m.title)||hit(m.note)||hit(m.tags.join(" "))),
  };
}
function renderSearch(){
  const q = route.q.trim();
  let out = "";
  if(q){
    const R = searchAll(q);
    const total = R.tasks.length+R.projects.length+R.ideas.length+R.materials.length;
    const item = (main, sub, action, id) =>
      `<div class="result-item" data-action="${action}" data-id="${id}">${highlight(main,q)}<div class="r-sub">${esc(sub)}</div></div>`;
    out = total===0 ? `<div class="empty">「${esc(q)}」一无所获 —— 换个词试试</div>` :
      `<p style="color:var(--brown);font-size:.84rem;margin-bottom:6px">共 ${total} 条结果</p>` +
      (R.projects.length?`<div class="result-group"><h3>项目 · ${R.projects.length}</h3>${R.projects.map(p=>item(p.title, zoneById(p.zone).name+" · 截止 "+fmtCN(p.deadline), "open-project", p.id)).join("")}</div>`:"") +
      (R.tasks.length?`<div class="result-group"><h3>任务 · ${R.tasks.length}</h3>${R.tasks.map(t=>item(t.title, (zoneById(t.zone)?.name||"随办")+" · "+(t.due||"无期限")+(t.done?" · 已完成":""), "goto-home", t.id)).join("")}</div>`:"") +
      (R.ideas.length?`<div class="result-group"><h3>灵感 · ${R.ideas.length}</h3>${R.ideas.map(i=>item(i.text.slice(0,60), i.cat+" · "+fmtCN(i.date), "goto-ideas", i.id)).join("")}</div>`:"") +
      (R.materials.length?`<div class="result-group"><h3>资料 · ${R.materials.length}</h3>${R.materials.map(m=>item(m.title, m.type+" · "+(zoneById(m.zone)?.name||"空白分区"), "goto-materials", m.id)).join("")}</div>`:"");
  }
  return `
  <div class="search-hero">
    <input id="search-input" placeholder="检索任务、项目、灵感、资料…" value="${esc(route.q)}">
    <div class="cap">一 个 入 口 ， 找 回 整 个 书 房</div>
  </div>
  <div class="card" style="padding:16px 18px">${out || `<div class="empty">输入关键词 · 全站纸页一同响应</div>`}</div>`;
}

/* ---------------- 模态框 ---------------- */
let modalCleanup = null;
function openModal(title, sub, bodyHtml, footHtml){
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-mask" data-action="close-modal"></div>
    <div class="modal"><button class="x-close" data-action="close-modal">✕</button>
    <h3>${title}${sub?`<small>${sub}</small>`:""}</h3>${bodyHtml}
    <div class="modal-actions">${footHtml}</div></div>`;
  root.classList.add("open");
}
function closeModal(){
  const root = document.getElementById("modal-root");
  root.classList.remove("open"); root.innerHTML = "";
  if(modalCleanup){ modalCleanup(); modalCleanup = null; }
}
const zoneOptions = sel => ZONES.map(z=>`<option value="${z.id}" ${z.id===sel?"selected":""}>${z.name}</option>`).join("");
const projectOptions = sel => S.projects.map(p=>`<option value="${p.id}" ${p.id===sel?"selected":""}>${esc(p.title)}</option>`).join("");

/* —— 新建项目（自动拆进度）—— */
function modalNewProject(presetZone){
  const t = today(), def = addDays(t, 21);
  openModal("新建项目","保存后自动拆解为阶段时间线",
    `<div class="field"><label>项目名称</label><input type="text" id="np-title" placeholder="例：缓释微球处方优化 / 《称量时光》第三辑"></div>
     <div class="field-row">
       <div class="field"><label>所属分区</label><select id="np-zone">${zoneOptions(presetZone||"research")}</select></div>
       <div class="field"><label>截止日期</label><input type="date" id="np-dead" min="${t}" value="${def}"></div>
     </div>
     <div class="field"><label>一句话目标（可选）</label><textarea id="np-desc" placeholder="这个项目结束时，希望看到什么成果？"></textarea></div>
     <div class="autosplit-tip" id="np-preview"></div>`,
    `<button class="btn ghost" data-action="close-modal">取消</button>
     <button class="btn" id="np-save">创建并拆解</button>`);
  const upd = () => {
    const z = zoneById(document.getElementById("np-zone").value);
    const dead = document.getElementById("np-dead").value || def;
    const days = daysBetween(today(), dead);
    document.getElementById("np-preview").innerHTML =
      `自动拆解预览（约 ${days} 天）：<b>${z.phases.map(p=>p[0]).join(" → ")}</b>`;
  };
  document.getElementById("np-zone").onchange = upd;
  document.getElementById("np-dead").onchange = upd;
  upd();
  document.getElementById("np-save").onclick = () => {
    const title = document.getElementById("np-title").value.trim();
    if(!title){ alert("请为项目题一个名"); return; }
    const zone = zoneById(document.getElementById("np-zone").value);
    const dead = document.getElementById("np-dead").value || def;
    const p = { id:uid(), title, zone:zone.id, desc:document.getElementById("np-desc").value.trim(),
      deadline:dead, createdAt:today(), status:"active", milestones:buildMilestones(zone, today(), dead) };
    S.projects.unshift(p); save(); closeModal();
    route = {...route, view:"project", project:p.id}; render();
    aiRefineProject(p);
  };
}

/* —— 新建任务（可自动拆解）—— */
function modalNewTask(presetZone){
  const t = today();
  openModal("记一条任务","勾选拆解后将按剩余天数铺开步骤",
    `<div class="field"><label>任务内容</label><input type="text" id="nt-title" placeholder="例：精读脂质体综述 2 篇 / 写 300 字日记"></div>
     <div class="field-row">
       <div class="field"><label>分区</label><select id="nt-zone">${zoneOptions(presetZone||"research")}</select></div>
       <div class="field"><label>截止</label><input type="date" id="nt-due" min="${addDays(t,-60)}" value="${t}"></div>
     </div>
     ${S.projects.length?`<div class="field"><label>隶属项目（可选）</label><select id="nt-proj"><option value="">不隶属</option>${projectOptions("")}</select></div>`:""}
     <div class="field"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="nt-split" style="width:auto"> 自动拆解为执行步骤并生成时间线${aiOn()?"（千问定制）":"（规则模板）"}</label></div>`,
    `<button class="btn ghost" data-action="close-modal">取消</button>
     <button class="btn" id="nt-save">存入</button>`);
  document.getElementById("nt-save").onclick = () => {
    const title = document.getElementById("nt-title").value.trim();
    if(!title){ alert("请写下任务内容"); return; }
    const zone = document.getElementById("nt-zone").value;
    const due = document.getElementById("nt-due").value || today();
    const pid = document.getElementById("nt-proj")?.value || null;
    if(document.getElementById("nt-split").checked && daysBetween(today(), due) >= 3 && !pid){
      const steps = decomposeTask(title, zone, due);
      steps.forEach(t2=>S.tasks.unshift(t2));
      if(aiOn()) aiRefineSteps(steps, title, zone, due);
    }else{
      S.tasks.unshift({ id:uid(), title, zone, due, done:false, projectId:pid });
    }
    save(); closeModal(); render();
  };
}

/* —— 记灵感 —— */
function modalNewIdea(){
  openModal("记一条灵感","存入时自动判断归类并抽取标签",
    `<div class="field"><label>灵感 / 随想</label><textarea id="ni-text" placeholder="想到什么写什么，哪怕只有一行…" style="min-height:110px"></textarea></div>
     <div class="field"><label>归类预览</label><div class="autosplit-tip" id="ni-preview">边写边看 →</div></div>`,
    `<button class="btn ghost" data-action="close-modal">取消</button>
     <button class="btn" id="ni-save">收入灵感库</button>`);
  const ta = document.getElementById("ni-text");
  ta.oninput = () => {
    const c = classify(ta.value);
    document.getElementById("ni-preview").innerHTML =
      ta.value.trim() ? `将归入 <b>${c.cat}</b>${c.tags.length?" · 标签："+c.tags.map(esc).join(" / "):""}` : "边写边看 →";
  };
  ta.focus();
  document.getElementById("ni-save").onclick = () => {
    const text = ta.value.trim();
    if(!text){ alert("先写下只言片语"); return; }
    addIdea(text); closeModal(); render();
  };
}
function addIdea(text){
  const c = classify(text);
  const idea = { id:uid(), text, cat:c.cat, tags:c.tags, date:today() };
  S.ideas.unshift(idea); save();
  toast(`已归档 · ${c.cat}${c.tags.length?"（"+c.tags.join(" / ")+"）":""}${aiOn()?" · AI 正在精修分类":""}`);
  if(aiOn()) aiRefineIdea(idea);
  return idea;
}
/* AI 异步精修灵感分类；失败则保持规则结果 */
function aiRefineIdea(idea){
  aiClassify(idea.text).then(a=>{
    if(!a) return;
    const cur = S.ideas.find(x=>x.id===idea.id);
    if(cur && (cur.cat!==a.cat || cur.tags.join()!==a.tags.join())){
      cur.cat=a.cat; cur.tags=a.tags; save();
      if(route.view==="ideas"||route.view==="home") render();
      toast(`AI 重新归类：${a.cat}`);
    }
  }).catch(()=>{});
}

/* —— 归档资料 —— */
function modalNewMaterial(){
  openModal("归档一份资料","关键词自动抽取，便于日后检索",
    `<div class="field"><label>名称</label><input type="text" id="nm-title" placeholder="例：《缓释制剂研究进展》综述"></div>
     <div class="field-row">
       <div class="field"><label>类型</label><select id="nm-type">${MAT_TYPES.map(t=>`<option>${t}</option>`).join("")}</select></div>
       <div class="field"><label>分区</label><select id="nm-zone">${zoneOptions(route.view==="zones"?route.zone:"research")}</select></div>
     </div>
     <div class="field"><label>备注 / 要点 / 链接</label><textarea id="nm-note" placeholder="为什么留档？想在哪一天用上它？"></textarea></div>`,
    `<button class="btn ghost" data-action="close-modal">取消</button>
     <button class="btn" id="nm-save">归档</button>`);
  document.getElementById("nm-save").onclick = () => {
    const title = document.getElementById("nm-title").value.trim();
    if(!title){ alert("请写名称"); return; }
    const note = document.getElementById("nm-note").value.trim();
    const c = classify(title + " " + note);
    S.materials.unshift({ id:uid(), title, type:document.getElementById("nm-type").value,
      zone:document.getElementById("nm-zone").value, note, tags:c.tags, date:today() });
    save(); closeModal(); render();
  };
}

/* ================================================================
   千问智能层 —— 经自建中转调用；任何失败都静默回退规则引擎
   ================================================================ */
function aiOn(){ return !!(S.config.ai.on && S.config.ai.relay); }

async function llmCall(system, user, maxTokens=600){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), 25000);
  try{
    const r = await fetch(S.config.ai.relay, {
      method:"POST", signal:ctrl.signal,
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ model:S.config.ai.model,
        messages:[{role:"system",content:system},{role:"user",content:user}],
        temperature:0.3, max_tokens:maxTokens }),
    });
    if(!r.ok) throw new Error("中转 HTTP "+r.status);
    const j = await r.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  } finally { clearTimeout(timer); }
}
function parseJsonLoose(t){
  t = String(t||"").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if(fence) t = fence[1].trim();
  try{ return JSON.parse(t); }catch(e){}
  /* 包裹在废话里：按首字符决定先剥数组还是先剥对象 */
  const pairs = t.startsWith("[") ? [["[","]"],["{","}"]] : [["{","}"],["[","]"]];
  for(const pair of pairs){
    const i = t.indexOf(pair[0]), k = t.lastIndexOf(pair[1]);
    if(i>=0 && k>i){ try{ return JSON.parse(t.slice(i,k+1)); }catch(e){} }
  }
  return null;
}
async function aiClassify(text){
  const cats = [...IDEA_CATS.map(c=>c.cat), IDEA_DEFAULT].join(" / ");
  const j = parseJsonLoose(await llmCall(
    `你是知识工作台的灵感归类助手。把灵感归入且仅归入一类：${cats}。抽出不超过 4 个便于日后检索的标签。只输出 JSON：{"cat":"类别","tags":["标签"]}，不要其他文字。`,
    text));
  if(!j || !j.cat) return null;
  return { cat:String(j.cat), tags:Array.isArray(j.tags)? j.tags.slice(0,4).map(String) : [] };
}
function phasesToMilestones(list, startISO, endISO){
  const total = Math.max(2, daysBetween(startISO, endISO));
  let acc = startISO; const out = [];
  list.forEach((ph,i)=>{
    const end = i===list.length-1 ? endISO : addDays(acc, Math.max(1, Math.round(ph.w*total))-1);
    out.push({ id:uid(), name:ph.name, start:acc, end, done:false });
    acc = addDays(end,1);
    if(acc>endISO && i<list.length-1) acc = endISO;
  });
  return out;
}
async function aiPhases(z, p){
  const days = daysBetween(today(), p.deadline);
  const j = parseJsonLoose(await llmCall(
    "你是药学研究生的项目规划助手。为项目拆出 4-7 个按时间先后排列的阶段，权重 w 之和为 1，阶段名 4-10 字、动词开头、贴合该项目的实际工作性质（不要套话）。只输出 JSON 数组：[{\"name\":\"…\",\"w\":0.2},…]，不要其他文字。",
    `分区：${z.name}（${z.desc}）\n项目：${p.title}\n目标：${p.desc||"（未填）"}\n可用天数：${days}`));
  if(!Array.isArray(j) || j.length<2) return null;
  const list = j.map(x=>({ name:String(x.name||"").slice(0,12), w:Math.max(.05, Number(x.w)||0) }));
  const sum = list.reduce((s,x)=>s+x.w, 0) || 1;
  list.forEach(x=>x.w = x.w/sum);
  return list;
}
/* 项目创建后：规则版立即上屏，千问版精修替换（用户已开始勾选阶段则不打扰） */
function aiRefineProject(p){
  if(!aiOn()) return;
  aiPhases(zoneById(p.zone), p).then(list=>{
    if(!list) return;
    const fresh = S.projects.find(x=>x.id===p.id);
    if(!fresh || fresh.milestones.some(m=>m.done)) return;
    fresh.milestones = phasesToMilestones(list, today(), fresh.deadline);
    save();
    if(route.project===p.id) render();
    toast("千问已按项目内容重排阶段时间线");
  }).catch(()=>{});
}
async function aiSteps(title, zoneId, dueISO){
  const z = zoneById(zoneId), days = daysBetween(today(), dueISO);
  const j = parseJsonLoose(await llmCall(
    "你是任务执行规划助手。把任务拆成 3-5 个可当场操作的小步，f 为走到该步时占整体进度的比例（递增，最后一步约 0.95），步骤名 4-12 字。只输出 JSON 数组：[{\"name\":\"…\",\"f\":0.2},…]，不要其他文字。",
    `分区：${z.name}\n任务：${title}\n距截止：${days} 天`));
  if(!Array.isArray(j) || j.length<2) return null;
  return j.map(x=>({ name:String(x.name||"").slice(0,16), f:Math.min(.95, Math.max(.05, Number(x.f)||.5)) }));
}
function aiRefineSteps(ruleSteps, title, zoneId, dueISO){
  aiSteps(title, zoneId, dueISO).then(steps=>{
    if(!steps) return;
    const ids = ruleSteps.map(s=>s.id);
    if(S.tasks.some(t=>ids.includes(t.id) && t.done)) return;
    const start = today(), span = Math.max(1, daysBetween(start, dueISO));
    const fresh = steps.map(st=>({ id:uid(), title:`${title} · ${st.name}`, zone:zoneId,
      due:addDays(start, Math.round(st.f*span)), done:false, projectId:null }));
    S.tasks = S.tasks.filter(t=>!ids.includes(t.id));
    fresh.reverse().forEach(t=>S.tasks.unshift(t));
    save(); render();
    toast("千问已重写执行步骤");
  }).catch(()=>{});
}

/* ================================================================
   GitHub 私有 Gist 同步 —— 数据一份，多端共读；Token 只存本机
   ================================================================ */
let _syncTimer = null, _syncState = { txt:"未启用", ok:null, time:null };
function scheduleSync(){
  if(!S.config.sync.on || !S.config.sync.token) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(()=>syncPush(false), 5000);
}
function syncStatus(txt, ok){ _syncState = { txt, ok, time:new Date() }; updateSyncDots(); }
function updateSyncDots(){
  document.querySelectorAll("[data-sync-dot]").forEach(d=>{
    d.className = "dot " + (!S.config.sync.on ? "off" : _syncState.ok===true ? "ok" : _syncState.ok===false ? "err" : "idle");
  });
  document.querySelectorAll("[data-sync-txt]").forEach(t=>{
    t.textContent = _syncState.txt + (_syncState.time ? ` · ${_syncState.time.getHours()}:${pad(_syncState.time.getMinutes())}` : "");
  });
}
async function githubApi(url, opts={}){
  const r = await fetch(url, Object.assign({
    headers:{ Accept:"application/vnd.github+json", Authorization:"Bearer "+S.config.sync.token, "Content-Type":"application/json" },
  }, opts));
  if(!r.ok){
    let msg = "HTTP "+r.status;
    try{ const j = await r.json(); if(j.message) msg += "（"+String(j.message).slice(0,60)+"）"; }catch(e){}
    throw new Error(msg);
  }
  return r.status===204 ? null : r.json();
}
function syncPayload(){
  return { projects:S.projects, tasks:S.tasks, ideas:S.ideas, materials:S.materials,
    meta:{ updatedAt:S.meta.updatedAt } };
}
function adoptRemote(remote){
  ["projects","tasks","ideas","materials"].forEach(k=>{ if(Array.isArray(remote[k])) S[k]=remote[k]; });
  if(remote.meta) S.meta = remote.meta;
  localStorage.setItem(STORE_KEY, JSON.stringify(S)); // 不触发 scheduleSync，避免回环
}
async function ensureGist(){
  if(S.config.sync.gist) return S.config.sync.gist;
  const g = await githubApi("https://api.github.com/gists", { method:"POST", body: JSON.stringify({
    description:"年辽的知识工作台 · 数据（勿手改）", public:false,
    files:{ "workspace.json":{ content: JSON.stringify(syncPayload()) } } }) });
  S.config.sync.gist = g.id;
  localStorage.setItem(STORE_KEY, JSON.stringify(S));
  return g.id;
}
async function remoteData(){
  const g = await githubApi("https://api.github.com/gists/"+S.config.sync.gist);
  const f = g.files && g.files["workspace.json"];
  return f ? JSON.parse(f.content) : {};
}
async function syncPush(force){
  if(!S.config.sync.on || !S.config.sync.token) return;
  syncStatus("同步中…", null);
  try{
    await ensureGist();
    const remote = await remoteData();
    if(!force && remote.meta && remote.meta.updatedAt > S.meta.updatedAt){
      adoptRemote(remote); render();
      syncStatus("已拉取他端较新数据", true); toast("已同步他端的较新数据");
      return;
    }
    await githubApi("https://api.github.com/gists/"+S.config.sync.gist, { method:"PATCH", body: JSON.stringify({
      files:{ "workspace.json":{ content: JSON.stringify(syncPayload()) } } }) });
    syncStatus("已推送", true);
  }catch(e){ syncStatus("同步失败："+e.message, false); }
}
async function syncPull(){
  if(!S.config.sync.on || !S.config.sync.token) { syncStatus("未启用", null); return; }
  if(!S.config.sync.gist){ syncStatus("尚无云端存档，点「立即上传」创建", null); return; }
  syncStatus("读取云端…", null);
  try{
    const remote = await remoteData();
    if(remote.meta && remote.meta.updatedAt > S.meta.updatedAt){
      adoptRemote(remote); render();
      syncStatus("已拉取较新数据", true); toast("已从云端拉取最新书房数据");
    }else syncStatus("本机已是最新", true);
  }catch(e){ syncStatus("拉取失败："+e.message, false); }
}

/* ================================================================
   设置面板
   ================================================================ */
function renderSettings(){
  const c = S.config;
  return `
  <div class="sec-title" style="font-size:1.2rem">同步与 AI <span class="hint">密钥只存本机 · 云端只存书房数据（不含任何密钥）</span></div>

  <div class="card">
    <div class="sec-title">千问智能拆解 <span class="hint">经自建中转；不通自动回退规则模板</span></div>
    <div class="field"><label>启用智能拆解与归类</label>
      <select id="cf-ai-on"><option value="1" ${c.ai.on?"selected":""}>启用</option><option value="0" ${!c.ai.on?"selected":""}>停用（纯规则引擎）</option></select></div>
    <div class="field"><label>中转地址（函数计算 Web 函数的 /chat 完整 URL；留空 = 只用规则）</label>
      <input type="text" id="cf-relay" value="${esc(c.ai.relay)}" placeholder="https://xxxx.cn-hangzhou.fcapp.run/chat"></div>
    <div class="field"><label>模型名（以百炼控制台「模型广场」显示为准）</label>
      <input type="text" id="cf-model" value="${esc(c.ai.model)}"></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn small" data-action="cf-save">保存</button>
      <button class="btn small ghost" data-action="cf-test-ai">测试中转与分类</button>
      <span style="font-size:.82rem;color:var(--brown)">当前：<span id="ai-state">${aiOn()?"智能模式（千问）":"纯规则模式"}</span></span>
    </div>
  </div>

  <div class="card">
    <div class="sec-title">多端同步 · GitHub 私有 Gist <span class="hint">电脑与手机同一份书房</span></div>
    <div class="field"><label>启用同步</label>
      <select id="cf-sync-on"><option value="1" ${c.sync.on?"selected":""}>启用</option><option value="0" ${!c.sync.on?"selected":""}>停用（仅本机）</option></select></div>
    <div class="field"><label>GitHub Token（fine-grained PAT，仅勾 Gist 读写；只存本机浏览器）</label>
      <input type="text" id="cf-token" value="${esc(c.sync.token)}" placeholder="github_pat_…" autocomplete="off"></div>
    <div class="field"><label>Gist ID（留空则首次上传时自动创建私有 Gist）</label>
      <input type="text" id="cf-gist" value="${esc(c.sync.gist)}" placeholder="例如 1a2b3c…" autocomplete="off"></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn small" data-action="cf-save">保存</button>
      <button class="btn small ghost" data-action="sync-pull">拉取云端</button>
      <button class="btn small ghost" data-action="sync-push">立即上传</button>
      <span style="font-size:.82rem;color:var(--brown)"><span class="dot off" data-sync-dot></span> <span data-sync-txt>未启用</span></span>
    </div>
  </div>

  <div class="card">
    <div class="sec-title">数据 <span class="hint">导出可迁移 / 备份</span></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn small ghost" data-action="export-data">导出 JSON 备份</button>
      <button class="btn small ghost" data-action="import-data">导入 JSON</button>
      <button class="btn small wine" data-action="wipe-data">清空全部数据</button>
    </div>
    <input type="file" id="cf-import-file" accept=".json,application/json" style="display:none">
  </div>

  <div class="card" style="font-size:.86rem;color:var(--ink-soft)">
    <div class="sec-title">网页版地址 <span class="hint">部署见仓库 DEPLOY.md</span></div>
    当前正打开于：<code style="background:var(--ivory-2);padding:2px 8px;border-radius:3px;font-size:.8rem">${esc(location.href)}</code><br>
    GitHub Pages 部署后，任何设备浏览器访问 <b>https://你的用户名.github.io/仓库名/</b> 即可；手机端建议「添加到主屏幕」。
  </div>`;
}
function bindSettings(){
  const f = document.getElementById("cf-import-file");
  if(f) f.onchange = () => {
    const file = f.files[0]; if(!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try{
        const data = JSON.parse(rd.result);
        if(!data.projects && !data.tasks) throw new Error("不是工作台导出文件");
        ["projects","tasks","ideas","materials"].forEach(k=>{ if(Array.isArray(data[k])) S[k]=data[k]; });
        save(); render(); toast("导入成功");
      }catch(e){ toast("导入失败："+e.message); }
    };
    rd.readAsText(file);
  };
}
function saveConfigFromForm(){
  S.config.ai.on = document.getElementById("cf-ai-on").value === "1";
  S.config.ai.relay = document.getElementById("cf-relay").value.trim();
  S.config.ai.model = document.getElementById("cf-model").value.trim() || "qwen3.8-flash";
  S.config.sync.on = document.getElementById("cf-sync-on").value === "1";
  S.config.sync.token = document.getElementById("cf-token").value.trim();
  S.config.sync.gist = document.getElementById("cf-gist").value.trim();
  save(); render();
  toast("配置已保存（仅存本机）");
}

/* ---------------- 事件委托 ---------------- */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if(!el) return;
  const a = el.dataset.action, id = el.dataset.id;

  const find = arr => arr.find(x=>x.id===id);

  switch(a){
    case "nav": route = {...route, view:el.dataset.view, project:null}; render(); break;
    case "zone-tab": route.zone = el.dataset.zone; render(); break;
    case "idea-chip": route.ideaFilter = el.dataset.cat; render(); break;

    case "new-project": modalNewProject(el.dataset.zone||route.zone); break;
    case "new-task":    modalNewTask(el.dataset.zone||route.zone); break;
    case "new-idea":    modalNewIdea(); break;
    case "new-material":modalNewMaterial(); break;
    case "close-modal": closeModal(); break;

    case "toggle-task": { const t=find(S.tasks); if(t){t.done=!t.done; save(); render();} break; }
    case "del-task":    { if(confirm("删掉这条任务？")){ S.tasks=S.tasks.filter(x=>x.id!==id); save(); render(); } break; }
    case "del-idea":    { if(confirm("删掉这条灵感？")){ S.ideas=S.ideas.filter(x=>x.id!==id); save(); render(); } break; }
    case "del-mat":     { if(confirm("删掉这份资料？")){ S.materials=S.materials.filter(x=>x.id!==id); save(); render(); } break; }

    case "quick-idea": {
      const ta = document.getElementById("quick-idea");
      const text = ta.value.trim();
      if(!text){ ta.focus(); return; }
      addIdea(text); ta.value=""; render(); break;
    }
    case "open-project": route = {...route, view:"project", project:id}; closeModal(); render(); break;
    case "back-zones": route.view="zones"; render(); break;
    case "toggle-ms": {
      const p = S.projects.find(x=>x.id===el.dataset.pid);
      const m = p && p.milestones.find(x=>x.id===id);
      if(m){ m.done=!m.done; save(); render(); }
      break;
    }
    case "del-project": {
      if(confirm("删除该项目及其阶段拆解？任务不会连带删除。")){
        S.projects = S.projects.filter(x=>x.id!==id);
        S.tasks.forEach(t=>{ if(t.projectId===id) t.projectId=null; });
        save(); route.view="zones"; render();
      }
      break;
    }
    case "gen-today-task": {
      const p = S.projects.find(x=>x.id===id);
      const cur = p.milestones.find(m=>!m.done);
      if(!cur){ toast("所有阶段已完成 🎉"); break; }
      S.tasks.unshift({ id:uid(), title:`${p.title} · ${cur.name}`, zone:p.zone,
        due: cur.end, done:false, projectId:p.id });
      save(); toast(`已为「${cur.name}」建立任务，截止 ${fmtCN(cur.end)}`); render();
      break;
    }
    case "goto-home": route.view="home"; render(); break;
    case "goto-ideas": route.view="ideas"; render(); break;
    case "goto-materials": route.view="materials"; render(); break;

    case "cf-save": saveConfigFromForm(); break;
    case "cf-test-ai": {
      if(!S.config.ai.relay.trim()){ toast("先填中转地址并保存"); break; }
      const st = document.getElementById("ai-state");
      if(st) st.textContent = "测试中…";
      S.config.ai.relay = document.getElementById("cf-relay").value.trim();
      S.config.ai.model = document.getElementById("cf-model").value.trim() || S.config.ai.model;
      S.config.ai.on = true;
      (async()=>{
        try{
          const a = await aiClassify("脂质体包封率偏低，考虑用注入法优化处方");
          if(st) st.textContent = a ? `已连通 · 千问分类：${a.cat}` : "有响应但返回解析失败";
          toast(a ? "中转可用，智能模式已就绪" : "请检查模型名与返回格式");
        }catch(e){
          if(st) st.textContent = "不通：" + e.message;
          toast("中转不可达 —— 工作台已自动保持规则引擎，不影响使用");
        }
      })();
      break;
    }
    case "sync-pull": saveConfigFromForm(); syncPull(); break;
    case "sync-push": saveConfigFromForm(); syncPush(true); break;
    case "export-data": {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type:"application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `年辽的知识工作台-${today()}.json`;
      a.click(); URL.revokeObjectURL(a.href); toast("已导出，可作备份");
      break;
    }
    case "import-data": document.getElementById("cf-import-file").click(); break;
    case "wipe-data": {
      if(confirm("清空本机全部数据？若云端 Gist 仍有存档，下次拉取会再回来。要彻底清，请同时删除该 Gist。")){
        sessionStorage.setItem("nianliao-no-seed", "1");
        localStorage.removeItem(STORE_KEY); location.reload();
      }
      break;
    }
  }
});

/* 搜索：顶栏 + 检索页输入框 */
function goSearch(q){ route = {...route, view:"search", q}; render();
  const i=document.getElementById("search-input"); if(i){ i.focus(); } }
document.addEventListener("keydown", e => {
  if(e.key==="Enter"){
    const qs = e.target.closest("#quick-search");
    const si = e.target.closest("#search-input");
    if(qs && qs.value.trim()) goSearch(qs.value.trim());
    else if(si){ route.q = si.value; render(); const n=document.getElementById("search-input"); n.focus(); n.setSelectionRange(n.value.length,n.value.length); }
  }
  if(e.key==="Escape") closeModal();
});

/* toast 提示 */
function toast(msg){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div"); t.id="toast";
    t.style.cssText = "position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:#1e3529;color:#fffdf6;padding:9px 20px;border-radius:6px;font-size:.84rem;letter-spacing:.06em;z-index:99;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .3s";
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity=1;
  clearTimeout(t._h); t._h = setTimeout(()=>{t.style.opacity=0;}, 2400);
}

/* ---------------- 首次演示数据 ---------------- */
function seed(){
  const t = today();
  const mkProj = (title, zoneId, day, desc) => {
    const z = zoneById(zoneId), dead = addDays(t, day);
    return { id:uid(), title, zone:zoneId, desc, deadline:dead, createdAt:t, status:"active",
      milestones:buildMilestones(z, t, dead) };
  };
  const p1 = mkProj("缓释微球处方优化课题","research",30,"完成正交试验，确定处方，写出初稿");
  const p2 = mkProj("AI×药学 科普账号首期视频","video",12,"做出第一条 90 秒成片并发布");
  const p3 = mkProj("随笔集《称量时光》七月辑","diary",45,"收齐 12 篇，定稿排版");
  S = {
    projects:[p1,p2,p3],
    tasks:[
      { id:uid(), title:"精读脂质体综述 2 篇并做批注", zone:"research", due:t, done:false, projectId:p1.id },
      { id:uid(), title:"首期视频脚本二稿：开头 15 秒钩子", zone:"video", due:t, done:false, projectId:p2.id },
      { id:uid(), title:"日记 300 字：实验室的 Tuesday", zone:"diary", due:t, done:false, projectId:p3.id },
      { id:uid(), title:"整理微球制备实验记录", zone:"research", due:addDays(t,-1), done:false, projectId:null },
      { id:uid(), title:"跑通一个 RAG 检索 demo 笔记", zone:"aistudy", due:addDays(t,3), done:false, projectId:null },
      { id:uid(), title:"早间背诵：药剂学名词 20 个", zone:"research", due:t, done:true, projectId:null },
    ],
    ideas:[
      { id:uid(), text:"包封率测定或许能用 HPLC 外标法替代离心法，省时间", cat:"药剂学", tags:["包封","hplc","离心"], date:t },
      { id:uid(), text:"AI 生成脚本前先固定分镜表，再喂提示词，输出稳定得多", cat:"视频创作", tags:["分镜","脚本","提示词"], date:addDays(t,-1) },
      { id:uid(), text:"实验失败也是一种数据，写进日记里比结论更耐看", cat:"写作", tags:["日记"], date:addDays(t,-2) },
      { id:uid(), text:"大模型的检索增强（RAG）和文献综述的思路是同构的", cat:"AI与自学", tags:["rag","大模型","文献"], date:addDays(t,-2) },
    ],
    materials:[
      { id:uid(), title:"《缓释制剂研究进展》综述", type:"文献", zone:"research", note:"关注 PLGA 降解曲线一节", tags:["缓释","文献"], date:t },
      { id:uid(), title:"吴恩达 Python 入门 · 第 1-4 周", type:"课程", zone:"aistudy", note:"先过循环与函数", tags:["python"], date:addDays(t,-3) },
      { id:uid(), title:"科普短视频分镜模板 v2", type:"模板", zone:"video", note:"钩子-冲突-演示-收束 四段式", tags:["分镜","短视频"], date:addDays(t,-5) },
    ],
  };
  save();
}

/* ---------------- 启动 ---------------- */
load();
render();
/* 开了同步：开机拉一次；标签页回到前台再拉一次（多端接力） */
if(S.config.sync.on && S.config.sync.token){ setTimeout(()=>syncPull(), 600); }
document.addEventListener("visibilitychange", ()=>{
  if(!document.hidden && S.config.sync.on && S.config.sync.token && S.config.sync.gist) syncPull();
});
