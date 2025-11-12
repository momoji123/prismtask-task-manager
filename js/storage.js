export const DB = (function(){
  const DB_NAME = 'taskmgr-v1';
  const STORE_META = 'meta';
  let db;

  function open(){
    return new Promise((resolve,reject)=>{
      if(db) return resolve(db);
      // Version bump to 4 to trigger onupgradeneeded for milestones
      const r = indexedDB.open(DB_NAME); 
      r.onupgradeneeded = e => {
        const idb = e.target.result;
        
        // Meta store for custom categories, statuses, etc.
        if(!idb.objectStoreNames.contains(STORE_META)){
          idb.createObjectStore(STORE_META,{keyPath:'key'});
        }

      };
      r.onsuccess = e => { db = e.target.result; resolve(db); };
      r.onerror = e => reject(e.target.error);
    });
  }

  // --- Meta Operations (Existing) ---
  async function putMeta(key,value){
    const conn = await open();
    return new Promise((res,rej)=>{
      const tx = conn.transaction([STORE_META],'readwrite');
      tx.objectStore(STORE_META).put({key,value});
      tx.oncomplete = ()=>res();
      tx.onerror = e => rej(e.target.error);
    });
  }

  async function getMeta(key){
    const conn = await open();
    return new Promise((res,rej)=>{
      const tx = conn.transaction([STORE_META],'readonly');
      tx.objectStore(STORE_META).get(key).onsuccess = e => res(e.target.result?.value);
      tx.onerror = e => rej(e.target.error);
    });
  }

  // New function to close the IndexedDB connection
  function close() {
    if (db) {
      db.close();
      db = null; // Clear the reference
    }
  }

  return {putMeta,getMeta,close};
})();
