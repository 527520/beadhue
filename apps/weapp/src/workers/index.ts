import { executeTask } from './execute';
import type { WorkerTask } from './tasks';
declare const worker: { onMessage(fn:(data:{id:number;task:WorkerTask})=>void):void;postMessage(value:unknown):void };
worker.onMessage(async({id,task})=>{
  try { worker.postMessage({id,result:await executeTask(task)}); }
  catch(error){worker.postMessage({id,error:error instanceof Error?error.message:'计算失败'});}
});
