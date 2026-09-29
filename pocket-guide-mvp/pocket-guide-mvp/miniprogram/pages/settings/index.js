const api = require('../../utils/api')
const store = require('../../utils/profile-store')
const runtime = require('../../config/runtime')

const HELP_ITEMS = [
  {
    key: 'help',
    title: '使用帮助',
    body: '1. 在首页点击「创建新行程」，填写目的地、日期和偏好。\n2. 确认需求摘要后生成行程，可以查看时间轴与地图。\n3. 出发后在「在途陪伴」页签到，查看景点讲解与周边服务。\n4. 行程中可以直接说「走累了」，系统会给出只调整后续节点的方案。'
  },
  {
    key: 'faq',
    title: '常见问题',
    body: 'Q：地图上的地点和实际位置有偏差？\nA：演示版本使用示例坐标，接入正式地图服务后会按真实位置刷新。\n\nQ：语音讲解没有声音？\nA：语音服务需要在正式 AppID 下部署，未配置时页面会保留完整文字讲解。\n\nQ：我的数据存在哪里？\nA：行程保存在服务端，偏好、收藏和笔记保存在本机。'
  }
]

const LEGAL_ITEMS = [
  {
    key: 'agreement',
    title: '用户协议',
    body: '本应用为演示版本，用于展示行程规划与在途陪伴功能。\n使用本应用即表示你同意：不将生成内容用于商业用途；行程与地点信息仅供参考，出行前请以官方发布的信息为准。'
  },
  {
    key: 'privacy',
    title: '隐私政策',
    body: '我们只在你主动使用相关功能时申请权限：\n· 定位：用于展示附近服务与地图定位，仅用于当前会话。\n· 麦克风：用于语音提问，语音仅用于识别当前问题，默认不保存原始录音。\n本机保存的偏好、收藏和笔记不会自动上传。'
  },
  {
    key: 'license',
    title: '开源软件许可',
    body: '本应用基于微信小程序原生框架、FastAPI、Pydantic 与 SQLite 构建。\n相关开源组件遵循各自的许可证。'
  }
]

Page({
  data: {
    appName: '我的口袋导游',
    appVersion: '1.0.0',
    locationStatus: '读取中',
    recordStatus: '读取中',
    locationGranted: false,
    recordGranted: false,
    personalized: true,
    openPanel: '',
    helpItems: HELP_ITEMS,
    legalItems: LEGAL_ITEMS,
    feedbackTypes: store.FEEDBACK_TYPES,
    feedbackType: store.FEEDBACK_TYPES[0],
    feedbackText: '',
    feedbackContext: '',
    submitting: false
  },
  onLoad() {
    this.setData({ appVersion: runtime.appVersion || '1.0.0' })
  },
  onShow() {
    this.refreshPermissions()
    this.setData({ personalized: store.getSettings().personalized })
    this.loadFeedbackContext()
  },
  statusText(value) {
    if (value === true) return '已开启'
    if (value === false) return '未开启'
    return '未申请'
  },
  refreshPermissions() {
    wx.getSetting({
      success: ({ authSetting }) => {
        this.setData({
          locationGranted: authSetting['scope.userLocation'] === true,
          recordGranted: authSetting['scope.record'] === true,
          locationStatus: this.statusText(authSetting['scope.userLocation']),
          recordStatus: this.statusText(authSetting['scope.record'])
        })
      },
      fail: () => this.setData({ locationStatus: '无法读取', recordStatus: '无法读取' })
    })
  },
  requestPermission(event) {
    const { scope, label } = event.currentTarget.dataset
    wx.authorize({
      scope,
      success: () => {
        this.refreshPermissions()
        wx.showToast({ title: `${label}已开启`, icon: 'success' })
      },
      fail: () => wx.showModal({
        title: `开启${label}`,
        content: `请在设置中允许「${label}」。也可以点击右上角「···」进入设置后修改。`,
        confirmText: '去设置',
        success: ({ confirm }) => {
          if (!confirm) return
          wx.openSetting({ success: () => this.refreshPermissions() })
        }
      })
    })
  },
  togglePersonalized(event) {
    const personalized = Boolean(event.detail.value)
    store.saveSettings({ personalized })
    this.setData({ personalized })
  },
  togglePanel(event) {
    const key = event.currentTarget.dataset.key
    this.setData({ openPanel: this.data.openPanel === key ? '' : key })
  },
  contactUs() {
    wx.showModal({
      title: '联系我们',
      content: '当前版本暂未开放对外联系方式。请通过「意见反馈」提交问题，我们会在后续版本中处理。',
      showCancel: false,
      confirmText: '知道了'
    })
  },
  // 反馈来自具体行程时，自动带上行程编号和当前地点，用户不用重复描述
  loadFeedbackContext() {
    const tripId = wx.getStorageSync('currentTripId') || wx.getStorageSync('lastViewedTripId') || ''
    this.feedbackTripId = tripId
    this.feedbackNode = null
    if (!tripId) {
      return this.setData({ feedbackContext: '暂未关联行程，可直接描述问题' })
    }
    this.setData({ feedbackContext: `提交时会自动附带行程编号 ${String(tripId).slice(0, 8)}` })
    api.getTrip(tripId)
      .then((trip) => {
        const nodes = (trip.days || []).reduce((all, day) => all.concat(day.nodes || []), [])
        const node = nodes.find((item) => item.status === 'IN_PROGRESS') || nodes.find((item) => item.status === 'PLANNED') || null
        this.feedbackNode = node ? { id: node.id, name: node.name } : null
        this.setData({
          feedbackContext: node
            ? `提交时会自动附带行程编号和地点「${node.name}」`
            : `提交时会自动附带行程编号 ${String(tripId).slice(0, 8)}`
        })
      })
      .catch(() => {})
  },
  pickFeedbackType(event) {
    this.setData({ feedbackType: event.currentTarget.dataset.value })
  },
  inputFeedback(event) {
    this.setData({ feedbackText: event.detail.value })
  },
  submitFeedback() {
    if (this.data.submitting) return
    const text = String(this.data.feedbackText || '').trim()
    if (!text) return wx.showToast({ title: '请填写问题描述', icon: 'none' })
    const node = this.feedbackNode || {}
    this.setData({ submitting: true })
    try {
      store.submitFeedback({
        type: this.data.feedbackType,
        text,
        tripId: this.feedbackTripId || '',
        nodeId: node.id || '',
        placeName: node.name || ''
      })
      this.setData({ submitting: false, feedbackText: '', openPanel: '' })
      wx.showToast({ title: '已记录，感谢反馈', icon: 'success' })
    } catch (error) {
      this.setData({ submitting: false })
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
    }
  },
  clearLocalData() {
    wx.showModal({
      title: '确定清除本地数据吗？',
      content: '本机保存的行程、偏好和浏览记录将被删除，该操作无法撤销。',
      cancelText: '取消',
      confirmText: '确认清除',
      confirmColor: '#d92d20',
      success: ({ confirm }) => {
        if (!confirm) return
        store.clearLocalData()
        this.refreshPermissions()
        this.setData({
          personalized: store.getSettings().personalized,
          feedbackText: '',
          openPanel: ''
        })
        this.loadFeedbackContext()
        wx.showToast({ title: '本地数据已清除', icon: 'success' })
      }
    })
  }
})
