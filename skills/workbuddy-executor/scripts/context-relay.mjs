#!/usr/bin/env node
// Explicit, checkpoint-driven native session handoff. Never infer token exhaustion.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
export const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export const isReadContention = e => e?.message==='Queue record is busy; retry this call without resending the task';
export function atomic(p, value) {
  const tmp=p+'.'+process.pid+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n'); fs.renameSync(tmp,p);
}
export function inside(root, file) {
  const r=fs.realpathSync(root), f=fs.realpathSync(file), rel=path.relative(r,f);
  if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Path escapes authorized workspace: '+file);
  return f;
}
export function validateCheckpoint(plan,task,file) {
  inside(plan.checkpointRoot??plan.workspace,file);
  const c=JSON.parse(fs.readFileSync(file,'utf8'));
  if(task.runtimeSource!=='desktop_queue'||task.state!=='blocked'||!task.report?.rawText?.includes('CONTEXT_HANDOFF_REQUIRED'))throw Error('No verified terminal context handoff');
  if(c.signal!=='CONTEXT_HANDOFF_REQUIRED'||c.safe_to_resume!==true||c.task_id!==task.taskId||c.session_id!==task.sessionId||c.attempt_id!==task.attemptId)throw Error('Checkpoint identity/safe-state mismatch');
  if(!Array.isArray(c.inflight)||c.inflight.length||!Array.isArray(c.files)||!c.files.length)throw Error('Missing evidence or unresolved side effects');
  for(const entry of c.files) {
    const filename=path.resolve(plan.workspace,entry.path);
    const roots=[plan.workspace,...(plan.evidenceRoots??[])];
    if(!roots.some(root=>{try{inside(root,filename);return true;}catch{return false;}}))throw Error('Evidence outside authorized roots');
    if(sha(filename)!==entry.sha256)throw Error('Checkpoint file changed: '+entry.path);
  }
  return c;
}
export function validateHubBoundary(hub, task) {
  if(hub.providerTaskId!==task.taskId||hub.attemptId!==task.attemptId||hub.sessionId!==task.sessionId||hub.holdsCapacity!==false||!['blocked','failed','completed'].includes(hub.status))throw Error('Original Hub run has not released the verified attempt');
}
export async function run(planFile) {
  planFile=path.resolve(planFile);
  const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
  if(!path.isAbsolute(plan.workspace)||!path.isAbsolute(plan.gatewayRoot)||!plan.initialTaskId||!plan.continuationObjective||!Number.isInteger(plan.maxRotations)||plan.maxRotations<1||plan.maxRotations>10)throw Error('Invalid relay plan');
  const stateFile=planFile+'.state.json', lock=stateFile+'.lock';
  let lockfd;
  try {lockfd=fs.openSync(lock,'wx');fs.writeFileSync(lockfd,JSON.stringify({pid:process.pid,started:new Date().toISOString()}));}
  catch {throw Error('Relay lock exists: inspect owner before removing; do not start a second controller');}
  let store, native, state;
  try {
    process.chdir(plan.gatewayRoot);process.loadEnvFile(path.join(plan.gatewayRoot,'.env'));
    const mod=n=>import(pathToFileURL(path.join(plan.gatewayRoot,'dist',n+'.js')).href);
    const [{loadConfig},{TaskStore},{TaskCoordinator},{WorkBuddyClient},{NativeDesktopRpcTrigger},{ensureWorkspace},{readDesktopSession}]=await Promise.all(['config','task-store','coordinator','workbuddy-client','native-desktop-trigger','workspace-manager','desktop-runtime'].map(mod));
    const config=loadConfig();store=new TaskStore(config.dbFile);
    const client=new WorkBuddyClient(config), co=new TaskCoordinator(config,store,client);
    // Never restart the app to obtain a port while another task may be running.
    native=new NativeDesktopRpcTrigger(config,plan.cdpPort??18491,false);
    const planSha=sha(planFile);
    state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{planSha,currentTaskId:plan.initialTaskId,generation:0,history:[],phase:'watching'};
    if(state.planSha!==planSha)throw Error('Plan changed; reconcile explicitly before resuming');
    const save=()=>{state.updated_at=new Date().toISOString();atomic(stateFile,state);};
    save();
    const deadline=Date.now()+(plan.watchSeconds??3600)*1000;
    while(Date.now()<deadline) {
      if(sha(planFile)!==planSha)throw Error('Plan changed during supervision; stopped before further dispatch');
      if(['completed','stopped','paused'].includes(state.phase))return state;
      let task;
      try {task=await co.sync(state.currentTaskId);} catch(error) {
        // Retrying the read is safe. Never use this policy around send/create.
        if(!isReadContention(error))throw error;
        state.phase='watching';state.read_lock_retries=(state.read_lock_retries??0)+1;save();
        await new Promise(r=>setTimeout(r,2000));continue;
      }
      if(state.phase==='blocked'){state.phase='watching';state.previous_error=state.last_error;delete state.last_error;save();}
      if(path.resolve(task.workspace)!==path.resolve(plan.workspace))throw Error('Task workspace mismatch');
      if(task.state==='needs_review'||task.state==='accepted') {state.phase='completed';delete state.waiting_native;state.result={taskId:task.taskId,sessionId:task.sessionId,runtimeSource:task.runtimeSource,acceptance:task.state==='accepted'?'independent review recorded in task store':'pending independent artifact review'};save();return state;}
      if(['failed','cancelled'].includes(task.state)||(task.state==='blocked'&&!task.report?.rawText?.includes('CONTEXT_HANDOFF_REQUIRED'))) {state.phase='stopped';state.reason='Non-context failure/input: '+task.state;save();return state;}
      if(task.state!=='blocked') {await new Promise(r=>setTimeout(r,2000));continue;}
      if(state.generation>=plan.maxRotations)throw Error('Rotation limit reached; retain checkpoint');
      const checkpointFile=path.resolve(plan.workspace,plan.checkpointFile??'gateway-continuation.json');
      validateCheckpoint(plan,task,checkpointFile);
      const checkpointSha=sha(checkpointFile);
      if(state.pending&&state.pending.checkpointSha!==checkpointSha)throw Error('Checkpoint changed after reservation');
      const snap=client.runSnapshot(task.attemptId);
      if(!snap||['working','queued'].includes(snap.status)||!snap.stopReason)throw Error('Provider attempt has not confirmed stop');
      const idle=await native.inspect(task.sessionId);
      if(idle.state!=='idle'){state.waiting_native=idle.state;save();await new Promise(r=>setTimeout(r,2000));continue;}
      delete state.waiting_native;
      // A second task in the same directory may belong to another controller.
      // Never rotate the selected workspace out from under it.
      for(let offset=0;;offset+=100) {
        const page=store.listTasks({states:['queued','working'],limit:100,offset});
        for(const other of page)if(other.taskId!==task.taskId&&other.taskId!==state.pending?.newTaskId&&other.workspace&&path.resolve(other.workspace)===path.resolve(plan.workspace))throw Error('Another task is active in this workspace: '+other.taskId);
        if(page.length<100)break;
      }
      if(plan.parentHubId&&state.generation===0) {
        const output=execFileSync(process.execPath,[path.join(plan.gatewayRoot,'scripts/agent-hub-call.mjs'),'agent_hub_get',JSON.stringify({id:plan.parentHubId})],{cwd:plan.gatewayRoot,encoding:'utf8',timeout:120000,windowsHide:true,maxBuffer:4*1024*1024});
        validateHubBoundary(JSON.parse(output.trim()),task);
      }
      if(!state.pending){state.pending={oldTaskId:task.taskId,oldSessionId:task.sessionId,oldAttemptId:task.attemptId,checkpointSha,newSessionId:crypto.randomUUID(),newTaskId:'relay-'+crypto.randomUUID(),createIntent:false};save();}
      const pending=state.pending;
      let registered=readDesktopSession(config.workbuddyConfigDir,pending.newSessionId);
      if(!registered.registered) {
        if(pending.createIntent)throw Error('Creation receipt uncertain; inspect reserved session, never create another');
        pending.createIntent=true;save();
        await native.createWorker(plan.workspace,pending.newSessionId,`接力 ${state.generation+1} · ${plan.title??'WorkBuddy'}`);
        registered=readDesktopSession(config.workbuddyConfigDir,pending.newSessionId);
      }
      if(!registered.registered||path.resolve(registered.cwd)!==path.resolve(plan.workspace))throw Error('New native session registration mismatch');
      // Freeze evidence once, so the next checkpoint cannot erase the previous boundary.
      const frozen=stateFile+`.checkpoint-${state.generation+1}.json`;
      if(!fs.existsSync(frozen))fs.copyFileSync(checkpointFile,frozen,fs.constants.COPYFILE_EXCL);
      if(sha(frozen)!==checkpointSha)throw Error('Frozen checkpoint mismatch');
      validateCheckpoint(plan,task,checkpointFile);
      await ensureWorkspace(config,{workspace:plan.workspace,sessionId:pending.newSessionId});
      // User policy (2026-10-18): each new task/session needs visible model
      // confirmation. A previous generation's confirmation cannot be reused.
      const confirmationFile=planFile+'.model-confirmation.json';
      let confirmation;
      if(fs.existsSync(confirmationFile))confirmation=JSON.parse(fs.readFileSync(confirmationFile,'utf8'));
      if(!confirmation||confirmation.planSha!==planSha||confirmation.taskId!==pending.newTaskId||confirmation.sessionId!==pending.newSessionId||confirmation.explicit_user_confirmation!==true||typeof confirmation.model!=='string'||!confirmation.model.trim()||!Number.isFinite(Date.parse(confirmation.confirmed_at))) {
        state.phase='awaiting_model_confirmation';state.required_confirmation={taskId:pending.newTaskId,sessionId:pending.newSessionId,workspace:plan.workspace,file:confirmationFile,rule:'Show the actual WorkBuddy conversation and model; obtain explicit user confirmation before writing this receipt or dispatching.'};save();return state;
      }
      delete state.required_confirmation;
      const objective=`${plan.continuationObjective}\n\n这是原任务的检查点接力，只执行未完成部分。先读取 ${checkpointFile}，核对 task_id=${task.taskId}、session_id=${task.sessionId}、文件SHA。保留旧成果，不重复已完成操作。不扩大授权。再次需要换会话时，在同一检查点写入本轮claim的task_id/session_id/attempt_id、signal=CONTEXT_HANDOFF_REQUIRED、safe_to_resume=true、inflight=[]及files[{path,sha256}]，仅在无未确认副作用时回报blocked与该信号。正常完工回报completed，等待Codex独立验收。`;
      const result=await co.send({taskId:pending.newTaskId,workspace:plan.workspace,sessionId:pending.newSessionId,objective,constraints:plan.constraints??[],timeoutSeconds:plan.taskTimeoutSeconds??1800});
      if(!result.ok)throw Error('New task dispatch failed; inspect stable reserved task ID');
      state.history.push({...pending,at:new Date().toISOString()});state.currentTaskId=pending.newTaskId;state.generation++;delete state.pending;state.phase='watching';save();
    }
    state.last_wait='watch deadline reached; restart same immutable plan to resume';save();return state;
  } catch(error) {
    if(state){state.phase='blocked';state.last_error=String(error.message??error);state.updated_at=new Date().toISOString();atomic(stateFile,state);}
    throw error;
  } finally {native?.close();store?.close();if(lockfd!==undefined){fs.closeSync(lockfd);fs.unlinkSync(lock);}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  run(process.argv[2]).then(s=>console.log(JSON.stringify(s,null,2))).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
