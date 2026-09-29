const test = require('node:test')
const assert = require('node:assert/strict')
const { buildHomeDashboard, summarizeActiveTrip } = require('../miniprogram/utils/home-dashboard')

const node = (id, status) => ({ id, name: `景点${id}`, status, durationMin: 60 })
const trip = (id, state, startDate, nodes = []) => ({
  id, state, title: `行程${id}`, constraints: { startDate, endDate: startDate }, days: [{ nodes }]
})

test('active summary exposes progress and the current focus node', () => {
  const summary = summarizeActiveTrip(trip('active', 'ACTIVE', '2026-10-01', [node('1', 'COMPLETED'), node('2', 'IN_PROGRESS'), node('3', 'PLANNED')]))
  assert.equal(summary.completedCount, 1)
  assert.equal(summary.totalCount, 3)
  assert.equal(summary.progressPercent, 33)
  assert.equal(summary.focusNode.id, '2')
  assert.equal(summary.nextNode.id, '3')
  assert.equal(summary.focusLabel, '正在参观')
})

test('dashboard prioritizes the selected upcoming trip and finds recent completion', () => {
  const dashboard = buildHomeDashboard([
    trip('ready-1', 'READY', '2026-11-02'),
    trip('ready-2', 'READY', '2026-12-02'),
    trip('done-old', 'COMPLETED', '2026-08-01'),
    trip('done-new', 'COMPLETED', '2026-09-01')
  ], 'ready-2')

  assert.equal(dashboard.upcoming[0].id, 'ready-2')
  assert.equal(dashboard.recentCompleted.id, 'done-new')
  assert.equal(dashboard.totalTrips, 4)
})
