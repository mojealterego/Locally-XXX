import {proxyActivities,sleep} from '@temporalio/workflow';
import {runReview} from './review-core.mjs';
const activities=proxyActivities({startToCloseTimeout:'30 seconds',scheduleToCloseTimeout:'2 minutes',retry:{maximumAttempts:3,initialInterval:'1 second',maximumInterval:'10 seconds'}});
export async function reviewManifestWorkflow(ref){return runReview(ref,activities,sleep)}
