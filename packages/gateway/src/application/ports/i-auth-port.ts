import * as jose from 'jose';

export class AuthClaims {
  constructor(
    public readonly sub: string,
    public readonly scope: string[],
    public readonly exp: number,
    public readonly iat: number,
    public readonly iss: string
  ) {}

  static fromJwtPayload(payload: jose.JWTPayload): AuthClaims {
    const scope = typeof payload.scope === 'string' 
      ? payload.scope.split(' ') 
      : Array.isArray(payload.scope) 
        ? payload.scope.map(String)
        : [];

    return new AuthClaims(
      payload.sub || '',
      scope,
      (payload.exp as number) || 0,
      (payload.iat as number) || 0,
      (payload.iss as string) || ''
    );
  }
}

export interface TokenIntrospectionResult {
  active: boolean;
  sub: string;
  scope: string[];
  exp: number;
}

export interface IAuthPort {
  verifyToken(raw: string, requiredScope: string[]): Promise<AuthClaims>;
  introspect(raw: string): Promise<TokenIntrospectionResult>;
}
