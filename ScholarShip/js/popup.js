document.addEventListener('DOMContentLoaded', function() {
  const enhanceSwitch = document.getElementById('enhance-switch');
  const dialogOverlay = document.getElementById('dialog-overlay');
  const submitKeyBtn = document.getElementById('submit-key');
  const cancelKeyBtn = document.getElementById('cancel-key');
  const keyInput = document.getElementById('key-input');
  const logo = document.getElementById('logo');
  const title = document.getElementById('title');
  const changeKeyBtn = document.getElementById('change-key-btn');
  const getPlusLinkOutside = document.getElementById('get-plus-link-outside');
  const SERVER_URL = 'https://scholarship.wenzhub.top';

  changeKeyBtn.addEventListener('click', function() {
    dialogOverlay.style.display = 'flex';
  });

  // The 'get-plus' link now works as a standard HTML link,
  // as the preventDefault() listener has been removed.

  // When the user cancels the key input, hide the dialog and uncheck the switch.
  cancelKeyBtn.addEventListener('click', function() {
    dialogOverlay.style.display = 'none';
    enhanceSwitch.checked = false;
  });

  // Handle the key submission.
  submitKeyBtn.addEventListener('click', function() {
    const key = keyInput.value.trim();
    if (!key) {
      alert('Please enter a key.');
      return;
    }

    chrome.storage.sync.get('isVIP', async function(data) {
      const wasVIP = !!data.isVIP;

      const dataUrl = `${SERVER_URL}/data/${key}_data`;
      const keyUrl = `${SERVER_URL}/data/${key}_key`;

      try {
        const [dataResponse, keyResponse] = await Promise.all([fetch(dataUrl), fetch(keyUrl)]);

        if (dataResponse.ok && keyResponse.ok) {
          let secretKey = await keyResponse.text();
          secretKey = secretKey.trim();
          if (secretKey.includes("VIP")) {
            // Key is valid. Save state and reload tab.
            const dateUrl = `${SERVER_URL}/data/${key}_date`;
            const dateResponse = await fetch(dateUrl);
            let updateDate = '';
            if (dateResponse.ok) {
              updateDate = (await dateResponse.text()).trim();
            }

            chrome.storage.sync.set({ 'customKey': key, 'enhanceMode': true, 'isVIP': true, 'updateDate': updateDate }, function() {
              alert('Key saved successfully! Please refresh the page for the changes to take effect.');
              dialogOverlay.style.display = 'none';
              logo.src = 'images/logo_vip.png';
              changeKeyBtn.style.display = 'inline-block';
              getPlusLinkOutside.style.display = 'none';
              if (updateDate) {
                title.textContent = `Updated: ${updateDate}`;
              }
              // The switch remains checked.
              chrome.runtime.sendMessage({ action: "reload" }).catch(err => {
                if (err.message.includes('Could not establish connection')) {
                  // This is expected if the content script is not on the page. Suppress the error.
                } else {
                  console.error(err);
                }
              });
            });
          } else {
            // Key is invalid.
            if (wasVIP) {
              alert('Invalid key. Your existing key is retained.');
              dialogOverlay.style.display = 'none';
            } else {
              handleInvalidKey();
            }
          }
        } else {
          // Key is invalid.
          if (wasVIP) {
            alert('Invalid key. Your existing key is retained.');
            dialogOverlay.style.display = 'none';
          } else {
            handleInvalidKey();
          }
        }
      } catch (error) {
        // Network or other error.
        if (wasVIP) {
          alert('Network error. Please try again. Your existing key is retained.');
          dialogOverlay.style.display = 'none';
        } else {
          handleInvalidKey();
        }
      }
    });
  });

  // Central function for handling key validation failure.
  // This function sets the UI and storage for VIP mode.
  function setVipMode(data) {
    enhanceSwitch.checked = !!data.enhanceMode;
    logo.src = 'images/logo_vip.png';
    changeKeyBtn.style.display = 'inline-block';
    getPlusLinkOutside.style.display = 'none';
    if (data.updateDate) {
      title.textContent = `Updated: ${data.updateDate}`;
    }
  }

  // This function resets the UI and storage to the default non-VIP state.
  function setGeneralMode() {
    dialogOverlay.style.display = 'none'; // Hide dialog if it's open
    enhanceSwitch.checked = false;
    chrome.storage.sync.set({ 'enhanceMode': false, 'isVIP': false, 'customKey': 'general', 'updateDate': '' });
    logo.src = 'images/logo.png';
    changeKeyBtn.style.display = 'none';
    getPlusLinkOutside.style.display = 'inline-block';
    fetch(`${SERVER_URL}/data/general_date`)
      .then(response => response.ok ? response.text() : Promise.reject())
      .then(date => {
          title.textContent = `Updated: ${date.trim()}`;
      }).catch(() => {
          title.textContent = 'Connect Failed';
      });
  }

  // Central function for handling key validation failure.
  function handleInvalidKey() {
    alert('Invalid key. The switch will be turned off.');
    setGeneralMode();
  }

  // Set the initial state of the popup when it loads.
  chrome.storage.sync.get(['enhanceMode', 'isVIP', 'customKey', 'updateDate'], async function(data) {
    const key = data.customKey;
    if (key && key !== 'general') {
      // User has a custom key, let's verify it.
      try {
        const keyUrl = `${SERVER_URL}/data/${key}_key`;
        const keyResponse = await fetch(keyUrl);

        if (keyResponse.ok) {
          let secretKey = await keyResponse.text();
          if (secretKey.trim().includes("VIP")) {
            // Key is valid and is a VIP key.
            setVipMode(data);
            return;
          }
        }
        // If we reach here, the key is invalid.
        console.log("Key verification failed. Falling back to general mode.");
        setGeneralMode();

      } catch (error) {
        // Network error during verification. Assume key is invalid.
        console.error("Network error during key verification. Falling back to general mode.", error);
        setGeneralMode();
      }
    } else {
      // No custom key, so we are in general mode.
      setGeneralMode();
    }
  });

  // Main logic for the enhance switch.
  enhanceSwitch.addEventListener('change', function() {
    const isChecked = this.checked;

    chrome.storage.sync.get('isVIP', function(data) {
      const isVIP = !!data.isVIP;

      if (isChecked) {
        // If the switch is turned ON:
        if (isVIP) {
          // For a VIP, this just enables enhance mode.
          chrome.storage.sync.set({ 'enhanceMode': true }, function() {
            logo.src = 'images/logo_vip.png';
            alert('Please refresh the page for the changes to take effect.');
            chrome.runtime.sendMessage({ action: "reload" }).catch(err => {
              if (err.message.includes('Could not establish connection')) {
                // This is expected if the content script is not on the page. Suppress the error.
              } else {
                console.error(err);
              }
            });
          });
        } else {
          // For a non-VIP, this opens the key dialog.
          dialogOverlay.style.display = 'flex';
        }
      } else {
        // If the switch is turned OFF:
        // This disables enhance mode for VIPs.
        // For non-VIPs, this action is redundant but harmless.
        chrome.storage.sync.set({ 'enhanceMode': false }, function() {
          logo.src = 'images/logo.png';
          alert('Please refresh the page for the changes to take effect.');
          // A reload might be good to ensure the page reflects the change.
          chrome.runtime.sendMessage({ action: "reload" }).catch(err => {
            if (err.message.includes('Could not establish connection')) {
              // This is expected if the content script is not on the page. Suppress the error.
            } else {
              console.error(err);
            }
          });
        });
      }
    });
  });
});