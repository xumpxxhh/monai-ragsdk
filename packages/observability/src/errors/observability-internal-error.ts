export class ObservabilityInternalError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ObservabilityInternalError";
  }
}
