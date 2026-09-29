const interestOptions = ['历史文化', '美食', '自然', '拍照', '城市漫步', '休闲']
const transportOptions = ['公交', '地铁', '步行', '打车']
const physicalOptions = ['少走路', '需要午休', '无障碍', '关注医院药店']
const { calculateTripDays, validateTripForm } = require('../../utils/trip-form')

Page({
  data: {
    interestOptions: interestOptions.map((value) => ({
      value,
      selected: value === '历史文化' || value === '美食'
    })),
    paceOptions: ['轻松', '适中', '紧凑'],
    transportOptions: transportOptions.map((value) => ({ value, selected: value !== '打车' })),
    physicalOptions: physicalOptions.map((value) => ({ value, selected: false })),
    perCapitaBudget: 1500,
    formError: '',
    form: {
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
  },
  onLoad(options) {
    let city = options && options.city ? decodeURIComponent(options.city) : ''
    if (!city) city = wx.getStorageSync('draftCity')
    if (city) this.setData({ 'form.city': city })
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
    const interestOptions = this.data.interestOptions.map((item) => ({
      ...item,
      selected: interests.indexOf(item.value) >= 0
    }))
    this.setData({ 'form.interests': interests, interestOptions })
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
