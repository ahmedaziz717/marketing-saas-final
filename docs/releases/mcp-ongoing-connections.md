# Ongoing revocable authoring connections

This increment adds renewal to the existing authoring OAuth service. It does not add MCP tools or change draft review/apply boundaries. `workflows:read workflows:draft` permits reading definitions, creating/refining unapplied proposals and requesting review links. Saving still requires the signed-in user to review and apply in EvokeLoop. Execution, publication, schedules, spending and arbitrary deletion remain unavailable.

## Consent and compatibility

Existing grants remain 30-minute sessions. The consent page defaults to **30 minutes only**. A user must explicitly select **Ongoing, revocable (30-day inactivity limit)** for a new authorization code to yield refresh credentials. The choice is recorded server-side with the consent; the token endpoint cannot upgrade a session. No additional resource scope is introduced. There is no automatic production grant or plugin change on deployment.

Ongoing connections use 30-minute opaque access tokens and opaque rotating refresh tokens. Only SHA-256 hashes are stored. Every successful renewal replaces both credentials and advances the inactivity deadline by 30 days. An expired access token can be refreshed while the connection remains active. Previously issued access tokens stop working after rotation. Successful renewal, rather than ordinary tool use, advances the inactivity deadline. Active renewal can continue until revocation; this is not a never-expiring bearer token.

The refresh endpoint requires the exact configured `client_id` and `resource`; an optional `scope` must equal the granted scope set. Scope reduction/expansion requires fresh consent. No client secret is added. Existing authorization-code, PKCE S256 and exact redirect/resource checks are preserved.

## Revocation and races

Connection and refresh rows are locked under the existing organization transaction. Consumed refresh hashes remain attached to the connection for replay detection. Reuse revokes the entire connection and commits that revocation before returning `invalid_grant`. Two concurrent uses of the same token yield one successful exchange and one rejection that revokes the family; the first response's new credentials then become unusable. Clients must serialize refreshes. A lost successful refresh response requires reconnection, not blind retry. This intentionally avoids a replay grace window or plaintext response cache.

Each refresh and authenticated access verification checks current membership and authoring roles. Detected permission loss permanently revokes the connection. The existing workspace member removal/role-update path also revokes connections in the same transaction, so rejoining cannot revive them. Direct database changes still require an access/refresh check to detect loss; supported membership management revokes immediately. User revocation works even after losing membership and invalidates renewal plus current access. Management shows the renewal deadline and retains its revoke action after access-token expiry.

Audit events record consent, renewal and revocation without tokens. Consumed hashes are retained for the connection lifetime; no background pruning is introduced here. Migration `0023_authoring_refresh` adds one private RLS table and two nullable/defaulted columns; older grants are not extended.

## Validation and activation

Local PGlite tests cover consent/session compatibility, rotation, binding, tenant isolation, escalation, malformed inputs, idle expiry, permission loss/restoration, owner-bound revocation and replay. Real PostgreSQL CI tests cover concurrent refresh and refresh-versus-revoke locking. Existing MCP tests continue to enforce proposal-only tool behavior and browser review/apply.

References: [OAuth Security BCP, refresh rotation and inactivity](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14), [OAuth refresh grant](https://www.rfc-editor.org/rfc/rfc6749#section-6), [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth). Protocol support and local tests are not proof of live ChatGPT renewal interoperability.

After review, the release owner coordinates deployment. Then obtain exact action-time approval for the existing plugin, CLXGaming/workspace 3, `workflows:read workflows:draft`, automatic renewal and the 30-day inactivity limit. Reconnect the existing plugin; do not create a duplicate or broaden permissions. Select ongoing duration deliberately. Verify a benign read, an unapplied proposal/review link, actual token renewal across expiry and revocation in an approved test connection. Never print token contents. No live grant, credentials, plugin configuration, paid call or deployment was performed by this implementation task.
