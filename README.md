# crdtbus

Sync a CRDT across browser tabs or devices — no server, no backend. Peers connect directly via WebRTC using [PeerJS](https://peerjs.com/).

You bring the CRDT (a `merge` function). `crdtbus` handles peer discovery, connection management, reconnection, and state propagation.

Used in production by [Druthers](https://druthers.app), a multiplayer ranked-choice polling app.

## Install

```sh
npm install @taliesinsoftworks/crdtbus
```

> **Note:** This package is published to the GitHub Package Registry. You'll need a GitHub token with `read:packages` scope:
>
> ```sh
> # .npmrc
> @taliesinsoftworks:registry=https://npm.pkg.github.com
> //npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
> ```

## Usage

```ts
import { Bus } from "@taliesinsoftworks/crdtbus"

type Doc = { [key: string]: string }

const bus = Bus<Doc>({
  // A shared topic ID — all peers using the same topic will sync with each other.
  topic: "my-shared-room",

  // A stable ID for this peer/agent (e.g. stored in localStorage).
  agentId: "user-abc123",

  // Your CRDT merge function. Must be commutative, associative, and idempotent.
  merge: (a, b) => ({ ...a, ...b }),

  // Load persisted state (e.g. from localStorage).
  load: () => JSON.parse(localStorage.getItem("doc") ?? "{}"),

  // Persist state after each merge.
  save: (state) => localStorage.setItem("doc", JSON.stringify(state)),

  // A PeerJS-compatible signaling server host.
  signalingServerHost: "drpeer2.onrender.com",
})

// Read the current state.
const current = bus.state.get()

// Apply a patch locally and broadcast it to all connected peers.
bus.apply({ greeting: "hello" })

// React to state changes (e.g. to re-render your UI).
bus.subscriber = () => {
  render(bus.state.get())
}

// Subscribe to individual state updates via the periodical interface.
bus.state.sub((newState) => {
  console.log("state changed:", newState)
})

// See who else is connected.
bus.whosOnline.sub((agentIds) => {
  console.log("online:", [...agentIds])
})

// Watch the network status: "pending" | "connected" | "reconnecting"
bus.networkStatus.sub((status) => {
  console.log("network:", status)
})

// Tear down when done.
bus.close()
```

## Real-world example

Here's how [Druthers](https://druthers.app) creates a bus for a collaborative poll:

```tsx
import { Bus } from "@taliesinsoftworks/crdtbus"

const bus = Bus<PollCRDT>({
  topic: pollID,           // UUID from the URL hash
  agentId: myAgentId,     // stable ID from localStorage
  merge,                  // CRDT merge for the poll data structure
  load: () => {
    const raw = localStorage.getItem(pollID)
    return raw ? JSON.parse(raw) : emptyPoll()
  },
  save: (state) => {
    localStorage.setItem(pollID, JSON.stringify(state))
  },
  signalingServerHost: "drpeer.onrender.com",
})

// Apply a patch (broadcasts to all peers and merges locally).
bus.apply(withCandidate(newCandidate, bus.state.get()))

// Read state inline.
const current = bus.state.get()
```

## API

### `Bus<T>(config: BusConfig<T>): Bus<T>`

Creates a bus and immediately begins connecting to peers on the given `topic`.

#### `BusConfig<T>`

| Field | Type | Description |
|---|---|---|
| `topic` | `string` | Shared room identifier. All peers with the same `topic` sync together. |
| `agentId` | `string` | Stable identifier for this peer. Should persist across page loads. |
| `merge` | `(a: T, b: T) => T` | Your CRDT merge function. Must be commutative, associative, and idempotent. |
| `load` | `() => T` | Returns the initial state (e.g. from localStorage). |
| `save` | `(state: T) => void` | Called after every merge to persist state. |
| `signalingServerHost` | `string` | Hostname of a PeerJS signaling server. |

#### `Bus<T>`

| Member | Type | Description |
|---|---|---|
| `id` | `string` | Same as `config.topic`. |
| `state` | `Sub<T> & Get<T>` | The current CRDT state. Call `.get()` to read, `.sub(fn)` / `.unsub(fn)` to subscribe. |
| `networkStatus` | `Sub<NetworkStatus> & Get<NetworkStatus>` | `"pending"` → `"connected"` → `"reconnecting"`. |
| `whosOnline` | `Sub<Set<string>> & Get<Set<string>>` | The `agentId`s of currently connected peers (including yourself). |
| `apply(patch: T)` | `void` | Merges `patch` into local state, persists it, and broadcasts it to all connected peers. |
| `subscriber` | `() => void` | Optional callback. Called after every local `apply()` and every incoming peer update. Useful for triggering a re-render. |
| `close()` / `destroy()` | `void` | Disconnects from all peers and stops reconnecting. |

### `NetworkStatus`

```ts
type NetworkStatus = "pending" | "connected" | "reconnecting"
```

- **`pending`** — Not yet connected to the signaling server.
- **`connected`** — Connected and ready to exchange data.
- **`reconnecting`** — Lost connection; attempting to reconnect.

## How it works

Each bus has one **host** and zero or more **clients** for a given `topic`.

- The first peer to claim a `topic` on the signaling server becomes the **host**. Incoming peers connect to it.
- The host merges and fans out state updates to all clients.
- If the host disconnects, the next peer becomes the host after a brief reconnect loop.
- Peers send their full local state on connect, so latecomers immediately sync up.
- Clients send periodic **heartbeats**. The host uses these to detect dead connections (works around a Firefox PeerJS bug where `"close"` events aren't emitted).
- `apply()` works even before peers have connected — patches are buffered and sent once a connection is established.

## Signaling server

You need a running [PeerJS server](https://github.com/peers/peerjs-server) accessible over HTTPS. Point `signalingServerHost` at its hostname (without protocol).

Druthers uses `drpeer2.onrender.com` — a free-tier Render.com deployment.

## Development

```sh
yarn install
yarn ts      # TypeScript watch mode
```

Integration tests require a live signaling server and are run in the browser via `test.html`.

## License

MIT
