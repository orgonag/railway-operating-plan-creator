import { describe, expect, it } from "vitest";
import {
  PlanStore,
  PLAN_KEY,
  RECOVERY_KEY,
} from "../../src/storyboard/storage";
function fixture() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  } as Storage;
  let queue = Promise.resolve();
  const locks = {
    request: (_name: string, fn: () => Promise<void>) => {
      const job = queue.then(fn);
      queue = job.catch(() => undefined);
      return job;
    },
  } as Pick<LockManager, "request">;
  return { storage, locks };
}
describe("safe browser saves", () => {
  it("serializes simultaneous tab writes and rejects a stale tab", async () => {
    const { storage, locks } = fixture();
    const a = new PlanStore(storage, locks),
      b = new PlanStore(storage, locks);
    const results = await Promise.allSettled([
      a.save("first"),
      b.save("second"),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(storage.getItem(PLAN_KEY)).toBe("first");
    await expect(b.save("retry")).rejects.toThrow(/Another tab/);
    await a.save("newer");
    expect(storage.getItem(PLAN_KEY)).toBe("newer");
  });
  it("keeps rapid saves in order and reports quota errors without accepting the write", async () => {
    const { storage, locks } = fixture();
    const a = new PlanStore(storage, locks);
    await Promise.all([a.save("a"), a.save("ab"), a.save("abc")]);
    expect(storage.getItem(PLAN_KEY)).toBe("abc");
    storage.setItem = () => {
      throw new Error("Quota exceeded");
    };
    await expect(a.save("abcd")).rejects.toThrow(/Quota/);
    expect(a.expected).toBe("abc");
  });
  it("preserves unreadable originals and will not overwrite an older recovery copy", () => {
    const { storage, locks } = fixture();
    const a = new PlanStore(storage, locks);
    a.preserveUnreadable("original");
    expect(storage.getItem(RECOVERY_KEY)).toBe("original");
    expect(() => a.preserveUnreadable("other")).toThrow(/previous recovery/);
    expect(storage.getItem(RECOVERY_KEY)).toBe("original");
  });
  it("does not claim to autosave without cross-tab locking", async () => {
    const { storage } = fixture();
    const a = new PlanStore(storage, undefined);
    await expect(a.save("work")).rejects.toThrow(/Download/);
    expect(storage.getItem(PLAN_KEY)).toBeNull();
  });
});
