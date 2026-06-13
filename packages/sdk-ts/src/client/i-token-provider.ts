import { UapClientError } from './uap-client.js';

export interface ITokenProvider {
  getToken(scope: string[]): Promise<string>;
  clearCache(): void;
}

export class ClientCredentialsTokenProvider implements ITokenProvider {
  private cachedToken: string | null = null;
  private expiry: number | null = null;

  constructor(
    private readonly tokenUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  async getToken(scope: string[]): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    
    if (this.cachedToken && this.expiry && now < this.expiry - 60) {
      return this.cachedToken;
    }

    return this.fetchToken(scope);
  }

  clearCache(): void {
    this.cachedToken = null;
    this.expiry = null;
  }

  private async fetchToken(scope: string[], isRetry = false): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: scope.join(' '),
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (response.status === 401 && !isRetry) {
      this.clearCache();
      return this.fetchToken(scope, true);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new UapClientError(response.status, body);
    }

    const data = await response.json();
    const token = data.access_token as string;
    
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64').toString());
      this.expiry = payload.exp;
      this.cachedToken = token;
    } catch {
      // If parsing fails, don't cache but return the token
    }

    return token;
  }
}
