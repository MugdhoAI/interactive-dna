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

    getBoundingClientRect() {
        return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
    }

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
        "close-btn",
        "reset-btn"
    ]) {
        byId[id] = new FakeElement();
    }

    const docListeners = {};
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
        addEventListener(type, handler) {
            if (!docListeners[type]) {
                docListeners[type] = [];
            }
            docListeners[type].push(handler);
        },
        dispatch(type, event) {
            for (const handler of docListeners[type] || []) {
                handler(event);
            }
        }
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
        viewport: byId["viewport"],
        doc: documentStub,
        resetBtn: byId["reset-btn"]
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

test("keyboard zoom changes scale and clamps at the zoom limits", () => {
    const { system, doc } = loadApp();
    const beforeScales = dotScales(system);

    doc.dispatch("keydown", { key: "+" });
    const zoomedIn = dotScales(system);
    assert.ok(
        zoomedIn.some((scale, index) => scale > beforeScales[index]),
        "pressing + should increase a nucleotide scale"
    );

    doc.dispatch("keydown", { key: "-" });
    const zoomedBack = dotScales(system);
    assert.deepEqual(
        zoomedBack.map((scale) => scale.toFixed(6)),
        beforeScales.map((scale) => scale.toFixed(6)),
        "pressing - once after + once should return to the starting zoom"
    );

    const zoomOut = () => {
        const { system: nextSystem, doc: nextDoc } = loadApp();
        for (let i = 0; i < 40; i += 1) {
            nextDoc.dispatch("keydown", { key: "-" });
        }
        return dotScales(nextSystem);
    };
    const minScales = zoomOut();
    const minScalesAgain = zoomOut();
    assert.deepEqual(
        minScalesAgain.map((scale) => scale.toFixed(6)),
        minScales.map((scale) => scale.toFixed(6)),
        "repeated - presses should stop at the minimum zoom"
    );
    assert.ok(
        minScales.some((scale, index) => scale < beforeScales[index]),
        "repeated - presses should zoom out below the starting zoom"
    );

    const zoomIn = () => {
        const { system: nextSystem, doc: nextDoc } = loadApp();
        for (let i = 0; i < 40; i += 1) {
            nextDoc.dispatch("keydown", { key: "+" });
        }
        return dotScales(nextSystem);
    };
    const maxScales = zoomIn();
    const maxScalesAgain = zoomIn();
    assert.deepEqual(
        maxScalesAgain.map((scale) => scale.toFixed(6)),
        maxScales.map((scale) => scale.toFixed(6)),
        "repeated + presses should stop at the maximum zoom"
    );
    assert.ok(
        maxScales.some((scale, index) => scale > beforeScales[index]),
        "repeated + presses should zoom in above the starting zoom"
    );
});

test("Reset view button restores the starting camera", () => {
    const { system, viewport, resetBtn } = loadApp();
    const before = dotPositions(system);

    viewport.dispatch("pointerdown", pointerEvent(viewport, 1, 100, 100));
    viewport.dispatch("pointermove", pointerEvent(viewport, 1, 160, 80));
    viewport.dispatch("wheel", { deltaY: -100, preventDefault() {} });
    const moved = dotPositions(system);
    assert.ok(
        moved.some((pos, index) =>
            Math.hypot(pos.x - before[index].x, pos.y - before[index].y) > 3
        ),
        "dragging and zooming should move the dots first"
    );

    resetBtn.dispatch("click", {});

    const after = dotPositions(system);
    assert.deepEqual(
        after.map((pos) => [pos.x.toFixed(6), pos.y.toFixed(6)]),
        before.map((pos) => [pos.x.toFixed(6), pos.y.toFixed(6)]),
        "Reset view should restore the starting dot positions"
    );
});

test("wheel zoom keeps the point under the cursor in place", () => {
    // Cursor at (700, 300) in an 800x600 viewport, so 300px right of center.
    // Zooming in from 0.8 to 0.9 scales every dot about that cursor point.
    const { system, viewport } = loadApp();
    const before = dotPositions(system);

    viewport.dispatch("wheel", { clientX: 700, clientY: 300, deltaY: -100, preventDefault() {} });

    const after = dotPositions(system);
    const ratio = 0.9 / 0.8;
    for (let i = 0; i < before.length; i += 1) {
        const expectedX = ratio * (before[i].x - 300) + 300;
        const expectedY = ratio * before[i].y;
        assert.ok(
            Math.abs(after[i].x - expectedX) < 0.01 && Math.abs(after[i].y - expectedY) < 0.01,
            "dot " + i + " should scale about the cursor, expected (" +
            expectedX.toFixed(2) + ", " + expectedY.toFixed(2) + "), got (" +
            after[i].x.toFixed(2) + ", " + after[i].y.toFixed(2) + ")"
        );
    }
});

test("wheel zoom at the viewport center does not pan", () => {
    const { system, viewport } = loadApp();
    const before = dotPositions(system);

    viewport.dispatch("wheel", { clientX: 400, clientY: 300, deltaY: -100, preventDefault() {} });

    const after = dotPositions(system);
    const ratio = 0.9 / 0.8;
    for (let i = 0; i < before.length; i += 1) {
        assert.ok(
            Math.abs(after[i].x - ratio * before[i].x) < 0.01 &&
            Math.abs(after[i].y - ratio * before[i].y) < 0.01,
            "dot " + i + " should scale about the center with no pan"
        );
    }
});

test("nucleotide opacity stays within range after a large X rotation", () => {
    const { system, viewport } = loadApp();

    // Drag up far enough to rotate the helix about 90 degrees on X:
    // bases near the ends then project with a scale well above 1,
    // and their opacity used to reach about 2.38, outside the valid
    // CSS opacity range of 0 to 1.
    viewport.dispatch("pointerdown", pointerEvent(viewport, 1, 100, 100));
    viewport.dispatch("pointermove", pointerEvent(viewport, 1, 100, 100 - 314));

    const opacities = system.children
        .filter((child) => child.className === "nucleotide")
        .map((child) => Number(child.style.opacity));

    assert.ok(opacities.length > 0);
    for (const opacity of opacities) {
        assert.ok(
            opacity >= 0.2 && opacity <= 1,
            "nucleotide opacity should stay in [0.2, 1], got " + opacity
        );
    }
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
