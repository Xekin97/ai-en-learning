export class TokenVault {
  #confirmations = new Map<string, string>();
  setConfirmation(id: string, token: string | null) {
    if (token) this.#confirmations.set(id, token);
    else this.#confirmations.delete(id);
  }
  confirmation(id: string) {
    const token = this.#confirmations.get(id);
    if (!token) throw new Error("Confirmation unavailable");
    return token;
  }
  clearConfirmationsFor(id: string) {
    for (const key of this.#confirmations.keys())
      if (key.endsWith(":" + id)) this.#confirmations.delete(key);
  }
  #csrf: string | null = null;
  #generation = new Map<string, string>();
  #claim: string | null = null;
  #attempt = new Map<string, string>();

  setCsrf(token: string): void {
    this.#csrf = token;
  }
  csrf(): string {
    if (!this.#csrf) throw new Error("Client security context is not ready");
    return this.#csrf;
  }

  setGeneration(runId: string, token: string): void {
    this.#generation.set(runId, token);
  }
  generation(runId: string): string {
    const token = this.#generation.get(runId);
    if (!token) throw new Error("Generation capability is unavailable");
    return token;
  }
  clearGeneration(runId: string): void {
    this.#generation.delete(runId);
  }

  setClaim(token: string): void {
    this.#claim = token;
  }
  hasClaim(): boolean {
    return this.#claim !== null;
  }
  claim(): string {
    if (!this.#claim) throw new Error("Visitor claim is unavailable");
    return this.#claim;
  }
  clearClaim(): void {
    this.#claim = null;
  }

  setAttempt(attemptId: string, token: string): void {
    this.#attempt.set(attemptId, token);
  }
  attempt(attemptId: string): string {
    const token = this.#attempt.get(attemptId);
    if (!token) throw new Error("Review attempt is unavailable");
    return token;
  }
  clearAttempt(attemptId: string): void {
    this.#attempt.delete(attemptId);
  }

  clearAll(): void {
    this.#confirmations.clear();
    this.#csrf = null;
    this.#generation.clear();
    this.#claim = null;
    this.#attempt.clear();
  }
}
