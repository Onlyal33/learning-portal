import {
  DynamoDBClient,
  ScanCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const DEFAULT_TABLES = {
  users: 'UserTable',
  students: 'StudentTable',
  trainers: 'TrainerTable',
};

export const canonicalEmail = (email) =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

export const claimId = (email) => `EMAIL#${canonicalEmail(email)}`;

const fail = (message) => {
  throw new Error(message);
};

/**
 * Pure planner for unmarshalled DynamoDB records. It refuses to guess through
 * collisions or missing relationships, and skips fully migrated records.
 */
export function planBackfill({ users, students, trainers, claims = [] }) {
  const profilesByUser = new Map();
  for (const [role, records] of [
    ['student', students],
    ['trainer', trainers],
  ]) {
    if (!Array.isArray(records)) {
      fail(`${role} records must be an array`);
    }
    for (const profile of records) {
      if (
        !profile ||
        typeof profile.id !== 'string' ||
        !profile.id ||
        typeof profile.userId !== 'string' ||
        !profile.userId
      ) {
        fail(`invalid ${role} profile`);
      }
      const matches = profilesByUser.get(profile.userId) ?? [];
      matches.push({ role, profile });
      profilesByUser.set(profile.userId, matches);
    }
  }

  const claimsById = new Map();
  for (const claim of claims) {
    if (
      !claim ||
      typeof claim.id !== 'string' ||
      !claim.id.startsWith('EMAIL#') ||
      claim.entityType !== 'email-claim' ||
      typeof claim.userId !== 'string' ||
      !claim.userId
    ) {
      fail('invalid existing claim');
    }
    const existingOwner = claimsById.get(claim.id);
    if (existingOwner && existingOwner !== claim.userId) {
      fail(`reserved-key collision: ${claim.id}`);
    }
    claimsById.set(claim.id, claim.userId);
  }

  if (!Array.isArray(users)) {
    fail('user records must be an array');
  }
  const usersById = new Set();
  const emailOwners = new Map();
  const operations = [];
  for (const user of users) {
    if (
      !user ||
      typeof user.id !== 'string' ||
      !user.id ||
      user.id.startsWith('EMAIL#') ||
      usersById.has(user.id)
    ) {
      fail('reserved-key collision or duplicate/invalid user id');
    }
    usersById.add(user.id);

    const normalizedEmail = canonicalEmail(user.email);
    if (!normalizedEmail) {
      fail(`missing canonical email for ${user.id}`);
    }
    const existingEmailOwner = emailOwners.get(normalizedEmail);
    if (existingEmailOwner && existingEmailOwner !== user.id) {
      fail(`canonical collision: ${normalizedEmail}`);
    }
    emailOwners.set(normalizedEmail, user.id);

    const matches = profilesByUser.get(user.id) ?? [];
    if (matches.length !== 1) {
      fail(`missing or ambiguous profile for ${user.id}`);
    }
    const [{ role, profile }] = matches;
    const id = claimId(normalizedEmail);
    const claimOwner = claimsById.get(id);
    if (claimOwner && claimOwner !== user.id) {
      fail(`reserved-key collision: ${id}`);
    }

    const identityAlreadyMatches =
      user.canonicalEmail === normalizedEmail &&
      user.role === role &&
      user.roleProfileId === profile.id;
    if (identityAlreadyMatches && claimOwner === user.id) {
      continue;
    }

    operations.push({
      userId: user.id,
      sourceEmail: user.email,
      claim: {
        id,
        entityType: 'email-claim',
        userId: user.id,
      },
      identity: {
        canonicalEmail: normalizedEmail,
        role,
        roleProfileId: profile.id,
      },
    });
  }

  for (const userId of profilesByUser.keys()) {
    if (!usersById.has(userId)) {
      fail(`orphan profile for ${userId}`);
    }
  }

  for (const [id, userId] of claimsById) {
    const normalizedEmail = id.slice('EMAIL#'.length);
    if (emailOwners.get(normalizedEmail) !== userId) {
      fail(`orphan or mismatched claim: ${id}`);
    }
  }

  return { version: 1, operations };
}

export const planDigest = (plan) =>
  createHash('sha256').update(JSON.stringify(plan)).digest('hex');

export function confirmPlan(plan, expectedDigest, confirmation) {
  if (
    typeof expectedDigest !== 'string' ||
    expectedDigest !== planDigest(plan) ||
    confirmation !== expectedDigest
  ) {
    fail('explicit matching plan digest confirmation is required');
  }
  return plan;
}

export function backfillTransaction(operation, userTable) {
  if (!operation || typeof userTable !== 'string' || !userTable) {
    fail('invalid migration operation or user table');
  }
  return {
    TransactItems: [
      {
        Put: {
          TableName: userTable,
          Item: {
            id: { S: operation.claim.id },
            entityType: { S: 'email-claim' },
            userId: { S: operation.userId },
          },
          ConditionExpression:
            'attribute_not_exists(id) OR (#entityType = :entityType AND #userId = :userId)',
          ExpressionAttributeNames: {
            '#entityType': 'entityType',
            '#userId': 'userId',
          },
          ExpressionAttributeValues: {
            ':entityType': { S: 'email-claim' },
            ':userId': { S: operation.userId },
          },
        },
      },
      {
        Update: {
          TableName: userTable,
          Key: { id: { S: operation.userId } },
          UpdateExpression:
            'SET #canonicalEmail = :canonicalEmail, #role = :role, #roleProfileId = :roleProfileId',
          ConditionExpression:
            'attribute_exists(id) AND #email = :sourceEmail AND (attribute_not_exists(#canonicalEmail) OR #canonicalEmail = :canonicalEmail) AND (attribute_not_exists(#role) OR #role = :role) AND (attribute_not_exists(#roleProfileId) OR #roleProfileId = :roleProfileId)',
          ExpressionAttributeNames: {
            '#email': 'email',
            '#canonicalEmail': 'canonicalEmail',
            '#role': 'role',
            '#roleProfileId': 'roleProfileId',
          },
          ExpressionAttributeValues: {
            ':sourceEmail': { S: operation.sourceEmail },
            ':canonicalEmail': { S: operation.identity.canonicalEmail },
            ':role': { S: operation.identity.role },
            ':roleProfileId': { S: operation.identity.roleProfileId },
          },
        },
      },
    ],
  };
}

export async function scanTable(client, tableName) {
  const records = [];
  let exclusiveStartKey;
  do {
    const response = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
        ConsistentRead: true,
      }),
    );
    records.push(...(response.Items ?? []).map((item) => unmarshall(item)));
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return records;
}

