export class PerformanceMonitor {
  private startTime: number;
  private checkpoints: { name: string; time: number; duration: number }[] = [];

  constructor(private operationName: string) {
    this.startTime = Date.now();
    console.log(`[PERF] Starting operation: ${operationName}`);
  }

  checkpoint(name: string): void {
    const now = Date.now();
    const duration = now - (this.checkpoints.length > 0 ? this.checkpoints[this.checkpoints.length - 1].time : this.startTime);
    this.checkpoints.push({ name, time: now, duration });
    console.log(`[PERF] ${this.operationName} - ${name}: ${duration}ms (total: ${now - this.startTime}ms)`);
  }

  finish(): number {
    const totalTime = Date.now() - this.startTime;
    console.log(`[PERF] Completed ${this.operationName}: ${totalTime}ms total`);
    
    // Log detailed breakdown
    this.checkpoints.forEach((checkpoint, index) => {
      const percentage = ((checkpoint.duration / totalTime) * 100).toFixed(1);
      console.log(`[PERF]   ${index + 1}. ${checkpoint.name}: ${checkpoint.duration}ms (${percentage}%)`);
    });

    return totalTime;
  }

  static async timeAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - start;
      console.log(`[PERF] ${name}: ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.log(`[PERF] ${name} (failed): ${duration}ms`);
      throw error;
    }
  }

  static time<T>(name: string, operation: () => T): T {
    const start = Date.now();
    try {
      const result = operation();
      const duration = Date.now() - start;
      console.log(`[PERF] ${name}: ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.log(`[PERF] ${name} (failed): ${duration}ms`);
      throw error;
    }
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}