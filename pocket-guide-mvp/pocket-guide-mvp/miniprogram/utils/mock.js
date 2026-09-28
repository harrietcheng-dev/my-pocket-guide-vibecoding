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
    state: 'READY',
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
  generateTrip(id) {
    return this.getTrip(id)
  },
  checkIn(id, nodeId) {
    const trips = readTrips()
    const trip = trips.find((item) => item.id === id)
    if (!trip) return Promise.reject(new Error('行程不存在'))
    let checkedNode = null
    trip.days.forEach((day) => day.nodes.forEach((item) => {
      if (item.id === nodeId) {
        item.status = 'IN_PROGRESS'
        checkedNode = item
      } else if (item.status === 'IN_PROGRESS') item.status = 'PLANNED'
    }))
    trip.state = 'ACTIVE'
    writeTrips(trips)
    return Promise.resolve({ trip: clone(trip), node: clone(checkedNode), guide: guideFor(checkedNode ? checkedNode.name : '当前景点') })
  },
  getGuide(placeId, name, depth) {
    const guide = guideFor(name || placeId)
    if (depth === 'detail') guide.text += ' 参观时还可以留意建筑轴线、屋顶形制和空间层次。'
    return Promise.resolve(guide)
  },
  getNearby(category) {
    const samples = {
      '美食': [['简餐与茶歇', '餐饮', 320], ['故宫角楼咖啡', '餐饮', 680]],
      '卫生间': [['公共卫生间', '公共设施', 180], ['游客中心卫生间', '公共设施', 460]],
      '休息': [['游客休息区', '休息点', 120], ['东华门休息点', '休息点', 520]],
      '医院': [['北京医院', '正规医院', 2100], ['协和医院东单院区', '正规医院', 2800]],
      '交通': [['东华门公交站', '公交站', 410], ['金鱼胡同地铁站', '地铁站', 960]]
    }
    return Promise.resolve({ category, items: (samples[category] || samples['休息']).map((item, index) => ({ id: `${category}-${index}`, name: item[0], type: item[1], distanceM: item[2] })) })
  },
  askQuestion(id, text) {
    let reply = '这是当前景点的演示问答。接入知识服务后，我会提供带来源和查询时间的回答。'
    let action = null
    if (/累|少走|下雨|早点结束|不想去/.test(text)) {
      reply = '可以。我会保留已完成和正在进行的节点，只调整后续安排，确认后才会应用。'
      action = 'replan'
    }
    return Promise.resolve({ id: `message_${Date.now()}`, reply, action })
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

function guideFor(name) {
  return {
    title: `${name}短讲解`,
    text: name === '故宫博物院'
      ? '这里是故宫博物院，始建于明永乐年间，曾是明清两代皇宫。参观时建议先看中轴线三大殿，再按体力选择东西六宫。'
      : `${name}是本次行程的重要一站。我会结合已审核资料介绍核心看点。`,
    durationSec: 42,
    sourceTitle: '团队审核文旅资料（比赛演示）',
    fetchedAt: '2026-09-27',
    confidence: 'PARTIAL'
  }
}
