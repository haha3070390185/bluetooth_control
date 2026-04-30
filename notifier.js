const { Notification } = require('electron');
const path = require('path');

class Notifier {
  static isSupported() {
    return Notification.isSupported();
  }

  static showNotification(title, body, options = {}) {
    if (!this.isSupported()) {
      console.log('Notification not supported on this system');
      return null;
    }

    const notification = new Notification({
      title: title || '蓝牙设备管理器',
      body: body || '',
      icon: options.icon || path.join(__dirname, 'assets', 'icon.png'),
      silent: options.silent || false,
      urgency: options.urgency || 'normal',
      ...options
    });

    if (options.onClick) {
      notification.on('click', options.onClick);
    }

    if (options.onClose) {
      notification.on('close', options.onClose);
    }

    notification.show();
    return notification;
  }

  static showDeviceConnected(deviceName) {
    return this.showNotification(
      '设备已连接',
      `成功连接到 ${deviceName}`,
      { urgency: 'low' }
    );
  }

  static showDeviceDisconnected(deviceName) {
    return this.showNotification(
      '设备已断开',
      `已断开与 ${deviceName} 的连接`,
      { urgency: 'low' }
    );
  }

  static showScanComplete(deviceCount) {
    return this.showNotification(
      '扫描完成',
      `发现 ${deviceCount} 个设备`,
      { urgency: 'low' }
    );
  }

  static showError(title, message) {
    return this.showNotification(
      title || '操作失败',
      message || '发生未知错误',
      { urgency: 'critical' }
    );
  }

  static showDeviceRenamed(oldName, newName) {
    return this.showNotification(
      '设备已重命名',
      `${oldName} 已改名为 ${newName}`,
      { urgency: 'low' }
    );
  }

  static showBluetoothDisabled() {
    return this.showNotification(
      '蓝牙未开启',
      '请检查蓝牙适配器是否已启用',
      { urgency: 'critical' }
    );
  }

  static showPairingComplete(deviceName) {
    return this.showNotification(
      '配对成功',
      `已成功配对 ${deviceName}`,
      { urgency: 'normal' }
    );
  }
}

module.exports = Notifier;
