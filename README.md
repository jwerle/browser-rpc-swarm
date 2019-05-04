browser-rpc-swarm
=================

Give control of your browser over RPC to another in a discovery swarm.
This module uses
[rpc-protocol](https://github.com/secure-local-node/rpc-protocol) and
[webrtc-swarm](https://github.com/mafintosh/webrtc-swarm) to discovery
peers and initiate a RPC channel.

## Installation

```sh
$ npm install browser-rpc-swarm
```

## Usage

```js
const signalhub = require('signalhub')
const swarm = require('./')
const key = '626d55ffe6eafc13e32309ca4985b83cf15c0c015e6ba8f32dcebed2a50e0c27'
const hub = signalhub(key, [ 'yourdomain.com' ])
const rpc = swarm(hub)

rpc.command({
  async echo(value) {
    return value
  }
})

rpc.on('peer', (peer) => {
  console.log(await peer.echo('hello world')) // 'hello world'
})
```

## API

### `rpc = require('browser-rpc-swarm')(signalhub, opts)`

where `signalhub` is a
[signalhub](https://github.com/mafintosh/signalhub) instance and `opts`
is passed directly to
[webrtc-swarm](https://github.com/mafintosh/webrtc-swarm).

#### `rpc.command(name, callback)`

Create a named command with a callback function to resolve a response to
the caller.

```js
// A simple 'echo' command that simply returns the value given to it
rpc.command('echo', (value) => value
```

#### `rpc.command(manifest)`

Create several commands described by an object with functions that are
callbacks to resolve a response to the caller.

```js
rpc.command({
  echo(value) {
    return value
  }
})
```

#### `rpc.destroy()`

An alias to to `rpc.close()`

#### `rpc.close(callback)`

Close the RPC channel and all of its resources.

#### `rpc.on('peer', peer)`

Emitted when a peer connection has been established and a command
manifest has been exchanged. Commands are attached directly to the
instance and can be called like normal functions. They return promises
that resolve when the peer replying to command issues a response.

Consider a command called `echo()` that a peer defines in their
manifest. The command simply returns the input argument given to it.

```js
rpc.command({
  echo(value) {
    return value
  }
})
```

The caller for this command can call this command after peer discovery
like a normal function.

```js
rpc.on('peer', async (peer) => {
  console.log(await rpc.echo('hello world')) // 'hello world'
})
```

## License

MIT
