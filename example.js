const signalhub = require('signalhub')
const swarm = require('./')
const morph = require('nanomorph')
const html = require('nanohtml')

//const SIGNALHUB = 'https://signalhub-jccqtwhdwc.now.sh'
const SIGNALHUB = 'https://signalhub.littlstar.com'
const key = '626d55ffe6eafc13e32309ca4985b83cf15c0c015e6ba8f32dcebed2a50e0c27'
const hub = signalhub(key, [ SIGNALHUB ])
const rpc = swarm(hub)

const tree = html`
  <div> The date is ${Date()} </div>
`

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
  setInterval(() => peer.render(`<div> The date is ${Date()} </div>`), 1000)
  console.log(await peer.echo('hello world'))
})
