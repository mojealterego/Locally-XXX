import {constants,closeSync,lstatSync,openSync,readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {Oidc,Permit} from '../auth/security.mjs';
import {AuditLedger} from './ledger.mjs';
import {auditServer} from './http.mjs';
const required=k=>{const x=process.env[k];if(!x)throw Error('Missing '+k);return x};
function privateFile(value){const path=resolve(value),st=lstatSync(path);if(realpathSync(path)!==path||!st.isFile()||st.nlink!==1||(st.mode&0o077)||(process.getuid&&st.uid!==process.getuid()))throw Error('Audit credentials file invalid');const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{return readFileSync(fd)}finally{closeSync(fd)}}
const port=Number(process.env.AUDIT_PORT??3003),webPort=Number(process.env.WEB_PORT??4173),maxEvents=Number(process.env.AUDIT_MAX_EVENTS_PER_TENANT??50000);
if(!Number.isSafeInteger(port)||port<1||port>65535||!Number.isSafeInteger(webPort)||webPort<1||webPort>65535||port===webPort||!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>1000000)throw Error('Invalid audit settings');
const rawKey=privateFile(required('OMEGA_AUDIT_HMAC_KEY_FILE'));
if(rawKey.length!==32)throw Error('Audit key must contain exactly 32 bytes');
const ledger=new AuditLedger({directory:required('OMEGA_AUDIT_DIRECTORY'),key:rawKey,maxEventsPerTenant:maxEvents});rawKey.fill(0);
const oidc=new Oidc({issuer:required('OMEGA_OIDC_ISSUER'),audience:required('OMEGA_OIDC_AUDIENCE'),client:required('OMEGA_OIDC_CLIENT')});
const permit=new Permit({url:required('OMEGA_PDP_URL'),apiKey:privateFile(required('OMEGA_PDP_KEY_FILE')).toString('utf8').trim()});
const server=auditServer({ledger,oidc,permit,allowedOrigins:[`http://127.0.0.1:${webPort}`,`http://localhost:${webPort}`]});
server.listen(port,'127.0.0.1');
let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{if(stopping)return;stopping=true;server.close(()=>ledger.close());setTimeout(()=>server.closeAllConnections(),12000).unref()});
