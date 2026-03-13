import { test, expect, is, equals } from "@benchristel/taste";
import { resolvablePromise } from "./promises";
import { spy } from "./testUtilities";
export function createPeriodical(val) {
    const pubsub = createPubSub();
    return {
        get,
        pub: (val) => {
            set(val);
            pubsub.pub(val);
        },
        sub: pubsub.sub,
        unsub: pubsub.unsub,
    };
    function get() {
        return val;
    }
    function set(_val) {
        val = _val;
    }
}
test("a Periodical", {
    "contains a value"() {
        const p = createPeriodical(1);
        expect(p.get(), is, 1);
    },
    "updates the value"() {
        const p = createPeriodical(1);
        p.pub(2);
        expect(p.get(), is, 2);
    },
    "notifies a subscriber of updates"() {
        const p = createPeriodical(1);
        const subscriber = spy();
        p.sub(subscriber);
        p.pub(2);
        expect(subscriber.calls, equals, [[2]]);
        p.pub(3);
        expect(subscriber.calls, equals, [[2], [3]]);
    },
    "notifies multiple subscribers"() {
        const p = createPeriodical(1);
        const subscriber1 = spy();
        const subscriber2 = spy();
        p.sub(subscriber1);
        p.sub(subscriber2);
        p.pub(2);
        expect(subscriber1.calls, equals, [[2]]);
        expect(subscriber2.calls, equals, [[2]]);
    },
    "is up-to-date by the time subscribers are notified"() {
        const p = createPeriodical(1);
        p.sub((val) => expect(val, is, p.get()));
        p.pub(2);
    },
    "does not notify unsubscribers"() {
        const p = createPeriodical(1);
        const subscriber = spy();
        p.sub(subscriber);
        p.unsub(subscriber);
        p.pub(2);
        expect(subscriber.calls, equals, []);
    },
    "??? when you unsubscribe in a subscription callback"() {
        // characterization test; don't rely on this behavior
        const p = createPeriodical(1);
        const subscriber1 = function () {
            p.unsub(subscriber2);
        };
        const subscriber2 = spy();
        p.sub(subscriber1);
        p.sub(subscriber2);
        p.pub(2);
        expect(subscriber2.calls, equals, []);
    },
});
export function next(periodical) {
    const [promise, resolve] = resolvablePromise();
    periodical.sub(resolve);
    // UNTESTED CODE: free the subscriber when it's done its job
    promise.then(() => periodical.unsub(resolve));
    return promise;
}
test("next", {
    async "returns a promise that resolves when the given periodical publishes"() {
        const p = createPeriodical(1);
        Promise.resolve().then(() => p.pub(2));
        const issue = await next(p);
        expect(issue, is, 2);
    },
});
export function createPubSub() {
    const subs = new Set();
    return {
        pub,
        sub,
        unsub,
    };
    function pub(val) {
        subs.forEach((sub) => sub(val));
    }
    function sub(subscriber) {
        subs.add(subscriber);
    }
    function unsub(subscriber) {
        subs.delete(subscriber);
    }
}
