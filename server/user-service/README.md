# User service

AWS Lambda HTTP API for registration, login, authorization, and current-user
operations. The service uses DynamoDB and is packaged as one bundled ESM
artifact with Serverless Framework.

## Local verification

Use the repository-pinned Node and npm versions, then run:

```bash
npm ci
npm test -- --runInBand
npm run test:identity-backfill
npm run test:artifact
npm run test:package
```

## DynamoDB Local identity integration tests

`npm run test:integration` exercises the registration and current-user identity
transactions against a real, in-memory DynamoDB Local process. It creates
isolated User, Student, and Trainer tables with only their `id` hash key and
fixed 1 RCU/1 WCU capacity; it never contacts AWS and uses local dummy
credentials.

The runner needs Java and normally downloads DynamoDB Local's official archive
to an operating-system temporary cache. Before extraction it verifies the
archive SHA-256:

```
55b425a9a42cfc728436eaf0e4ae64d688b64d177c99c4f4c4d7e3dbb3ac6c09
```

For offline validation, supply the downloaded archive; the runner verifies it
before extracting to its digest-keyed temporary cache:

```bash
DYNAMODB_LOCAL_ARCHIVE=/path/to/dynamodb_local_latest.tar.gz npm run test:integration
```

The upstream URL intentionally uses DynamoDB Local's `latest` archive, guarded by
the immutable digest above. Updating DynamoDB Local requires intentionally
reviewing the upstream artifact, replacing the pinned digest in
`scripts/run-dynamodb-integration.mjs`, and updating this documentation in the
same change.

`test:package` uses the non-sensitive test parameter name
`/learning-portal/test/jwt-secret`. It verifies the generated CloudFormation
template and ZIP without reading a parameter or making AWS calls.

For a stage-specific package, provide only the parameter name:

```bash
npm run package -- --param=jwtSecretParameter=/learning-portal/dev/jwt-secret
```

Never pass the JWT value to Serverless. The generated template must contain only
the parameter name.

`npm run offline` supplies that same non-sensitive development parameter name
while starting the local HTTP emulator. Handler calls still use the configured
AWS SDK clients, so exercise them only with the intended local or development
service access.

## Zero-additional-charge JWT parameter

Create the JWT value outside CloudFormation as an SSM Parameter Store
`SecureString` with these settings:

- name: `/learning-portal/<stage>/jwt-secret`;
- tier: `Standard` explicitly;
- KMS key: omit `KeyId`, which selects the AWS-managed `alias/aws/ssm` key;
- Parameter Store throughput: retain the default standard setting.

Avoid placing the value in shell history or a tracked file. Use the AWS console
or an approved secret-input workflow. Before deployment, verify the metadata
without retrieving the value:

```bash
aws ssm describe-parameters \
  --parameter-filters Key=Name,Option=Equals,Values=/learning-portal/dev/jwt-secret \
  --query 'Parameters[0].{Type:Type,Tier:Tier,KeyId:KeyId}'

aws ssm get-service-setting \
  --setting-id /ssm/parameter-store/high-throughput-enabled \
  --query ServiceSetting.SettingValue \
  --output text
```

Require `Type=SecureString`, `Tier=Standard`, the default `alias/aws/ssm` key,
and a false high-throughput setting. The Lambda roles grant only
`ssm:GetParameter` for the exact parameter path, and only login and the JWT
authorizer receive that role and parameter name. No customer-managed KMS key or
KMS grant is created.

Login and authorization share a per-Lambda cached, decrypted parameter value for
at most 60 seconds. Concurrent cache misses share one Parameter Store read; a
failed or blank read is never cached. A rotation can therefore take up to one
minute to affect a warm execution environment. Standard-throughput throttling
produces a retryable 503 response for HTTP handlers, while authorization fails
closed as unauthorized.

## Fixed-capacity cost boundary

All five DynamoDB tables use fixed provisioned capacity of 1 RCU and 1 WCU.
The retained `UserTable` `email-index` is also fixed at 1 RCU and 1 WCU. The
tables use `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain`, so stack
deletion or table replacement does not delete their data.
The template contains no Application Auto Scaling targets or policies, so it does
not create their associated CloudWatch alarms. `StudentTable` and `TrainerTable`
do not define the runtime-unused `userId-index`.

