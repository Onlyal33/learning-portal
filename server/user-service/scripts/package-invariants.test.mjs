import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNoExternalIamPolicies } from './package-invariants.mjs';

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
