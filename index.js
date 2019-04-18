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

function wrapCommand(callback) {
  return (req, reply) => {
    const args = req.arguments.concat(reply, req)

    if (0 === req.arguments.length) {
      args.unshift(undefined)
    }

    return callback(...args)
  }
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
    this.peers = {}

    this.onclose = this.onclose.bind(this)
    this.onerror = this.onerror.bind(this)
    this.onpeer = this.onpeer.bind(this)

    this.discovery.on('close', this.onclose)
    this.discovery.on('error', this.onerror)
    this.discovery.on('peer', this.onpeer)

    this.ready(() => {
    })
  }

  get manifest() {
    const manifest = { commands: [] }
    for (const name in this.commands) {
      const callback = this.commands[name]
      if ('function' === typeof callback) {
        manifest.commands.push(name)
      }
    }

    return manifest
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

  onpeer(stream, id) {
    const { manifest } = this
    const rpc = protocol({ stream })

    this.peers[id] =  { stream, rpc }

    for (const name of manifest.commands) {
      const callback = this.commands[name]
      if ('function' === typeof callback) {
        rpc.command(name, wrapCommand(callback))
      }
    }

    this.emit('connection', stream)
    this.once('close', () => stream.destroy())
    stream.once('close', () => { delete this.peers[id] })

    // install 'Manifest' extension
    rpc.extension(MANIFEST, messages.Manifest)
    rpc.send(MANIFEST, manifest)
    rpc.once('close', () => {
      console.log('destroy');
      stream.destroy()
    })

    rpc.on('extension', (ext, type, buffer, reply) => {
      if (MANIFEST === type) {
        let channel = null

        if (!channel) {
          channel = Peer.extended(rpc, ext)
          this.emit('peer', channel, stream)
        } else {
          Object.assign(
            Object.getPrototypeOf(channel),
            Object.getPrototypeOf(Peer.extended(rpc, ext))
          )
        }

        this.peers[id].channel = channel
        this.emit('manifest', ext)
      }
    })
  }

  close(cb) {
    if ('function' === typeof cb) {
      this.once('close', cb)
    }

    this.discovery.close()

    for (const id in this.peers) {
      const peer = this.peers[id]
      if (peer.rpc) {
        peer.rpc.close()
      }

      if (peer.stream) {
        peer.stream.destroy()
      }
    }
  }

  destroy() {
    this.close()
  }

  command(name, callback) {
    let exists = false
    if (name && 'object' === typeof name) {
      for (const k in name) {
        this.command(k, name[k])
      }
      return this
    } else if ('string' === typeof name && 'function' === typeof callback) {
      if (name in this.commands && 'function' === typeof this.commands[name]) {
        exists = true
      } else {
        this.commands[name] = callback
      }
    } else if ('string' !== typeof name) {
      throw new TypeError('Expecting command name to be a string.')
    } else if ('function' !== typeof callback) {
      throw new TypeError('Expecting command callback to be a function.')
    }

    if (!exists && Object.keys(this.peers).length) {
      for (const id in this.peers) {
        const peer = this.peers[id]
        peer.rpc.command(name, wrapCommand(callback))
        peer.rpc.send(MANIFEST, this.manifest)
      }
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
    this.closed = false
    this.destroyed = false

    rpc.once('close', () => {
      this.closed = true
      this.destroyed = true
      this.close()
      this.emit('close')
    })
  }

  call(name, args) {
    if (this.destroyed || this.closed) {
      return Promise.reject(new Error('Peer closed'))
    }

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

  close(cb) {
    this.rpc.destroy(cb)
  }

  destroy() {
    this.close()
  }
}

module.exports = Object.assign(createRPC, { RPC })
