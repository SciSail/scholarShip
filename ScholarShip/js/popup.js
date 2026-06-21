document.addEventListener('DOMContentLoaded', function() {
  const enhanceSwitch = document.getElementById('enhance-switch');
  const googleScholarModeButtons = document.querySelectorAll('#google-scholar-mode button');
  const dialogOverlay = document.getElementById('dialog-overlay');
  const submitKeyBtn = document.getElementById('submit-key');
  const cancelKeyBtn = document.getElementById('cancel-key');
  const keyInput = document.getElementById('key-input');
  const logo = document.getElementById('logo');
  const title = document.getElementById('title');
  const changeKeyBtn = document.getElementById('change-key-btn');
  const getPlusLinkOutside = document.getElementById('get-plus-link-outside');
  const refreshDataBtn = document.getElementById('refresh-data-btn');
  const SERVER_URL = 'https://scholarship.wenzhub.top';
  const MSG = {
    refresh: '请刷新页面以生效。\nPlease refresh the page.',
    enhanceUpdated: '增强模式已更新，请刷新页面。\nEnhance mode updated. Please refresh.',
    globalConfirm: '全局模式会自动加载可见条目，可能卡顿，也可能被 Google 误判为异常请求，存在 IP 限制风险。\nGlobal mode auto-loads visible results. It may slow the page and may be mistaken by Google as abnormal traffic, risking IP restrictions.\n\n确认启用？\nEnable it?',
    cacheCleared: '缓存已清除，将重新加载页面。\nCache cleared. The page will reload.',
    cacheFailed: '清除缓存失败，请稍后重试。\nFailed to clear cache. Please try again.',
    enterKey: '请输入 Key。\nPlease enter a key.',
    keySaved: 'Key 已保存，请刷新页面。\nKey saved. Please refresh the page.',
    invalidKeyRetained: 'Key 无效，已保留当前 Key。\nInvalid key. Your current key was kept.',
    networkKeyRetained: '网络错误，已保留当前 Key。\nNetwork error. Your current key was kept.',
    invalidKeyGeneral: 'Key 无效，已切回普通模式。\nInvalid key. Switched back to general mode.',
  };

  function fetchFreshText(url) {
    return fetch(url, { cache: 'no-store' }).then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}`);
      }
      return response.text();
    });
  }

  function reloadActivePageNotice(message = MSG.refresh) {
    alert(message);
    chrome.runtime.sendMessage({ action: "reload" }).catch(err => {
      if (err.message.includes('Could not establish connection')) {
        // This is expected if the content script is not on the page. Suppress the error.
      } else {
        console.error(err);
      }
    });
  }

  function normalizeGoogleScholarMode(data) {
    if (['click', 'hover', 'global'].includes(data.googleScholarMode)) {
      return data.googleScholarMode;
    }
    return 'hover';
  }

  function renderGoogleScholarMode(mode) {
    googleScholarModeButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.mode === mode);
    });
  }

  chrome.storage.sync.get({ googleScholarMode: null }, function(data) {
    const googleScholarMode = normalizeGoogleScholarMode(data);
    renderGoogleScholarMode(googleScholarMode);
    chrome.storage.sync.set({
      pubmedEnabled: true,
      googleScholarEnabled: true,
      googleScholarMode: googleScholarMode,
    });
  });

  googleScholarModeButtons.forEach(button => {
    button.addEventListener('click', function() {
      const mode = this.dataset.mode;

      if (mode === 'global') {
        const confirmed = confirm(MSG.globalConfirm);
        if (!confirmed) return;
      }

      renderGoogleScholarMode(mode);
      chrome.storage.sync.set({
        googleScholarEnabled: true,
        googleScholarMode: mode,
      }, () => reloadActivePageNotice());
    });
  });

  async function clearCachedDataAndReload() {
    refreshDataBtn.disabled = true;
    const originalText = refreshDataBtn.textContent;
    refreshDataBtn.textContent = '刷新中...';

    try {
      const allLocalData = await new Promise(resolve => chrome.storage.local.get(null, resolve));
      const cachedKeys = Object.keys(allLocalData).filter(key => key.startsWith('cached'));

      if (cachedKeys.length > 0) {
        await new Promise(resolve => chrome.storage.local.remove(cachedKeys, resolve));
      }

      const { customKey } = await new Promise(resolve => chrome.storage.sync.get({ customKey: 'general' }, resolve));
      const key = customKey || 'general';
      const freshDate = (await fetchFreshText(`${SERVER_URL}/data/${key}_date`)).trim();
      await new Promise(resolve => chrome.storage.sync.set({ updateDate: freshDate }, resolve));
      title.textContent = `数据版本: ${freshDate}`;

      alert(MSG.cacheCleared);
      chrome.runtime.sendMessage({ action: "reload" }).catch(err => {
        if (err.message.includes('Could not establish connection')) {
          // This is expected if the content script is not on the page. Suppress the error.
        } else {
          console.error(err);
        }
      });
    } catch (error) {
      console.error('Failed to clear cached data.', error);
      alert(MSG.cacheFailed);
    } finally {
      refreshDataBtn.disabled = false;
      refreshDataBtn.textContent = originalText;
    }
  }

  refreshDataBtn.addEventListener('click', clearCachedDataAndReload);

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
      alert(MSG.enterKey);
      return;
    }

    chrome.storage.sync.get('isVIP', async function(data) {
      const wasVIP = !!data.isVIP;

      const dataUrl = `${SERVER_URL}/data/${key}_data`;
      const keyUrl = `${SERVER_URL}/data/${key}_key`;

      try {
        const [dataResponse, keyResponse] = await Promise.all([
          fetch(dataUrl, { cache: 'no-store' }),
          fetch(keyUrl, { cache: 'no-store' }),
        ]);

        if (dataResponse.ok && keyResponse.ok) {
          let secretKey = await keyResponse.text();
          secretKey = secretKey.trim();
          if (secretKey.includes("VIP")) {
            // Key is valid. Save state and reload tab.
            const dateUrl = `${SERVER_URL}/data/${key}_date`;
            let updateDate = '';
            try {
              updateDate = (await fetchFreshText(dateUrl)).trim();
            } catch (error) {
              console.warn('Failed to fetch update date.', error);
            }

            chrome.storage.sync.set({ 'customKey': key, 'enhanceMode': true, 'isVIP': true, 'updateDate': updateDate }, function() {
              alert(MSG.keySaved);
              dialogOverlay.style.display = 'none';
              logo.src = 'images/logo_vip.png';
              changeKeyBtn.style.display = 'inline-block';
              getPlusLinkOutside.style.display = 'none';
              if (updateDate) {
                title.textContent = `数据版本: ${updateDate}`;
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
              alert(MSG.invalidKeyRetained);
              dialogOverlay.style.display = 'none';
            } else {
              handleInvalidKey();
            }
          }
        } else {
          // Key is invalid.
          if (wasVIP) {
            alert(MSG.invalidKeyRetained);
            dialogOverlay.style.display = 'none';
          } else {
            handleInvalidKey();
          }
        }
      } catch (error) {
        // Network or other error.
        if (wasVIP) {
          alert(MSG.networkKeyRetained);
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
      title.textContent = `数据版本: ${data.updateDate}`;
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
    fetchFreshText(`${SERVER_URL}/data/general_date`)
      .then(date => {
          title.textContent = `数据版本: ${date.trim()}`;
      }).catch(() => {
          title.textContent = 'Connect Failed';
      });
  }

  // Central function for handling key validation failure.
  function handleInvalidKey() {
    alert(MSG.invalidKeyGeneral);
    setGeneralMode();
  }

  // Set the initial state of the popup when it loads.
  chrome.storage.sync.get(['enhanceMode', 'isVIP', 'customKey', 'updateDate'], async function(data) {
    const key = data.customKey;
    if (key && key !== 'general') {
      // User has a custom key, let's verify it.
      try {
        const keyUrl = `${SERVER_URL}/data/${key}_key`;
        const keyResponse = await fetch(keyUrl, { cache: 'no-store' });

        if (keyResponse.ok) {
          let secretKey = await keyResponse.text();
          if (secretKey.trim().includes("VIP")) {
            const dateUrl = `${SERVER_URL}/data/${key}_date`;
            let updateDate = data.updateDate || '';
            try {
              updateDate = (await fetchFreshText(dateUrl)).trim();
              chrome.storage.sync.set({ updateDate: updateDate });
            } catch (error) {
              console.warn('Failed to fetch update date.', error);
            }
            setVipMode({ ...data, updateDate: updateDate });
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
            alert(MSG.enhanceUpdated);
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
          alert(MSG.enhanceUpdated);
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
