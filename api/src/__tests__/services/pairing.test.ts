import {
  __resetPairing,
  claimPairing,
  collectPairing,
  openPairing,
  PAIR_TTL_MS,
  peekPairing,
} from "@/services/pairing";

const SESSION = {access_token: "tok", secret: "sec", user_id: "42"};

describe("pairing rendezvous", () => {
  beforeEach(() => {
    __resetPairing();
    jest.useRealTimers();
  });

  it("delivers a claimed session to the waiting screen", () => {
    const opened = openPairing("Mac (Chrome)", "web");

    expect(collectPairing(opened.pair_id)).toEqual({kind: "pending"});
    expect(claimPairing(opened.pair_id, SESSION)).toBe("ok");
    expect(collectPairing(opened.pair_id)).toEqual({kind: "session", session: SESSION});
  });

  it("hands the session over exactly once", () => {
    const opened = openPairing("Mac", "web");
    claimPairing(opened.pair_id, SESSION);

    expect(collectPairing(opened.pair_id).kind).toBe("session");
    // A replayed poll URL must get nothing, not the account again.
    expect(collectPairing(opened.pair_id).kind).toBe("gone");
  });

  it("accepts the short code as well as the id, however it was typed", () => {
    const opened = openPairing("Mac", "web");
    const typed = `${opened.code.slice(0, 4).toLowerCase()}-${opened.code.slice(4).toLowerCase()}`;

    expect(peekPairing(typed)?.name).toBe("Mac");
    expect(claimPairing(typed, SESSION)).toBe("ok");
  });

  it("refuses a second claim rather than swapping the account", () => {
    const opened = openPairing("Mac", "web");
    claimPairing(opened.pair_id, SESSION);

    expect(claimPairing(opened.pair_id, {...SESSION, user_id: "99"})).toBe("taken");
    expect(collectPairing(opened.pair_id)).toEqual({kind: "session", session: SESSION});
  });

  it("forgets a pairing nobody claimed", () => {
    jest.useFakeTimers();
    const opened = openPairing("Mac", "web");

    jest.setSystemTime(Date.now() + PAIR_TTL_MS + 1);

    expect(peekPairing(opened.pair_id)).toBeNull();
    expect(claimPairing(opened.pair_id, SESSION)).toBe("unknown");
    expect(collectPairing(opened.pair_id)).toEqual({kind: "gone"});
  });

  it("does not answer for an id nobody opened", () => {
    expect(collectPairing("deadbeef")).toEqual({kind: "gone"});
    expect(peekPairing("deadbeef")).toBeNull();
  });
});
