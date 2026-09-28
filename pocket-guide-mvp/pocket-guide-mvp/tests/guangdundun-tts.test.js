const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const https = require('node:https')
const { main } = require('../cloudfunctions/guangdundun-tts/index')

function withAzureEnv(run) {
  const previousKey = process.env.AZURE_SPEECH_KEY
  const previousRegion = process.env.AZURE_SPEECH_REGION
  process.env.AZURE_SPEECH_KEY = 'test-key'
  process.env.AZURE_SPEECH_REGION = 'eastasia'
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (previousKey === undefined) delete process.env.AZURE_SPEECH_KEY
      else process.env.AZURE_SPEECH_KEY = previousKey
      if (previousRegion === undefined) delete process.env.AZURE_SPEECH_REGION
      else process.env.AZURE_SPEECH_REGION = previousRegion
    })
}

test('validates text and cloud-only credentials', { concurrency: false }, async () => {
  const previousKey = process.env.AZURE_SPEECH_KEY
  const previousRegion = process.env.AZURE_SPEECH_REGION
  delete process.env.AZURE_SPEECH_KEY
  delete process.env.AZURE_SPEECH_REGION
  try {
    assert.match((await main({ text: '' })).error, /1～500/)
    assert.match((await main({ text: '你好' })).error, /AZURE_SPEECH_KEY/)
  } finally {
    if (previousKey !== undefined) process.env.AZURE_SPEECH_KEY = previousKey
    if (previousRegion !== undefined) process.env.AZURE_SPEECH_REGION = previousRegion
  }
})

test('returns an MP3 payload and escapes SSML', { concurrency: false }, async () => {
  const originalRequest = https.request
  let postedBody = ''
  https.request = (options, callback) => {
    assert.equal(options.hostname, 'eastasia.tts.speech.microsoft.com')
    assert.equal(options.headers['Ocp-Apim-Subscription-Key'], 'test-key')
    const request = new EventEmitter()
    request.end = body => {
      postedBody = body
      const response = new EventEmitter()
      response.statusCode = 200
      response.resume = () => {}
      callback(response)
      response.emit('data', Buffer.from('fake-mp3'))
      response.emit('end')
      request.emit('close')
    }
    request.destroy = error => request.emit('error', error)
    return request
  }
  try {
    await withAzureEnv(async () => {
      const result = await main({ text: '故宫 <重点> & 提醒' })
      assert.equal(result.format, 'mp3')
      assert.equal(Buffer.from(result.audioBase64, 'base64').toString(), 'fake-mp3')
      assert.match(postedBody, /故宫 &lt;重点&gt; &amp; 提醒/)
    })
  } finally {
    https.request = originalRequest
  }
})

test('returns a safe error when the provider fails', { concurrency: false }, async () => {
  const originalRequest = https.request
  https.request = () => {
    const request = new EventEmitter()
    request.end = () => request.emit('error', new Error('network down'))
    request.destroy = error => request.emit('error', error)
    return request
  }
  try {
    await withAzureEnv(async () => {
      const result = await main({ text: '测试语音' })
      assert.match(result.error, /语音合成失败/)
    })
  } finally {
    https.request = originalRequest
  }
})
