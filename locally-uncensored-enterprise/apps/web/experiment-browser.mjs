/** Attention/HAEE/OXA admission view; no training or signing keys. */
export function mountExperimentPlanner(root,{locale='pl'}={}){
 if(!root||typeof root.append!=='function'||!['pl','en'].includes(locale))throw Error('Invalid experiment UI');
 const tr=(pl,en)=>locale==='pl'?pl:en;
 const el=(tag,value,parent=root)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;parent.append(n);return n};
 let alive=true,controller=null;
 el('h2',tr('Attention / HAEE / AETHR — plan eksperymentu','Attention / HAEE / AETHR — Experiment Plan'));
 el('p',tr('Walidacja kontraktów i lokalny plan przyjęcia. Trening, chmura, podpisywanie i promocja modeli nie są uruchamiane.','Contract validation and local admission planning. Training, cloud, signing and model promotion are not started.'));
 const label=el('label',tr('Profil eksperymentu JSON','Experiment profile JSON'));
 const field=el('textarea',undefined,label);field.rows=16;field.style.width='100%';field.maxLength=63000;field.spellcheck=false;
 field.value=JSON.stringify({attention_profile:{mode:'fine_tune',accelerator:'cuda',compute_capability:90,gpu_count:1,head_count:32,kv_head_count:8,head_dim:128,layers:32,context_tokens:8192,kv_dtype:'fp16',attention:'auto',parallel:'none',precision:'bf16',model_format:'safetensors',training_strategy:'lora',tensor_parallel:1,pipeline_parallel:1},
 haee_experiment:{schema_version:'1.0.0',experiment_id:'413f45ca-a830-45b0-aac5-c0bb7ebd7b03',tenant_id:'team-studio',task_id:'segmentation-small-v1',dataset:{train_sha256:'d487f131a30f5d996e6d7c888c3c84f15a0c45e86c420ea236a3b8c9cb1a120f',validation_sha256:'b0dd2a2118a18d4fe971319f70a10ab2c3e3ec90660a3d4ab79462145ec4dd32'},baseline_candidate_id:'candidate-baseline-001',seed:20261121,population:24,max_generations:40,max_evaluations:480,max_wall_clock_minutes:240,max_parallel_evaluations:2,run_profile:'DESKTOP_LOCAL',objective_ids:['TASK_ERROR','GPU_SECONDS','ROBUSTNESS_DROP','PARAMETER_COUNT'],allowed_operators:['MUTATE_PARAM','ADD_NODE','REMOVE_NODE','FUSE_SUBGRAPH','SWITCH_OPTIMIZER','MUTATE_LOSS','SHOCK_MUTATION'],approval_policy:'HUMAN_BEFORE_PROMOTION',allow_external_dataset_egress:false}},null,2);
 const run=el('button',tr('Weryfikuj i planuj','Validate and plan'));run.type='button';const status=el('p','');status.setAttribute('role','status');const output=el('pre');
 run.onclick=async()=>{
  controller?.abort();const c=new AbortController();controller=c;run.disabled=true;status.textContent=tr('Walidacja…','Validating…');output.textContent='';
  try{
   const data=JSON.parse(field.value);
   const response=await fetch('/api/local/experiments/plan',{method:'POST',headers:{'content-type':'application/json','x-omega-experiment':'1'},body:JSON.stringify(data),signal:AbortSignal.any([c.signal,AbortSignal.timeout(15000)]),cache:'no-store',redirect:'error',credentials:'same-origin'});
   if(!response.ok)throw Error('Plan rejected');
   const plan=await response.json();
   if(plan.status!=='PLAN_ONLY_NOT_TRAINED'||plan.execution!=='NO_EXECUTOR_BOUND'||plan.authorization?.cloud_plan_authorized!==false||plan.authorization?.external_dataset_egress_authorized!==false)throw Error('Invalid plan');
   if(!alive||controller!==c)return;
   output.textContent=JSON.stringify(plan,null,2);
   status.textContent=tr('Przygotowano plan. Żaden trening nie został uruchomiony.','Plan prepared. No training was started.');
  }catch{if(alive&&controller===c&&!c.signal.aborted)status.textContent=tr('Błąd kontraktu lub niedostępny lokalny planer','Contract rejected or local planner unavailable')}
  finally{if(controller===c){controller=null;run.disabled=false;}}
 };
 return {dispose(){alive=false;controller?.abort();field.value='';output.textContent='';run.disabled=true;}};
}
