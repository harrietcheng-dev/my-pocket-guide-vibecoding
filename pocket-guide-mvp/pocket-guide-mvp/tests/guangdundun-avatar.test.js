const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, '../miniprogram/components/guangdundun-avatar/index.js'), 'utf8')
const flush = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
function mount(options = {}) {
  let definition
  let nextId = 0
  const intervals = new Map()
  const timeouts = new Map()
  const audios = []
  const released = []
  vm.runInNewContext(source, {
    Component(value) { definition = value },
    require() {
      return {
        synthesize: options.provider || (() => Promise.resolve({ audioUrl: 'https://example.com/test.mp3' })),
        prepareAudio: options.prepare || (result => Promise.resolve({ src: result.audioUrl, release() { released.push(result.audioUrl) } }))
      }
    },
    setInterval(fn) { const id = ++nextId; intervals.set(id, fn); return id },
    clearInterval(id) { intervals.delete(id) },
    setTimeout(fn) { const id = ++nextId; timeouts.set(id, fn); return id },
    clearTimeout(id) { timeouts.delete(id) },
    wx: {
      createInnerAudioContext() {
        const callbacks = {}
        const audio = {
          play() { this.playCalled = true },
          stop() { this.stopped = true; if (callbacks.Stop) callbacks.Stop() },
          destroy() { this.destroyed = true },
          emit(name) { callbacks[name]() }
        }
        for (const event of ['Play', 'Ended', 'Stop', 'Pause', 'Waiting', 'TimeUpdate', 'Error']) audio[`on${event}`] = cb => { callbacks[event] = cb }
        audios.push(audio)
        return audio
      }
    }
  })
  const events = []
  const instance = {
    data: structuredClone(definition.data), properties: { ttsFunction: 'guangdundun-tts' },
    setData(patch) { Object.assign(this.data, patch) },
    triggerEvent(name, detail) { events.push({ name, detail }) }
  }
  Object.assign(instance, definition.methods)
  definition.lifetimes.attached.call(instance)
  return { instance, intervals, timeouts, audios, events, released,
    hide() { definition.pageLifetimes.hide.call(instance) },
    show() { definition.pageLifetimes.show.call(instance) },
    detach() { definition.lifetimes.detached.call(instance) }
  }
}

test('mouths wait for audio playback, end clears all resources', async () => {
  const h = mount()
  const completion = h.instance.startSpeak('你好')
  await flush()
  assert.equal(h.instance.data.frame, 0)
  assert.equal(h.intervals.size, 0)
  h.audios[0].emit('Play')
  assert.equal(h.instance.data.status, 'speaking')
  assert.equal(h.intervals.size, 1)
  for (let i = 0; i < 20; i++) {
    const previous = h.instance.data.frame
    h.intervals.values().next().value()
    assert.notEqual(h.instance.data.frame, previous)
    assert.ok(h.instance.data.frame >= 1 && h.instance.data.frame <= 5)
  }
  h.audios[0].emit('Ended')
  assert.equal((await completion).status, 'ended')
  assert.equal(h.instance.data.frame, 0)
  assert.equal(h.intervals.size + h.timeouts.size, 0)
  assert.equal(h.audios[0].destroyed, true)
  assert.equal(h.released.length, 1)
})

test('late TTS response cannot replace a newer request', async () => {
  const pending = deferred()
  const h = mount({ provider: text => text === 'A' ? pending.promise : Promise.resolve({ audioUrl: 'https://example.com/B.mp3' }) })
  const a = h.instance.startSpeak('A')
  await flush()
  const b = h.instance.startSpeak('B')
  await flush()
  pending.resolve({ audioUrl: 'https://example.com/A.mp3' })
  await flush()
  assert.equal((await a).status, 'superseded')
  assert.equal(h.audios.length, 1)
  assert.equal(h.audios[0].src, 'https://example.com/B.mp3')
  h.instance.stopSpeak()
  assert.equal((await b).status, 'stopped')
})

test('interrupting playback ignores late callbacks from destroyed audio', async () => {
  const h = mount()
  const a = h.instance.startSpeak('A')
  await flush()
  h.audios[0].emit('Play')
  const b = h.instance.startSpeak('B')
  await flush()
  h.audios[1].emit('Play')
  h.audios[0].emit('Ended')
  h.audios[0].emit('Error')
  assert.equal((await a).status, 'superseded')
  assert.equal(h.instance.data.status, 'speaking')
  assert.equal(h.intervals.size, 1)
  h.instance.stopSpeak()
  assert.equal((await b).status, 'stopped')
})

test('hide and detach cancel pending synthesis and active playback', async () => {
  const pending = deferred()
  const h = mount({ provider: () => pending.promise })
  const a = h.instance.startSpeak('A')
  await flush()
  h.hide()
  pending.resolve({ audioUrl: 'https://example.com/A.mp3' })
  await flush()
  assert.equal((await a).status, 'stopped')
  assert.equal(h.audios.length, 0)
  assert.equal((await h.instance.startSpeak('hidden')).status, 'stopped')
  h.show()
  const b = h.instance.startSpeak('B')
  await flush()
  h.audios[0].emit('Play')
  h.detach()
  assert.equal((await b).status, 'stopped')
  assert.equal(h.intervals.size + h.timeouts.size, 0)
  assert.equal(h.audios[0].destroyed, true)
})

test('cancellation while writing an audio file releases the late file', async () => {
  const pending = deferred()
  let released = false
  const h = mount({ prepare: () => pending.promise })
  const result = h.instance.startSpeak('A')
  await flush()
  h.instance.stopSpeak()
  pending.resolve({ src: 'local.mp3', release() { released = true } })
  await flush()
  assert.equal((await result).status, 'stopped')
  assert.equal(released, true)
  assert.equal(h.audios.length, 0)
})

test('provider failure, invalid text and timeout report errors without animation', async () => {
  const h = mount({ provider: () => Promise.reject(new Error('服务不可用')) })
  assert.equal((await h.instance.startSpeak('')).status, 'error')
  assert.equal((await h.instance.startSpeak('x'.repeat(501))).status, 'error')
  assert.equal((await h.instance.startSpeak('A')).message, '服务不可用')
  assert.equal(h.intervals.size + h.timeouts.size, 0)
  const pending = mount({ provider: () => new Promise(() => {}) })
  const result = pending.instance.startSpeak('A')
  pending.timeouts.values().next().value()
  assert.equal((await result).status, 'error')
  assert.equal(pending.instance.data.frame, 0)
})

test('buffering stops mouth animation; playback resumes; audio errors clean up', async () => {
  const h = mount()
  const result = h.instance.startSpeak('你好')
  await flush()
  const audio = h.audios[0]
  audio.emit('Play')
  audio.emit('Waiting')
  assert.equal(h.instance.data.frame, 0)
  assert.equal(h.intervals.size, 0)
  audio.currentTime = 1
  audio.emit('TimeUpdate')
  assert.equal(h.intervals.size, 1)
  audio.emit('Error')
  assert.equal((await result).status, 'error')
  assert.equal(h.intervals.size + h.timeouts.size, 0)
  assert.equal(audio.destroyed, true)
})

test('independent instances do not share timers or playback state', async () => {
  const a = mount()
  const b = mount()
  const ar = a.instance.startSpeak('A')
  const br = b.instance.startSpeak('B')
  await flush()
  a.audios[0].emit('Play')
  b.audios[0].emit('Play')
  a.instance.stopSpeak()
  assert.equal(b.instance.data.status, 'speaking')
  b.audios[0].emit('Ended')
  assert.equal((await ar).status, 'stopped')
  assert.equal((await br).status, 'ended')
})
