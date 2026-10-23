import { http, HttpResponse } from 'msw';
import PanelLayout from '@/app/(panel)/layout';
import { SettingsPage } from '@/features/settings/settings-page';
import type { Schemas } from '@/lib/api/client';
import {
  ADVERTISER_ID,
  CLIENT_A,
  CLIENT_B,
  CLIENTS,
  membershipFor,
  USER_ID,
  WORKSPACE_ID,
  type RoleName,
} from './fixtures';
import { ACCESS_TOKEN, panelHandlers } from './handlers';
import { setLocation } from './navigation';
import { renderWithSession } from './render';
import { robotFixture, SITES } from './robots';
import { API, server } from './server';

type Member = Schemas['WorkspaceMemberResponseDto'];
type Role = Schemas['RoleResponseDto'];
type Invitation = Schemas['InvitationResponseDto'];
type Robot = Schemas['RobotResponseDto'];

const PAST = '2026-01-01T12:00:00.000Z';
const FUTURE = '2099-01-01T12:00:00.000Z';

export const CLIENT_INTERNAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SITE_INTERNAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const OWNER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const PAIRING_CODE = '042917';
// What the API answers on an invitation's 201; the panel must never show or keep it.
export const INVITATION_TOKEN = 'inv-secret-token-never-shown';

export const SETTINGS_CLIENTS = [
  ...CLIENTS,
  {
    id: CLIENT_INTERNAL,
    name: 'Robôs próprios',
    status: 'active',
    isInternal: true,
    createdAt: PAST,
    updatedAt: PAST,
  },
];

export const SETTINGS_SITES = [
  ...SITES,
  { ...SITES[0]!, id: SITE_INTERNAL, clientId: CLIENT_INTERNAL, name: 'Galpão' },
];

const ROLE_NAMES: RoleName[] = [
  'operator_admin',
  'operator_staff',
  'client_admin',
  'client_editor',
  'advertiser',
];

// Same ids as membershipFor, so the signed-in member's role is one of these.
export const ROLES: Role[] = ROLE_NAMES.map((name) => ({
  id: `role-${name}`,
  name,
  description: null,
  isSystem: true,
  permissions: [],
  createdAt: PAST,
  updatedAt: PAST,
}));

function member(
  id: string,
  userId: string,
  name: string,
  email: string,
  role: RoleName,
  scope: { clientId?: string; advertiserId?: string } = {},
): Member {
  return {
    id,
    userId,
    workspaceId: WORKSPACE_ID,
    roleId: `role-${role}`,
    clientId: scope.clientId ?? null,
    advertiserId: scope.advertiserId ?? null,
    joinedAt: PAST,
    user: { id: userId, name, email },
    role: { id: `role-${role}`, name: role, isSystem: true },
  };
}

// The signed-in user (Ana) is not the owner, so the owner row and her own row are told apart.
export function membersFor(role: RoleName): Member[] {
  return [
    member('m-owner', OWNER_ID, 'Otávio Dono', 'otavio@example.com', 'operator_admin'),
    member('m-self', USER_ID, 'Ana Souza', 'ana@example.com', role),
    member('m-staff', 'u-staff', 'Bruno Equipe', 'bruno@example.com', 'operator_staff'),
    member('m-client', 'u-client', 'Carla Cliente', 'carla@example.com', 'client_admin', {
      clientId: CLIENT_A,
    }),
    member('m-adv', 'u-adv', 'Davi Anunciante', 'davi@example.com', 'advertiser', {
      clientId: CLIENT_A,
      advertiserId: ADVERTISER_ID,
    }),
  ];
}

function invitation(over: Partial<Invitation>): Invitation {
  return {
    id: 'inv-1',
    email: 'eva@example.com',
    workspaceId: WORKSPACE_ID,
    roleId: 'role-client_editor',
    invitedById: OWNER_ID,
    clientId: CLIENT_B,
    expiresAt: FUTURE,
    acceptedAt: null,
    createdAt: PAST,
    ...over,
  };
}

export const INVITATIONS: Invitation[] = [
  invitation({}),
  invitation({
    id: 'inv-2',
    email: 'fabio@example.com',
    roleId: 'role-operator_staff',
    clientId: null,
    expiresAt: PAST,
  }),
  // Accepted: the API lists it, the panel does not show it as pending.
  // The API's Swagger types acceptedAt as an object; on the wire it is a date string.
  invitation({
    id: 'inv-3',
    email: 'gil@example.com',
    acceptedAt: PAST as unknown as Invitation['acceptedAt'],
  }),
];

export interface Reply {
  status: number;
  message?: string;
}

export interface SettingsCalls {
  // Every request URL the settings API saw, to prove no code or token rides in one.
  urls: string[];
  lookups: unknown[];
  approves: unknown[];
  invites: unknown[];
  roleChanges: { memberId: string; body: unknown }[];
  removals: string[];
  cancellations: string[];
}

