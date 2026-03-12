import Peer, { DataConnection } from "peerjs"

export async function createPeer(params: {
  peerId?: string
  signalingServerHost: string
  iceServers?: RTCIceServer[]
}): Promise<Peer> {
  const { peerId, signalingServerHost, iceServers } = params
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerId, {
      host: signalingServerHost,
      secure: true,
      ...(iceServers !== undefined && { config: { iceServers } }),
    })
    peer.on("open", () => resolve(peer))
    peer.on("error", reject)
  })
}

export async function connect(
  me: Peer,
  otherPeerId: string,
): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    let conn: DataConnection
    me.on("error", reject)
    conn = me.connect(otherPeerId, { serialization: "json" })
    conn.on("error", reject)
    conn.on("close", reject)
    conn.on("open", () => resolve(conn))
  })
}
