const DAY_MS = 24 * 60 * 60 * 1000

function calculateTripDays(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0
  return Math.floor((end - start) / DAY_MS) + 1
}

function validateTripForm(form) {
  const city = String(form.city || '').trim()
  if (!city) return { error: '请填写目的城市' }
  if (!form.startDate || !form.endDate) return { error: '请选择开始和结束日期' }
  const days = calculateTripDays(form.startDate, form.endDate)
  if (!days) return { error: '结束日期不能早于开始日期' }
  if (days > 7) return { error: '单次行程最多安排 7 天' }

  const partySize = Number(form.partySize)
  if (!Number.isInteger(partySize) || partySize < 1) return { error: '同行人数必须是大于 0 的整数' }
  const groupBudgetCny = Number(form.groupBudgetCny)
  if (!Number.isFinite(groupBudgetCny) || groupBudgetCny <= 0) return { error: '整组预算必须大于 0 元' }
  if (!form.dailyStart || !form.dailyEnd || form.dailyEnd <= form.dailyStart) return { error: '每日结束时间必须晚于开始时间' }
  if (!(form.transportModes || []).length) return { error: '请至少选择一种交通方式' }

  const startPoint = String(form.startPoint || '').trim()
  const endPoint = String(form.endPoint || '').trim()
  if (!startPoint || !endPoint) return { error: '请确认行程起点和终点' }

  return {
    value: {
      ...form,
      city,
      days,
      partySize,
      groupBudgetCny,
      startPoint,
      endPoint,
      dailyWindow: `${form.dailyStart}–${form.dailyEnd}`,
      freeText: String(form.freeText || '').trim()
    }
  }
}

module.exports = { calculateTripDays, validateTripForm }
