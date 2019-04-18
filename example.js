const signalhub = require('signalhub')
const swarm = require('./')
const morph = require('nanomorph')
const html = require('nanohtml')

const key = '626d55ffe6eafc13e32309ca4985b83cf15c0c015e6ba8f32dcebed2a50e0c27'
const hub = signalhub(key, [
  'https://signalhub-jccqtwhdwc.now.sh',
  'https://signalhub.littlstar.com',
  'http://localhost:3000'
])

const rpc = swarm(hub)
const tree = html`
  <div> The date is ${Date()} </div>
`

global.rpc = rpc

document.body.appendChild(tree)

rpc.command({
  run(fn, ...args) {
    return fn(...args)
  },

  render(string) {
    morph(tree, html(string))
  },

  async echo(value) {
    return value
  }
})

rpc.on('peer', async (peer) => {
  console.log('peer', peer);
  global.peer = peer
  peer.render(`<div> The date is ${Date()} </div>`)
  console.log(await peer.echo('hello world'))
})
