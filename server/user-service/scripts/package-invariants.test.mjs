import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDynamoDbTablesRetained,
  assertNoExternalIamPolicies,
} from './package-invariants.mjs';

const table = {
  Type: 'AWS::DynamoDB::Table',
  DeletionPolicy: 'Retain',
  UpdateReplacePolicy: 'Retain',
};
const tableNames = [
  'UserTable',
  'StudentTable',
  'TrainerTable',
  'SpecializationTable',
  'BlacklistedTokensTable',
];

test('accepts DynamoDB tables retained for deletion and replacement', () => {
  assert.doesNotThrow(() =>
    assertDynamoDbTablesRetained({
      Resources: {
        ...Object.fromEntries(tableNames.map((name) => [name, table])),
        NonTable: { Type: 'AWS::S3::Bucket' },
      },
    }),
  );
});

for (const logicalId of tableNames) {
  for (const [policy, value] of [
    ['DeletionPolicy', undefined],
    ['UpdateReplacePolicy', 'Delete'],
  ]) {
    test(`rejects ${logicalId} with wrong ${policy}`, () => {
      assert.throws(
        () =>
          assertDynamoDbTablesRetained({
            Resources: {
              ...Object.fromEntries(tableNames.map((name) => [name, table])),
              [logicalId]: { ...table, [policy]: value },
            },
          }),
        new RegExp(
          `DynamoDB tables must retain data on deletion and replacement: ${logicalId}`,
        ),
      );
    });
  }
}

test('accepts role-local policies without external policy resources', () => {
  assert.doesNotThrow(() =>
    assertNoExternalIamPolicies({
      Resources: {
        LoginLambdaRole: {
          Type: 'AWS::IAM::Role',
          Properties: { Policies: [] },
        },
      },
    }),
  );
});

for (const type of ['AWS::IAM::Policy', 'AWS::IAM::ManagedPolicy']) {
  test(`rejects a broader SSM grant through ${type}`, () => {
    assert.throws(
      () =>
        assertNoExternalIamPolicies({
          Resources: {
            BroaderSsmPolicy: {
              Type: type,
              Properties: {
                Roles: [{ Ref: 'LoginLambdaRole' }],
                PolicyDocument: {
                  Statement: [
                    {
                      Effect: 'Allow',
                      Action: 'ssm:GetParameters',
                      Resource: '*',
                    },
                  ],
                },
              },
            },
          },
        }),
      /external IAM policy resources are forbidden/,
    );
  });
}
