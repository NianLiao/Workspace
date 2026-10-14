# 部署手册 · 把工作台变成全网可访问的网页

目标形态（全部免费或近乎免费）：

```
手机/电脑浏览器
   └─ GitHub Pages 打开工作台（静态页面）
        ├─ 数据 ⇄ GitHub 私有 Gist（多端同一份书房）
        └─ 智能拆解 → 阿里云函数计算中转 → 百炼千问
                     （API Key 只存在函数里，不进浏览器）
```

不设任何配置时，工作台照常以「规则引擎 + 本机数据」运行，以下步骤都可**随时再做**。

---

## 第一步 · 拿千问的 Key（约 5 分钟）

1. 登录 [阿里云百炼控制台](https://bailian.console.aliyun.com/)，首次进入按提示**开通模型服务**（新用户各模型赠送百万级免费 token，你这个用法几乎不会花钱）。
2. 右上角头像 → **API-KEY** → 创建，记下 `sk-…`（只显示一次）。
3. 「模型广场」里记下你要用的模型准确名称（文档示例：qwen3.8-flash / qwen-flash / qwen-plus 均可），稍后填入工作台设置。
4. 计费参考 [官方价格表](https://help.aliyun.com/zh/model-studio/model-pricing)：flash 档约 ¥0.15~0.5/百万 token；按每天 20 次调用估算，**月成本≈几毛钱，且大概率全程在免费额度内**。

## 第二步 · 部署中转函数（约 10 分钟）

浏览器不能直连 DashScope（[无 CORS](https://github.com/codexu/note-gen/issues/915)），需一层中转：

1. [函数计算 FC 控制台](https://fcnext.console.aliyun.com/)，开通服务（新用户有[每月 15 万 CU 免费试用额度](https://help.aliyun.com/zh/functioncompute/trial-quota-1)，超出后按量计费，个人用量约每月几毛）。
2. 创建函数 → 选 **Web 函数** → 运行环境 **Node.js 20** → 地区选杭州/上海均可。
3. 代码上传：把本仓库 `server/` 目录打包成 zip 上传（就 `index.js` + `package.json` 两个文件）。
4. 启动配置：命令 `node index.js`，**监听端口 9000**。
5. 环境变量：添加 `DASHSCOPE_API_KEY` = 第一步的 `sk-…`，部署。
6. 触发器：HTTP 触发器，认证方式选**无需认证**，复制它的访问地址（形如 `https://xxxx.cn-hangzhou.fcapp.run/`）。
7. 浏览器直接打开这个地址，看到 `{"ok":true,...,"hasKey":true}` 即部署成功。

> ⚠️ 诚实提醒：[官方已声明 fcapp.run 默认域名禁止用于生产、可能被回收](https://help.aliyun.com/zh/functioncompute/the-default-public-network-domain-nameof-function-compute-is-not-allowed-in-the-production-environment)。你这是个人自用工具，风险可接受——域名若失效，工作台会**自动退回规则引擎**（拆解归类照常，只是不再"聪明"），把失效地址换掉即可。追求长期稳定就买域名+备案绑自定义域名（阿里云流程约 1-2 周），或改天换任何支持 CORS 的中转，设置页的地址栏本来就是通用的。

## 第三步 · GitHub Pages 变成网页（约 5 分钟）

1. GitHub 新建仓库，名字随意（例：`nianliao`），**不要**勾选 README/.gitignore（要上传已有文件夹）。
2. 仓库页 Add file → **Upload files**，把本文件夹全部内容（含 `index.html`、`css/`、`js/`、`server/`、`.nojekyll`、`README.md`、`DEPLOY.md`）拖进去，提交到 main 分支。
   （会 git 的话 `git push` 更省事，以后我改完你也可以直接推。）
3. **Settings → Pages → Source** 选 `Deploy from a branch`，分支 `main / (root)`，Save。
4. 约一分钟后访问 `https://你的用户名.github.io/nianliao/` —— 这就是你的工作台网址。
5. 手机浏览器打开它 → 菜单选「**添加到主屏幕**」，获得 App 般体验。
6. 大陆网络提示：GitHub Pages 多数时段可直连（移动网络通常比家用宽带稳）；偶尔抽风时本地那份 `index.html` 依旧可用，数据通过下一步的 Gist 保持一致。

## 第四步 · 多端同步（约 3 分钟）

1. GitHub 头像 → Settings → **Developer settings → Fine-grained tokens** → Generate new token：
   - Expiration 自选（建议 90 天，到期重新生成即可）；
   - 权限只勾 **Contents: Read&write** 之外的 **Gists: Read and write**（越窄越安全）。
2. 打开工作台的「设置」页 → 同步卡片：粘贴 Token → 启用 → 点「**立即上传**」。
   首次会自动创建一个名为「年辽的知识工作台 · 数据（勿手改）」的**私有 Gist**，之后同步全自动：改动 5 秒后上传，打开页面/切回标签页时拉取，较新的一方生效。
3. 手机打开 Pages 网址 → 设置页里粘贴同一个 Token → 启用 → 「拉取云端」。此后两端同一份书房。
4. Token 只存在各设备浏览器本机；Gist 里没有密钥，只有书房数据本身。

## 第五步 · 接通智能（约 1 分钟）

设置页 → AI 卡片 → 中转地址填第二步的 `https://xxxx.fcapp.run/`（末尾带不带 `/chat` 都行）→ 模型名填第一步记下的 → 「保存」→「**测试中转与分类**」。绿了之后：新建项目会先按模板秒出时间线，千问随即**按你的项目实际内容重排阶段**；灵感归档后会异步精修分类。

---

## 常见问题

- **同步显示失败？** 看是否 Token 过期或无 Gist 权限；大陆偶发访问 api.github.com 超时，重试即可，本机数据不受影响。
- **两端同时改了同一块内容？** v1 策略为"较新保存者整体覆盖"（时间戳比对），单人使用几乎不会触发；需要字段级合并再说。
- **想彻底备份？** 设置页「导出 JSON」，文件就是你的书房全部家当，可随时导入。
- **Gist 怎么换/删？** 你的 Gists 页（github.com/{用户名}?tab=gists）里可见，删掉后「立即上传」会重建。
- **费用总结：** Pages + Gist 全免费；FC 免费额度内 ≈0，超出约每月几毛；千问 flash 档免费额度内 ≈0，超出约每月几毛。整套 ≈ **一顿食堂加餐**。
