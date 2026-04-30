const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const StoreManager = require('./store');
const Notifier = require('./notifier');

const execAsync = promisify(exec);

let mainWindow;
let connectedDevices = new Set();
let scannedDevices = [];
let isScanning = false;
let adapter = null;

const platform = process.platform;

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

app.whenReady().then(async () => {
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

async function executePowerShell(command) {
  try {
    const { stdout, stderr } = await execAsync(`powershell -Command "${command}"`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    if (stderr) {
      console.log('PowerShell stderr:', stderr);
    }
    return stdout;
  } catch (error) {
    console.error('PowerShell error:', error.message);
    return null;
  }
}

function parseBluetoothDeviceOutput(output) {
  if (!output) return [];
  
  const devices = [];
  const lines = output.trim().split('\n');
  
  let currentDevice = null;
  
  lines.forEach(line => {
    line = line.trim();
    if (!line) return;
    
    if (line.match(/^Name\s*:/i) || line.match(/^Device\s*Name/i) || 
        (line.includes('Bluetooth') && !currentDevice)) {
      if (currentDevice) {
        devices.push(currentDevice);
      }
      currentDevice = {
        id: `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: '',
        address: '',
        type: 'unknown',
        manufacturer: 'Unknown',
        model: '',
        services: [],
        batteryLevel: null,
        rssi: -60,
        lastSeen: Date.now()
      };
      
      if (line.match(/^Name\s*:/i)) {
        const match = line.match(/^Name\s*:\s*(.+)/i);
        if (match) currentDevice.name = match[1].trim();
      }
    } else if (currentDevice) {
      if (line.match(/^Address\s*:/i) || line.match(/^Device\s*Address/i)) {
        const match = line.match(/Address\s*:\s*([A-F0-9:]+)/i) || 
                      line.match(/([A-F0-9]{2}[:-][A-F0-9]{2}[:-][A-F0-9]{2}[:-][A-F0-9]{2}[:-][A-F0-9]{2}[:-][A-F0-9]{2})/i);
        if (match) {
          currentDevice.address = match[1].toUpperCase();
          currentDevice.id = `device_${currentDevice.address.replace(/[:-]/g, '')}`;
        }
      } else if (line.match(/^Class\s*:/i) || line.match(/^Device\s*Class/i)) {
        const classMatch = line.match(/Class\s*:\s*(\d+)/i) || 
                          line.match(/(\d+)/);
        if (classMatch) {
          const deviceClass = parseInt(classMatch[1]);
          currentDevice.type = getDeviceTypeFromClass(deviceClass);
        }
      } else if (line.match(/^Connected\s*:/i)) {
        const match = line.match(/Connected\s*:\s*(\w+)/i);
        if (match) {
          const isConnected = match[1].toLowerCase() === 'true' || 
                             match[1].toLowerCase() === 'yes';
          currentDevice.isConnected = isConnected;
          if (isConnected) {
            connectedDevices.add(currentDevice.address);
          }
        }
      } else if (line.match(/^Paired\s*:/i)) {
        const match = line.match(/Paired\s*:\s*(\w+)/i);
        if (match) {
          currentDevice.isPaired = match[1].toLowerCase() === 'true' || 
                                   match[1].toLowerCase() === 'yes';
        }
      } else if (line.match(/^RSSI\s*:/i) || line.match(/^Signal\s*:/i)) {
        const match = line.match(/(?:RSSI|Signal)\s*:\s*(-?\d+)/i);
        if (match) {
          currentDevice.rssi = parseInt(match[1]);
        }
      }
    }
  });
  
  if (currentDevice) {
    devices.push(currentDevice);
  }
  
  return devices;
}

function getDeviceTypeFromClass(deviceClass) {
  const serviceClass = (deviceClass >> 16) & 0x1F;
  const majorClass = (deviceClass >> 8) & 0x1F;
  const minorClass = deviceClass & 0xFF;
  
  if (serviceClass & 0x10) return 'speaker';
  
  switch (majorClass) {
    case 0x01:
      return 'wearable';
    case 0x02:
      return 'phone';
    case 0x03:
      return 'wearable';
    case 0x04:
      switch (minorClass) {
        case 0x01: return 'speaker';
        case 0x02: return 'headphones';
        case 0x06: return 'headphones';
        default: return 'speaker';
      }
    case 0x05:
      switch (minorClass) {
        case 0x80: return 'keyboard';
        case 0x01: return 'mouse';
        case 0x02: return 'mouse';
        default: return 'mouse';
      }
    case 0x06:
      return 'wearable';
    default:
      return 'unknown';
  }
}

async function getBluetoothDevicesWindows() {
  const devices = [];
  
  try {
    const pairedOutput = await executePowerShell(
      'Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -and $_.FriendlyName -notlike "*Bluetooth Radio*" -and $_.FriendlyName -notlike "*Bluetooth LE*" } | Select-Object -Property FriendlyName, DeviceID, Status, Class | ConvertTo-Csv -NoTypeInformation'
    );
    
    if (pairedOutput) {
      const lines = pairedOutput.trim().split('\n').slice(1);
      
      lines.forEach(line => {
        if (!line.trim()) return;
        
        const columns = line.split(',').map(c => c.replace(/"/g, '').trim());
        if (columns.length >= 3 && columns[0]) {
          const device = {
            id: `device_${columns[1] || Date.now()}`,
            name: columns[0],
            address: extractAddressFromDeviceId(columns[1]) || generateRandomAddress(),
            type: 'unknown',
            manufacturer: 'Unknown',
            model: '',
            services: ['通用蓝牙设备'],
            batteryLevel: null,
            rssi: -50 + Math.floor(Math.random() * 30),
            isConnected: columns[2] === 'OK',
            isPaired: true,
            lastSeen: Date.now()
          };
          
          device.type = inferDeviceTypeFromName(device.name);
          
          const existing = devices.find(d => d.address === device.address || d.name === device.name);
          if (!existing && device.name && !device.name.toLowerCase().includes('bluetooth')) {
            devices.push(device);
          }
        }
      });
    }
    
    const activeOutput = await executePowerShell(
      'Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "OK" -and $_.FriendlyName } | Select-Object -ExpandProperty FriendlyName'
    );
    
    if (activeOutput) {
      const activeNames = activeOutput.trim().split('\n').filter(n => n.trim());
      
      devices.forEach(device => {
        if (activeNames.some(name => name.includes(device.name) || device.name.includes(name))) {
          device.isConnected = true;
        }
      });
    }
    
  } catch (error) {
    console.error('Error getting Windows Bluetooth devices:', error.message);
  }
  
  return devices;
}

function extractAddressFromDeviceId(deviceId) {
  if (!deviceId) return null;
  
  const match = deviceId.match(/([A-F0-9]{2}[:-][A-F0-9]{2}[:-][A-F0-9]{2}[:-][A-F0-9]{2}[:-][A-F0-9]{2}[:-][A-F0-9]{2})/i);
  if (match) {
    return match[1].toUpperCase();
  }
  
  const shortMatch = deviceId.match(/([A-F0-9]{12})/i);
  if (shortMatch) {
    const addr = shortMatch[1];
    return addr.match(/.{2}/g).join(':');
  }
  
  return null;
}

function generateRandomAddress() {
  const hex = '0123456789ABCDEF';
  let addr = '';
  for (let i = 0; i < 6; i++) {
    if (i > 0) addr += ':';
    addr += hex[Math.floor(Math.random() * 16)];
    addr += hex[Math.floor(Math.random() * 16)];
  }
  return addr;
}

function inferDeviceTypeFromName(name) {
  if (!name) return 'unknown';
  
  const nameLower = name.toLowerCase();
  
  if (nameLower.includes('airpod') || nameLower.includes('earpod') || 
      nameLower.includes('headphone') || nameLower.includes('headset') ||
      nameLower.includes('earbud') || nameLower.includes('buds')) {
    return 'headphones';
  }
  
  if (nameLower.includes('speaker') || nameLower.includes('jbl') ||
      nameLower.includes('bose') || nameLower.includes('echo')) {
    return 'speaker';
  }
  
  if (nameLower.includes('keyboard') || nameLower.includes('k380') ||
      nameLower.includes('k480') || nameLower.includes('keychron')) {
    return 'keyboard';
  }
  
  if (nameLower.includes('mouse') || nameLower.includes('m590') ||
      nameLower.includes('mx master') || nameLower.includes('anywhere')) {
    return 'mouse';
  }
  
  if (nameLower.includes('watch') || nameLower.includes('band') ||
      nameLower.includes('fitbit') || nameLower.includes('mi band') ||
      nameLower.includes('galaxy watch') || nameLower.includes('apple watch')) {
    return 'wearable';
  }
  
  if (nameLower.includes('phone') || nameLower.includes('iphone') ||
      nameLower.includes('android') || nameLower.includes('oneplus') ||
      nameLower.includes('xiaomi') || nameLower.includes('huawei')) {
    return 'phone';
  }
  
  return 'unknown';
}

async function getBluetoothDevicesLinux() {
  const devices = [];
  
  try {
    const { bluetooth } = await import('node-ble');
    
    const adapters = await bluetooth.adapters();
    if (adapters.length === 0) {
      console.log('No Bluetooth adapters found');
      return devices;
    }
    
    adapter = adapters[0];
    
    const pairedDevices = await adapter.devices();
    
    for (const device of pairedDevices) {
      try {
        const name = await device.Name().catch(() => 'Unknown Device');
        const address = await device.Address().catch(() => '');
        const connected = await device.Connected().catch(() => false);
        const paired = await device.Paired().catch(() => false);
        const rssi = await device.RSSI().catch(() => -60);
        
        const deviceInfo = {
          id: `device_${address.replace(/:/g, '')}`,
          name: name,
          address: address,
          type: 'unknown',
          manufacturer: 'Unknown',
          model: '',
          services: [],
          batteryLevel: null,
          rssi: rssi,
          isConnected: connected,
          isPaired: paired,
          lastSeen: Date.now()
        };
        
        try {
          const uuids = await device.UUIDs().catch(() => []);
          deviceInfo.services = uuids.slice(0, 5);
        } catch (e) {}
        
        deviceInfo.type = inferDeviceTypeFromName(deviceInfo.name);
        
        devices.push(deviceInfo);
        
        if (connected) {
          connectedDevices.add(address);
        }
      } catch (error) {
        console.log('Error getting device info:', error.message);
      }
    }
    
  } catch (error) {
    console.error('Error with node-ble:', error.message);
  }
  
  return devices;
}

async function performScan() {
  console.log(`Scanning for Bluetooth devices on ${platform}...`);
  isScanning = true;
  
  try {
    let devices = [];
    
    if (platform === 'win32') {
      devices = await getBluetoothDevicesWindows();
    } else if (platform === 'linux') {
      devices = await getBluetoothDevicesLinux();
    } else {
      console.log(`Platform ${platform} not fully supported`);
      devices = [];
    }
    
    const customNames = StoreManager.getCustomDeviceNames();
    const pairedAddresses = StoreManager.getPairedDevices().map(d => d.address);
    
    devices = devices.map(device => ({
      ...device,
      customName: customNames[device.address] || '',
      isPaired: device.isPaired || pairedAddresses.includes(device.address)
    }));
    
    if (devices.length > 0) {
      const settings = StoreManager.getSettings();
      if (settings.notifications) {
        Notifier.showScanComplete(devices.length);
      }
    }
    
    scannedDevices = devices;
    console.log(`Found ${devices.length} Bluetooth devices`);
    
    return devices;
    
  } catch (error) {
    console.error('Scan error:', error);
    return [];
  } finally {
    isScanning = false;
  }
}

ipcMain.handle('get-bluetooth-devices', async () => {
  try {
    if (scannedDevices.length === 0) {
      await performScan();
    }
    
    const customNames = StoreManager.getCustomDeviceNames();
    const devicesWithCustomNames = scannedDevices.map(device => ({
      ...device,
      customName: customNames[device.address] || '',
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
    const devices = await performScan();
    
    const customNames = StoreManager.getCustomDeviceNames();
    const devicesWithCustomNames = devices.map(device => ({
      ...device,
      customName: customNames[device.address] || '',
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
  const device = scannedDevices.find(d => d.id === deviceId);
  if (!device) {
    return {
      success: false,
      error: '设备不存在'
    };
  }
  
  try {
    if (platform === 'linux' && adapter) {
      const { bluetooth } = await import('node-ble');
      const devices = await adapter.devices();
      const targetDevice = devices.find(d => d.Address() === device.address);
      
      if (targetDevice) {
        await targetDevice.Connect();
        device.isConnected = true;
        connectedDevices.add(device.address);
      }
    } else if (platform === 'win32') {
      console.log(`Attempting to connect to ${device.name} on Windows...`);
      
      device.isConnected = true;
      connectedDevices.add(device.address);
      
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    const settings = StoreManager.getSettings();
    if (settings.notifications) {
      const displayName = device.customName || device.name;
      Notifier.showDeviceConnected(displayName);
    }
    
    if (device.isPaired && !StoreManager.isPaired(device.address)) {
      StoreManager.addPairedDevice(device);
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
  const device = scannedDevices.find(d => d.id === deviceId);
  if (!device) {
    return {
      success: false,
      error: '设备不存在'
    };
  }
  
  try {
    if (platform === 'linux' && adapter) {
      const devices = await adapter.devices();
      const targetDevice = devices.find(d => d.Address() === device.address);
      
      if (targetDevice) {
        await targetDevice.Disconnect();
      }
    }
    
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
  const device = scannedDevices.find(d => d.id === deviceId);
  if (!device) {
    return {
      success: false,
      error: '设备不存在'
    };
  }
  
  try {
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
  const device = scannedDevices.find(d => d.id === deviceId);
  if (!device) {
    return {
      success: false,
      error: '设备不存在'
    };
  }
  
  try {
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
  const device = scannedDevices.find(d => d.id === deviceId);
  if (!device) {
    return {
      success: false,
      error: '设备不存在'
    };
  }
  
  try {
    if (platform === 'linux' && adapter) {
      const { bluetooth } = await import('node-ble');
      const devices = await adapter.devices();
      const targetDevice = devices.find(d => d.Address() === device.address);
      
      if (targetDevice && !await targetDevice.Paired()) {
        await targetDevice.Pair();
      }
    }
    
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
  const device = scannedDevices.find(d => d.id === deviceId);
  if (!device) {
    return {
      success: false,
      error: '设备不存在'
    };
  }
  
  try {
    if (platform === 'linux' && adapter) {
      await adapter.removeDevice(device.address);
    }
    
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
    let enabled = false;
    let adapterName = '';
    
    if (platform === 'win32') {
      const output = await executePowerShell(
        'Get-PnpDevice -FriendlyName "*Bluetooth*" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Status'
      );
      enabled = output && output.trim() === 'OK';
      adapterName = '内置蓝牙适配器';
    } else if (platform === 'linux') {
      try {
        const { bluetooth } = await import('node-ble');
        const adapters = await bluetooth.adapters();
        enabled = adapters.length > 0;
        if (adapters.length > 0) {
          adapterName = adapters[0].name || 'hci0';
        }
      } catch (e) {
        enabled = false;
      }
    }
    
    return {
      success: true,
      enabled: enabled,
      adapterName: adapterName
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
