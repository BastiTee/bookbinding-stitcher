import { describe, it, expect } from "vitest";
import { SewingModel, getCurrentHole, getEligibleHiddenLinkHoles } from "../sewing-model";
import type { Hole } from "../sewing-model";

const allHoles: Hole[] = [
  { x: 10, y: 10 }, { x: 10, y: 20 },
  { x: 30, y: 10 }, { x: 30, y: 20 },
  { x: 50, y: 10 }, { x: 50, y: 20 },
  { x: 70, y: 10 }, { x: 70, y: 20 },
];

describe("addHiddenLinkStitch — validation", () => {
  it("throws when nextLoad is negative", () => {
    const model = new SewingModel();
    model.beginThread("negative"); // nextLoad = positive
    model.setThreadStartPoint({ x: 10, y: 20 });
    model.addEdge({ x: 30, y: 20 }); // positive → nextLoad becomes negative
    expect(() => model.addHiddenLinkStitch({ x: 50, y: 20 }, "negative"))
      .toThrow("Hidden link stitch can only replace an outside (positive) pass");
  });

  it("throws when targeting the current hole", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad becomes positive
    expect(() => model.addHiddenLinkStitch({ x: 30, y: 10 }, "negative"))
      .toThrow("Cannot link a hole to itself");
  });
});

describe("addHiddenLinkStitch — type 1 (negative)", () => {
  it("toggles nextLoad from positive to negative", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "negative");

    const active = model.getState().activeThread!;
    expect(active.nextLoad).toBe("negative");
    expect(active.hiddenLinkStitches).toHaveLength(1);
    expect(active.hiddenLinkStitches[0].from).toEqual({ x: 30, y: 10 });
    expect(active.hiddenLinkStitches[0].to).toEqual({ x: 50, y: 10 });
    expect(active.hiddenLinkStitches[0].side).toBe("negative");
    expect(active.hiddenLinkStitches[0].afterEdge).toBe(1);
  });

  it("getCurrentHole returns the target hole after hidden link", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "negative");

    const active = model.getState().activeThread!;
    expect(getCurrentHole(active)).toEqual({ x: 50, y: 10 });
  });

  it("allows adding a negative edge after a type 1 hidden link stitch", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "negative"); // nextLoad → negative
    model.addEdge({ x: 70, y: 10 }); // negative edge

    const active = model.getState().activeThread!;
    expect(active.edges[1].load).toBe("negative");
    expect(active.edges[1].from).toEqual({ x: 50, y: 10 });
  });
});

describe("addHiddenLinkStitch — type 2 (positive)", () => {
  it("keeps nextLoad as positive", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "positive");

    const active = model.getState().activeThread!;
    expect(active.nextLoad).toBe("positive");
    expect(active.hiddenLinkStitches[0].side).toBe("positive");
  });

  it("getCurrentHole returns the target hole after type 2 link", () => {
    const model = new SewingModel();
    model.beginThread("positive");
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "positive");

    expect(getCurrentHole(model.getState().activeThread!)).toEqual({ x: 50, y: 10 });
  });

  it("allows adding a positive edge after a type 2 hidden link stitch", () => {
    const model = new SewingModel();
    model.beginThread("positive");
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "positive"); // nextLoad stays positive
    model.addEdge({ x: 70, y: 10 }); // positive edge

    const active = model.getState().activeThread!;
    expect(active.edges[1].load).toBe("positive");
    expect(active.edges[1].from).toEqual({ x: 50, y: 10 });
  });
});

describe("removeLastHiddenLinkStitch", () => {
  it("type 1: restores prior position and nextLoad to positive", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "negative"); // nextLoad → negative, position = 50x10
    model.removeLastHiddenLinkStitch(); // should restore position = 30x10, nextLoad = positive

    const active = model.getState().activeThread!;
    expect(active.nextLoad).toBe("positive");
    expect(active.hiddenLinkStitches).toHaveLength(0);
    expect(getCurrentHole(active)).toEqual({ x: 30, y: 10 });
  });

  it("type 2: restores prior position and nextLoad stays positive", () => {
    const model = new SewingModel();
    model.beginThread("positive");
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "positive"); // nextLoad stays positive
    model.removeLastHiddenLinkStitch();

    const active = model.getState().activeThread!;
    expect(active.nextLoad).toBe("positive");
    expect(active.hiddenLinkStitches).toHaveLength(0);
    expect(getCurrentHole(active)).toEqual({ x: 30, y: 10 });
  });

  it("throws when last action was not a hidden link stitch", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive
    expect(() => model.removeLastHiddenLinkStitch())
      .toThrow("Last action was not a hidden link stitch");
  });
});

