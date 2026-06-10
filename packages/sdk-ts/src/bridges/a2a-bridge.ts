import { CapabilityCard, ICardSignerPort, ToolManifest } from '../domain/capability-card.js';

export interface A2aAgentCard {
  name: string;
  version?: string;
  skills?: Array<{
    id: string;
    description: string;
    inputModes?: Record<string, unknown>[];
  }>;
}

export class A2aBridgeAdapter {
  constructor(private signer: ICardSignerPort) {}

  async convertAgentCard(a2aCard: A2aAgentCard): Promise<CapabilityCard> {
    const skills = a2aCard.skills ?? [];
    
    const tools: ToolManifest[] = skills.map((s) => ({
      id: s.id,
      description: s.description,
      inputSchema: (s.inputModes?.[0] as Record<string, unknown>) ?? {},
      scopes: ['task:submit', 'task:read'],
    }));

    const unsignedCard: Omit<CapabilityCard, 'signature'> = {
      issuer: a2aCard.name,
      version: a2aCard.version ?? '1.0.0',
      tools,
      scopes: ['task:submit', 'task:read', 'task:cancel'],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86_400_000 * 30,
    };

    return this.signer.sign(unsignedCard);
  }
}
