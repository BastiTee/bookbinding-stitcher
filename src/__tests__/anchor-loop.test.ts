import { describe, it, expect } from "vitest";
import { SewingModel } from "../sewing-model";

describe("getEligibleLoops — side matching", () => {
  it("returns loops from completed threads where side matches nextLoad", () => {
    const model = new SewingModel();

    // Build thread 1: startSide=negative → nextLoad=positive
    // After one edge (positive), nextLoad=negative → add anchor loop → loop.side=negative
    // Then end thread
    model.beginThread("negative");
    model.setThreadStartPoint({ x: 20, y: 40 });
    model.addEdge({ x: 40, y: 40 }); // positive edge, nextLoad becomes negative
    model.addAnchorLoop();            // loop.side = negative (current nextLoad)
    model.addEdge({ x: 60, y: 40 }); // positive edge (nextLoad was re-flipped to positive by addAnchorLoop)
    model.endThread();

    const state = model.getState();
    expect(state.threads).toHaveLength(1);
    const thread = state.threads[0];
    expect(thread.anchorLoops).toHaveLength(1);
    expect(thread.anchorLoops[0].side).toBe("negative");

    // Now start a new thread that should be able to thread through (needs nextLoad = "negative")
    // startSide=positive → nextLoad=negative
    model.beginThread("positive");
    model.setThreadStartPoint({ x: 20, y: 10 });

    const activeState = model.getState().activeThread!;
    expect(activeState.nextLoad).toBe("negative");

    // Eligible loops: side === nextLoad = "negative"
    const eligible = model.getState().threads
      .flatMap(t => t.anchorLoops)
      .filter(l => l.side === activeState.nextLoad);

    expect(eligible).toHaveLength(1);
    expect(eligible[0].point).toEqual({ x: 40, y: 40 });
  });

  it("returns NO loops when nextLoad does not match loop side", () => {
    const model = new SewingModel();

    model.beginThread("negative");
    model.setThreadStartPoint({ x: 20, y: 40 });
    model.addEdge({ x: 40, y: 40 });
    model.addAnchorLoop(); // loop.side = negative
    model.addEdge({ x: 60, y: 40 });
    model.endThread();

    // Start new thread: startSide=negative → nextLoad=positive (does NOT match loop.side=negative)
    model.beginThread("negative");
    model.setThreadStartPoint({ x: 20, y: 10 });

    const activeState = model.getState().activeThread!;
    expect(activeState.nextLoad).toBe("positive");

    const eligible = model.getState().threads
      .flatMap(t => t.anchorLoops)
      .filter(l => l.side === activeState.nextLoad);

    expect(eligible).toHaveLength(0);
  });
});

describe("addAnchorLoop — side and nextLoad after loop", () => {
  it("creates loop with side = current nextLoad", () => {
    const model = new SewingModel();
    model.beginThread("negative"); // nextLoad = positive
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 20, y: 10 }); // positive edge, nextLoad → negative
    model.addAnchorLoop();

    const active = model.getState().activeThread!;
    expect(active.anchorLoops[0].side).toBe("negative"); // loop on negative side
    expect(active.nextLoad).toBe("positive"); // flipped back after the loop
  });

  it("allows continuing with positive edge after loop", () => {
    const model = new SewingModel();
    model.beginThread("negative"); // nextLoad = positive
    model.setThreadStartPoint({ x: 10, y: 10 });
    model.addEdge({ x: 20, y: 10 }); // positive, nextLoad → negative
    model.addAnchorLoop();            // nextLoad → positive again
    model.addEdge({ x: 30, y: 10 }); // positive

    const active = model.getState().activeThread!;
    expect(active.edges[1].load).toBe("positive");
    expect(active.nextLoad).toBe("negative");
  });
});

describe("active thread's own loops are eligible targets", () => {
  it("loop side matches nextLoad after drawing more edges (user's exact scenario)", () => {
    // Scenario: start negative at (10,20) → edge to (30,20) positive → anchor loop at (30,20)
    //           → edge to (50,20) positive → now nextLoad=negative, loop.side=negative → should be eligible
    const model = new SewingModel();
    model.beginThread("negative");             // nextLoad = positive
    model.setThreadStartPoint({ x: 10, y: 20 });
    model.addEdge({ x: 30, y: 20 });           // positive edge, nextLoad → negative
    model.addAnchorLoop();                       // loop.side = negative, nextLoad → positive
    model.addEdge({ x: 50, y: 20 });           // positive edge, nextLoad → negative

    const active = model.getState().activeThread!;
    expect(active.nextLoad).toBe("negative");
    expect(active.anchorLoops).toHaveLength(1);
    expect(active.anchorLoops[0].side).toBe("negative");
    expect(active.anchorLoops[0].point).toEqual({ x: 30, y: 20 });

    const eligible = active.anchorLoops.filter(l => l.side === active.nextLoad);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].point).toEqual({ x: 30, y: 20 });
  });

  it("loop is NOT eligible when nextLoad does not match its side", () => {
    const model = new SewingModel();
    model.beginThread("negative");             // nextLoad = positive
    model.setThreadStartPoint({ x: 10, y: 20 });
    model.addEdge({ x: 30, y: 20 });           // positive, nextLoad → negative
    model.addAnchorLoop();                       // loop.side = negative, nextLoad → positive
    // No more edges — nextLoad is still positive; loop.side is negative → NOT eligible

    const active = model.getState().activeThread!;
    expect(active.nextLoad).toBe("positive");
    expect(active.anchorLoops[0].side).toBe("negative");

    const eligible = active.anchorLoops.filter(l => l.side === active.nextLoad);
    expect(eligible).toHaveLength(0);
  });
});
