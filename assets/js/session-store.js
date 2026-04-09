function safeStorageGet(key, fallback = null){
  try{
    if(typeof localStorage === 'undefined') return fallback;
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  }catch(err){
    return fallback;
  }
}

function safeStorageSet(key, value){
  try{
    if(typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  }catch(err){
    return false;
  }
}

function safeStorageRemove(key){
  try{
    if(typeof localStorage === 'undefined') return false;
    localStorage.removeItem(key);
    return true;
  }catch(err){
    return false;
  }
}

window.safeStorageGet = safeStorageGet;
window.safeStorageSet = safeStorageSet;
window.safeStorageRemove = safeStorageRemove;