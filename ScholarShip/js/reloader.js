chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "reload") {
    window.location.reload();
  }
});