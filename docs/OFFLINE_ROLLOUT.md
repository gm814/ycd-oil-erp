# Offline operation and interaction performance

Status: **pilot source, not a full-system offline release**. `YCD_OFFLINE_PILOT=false` by default. Do not announce offline readiness or deploy this flag to production until its gates pass.

## Implemented in this change

- Public offline shell cached by a narrowly scoped service worker. Authenticated HTML, API responses, credentials and Next RSC payloads are never put in Cache Storage.
- An authenticated, permission-filtered product/stock snapshot with an eight-hour local operating lease. The device must be prepared online and have an open shift before an outage.
- IndexedDB outbox for new customer/vehicle/service-order submissions with product lines and an optional request to close and record the payment. Local commit confirmation is distinct from server confirmation. The local reference is **not an issued tax invoice or confirmed electronic payment**.
- Synchronization when online, on focus/reopening, on a manual request and at bounded retry intervals while the application is open. No promise of background execution while an iPhone app is closed.
- A UUID and normalized payload hash, immutable local command, and server receipt committed atomically with all business writes. Replays cannot create a second order, invoice, payment or stock issue.
- Serializable transactions and summed quantities for repeated product lines; two devices cannot both spend the same last stock. Conflicts remain in the outbox for review and are never silently overwritten.
- Current server authentication, account/branch/session-version checks and current permissions at sync. Closing the original shift, changed product price, mismatched customer/vehicle data or insufficient stock block acceptance. They do not delete the local command.
- Logout locks the active offline profile across tabs while retaining each account's pending records. A locked profile cannot be reactivated by an in-flight background bootstrap; successful sign-in explicitly unlocks it.
- Dashboard client navigation, route loading feedback, short accessible button feedback, and bounded connection-error handling in login/intake/logout. Blank optional year/odometer fields no longer become invalid zero values during intake.

## Explicit gaps before the requested full ERP release

- Offline creation/editing of inventory master data and receipts, supplier/procurement workflows, expenses/cash custody, returns, HR, approvals and financial closing are not implemented here.
- Official invoice issuance/printing during an outage requires a separate reviewed issuance design; this pilot requests central issuance on sync only.
- The existing approved dashboard remains the main interface. The pilot uses an additional fallback screen. Integrating all existing screens with local queries and commands remains necessary.
- The product snapshot is not a complete reporting mirror. Full report snapshots, incremental pulls, deletion tombstones and per-module freshness indicators remain to be built.
- Conflict correction currently requires resolving the underlying central issue, then retrying the same immutable command. A privileged reassignment/correction workflow with a linked audit trail is still required for closed shifts or irreconcilable conflicts.
- Pending data survives page closure and normal device restart, but a browser can deny/evict storage. Persistent storage is requested where available. Quota failure must retain input and show failure, and the operator must not delete app/browser data while pending records exist.
- The eight-hour lease is a pilot policy, not a user-approved long-outage policy. The final offline access duration and reauthentication experience must be designed before rollout.

## Release gates

1. `npm run db:generate`, `npm run typecheck`, `npm run build`.
2. On an isolated database whose name contains `uat`, migrate and seed, then run `ALLOW_UAT_FIXTURES=true npm run verify:offline`. Never point this test at a live database.
3. `npx playwright install chromium` then `npm run verify:offline-browser`. This browser test uses a local mock server; it does not replace database integration tests.
4. Real-device Safari/iPhone and Chrome/Android, tablet and desktop tests: preparation, disconnect, app closure and reopening, saved command, connectivity flapping, same command from two tabs, expired/changed session, logout, changed branch, exhausted storage and competing stock.
5. Measure local save acknowledgement and navigation latency on the target devices. Do not claim measured performance gains from code changes alone.
6. Complete the module gaps above before calling the whole ERP offline-capable. Preserve audience, branding and data.

## Deployment and rollback

The migration is additive. Receipts must not be truncated or rolled back after commands are accepted, otherwise replay deduplication would be lost. Disabling the pilot stops bootstrap/sync on the server and hides its link; it does not erase pending local operations. Keep a recovery path for those records before retiring the feature. No production database or Render configuration was changed while preparing this branch.
