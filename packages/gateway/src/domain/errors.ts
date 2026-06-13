export class UapError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UapValidationError extends UapError {
  constructor(message: string) {
    super(message, 422, 'UAP_VALIDATION_ERROR');
  }
}

export class UapParseError extends UapError {
  constructor(message: string) {
    super(message, 400, 'UAP_PARSE_ERROR');
  }
}

export class UapAuthError extends UapError {
  constructor(message: string) {
    super(message, 401, 'UAP_AUTH_ERROR');
  }
}

export class UapForbiddenError extends UapError {
  constructor(message: string) {
    super(message, 403, 'UAP_FORBIDDEN_ERROR');
  }
}

export class UapCardTamperedError extends UapError {
  constructor(message: string) {
    super(message, 409, 'UAP_CARD_TAMPERED');
  }
}

export class UapSandboxError extends UapError {
  constructor(message: string) {
    super(message, 500, 'UAP_SANDBOX_ERROR');
  }
}

export class UapAgentNotFoundError extends UapError {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`, 404, 'UAP_AGENT_NOT_FOUND');
  }
}

export class UapUnknownSchemaRefError extends UapError {
  constructor(ref: string) {
    super(`Unknown schema_ref: ${ref}`, 400, 'UAP_UNKNOWN_SCHEMA_REF');
  }
}

export class UapRegistryError extends UapError {
  constructor(message: string) {
    super(message, 503, 'UAP_REGISTRY_ERROR');
  }
}

export class UapConfigurationError extends UapError {
  constructor(message: string) {
    super(message, 500, 'UAP_CONFIGURATION_ERROR');
  }
}

