import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(name) {
        this.values.add(name);
    }

    remove(name) {
        this.values.delete(name);
    }

    contains(name) {
        return this.values.has(name);
    }
}

class FakeElement {
    constructor(tagName = "div") {
        this.tagName = tagName;
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.attributes = {};
        this.listeners = {};
        this.classList = new FakeClassList();
        this.className = "";
        this.textContent = "";
        this.tabIndex = -1;
        this.isFragment = false;
    }

    append(...items) {
        this.children.push(...items);
    }

    appendChild(item) {
        if (item.isFragment) {
            this.children.push(...item.children);
            item.children = [];
        } else {
            this.children.push(item);
        }
        return item;
    }

    addEventListener(type, handler) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(handler);
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    setPointerCapture() {}

    closest(selector) {
        if (selector === "[data-layer]") {
            return this.dataset.layer !== undefined ? this : null;
        }
        return null;
    }

    dispatch(type, event) {
        for (const handler of this.listeners[type] || []) {
            handler(event);
        }
    }
}

function loadApp() {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(match, "index.html should contain an inline script");

    const byId = {};
    for (const id of [
        "dna-system",
        "viewport",
        "info-card",
        "modal-cat",
        "modal-title",
        "modal-desc",
        "modal-stats",
        "close-btn"
    ]) {
        byId[id] = new FakeElement();
    }

    const documentStub = {
        body: new FakeElement("body"),
        hidden: false,
        getElementById(id) {
            return byId[id];
        },
        createElement(tagName) {
            return new FakeElement(tagName);
        },
        createDocumentFragment() {
            const fragment = new FakeElement();
            fragment.isFragment = true;
            return fragment;
        },
        addEventListener() {}
    };

    const sandbox = {
        document: documentStub,
        window: {
            matchMedia() {
                return { matches: true };
            }
        },
        requestAnimationFrame() {
            return 0;
        },
        cancelAnimationFrame() {},
        setTimeout,
        console
    };

    vm.createContext(sandbox);
    vm.runInContext(match[1], sandbox);

    return {
        system: byId["dna-system"],
        viewport: byId["viewport"]
    };
}

function dotPositions(system) {
    return system.children
        .filter((child) => child.className === "nucleotide")
        .map((child) => {
            const matched = child.style.transform.match(
                /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/
            );
            assert.ok(matched, "nucleotide should have a projected transform");
            return { x: Number(matched[1]), y: Number(matched[2]) };
        });
}

function dotScales(system) {
    return system.children
        .filter((child) => child.className === "nucleotide")
        .map((child) => {
            const matched = child.style.transform.match(/scale\((-?[\d.]+)\)/);
            assert.ok(matched, "nucleotide should have a scale");
            return Number(matched[1]);
        });
}

function pointerEvent(viewport, pointerId, clientX, clientY, button = 0) {
    return {
        pointerId,
        clientX,
        clientY,
        button,
        buttons: 1,
        target: viewport,
        preventDefault() {}
    };
}

test("wheel zoom repaints immediately when animation is not running", () => {
    const { system, viewport } = loadApp();
    const beforeScales = dotScales(system);

    viewport.dispatch("wheel", { deltaY: -100, preventDefault() {} });

    const afterScales = dotScales(system);
    assert.equal(afterScales.length, beforeScales.length);
    assert.ok(
        afterScales.some((scale, index) => scale > beforeScales[index]),
        "wheel zoom in should increase a nucleotide scale without waiting for an animation frame"
    );
});

test("ending a pinch does not make the remaining pointer jump", () => {
    const { system, viewport } = loadApp();

    viewport.dispatch("pointerdown", pointerEvent(viewport, 1, 100, 100));
    viewport.dispatch("pointermove", pointerEvent(viewport, 1, 115, 100));

    viewport.dispatch("pointerdown", pointerEvent(viewport, 2, 200, 100));
    viewport.dispatch("pointermove", pointerEvent(viewport, 1, 90, 100));
    viewport.dispatch("pointermove", pointerEvent(viewport, 2, 210, 100));

    viewport.dispatch("pointerup", pointerEvent(viewport, 2, 210, 100));

    const before = dotPositions(system);
    viewport.dispatch("pointermove", pointerEvent(viewport, 1, 91, 100));
    const after = dotPositions(system);

    let maxMove = 0;
    for (let i = 0; i < before.length; i += 1) {
        maxMove = Math.max(
            maxMove,
            Math.hypot(after[i].x - before[i].x, after[i].y - before[i].y)
        );
    }

    assert.ok(
        maxMove < 3,
        "a 1px move after a pinch should move dots by less than 3px, got " + maxMove
    );
});
