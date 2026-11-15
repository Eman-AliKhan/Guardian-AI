# Guardian AI Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: Sensitive citizen PII (`cnic`, `phone`, `fullAddress`, `street`, `bloodGroup`, `allergies`, `medicalConditions`, `contactsSummary`) is stored strictly inside `/citizens/{citizenId}/private/pii` and requires both `email_verified == true` and parent ownership (`get(/citizens/{citizenId}).ownerId == request.auth.uid`) or `isAdmin()`.
2. **Identity Integrity**: Every citizen, private PII, incident, and community report document binds `ownerId == request.auth.uid` on creation and keeps `ownerId` and `createdAt` immutable on updates.
3. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time`.
4. **Terminal State Locking**: Once an incident is `resolved` or `false_alarm`, only an authorized `isAdmin()` operator can modify it.
5. **Relational Integrity**: Incidents and community reports require `exists(/citizens/{citizenId})` on creation.

## 2. Adversarial Test Matrix ("Dirty Dozen")
1. Unauthenticated read on `/citizens/user1/private/pii` -> `PERMISSION_DENIED`
2. Unverified email (`email_verified: false`) writing `/citizens/user1` -> `PERMISSION_DENIED`
3. Non-owner authenticated user reading `/citizens/victim/private/pii` -> `PERMISSION_DENIED`
4. Shadow field injection (`isAdmin: true`) on `/citizens/user1` create -> `PERMISSION_DENIED`
5. Invalid CNIC format (`"12345"`) on `/citizens/user1/private/pii` -> `PERMISSION_DENIED`
6. Oversized >1KB ID poisoning on `/incidents/{id}` -> `PERMISSION_DENIED`
7. Client-forged timestamp (`createdAt` != `request.time`) -> `PERMISSION_DENIED`
8. Spoofing `ownerId` to another UID during `incidents` create -> `PERMISSION_DENIED`
9. Blank `allow list` query without `resource.data.ownerId == request.auth.uid` -> `PERMISSION_DENIED`
10. Modifying an `incident` after `status == 'resolved'` as non-admin -> `PERMISSION_DENIED`
11. Escalating `community_reports.moderationStatus` directly as non-admin -> `PERMISSION_DENIED`
12. Creating `/incidents/{id}` without an existing `/citizens/{citizenId}` parent -> `PERMISSION_DENIED`
