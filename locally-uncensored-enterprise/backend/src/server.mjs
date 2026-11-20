import {readFileSync} from 'node:fs';
import {Oidc,Permit,AgentIdentity,securityServer} from './auth/security.mjs';
const required=k=>{const v=process.env[k];if(!v)throw Error('Missing '+k);return v};
const oidc=new Oidc({issuer:required('OMEGA_OIDC_ISSUER'),audience:required('OMEGA_OIDC_AUDIENCE'),client:required('OMEGA_OIDC_CLIENT')});
const permit=new Permit({url:required('OMEGA_PDP_URL'),apiKey:readFileSync(required('OMEGA_PDP_KEY_FILE'),'utf8').trim()});
const aim=new AgentIdentity({directory:required('OMEGA_AIM_DIRECTORY'),permit});
const port=Number(process.env.PORT??3000);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
const server=securityServer({oidc,permit,aim});server.listen(port,'127.0.0.1');
let closing=false;for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{if(closing)return;closing=true;server.close(()=>{aim.close()});setTimeout(()=>server.closeAllConnections(),12000).unref()});
