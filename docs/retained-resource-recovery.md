# Retained-resource recovery and replacement

This is the approved recovery procedure for the fixed-name resources retained by
the two Serverless stacks.

| Stack                         | Retained logical resources                                                                   | Physical identifiers                           |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `learning-app-cloudfront-dev` | `WebAppS3Bucket`                                                                             | `BucketName=learning-app-cloudfront-50342117`  |
| `user-service-dev`            | `UserTable`, `StudentTable`, `TrainerTable`, `SpecializationTable`, `BlacklistedTokensTable` | Each table's `TableName` equals its logical ID |

CloudFormation `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` protect
data from stack deletion and replacement. They do not keep a retained resource in
the deleted stack. A normal Serverless deployment has no resource-import phase,
so it attempts to create the same fixed physical name and fails.

## Hard stop after stack removal

Never use `sls remove` as a reset-and-redeploy operation for either stack. If a
stack was deleted while one or more resources were retained:

1. do not run `serverless deploy`, `npm run cloudfront:setup`, or the backend
   `npm run deploy` command;
2. do not rename or empty the retained bucket or tables;
3. restore CloudFormation ownership under the original stack name first;
4. run a normal Serverless deployment only after import and drift checks pass.

The web and backend stacks are both in `us-east-1`. The DynamoDB table names are
not stage-qualified, so a different `--stage` in the same AWS account is not an
isolated recovery environment.

## Generate the import evidence

Install the locked dependencies in both npm projects, then generate a fresh
bundle into a new directory:

```bash
npm ci
(cd server/user-service && npm ci)
npm run retained-resources:plan -- \
  --out /absolute/path/to/new-recovery-directory \
  --expected-account-id <12-digit-aws-account-id>
```

The expected account ID must come from the approved account inventory or AWS
console, independently of whichever CLI credentials happen to be active. Do not
discover the value from the same CLI session and feed it back as the expectation.
The generator rejects a missing or malformed account ID and records the exact
value in `recovery-plan.json`.

The generator renders both Serverless configurations and fails closed unless it
finds exactly the one bucket and five tables listed above, with static physical
names and both retention policies. It writes mode-`0600` files and refuses to
overwrite an existing output directory. The bundle contains, for each stack:

- an import-only CloudFormation template copied from the rendered resource;
- a `resources-to-import` map with the exact logical and physical identifiers;
- a stack policy that denies replacement and removal of each imported durable
  logical ID while allowing other stack updates;
- a `recovery-plan.json` containing the expected account ID, region, stack name,
  resource inventory, underlying CloudFormation arguments, and account-gated
  runner commands.

The generated template describes repository intent, not necessarily live AWS
state. Before using it, compare every property to the retained resource. At a
minimum, inspect the bucket region and website configuration; inspect every
table's keys, billing mode, provisioned throughput, GSIs, and TTL. Back up the
tables and freeze application writes before a backend recovery. Stop if the live
configuration differs; reconcile the template to the live resource in a reviewed
copy rather than allowing the first post-import deploy to mutate unknown drift.

The files are review evidence, not execution authority. Before every recovery
action, the runner re-renders the selected Serverless configuration and compares
the complete parsed import template, resource map, and stack policy to the three
files. A missing, malformed, or modified artifact stops before STS. For actions
that submit those documents, the runner passes freshly reconstructed inline JSON
to the AWS CLI, so CloudFormation never reads a mutable artifact path.

## Recover when the original stack is absent

First verify the region, verify that the original stack is absent, and verify that
none of the retained resources belongs to another CloudFormation stack. An import
fails if a resource is already managed by a different stack.

Do not copy or invoke the plan's low-level `awsArguments` directly. Use only the
generated `commands`, which require the expected account both on the command line
and in the plan. Immediately before every CloudFormation call, the runner invokes
`aws sts get-caller-identity` and requires an exact account match. A missing ID,
plan/argument disagreement, STS failure, malformed response, or caller mismatch
stops without invoking CloudFormation.

