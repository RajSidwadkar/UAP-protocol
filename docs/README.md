

<div align="center">
  <img src="./assets/vector_original_falcon.svg" alt="VECTOR — The UAP Gateway Falcon" width="600" />


</div>
Vector is a Peregrine Falcon. The fastest animal on the planet. Precision-guided. Routes everything through a single decisive point. That is what the UAP Gateway does.


<div align="center">

```
 ██╗   ██╗ █████╗ ██████╗
 ██║   ██║██╔══██╗██╔══██╗
 ██║   ██║███████║██████╔╝
 ██║   ██║██╔══██║██╔═══╝
 ╚██████╔╝██║  ██║██║
  ╚═════╝ ╚═╝  ╚═╝╚═╝
```

**Universal Agent Protocol**

*A unified, security-first wire protocol for tool access, agent coordination, and structured RPC*

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20%2B-green)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-blue)](https://www.python.org/)

</div>

---

## What is UAP?

UAP is a wire protocol that defines a single, typed envelope for every kind of agent communication — tool invocations, agent-to-agent delegation, streaming, and responses. It ships with mandatory authentication, cryptographically signed capability manifests, per-call sandboxing, and a structured audit trail baked into the protocol itself, not bolted on top.

It is implemented as a Turborepo monorepo containing a Fastify gateway, a TypeScript SDK, and a Python SDK. All three share the same domain model.

---

## Packages

```
UAP-protocol/
├── packages/
│   ├── gateway/      — Fastify-based UAP Gateway (@uap/gateway)
│   ├── sdk-ts/       — TypeScript client + server SDK (@uap/sdk-ts)
│   └── sdk-py/       — Python async SDK (uap-sdk)
├── scripts/
│   ├── generate-keypair.ts    — Ed25519 keypair for local dev
│   └── keycloak-bootstrap.ts  — Idempotent Keycloak realm setup
└── docker/
    └── sandbox/      — Base image for zero-trust tool execution
```

---

## How it works

Every UAP message uses the same envelope. The `uap` header carries identity, tracing, and a cryptographic reference to the agent's capability manifest. The gateway verifies all three before the request reaches any application code.

```json
{
  "uap": {
    "version": "1.0",
    "type": "tool_call",
    "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "trace": {
      "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    },
    "auth": {
      "token": "eyJhbGciOiJSUzI1NiJ9...",
      "scope": ["tool:read"],
      "card_sig": "ed25519:a1b2c3d4..."
    }
  },
  "method": "tools/invoke",
  "schema_ref": "uap:tool.invoke/v1",
  "params": {
    "tool_id": "db:query",
    "input": { "sql": "SELECT ..." }
  },
  "ack": true
}
```

Every inbound request passes through eight pipeline stages before a tool runs:

| Stage | What happens | Error on failure |
|---|---|---|
| Frame parse | Raw bytes → typed `UapEnvelope` via factory | `400 UapParseError` |
| Schema validate | AJV validates `params` against `schema_ref` | `422 UapValidationError` |
| Token verify | JWT checked: expiry, issuer, audience, max 15 min | `401 UapAuthError` |
| Scope enforce | Token scopes checked against CapabilityCard | `403 UapForbiddenError` |
| Card verify | Ed25519 signature on CapabilityCard verified | `409 UapCardTamperedError` |
| Sandbox execute | Tool runs in ephemeral Docker container | `500 UapSandboxError` |
| Audit emit | `AuditEvent` written — non-blocking, never throws | — |
| Response | Structured `UapResponseEnvelope` returned | — |

---

## Architecture

UAP uses hexagonal (ports and adapters) architecture throughout. The domain layer has zero I/O dependencies. Every infrastructure concern — auth, sandbox, audit, registry — sits behind a typed port interface.

```
Domain          Pure entities. UapEnvelope, CapabilityCard, AuditEvent.
                Zero imports from infrastructure or transport.

Application     Use-case orchestrators. InvokeToolUseCase, DelegateTaskUseCase.
                Depends on port interfaces only.

Infrastructure  Concrete adapters. KeycloakAuthAdapter, DockerSandboxAdapter,
                PinoAuditAdapter, Ed25519SignerAdapter, InMemoryRegistryAdapter.

Transport       Fastify gateway, UAP-RPC frame parser, SSE/WebSocket handlers.
```

Adapters can be swapped without touching domain or application code. The Docker sandbox becomes a WASM sandbox. Keycloak becomes Auth0. Pino becomes a SIEM exporter. Zero domain impact.

---

## CapabilityCard signing

Every agent publishes a CapabilityCard — a JSON manifest describing its tools, endpoints, and permission scopes. The card is signed with Ed25519. Tool names, descriptions, and parameter schemas are part of the signed payload.

```typescript
const card: CapabilityCard = {
  issuer: "did:uap:my-agent",
  version: "1.0.0",
  tools: [
    {
      id: "db:query",
      description: "Run a read-only SQL query",
      inputSchema: { type: "object", required: ["sql"] },
      scopes: ["tool:read"]
    }
  ],
  scopes: ["tool:read", "tool:write"],
  issuedAt: Date.now(),
  expiresAt: Date.now() + 86_400_000 * 30
};

const signed = await signer.sign(card);
// signed.signature === "ed25519:a1b2c3..."
```

Mutating any field after signing — including a tool description — invalidates the signature. The gateway rejects tampered cards before executing anything.

---

## Installation

**Prerequisites**

```bash
node --version   # v20+ required
python3 --version  # 3.11+ required
docker --version   # Docker Desktop required for sandbox
gh --version     # GitHub CLI for the git workflow
```

**Clone and install**

```bash
git clone https://github.com/your-org/UAP-protocol
cd UAP-protocol
npm install
```

**Generate a local Ed25519 keypair**

```bash
npx tsx scripts/generate-keypair.ts
# Writes config/dev.privkey.hex and config/dev.pubkey.hex
# Both files are gitignored
```

**Run tests**

```bash
cd packages/gateway && npx vitest run
cd packages/sdk-ts  && npx vitest run
cd packages/sdk-py  && python -m pytest tests/ -v
```

**Typecheck**

```bash
cd packages/gateway && npx tsc --noEmit
cd packages/sdk-ts  && npx tsc --noEmit
```

---

## Local stack

Requires Docker Desktop.

```bash
# Start Keycloak
docker compose -f docker-compose.dev.yml up -d keycloak

# Bootstrap the UAP realm, client, and roles (idempotent)
npx tsx scripts/keycloak-bootstrap.ts

# Start the gateway
cd packages/gateway
npx tsx src/main.ts

# Health check
curl http://localhost:3000/health
```

---

## TypeScript client

```typescript
import { UapClient, ClientCredentialsTokenProvider } from "@uap/sdk-ts";

const client = new UapClient({
  gatewayUrl: "https://gateway.uap.dev",
  tokenProvider: new ClientCredentialsTokenProvider({
    tokenUrl: process.env.TOKEN_URL!,
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
  }),
});

const result = await client.invokeTool("db:query", { sql: "SELECT ..." }, ["tool:read"]);
const task   = await client.delegateTask("summarizer", { text: "..." }, ["task:submit"]);
```

---

## Python client

```python
from uap_sdk.client import UapClient, UapClientOptions
from uap_sdk.token import ClientCredentialsTokenProvider

async with UapClient(UapClientOptions(
    gateway_url="https://gateway.uap.dev",
    token_provider=ClientCredentialsTokenProvider(
        token_url=os.environ["TOKEN_URL"],
        client_id=os.environ["CLIENT_ID"],
        client_secret=os.environ["CLIENT_SECRET"],
    )
)) as client:
    result = await client.invoke_tool("db:query", {"sql": "SELECT ..."}, ["tool:read"])
```

**FastAPI middleware**

```python
from uap_sdk.middleware import uap_auth

@app.post("/summarize")
@uap_auth(scope=["task:submit"])
async def summarize(request: Request):
    claims = request.state.uap_claims  # typed AuthClaims
    ...
```

---

## Migrate an existing MCP server

The migration CLI wraps any MCP server as a signed UAP CapabilityCard. It reads the server's tool list, builds the card, and writes it to disk. Idempotent — re-running on an already-migrated server is a no-op.

```bash
node dist/cli/migrate.js mcp http://localhost:3001 \
  --issuer did:uap:my-org \
  --key config/dev.privkey.hex \
  --out ./uap-cards

# Output: ./uap-cards/did:uap:my-org.card.json
```

---

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `KEYCLOAK_URL` | Keycloak base URL | `http://localhost:8080` |
| `KEYCLOAK_REALM` | Realm name | `uap` |
| `UAP_AUDIENCE` | JWT audience claim | `uap-gateway` |
| `UAP_SIGNING_KEY_PATH` | Path to Ed25519 private key hex | `config/dev.privkey.hex` |
| `UAP_DOCKER_SOCKET` | Docker socket path | `/var/run/docker.sock` |
| `UAP_AUDIT_LOG_DIR` | Append-only audit NDJSON log directory | `/var/log/uap` |
| `UAP_GATEWAY_PORT` | Gateway listen port | `3000` |
| `UAP_MTLS_CERT` | Server TLS certificate (PEM) | `certs/server.crt` |
| `UAP_MTLS_KEY` | Server TLS private key (PEM) | `certs/server.key` |
| `UAP_MTLS_CA` | CA cert for client cert verification | `certs/ca.crt` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `http://localhost:4318` |
| `REDIS_URL` | Redis for multi-instance registry (optional) | — |

---

## Core dependencies

| Package | Version | Purpose |
|---|---|---|
| `fastify` | `^4.27` | Gateway HTTP server |
| `zod` | `^3.23` | Envelope schema and type inference |
| `@noble/curves` | `^1.4` | Ed25519 signing (CapabilityCard) |
| `jose` | `^5.4` | JWT verification, JWKS client |
| `ajv` | `^8.16` | Transport-level param validation |
| `dockerode` | `^4.0` | Zero-trust sandbox adapter |
| `pino` | `^9.2` | Append-only structured audit log |
| `ulid` | `^2.3` | Sortable unique IDs for all entities |
| `@opentelemetry/sdk-node` | `^0.52` | Distributed tracing |
| `ioredis` | `^5.3` | Multi-instance service registry |
| `@modelcontextprotocol/sdk` | `^1.0` | MCP bridge adapter |
| `httpx` (Python) | `^0.27` | Async HTTP client for Python SDK |
| `pydantic` (Python) | `^2.7` | Python type validation |

---

## Contributing

Branch naming: `feat/<sprint>-<task>-<slug>` — e.g. `feat/s2-2.1-mtls-keycloak`

Every change follows: branch → local typecheck + vitest → commit → PR → squash merge → branch delete.

No CI dependency for local development. Run `npx tsc --noEmit` and `npx vitest run` before every commit.

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).

---

<div align="center">

<img src="./assets/vector_original_falcon.svg" alt="VECTOR — The UAP Gateway Falcon" width="600" />

*UAP · Universal Agent Protocol · 2026*

</div>
