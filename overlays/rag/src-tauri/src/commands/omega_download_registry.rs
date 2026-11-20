//! A watch signal coalesces mutations, with snapshots serialized only for active subscribers.
use crate::state::DownloadProgress;
use std::{collections::HashMap, ops::{Deref,DerefMut}, sync::{Mutex,MutexGuard,LockResult,PoisonError}};
use tokio::sync::{watch,Semaphore};
type Map=HashMap<String,DownloadProgress>;
pub struct DownloadRegistry {
    data:Mutex<Map>,
    revision:watch::Sender<u64>,
    pub subscriptions:Semaphore,
}
impl DownloadRegistry {
    pub fn new()->Self{
        let (revision,_)=watch::channel(0);
        Self{data:Mutex::new(HashMap::new()),revision,subscriptions:Semaphore::new(4)}
    }
    pub fn lock(&self)->LockResult<DownloadGuard<'_>>{
        let wrap=|guard|DownloadGuard{guard:Some(guard),revision:&self.revision,dirty:false};
        self.data.lock().map(wrap).map_err(|e|PoisonError::new(wrap(e.into_inner())))
    }
    pub fn subscribe(&self)->watch::Receiver<u64>{self.revision.subscribe()}
}
pub struct DownloadGuard<'a>{guard:Option<MutexGuard<'a,Map>>,revision:&'a watch::Sender<u64>,dirty:bool}
impl Deref for DownloadGuard<'_>{type Target=Map;fn deref(&self)->&Map{self.guard.as_ref().unwrap()}}
impl DerefMut for DownloadGuard<'_>{fn deref_mut(&mut self)->&mut Map{self.dirty=true;self.guard.as_mut().unwrap()}}
impl Drop for DownloadGuard<'_>{fn drop(&mut self){drop(self.guard.take());if self.dirty{self.revision.send_modify(|v|*v=v.wrapping_add(1));}}}
#[cfg(test)]
mod tests{
    use super::*;
    #[test] fn mutations_notify_but_reads_do_not(){
        let registry=DownloadRegistry::new();let mut rx=registry.subscribe();
        assert!(registry.lock().unwrap().is_empty());assert!(!rx.has_changed().unwrap());
        registry.lock().unwrap().clear();assert!(rx.has_changed().unwrap());
        let _=*rx.borrow_and_update();assert!(!rx.has_changed().unwrap());
    }
    #[test] fn subscriber_limit(){let r=DownloadRegistry::new();let leases:Vec<_>=(0..4).map(|_|r.subscriptions.try_acquire().unwrap()).collect();assert!(r.subscriptions.try_acquire().is_err());drop(leases);assert!(r.subscriptions.try_acquire().is_ok());}
}
