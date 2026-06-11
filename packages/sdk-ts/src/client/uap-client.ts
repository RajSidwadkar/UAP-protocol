import { ITokenProvider } from './i-token-provider.js';
import { UapEnvelopeBuilder } from './uap-envelope-builder.js';
import { UapEnvelope } from '../domain/envelope.js';
import { ITracePort } from './i-trace-port.js';

export interface UapClientOptions {
  gatewayUrl: string;
  tokenProvider: ITokenProvider;
  cardSig: string;
  tracer?: ITracePort;
}

export class UapClientError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string
  ) {
    super(`UAP Client Error: ${statusCode}`);
    this.name = 'UapClientError';
  }
}

export interface Task<TArtifact> {
  id: string;
  status: string;
  artifact?: TArtifact;
}

export class UapClient {
  constructor(private readonly options: UapClientOptions) {}

  async invokeTool<TInput, TOutput>(
    toolId: string,
    input: TInput,
    scope: string[]
  ): Promise<TOutput> {
    const fn = () => this.requestWithRetry<TOutput>(
      `${this.options.gatewayUrl}/tools/invoke`,
      () => UapEnvelopeBuilder.toolCall({ 
        toolId, 
        input, 
        token: '', 
        scope, 
        cardSig: this.options.cardSig 
      }),
      scope
    );

    if (this.options.tracer) {
      return this.options.tracer.trace('uap:invoke_tool', { toolId }, fn);
    }
    return fn();
  }

  async delegateTask<TInput, TArtifact>(
    agentId: string,
    input: TInput,
    scope: string[]
  ): Promise<Task<TArtifact>> {
    const fn = () => this.requestWithRetry<Task<TArtifact>>(
      `${this.options.gatewayUrl}/agents/delegate`,
      () => UapEnvelopeBuilder.agentDelegate({ 
        agentId, 
        input, 
        token: '', 
        scope, 
        cardSig: this.options.cardSig 
      }),
      scope
    );

    if (this.options.tracer) {
      return this.options.tracer.trace('uap:delegate_task', { agentId }, fn);
    }
    return fn();
  }

  private async requestWithRetry<T>(
    url: string,
    envelopeFactory: () => UapEnvelope,
    scope: string[],
    isRetry = false
  ): Promise<T> {
    const token = await this.options.tokenProvider.getToken(scope);
    const envelope = envelopeFactory();
    envelope.uap.auth.token = token;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(envelope),
    });

    if (response.status === 401 && !isRetry) {
      this.options.tokenProvider.clearCache();
      return this.requestWithRetry<T>(url, envelopeFactory, scope, true);
    }

    const body = await response.text();

    if (!response.ok) {
      throw new UapClientError(response.status, body);
    }

    try {
      const data = JSON.parse(body);
      // UAP response might be wrapped or direct depending on gateway implementation.
      // If it's UapResponse, we might want to return data.result.
      // For now, returning parsed body as T.
      return data as T;
    } catch (err) {
      throw new UapClientError(response.status, body);
    }
  }
}
