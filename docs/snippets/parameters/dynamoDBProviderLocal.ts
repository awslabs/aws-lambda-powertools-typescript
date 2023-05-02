import { DynamoDBProvider } from '@aws-lambda-powertools/parameters/dynamodb';

const dynamoDBProvider = new DynamoDBProvider({
  tableName: 'my-table',
  clientConfig: {
    endpoint: 'http://localhost:8000',
  },
});

export const handler = async (
  _event: unknown,
  _context: unknown
): Promise<void> => {
  // Retrieve a value from DynamoDB
  const value = await dynamoDBProvider.get('my-parameter');
  console.log(value);
};
