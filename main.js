const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const StoreManager = require('./store');
const Notifier = require('./notifier');

let mainWindow;
let connectedDevices = new Set();
let scannedDevices = [];
let useRealBluetooth = false;

const mockDeviceTemplates = [
  {
    id: '1',
    name: 'AirPods Pro',
    address: '00:1A:7D:DA:71:13',
    type: 'headphones',
    manufacturer: 'Apple',
    model: 'A2084',
    services: ['音频', 'HFP', 'A2DP'],
    batteryLevel: 85,
    lastSeen: Date.now()
  },
  {
    id: '2',
    name: '小米手环 8',
    address: '00:1A:7D:DA:71:14',
    type: 'wearable',
    manufacturer: 'Xiaomi',
    model: 'M2239B1',
    services: ['心率监测', '步数', '通知'],
    batteryLevel: 62,
    lastSeen: Date.now() - 300000
  },
  {
    id: '3',
    name: 'JBL Flip 5',
    address: '00:1A:7D:DA:71:15',
    type: 'speaker',
    manufacturer: 'JBL',
    model: 'JBLFLIP5',
    services: ['音频', 'A2DP', 'AVRCP'],
    batteryLevel: 100,
    lastSeen: Date.now() - 60000
  },
  {
    id: '4',
    name: 'Keychron K2',
    address: '00:1A:7D:DA:71:16',
    type: 'keyboard',
    manufacturer: 'Keychron',
    model: 'K2 V2',
    services: ['HID', '键盘', '媒体控制'],
    batteryLevel: 45,
    lastSeen: Date.now()
  },
  {
    id: '5',
    name: '罗技 MX Master 3',
    address: '00:1A:7D:DA:71:17',
    type: 'mouse',
    manufacturer: 'Logitech',
    model: 'MX Master 3',
    services: ['HID', '指针', '手势'],
    batteryLevel: 78,
    lastSeen: Date.now() - 120000
  },
  {
    id: '6',
    name: 'Apple TV 4K',
    address: '00:1A:7D:DA:71:18',
    type: 'unknown',
    manufacturer: 'Apple',
    model: 'A2169',
    services: ['音频', '视频', 'AirPlay'],
    batteryLevel: null,
    lastSeen: Date.now() - 180000
  }
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
      webBluetooth: true
    },
    frame: false,
    backgroundColor: '#e0e5ec',
    title: '蓝牙设备管理器',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    if (deviceList.length > 0) {
      callback(deviceList[0].deviceId);
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  
  const settings = StoreManager.getSettings();
  if (settings.autoScanOnLaunch) {
    setTimeout(() => {
      performScan();
    }, 1000);
  }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

function generateMockDevices() {
  const devices = mockDeviceTemplates.map((template, index) => {
    const isPaired = index < 3 || StoreManager.isPaired(template.address);
    const isConnected = index === 0 || index === 3;
    const customName = StoreManager.getCustomDeviceName(template.address);
    const rssi = -40 - Math.floor(Math.random() * 50);
    
    if (isConnected) {
      connectedDevices.add(template.address);
    }
    
    return {
      ...template,
      rssi: rssi,
      isConnected: isConnected,
      isPaired: isPaired,
      customName: customName
    };
  });
  
  return devices;
}

function performScan() {
  scannedDevices = generateMockDevices();
  
  scannedDevices.forEach(device => {
    if (device.isPaired && !StoreManager.isPaired(device.address)) {
      StoreManager.addPairedDevice(device);
    }
  });
  
  return scannedDevices;
}

ipcMain.handle('get-bluetooth-devices', async () => {
  try {
    if (scannedDevices.length === 0) {
      scannedDevices = performScan();
    }
    
    const devicesWithCustomNames = scannedDevices.map(device => ({
      ...device,
      customName: StoreManager.getCustomDeviceName(device.address),
      isPaired: device.isPaired || StoreManager.isPaired(device.address)
    }));
    
    return {
      success: true,
      devices: devicesWithCustomNames
    };
  } catch (error) {
    console.error('Error getting devices:', error);
    return {
      success: false,
      error: error.message,
      devices: []
    };
  }
});

ipcMain.handle('start-scan', async () => {
  try {
    const devices = performScan();
    
    const settings = StoreManager.getSettings();
    if (settings.notifications && devices.length > 0) {
      Notifier.showScanComplete(devices.length);
    }
    
    const devicesWithCustomNames = devices.map(device => ({
      ...device,
      customName: StoreManager.getCustomDeviceName(device.address),
      isPaired: device.isPaired || StoreManager.isPaired(device.address)
    }));
    
    return {
      success: true,
      devices: devicesWithCustomNames
    };
  } catch (error) {
    console.error('Error scanning:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('connect-bluetooth', async (event, deviceId) => {
  try {
    const device = scannedDevices.find(d => d.id === deviceId);
    if (!device) {
      return {
        success: false,
        error: '设备不存在'
      };
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
    
    device.isConnected = true;
    connectedDevices.add(device.address);
    
    const settings = StoreManager.getSettings();
    if (settings.notifications) {
      const displayName = device.customName || device.name;
      Notifier.showDeviceConnected(displayName);
    }
    
    return {
      success: true,
      deviceId: deviceId,
      device: {
        ...device,
        customName: StoreManager.getCustomDeviceName(device.address)
      }
    };
  } catch (error) {
    console.error('Error connecting:', error);
    
    const settings = StoreManager.getSettings();
    if (settings.notifications) {
      Notifier.showError('连接失败', error.message);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('disconnect-bluetooth', async (event, deviceId) => {
  try {
    const device = scannedDevices.find(d => d.id === deviceId);
    if (!device) {
      return {
        success: false,
        error: '设备不存在'
      };
    }
    
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500));
    
    device.isConnected = false;
    connectedDevices.delete(device.address);
    
    const settings = StoreManager.getSettings();
    if (settings.notifications) {
      const displayName = device.customName || device.name;
      Notifier.showDeviceDisconnected(displayName);
    }
    
    return {
      success: true,
      deviceId: deviceId,
      device: {
        ...device,
        customName: StoreManager.getCustomDeviceName(device.address)
      }
    };
  } catch (error) {
    console.error('Error disconnecting:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('rename-bluetooth', async (event, deviceId, newName) => {
  try {
    const device = scannedDevices.find(d => d.id === deviceId);
    if (!device) {
      return {
        success: false,
        error: '设备不存在'
      };
    }
    
    const oldName = device.customName || device.name;
    
    StoreManager.setCustomDeviceName(device.address, newName);
    device.customName = newName;
    
    const settings = StoreManager.getSettings();
    if (settings.notifications && newName && newName.trim()) {
      Notifier.showDeviceRenamed(oldName, newName);
    }
    
    return {
      success: true,
      deviceId: deviceId,
      newName: newName,
      device: {
        ...device,
        customName: newName
      }
    };
  } catch (error) {
    console.error('Error renaming:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('get-device-details', async (event, deviceId) => {
  try {
    const device = scannedDevices.find(d => d.id === deviceId);
    if (!device) {
      return {
        success: false,
        error: '设备不存在'
      };
    }
    
    const customName = StoreManager.getCustomDeviceName(device.address);
    const isPaired = device.isPaired || StoreManager.isPaired(device.address);
    
    const details = {
      ...device,
      customName: customName,
      isPaired: isPaired,
      lastSeenFormatted: formatLastSeen(device.lastSeen),
      signalQuality: getSignalQuality(device.rssi),
      batteryLevel: device.batteryLevel,
      supportsAudio: device.type === 'headphones' || device.type === 'speaker',
      supportsHID: device.type === 'keyboard' || device.type === 'mouse'
    };
    
    return {
      success: true,
      details: details
    };
  } catch (error) {
    console.error('Error getting device details:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('pair-device', async (event, deviceId) => {
  try {
    const device = scannedDevices.find(d => d.id === deviceId);
    if (!device) {
      return {
        success: false,
        error: '设备不存在'
      };
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    StoreManager.addPairedDevice(device);
    device.isPaired = true;
    
    const settings = StoreManager.getSettings();
    if (settings.notifications) {
      const displayName = device.customName || device.name;
      Notifier.showPairingComplete(displayName);
    }
    
    return {
      success: true,
      deviceId: deviceId,
      device: {
        ...device,
        customName: StoreManager.getCustomDeviceName(device.address)
      }
    };
  } catch (error) {
    console.error('Error pairing:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('unpair-device', async (event, deviceId) => {
  try {
    const device = scannedDevices.find(d => d.id === deviceId);
    if (!device) {
      return {
        success: false,
        error: '设备不存在'
      };
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    StoreManager.removePairedDevice(device.address);
    device.isPaired = false;
    
    if (device.isConnected) {
      device.isConnected = false;
      connectedDevices.delete(device.address);
    }
    
    return {
      success: true,
      deviceId: deviceId,
      device: {
        ...device,
        customName: StoreManager.getCustomDeviceName(device.address)
      }
    };
  } catch (error) {
    console.error('Error unpairing:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('get-settings', async () => {
  try {
    const settings = StoreManager.getSettings();
    return {
      success: true,
      settings: settings
    };
  } catch (error) {
    console.error('Error getting settings:', error);
    return {
      success: false,
      error: error.message,
      settings: {}
    };
  }
});

ipcMain.handle('update-settings', async (event, newSettings) => {
  try {
    Object.keys(newSettings).forEach(key => {
      StoreManager.setSetting(key, newSettings[key]);
    });
    
    return {
      success: true,
      settings: StoreManager.getSettings()
    };
  } catch (error) {
    console.error('Error updating settings:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('check-bluetooth-enabled', async () => {
  try {
    return {
      success: true,
      enabled: true,
      adapterName: '蓝牙适配器'
    };
  } catch (error) {
    return {
      success: false,
      enabled: false,
      error: error.message
    };
  }
});

function formatLastSeen(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) {
    return '刚刚';
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} 分钟前`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} 小时前`;
  } else {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN');
  }
}

function getSignalQuality(rssi) {
  if (rssi >= -50) return { level: 'excellent', label: '极佳', color: '#48bb78' };
  if (rssi >= -60) return { level: 'good', label: '良好', color: '#4299e1' };
  if (rssi >= -70) return { level: 'fair', label: '一般', color: '#ed8936' };
  return { level: 'poor', label: '弱', color: '#f56565' };
}
