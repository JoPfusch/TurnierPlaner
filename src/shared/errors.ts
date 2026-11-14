/**
 * Raised when a command violates a tournament rule (e.g. entering a knockout
 * result before the group stage is finished). The message is user-facing
 * (German) and is returned by the API with HTTP 400.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
