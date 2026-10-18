---
name: specset-admin
description: Use when administering a Specset organization — inviting and managing members and roles, or applying whitelabel branding (colors, logos) — for org membership, permissions, or appearance tasks.
allowed-tools: Bash Read AskUserQuestion
---

# Org Administration

Every operation here takes your org id — get it with `{ me { orgMembers { org { id slug name } } } }` if you don't have it. Inline enums, lists, and input objects in the operation text (`-F` is strings-only; Variable Limitations and Schema Discovery live in the `specset` skill). These mutations change real people's access and the whole org's appearance.

## Members

Roles (`OrgMemberTeamRole`): `Member`, `Manager`, `Admin`. Statuses (`OrgMemberStatus`): `PendingApproval`, `Active`, `Deactivated`. You need to be an org Admin for most mutations in this skill.

List members — filtered flat list or paginated search:

```bash
specset api --query 'query($orgId: ID!) {
  orgMembers(orgId: $orgId, statuses: [Active]) {
    id role status user { id email firstName lastName }
  }
}' -F orgId=<org-id>

specset api --query 'query($orgId: ID!, $search: String) {
  paginatedOrgMembers(orgId: $orgId, search: $search, first: 20) {
    edges { node { id role status user { email } } }
    pageInfo { hasNextPage endCursor totalCount }
  }
}' -F orgId=<org-id> -F search="smith"
```

Manage them (all take the **membership** id from the queries above, not the user id):

- `updateOrgMember(id: ID!, role: ..., projectIds: [ID!], teamIds: [ID!])` — `role` is required even when unchanged, so resend the current role when only touching `projectIds`. `projectIds` scopes a Member to specific projects (the projects they were added to themselves; ones they're on through a team come with the team); `teamIds` replaces their teams. Omit either to leave it alone. Adding or removing a project, or a team's projects, needs management permission in each of those projects.
- `approveOrgMember(id: ID!)` — activate a `PendingApproval` member.
- `deactivateOrgMember(id: ID!)` / `reactivateOrgMember(id: ID!)` — suspend and restore access. Deactivation is reversible and preserves history — prefer it over any form of member deletion.

```bash
specset api --query 'mutation($id: ID!) {
  updateOrgMember(id: $id, role: Manager) { id role user { email } }
}' -F id=<org-member-id>
```

## Teams

A team is a named group of members. Assigning a team to a project puts everyone on it on that project, and changes to the team carry over to every project it's on. Teams don't carry a role: people keep their org role unless a project role is set on them.

- `teams(orgId: ID!)` — select `{ id name members { orgMember { user { email } } } projects { project { id name } } canManage }`.
- `createTeam(orgId: ID!, name: String!, userIds: [ID!], projectIds: [ID!])`, `updateTeam(id: ID!, name: String, userIds: [ID!], projectIds: [ID!])` (lists replace; assignments to archived projects stay), `deleteTeam(id: ID!)`.
- On a project: `projectTeams(projectId: ID!)`, `addProjectMembers(projectId: ID!, userIds: [ID!], teamIds: [ID!])`, `removeProjectTeam(id: ID!)` (takes the `ProjectTeam` id).

Changing a team needs org Manager or Admin and management permission in every project the team is on or will be on; `canManage` says whether you have it.

## Adding Users and Invites

Nobody joins an org on someone else's say-so. Both paths below leave the person with a pending invitation they must accept — in the app (existing Specset users see an invite badge), by registering through the invite link, or by signing in with the org's SSO. Until then an added user is an `Invited` member: visible in pickers and assignable, but with no access.

- `createOrgMember(orgId: ID!, email: String!, firstName: String!, lastName: String!, role: ..., projectIds: [ID!], teamIds: [ID!], sendInvite: Boolean)` — adds the person as an `Invited` seat right away so they can be assigned work before they've joined. `sendInvite: true` emails the invite link; existing Specset users get the in-app invitation either way. Returns the `OrgMember` (`status: Invited`).
- `createOrgInvite(orgId: ID!, email: String!, role: ..., projectIds: [ID!])` — invite-only (no seat until they accept; no `teamIds`, so add teams once they have a seat); also used to (re-)invite an existing `Invited` seat. `projectIds` (optional, inline the list) pre-scopes a Member to specific projects. Set `role` deliberately — don't default people to more access than they need. Share the returned `inviteUrl` if the email might not land.
- `orgInvites(orgId: ID!)` / `paginatedOrgInvites(orgId: ID!, first: Int, after: String)` — pending invites; select `{ id user { email } role inviteUrl }`.
- `updateOrgInvite(id: ID!, role: ..., projectIds: [ID!])` — `role` is required.
- `resendOrgInvite(id: ID!)` — rotates the link and re-sends the email.
- `deleteOrgInvite(id: ID!)` — revoke a pending invite (an `Invited` seat stays, as "Not invited"; `deleteOrgMember` removes the seat).

```bash
specset api --query 'mutation($orgId: ID!, $email: String!) {
  createOrgMember(orgId: $orgId, email: $email, firstName: "Alex", lastName: "Rivera", role: Member, sendInvite: true) {
    id status user { email }
  }
}' -F orgId=<org-id> -F email=alex@example.com
```

## Branding Your Organization

Appearance changes require the **whitelabel** plan feature: without it the mutation is rejected for org admins, and custom branding won't render even if set. If you hit an authorization error on `appearance`, or branding saves but doesn't show, email support@specset.com about whitelabel access.

### Colors

Theming hangs off five anchor colors; the app derives the full light and dark palettes from them:

| Anchor | Drives |
|---|---|
| `brand` | Primary buttons, links, navigation highlights |
| `magic` | AI/agent accent surfaces |
| `success` | Positive states |
| `danger` | Destructive/error states |
| `warning` | Caution states |

Each is a `#rrggbb` hex string. `appearance` is an input object, so inline it. **`updateOrg` replaces the whole appearance object** — include every anchor you want on every call; any you omit are cleared back to the stock theme.

```bash
specset api --query 'mutation($id: ID!) {
  updateOrg(id: $id, appearance: { anchors: {
    brand: "#003087", magic: "#0085CA", success: "#4B8320",
    danger: "#B71300", warning: "#FF8400"
  } }) {
    id
    appearance { anchors { brand magic success danger warning } }
  }
}' -F id=<org-id>
```

`brand` becomes the button and link color on white backgrounds, so it needs to hold white text. Branding applies to every member of the org — confirm the palette with the user before writing it.

### Logos

Two slots, both attached by file id on `updateOrg`:

- `logoId` — square mark; shown where space is tight (collapsed navigation).
- `wideLogoId` — horizontal mark + wordmark; shown in the expanded header.

Upload the image first following Uploading Files in the `specset` skill to get a file id, then attach:

```bash
specset api --query 'mutation($id: ID!, $fileId: ID!) {
  updateOrg(id: $id, wideLogoId: $fileId) { id wideLogo { id } }
}' -F id=<org-id> -F fileId=<file-id>
```

Use `logoId: $fileId` for the square mark. Passing `null` (inline) clears a slot.

## Safety

- For role changes, deactivations, and invite deletions, echo the affected person's email back to the user first — these change real access immediately.
- `updateOrg` rejects `maxCredits` and `skus` — those fields are managed by Specset. Send only the fields you mean to change (plus the full `appearance` object when changing any part of it).
- Creating or deleting organizations, SSO, and email-domain management are out of scope for this skill — direct the user to support@specset.com.
