import { createPeriodical, createPubSub, next } from "./periodical";
import { createPeer, connect } from "./peers";
import { v4 as uuid } from "uuid";
import { is } from "@benchristel/taste";
import { integrationTest, expect, equals } from "./integrationTest";
import { waitForMilliseconds } from "./wait";
import { resolvablePromise } from "./promises";
import { spy } from "./testUtilities";
export function Bus(config) {
    const initialState = config.load();
    const agentId = config.agentId;
    const state = createPeriodical(initialState);
    const updates = createPubSub();
    const networkStatus = createPeriodical("pending");
    const whosOnline = createPeriodical(new Set());
    console.debug(`Creating bus: ${config.topic}`);
    let network = nullNetwork;
    (async () => (network = await PeerNetwork(agentId, config.topic, state.get, networkStatus.pub, whosOnline.pub, updates.pub)))();
    updates.sub((patch) => {
        const newState = config.merge(state.get(), patch);
        config.save(newState);
        state.pub(newState);
        self.subscriber();
    });
    const self = {
        id: config.topic,
        state,
        networkStatus,
        whosOnline,
        apply,
        close,
        subscriber: () => { },
        destroy: close,
    };
    return self;
    function apply(patch) {
        const newState = config.merge(state.get(), patch);
        config.save(newState);
        state.pub(newState);
        console.debug("sent: ", patch);
        network.send(patch);
        self.subscriber();
    }
    function close() {
        network.disconnect();
    }
}
function MemoryStore(initialState) {
    let state = initialState;
    return {
        load: () => state,
        save: (newState) => (state = newState),
    };
}
integrationTest("a Bus", {
    async "syncs a CRDT with another bus that has the same topic"() {
        const topic = uuid();
        const merge = (a, b) => ({ ...a, ...b });
        const store1 = MemoryStore({ 1: 1, 2: 2 });
        const bus1 = Bus({
            topic,
            agentId: "agent-1",
            merge,
            ...store1,
        });
        const store2 = MemoryStore({ 3: 3, 4: 4 });
        const bus2 = Bus({
            topic,
            agentId: "agent-2",
            merge,
            ...store2,
        });
        await Promise.all([next(bus1.state), next(bus2.state)]);
        const expected = { 1: 1, 2: 2, 3: 3, 4: 4 };
        expect(bus1.state.get(), equals, expected);
        expect(bus2.state.get(), equals, expected);
        expect(store1.load(), equals, expected);
        expect(store2.load(), equals, expected);
    },
    async "syncs patches passed to apply()"() {
        const topic = uuid();
        const merge = (a, b) => ({ ...a, ...b });
        const store1 = MemoryStore({ 1: 1, 2: 2 });
        const bus1 = Bus({
            topic,
            agentId: "agent-1",
            merge,
            ...store1,
        });
        const store2 = MemoryStore({});
        const bus2 = Bus({
            topic,
            agentId: "agent-2",
            merge,
            ...store2,
        });
        // wait for states to sync
        await Promise.all([next(bus1.state), next(bus2.state)]);
        bus1.apply({ 5: 5 });
        await next(bus2.state);
        const expected = { 1: 1, 2: 2, 5: 5 };
        expect(bus1.state.get(), equals, expected);
        expect(bus2.state.get(), equals, expected);
        expect(store1.load(), equals, expected);
        expect(store2.load(), equals, expected);
    },
    async "correctly syncs patches that are apply()d before the peers connect"() {
        const topic = uuid();
        const merge = (a, b) => ({ ...a, ...b });
        const store1 = MemoryStore({ 1: 1 });
        const bus1 = Bus({
            topic,
            agentId: "agent-1",
            merge,
            ...store1,
        });
        const store2 = MemoryStore({ 2: 2 });
        const bus2 = Bus({
            topic,
            agentId: "agent-2",
            merge,
            ...store2,
        });
        // NOTE: there's no await here, so the apply calls happen before the peers
        // have found each other.
        bus1.apply({ 5: 5 });
        bus2.apply({ 6: 6 });
        await Promise.all([next(bus1.state), next(bus2.state)]);
        const expected = { 1: 1, 2: 2, 5: 5, 6: 6 };
        expect(bus1.state.get(), equals, expected);
        expect(bus2.state.get(), equals, expected);
        expect(store1.load(), equals, expected);
        expect(store2.load(), equals, expected);
    },
    "calls subscriber on apply()"() {
        const bus = Bus({
            load: () => "loaded",
            merge: () => "merged",
            topic: uuid(),
            save: () => { },
            agentId: "007",
        });
        const subscriber = spy();
        bus.subscriber = subscriber;
        bus.apply("");
        expect(subscriber.calls, equals, [[]]);
    },
    "updates the state by the time the subscriber is called"() {
        const bus = Bus({
            load: () => 0,
            merge: Math.max,
            topic: uuid(),
            save: () => { },
            agentId: "007",
        });
        let stateSeenBySubscriber = undefined;
        const subscriber = () => (stateSeenBySubscriber = bus.state.get());
        bus.subscriber = subscriber;
        bus.apply(5);
        expect(stateSeenBySubscriber, is, 5);
    },
});
const nullNetwork = {
    send() { },
    disconnect() { },
};
async function PeerNetwork(agentId, topic, data, networkStatus, whosOnline, update) {
    let agent = deadAgent;
    let shouldReconnect = true;
    const agentConfig = {
        id: agentId,
        topic,
        onUpdate: update,
        onOnlineAgentsChanged: whosOnline,
        getCurrentState: data,
    };
    (async () => {
        while (true) {
            if (!shouldReconnect)
                break;
            agent = await createHost(agentConfig);
            networkStatus("connected");
            await agent.death;
            if (!shouldReconnect)
                break;
            networkStatus("reconnecting");
            agent = await createClient(agentConfig);
            networkStatus("connected");
            await agent.death;
            if (!shouldReconnect)
                break;
            networkStatus("reconnecting");
            await waitForMilliseconds(2000);
        }
    })();
    return {
        send(data) {
            agent.send(data);
        },
        disconnect() {
            shouldReconnect = false;
            agent.disconnect();
        },
    };
}
async function createHost(config) {
    const timeToLiveSeconds = 10;
    const hostId = config.topic;
    const connections = new Map();
    const [death, die] = resolvablePromise();
    let peer;
    try {
        peer = await createPeer(hostId);
    }
    catch (e) {
        return deadAgent;
    }
    // on Firefox, PeerJS connections don't emit the "close"
    // event. To ensure dead connections get cleaned up
    // anyway, we have each peer send heartbeat messages while
    // it is alive. If the host doesn't receive a heartbeat
    // message for `timeToLiveSeconds`, it closes the
    // connection.
    const cleanupInterval = setInterval(() => {
        let deletedAny = false;
        eachConnection((c) => {
            const metadata = connections.get(c);
            if (metadata && --metadata.timeToLive <= 0) {
                c.close();
                connections.delete(c);
                deletedAny = true;
            }
        });
        if (deletedAny)
            tellEveryoneWhosOnline();
    }, 1000);
    // If we get disconnected from the signaling server,
    // it means the hostId is no longer reserved for us and
    // the next peer to join the bus will claim it,
    // leading to a split-brained state. Destroy the peer to
    // ensure there's only one host.
    peer.on("disconnected", disconnect);
    peer.on("error", disconnect);
    peer.on("connection", (conn) => {
        conn.on("close", () => closeConnection(conn));
        conn.on("error", () => closeConnection(conn));
        conn.on("data", (msg) => {
            switch (msg.type) {
                case "heartbeat":
                    const metadata = connections.get(conn);
                    if (metadata) {
                        metadata.timeToLive = timeToLiveSeconds;
                    }
                    break;
                case "hello":
                    connections.set(conn, {
                        agentId: msg.agentId,
                        timeToLive: timeToLiveSeconds,
                    });
                    conn.send({ type: "data", data: config.getCurrentState() });
                    tellEveryoneWhosOnline();
                    break;
                case "data":
                    config.onUpdate(msg.data);
                    eachConnection((c) => c !== conn && c.send(msg));
                    break;
            }
        });
    });
    function send(data) {
        eachConnection((c) => c.send({ type: "data", data }));
    }
    function disconnect() {
        clearInterval(cleanupInterval);
        peer.destroy();
        die();
    }
    function closeConnection(conn) {
        conn.close();
        connections.delete(conn);
        tellEveryoneWhosOnline();
    }
    function tellEveryoneWhosOnline() {
        const agentIds = [
            config.id,
            ...[...connections.values()].map((c) => c.agentId),
        ];
        config.onOnlineAgentsChanged(new Set(agentIds));
        eachConnection((c) => c.send({
            type: "whosOnline",
            agentIds,
        }));
    }
    function eachConnection(callback) {
        for (const conn of connections.keys()) {
            callback(conn);
        }
    }
    return {
        send,
        disconnect,
        death,
    };
}
async function createClient(config) {
    let heartbeatInterval;
    const hostPeerId = config.topic;
    let peer;
    try {
        peer = await createPeer();
    }
    catch (e) {
        console.error("error calling createPeer in createClient:", e);
        return deadAgent;
    }
    const [death, die] = resolvablePromise();
    peer.on("error", disconnect);
    let hostConn;
    try {
        hostConn = await connect(peer, hostPeerId);
    }
    catch (e) {
        console.error("error connecting to host in createClient:", e);
        disconnect();
        return {
            send() { },
            disconnect() { },
            death,
        };
    }
    console.debug("> connected to host");
    hostConn.on("close", disconnect);
    hostConn.on("error", disconnect);
    hostConn.on("data", (msg) => {
        switch (msg.type) {
            case "whosOnline":
                config.onOnlineAgentsChanged(new Set(msg.agentIds));
                break;
            case "data":
                config.onUpdate(msg.data);
                break;
        }
    });
    hostConn.send({
        type: "hello",
        agentId: config.id,
    });
    hostConn.send({
        type: "data",
        data: config.getCurrentState(),
    });
    heartbeatInterval = setInterval(() => {
        hostConn.send({ type: "heartbeat" });
    }, 5000);
    function send(data) {
        hostConn.send({
            type: "data",
            data,
        });
    }
    function disconnect() {
        clearInterval(heartbeatInterval);
        peer.destroy();
        die();
    }
    return {
        send,
        disconnect,
        death,
    };
}
const deadAgent = {
    send() { },
    disconnect() { },
    death: Promise.resolve(),
};
