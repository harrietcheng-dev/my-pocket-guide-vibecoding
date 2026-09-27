const storageKey = 'pocketGuideTrips'
const clone = (value) => JSON.parse(JSON.stringify(value))
const readTrips = () => wx.getStorageSync(storageKey) || []
const writeTrips = (trips) => wx.setStorageSync(storageKey, trips)

function node(time, name, type, cost, durationMin, longitude, latitude, reason) {
  return {
    id: `${name}_${time}`,
    time,
    name,
    type,
    costRange: [cost, cost + Math.max(20, Math.round(cost * 0.25))],
    durationMin,
    longitude,
    latitude,
    reason,
    status: 'PLANNED'
  }
}

function makeTrip(constraints) {
  const id = `trip_${Date.now()}`
  const city = constraints.city || '北京'
  return {
    id,
    state: 'DRAFT',
    version: 1,
    title: `${city}${constraints.days || 4}日游`,
    constraints,
    costSummary: {
      tickets: [360, 460],
      food: [720, 960],
      transport: [180, 260],
      other: [80, 160],
      total: [1340, 1840]
    },
    days: [
      {
        dayIndex: 1,
        dateLabel: 'Day 1',
        walkDistanceKm: 5.6,
        nodes: [
          node('08:30', '天安门广场', '景点', 0, 90, 116.3975, 39.9087, '城市地标，适合清晨到达'),
          node('10:10', '故宫博物院', '景点', 120, 210, 116.3970, 39.9180, '历史文化核心地点，需提前预约'),
          node('13:00', '午餐区域', '餐饮', 80, 100, 116.4050, 39.9200, '优先选择附近平价餐饮'),
          node('14:30', '景山公园', '景点', 20, 90, 116.3966, 39.9250, '俯瞰故宫中轴线')
        ]
      },
      {
        dayIndex: 2,
        dateLabel: 'Day 2',
        walkDistanceKm: 4.2,
        nodes: [
          node('09:00', '天坛公园', '景点', 34, 150, 116.4173, 39.8822, '体验古代祭祀建筑群'),
          node('12:00', '午餐区域', '餐饮', 90, 90, 116.4250, 39.8890, '安排休息，避免连续步行'),
          node('14:00', '国家博物馆', '景点', 0, 180, 116.4010, 39.9036, '室内文化体验，需预约')
        ]
      },
      {
        dayIndex: 3,
        dateLabel: 'Day 3',
        walkDistanceKm: 6.1,
        nodes: [
          node('08:30', '颐和园', '景点', 30, 210, 116.2732, 39.9999, '皇家园林与湖景'),
          node('13:30', '午餐与休息', '休息', 80, 90, 116.2900, 39.9900, '预留恢复体力时间'),
          node('15:20', '圆明园', '景点', 25, 150, 116.3036, 40.0081, '历史遗址与园林空间')
        ]
      },
      {
        dayIndex: 4,
        dateLabel: 'Day 4',
        walkDistanceKm: 3.8,
        nodes: [
          node('09:30', '什刹海', '景点', 0, 120, 116.3850, 39.9402, '轻松城市漫步'),
          node('12:00', '午餐区域', '餐饮', 100, 90, 116.3900, 39.9350, '体验北京风味'),
          node('14:00', '南锣鼓巷', '景点', 0, 120, 116.4030, 39.9370, '街区漫步与伴手礼')
        ]
      }
    ],
    validationSummary: {
      routeChecked: true,
      budgetChecked: true,
      unverifiedFields: ['部分临时公告请出发前复核']
    }
  }
}