Retention does not preserve CloudFormation ownership after stack deletion. Do
not run `sls remove` and then attempt a normal redeploy: the five fixed table
names will collide with the preserved tables. Use the repository-level
[retained-resource recovery and replacement runbook](../../docs/retained-resource-recovery.md)
to import all five tables under `user-service-dev` before deployment, or to stage
a no-data-loss replacement migration.

This configuration is deliberately optimized for a near-idle study project.
Sustained traffic can throttle rather than scale. Remaining within a free
allowance still depends on the AWS account's eligibility, other workloads, data
storage, requests, logs, and regional pricing; verify the generated change set
and account billing before deployment.

## Identity migration safety

Do not deploy the identity-claim migration to an existing stack in one step.
`UserTable` becomes authoritative: every user has `canonicalEmail`, `role`, and
`roleProfileId`, and it also holds `EMAIL#<canonical-email>` claim items.

Release in this order:

1. Freeze registration, email changes, and account deletion. Take recoverable
   backups of `UserTable`, `StudentTable`, and `TrainerTable`. **Stop** unless
   both the write freeze and backups are confirmed.
2. Audit the live tables and write a new review-only plan file:

   ```bash
   npm run identity:backfill:audit -- \
     --region us-east-1 \
     --out identity-plan.json
   ```

   The audit uses strongly consistent, paginated scans and fails closed for
   canonical-email collisions, reserved-key collisions, duplicate/missing
   profiles, cross-role ambiguity, and orphan profiles. It creates the plan with
   mode `0600` and refuses to overwrite an existing file.

3. Review the exact table names, operations, and printed SHA-256 digest. With
   the write freeze still active, apply only that reviewed plan:

   ```bash
   npm run identity:backfill:apply -- \
     --region us-east-1 \
     --plan identity-plan.json \
     --confirm <reviewed-sha256> \
     --writes-frozen confirmed
   ```

   Each user is updated transactionally with an owned email claim. The process
   is retry-safe and rescans all three tables after applying; any remaining
   operation fails the command.

4. Inspect the deployed stack before applying the final Serverless template.
   The change removes all DynamoDB target-tracking resources and the unused
   Student/Trainer `userId-index` definitions while retaining the fixed-capacity
   `email-index`. A CloudFormation update can therefore delete matching live
   indexes, scaling targets, policies, and generated CloudWatch alarms. If a
   role index is live and managed by the current stack, delete it with a reviewed
   intermediate stack update that changes no other resource; wait for the table
   to return to `ACTIVE` before handling the other table or continuing. Do not
   combine a GSI deletion with this release's handler, IAM, or scaling changes.
   Stop if any reviewed change set contains table replacement or item deletion.
5. Package with the real parameter name, inspect the package gate, deploy while
   writes remain frozen, and exercise registration, canonical-equivalent email
   conflicts, login, both profile roles, password update, logout, and deletion
   against a non-production account. Reopen writes only after those checks pass.

Rollback must preserve all `EMAIL#...` claims and identity fields. Only roll
back to handler code that continues maintaining those records; reverting to the
old read-then-write email flow would reopen duplicate registration and update
races.

The table names are fixed rather than stage-qualified, so `--stage` does not
create an isolated copy in the same AWS account.

## Packaging and Serverless v4

`scripts/build.mjs` type-checks and bundles the locked runtime dependencies into
`.build/index.js`. Serverless packages that bundle plus a minimal
`.build/package.json` declaring the ESM module type. The package gate extracts
that ZIP into an isolated directory and loads all eight handlers, requires them
to use Node 24, forbids plaintext JWT configuration and development files,
verifies exact SSM IAM scope and disabled authorizer caching, and enforces
compressed/uncompressed size ceilings. It also rejects any auto-scaling
resource, unexpected GSI, or DynamoDB throughput other than fixed 1 RCU/1 WCU.

The service declares `nodejs24.x` directly through the official Serverless
Framework v4 distribution and accepts its required outbound access to Serverless
services. Local commands use interactive authentication through the developer's
personal Serverless account; that personal credential must not be copied into
automation.

When GitHub Actions deployment is added, create a dedicated non-interactive
Serverless credential and expose it only as the `SERVERLESS_ACCESS_KEY` secret of
a protected GitHub Actions environment. Never commit the key or reuse it outside
that deployment environment.
