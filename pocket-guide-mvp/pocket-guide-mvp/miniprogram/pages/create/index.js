const { calculateTripDays, validateTripForm } = require('../../utils/trip-form')
const store = require('../../utils/profile-store')

const interestOptions = ['历史文化', '美食', '自然', '拍照', '城市漫步', '休闲']
const transportOptions = ['公交', '地铁', '步行', '打车']
const physicalOptions = ['少走路', '需要午休', '无障碍', '关注医院药店', '轮椅出行', '慢性病需注意']

function withSelection(options, selected) {
  return options.map((value) => ({ value, selected: selected.indexOf(value) >= 0 }))
}

function buildInitialForm() {
  return {
    city: '北京',
    startDate: '2026-10-01',
    endDate: '2026-10-04',
    days: 4,
    partySize: 2,
    groupBudgetCny: 3000,
    interests: ['历史文化', '美食'],
    pace: '适中',
    transportModes: ['公交', '地铁', '步行'],
    dailyStart: '09:00',
    dailyEnd: '21:00',
    dailyWindow: '09:00–21:00',
    startPoint: '酒店或住宿地',
    endPoint: '酒店或住宿地',
    physicalConstraints: [],
    freeText: ''
  }
}

Page({
  data: {
    interestOptions: withSelection(interestOptions, ['历史文化', '美食']),
    paceOptions: ['轻松', '适中', '紧凑'],
    transportOptions: withSelection(transportOptions, ['公交', '地铁', '步行']),
    physicalOptions: withSelection(physicalOptions, []),
    perCapitaBudget: 1500,
    formError: '',
    form: buildInitialForm()
  },
  onLoad(options) {
    this.applyPreferences(options)
  },
  // 默认值 ← 旅行偏好 ← 入口带来的城市（URL 参数优先，其次 draftCity、常住城市）。
  // 偏好只作为初始值，用户仍可单独调整
  applyPreferences(options = {}) {
    const form = buildInitialForm()
    const prefs = store.getPreferences()
    const profile = store.getProfile()

    if (prefs.interests.length) form.interests = prefs.interests.slice()
    if (prefs.pace) form.pace = prefs.pace
    if (prefs.transportModes.length) form.transportModes = prefs.transportModes.slice()
    form.physicalConstraints = store.physicalConstraints()
    form.groupBudgetCny = prefs.perCapitaBudget * Number(form.partySize)

    // 后端暂无饮食 / 住宿 / 同行人员字段，先作为补充说明带入
    const notes = store.preferenceNotes()
    if (notes) form.freeText = notes

    const paramCity = options && options.city ? decodeURIComponent(options.city) : ''
    const draftCity = wx.getStorageSync('draftCity')
    if (paramCity) {
      form.city = paramCity
    } else if (draftCity) {
      form.city = draftCity
      // draftCity 是一次性入口参数，用完即清，避免一直覆盖用户填写的城市
      wx.removeStorageSync('draftCity')
    } else if (profile.city) {
      form.city = profile.city
    }

    this.setData(
      {
        form,
        interestOptions: withSelection(interestOptions, form.interests),
        transportOptions: withSelection(transportOptions, form.transportModes),
        physicalOptions: withSelection(physicalOptions, form.physicalConstraints)
      },
      () => this.refreshDerived()
    )
  },
  input(event) {
    this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value, formError: '' }, () => this.refreshDerived())
  },
  changeDate(event) {
    this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value, formError: '' }, () => this.refreshDerived())
  },
  changeTime(event) {
    this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value, formError: '' })
  },
  pickPace(event) {
    this.setData({ 'form.pace': event.currentTarget.dataset.value })
  },
  toggleInterest(event) {
    const value = event.currentTarget.dataset.value
    const interests = [...this.data.form.interests]
    const index = interests.indexOf(value)
    if (index >= 0) interests.splice(index, 1)
    else interests.push(value)
    this.setData({
      'form.interests': interests,
      interestOptions: this.data.interestOptions.map((item) => ({ ...item, selected: interests.indexOf(item.value) >= 0 }))
    })
  },
  toggleTransport(event) {
    this.toggleMultiOption('transportModes', 'transportOptions', event.currentTarget.dataset.value)
  },
  togglePhysical(event) {
    this.toggleMultiOption('physicalConstraints', 'physicalOptions', event.currentTarget.dataset.value)
  },
  toggleMultiOption(formField, optionField, value) {
    const values = [...this.data.form[formField]]
    const index = values.indexOf(value)
    if (index >= 0) values.splice(index, 1)
    else values.push(value)
    const options = this.data[optionField].map((item) => ({ ...item, selected: values.includes(item.value) }))
    this.setData({ [`form.${formField}`]: values, [optionField]: options, formError: '' })
  },
  refreshDerived() {
    const partySize = Number(this.data.form.partySize)
    const budget = Number(this.data.form.groupBudgetCny)
    const days = calculateTripDays(this.data.form.startDate, this.data.form.endDate)
    this.setData({
      'form.days': days || this.data.form.days,
      perCapitaBudget: partySize > 0 && budget > 0 ? Math.round(budget / partySize) : 0
    })
  },
  next() {
    const result = validateTripForm(this.data.form)
    if (result.error) {
      this.setData({ formError: result.error })
      return wx.showToast({ title: result.error, icon: 'none' })
    }
    wx.setStorageSync('tripDraft', result.value)
    wx.navigateTo({ url: '/pages/summary/index' })
  }
})
