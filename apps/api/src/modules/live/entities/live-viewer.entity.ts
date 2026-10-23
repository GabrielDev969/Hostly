// Who is watching on a panel socket: the scope the ticket was issued in. Advertisers never get one.
export class LiveViewer {
  userId: string;
  organizationId: string;
  workspaceId: string;
  clientId: string | null;
}
