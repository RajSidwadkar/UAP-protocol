import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppContainer } from '../../infrastructure/composition-root';
import { validateEnvelope } from '../../domain/envelope';
import { UapCardTamperedError, UapAgentNotFoundError, UapForbiddenError } from '../../domain/errors';

export interface CardPluginOptions {
  container: AppContainer;
}

const uapCardPlugin: FastifyPluginAsync<CardPluginOptions> = async (app, opts) => {
  app.addHook('preHandler', async (request) => {
    // Skip for public routes
    if (request.url === '/health' || request.url.startsWith('/health') || request.url === '/agents/registry/register') {
      return;
    }

    if (!request.uapClaims) {
      return; // Auth plugin should have handled this, but be safe
    }

    // We need the envelope to get card_sig
    // Note: this assumes request.body has been parsed and is the envelope
    if (!request.body) {
      return;
    }

    try {
      const envelope = validateEnvelope(request.body);
      const agentId = request.uapClaims.sub;

      const entry = await opts.container.registry.resolve(agentId);
      if (!entry) {
        throw new UapAgentNotFoundError(agentId);
      }

      // Stage 5: Card verify
      if (entry.card.signature !== envelope.uap.auth.card_sig) {
        throw new UapCardTamperedError('Envelope card_sig does not match registered card signature');
      }

      // Cryptographic verify (redundant but matches README "verified" stage)
      const isCryptoValid = await opts.container.signer.verify(entry.card);
      if (!isCryptoValid) {
        throw new UapCardTamperedError('Capability card signature verification failed');
      }

      // Stage 4: Scope enforce (Token scopes checked against CapabilityCard)
      const tokenScopes = request.uapClaims.scope;
      const cardScopes = entry.card.scopes;
      const unauthorized = tokenScopes.filter(s => !cardScopes.includes(s));

      if (unauthorized.length > 0) {
        throw new UapForbiddenError(`Token contains scopes not authorized by CapabilityCard: ${unauthorized.join(', ')}`);
      }
    } catch (err: unknown) {
      // If it's a validation error from validateEnvelope, we might want to let the route handler deal with it
      // or handle it here. Since this is a security check, we handle it here.
      if (err instanceof UapCardTamperedError || err instanceof UapAgentNotFoundError || err instanceof UapForbiddenError) {
        throw err;
      }
      // For other errors (like parsing), we ignore and let the route handle it or fail later
    }
  });
};

export default fp(uapCardPlugin, {
  name: 'uap-card',
  dependencies: ['uap-auth'],
});
