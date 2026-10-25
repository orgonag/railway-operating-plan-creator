/** Compare-and-save under a cross-tab Web Lock. Never replace a newer tab's work. */
export const PLAN_KEY = "railway-storyboard-v1";
export const RECOVERY_KEY = `${PLAN_KEY}:recovery`;
export const DRAFT_KEY = `${PLAN_KEY}:tab-draft`;
export class PlanStore {
  expected: string | null;
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private storage: Storage,
    private locks: Pick<LockManager, "request"> | undefined,
  ) {
    this.expected = storage.getItem(PLAN_KEY);
  }
  preserveUnreadable(raw: string): void {
    const prior = this.storage.getItem(RECOVERY_KEY);
    if (prior && prior !== raw)
      throw new Error(
        "A previous recovery copy already exists. Download both copies before replacing the saved plan.",
      );
    this.storage.setItem(RECOVERY_KEY, raw);
  }
  save(raw: string): Promise<void> {
    const job = this.queue.then(async () => {
      if (!this.locks)
        throw new Error(
          "Automatic saving is unavailable in this browser. Download this tab's plan to keep your work.",
        );
      await this.locks.request(PLAN_KEY, async () => {
        if (this.storage.getItem(PLAN_KEY) !== this.expected)
          throw new Error(
            "Another tab changed the saved plan. Your edits are kept in this tab. Download this tab's plan, or load the latest saved plan.",
          );
        this.storage.setItem(PLAN_KEY, raw);
        this.expected = raw;
      });
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
}
