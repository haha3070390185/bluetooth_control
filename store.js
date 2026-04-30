const Store = require('electron-store');

const store = new Store({
  defaults: {
    customDeviceNames: {},
    settings: {
      autoScanOnLaunch: true,
      notifications: true,
      rememberPairedDevices: true
    },
    pairedDevices: []
  }
});

class StoreManager {
  static getCustomDeviceNames() {
    return store.get('customDeviceNames') || {};
  }

  static getCustomDeviceName(address) {
    const names = this.getCustomDeviceNames();
    return names[address] || '';
  }

  static setCustomDeviceName(address, name) {
    const names = this.getCustomDeviceNames();
    if (name && name.trim()) {
      names[address] = name.trim();
    } else {
      delete names[address];
    }
    store.set('customDeviceNames', names);
    return true;
  }

  static getSettings() {
    return store.get('settings') || {};
  }

  static getSetting(key) {
    const settings = this.getSettings();
    return settings[key];
  }

  static setSetting(key, value) {
    const settings = this.getSettings();
    settings[key] = value;
    store.set('settings', settings);
    return true;
  }

  static getPairedDevices() {
    return store.get('pairedDevices') || [];
  }

  static addPairedDevice(device) {
    const paired = this.getPairedDevices();
    const existing = paired.find(d => d.address === device.address);
    if (!existing) {
      paired.push({
        id: device.id,
        name: device.name,
        address: device.address,
        type: device.type,
        pairedAt: Date.now()
      });
      store.set('pairedDevices', paired);
    }
    return true;
  }

  static removePairedDevice(address) {
    const paired = this.getPairedDevices();
    const filtered = paired.filter(d => d.address !== address);
    store.set('pairedDevices', filtered);
    return true;
  }

  static isPaired(address) {
    const paired = this.getPairedDevices();
    return paired.some(d => d.address === address);
  }

  static clearAll() {
    store.clear();
    return true;
  }
}

module.exports = StoreManager;
