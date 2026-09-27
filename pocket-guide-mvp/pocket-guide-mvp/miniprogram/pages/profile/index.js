Page({
  data: {
    items: [
      { title: '微信登录', desc: '游客模式可使用全部 P0 功能' },
      { title: '旅行偏好', desc: '长期记忆将在 P1 阶段启用' },
      { title: '权限与隐私', desc: '位置仅用于当前会话，原始语音不保存' },
      { title: '意见反馈', desc: '帮助我们改进行程与地点信息' },
      { title: '关于与开源许可', desc: '比赛与教学原型' }
    ]
  },
  clearDemo() {
    wx.showModal({
      title: '清除演示数据',
      content: '这会删除本机生成的模拟行程。',
      success: ({ confirm }) => {
        if (!confirm) return
        wx.removeStorageSync('pocketGuideTrips')
        wx.removeStorageSync('currentTripId')
        wx.showToast({ title: '已清除' })
      }
    })
  }
})
