import * as jose from 'jose';
import { AuthClaims, IAuthPort, TokenIntrospectionResult } from '../../application/ports/i-auth-port';
import { UapAuthError, UapForbiddenError } from '../../domain/errors';

export class KeycloakAuthAdapter implements IAuthPort {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwksClient: ReturnType<typeof jose.createRemoteJWKSet>;

  constructor(keycloakUrl: string, realm: string, audience: string) {
    this.issuer = `${keycloakUrl}/realms/${realm}`;
    this.audience = audience;
    this.jwksClient = jose.createRemoteJWKSet(
      new URL(`${this.issuer}/protocol/openid-connect/certs`)
    );
  }

  async verifyToken(raw: string, requiredScope: string[]): Promise<AuthClaims> {
    try {
      const { payload } = await jose.jwtVerify(raw, this.jwksClient, {
        issuer: this.issuer,
        audience: this.audience,
        maxTokenAge: '15 minutes',
      });

      const claims = AuthClaims.fromJwtPayload(payload);
      this.enforceScopes(claims, requiredScope);
      
      console.debug({ 
        kind: 'AUTH_SUCCESS', 
        sub: claims.sub, 
        scope: claims.scope 
      });

      return claims;
    } catch (err: any) {
      console.warn({ 
        kind: 'AUTH_FAILURE', 
        errorType: err.constructor.name 
      });

      if (err instanceof jose.errors.JWTExpired) {
        throw new UapAuthError('Token expired');
      }
      if (err instanceof jose.errors.JWTClaimValidationFailed) {
        throw new UapAuthError(err.message);
      }
      if (err instanceof UapForbiddenError || err instanceof UapAuthError) {
        throw err;
      }

      throw new UapAuthError(err.message || 'Authentication failed');
    }
  }

  async introspect(raw: string): Promise<TokenIntrospectionResult> {
    try {
      const { payload } = await jose.jwtVerify(raw, this.jwksClient, {
        issuer: this.issuer,
        audience: this.audience,
      });

      const claims = AuthClaims.fromJwtPayload(payload);

      return {
        active: true,
        sub: claims.sub,
        scope: claims.scope,
        exp: claims.exp,
      };
    } catch {
      return {
        active: false,
        sub: '',
        scope: [],
        exp: 0,
      };
    }
  }

  private enforceScopes(claims: AuthClaims, required: string[]): void {
    const missing = required.filter(s => !claims.scope.includes(s));

    if (missing.length > 0) {
      throw new UapForbiddenError(`Missing scopes: ${missing.join(', ')}`);
    }
  }
}
