import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {renderHtml,validateReport} from './html.mjs';
const [kind,source,dest,...extra]=process.argv.slice(2);
try{
 if(extra.length||!['html','pdf'].includes(kind)||!source||!dest||existsSync(dest))throw Error('Usage: cli.mjs html|pdf report.json new-output-file');
 const raw=readFileSync(source);if(raw.length>145000)throw Error('Input exceeds size bound');const report=validateReport(JSON.parse(raw.toString('utf8')));
 if(kind==='html')writeFileSync(dest,renderHtml(report),{flag:'wx',mode:0o600});
 else{const py=process.env.OMEGA_PYTHON_BINARY??'python3';if(!/^[a-zA-Z0-9_./:-]{1,200}$/.test(py))throw Error('Invalid interpreter');const result=spawnSync(py,[new URL('./pdf_report.py',import.meta.url).pathname,source,dest],{encoding:'utf8',timeout:15000,maxBuffer:8192,env:{...process.env,PYTHONHASHSEED:'0'}});if(result.status!==0)throw Error('PDF renderer failed')}
 process.stdout.write('Created '+kind.toUpperCase()+' report\n');
}catch(e){process.stderr.write('Report export rejected: '+e.message+'\n');process.exitCode=1}
