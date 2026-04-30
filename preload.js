const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  getBluetoothDevices: () => ipcRenderer.invoke('get-bluetooth-devices'),
  startScan: () => ipcRenderer.invoke('start-scan'),
  connectBluetooth: (deviceId) => ipcRenderer.invoke('connect-bluetooth', deviceId),
  disconnectBluetooth: (deviceId) => ipcRenderer.invoke('disconnect-bluetooth', deviceId),
  renameBluetooth: (deviceId, newName) => ipcRenderer.invoke('rename-bluetooth', deviceId, newName),
  getDeviceDetails: (deviceId) => ipcRenderer.invoke('get-device-details', deviceId),
  pairDevice: (deviceId) => ipcRenderer.invoke('pair-device', deviceId),
  unpairDevice: (deviceId) => ipcRenderer.invoke('unpair-device', deviceId),
  
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  
  checkBluetoothEnabled: () => ipcRenderer.invoke('check-bluetooth-enabled')
});
