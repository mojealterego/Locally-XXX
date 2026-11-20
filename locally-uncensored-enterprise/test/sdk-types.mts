import {ReviewClient,type ReviewDetails,type ReviewResult} from '../packages/agent-sdk/src/review-client.mjs';
const client=new ReviewClient({base:'https://example.com',token:async()=> 'token'});
const task:Promise<ReviewDetails>=client.get('id');
const decision:Promise<ReviewResult>=client.decide('id','digest',false);
// @ts-expect-error boolean decision required
client.decide('id','digest','yes');
void task;void decision;
