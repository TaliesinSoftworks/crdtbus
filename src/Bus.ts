import { createPeriodical, createPubSub, next } from "./periodical"
import type { Sub, Get, Consumer } from "./periodical"
import { createPeer, connect } from "./peers"
import { v4 as uuid } from "uuid"
import { is } from "@benchristel/taste"
import { integrationTest, expect, equals } from "./integrationTest"
import { waitForMilliseconds } from "./wait"
import { resolvablePromise } from "./promises"
import { spy } from "./testUtilities"
import type { DataConnection } from "peerjs"
import type Peer from "peerjs"

export type Bus<T> = {
  id: string
  readonly state: Sub<T> & Get<T>
  readonly networkStatus: Sub<NetworkStatus> & Get<NetworkStatus>
  readonly whosOnline: Sub<Set<string>> & Get<Set<string>>
  apply(patch: T): void
  close(): void
  subscriber: () => void
  destroy(): void
}

export type BusConfig<T> = {
  readonly topic: string
  readonly agentId: string
  readonly signalingServerHost: string
  load(): T
  save(data: T): void
  merge(a: T, b: T): T
}

export type NetworkStatus = "pending" | "connected" | "reconnecting"

export function Bus<T>(config: BusConfig<T>): Bus<T> {
  const initialState = config.load()
  const agentId = config.agentId
  const state = createPeriodical(initialState)
  const updates = createPubSub<T>()
  const networkStatus = createPeriodical<NetworkStatus>("pending")
  const whosOnline = createPeriodical<Set<string>>(new Set())

  console.debug(`Creating bus: ${config.topic}`)

  let network = nullNetwork
  ;(async () =>
    (network = await PeerNetwork<T>(
      agentId,
      config.topic,
      config.signalingServerHost,
      state.get,
      networkStatus.pub,
      whosOnline.pub,
      updates.pub,
    )))()

  updates.sub((patch) => {
    const newState = config.merge(state.get(), patch)
    config.save(newState)
    state.pub(newState)
    self.subscriber()
  })

  const self = {
    id: config.topic,
    state,
    networkStatus,
    whosOnline,
    apply,
    close,
    subscriber: () => {},
    destroy: close,
  }
  return self

  function apply(patch: T): void {
    const newState = config.merge(state.get(), patch)
    config.save(newState)
    state.pub(newState)
    console.debug("sent: ", patch)
    network.send(patch)
    self.subscriber()
  }

  function close() {
    network.disconnect()
  }
}

function MemoryStore<T>(initialState: T) {
  let state = initialState
  return {
    load: () => state,
    save: (newState: T) => (state = newState),
  }
}

