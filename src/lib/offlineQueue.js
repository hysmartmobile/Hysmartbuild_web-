const DB_NAME='hysmart-build-offline';
const STORE='mutations';
const META='meta';
const version=2;
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,version);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){db.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});}if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function enqueueMutation(item){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).add({...item,state:'pending',createdAt:new Date().toISOString(),attempts:0});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
export async function listMutations(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>a.id-b.id));req.onerror=()=>reject(req.error);});}
export async function removeMutation(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
export async function updateMutation(id,patch){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);const req=store.get(id);req.onsuccess=()=>{if(!req.result){resolve();return;}store.put({...req.result,...patch});};req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
export async function pendingMutationCount(){try{return (await listMutations()).length}catch{return 0}}
export async function mutationQueueSummary(){const items=await listMutations();return {total:items.length,pending:items.filter(x=>!x.state||x.state==='pending'||x.state==='syncing').length,conflicts:items.filter(x=>x.state==='conflict').length,failed:items.filter(x=>x.state==='failed').length,items};}

export async function removeMutationsByOperationId(operationId){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);const req=store.getAll();
    req.onsuccess=()=>{for(const item of req.result||[])if(item.operationId===operationId)store.delete(item.id)};
    req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
}
