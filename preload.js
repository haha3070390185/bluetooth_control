const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  getBluetoothDevices: () => ipcRenderer.invoke('get-bluetooth-devices'),
  connectBluetooth: (deviceId) => ipcRenderer.invoke('connect-bluetooth', deviceId),
  disconnectBluetooth: (deviceId) => ipcRenderer.invoke('disconnect-bluetooth', deviceId),
  renameBluetooth: (deviceId, newName) => ipcRenderer.invoke('rename-bluetooth', deviceId, newName)
});
