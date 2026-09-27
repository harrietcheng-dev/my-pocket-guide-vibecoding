# 光墩墩说话组件

将一段文字转成语音，播放过程中每 150ms 随机切换五种口型，结束后恢复待机。适用于原生微信小程序；无需改动组件即可插入首页、对话页或在途陪伴页。不包含页面业务、聊天模型、录音或语音识别。

## 给页面同学：只需接入一次

复制整个 `guangdundun-avatar` 文件夹（包括 assets 和 tts.js）到小程序 `components/`。

页面 `index.json` 合并注册：

```json
{
  "usingComponents": {
    "guangdundun-avatar": "/components/guangdundun-avatar/index"
  }
}
```

页面 `index.wxml` 在合适位置插入：

```xml
<guangdundun-avatar
  id="guideAvatar"
  size="300"
  bind:speecherror="onSpeechError"
/>
```

页面 JS：在 onReady 之后或用户点击时调用，不要在 onLoad 中调用。

```js
Page({
  // 可以来自首页欢迎词、聊天接口回复或景点介绍，组件不关心文字来源。
  async readText(text) {
    const avatar = this.selectComponent('#guideAvatar')
    if (!avatar) return
    const result = await avatar.startSpeak(text)
    // Promise 在播放结束、被打断或失败时 resolve，不会抛出未处理的 rejection。
    // result.status: ended / stopped / superseded / error
    return result
  },
  stopReading() {
    const avatar = this.selectComponent('#guideAvatar')
    if (avatar) avatar.stopSpeak()
  },
  onSpeechError(event) {
    wx.showToast({ title: event.detail.message, icon: 'none' })
  }
})
```

拿到完整回复后调用 `this.readText(reply.text)`。流式回复请先拼接到完整句子或完整段落再调用；每次 startSpeak 都会立即打断上一段，不会排队。每段限制 1～500 个 JS 字符，长文本由页面分段并等待上一段返回 ended 再播下一段。停止循环时也要由页面取消后续分段任务。

组件自动响应页面 hide、组件 detached，停止声音并回收定时器、音频实例和本地临时音频；页面重新显示后不自动续播。折叠组件但不卸载时，应主动 stopSpeak。不同实例各自管理播放，同一页面有多个实例时由页面决定是否同时播放。

## 给负责语音服务的同学：二选一

### A. 使用随附的微信云函数

1. 将交付包中的 `cloudfunctions/guangdundun-tts` 放到项目的云函数目录。在微信开发者工具配置 cloudfunctionRoot，上传部署 `guangdundun-tts`，运行时使用 Node.js 18 或更高版本，无第三方依赖。
2. 云函数环境变量配置 `AZURE_SPEECH_KEY` 和 `AZURE_SPEECH_REGION`，对应 Azure Speech 资源的密钥和区域。示例使用中文女声 `zh-CN-XiaoxiaoNeural`，可在云端修改。配置函数超时至少 25 秒。
3. 小程序 App.onLaunch 初始化 `wx.cloud.init({ env: '你们的云环境 ID' })`。组件默认调用此云函数。
4. 云函数请求 `{ text: '要朗读的文字' }`，返回 `{ audioBase64: '...', format: 'mp3' }`；失败返回 `{ error: '可展示的错误说明' }`。组件将 MP3 写入用户临时文件并在结束后删除。

这是一份真实 TTS 接入实现，不是固定录音。需要自行开通并配置 Speech 资源和微信云环境，可能产生服务费用。本次没有部署云函数，也没有调用付费服务。上线前由后端增加按用户的调用频率及额度限制。密钥只放云端，不能写进小程序。

### B. 同伴已有 TTS 接口（推荐复用已有服务）

无需 Azure 或随附云函数，在页面 onReady 给实例注入适配函数：

```js
onReady() {
  this.selectComponent('#guideAvatar').setTtsProvider(text => {
    return new Promise((resolve, reject) => {
      wx.request({
        url: 'https://你们的域名/api/tts',
        method: 'POST',
        data: { text },
        // 如接口需要登录，在这里附带你们自己的鉴权 header。
        success: ({ statusCode, data }) => {
          if (statusCode === 200 && data.audioUrl) resolve(data)
          else reject(new Error('语音合成失败'))
        },
        fail: () => reject(new Error('无法连接语音服务'))
      })
    })
  })
}
```

约定请求 `{ text: string }`，成功返回 `{ audioUrl: 'https://.../speech.mp3' }`。URL 必须可直接播放，不能依赖自定义请求头；私有音频请返回有效期足够完成播放的签名 URL。使用微信支持的 MP3 编码，并配置接口及音频域名的微信合法域名、HTTPS 和真机访问。也可返回上面的 base64 MP3 格式。组件不负责登录或聊天服务。

未配置服务时会明确报错，不会把固定录音伪装成输入文字的朗读。要测试 mock，只需注入 `() => Promise.resolve({ audioUrl: '你们可用的 HTTPS 测试 MP3 地址' })`，它仅用于验证播放及动画，不代表真实文字合成。

## 属性与事件

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| size | 300 | 头像宽高，单位 rpx |
| showStatus | true | 是否显示准备中、说话中等状态 |
| ttsFunction | guangdundun-tts | 默认调用的云函数名称 |
| imageBase | 空 | 独立六帧素材目录；空时使用自带合图 |

| 事件 | detail | 用途 |
| --- | --- | --- |
| statechange | `{ status }` | idle / loading / speaking / error |
| speechstart | 空 | 音频开始播放 |
| speechend | `{ reason: 'ended' }` | 自然播放结束 |
| speechstop | `{ reason }` | stopped 或 superseded |
| speecherror | `{ message }` | 参数、合成、超时或播放失败 |

## 素材与实现边界

自带素材为用户提供的原始六表情图（1381×1139，约 1.32 MiB）。通过 WXML/WXSS 显示窗口排除文字标签，不重新绘制角色。第六格“温柔微笑”作为待机，其余五格作为口型。图片背景是白色，因此组件使用白色底。

**issue 中六张小于等于 300×300 的独立 PNG 尚未提供。** 当前合图便于直接交付，但应检查现有主包加上此图后是否超出限制。美术同学后续交付同尺寸、同角色位置的 `idle.png`、`mouth_1.png`～`mouth_5.png` 后，将 `image-base="/images/avatar"` 传入即可；mouth_1～5 依次是大笑、微笑张口、O 型嘴、露舌、露齿。无需修改 JS，删除不再使用的合图可缩小包体。

动画仅在音频实际 onPlay 后开始，等待音频时停止切帧；不是音素级唇形同步。旧请求会被逻辑取消，即使 TTS 晚返回也不播放；已发送的云函数调用无法撤回，仍可能消耗服务额度。

## 验证

自动逻辑测试：项目根目录执行 `node --test tests/guangdundun-avatar.test.js`。

配置 TTS 后还需在微信开发者工具和真机验收：

1. 朗读两段不同中文，确认声音对应文字；声音开始时才切口型，结束时复位。
2. 连续调用 A/B，确认只播最新请求；播放中 stopSpeak 后立即停止。
3. 加载中、播放中切换 tab 或返回，确认无后台播放；回来后可重新朗读。
4. 网络失败或密钥错误时触发 speecherror，文字业务仍可正常展示。
5. 检查合图裁切、不同 size、六张替换素材、包体积及真机静音/音量行为。

本次交付未修改、注册或接入任何现有页面。自动测试使用微信 API 替身，不能替代真机播放测试。
