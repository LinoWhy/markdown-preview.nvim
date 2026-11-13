const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const vm = require('vm')
const { Writable } = require('stream')
const MarkdownIt = require('markdown-it')

const app = path.join(__dirname, '../app')
const imageModule = {}
vm.runInNewContext(
  fs.readFileSync(path.join(app, 'pages/image.js'), 'utf8').replace('export default ', ''),
  imageModule
)
const md = new MarkdownIt({ html: true })
  .use(imageModule.localImage)
  .use(require('../app/pages/markdown-it-imsize'))

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'mkdp-wikilink-'))
const noteDir = path.join(fixture, 'notes')
const imageDir = path.join(fixture, 'attachments/nested')
fs.mkdirSync(noteDir)
fs.mkdirSync(imageDir, { recursive: true })
const filename = '图片 (a+b).png'
const imageData = Buffer.from('test image contents')
fs.writeFileSync(path.join(imageDir, filename), imageData)
fs.writeFileSync(path.join(imageDir, 'other-' + filename), 'wrong image')

const routeModule = {
  module: { exports: {} },
  process,
  require: name => name === './lib/util/logger'
    ? () => ({ info () {}, error () {} })
    : require(name)
}
vm.runInNewContext(fs.readFileSync(path.join(app, 'routes.js'), 'utf8'), routeModule)

async function fetchImage (html) {
  const src = html.match(/<img\b[^>]*\bsrc="([^"]+)"/)
  assert(src, 'Expected an image element: ' + html)
  const chunks = []
  const response = new Writable({
    write (chunk, encoding, callback) {
      chunks.push(chunk)
      callback()
    }
  })
  response.statusCode = 200
  response.setHeader = () => {}
  const finished = new Promise((resolve, reject) => {
    response.on('finish', resolve)
    response.on('error', reject)
  })
  await routeModule.module.exports({
    asPath: src[1],
    bufnr: 1,
    custImgPath: '',
    plugin: {
      nvim: {
        buffers: Promise.resolve([{ id: 1 }]),
        async call (method) {
          if (method === 'getcwd') return fixture
          if (method === 'expand') return noteDir
          throw new Error('Unexpected Neovim call: ' + method)
        }
      }
    }
  }, response, () => response.end())
  await finished
  return { status: response.statusCode, body: Buffer.concat(chunks) }
}

async function run () {
  for (const target of [filename, 'nested/' + filename, 'attachments/nested/' + filename]) {
    const response = await fetchImage(md.render('![[' + target + ']]'))
    assert.strictEqual(response.status, 200)
    assert.deepStrictEqual(response.body, imageData)
  }

  assert.match(md.render('![[' + filename + '|400]]'), /width=400\b/)
  assert.match(md.render('![[' + filename + '|400x200]]'), /width=400\b.*height=200\b/)
  assert.match(md.render('![[' + filename + '|A "caption"]]'), /alt="A &quot;caption&quot;"/)
  assert.match(md.render('| Image |\n| --- |\n| ![[' + filename + '\\|400]] |'), /width=400\b/)
  assert(!md.render('`![[' + filename + ']]`').includes('<img'))
  assert(!md.render('```markdown\n![[' + filename + ']]\n```').includes('<img'))
  assert(!md.render('\\!\\[\\[' + filename + ']]').includes('<img'))
  assert(!md.render('![[note]] ![[document.pdf]] [[note]]').includes('<img'))

  const missing = await fetchImage(md.render('![[missing.png]]'))
  assert.strictEqual(missing.status, 404)
  const regular = await fetchImage(md.render('![regular](../attachments/nested/' + encodeURIComponent(filename) + ')'))
  assert.strictEqual(regular.status, 200)
  assert.deepStrictEqual(regular.body, imageData)
  console.log('PASS: wikilink images, fd lookup, dimensions, captions, code, tables and regular images')
}

const previousCwd = process.cwd()
process.chdir(app)
run().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  process.chdir(previousCwd)
  fs.rmSync(fixture, { recursive: true, force: true })
})
