# 声音定制测试平台

用于体验文字对话、语音回复，以及通过文字描述创建并复用自定义声线的独立 Demo。保留 Omi 风格的聊天界面，不依赖 Omi 官方账号或 Firebase 登录。

本仓库仅提供源码，不提供在线体验入口、作者的 API Key、业务空间 ID 或部署标识。克隆和部署本项目不会获得作者的模型额度，使用者需自行配置模型服务和承担调用费用。

## 功能

- 文字聊天与流式文本回复。
- 浏览器麦克风输入（SpeechRecognition，推荐 Chrome）。
- Qwen TTS 语音回复、重播与停止播放。
- 声音描述 → 生成试听 → 用户确认 → 固定使用自定义音色。
- 人格描述、自动播放偏好、多会话记录。
- 聊天记录、偏好和音色 ID 保存在各自浏览器，不跨设备同步。
- 服务端密钥隔离、请求长度限制和 D1 每日调用上限。

自然语言音色指令使用规则识别，支持“可以换成温柔的男声吗”等表达，并非通用语义分类。也可直接打开“我的声音”面板创建声线。

## 当前模型链路

| 环节 | 默认配置 |
| --- | --- |
| 对话文本 | `qwen3.5-omni-plus-realtime` |
| 语音输出 | `qwen-audio-3.0-tts-plus` |
| 声音设计 API 标识 | `voice-enrollment` |
| 自定义音色绑定模型 | `qwen-audio-3.0-tts-plus` |

声音设计与后续合成必须使用匹配的目标模型。项目已实测上述 Plus 的设计、试听及自定义音色合成；可用性取决于使用者的地域、模型权限与额度。API 标识不等同于控制台显示的权限名称。

## 本地运行

需要 Node.js 22.13+（运行 TypeScript 测试建议 22.18+）和 npm。后端使用 Cloudflare Workers API，不能作为普通 Node.js Next.js 服务直接部署。

```sh
npm run install:ci
```

在项目根目录自行创建 `.dev.vars`（已被 Git 忽略），按自己的账户填写：

```dotenv
DASHSCOPE_API_KEY=填写自己的密钥
DASHSCOPE_WORKSPACE_ID=填写自己的北京业务空间ID
QWEN_REALTIME_MODEL=qwen3.5-omni-plus-realtime
QWEN_TTS_MODEL=qwen-audio-3.0-tts-plus
QWEN_TTS_VOICE=longanlingxin
QWEN_VOICE_DESIGN_MODEL=voice-enrollment
QWEN_VOICE_DESIGN_TARGET_MODEL=qwen-audio-3.0-tts-plus
DEMO_DAILY_LIMIT=600
```

业务空间支持 `llm-…` 或 `ws-…` 格式，请填写 ID 而非完整域名。当前代码使用北京地域，其他地域需同时调整接口域名与匹配密钥。

初始化本地限流数据库：

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_open_harry_osborn.sql
npm run dev
```

打开终端打印的本机地址。数据库迁移只需在新的本地数据库上执行一次；没有密钥和有效业务空间时无法调用模型。

## 部署自己的实例

项目基于 React、Vinext、Cloudflare Workers 与 D1，可通过 Sites 工作流发布。

1. 为自己创建新的 Sites 项目，并将获得的新项目 ID 写入 `.openai/hosting.json` 的 `project_id`，保留 `d1: "DB"`。
2. 在托管平台配置上述环境变量，`DASHSCOPE_API_KEY` 必须标记为 Secret。
3. 构建、保存版本并发布；由 Sites 工作流应用 D1 迁移。
4. 用自己账户测试文字、默认音色、声音设计、确认后合成。

仓库中的 hosting 清单刻意不包含任何既有项目 ID；GitHub Pages 只能托管静态资源，不能独立运行本项目的服务端密钥代理。

公开实例会消耗部署者的模型额度。内置日上限用于 Demo，不能替代生产环境的用户鉴权、计费与滥用防护。不要把密钥放进 `NEXT_PUBLIC_*`、客户端代码或提交历史。

## 检查

```sh
npx tsc --noEmit
node --experimental-strip-types --test lib/voice.test.ts lib/tts-audio.test.ts
npm run build
```

第三方组件与工具的原有许可证保留于对应文件目录。本项目是独立测试 Demo，不包含 Omi 官方云端记忆、账户历史或完整集成能力。
