import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as jose from 'jose';
import { KeycloakAuthAdapter } from '../keycloak-auth-adapter';
import { UapAuthError, UapForbiddenError } from '../../../domain/errors';

vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof jose>('jose');
  return {
    ...actual,
    jwtVerify: vi.fn(),
    createRemoteJWKSet: vi.fn(() => vi.fn()),
  };
});

describe('KeycloakAuthAdapter', () => {
  const keycloakUrl = 'http://localhost:8080';
  const realm = 'uap';
  const audience = 'uap-gateway';
  let adapter: KeycloakAuthAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new KeycloakAuthAdapter(keycloakUrl, realm, audience);
  });

  it('should return AuthClaims for a valid JWT with all required scopes', async () => {
    const mockPayload: jose.JWTPayload = {
      sub: 'user-123',
      scope: 'tool:read task:submit',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      iss: `${keycloakUrl}/realms/${realm}`,
      aud: audience,
    };

    vi.mocked(jose.jwtVerify).mockResolvedValue({ 
  payload: mockPayload, 
  protectedHeader: { alg: 'RS256' },
  key: { type: 'public' } as CryptoKey
});

    const claims = await adapter.verifyToken('valid-token', ['tool:read']);

    expect(claims.sub).toBe('user-123');
    expect(claims.scope).toContain('tool:read');
    expect(claims.scope).toContain('task:submit');
    expect(jose.jwtVerify).toHaveBeenCalledWith('valid-token', expect.any(Function), expect.objectContaining({
      issuer: `${keycloakUrl}/realms/${realm}`,
      audience,
      maxTokenAge: '15 minutes',
    }));
  });

  it('should throw UapAuthError when token is expired', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(new jose.errors.JWTExpired('Token expired', {}));

    await expect(adapter.verifyToken('expired-token', []))
      .rejects.toThrow(UapAuthError);
    await expect(adapter.verifyToken('expired-token', []))
      .rejects.toThrow(/expired/i);
  });

  it('should throw UapAuthError for JWT claim validation failures (e.g. maxTokenAge)', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(new jose.errors.JWTClaimValidationFailed('Claim validation failed', {}, 'iat', 'check_failed'));

    await expect(adapter.verifyToken('invalid-iat-token', []))
      .rejects.toThrow(UapAuthError);
  });

  it('should throw UapForbiddenError when a required scope is missing', async () => {
    const mockPayload: jose.JWTPayload = {
      sub: 'user-123',
      scope: 'tool:read',
      iss: `${keycloakUrl}/realms/${realm}`,
      aud: audience,
    };

    vi.mocked(jose.jwtVerify).mockResolvedValue({ 
  payload: mockPayload, 
  protectedHeader: { alg: 'RS256' },
  key: { type: 'public' } as CryptoKey
});

    await expect(adapter.verifyToken('token-missing-scope', ['task:submit']))
      .rejects.toThrow(UapForbiddenError);
    await expect(adapter.verifyToken('token-missing-scope', ['task:submit']))
      .rejects.toThrow(/task:submit/);
  });

  it('should throw UapAuthError when audience is wrong (simulated by jose error)', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(new jose.errors.JWTClaimValidationFailed('audience mismatch', {}, 'aud', 'check_failed'));

    await expect(adapter.verifyToken('wrong-audience-token', []))
      .rejects.toThrow(UapAuthError);
  });

  it('should create JWKS client only once in constructor', () => {
    expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(1);
    const jwksUrl = new URL(`${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`);
    expect(jose.createRemoteJWKSet).toHaveBeenCalledWith(jwksUrl, { timeoutDuration: 5_000 });
    
    // Create another adapter to see call count increase
    new KeycloakAuthAdapter(keycloakUrl, realm, audience);
    expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(2);
  });

  it('introspect() with valid fresh token → returns { active: true } with correct sub and scope', async () => {
    const mockPayload: jose.JWTPayload = {
      sub: 'user-456',
      scope: 'tool:read',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    vi.mocked(jose.jwtVerify).mockResolvedValue({ 
      payload: mockPayload, 
      protectedHeader: { alg: 'RS256' },
      key: { type: 'public' } as CryptoKey
    });

    const result = await adapter.introspect('valid-token');
    
    expect(result).toEqual({
      active: true,
      sub: 'user-456',
      scope: ['tool:read'],
      exp: mockPayload.exp,
    });
    expect(jose.jwtVerify).toHaveBeenCalledWith('valid-token', expect.any(Function), expect.objectContaining({
      maxTokenAge: '15 minutes',
    }));
  });

  it('introspect() with expired token (jose throws JWTExpired) → returns { active: false }', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(new jose.errors.JWTExpired('Token expired', {}));

    const result = await adapter.introspect('expired-token');
    expect(result).toEqual({ active: false, sub: '', scope: [], exp: 0 });
  });

  it('introspect() with token older than 15 min (maxTokenAge violation) → returns { active: false }', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(new jose.errors.JWTClaimValidationFailed('maxTokenAge exceeded', {}, 'iat', 'check_failed'));

    const result = await adapter.introspect('old-token');
    expect(result).toEqual({ active: false, sub: '', scope: [], exp: 0 });
  });

  it('introspect() never throws — always returns TokenIntrospectionResult shape', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(new Error('Unexpected arbitrary error'));

    const result = await adapter.introspect('broken-token');
    expect(result).toEqual({ active: false, sub: '', scope: [], exp: 0 });
  });
});
