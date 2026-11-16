/** Shared physical page geometry for Word and the browser print exporter.
 * Narrow uses 0.5in sides and 0.8in vertical spacing to leave room for repeating headers.
 */
const PRESETS = Object.freeze({
  narrow: {top:20.32, bottom:20.32, left:12.7, right:12.7},
  moderate: {top:25.4, bottom:25.4, left:19.05, right:19.05},
  normal: {top:25.4, bottom:25.4, left:25.4, right:25.4},
  wide: {top:25.4, bottom:25.4, left:31.75, right:31.75},
});
export const MARGIN_CHOICES = [
  ['normal','Normal · 1in'],['narrow','Narrow · 0.5in sides'],
  ['moderate','Moderate · 0.75in sides'],['wide','Wide · 1.25in sides']
];
export function pageLayout(settings={}) {
  const preset = PRESETS[settings.margins] || PRESETS.normal;
  const mm={...preset};
  const twips=Object.fromEntries(Object.entries(mm).map(([key,value])=>[key,Math.round(value/25.4*1440)]));
  return {mm,twips,columns:Number(settings.pageColumns)===2?2:1};
}
export function showSchoolInTitle(settings={}) {
  const school=String(settings.school||'').trim();
  if(!school)return false;
  if(settings.avoidDuplicateSchool===false)return true;
  const fields=['headerLeft','headerCenter','headerRight'];
  const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLocaleLowerCase();
  return !fields.some(field=>{
    const v=String(settings[field]||'').replace(/\{school\}/gi,school);
    return norm(v).includes(norm(school));
  });
}
