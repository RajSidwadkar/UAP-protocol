# UAP-protocol — UAP (Universal Agent Protocol)

The Universal Agent Protocol (UAP) is a standardized communication layer designed to enable seamless, secure, and verifiable interactions between autonomous agents, humans, and digital services across heterogeneous environments.

## Quick Start

```bash
git clone https://github.com/uap-protocol/UAP-protocol.git
cd UAP-protocol
npm install
npm run build
npm test
```

## Architecture

UAP follows a hexagonal architecture pattern organized into four primary layers:

1. **Domain Layer**: Core business logic and agent-to-agent protocol definitions.
2. **Application Layer**: Use cases, command handlers, and port definitions.
3. **Infrastructure Layer**: Concrete implementations of adapters (auth, storage, sandbox).
4. **Transport Layer**: External communication interfaces (Fastify, WebSocket).

## Packages

- `gateway`: The central protocol router and entry point for external requests.
- `sdk-ts`: Official TypeScript SDK for building UAP-compatible agents and services.
- `sdk-py`: Official Python SDK for high-performance agent integration.
