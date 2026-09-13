const icons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

export const manifest: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: '离线划词查词',
  version: '0.1.0',
  description: '选中英文单词，离线查看中文释义、音标并播放本地发音。',
  icons,
  permissions: ['storage', 'tts'],
  host_permissions: ['http://*/*', 'https://*/*'],
  background: { service_worker: 'background.js', type: 'module' },
  content_scripts: [{
    matches: ['http://*/*', 'https://*/*'],
    js: ['content.js'],
    run_at: 'document_idle',
  }],
  action: { default_popup: 'popup.html', default_icon: icons },
  content_security_policy: {
    extension_pages: "default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'self'",
  },
};
