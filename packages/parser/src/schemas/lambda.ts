import { APIGatewayProxyEventV2Schema } from './apigwv2.js';

const LambdaFunctionUrlSchema = APIGatewayProxyEventV2Schema.extend({
  //  Lambda Function URL follows the API Gateway HTTP APIs Payload Format Version 2.0.
  //
  //   Keys related to API Gateway features not available in Function URL use a sentinel value (e.g.`routeKey`, `stage`).
  //
  //   Documentation:
  //   - https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html
  //   - https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html#urls-payloads
});

export { LambdaFunctionUrlSchema };
