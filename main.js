const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: false,
    backgroundColor: '#e0e5ec',
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('close-window', () => {
  mainWindow.close();
});

ipcMain.handle('get-bluetooth-devices', async () => {
  const mockDevices = [
    { id: '1', name: 'AirPods Pro', address: '00:11:22:33:44:55', type: 'headphones', rssi: -45, isConnected: true, isPaired: true, customName: '我的 AirPods' },
    { id: '2', name: '小米手环 8', address: '00:11:22:33:44:56', type: 'wearable', rssi: -58, isConnected: false, isPaired: true, customName: '' },
    { id: '3', name: 'JBL 音箱', address: '00:11:22:33:44:57', type: 'speaker', rssi: -62, isConnected: false, isPaired: false, customName: '' },
    { id: '4', name: '机械键盘', address: '00:11:22:33:44:58', type: 'keyboard', rssi: -70, isConnected: true, isPaired: true, customName: '工作键盘' },
    { id: '5', name: '鼠标 M590', address: '00:11:22:33:44:59', type: 'mouse', rssi: -75, isConnected: false, isPaired: true, customName: '' },
    { id: '6', name: '未知设备', address: '00:11:22:33:44:60', type: 'unknown', rssi: -88, isConnected: false, isPaired: false, customName: '' }
  ];
  return mockDevices;
});

ipcMain.handle('connect-bluetooth', async (event, deviceId) => {
  await new Promise(resolve => setTimeout(resolve, 2000));
  return { success: true, deviceId };
});

ipcMain.handle('disconnect-bluetooth', async (event, deviceId) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { success: true, deviceId };
});

ipcMain.handle('rename-bluetooth', async (event, deviceId, newName) => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return { success: true, deviceId, newName };
});
