# my-pocket-guide-vibecoding
基于大模型智能体与数字人的个性化AI旅行地陪
# 我的口袋导游 MVP

这是根据 V1 产品需求搭建的可演示 MVP，包含：

- 原生微信小程序前端
- FastAPI 后端
- SQLite 数据存储
- 本地模拟模式
- 创建行程、需求确认、生成进度、时间轴、地图、动态调整和撤销主链路

## 目录

```text
pocket-guide-mvp/
├── miniprogram/          微信小程序
├── backend/              FastAPI 服务
├── project.config.json   微信开发者工具项目配置
└── README.md
```

## 直接体验小程序

1. 打开微信开发者工具。
2. 导入本目录 `pocket-guide-mvp`。
3. 使用测试号或自己的 AppID。
4. 编译后从首页点击“创建新行程”。

默认 `miniprogram/utils/api.js` 中 `useMock = true`，不启动后端也能走通完整演示。

## 启动后端

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

打开 `http://127.0.0.1:8000/docs` 查看接口文档。

联调时修改 `miniprogram/utils/api.js`：

```js
const useMock = false
const baseUrl = 'http://127.0.0.1:8000/api/v1'
```

真机环境需要将地址替换为 HTTPS 合法域名。

## 主演示脚本

1. 以游客身份进入首页。
2. 创建“北京四日游”：2 人、预算 3000 元、文化和美食、适中节奏。
3. 确认需求摘要并生成行程。
4. 查看时间轴和地图。
5. 输入“走得有点累，后面少走一点”。
6. 查看减少步行、替换节点和预算变化。
7. 确认应用新方案，或撤销恢复上一版本。

## 当前实现边界

- 地图使用原生 `map` 组件和演示坐标，真实地点检索与路线计算预留后端接口。
- 语音、ASR、TTS 和 GMTalker 目前使用交互占位与降级状态。
- 行程规划器为确定性演示规划器，便于比赛现场稳定演示；可在 `backend/app/planner.py` 中替换为 LangGraph 工作流。
- 未实现支付、酒店/票务交易、多人协作、社区和后台持续定位。