integrationTest("a Bus", {
  async "syncs a CRDT with another bus that has the same topic"() {
    type NumberObj = { [k: number]: number }
    const topic = uuid()
    const merge = (a: NumberObj, b: NumberObj) => ({ ...a, ...b })

    const store1 = MemoryStore({ 1: 1, 2: 2 })
    const bus1 = Bus<NumberObj>({
      topic,
      agentId: "agent-1",
      merge,
      ...store1,
      signalingServerHost: "drpeer2.onrender.com",
    })

    const store2 = MemoryStore({ 3: 3, 4: 4 })
    const bus2 = Bus<NumberObj>({
      topic,
      agentId: "agent-2",
      merge,
      ...store2,
      signalingServerHost: "drpeer2.onrender.com",
    })

    await Promise.all([next(bus1.state), next(bus2.state)])
    const expected = { 1: 1, 2: 2, 3: 3, 4: 4 }
    expect(bus1.state.get(), equals, expected)
    expect(bus2.state.get(), equals, expected)
    expect(store1.load(), equals, expected)
    expect(store2.load(), equals, expected)
  },

  async "syncs patches passed to apply()"() {
    type NumberObj = { [k: number]: number }
    const topic = uuid()
    const merge = (a: NumberObj, b: NumberObj) => ({ ...a, ...b })

    const store1 = MemoryStore({ 1: 1, 2: 2 })
    const bus1 = Bus<NumberObj>({
      topic,
      agentId: "agent-1",
      merge,
      ...store1,
      signalingServerHost: "drpeer2.onrender.com",
    })

    const store2 = MemoryStore({})
    const bus2 = Bus<NumberObj>({
      topic,
      agentId: "agent-2",
      merge,
      ...store2,
      signalingServerHost: "drpeer2.onrender.com",
    })

    // wait for states to sync
    await Promise.all([next(bus1.state), next(bus2.state)])

    bus1.apply({ 5: 5 })

    await next(bus2.state)

    const expected = { 1: 1, 2: 2, 5: 5 }
    expect(bus1.state.get(), equals, expected)
    expect(bus2.state.get(), equals, expected)
    expect(store1.load(), equals, expected)
    expect(store2.load(), equals, expected)
  },

  async "correctly syncs patches that are apply()d before the peers connect"() {
    type NumberObj = { [k: number]: number }
    const topic = uuid()
    const merge = (a: NumberObj, b: NumberObj) => ({ ...a, ...b })

    const store1 = MemoryStore({ 1: 1 })
    const bus1 = Bus<NumberObj>({
      topic,
      agentId: "agent-1",
      merge,
      ...store1,
      signalingServerHost: "drpeer2.onrender.com",
    })

    const store2 = MemoryStore({ 2: 2 })
    const bus2 = Bus<NumberObj>({
      topic,
      agentId: "agent-2",
      merge,
      ...store2,
      signalingServerHost: "drpeer2.onrender.com",
    })

    // NOTE: there's no await here, so the apply calls happen before the peers
    // have found each other.
    bus1.apply({ 5: 5 })
    bus2.apply({ 6: 6 })

    await Promise.all([next(bus1.state), next(bus2.state)])
    const expected = { 1: 1, 2: 2, 5: 5, 6: 6 }
    expect(bus1.state.get(), equals, expected)
    expect(bus2.state.get(), equals, expected)
    expect(store1.load(), equals, expected)
    expect(store2.load(), equals, expected)
  },

  "calls subscriber on apply()"() {
    const bus = Bus<string>({
      load: () => "loaded",
      merge: () => "merged",
      topic: uuid(),
      save: () => {},
      agentId: "007",
      signalingServerHost: "drpeer2.onrender.com",
    })
    const subscriber = spy()
    bus.subscriber = subscriber
    bus.apply("")
    expect(subscriber.calls, equals, [[]])
  },

  "updates the state by the time the subscriber is called"() {
    const bus = Bus<number>({
      load: () => 0,
      merge: Math.max,
      topic: uuid(),
      save: () => {},
      agentId: "007",
      signalingServerHost: "drpeer2.onrender.com",
    })
    let stateSeenBySubscriber: number | void = undefined
    const subscriber = () => (stateSeenBySubscriber = bus.state.get())
    bus.subscriber = subscriber
    bus.apply(5)
    expect(stateSeenBySubscriber, is, 5)
  },
})

// ==== PRIVATE STUFF BELOW ==============================

type Message<Data> =
  | {
      type: "whosOnline"
      agentIds: Array<string>
    }
  | {
      type: "hello"
      agentId: string
    }
  | {
      type: "data"
      data: Data
    }
  | {
      type: "heartbeat"
    }

type Network<Data> = {
  send(d: Data): void
  disconnect(): void
}

const nullNetwork: Network<any> = {
  send() {},
  disconnect() {},
}

async function PeerNetwork<Data>(
  agentId: string,
  topic: string,
  signalingServerHost: string,
  data: () => Data,
  networkStatus: Consumer<NetworkStatus>,
  whosOnline: Consumer<Set<string>>,
  update: Consumer<Data>,
): Promise<Network<Data>> {
  let agent: Agent<Data> = deadAgent
  let shouldReconnect: boolean = true

  const agentConfig = {
    id: agentId,
    topic,
    signalingServerHost,
    onUpdate: update,
    onOnlineAgentsChanged: whosOnline,
    getCurrentState: data,
  }

  ;(async () => {
    while (true) {
      if (!shouldReconnect) break
      agent = await createHost(agentConfig)
      networkStatus("connected")
      await agent.death
      if (!shouldReconnect) break
      networkStatus("reconnecting")
      agent = await createClient(agentConfig)
      networkStatus("connected")
      await agent.death
      if (!shouldReconnect) break
      networkStatus("reconnecting")
      await waitForMilliseconds(2000)
    }
  })()

  return {
    send(data: Data) {
      agent.send(data)
    },
    disconnect() {
      shouldReconnect = false
      agent.disconnect()
    },
  }
}

type Agent<Data> = {
  send(data: Data): void
  disconnect(): void
  death: Promise<void>
}

type AgentConfig<Data> = {
  id: string
  signalingServerHost: string
  topic: string
  onUpdate(data: Data): unknown
  onOnlineAgentsChanged(agentIds: Set<string>): unknown
  getCurrentState: () => Data
}

type ConnectionMetadata = {
  agentId: string
  timeToLive: number
}

