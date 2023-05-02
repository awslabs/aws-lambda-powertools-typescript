import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm';

const parametersProvider = new SSMProvider();

export const handler = async (
  _event: unknown,
  _context: unknown
): Promise<void> => {
  const values = await parametersProvider.getMultiple('/param', {
    transform: 'auto',
  });
  for (const [key, value] of Object.entries(values || {})) {
    console.log(`${key}: ${value}`);
  }
};
