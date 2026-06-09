import process from 'node:process';

const KEYCLOAK_URL = process.env['KEYCLOAK_URL'] || 'http://localhost:8080';
const KEYCLOAK_ADMIN = process.env['KEYCLOAK_ADMIN'] || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env['KEYCLOAK_ADMIN_PASSWORD'] || 'dev_password_change_in_prod';

interface KeycloakTokenResponse {
  access_token: string;
}

interface KeycloakClient {
  id: string;
  clientId: string;
}

interface KeycloakRole {
  id: string;
  name: string;
}

interface KeycloakUser {
  id: string;
  username: string;
  email: string;
}

async function fetchJson<T>(url: string, options: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} at ${url}: ${text}`);
  }
  if (res.status === 204) return {} as T;
  return await res.json() as T;
}

async function bootstrap() {
  console.log('Starting Keycloak bootstrap...');

  // 1. Get admin access token
  const tokenParams = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: KEYCLOAK_ADMIN,
    password: KEYCLOAK_ADMIN_PASSWORD,
  });

  const tokenResponse = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams,
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get admin token: ${await tokenResponse.text()}`);
  }

  const { access_token: token } = await tokenResponse.json() as KeycloakTokenResponse;
  const authHeader = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 2. Create realm 'uap' if missing
  const realmRes = await fetch(`${KEYCLOAK_URL}/admin/realms/uap`, { headers: authHeader });
  if (realmRes.status === 404) {
    console.log('Creating realm: uap');
    await fetchJson(`${KEYCLOAK_URL}/admin/realms`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ realm: 'uap', enabled: true }),
    });
  } else if (!realmRes.ok) {
    throw new Error(`Failed to check realm: ${await realmRes.text()}`);
  }

  // 3. Create client 'uap-gateway' if missing
  const clients = await fetchJson<KeycloakClient[]>(`${KEYCLOAK_URL}/admin/realms/uap/clients`, { headers: authHeader });
  let client = clients.find((c) => c.clientId === 'uap-gateway');

  if (!client) {
    console.log('Creating client: uap-gateway');
    await fetchJson(`${KEYCLOAK_URL}/admin/realms/uap/clients`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        clientId: 'uap-gateway',
        enabled: true,
        bearerOnly: true,
        standardFlowEnabled: false,
        directAccessGrantsEnabled: false,
      }),
    });
    const newClients = await fetchJson<KeycloakClient[]>(`${KEYCLOAK_URL}/admin/realms/uap/clients`, { headers: authHeader });
    client = newClients.find((c) => c.clientId === 'uap-gateway');
  }

  if (!client) throw new Error('Failed to create or find uap-gateway client');

  // 4. Create roles
  const roles = ['tool:read', 'tool:write', 'task:submit', 'task:read', 'task:cancel'];
  for (const roleName of roles) {
    const roleRes = await fetch(`${KEYCLOAK_URL}/admin/realms/uap/roles/${roleName}`, { headers: authHeader });
    if (roleRes.status === 404) {
      console.log(`Creating role: ${roleName}`);
      await fetchJson(`${KEYCLOAK_URL}/admin/realms/uap/roles`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ name: roleName }),
      });
    } else if (!roleRes.ok) {
      throw new Error(`Failed to check role ${roleName}: ${await roleRes.text()}`);
    }
  }

  // 5. Create user 'uap-test@example.com' if missing
  const users = await fetchJson<KeycloakUser[]>(`${KEYCLOAK_URL}/admin/realms/uap/users?email=uap-test@example.com`, { headers: authHeader });
  let user = users[0];

  if (!user) {
    console.log('Creating user: uap-test@example.com');
    await fetchJson(`${KEYCLOAK_URL}/admin/realms/uap/users`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        username: 'uap-test',
        email: 'uap-test@example.com',
        enabled: true,
        emailVerified: true,
        credentials: [{ type: 'password', value: 'password', temporary: false }],
      }),
    });
    const newUsers = await fetchJson<KeycloakUser[]>(`${KEYCLOAK_URL}/admin/realms/uap/users?email=uap-test@example.com`, { headers: authHeader });
    user = newUsers[0];
  }

  if (!user) throw new Error('Failed to create or find uap-test user');

  // Assign roles to user
  const realmRoles = await fetchJson<KeycloakRole[]>(`${KEYCLOAK_URL}/admin/realms/uap/roles`, { headers: authHeader });
  const rolesToAssign = realmRoles.filter((r) => roles.includes(r.name));

  if (rolesToAssign.length > 0) {
    await fetchJson(`${KEYCLOAK_URL}/admin/realms/uap/users/${user.id}/role-mappings/realm`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify(rolesToAssign),
    });
  }

  console.log(JSON.stringify({
    realm: 'uap',
    client: 'uap-gateway',
    roles,
    user: 'uap-test@example.com'
  }, null, 2));
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Bootstrap failed:', message);
  process.exit(1);
});
