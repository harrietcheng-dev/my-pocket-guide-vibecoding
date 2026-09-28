const test = require('node:test')
const assert = require('node:assert/strict')

const storage = new Map()
global.wx = {
  getStorageSync(key) { return storage.get(key) },
  setStorageSync(key, value) { storage.set(key, value) }
}

const mock = require('../miniprogram/utils/mock')

test('manual edits remain a preview until confirmed and keep one undo snapshot', async () => {
  const trip = await mock.createTrip({ city: '北京', days: 1, dailyStart: '09:00', dailyEnd: '21:00' })
  const target = trip.days[0].nodes[1]
  const preview = await mock.previewEdits(trip.id, [{
    action: 'replace',
    dayIndex: 1,
    nodeId: target.id,
    node: { name: '中国美术馆', type: '景点', durationMin: 90, costRange: [0, 20], reason: '增加艺术体验' }
  }])

  const beforeConfirm = await mock.getTrip(trip.id)
  assert.equal(beforeConfirm.version, 1)
  assert.equal(beforeConfirm.days[0].nodes[1].name, target.name)

  const applied = await mock.confirmEdits(trip.id, preview.id)
  assert.equal(applied.version, 2)
  assert.equal(applied.days[0].nodes[1].name, '中国美术馆')
  assert.equal(applied.previousSnapshot.version, 1)
})

test('manual edits reject an in-progress node', async () => {
  storage.clear()
  const trip = await mock.createTrip({ city: '北京', days: 1, dailyStart: '09:00', dailyEnd: '21:00' })
  await mock.checkIn(trip.id, trip.days[0].nodes[0].id)

  await assert.rejects(
    mock.previewEdits(trip.id, [{ action: 'delete', dayIndex: 1, nodeId: trip.days[0].nodes[0].id }]),
    /不能修改/
  )
})

test('only one trip can be active and cancelling preserves completed nodes', async () => {
  storage.clear()
  const first = await mock.createTrip({ city: '北京', days: 1 })
  const second = await mock.createTrip({ city: '西安', days: 1 })
  await mock.checkIn(first.id, first.days[0].nodes[0].id)

  await assert.rejects(
    mock.checkIn(second.id, second.days[0].nodes[0].id),
    /正在进行/
  )

  await mock.completeNode(first.id, first.days[0].nodes[0].id)
  const cancelled = await mock.cancelTrip(first.id)
  assert.equal(cancelled.state, 'CANCELLED')
  assert.equal(cancelled.days[0].nodes[0].status, 'COMPLETED')
  assert.ok(cancelled.days[0].nodes.slice(1).every((item) => item.status === 'CANCELLED'))

  const activated = await mock.checkIn(second.id, second.days[0].nodes[0].id)
  assert.equal(activated.trip.state, 'ACTIVE')
})
