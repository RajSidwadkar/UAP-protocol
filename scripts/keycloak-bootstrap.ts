const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_ADMIN = process.env.KEYCLOAK_ADMIN || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'dev_password_change_in_prod';

async function bootstrap() {
  console.log('Starting Keycloak bootstrap...');

  // 1. Get admin access token
  const tokenResponse = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: KEYCLOAK_ADMIN,
      password: KEYCLOAK_ADMIN_PASSWORD,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get admin token: ${await tokenResponse.text()}`);
  }

  const { access_token: token } = await tokenResponse.json() as { access_token: string };
  const authHeader = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 2. Create realm 'uap' if missing
  const realmRes = await fetch(`${KEYCLOAK_URL}/admin/realms/uap`, { headers: authHeader });
  if (realmRes.status === 404) {
    console.log('Creating realm: uap');
    await fetch(`${KEYCLOAK_URL}/admin/realms`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ realm: 'uap', enabled: true }),
    });
  }

  // 3. Create client 'uap-gateway' if missing
  const clientsRes = await fetch(`${KEYCLOAK_URL}/admin/realms/uap/clients`, { headers: authHeader });
  const clients = await clientsRes.json() as any[];
  let client = clients.find((c: any) => c.clientId === 'uap-gateway');

  if (!client) {
    console.log('Creating client: uap-gateway');
    await fetch(`${KEYCLOAK_URL}/admin/realms/uap/clients`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        clientId: 'uap-gateway',
        enabled: true,
        bearerOnly: true, // Resource server
        standardFlowEnabled: false,
        directAccessGrantsEnabled: false,
      }),
    });
    const newClientsRes = await fetch(`${KEYCLOAK_URL}/admin/realms/uap/clients`, { headers: authHeader });
    const newClients = await newClientsRes.json() as any[];
    client = newClients.find((c: any) => c.clientId === 'uap-gateway');
  }

  // 4. Create roles
  const roles = ['tool:read', 'tool:write', 'task:submit', 'task:read', 'task:cancel'];
  for (const roleName of roles) {
    const roleRes = await fetch(`${KEYCLOAK_URL}/admin/realms/uap/roles/${roleName}`, { headers: authHeader });
    if (roleRes.status === 404) {
      console.log(`Creating role: ${roleName}`);
      await fetch(`${KEYCLOAK_URL}/admin/realms/uap/roles`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ name: roleName }),
      });
    }
  }

  // 5. Create user 'uap-test@example.com' if missing
  const usersRes = await fetch(`${KEYCLOAK_URL}/admin/realms/uap/users?email=uap-test@example.com`, { headers: authHeader });
  const users = await usersRes.json() as any[];
  let user = users[0];

  if (!user) {
    console.log('Creating user: uap-test@example.com');
    await fetch(`${KEYCLOAK_URL}/admin/realms/uap/users`, {
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
    const newUserRes = await fetch(`${KEYCLOAK_URL}/admin/realms/uap/users?email=uap-test@example.com`, { headers: authHeader });
    const newUsers = await newUserRes.json() as any[];
    user = newUsers[0];
  }

  // Assign roles to user
  const realmRolesRes = await fetch(`${KEYCLOAK_URL}/admin/realms/uap/roles`, { headers: authHeader });
  const realmRoles = await realmRolesRes.json() as any[];
  const rolesToAssign = realmRoles.filter((r: any) => roles.includes(r.name));

  await fetch(`${KEYCLOAK_URL}/admin/realms/uap/users/${user.id}/role-mappings/realm`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify(rolesToAssign),
  });

  console.log(JSON.stringify({
    realm: 'uap',
    client: 'uap-gateway',
    roles,
    user: 'uap-test@example.com'
  }, null, 2));
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