The plan is not executable authority. The runner independently reconstructs the
only permitted operation, region, stack name, change-set type, artifact filenames,
complete document contents, flags, and values for each action from the repository's
fixed recovery inventory.
It requires an exact match before calling STS. Editing the plan to inject another
CloudFormation operation, alter a stack or region, substitute a template or
policy path, or add a flag therefore fails before any AWS call.

The same pre-STS boundary applies to artifact contents. Changing a bucket or
table identifier, any imported resource property, or either stack-policy
statement fails before the account check and before CloudFormation.

From the repository root, run these actions first for `web`, then repeat them with
`--stack user-service`:

```bash
npm run retained-resources:run -- \
  --plan /absolute/path/to/recovery-plan.json \
  --expected-account-id <12-digit-aws-account-id> \
  --stack web \
  --action createChangeSet

npm run retained-resources:run -- \
  --plan /absolute/path/to/recovery-plan.json \
  --expected-account-id <12-digit-aws-account-id> \
  --stack web \
  --action waitForChangeSet

npm run retained-resources:run -- \
  --plan /absolute/path/to/recovery-plan.json \
  --expected-account-id <12-digit-aws-account-id> \
  --stack web \
  --action describeChangeSet
```

Review the described change set before execution. Every listed resource action
must be `Import`, every logical ID and physical identifier must match the bundle,
and there must be no add, modify, delete, or replacement action. Then execute and
wait for import completion:

```bash
npm run retained-resources:run -- \
  --plan /absolute/path/to/recovery-plan.json \
  --expected-account-id <12-digit-aws-account-id> \
  --stack web \
  --action executeChangeSet

npm run retained-resources:run -- \
  --plan /absolute/path/to/recovery-plan.json \
  --expected-account-id <12-digit-aws-account-id> \
  --stack web \
  --action waitForImport

npm run retained-resources:run -- \
  --plan /absolute/path/to/recovery-plan.json \
  --expected-account-id <12-digit-aws-account-id> \
  --stack web \
  --action detectDrift
```

Use the returned drift-detection ID through the same account gate. Repeat until
detection completes, and continue only when every imported resource is `IN_SYNC`:

```bash
npm run retained-resources:run -- \
  --plan /absolute/path/to/recovery-plan.json \
  --expected-account-id <12-digit-aws-account-id> \
  --stack web \
  --action describeDrift \
  --drift-id <drift-detection-id>
```

Before any Serverless command, install the generated durable-resource stack
policy using the exact `setStackPolicy` argument array in `recovery-plan.json`:

```bash
npm run retained-resources:run -- \
  --plan /absolute/path/to/recovery-plan.json \
  --expected-account-id <12-digit-aws-account-id> \
  --stack web \
  --action setStackPolicy
```

The explicit deny covers `Update:Replace` and `Update:Delete` for every imported
logical ID, so the automatic Serverless updates fail rather than replace or
remove a durable resource. The import applies the same `STAGE=dev` stack tag that
Serverless supplies, avoiding a first-update tag mismatch. Property modifications
remain possible, so the clean-drift and packaged-definition comparisons above are
mandatory. Keep this policy after recovery. For a later intentional durable-
resource replacement or removal, replace it only under that migration's
separately reviewed procedure and restore protection immediately afterward.

The import-only stack initially lacks Serverless's deployment bucket and all
ephemeral application resources. On the first normal deployment, Serverless adds
its deployment bucket, then updates the existing stack with the full application
template. Serverless v3 does not pause for approval before executing those change
sets; the stack policy is the enforceable pre-execution guard. Before running the
command, also compare the packaged durable-resource definitions to the imported
template and stop on any difference.

## Recover a resource while its stack still exists

