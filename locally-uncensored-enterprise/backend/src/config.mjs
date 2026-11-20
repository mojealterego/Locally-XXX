import {readFileSync} from 'node:fs';
import pg from 'pg';
import {Permit} from './auth/security.mjs';
export function required(k){const v=process.env[k];if(!v)throw Error('Missing '+k);return v}
export const secret=k=>readFileSync(required(k),'utf8').trim();
function port(k){const n=Number(required(k));if(!Number.isInteger(n)||n<1||n>65535)throw Error('Invalid '+k);return n}
export function database(){return new pg.Pool({host:required('OMEGA_DB_HOST'),port:port('OMEGA_DB_PORT'),database:required('OMEGA_DB_NAME'),user:required('OMEGA_DB_USER'),password:secret('OMEGA_DB_PASSWORD_FILE'),ssl:{ca:secret('OMEGA_DB_CA_FILE'),rejectUnauthorized:true},max:8,connectionTimeoutMillis:3000,idleTimeoutMillis:30000,query_timeout:8000})}
export function redis(worker=false){const host=required('OMEGA_REDIS_HOST');return {host,port:port('OMEGA_REDIS_PORT'),username:required('OMEGA_REDIS_USER'),password:secret('OMEGA_REDIS_PASSWORD_FILE'),tls:{ca:secret('OMEGA_REDIS_CA_FILE'),servername:host,rejectUnauthorized:true},connectTimeout:3000,maxRetriesPerRequest:worker?null:1}}
export function temporal(){return {address:required('OMEGA_TEMPORAL_ADDRESS'),tls:{serverRootCACertificate:readFileSync(required('OMEGA_TEMPORAL_CA_FILE')),clientCertPair:{crt:readFileSync(required('OMEGA_TEMPORAL_CERT_FILE')),key:readFileSync(required('OMEGA_TEMPORAL_KEY_FILE'))}}}}
export function policy(){return new Permit({url:required('OMEGA_PDP_URL'),apiKey:secret('OMEGA_PDP_KEY_FILE')})}
export const TASK_QUEUE='omega-manifest-review-v1';
