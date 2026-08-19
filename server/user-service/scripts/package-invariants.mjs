const externalPolicyTypes = new Set([
  'AWS::IAM::Policy',
  'AWS::IAM::ManagedPolicy',
]);

export function assertNoExternalIamPolicies(template) {
  const externalPolicies = Object.entries(template.Resources ?? {}).filter(
    ([, resource]) => externalPolicyTypes.has(resource.Type),
  );
  if (externalPolicies.length !== 0) {
    throw new Error(
      `external IAM policy resources are forbidden: ${externalPolicies
        .map(([logicalId]) => logicalId)
        .join(', ')}`,
    );
  }
}