module.exports = {
  createTrip(constraints) {
    const trip = makeTrip(constraints)
    const trips = readTrips()
    trips.unshift(trip)
    writeTrips(trips)
    wx.setStorageSync('currentTripId', trip.id)
    return Promise.resolve(clone(trip))
  },
  getTrip(id) {
    return Promise.resolve(clone(readTrips().find((item) => item.id === id) || null))
  },
  listTrips() {
    return Promise.resolve(clone(readTrips()))
  },
  confirmTrip(id) {
    return updateTrip(id, (trip) => {
      trip.state = 'CONFIRMED'
    })
  },
  generateTrip(id) {
    return updateTrip(id, (trip) => {
      trip.state = 'READY'
    })
  },
  startTrip(id) {
    return updateTrip(id, (trip) => {
      trip.state = 'ACTIVE'
      trip.startedAt = new Date().toISOString()
    })
  },
  checkInNode(id, nodeId) {
    return updateTrip(id, (trip) => {
      const nodeItem = findNode(trip, nodeId)
      nodeItem.status = 'IN_PROGRESS'
      nodeItem.checkedInAt = new Date().toISOString()
    })
  },
  updateNodeStatus(id, nodeId, action) {
    return updateTrip(id, (trip) => {
      const nodeItem = findNode(trip, nodeId)
      nodeItem.status = action
      nodeItem.finishedAt = new Date().toISOString()
    })
  },
  completeTrip(id, note) {
    return updateTrip(id, (trip) => {
      let completedNodes = 0
      let skippedNodes = 0
      trip.days.forEach((day) => day.nodes.forEach((nodeItem) => {
        if (nodeItem.status === 'COMPLETED') completedNodes += 1
        else {
          nodeItem.status = 'SKIPPED'
          skippedNodes += 1
        }
      }))
      trip.state = 'COMPLETED'
      trip.completedAt = new Date().toISOString()
      trip.completionSummary = { completedNodes, skippedNodes, note }
    })
  },
  createReplan(id, request) {
    const trip = readTrips().find((item) => item.id === id)
    if (!trip) return Promise.reject(new Error('行程不存在'))
    return Promise.resolve({
      id: `replan_${Date.now()}`,
      tripId: id,
      request,
      summary: '保留已完成节点，减少后续步行并增加休息时间',
      changes: [
        '将圆明园替换为国家博物馆室内参观',
        '增加 45 分钟休息时间',
        '预计步行减少 3.2 公里',
        '预计费用增加 20–45 元'
      ],
      walkingDeltaKm: -3.2,
      costDelta: [20, 45]
    })
  },
  applyReplan(id, replan) {
    const trips = readTrips()
    const index = trips.findIndex((item) => item.id === id)
    if (index < 0) return Promise.reject(new Error('行程不存在'))
    const trip = trips[index]
    trip.previousSnapshot = clone(trip)
    trip.version += 1
    trip.lastAdjustment = replan.summary
    trip.days[2].walkDistanceKm = 2.9
    trip.days[2].nodes[2] = node('15:00', '国家博物馆', '景点', 0, 180, 116.4010, 39.9036, '减少步行并改为室内参观')
    trips[index] = trip
    writeTrips(trips)
    return Promise.resolve(clone(trip))
  },
  undo(id) {
    const trips = readTrips()
    const index = trips.findIndex((item) => item.id === id)
    if (index < 0 || !trips[index].previousSnapshot) return Promise.reject(new Error('没有可撤销版本'))
    const restored = trips[index].previousSnapshot
    delete restored.previousSnapshot
    trips[index] = restored
    writeTrips(trips)
    return Promise.resolve(clone(restored))
  }
}

function updateTrip(id, mutate) {
  const trips = readTrips()
  const index = trips.findIndex((item) => item.id === id)
  if (index < 0) return Promise.reject(new Error('行程不存在'))
  mutate(trips[index])
  writeTrips(trips)
  return Promise.resolve(clone(trips[index]))
}

function findNode(trip, nodeId) {
  for (const day of trip.days) {
    const nodeItem = day.nodes.find((item) => item.id === nodeId)
    if (nodeItem) return nodeItem
  }
  throw new Error('行程节点不存在')
}
