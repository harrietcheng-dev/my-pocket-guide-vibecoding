const test = require('node:test')
const assert = require('node:assert/strict')
const { calculateTripDays, validateTripForm } = require('../miniprogram/utils/trip-form')

function validForm(overrides = {}) {
  return {
    city: ' 北京 ',
    startDate: '2026-10-01',
    endDate: '2026-10-04',
    days: 4,
    partySize: '2',
    groupBudgetCny: '3000',
    interests: ['历史文化'],
    pace: '适中',
    transportModes: ['公交', '步行'],
    dailyStart: '09:00',
    dailyEnd: '21:00',
    startPoint: ' 酒店 ',
    endPoint: ' 北京南站 ',
    physicalConstraints: ['少走路'],
    freeText: ' 想看夜景 ',
    ...overrides
  }
}

test('calculates inclusive trip days', () => {
  assert.equal(calculateTripDays('2026-10-01', '2026-10-04'), 4)
  assert.equal(calculateTripDays('2026-10-04', '2026-10-01'), 0)
})

test('normalizes a valid trip form before storage', () => {
  const result = validateTripForm(validForm())

  assert.equal(result.error, undefined)
  assert.equal(result.value.city, '北京')
  assert.equal(result.value.days, 4)
  assert.equal(result.value.partySize, 2)
  assert.equal(result.value.groupBudgetCny, 3000)
  assert.equal(result.value.dailyWindow, '09:00–21:00')
  assert.equal(result.value.startPoint, '酒店')
  assert.equal(result.value.freeText, '想看夜景')
})

test('rejects invalid ranges and incomplete constraints', () => {
  assert.match(validateTripForm(validForm({ endDate: '2026-10-09' })).error, /最多安排 7 天/)
  assert.match(validateTripForm(validForm({ partySize: '1.5' })).error, /整数/)
  assert.match(validateTripForm(validForm({ dailyEnd: '08:00' })).error, /结束时间/)
  assert.match(validateTripForm(validForm({ transportModes: [] })).error, /交通方式/)
  assert.match(validateTripForm(validForm({ startPoint: '' })).error, /起点和终点/)
})
