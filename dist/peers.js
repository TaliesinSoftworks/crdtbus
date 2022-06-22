import Peer from "peerjs";
export async function createPeer(peerId) {
    return new Promise((resolve, reject) => {
        const peer = new Peer(peerId);
        peer.on("open", () => resolve(peer));
        peer.on("error", reject);
    });
}
export async function connect(me, otherPeerId) {
    return new Promise((resolve, reject) => {
        let conn;
        me.on("error", reject);
        conn = me.connect(otherPeerId, { serialization: "json" });
        conn.on("error", reject);
        conn.on("close", reject);
        conn.on("open", () => resolve(conn));
    });
}
