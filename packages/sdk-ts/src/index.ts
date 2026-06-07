/**
 * Universal Access Protocol (UAP) SDK for TypeScript
 */
export const VERSION = '0.1.0';

/**
 * Placeholder client for the UAP SDK.
 */
export class UAPClient {
  private readonly endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  public getEndpoint(): string {
    return this.endpoint;
  }
}