export async function readCurrentState(client, tables) {
  const [userTableRecords, students, trainers] = await Promise.all([
    scanTable(client, tables.users),
    scanTable(client, tables.students),
    scanTable(client, tables.trainers),
  ]);
  return {
    users: userTableRecords.filter(
      (record) => record.entityType !== 'email-claim',
    ),
    claims: userTableRecords.filter(
      (record) => record.entityType === 'email-claim',
    ),
    students,
    trainers,
  };
}

export async function applyBackfill(client, plan, userTable) {
  for (const operation of plan.operations) {
    await client.send(
      new TransactWriteItemsCommand(
        backfillTransaction(operation, userTable),
      ),
    );
  }
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      fail('options must be --name value pairs');
    }
    if (key in options) {
      fail(`duplicate option: ${key}`);
    }
    options[key] = value;
  }
  return options;
}

function tablesFrom(options) {
  return {
    users: options['--user-table'] ?? DEFAULT_TABLES.users,
    students: options['--student-table'] ?? DEFAULT_TABLES.students,
    trainers: options['--trainer-table'] ?? DEFAULT_TABLES.trainers,
  };
}

async function audit(options) {
  const outputPath = options['--out'];
  const region = options['--region'];
  if (!outputPath || !region) {
    fail('audit requires --region <region> --out <plan.json>');
  }
  const tables = tablesFrom(options);
  const client = new DynamoDBClient({ region });
  const plan = planBackfill(await readCurrentState(client, tables));
  const document = {
    region,
    tables,
    plan,
    digest: planDigest({ region, tables, plan }),
  };
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  process.stdout.write(
    `Audit complete: ${plan.operations.length} operations; digest ${document.digest}\n`,
  );
}

async function apply(options) {
  const planPath = options['--plan'];
  const confirmation = options['--confirm'];
  const requestedRegion = options['--region'];
  if (!planPath || !confirmation || !requestedRegion) {
    fail(
      'apply requires --region <region> --plan <plan.json> --confirm <sha256>',
    );
  }
  if (options['--writes-frozen'] !== 'confirmed') {
    fail('apply requires --writes-frozen confirmed');
  }

  const document = JSON.parse(readFileSync(planPath, 'utf8'));
  const region = document.region;
  const tables = document.tables;
  if (
    typeof region !== 'string' ||
    !region ||
    requestedRegion !== region ||
    !tables ||
    typeof tables.users !== 'string' ||
    typeof tables.students !== 'string' ||
    typeof tables.trainers !== 'string'
  ) {
    fail('plan has invalid or mismatched region/table configuration');
  }
  if (
    document.digest !==
      planDigest({ region, tables, plan: document.plan }) ||
    confirmation !== document.digest
  ) {
    fail('explicit matching plan digest confirmation is required');
  }
  const plan = document.plan;

  const client = new DynamoDBClient({ region });
  await applyBackfill(client, plan, tables.users);
  const remaining = planBackfill(await readCurrentState(client, tables));
  if (remaining.operations.length !== 0) {
    fail(`post-apply verification found ${remaining.operations.length} operations`);
  }
  process.stdout.write(
    `Applied and verified ${plan.operations.length} identity operations\n`,
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (command === 'audit') {
    await audit(options);
    return;
  }
  if (command === 'apply') {
    await apply(options);
    return;
  }
  fail(
    'usage: identity-backfill.mjs <audit|apply> [--region REGION] [--user-table NAME] [--student-table NAME] [--trainer-table NAME] ...',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`Identity backfill aborted: ${error.message}\n`);
    process.exitCode = 1;
  });
}
