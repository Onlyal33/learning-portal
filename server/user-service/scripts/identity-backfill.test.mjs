import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBackfill,
  backfillTransaction,
  confirmPlan,
  planBackfill,
  planDigest,
  scanTable,
} from './identity-backfill.mjs';

const base = () => ({
  users: [{ id: 'u1', email: ' Ada@Example.test ' }],
  students: [{ id: 's1', userId: 'u1' }],
  trainers: [],
});

test('plans one canonical claim and becomes empty after a completed retry', () => {
  const plan = planBackfill(base());
  assert.deepEqual(plan.operations[0], {
    userId: 'u1',
    sourceEmail: ' Ada@Example.test ',
    claim: {
      id: 'EMAIL#ada@example.test',
      entityType: 'email-claim',
      userId: 'u1',
    },
    identity: {
      canonicalEmail: 'ada@example.test',
      role: 'student',
      roleProfileId: 's1',
    },
  });

  assert.deepEqual(
    planBackfill({
      ...base(),
      users: [
        {
          id: 'u1',
          email: ' Ada@Example.test ',
          canonicalEmail: 'ada@example.test',
          role: 'student',
          roleProfileId: 's1',
        },
      ],
      claims: [
        {
          id: 'EMAIL#ada@example.test',
          entityType: 'email-claim',
          userId: 'u1',
        },
      ],
    }).operations,
    [],
  );
});

test('fails closed for collisions and incomplete relationships', () => {
  assert.throws(
    () =>
      planBackfill({
        ...base(),
        users: [
          ...base().users,
          { id: 'u2', email: 'ada@example.test' },
        ],
      }),
    /canonical collision/,
  );
  assert.throws(
    () => planBackfill({ ...base(), students: [] }),
    /missing or ambiguous/,
  );
  assert.throws(
    () =>
      planBackfill({
        ...base(),
        trainers: [{ id: 't1', userId: 'u1' }],
      }),
    /missing or ambiguous/,
  );
  assert.throws(
    () =>
      planBackfill({
        ...base(),
        claims: [
          {
            id: 'EMAIL#ada@example.test',
            entityType: 'email-claim',
            userId: 'u2',
          },
        ],
      }),
    /reserved-key/,
  );
  assert.throws(
    () =>
      planBackfill({
        ...base(),
        students: [
          ...base().students,
          { id: 'orphan', userId: 'missing-user' },
        ],
      }),
    /orphan profile/,
  );
  assert.throws(
    () =>
      planBackfill({
        ...base(),
        claims: [
          {
            id: 'EMAIL#stale@example.test',
            entityType: 'email-claim',
            userId: 'missing-user',
          },
        ],
      }),
    /orphan or mismatched claim/,
  );
  assert.throws(
    () =>
      planBackfill({
        ...base(),
        claims: [
          {
            id: 'EMAIL#old-address@example.test',
            entityType: 'email-claim',
            userId: 'u1',
          },
        ],
      }),
    /orphan or mismatched claim/,
  );
});

test('binds apply authorization to the exact reviewed plan digest', () => {
  const plan = planBackfill(base());
  const digest = planDigest(plan);
  assert.equal(confirmPlan(plan, digest, digest), plan);
  assert.throws(
    () => confirmPlan(plan, digest, 'wrong'),
    /explicit matching plan digest/,
  );
});

test('renders an idempotent owned-claim transaction', () => {
  const operation = planBackfill(base()).operations[0];
  const transaction = backfillTransaction(operation, 'UserTable');
  assert.equal(transaction.TransactItems.length, 2);
  assert.match(
    transaction.TransactItems[0].Put.ConditionExpression,
    /attribute_not_exists\(id\).*userId/,
  );
  assert.match(
    transaction.TransactItems[1].Update.ConditionExpression,
    /canonicalEmail.*roleProfileId/,
  );
});

test('scans all pages strongly and applies every operation sequentially', async () => {
  const pages = [
    {
      Items: [],
      LastEvaluatedKey: { id: { S: 'next' } },
    },
    { Items: [] },
  ];
  const scanClient = {
    send: async (command) => {
      assert.equal(command.input.ConsistentRead, true);
      return pages.shift();
    },
  };
  assert.deepEqual(await scanTable(scanClient, 'UserTable'), []);

  const applied = [];
  const applyClient = {
    send: async (command) => applied.push(command.input),
  };
  const plan = planBackfill(base());
  await applyBackfill(applyClient, plan, 'UserTable');
  assert.equal(applied.length, 1);
  assert.equal(applied[0].TransactItems.length, 2);
});
