const { EventEmitter } = require('events')
const connections = require('connections')
const discovery = require('webrtc-swarm')
const messages = require('./messages')
const protocol = require('rpc-protocol')
const thunky = require('thunky')
const pify = require('pify')

const MANIFEST = 0x1ee

function createRPC(opts) {
  return new RPC(opts)
}

class RPC extends EventEmitter {
  constructor(signalhub, opts) {
    super()
    this.setMaxListeners(0)

    this.connections = connections(this)
    this.discovery = discovery(signalhub, opts)
    this.destroyed = false
    this.commands = {}
    this.ready = thunky((done) => this.once('manifest', done))

    this.onclose = this.onclose.bind(this)
    this.onerror = this.onerror.bind(this)
    this.onpeer = this.onpeer.bind(this)

    this.discovery.on('close', this.onclose)
    this.discovery.on('error', this.onerror)
    this.discovery.on('peer', this.onpeer)

    this.ready(() => {
    })
  }

  onclose() {
    this.discovery.removeListener('close', this.onclose)
    this.discovery.removeListener('error', this.onerror)
    this.discovery.removeListener('peer', this.onpeer)
    this.discovery = null
    this.destroyed = true
    this.closed = true
    this.emit('close')
  }

  onerror(err) {
    this.emit('error', err)
  }

  onpeer(stream, info) {
    const manifest = { commands: [] }
    const rpc = protocol({ stream })

    for (const name in this.commands) {
      const callback = this.commands[name]

      if ('function' === typeof callback) {
        manifest.commands.push(name)
        rpc.command(name, (req, reply) => {
          const args = req.arguments.concat(reply, req)

          if (0 === req.arguments.length) {
            args.unshift(undefined)
          }

          return callback(...args)
        })
      }
    }

    this.emit('connection', stream)

    // install 'Manifest' extension
    rpc.extension(MANIFEST, messages.Manifest)
    rpc.send(MANIFEST, manifest)

    rpc.on('extension', (ext, type, buffer, reply) => {
      if (MANIFEST === type) {
        this.emit('manifest', ext)
        const peer = Peer.extended(rpc, ext)
        this.emit('peer', peer)
      }
    })
  }

  close(cb) {
    this.once('close', cb)
    this.discovery.close()
  }

  destroy() {
    this.close()
  }

  command(name, callback) {
    if (name && 'object' === typeof name) {
      for (const k in name) {
        this.command(k, name[k])
      }
    } else if ('string' === typeof name && 'function' === typeof callback) {
      this.commands[name] = callback
    } else if ('string' !== typeof name) {
      throw new TypeError('Expecting command name to be a string.')
    } else if ('function' !== typeof callback) {
      throw new TypeError('Expecting command callback to be a function.')
    }

    return this
  }
}

class Peer extends EventEmitter {
  static extended(rpc, manifest, opts) {
    class ExtendedPeer extends Peer { }

    for (const key of manifest.commands) {
      Object.assign(ExtendedPeer.prototype, {
        async [key](...args) {
          return this.call(key, args)
        }
      })
    }

    return new ExtendedPeer(rpc, opts)
  }

  constructor(rpc, opts) {
    super()
    this.setMaxListeners(0)
    this.rpc = rpc
  }

  call(name, args) {
    const { rpc } = this
    let cb = undefined

    if (args.length > 1 && 'function' === typeof args[args.length - 1]) {
      cb = args.pop()
    }

    return pify(call)()

    function call(done) {
      return rpc.call(name, args, callback(done, cb))
    }

    function callback(done, cb) {
      return (err, res) => {
        if ('function' === typeof cb) {
          try { cb(err, res) }
          catch (err) { return done(err) }
        }

        done(err, res)
      }
    }
  }
}

module.exports = Object.assign(createRPC, { RPC })
