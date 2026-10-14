/* 无头回归测试：node test/run-tests.js */
const vm = require("vm");
const fs = require("fs");
const path = require("path");

function mkEl(){ return { innerHTML:"", value:"", textContent:"", files:[], className:"", title:"",
  style:{cssText:""}, classList:{add(){},remove(){}}, focus(){}, click(){}, setSelectionRange(){},
  onchange:null, onclick:null }; }
const els = {};

const ctx = {
  console, Date, Math, JSON, String, Number, Array, Object, RegExp, Error, Promise,
  setTimeout, clearTimeout, URL, Blob, AbortController,
  localStorage:{ _s:{}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=v; } },
  sessionStorage:{ _s:{}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=v; } },
  document:{ addEventListener(){}, hidden:false,
    getElementById:id => (els[id]=els[id]||mkEl()),
    querySelectorAll:()=>[], createElement:()=>mkEl(), body:mkEl() },
  location:{ href:"file:///test" },
  window:{ scrollTo(){} }, alert:()=>{}, confirm:()=>true,
};
ctx.fetch = async (url) => { throw new Error("桩：断网"); };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8"), ctx);
const ev = code => vm.runInContext(code, ctx);

(async () => {
  let pass = 0, fail = 0;
  const T = (name, ok) => { console.log((ok ? "✔" : "✘ 失败: ") + name); ok ? pass++ : fail++; };

  // ① 全部视图渲染（含新设置页 + 项目详情）
  ev(`["home","zones","ideas","materials","search","settings"].forEach(v=>{route.view=v; render();});
      route.view="project"; route.project=S.projects[0].id; render();`);
  T("全视图渲染含设置页无报错", true);

  // ② 纯规则模式下 addIdea 不触网
  const ideaCat = ev(`addIdea("测试一条随想"); S.ideas[0].cat`);
  const aiOnFalse = ev(`(S.config.ai.relay="", aiOn())`);
  T(`规则归档(${ideaCat})且未触网 aiOn=${aiOnFalse}`, aiOnFalse === false);

  // ③ parseJsonLoose 容错（围栏 / 包裹废话）
  T("解析围栏数组", ev('Array.isArray(parseJsonLoose("```json\\n[{\\"name\\":\\"A\\",\\"w\\":1}]\\n```"))'));
  T("解析包裹文本", !!ev('parseJsonLoose("废话 {\\"cat\\":\\"药剂学\\",\\"tags\\":[]} 废话")'));

  // ④ 中转不可达 → 规则版阶段不被破坏
  ev(`S.config.ai={on:true, relay:"https://bad.invalid/chat", model:"qwen3.8-flash"};
      window_before = JSON.stringify(S.projects[0].milestones);
      aiRefineProject(S.projects[0]);`);
  await new Promise(r => setTimeout(r, 350));
  T("断网回退·阶段完好", ev("JSON.stringify(S.projects[0].milestones)") === ev("window_before"));

  // ⑤⑥ 千问成功路径
  ctx.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (url === "https://relay.test/chat") {
      const content = body.messages[0].content.includes("灵感归类")
        ? JSON.stringify({ cat:"药剂学", tags:["脂质体","处方"] })
        : '[{"name":"处方前研究","w":0.25},{"name":"中试放大","w":0.4},{"name":"注册资料","w":0.35}]';
      return { ok:true, json: async () => ({ choices:[{ message:{ content } }] }) };
    }
    throw new Error("unexpected " + url);
  };
  ev('S.config.ai.relay = "https://relay.test/chat";');
  const aligned = await ev(`(async () => {
    const p = S.projects.find(x => x.status === "active");
    const list = await aiPhases(zoneById(p.zone), p);
    const ms = phasesToMilestones(list, today(), p.deadline);
    return ms.length === 3 && ms[2].name === "注册资料" && ms[0].start === today() && ms[2].end === p.deadline;
  })()`);
  T("千问3阶段·首尾对齐", aligned);
  const cls = await ev('aiClassify("脂质体处方优化")');
  T(`千问分类(${cls.cat}/${cls.tags.join(",")})`, cls.cat === "药剂学");

  // ⑦⑧ GitHub Gist 同步
  let gistContent = "";
  ctx.fetch = async (url, opts) => {
    opts = opts || {};
    if (url === "https://api.github.com/gists") return { ok:true, json: async () => ({ id:"gist999" }) };
    if (url === "https://api.github.com/gists/gist999" && opts.method === "PATCH") {
      gistContent = JSON.parse(opts.body).files["workspace.json"].content;
      return { ok:true, json: async () => ({}) };
    }
    if (url === "https://api.github.com/gists/gist999")
      return { ok:true, json: async () => ({ files:{ "workspace.json":{ content: gistContent || "{}" } } }) };
    throw new Error("unhandled " + url);
  };
  ev('S.config.sync = { on:true, token:"ghp_secret", gist:"" };');
  await ev("syncPush(true)");
  T("自动创建私有 Gist", ev("S.config.sync.gist") === "gist999");
  T("书房数据已推送", JSON.parse(gistContent).tasks.length > 0);
  T("云端不含任何密钥", !/ghp_secret|token|api.?key/i.test(gistContent));
  const remote = JSON.parse(gistContent);
  remote.tasks.push({ id:"x1", title:"来自手机的任务", zone:"diary", due:ev("today()"), done:false, projectId:null });
  remote.meta.updatedAt = Date.now() + 10000;
  gistContent = JSON.stringify(remote);
  await ev("syncPush(false)");
  T("他端较新数据被拉回", ev('S.tasks.some(t => t.title === "来自手机的任务")'));
  T("本机 Token 未被云端覆盖", ev("S.config.sync.token") === "ghp_secret");

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("测试异常:", e); process.exit(1); });
