const MENU_ID = 'questionforge-capture';

function registerMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Add selection to QuestionForge',
      contexts: ['selection'],
    });
  });
}
async function restrictStorageAccess(){
  try{await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});}catch{}
}
chrome.runtime.onInstalled.addListener(()=>{registerMenu();void restrictStorageAccess();});
chrome.runtime.onStartup.addListener(()=>{registerMenu();void restrictStorageAccess();});
void restrictStorageAccess();

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText?.trim()) return;
  // Avoid persisting entire webpages or oversized potentially sensitive captures.
  if(info.selectionText.length>100_000)return;
  try {
    // Store before opening: the panel may not yet be loaded.
    await chrome.storage.session.set({
      questionforgeCapture: {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text: info.selectionText,
        createdAt: Date.now(),
      },
    });
    if (tab?.id !== undefined) await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('QuestionForge selection capture failed:', error);
  }
});
