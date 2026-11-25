/** Counts only time the page is visible, so a puzzle left open overnight doesn't read as 9 hours. */
export class Stopwatch {
  private ms: number;
  private last = 0;
  private id: ReturnType<typeof setInterval> | undefined;
  private readonly onVisibility = () => {
    this.last = performance.now();
  };

  constructor(
    start: number,
    private readonly onTick: (ms: number) => void,
  ) {
    this.ms = start;
  }

  start(): void {
    this.last = performance.now();
    this.id = setInterval(() => this.tick(), 1000);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private tick(): void {
    const now = performance.now();
    if (document.visibilityState === 'visible') this.ms += Math.min(now - this.last, 5000);
    this.last = now;
    this.onTick(this.value());
  }

  value(): number {
    return Math.round(this.ms);
  }

  stop(): void {
    if (this.id !== undefined) clearInterval(this.id);
    this.id = undefined;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
