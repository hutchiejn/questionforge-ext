/** Local-only privacy preferences. No telemetry, accounts, or encryption claims. */
export const DEFAULT_PRIVACY=Object.freeze({draftSaving:true,retentionDays:30,shareWarning:true});
const DAYS=new Set([7,30,90,0]);
export function normalizePrivacy(value){
  const src=value&&typeof value==='object'?value:{};
  return {draftSaving:src.draftSaving!==false,
    retentionDays:DAYS.has(Number(src.retentionDays))?Number(src.retentionDays):30,
    shareWarning:src.shareWarning!==false};
}
export function shouldRestoreDraft(draft,preferences,now=Date.now()){
  const prefs=normalizePrivacy(preferences);
  if(!prefs.draftSaving||!draft||typeof draft!=='object')return false;
  if(prefs.retentionDays===0)return true;
  // Legacy drafts without timestamps are retained once; future saves add savedAt.
  const savedAt=Number(draft.savedAt);
  if(!Number.isFinite(savedAt)||savedAt<=0)return true;
  return savedAt<=now && now-savedAt<=prefs.retentionDays*86400000;
}
export function isFreshCapture(capture,now=Date.now()){
  if(!capture||typeof capture.text!=='string'||!capture.text.trim()||capture.text.length>100000)return false;
  if(!capture.createdAt)return true; // legacy selection; removed immediately on consumption
  const age=now-Number(capture.createdAt);
  return age>=0 && age<15*60*1000;
}