async function createHost<Data>(
  config: AgentConfig<Data>,
): Promise<Agent<Data>> {
  const timeToLiveSeconds = 10
  const connections = new Map<DataConnection, ConnectionMetadata>()
  const [death, die] = resolvablePromise<void>()

  let peer: Peer
  try {
    peer = await createPeer({
      peerId: config.topic,
      signalingServerHost: config.signalingServerHost,
    })
  } catch (e) {
    return deadAgent
  }

  // on Firefox, PeerJS connections don't emit the "close"
  // event. To ensure dead connections get cleaned up
  // anyway, we have each peer send heartbeat messages while
  // it is alive. If the host doesn't receive a heartbeat
  // message for `timeToLiveSeconds`, it closes the
  // connection.
  const cleanupInterval = setInterval(() => {
    let deletedAny = false
    eachConnection((c) => {
      const metadata = connections.get(c)
      if (metadata && --metadata.timeToLive <= 0) {
        c.close()
        connections.delete(c)
        deletedAny = true
      }
    })
    if (deletedAny) tellEveryoneWhosOnline()
  }, 1000)

  // If we get disconnected from the signaling server,
  // it means the hostId is no longer reserved for us and
  // the next peer to join the bus will claim it,
  // leading to a split-brained state. Destroy the peer to
  // ensure there's only one host.
  peer.on("disconnected", disconnect)

  peer.on("error", disconnect)

  peer.on("connection", (conn: DataConnection) => {
    conn.on("close", () => closeConnection(conn))
    conn.on("error", () => closeConnection(conn))
    conn.on("data", (msg: Message<Data>) => {
      switch (msg.type) {
        case "heartbeat":
          const metadata = connections.get(conn)
          if (metadata) {
            metadata.timeToLive = timeToLiveSeconds
          }
          break
        case "hello":
          connections.set(conn, {
            agentId: msg.agentId,
            timeToLive: timeToLiveSeconds,
          })
          conn.send({ type: "data", data: config.getCurrentState() })
          tellEveryoneWhosOnline()
          break
        case "data":
          config.onUpdate(msg.data)
          eachConnection((c) => c !== conn && c.send(msg))
          break
      }
    })
  })

  function send(data: Data): void {
    eachConnection((c) => c.send({ type: "data", data }))
  }

  function disconnect() {
    clearInterval(cleanupInterval)
    peer.destroy()
    die()
  }

  function closeConnection(conn: DataConnection) {
    conn.close()
    connections.delete(conn)
    tellEveryoneWhosOnline()
  }

  function tellEveryoneWhosOnline() {
    const agentIds = [
      config.id,
      ...[...connections.values()].map((c) => c.agentId),
    ]
    config.onOnlineAgentsChanged(new Set(agentIds))
    eachConnection((c) =>
      c.send({
        type: "whosOnline",
        agentIds,
      }),
    )
  }

  function eachConnection(callback: (conn: DataConnection) => unknown): void {
    for (const conn of connections.keys()) {
      callback(conn)
    }
  }

  return {
    send,
    disconnect,
    death,
  }
}

async function createClient<Data>(
  config: AgentConfig<Data>,
): Promise<Agent<Data>> {
  let heartbeatInterval: any
  const hostPeerId = config.topic
  let peer: Peer
  try {
    peer = await createPeer({ signalingServerHost: config.signalingServerHost })
  } catch (e) {
    console.error("error calling createPeer in createClient:", e)
    return deadAgent
  }

  const [death, die] = resolvablePromise<void>()
  peer.on("error", disconnect)

  let hostConn: DataConnection
  try {
    hostConn = await connect(peer, hostPeerId)
  } catch (e) {
    console.error("error connecting to host in createClient:", e)
    disconnect()
    return {
      send() {},
      disconnect() {},
      death,
    }
  }
  console.debug("> connected to host")
  hostConn.on("close", disconnect)
  hostConn.on("error", disconnect)
  hostConn.on("data", (msg: Message<Data>) => {
    switch (msg.type) {
      case "whosOnline":
        config.onOnlineAgentsChanged(new Set(msg.agentIds))
        break
      case "data":
        config.onUpdate(msg.data)
        break
    }
  })

  hostConn.send({
    type: "hello",
    agentId: config.id,
  })

  hostConn.send({
    type: "data",
    data: config.getCurrentState(),
  })

  heartbeatInterval = setInterval(() => {
    hostConn.send({ type: "heartbeat" })
  }, 5000)

  function send(data: Data) {
    hostConn.send({
      type: "data",
      data,
    })
  }

  function disconnect() {
    clearInterval(heartbeatInterval)
    peer.destroy()
    die()
  }

  return {
    send,
    disconnect,
    death,
  }
}

const deadAgent = {
  send() {},
  disconnect() {},
  death: Promise.resolve(),
}
