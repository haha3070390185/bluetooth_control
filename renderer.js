const { electronAPI } = window;

class BluetoothManager {
  constructor() {
    this.devices = [];
    this.filteredDevices = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.isScanning = false;
    this.renameDeviceId = null;
    this.currentDetailsDeviceId = null;
    this.settings = {};
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.loadDevices();
  }

  async loadSettings() {
    try {
      const result = await electronAPI.getSettings();
      if (result.success) {
        this.settings = result.settings;
        this.applySettingsUI();
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  applySettingsUI() {
    if (this.settings.autoScanOnLaunch !== undefined) {
      document.getElementById('setting-auto-scan').checked = this.settings.autoScanOnLaunch;
    }
    if (this.settings.notifications !== undefined) {
      document.getElementById('setting-notifications').checked = this.settings.notifications;
    }
    if (this.settings.rememberPairedDevices !== undefined) {
      document.getElementById('setting-remember-paired').checked = this.settings.rememberPairedDevices;
    }
  }

  setupEventListeners() {
    document.getElementById('minimize-btn').addEventListener('click', () => {
      electronAPI.minimizeWindow();
    });

    document.getElementById('maximize-btn').addEventListener('click', () => {
      electronAPI.maximizeWindow();
    });

    document.getElementById('close-btn').addEventListener('click', () => {
      electronAPI.closeWindow();
    });

    document.getElementById('settings-btn').addEventListener('click', () => {
      this.openSettingsModal();
    });

    document.getElementById('scan-btn').addEventListener('click', () => {
      this.scanDevices();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setFilter(e.target.dataset.filter);
      });
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderDevices();
    });

    document.getElementById('cancel-rename-btn').addEventListener('click', () => {
      this.closeRenameModal();
    });

    document.getElementById('confirm-rename-btn').addEventListener('click', () => {
      this.confirmRename();
    });

    document.querySelector('#rename-modal .modal-overlay').addEventListener('click', () => {
      this.closeRenameModal();
    });

    document.getElementById('rename-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.confirmRename();
      }
    });

    document.getElementById('close-details-btn').addEventListener('click', () => {
      this.closeDetailsModal();
    });

    document.querySelector('#details-modal .modal-overlay').addEventListener('click', () => {
      this.closeDetailsModal();
    });

    document.getElementById('details-connect-btn').addEventListener('click', async () => {
      await this.connectDeviceFromDetails();
    });

    document.getElementById('details-disconnect-btn').addEventListener('click', async () => {
      await this.disconnectDeviceFromDetails();
    });

    document.getElementById('details-pair-btn').addEventListener('click', async () => {
      await this.pairDeviceFromDetails();
    });

    document.getElementById('details-unpair-btn').addEventListener('click', async () => {
      await this.unpairDeviceFromDetails();
    });

    document.getElementById('details-rename-btn').addEventListener('click', () => {
      this.openRenameModalFromDetails();
    });

    document.getElementById('close-settings-btn').addEventListener('click', () => {
      this.closeSettingsModal();
    });

    document.querySelector('#settings-modal .modal-overlay').addEventListener('click', () => {
      this.closeSettingsModal();
    });