describe("removeLastEdge — guard", () => {
  it("throws when there is a pending hidden link stitch", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "negative"); // nextLoad → negative
    expect(() => model.removeLastEdge())
      .toThrow("Last action was a hidden link stitch; remove it first");
  });
});

describe("uncompleteThread — nextLoad reconstruction", () => {
  it("type 1 HLS as final action: uncompleteThread restores nextLoad=negative", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "negative"); // type 1, nextLoad → negative
    model.endThread(); // ends with nextLoad=negative

    const model2 = new SewingModel();
    model2.loadThreads([model.getState().threads[0]]);
    model2.uncompleteThread(0);

    const active = model2.getState().activeThread!;
    expect(active.nextLoad).toBe("negative");
  });

  it("type 2 HLS as final action: uncompleteThread restores nextLoad=positive", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "positive"); // type 2, nextLoad stays positive
    model.endThread();

    const model2 = new SewingModel();
    model2.loadThreads([model.getState().threads[0]]);
    model2.uncompleteThread(0);

    const active = model2.getState().activeThread!;
    expect(active.nextLoad).toBe("positive");
  });
});

describe("getEligibleHiddenLinkHoles", () => {
  it("returns empty when nextLoad is negative", () => {
    const model = new SewingModel();
    model.beginThread("negative"); // nextLoad = positive
    model.setThreadStartPoint({ x: 10, y: 20 });
    model.addEdge({ x: 30, y: 20 }); // positive → nextLoad = negative

    const active = model.getState().activeThread!;
    expect(active.nextLoad).toBe("negative");
    expect(getEligibleHiddenLinkHoles(active, allHoles)).toHaveLength(0);
  });

  it("returns all holes except current when nextLoad is positive", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive

    const active = model.getState().activeThread!;
    expect(active.nextLoad).toBe("positive");
    const eligible = getEligibleHiddenLinkHoles(active, allHoles);
    // All holes except 30x10 (current position)
    expect(eligible).toHaveLength(allHoles.length - 1);
    expect(eligible.some(h => h.x === 30 && h.y === 10)).toBe(false);
  });

  it("returns empty when start point not set", () => {
    const model = new SewingModel();
    model.beginThread("negative"); // nextLoad = positive
    const active = model.getState().activeThread!;
    expect(getEligibleHiddenLinkHoles(active, allHoles)).toHaveLength(0);
  });

  it("type 1 hiddenLinkStitch is preserved through endThread/loadThreads roundtrip", () => {
    const model = new SewingModel();
    model.beginThread("positive"); // nextLoad = negative
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // negative → nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "negative"); // nextLoad → negative
    model.addEdge({ x: 70, y: 10 }); // negative
    model.endThread();

    const thread = model.getState().threads[0];
    expect(thread.hiddenLinkStitches).toHaveLength(1);
    expect(thread.hiddenLinkStitches[0].from).toEqual({ x: 30, y: 10 });
    expect(thread.hiddenLinkStitches[0].to).toEqual({ x: 50, y: 10 });
    expect(thread.hiddenLinkStitches[0].side).toBe("negative");
    expect(thread.hiddenLinkStitches[0].afterEdge).toBe(1);

    // Roundtrip via loadThreads
    const model2 = new SewingModel();
    model2.loadThreads([thread]);
    const thread2 = model2.getState().threads[0];
    expect(thread2.hiddenLinkStitches).toHaveLength(1);
    expect(thread2.hiddenLinkStitches[0].to).toEqual({ x: 50, y: 10 });
  });

  it("type 2 hiddenLinkStitch is preserved through endThread/loadThreads roundtrip", () => {
    const model = new SewingModel();
    model.beginThread("positive");
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 30, y: 10 }); // nextLoad = positive
    model.addHiddenLinkStitch({ x: 50, y: 10 }, "positive");
    model.addEdge({ x: 70, y: 10 }); // positive edge
    model.endThread();

    const thread = model.getState().threads[0];
    expect(thread.hiddenLinkStitches[0].side).toBe("positive");

    const model2 = new SewingModel();
    model2.loadThreads([thread]);
    expect(model2.getState().threads[0].hiddenLinkStitches[0].side).toBe("positive");
  });
});
