/* ================================================================
   年辽的知识工作台 · 千问中转函数（阿里云函数计算 FC · Web 函数）
   作用：浏览器 → 本函数 → DashScope OpenAI 兼容接口
   浏览器直连 DashScope 会被 CORS 拦截，所以必须有这一层；
   API Key 存函数的环境变量，不进浏览器。
   部署：控制台建「Web 函数」，运行时 Node.js 20，代码传本目录，
        环境变量 DASHSCOPE_API_KEY=百炼的 sk-xxx，监听端口 9000。
   ================================================================ */
"use strict";

const http = require("http");

const UPSTREAM = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const PORT = process.env.FC_SERVER_PORT || process.env.PORT || 9000;

function cors(res){
  res.setHeader("Access-Control-Allow-Origin", "*");           // 个人工作台；想收紧就改成你的 Pages 域名
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function json(res, code, obj){
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }

  /* 健康检查：设置页「测试中转」之外，浏览器直接打开可确认函数活着 */
  if (req.method === "GET" && req.url.startsWith("/")) {
    return json(res, 200, { ok: true, service: "nianliao-qwen-relay", hasKey: !!process.env.DASHSCOPE_API_KEY });
  }

  if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
  if (!process.env.DASHSCOPE_API_KEY) return json(res, 500, { error: "函数未配置 DASHSCOPE_API_KEY 环境变量" });

  /* 收请求体（限 128KB，够用且防滥用） */
  let raw = "", size = 0;
  await new Promise(resolve => {
    req.on("data", c => { size += c.length; if (size < 131072) raw += c; });
    req.on("end", resolve);
  });

  let body;
  try { body = JSON.parse(raw || "{}"); }
  catch (e) { return json(res, 400, { error: "请求体不是 JSON" }); }

  const payload = {
    model: body.model || "qwen-flash",
    messages: Array.isArray(body.messages) ? body.messages : [],
    temperature: body.temperature ?? 0.3,
    max_tokens: body.max_tokens ?? 600,
  };
  if (!payload.messages.length) return json(res, 400, { error: "messages 为空" });

  try {
    const r = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.DASHSCOPE_API_KEY },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });
    const j = await r.json();
    /* 原样透传 OpenAI 兼容结构；出错时把 DashScope 的 message 一起带回，方便排障 */
    if (!r.ok) return json(res, r.status, { error: "dashscope " + r.status + "：" + (j.message || j.error?.message || JSON.stringify(j).slice(0,200)) });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(j));
  } catch (e) {
    json(res, 502, { error: "上游请求失败：" + e.message });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log("nianliao-qwen-relay listening on " + PORT));