Do not use the generated import-only template against an existing application
stack: CloudFormation import requires the submitted template to retain the
stack's already-managed resources. Retrieve the deployed template and add the
orphaned resource definition. If the original logical ID is unused, the generated
definition and mapping may retain that ID. If a replacement now owns the original
logical ID, the predecessor must use a fresh archival logical ID, and the import
map must pair that fresh ID with the predecessor's physical name. Never reuse an
active logical ID for the predecessor. Create an `IMPORT` change set whose
`resources-to-import` file contains only the orphaned resource. The change set
must show only import actions; any modification, addition, deletion, or
replacement is a stop condition. Execute it, wait for `IMPORT_COMPLETE`, apply a
stack policy protecting the new archival logical ID, and run drift detection as
above.

The absent-stack runner intentionally cannot execute this custom import. Do not
edit its plan to widen the action allowlist. Implement and independently review a
dedicated archival-import action with exact argument reconstruction, a separately
selected expected account ID, and the same per-command STS gate. Do not fall back
to a raw `aws cloudformation` command, because that would reintroduce the
wrong-account and mutable-plan failure classes.

## Replace or rename a durable resource

Never replace a retained fixed-name resource in place. The old physical resource
continues to exist, so CloudFormation cannot create a replacement with the same
name. Use a reviewed, two-resource migration instead.

For the S3 bucket:

1. add a second logical resource with a new globally unique bucket name while the
   original bucket remains managed and retained;
2. copy the objects and verify the complete object inventory and checksums;
3. update and verify the new bucket policy and CloudFront origin, then perform a
   non-production cutover and rollback test;
4. after production cutover, prepare and review a small archival stack template
   and import map; remove the old bucket from the application stack with its
   retain policy intact, confirm that the bucket and objects remain, and
   immediately import it into the archival stack.

For a DynamoDB table:

1. add a second logical resource with a new physical table name and the reviewed
   target schema;
2. back up the source, copy and verify all items, freeze writes for a final sync,
   and validate keys, indexes, TTL, capacity, counts, and sampled records;
3. update the Lambda environment and least-privilege IAM resource together,
   exercise the application against the target table, and retain a tested
   rollback path;
4. after cutover, prepare and review an archival stack template and import map;
   remove the old table from the application stack with its retain policy intact,
   confirm that all data remains, and immediately import it into the archival
   stack.

A resource cannot be imported while another stack still manages it. The prepared
archive import minimizes, but cannot eliminate, the ownership gap between the
retaining source-stack update and the archival import. Stop all unrelated stack
operations during that interval.

An already-orphaned replacement is adopted the same way: give the old physical
resource a new logical ID in an import-only archival template, import it, verify
drift, and only then treat the migration as complete. This ensures that both the
new active resource and preserved predecessor remain under CloudFormation
management without deleting data.

Archival and replacement plans must require their own independently selected
expected account ID and route every CloudFormation action through the same
per-command STS equality gate.

## Required non-production recovery drill

Offline tests verify template extraction, exact identifier coverage, static
names, retain policies, and fail-closed generation. They cannot prove AWS account
state or CloudFormation behavior. Before treating this runbook as operationally
closed, perform and record this drill in a disposable AWS account or with
uniquely named drill copies (the current fixed table names cannot coexist by
stage in one account):

1. seed the drill bucket and all five drill tables with sentinel data;
2. delete the two drill stacks and confirm all six resources and sentinels remain;
3. regenerate the import bundle, import under the original drill stack names,
   confirm `IMPORT_COMPLETE`, and require clean drift results;
4. run the normal Serverless updates and confirm all sentinels and application
   reads still work;
5. perform one S3 and one DynamoDB two-resource replacement migration, including
   rollback, then import each predecessor into an archival stack;
6. archive the identity/region, template digests, described change sets, stack
   events, drift results, item/object verification, and cleanup outcome. Include
   the independently selected expected account ID and the runner's verified STS
   account output for every CloudFormation action.

Deleting stacks, importing resources, copying data, and running replacement
migrations are state-changing AWS operations. They are not run by the offline
generator or its tests.