// The settings API as an operator sees it. Each action takes the next queued reply, if any; then succeeds.
export function settingsApi(
  role: RoleName,
  options: {
    // Overrides the effective permissions of the signed-in membership.
    permissions?: string[];
    existingRobot?: Robot;
    replies?: Partial<
      Record<'lookup' | 'approve' | 'invite' | 'role' | 'remove' | 'cancel', Reply[]>
    >;
  } = {},
) {
  const members = membersFor(role);
  const invitations = structuredClone(INVITATIONS);
  const calls: SettingsCalls = {
    urls: [],
    lookups: [],
    approves: [],
    invites: [],
    roleChanges: [],
    removals: [],
    cancellations: [],
  };
  const replies = options.replies ?? {};
  const authorized = (request: Request) =>
    request.headers.get('authorization') === `Bearer ${ACCESS_TOKEN}`;
  const error = (status: number, message = `HTTP ${status}`) =>
    HttpResponse.json({ statusCode: status, message }, { status });
  const queued = (key: keyof NonNullable<typeof options.replies>) => {
    const reply = replies[key]?.shift();
    return reply ? error(reply.status, reply.message) : null;
  };

  const handlers = [
    http.all(`${API}/*`, ({ request }) => {
      calls.urls.push(request.url);
    }),
    http.get(`${API}/api/v1/workspaces/:workspaceId/me`, ({ request }) => {
      if (!authorized(request)) return error(401);
      const membership = membershipFor(role);
      return HttpResponse.json(
        options.permissions ? { ...membership, permissions: options.permissions } : membership,
      );
    }),
    http.get(`${API}/api/v1/clients`, ({ request }) =>
      authorized(request) ? HttpResponse.json(SETTINGS_CLIENTS) : error(401),
    ),
    http.get(`${API}/api/v1/sites`, ({ request }) =>
      authorized(request) ? HttpResponse.json(SETTINGS_SITES) : error(401),
    ),
    http.post(`${API}/api/v1/robots/pairings/lookup`, async ({ request }) => {
      calls.lookups.push(await request.json());
      return (
        queued('lookup') ??
        HttpResponse.json({
          serial: 'LB-TEST-0001',
          expiresAt: '2026-10-23T15:40:00.000Z',
          robot: options.existingRobot ?? null,
        })
      );
    }),
    http.post(`${API}/api/v1/robots/pairings/approve`, async ({ request }) => {
      const body = (await request.json()) as { siteId: string };
      calls.approves.push(body);
      const site = SETTINGS_SITES.find((s) => s.id === body.siteId)!;
      return (
        queued('approve') ??
        HttpResponse.json(
          robotFixture({
            serial: 'LB-TEST-0001',
            name: 'LB-TEST-0001',
            siteId: site.id,
            clientId: site.clientId,
            status: 'pending',
          }),
          { status: 201 },
        )
      );
    }),
    http.get(`${API}/api/v1/workspaces/:workspaceId/members`, ({ request }) =>
      authorized(request) ? HttpResponse.json(members) : error(401),
    ),
    http.patch(
      `${API}/api/v1/workspaces/:workspaceId/members/:memberId`,
      async ({ request, params }) => {
        const body = (await request.json()) as { roleId: string };
        calls.roleChanges.push({ memberId: String(params.memberId), body });
        const refused = queued('role');
        if (refused) return refused;
        const target = members.find((m) => m.id === params.memberId)!;
        const next = ROLES.find((r) => r.id === body.roleId)!;
        Object.assign(target, {
          roleId: next.id,
          role: { id: next.id, name: next.name, isSystem: true },
        });
        // Nest answers a void handler with an empty 200.
        return new HttpResponse(null, { status: 200, headers: { 'Content-Length': '0' } });
      },
    ),
    http.delete(`${API}/api/v1/workspaces/:workspaceId/members/:memberId`, ({ params }) => {
      calls.removals.push(String(params.memberId));
      const refused = queued('remove');
      if (refused) return refused;
      members.splice(
        members.findIndex((m) => m.id === params.memberId),
        1,
      );
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${API}/api/v1/workspaces/:workspaceId`, ({ request }) =>
      authorized(request)
        ? HttpResponse.json({
            id: WORKSPACE_ID,
            name: 'Operadora Teste',
            slug: 'operadora-teste',
            isPersonal: false,
            ownerId: OWNER_ID,
            createdAt: PAST,
            updatedAt: PAST,
          })
        : error(401),
    ),
    http.get(`${API}/api/v1/rbac/roles`, ({ request }) =>
      authorized(request) ? HttpResponse.json(ROLES) : error(401),
    ),
    http.get(`${API}/api/v1/invitations`, ({ request }) =>
      authorized(request) ? HttpResponse.json(invitations) : error(401),
    ),
    http.post(`${API}/api/v1/invitations`, async ({ request }) => {
      const body = (await request.json()) as { email: string; roleId: string; clientId?: string };
      calls.invites.push(body);
      const refused = queued('invite');
      if (refused) return refused;
      const created = invitation({
        id: `inv-${invitations.length + 1}`,
        email: body.email,
        roleId: body.roleId,
        clientId: body.clientId ?? null,
      });
      invitations.unshift(created);
      return HttpResponse.json({ ...created, token: INVITATION_TOKEN }, { status: 201 });
    }),
    http.delete(`${API}/api/v1/invitations/:id`, ({ params }) => {
      calls.cancellations.push(String(params.id));
      const refused = queued('cancel');
      if (refused) return refused;
      invitations.splice(
        invitations.findIndex((i) => i.id === params.id),
        1,
      );
      return new HttpResponse(null, { status: 204 });
    }),
  ];
  return { handlers, calls, members, invitations };
}

// The settings page inside the panel shell, as the role sees it.
export function renderSettings(
  role: RoleName = 'operator_admin',
  options: Parameters<typeof settingsApi>[1] = {},
  path = '/settings',
) {
  const session = panelHandlers(role);
  const api = settingsApi(role, options);
  // Later handlers win, so these replace the session's /me and /clients.
  server.use(...session.handlers);
  server.use(...api.handlers);
  setLocation(path);
  const rendered = renderWithSession(
    <PanelLayout>
      <SettingsPage />
    </PanelLayout>,
  );
  return { ...rendered, api };
}