    document.getElementById('save-settings-btn').addEventListener('click', async () => {
      await this.saveSettings();
    });
  }

  async loadDevices() {
    try {
      const result = await electronAPI.getBluetoothDevices();
      if (result.success) {
        this.devices = result.devices;
        this.renderDevices();
        this.updateStatusCounts();
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  }

  async scanDevices() {
    if (this.isScanning) return;
    
    this.isScanning = true;
    const scanBtn = document.getElementById('scan-btn');
    const scanText = document.getElementById('scan-text');
    
    scanBtn.classList.add('scanning');
    scanText.textContent = '扫描中...';
    scanBtn.disabled = true;

    try {
      const result = await electronAPI.startScan();
      if (result.success) {
        this.devices = result.devices;
        this.renderDevices();
        this.updateStatusCounts();
      }
    } catch (error) {
      console.error('Failed to scan devices:', error);
    } finally {
      setTimeout(() => {
        this.isScanning = false;
        scanBtn.classList.remove('scanning');
        scanText.textContent = '扫描设备';
        scanBtn.disabled = false;
      }, 1500);
    }
  }

  setFilter(filter) {
    this.currentFilter = filter;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.filter === filter) {
        btn.classList.add('neu-btn-active');
      } else {
        btn.classList.remove('neu-btn-active');
      }
    });
    
    this.renderDevices();
  }

  filterDevices() {
    this.filteredDevices = this.devices.filter(device => {
      let matchesFilter = true;
      
      switch (this.currentFilter) {
        case 'connected':
          matchesFilter = device.isConnected;
          break;
        case 'available':
          matchesFilter = !device.isConnected;
          break;
        case 'paired':
          matchesFilter = device.isPaired;
          break;
        default:
          matchesFilter = true;
      }
      
      const matchesSearch = this.searchQuery === '' ||
        (device.name && device.name.toLowerCase().includes(this.searchQuery)) ||
        (device.customName && device.customName.toLowerCase().includes(this.searchQuery)) ||
        (device.address && device.address.toLowerCase().includes(this.searchQuery));
      
      return matchesFilter && matchesSearch;
    });
  }

  getDeviceIcon(type) {
    const icons = {
      headphones: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
        </svg>
      `,
      wearable: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `,
      speaker: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
          <circle cx="12" cy="14" r="4"></circle>
          <line x1="12" y1="6" x2="12.01" y2="6"></line>
        </svg>
      `,
      keyboard: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
          <line x1="6" y1="8" x2="6" y2="8"></line>
          <line x1="10" y1="8" x2="10" y2="8"></line>
          <line x1="14" y1="8" x2="14" y2="8"></line>
          <line x1="18" y1="8" x2="18" y2="8"></line>
          <line x1="8" y1="12" x2="8" y2="12"></line>
          <line x1="12" y1="12" x2="12" y2="12"></line>
          <line x1="16" y1="12" x2="16" y2="12"></line>
          <line x1="6" y1="16" x2="18" y2="16"></line>
        </svg>
      `,
      mouse: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="3" width="12" height="18" rx="6" ry="6"></rect>
          <line x1="12" y1="7" x2="12" y2="11"></line>
        </svg>
      `,
      unknown: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        </svg>
      `
    };
    
    return icons[type] || icons.unknown;
  }

  getDeviceTypeLabel(type) {
    const labels = {
      headphones: '耳机',
      wearable: '可穿戴设备',
      speaker: '音箱',
      keyboard: '键盘',
      mouse: '鼠标',
      unknown: '未知'
    };
    return labels[type] || labels.unknown;
  }

  getDeviceStatus(device) {
    if (device.isConnected) {
      return { text: '已连接', class: 'connected' };
    } else if (device.isPaired) {
      return { text: '已配对', class: 'paired' };
    } else {
      return { text: '可用', class: 'available' };
    }
  }

  getSignalBars(rssi) {
    let activeCount = 0;
    if (rssi >= -50) activeCount = 4;
    else if (rssi >= -60) activeCount = 3;
    else if (rssi >= -70) activeCount = 2;
    else activeCount = 1;
    
    let bars = '';
    for (let i = 0; i < 4; i++) {
      const activeClass = i < activeCount ? 'active' : '';
      bars += `<div class="signal-bar ${activeClass}"></div>`;
    }
    return bars;
  }

  renderDevices() {
    this.filterDevices();
    const devicesList = document.getElementById('devices-list');
    const emptyState = document.getElementById('empty-state');
    
    if (this.filteredDevices.length === 0) {
      emptyState.style.display = 'flex';
      emptyState.querySelector('p').textContent = this.devices.length === 0 
        ? '点击上方按钮扫描附近的蓝牙设备' 
        : '没有找到匹配的设备';
      devicesList.innerHTML = '';
      devicesList.appendChild(emptyState);
      return;
    }
    
    emptyState.style.display = 'none';
    
    let html = '';
    this.filteredDevices.forEach(device => {
      const status = this.getDeviceStatus(device);
      const displayName = device.customName || device.name;
      
      html += `
        <div class="device-card neu-card" data-id="${device.id}">
          <div class="device-icon type-${device.type}">
            ${this.getDeviceIcon(device.type)}
          </div>
          <div class="device-info">
            <div class="device-name">${displayName}</div>
            <div class="device-meta">
              <span class="device-address">${device.address}</span>
              <span class="device-status ${status.class}">${status.text}</span>
              <div class="device-signal">
                <span>${device.rssi} dBm</span>
                <div class="signal-bars">
                  ${this.getSignalBars(device.rssi)}
                </div>
              </div>
            </div>
          </div>
          <div class="device-actions">
            <button class="action-btn neu-btn rename" data-id="${device.id}" data-action="rename" title="重命名">
              ${this.getRenameIcon()}
            </button>
            ${device.isConnected 
              ? `<button class="action-btn neu-btn disconnect" data-id="${device.id}" data-action="disconnect" title="断开连接">
                   ${this.getDisconnectIcon()}
                 </button>`
              : `<button class="action-btn neu-btn connect" data-id="${device.id}" data-action="connect" title="连接设备">
                   ${this.getConnectIcon()}
                 </button>`
            }
          </div>
        </div>
      `;
    });
    
    devicesList.innerHTML = html;
    this.bindDeviceActions();
  }

  getConnectIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h13M12 5l7 7-7 7"></path>
      </svg>
    `;
  }

  getDisconnectIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
        <line x1="1.18" y1="12" x2="12" y2="12"></line>
        <line x1="15.54" y1="8.46" x2="19.07" y2="4.93"></line>
        <line x1="8.46" y1="15.54" x2="4.93" y2="19.07"></line>
      </svg>
    `;
  }

  getRenameIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    `;
  }

  bindDeviceActions() {
    document.querySelectorAll('.device-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.action-btn')) return;
        
        const deviceId = card.dataset.id;
        this.openDetailsModal(deviceId);
      });
    });

    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const deviceId = btn.dataset.id;
        
        if (action === 'connect') {
          await this.connectDevice(deviceId, btn);
        } else if (action === 'disconnect') {
          await this.disconnectDevice(deviceId, btn);
        } else if (action === 'rename') {
          this.openRenameModal(deviceId);
        }
      });
    });
  }

  async connectDevice(deviceId, btn) {
    const originalHTML = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = '';
    btn.disabled = true;
    
    try {
      const result = await electronAPI.connectBluetooth(deviceId);
      if (result.success) {
        const device = this.devices.find(d => d.id === deviceId);
        if (device) {
          device.isConnected = true;
        }
        this.renderDevices();
        this.updateStatusCounts();
        
        if (this.currentDetailsDeviceId === deviceId) {
          await this.loadDeviceDetails(deviceId);
        }
      }
    } catch (error) {
      console.error('Failed to connect:', error);
    } finally {
      btn.classList.remove('loading');
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }

  async disconnectDevice(deviceId, btn) {
    const originalHTML = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = '';
    btn.disabled = true;
    
    try {
      const result = await electronAPI.disconnectBluetooth(deviceId);
      if (result.success) {
        const device = this.devices.find(d => d.id === deviceId);
        if (device) {
          device.isConnected = false;
        }
        this.renderDevices();
        this.updateStatusCounts();
        
        if (this.currentDetailsDeviceId === deviceId) {
          await this.loadDeviceDetails(deviceId);
        }
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      btn.classList.remove('loading');
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }

  openRenameModal(deviceId) {
    this.renameDeviceId = deviceId;
    const device = this.devices.find(d => d.id === deviceId);
    
    if (device) {
      const modal = document.getElementById('rename-modal');
      const deviceNameSpan = document.getElementById('rename-device-name');
      const renameInput = document.getElementById('rename-input');
      
      deviceNameSpan.textContent = device.customName || device.name;
      renameInput.value = device.customName || '';
      
      modal.classList.add('active');
      renameInput.focus();
    }
  }

  openRenameModalFromDetails() {
    if (this.currentDetailsDeviceId) {
      this.closeDetailsModal();
      this.openRenameModal(this.currentDetailsDeviceId);
    }
  }

  closeRenameModal() {
    const modal = document.getElementById('rename-modal');
    modal.classList.remove('active');
    this.renameDeviceId = null;
  }

  async confirmRename() {
    if (!this.renameDeviceId) return;
    
    const renameInput = document.getElementById('rename-input');
    const newName = renameInput.value.trim();
    
    try {
      const result = await electronAPI.renameBluetooth(this.renameDeviceId, newName);
      if (result.success) {
        const device = this.devices.find(d => d.id === this.renameDeviceId);
        if (device) {
          device.customName = newName;
        }
        this.renderDevices();
        
        if (this.currentDetailsDeviceId === this.renameDeviceId) {
          await this.loadDeviceDetails(this.renameDeviceId);
        }
      }
    } catch (error) {
      console.error('Failed to rename:', error);
    } finally {
      this.closeRenameModal();
    }
  }

  async openDetailsModal(deviceId) {
    this.currentDetailsDeviceId = deviceId;
    await this.loadDeviceDetails(deviceId);
    
    const modal = document.getElementById('details-modal');
    modal.classList.add('active');
  }

  async loadDeviceDetails(deviceId) {
    try {
      const result = await electronAPI.getDeviceDetails(deviceId);
      if (result.success) {
        const details = result.details;
        this.updateDetailsUI(details);
      }
    } catch (error) {
      console.error('Failed to get device details:', error);
    }
  }

  updateDetailsUI(details) {
    const displayName = details.customName || details.name;
    
    document.getElementById('details-icon').innerHTML = this.getDeviceIcon(details.type);
    document.getElementById('details-name').textContent = displayName;
    
    const status = this.getDeviceStatus(details);
    document.getElementById('details-status').textContent = status.text;
    document.getElementById('details-status').className = `details-status ${status.class}`;
    
    document.getElementById('detail-name').textContent = details.name;
    document.getElementById('detail-custom-name').textContent = details.customName || '未设置';
    document.getElementById('detail-address').textContent = details.address;
    document.getElementById('detail-type').textContent = this.getDeviceTypeLabel(details.type);
    document.getElementById('detail-manufacturer').textContent = details.manufacturer || '未知';
    document.getElementById('detail-model').textContent = details.model || '未知';
    
    document.getElementById('detail-connected').textContent = details.isConnected ? '已连接' : '未连接';
    document.getElementById('detail-paired').textContent = details.isPaired ? '已配对' : '未配对';
    document.getElementById('detail-signal').textContent = `${details.rssi} dBm (${details.signalQuality.label})`;
    document.getElementById('detail-last-seen').textContent = details.lastSeenFormatted;
    
    const batterySection = document.getElementById('battery-section');
    if (details.batteryLevel !== null && details.batteryLevel !== undefined) {
      batterySection.style.display = 'block';
      document.getElementById('battery-text').textContent = `${details.batteryLevel}%`;
      
      const batteryFill = document.getElementById('battery-fill');
      batteryFill.style.width = `${details.batteryLevel}%`;
      
      batteryFill.classList.remove('high', 'medium', 'low');
      if (details.batteryLevel >= 60) {
        batteryFill.classList.add('high');
      } else if (details.batteryLevel >= 30) {
        batteryFill.classList.add('medium');
      } else {
        batteryFill.classList.add('low');
      }
    } else {
      batterySection.style.display = 'none';
    }
    
    const servicesList = document.getElementById('services-list');
    if (details.services && details.services.length > 0) {
      document.getElementById('services-section').style.display = 'block';
      servicesList.innerHTML = details.services
        .map(service => `<span class="service-tag">${service}</span>`)
        .join('');
    } else {
      document.getElementById('services-section').style.display = 'none';
    }
    
    const connectBtn = document.getElementById('details-connect-btn');
    const disconnectBtn = document.getElementById('details-disconnect-btn');
    const pairBtn = document.getElementById('details-pair-btn');
    const unpairBtn = document.getElementById('details-unpair-btn');
    
    if (details.isConnected) {
      connectBtn.style.display = 'none';
      disconnectBtn.style.display = 'block';
    } else {
      connectBtn.style.display = 'block';
      disconnectBtn.style.display = 'none';
    }
    
    if (details.isPaired) {
      pairBtn.style.display = 'none';
      unpairBtn.style.display = 'block';
    } else {
      pairBtn.style.display = 'block';
      unpairBtn.style.display = 'none';
    }
  }

  closeDetailsModal() {
    const modal = document.getElementById('details-modal');
    modal.classList.remove('active');
  }

  async connectDeviceFromDetails() {
    if (!this.currentDetailsDeviceId) return;
    
    const connectBtn = document.getElementById('details-connect-btn');
    connectBtn.disabled = true;
    connectBtn.textContent = '连接中...';
    
    try {
      const result = await electronAPI.connectBluetooth(this.currentDetailsDeviceId);
      if (result.success) {
        const device = this.devices.find(d => d.id === this.currentDetailsDeviceId);
        if (device) {
          device.isConnected = true;
        }
        this.renderDevices();
        this.updateStatusCounts();
        await this.loadDeviceDetails(this.currentDetailsDeviceId);
      }
    } catch (error) {
      console.error('Failed to connect:', error);
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = '连接';
    }
  }

  async disconnectDeviceFromDetails() {
    if (!this.currentDetailsDeviceId) return;
    
    const disconnectBtn = document.getElementById('details-disconnect-btn');
    disconnectBtn.disabled = true;
    disconnectBtn.textContent = '断开中...';
    
    try {
      const result = await electronAPI.disconnectBluetooth(this.currentDetailsDeviceId);
      if (result.success) {
        const device = this.devices.find(d => d.id === this.currentDetailsDeviceId);
        if (device) {
          device.isConnected = false;
        }
        this.renderDevices();
        this.updateStatusCounts();
        await this.loadDeviceDetails(this.currentDetailsDeviceId);
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      disconnectBtn.disabled = false;
      disconnectBtn.textContent = '断开连接';
    }
  }

  async pairDeviceFromDetails() {
    if (!this.currentDetailsDeviceId) return;
    
    const pairBtn = document.getElementById('details-pair-btn');
    pairBtn.disabled = true;
    pairBtn.textContent = '配对中...';
    
    try {
      const result = await electronAPI.pairDevice(this.currentDetailsDeviceId);
      if (result.success) {
        const device = this.devices.find(d => d.id === this.currentDetailsDeviceId);
        if (device) {
          device.isPaired = true;
        }
        this.renderDevices();
        this.updateStatusCounts();
        await this.loadDeviceDetails(this.currentDetailsDeviceId);
      }
    } catch (error) {
      console.error('Failed to pair:', error);
    } finally {
      pairBtn.disabled = false;
      pairBtn.textContent = '配对';
    }
  }

  async unpairDeviceFromDetails() {
    if (!this.currentDetailsDeviceId) return;
    
    const unpairBtn = document.getElementById('details-unpair-btn');
    unpairBtn.disabled = true;
    unpairBtn.textContent = '取消配对中...';
    
    try {
      const result = await electronAPI.unpairDevice(this.currentDetailsDeviceId);
      if (result.success) {
        const device = this.devices.find(d => d.id === this.currentDetailsDeviceId);
        if (device) {
          device.isPaired = false;
        }
        this.renderDevices();
        this.updateStatusCounts();
        await this.loadDeviceDetails(this.currentDetailsDeviceId);
      }
    } catch (error) {
      console.error('Failed to unpair:', error);
    } finally {
      unpairBtn.disabled = false;
      unpairBtn.textContent = '取消配对';
    }
  }

  openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('active');
  }

  closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('active');
  }

  async saveSettings() {
    const newSettings = {
      autoScanOnLaunch: document.getElementById('setting-auto-scan').checked,
      notifications: document.getElementById('setting-notifications').checked,
      rememberPairedDevices: document.getElementById('setting-remember-paired').checked
    };
    
    try {
      const result = await electronAPI.updateSettings(newSettings);
      if (result.success) {
        this.settings = result.settings;
        this.closeSettingsModal();
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  updateStatusCounts() {
    const connectedCount = this.devices.filter(d => d.isConnected).length;
    const availableCount = this.devices.filter(d => !d.isConnected).length;
    const pairedCount = this.devices.filter(d => d.isPaired).length;
    
    document.getElementById('connected-count').textContent = connectedCount;
    document.getElementById('available-count').textContent = availableCount;
    document.getElementById('paired-count').textContent = pairedCount;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new BluetoothManager();
});
